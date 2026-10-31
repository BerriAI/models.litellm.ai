import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { build, normalize } from '../build.mjs';
import { eventsFromLogs, createHandler } from '../usage-drain.mjs';

test('build creates bounded static lookups, consistent snapshot links, and no catalog function', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'catalog-output-'));
  try {
    const data = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`alpha/model-${String(i).padStart(2, '0')}`, { litellm_provider: 'alpha', input_cost_per_token: 0, supports_vision: true }]));
    data['beta/model-00'] = { litellm_provider: 'beta', input_cost_per_token: 0.0000025 };
    data.sample_spec = {};
    const result = await build(JSON.stringify(data), out, '2026-01-01T00:00:00Z');
    assert.equal(result.models, 52);
    const config = JSON.parse(await readFile(path.join(out, 'config.json')));
    const get = async route => {
      const file = Object.entries(config.overrides).find(([, value]) => value.path === route)?.[0];
      assert.ok(file, `Route missing: ${route}`);
      return JSON.parse(await readFile(path.join(out, 'static', file)));
    };
    const root = `v1/snapshots/${result.snapshot}`;
    const first = await get(`${root}/providers/alpha/models`);
    assert.equal(first.data.length, 50);
    assert.equal(first.meta.total, 51);
    const second = await get(first.links.next.slice(1));
    assert.equal(second.data.length, 1);
    assert.equal(second.links.next, null);
    assert.equal(second.meta.snapshot, first.meta.snapshot);
    const named = await get(`${root}/names/model-00/models`);
    assert.equal(named.data.length, 2);
    assert.equal(named.data[0].pricing.input_usd_per_million_tokens, 0);
    assert.equal(named.data[1].pricing.input_usd_per_million_tokens, 2.5);
    assert.equal(named.data[0].pricing.output_usd_per_million_tokens, null);
    assert.equal((await get(`${root}/models/alpha/model-00`)).data.id, 'alpha/model-00');
    assert.deepEqual(await readdir(path.join(out, 'functions/api')), ['usage-drain.func']);
    assert.ok(!Object.values(config.overrides).some(x => x.path.includes('sample_spec') || x.path.endsWith('model_prices_and_context_window.json')));
    assert.ok(config.routes.some(r => r.status === 404));
    assert.ok(config.routes.some(r => r.status === 405));
    assert.ok(config.routes.some(r => r.methods?.includes('OPTIONS') && r.status === 204));
  } finally { await rm(out, { recursive: true, force: true }); }
});

test('invalid catalogs fail the build and special model IDs remain identifiable', async () => {
  assert.throws(() => normalize('../escape', {}));
  assert.throws(() => normalize('model', []));
  assert.equal(normalize('vendor/a:b@v1', { litellm_provider: 'vendor' }).name, 'a:b@v1');
  const out = await mkdtemp(path.join(tmpdir(), 'catalog-invalid-'));
  try { await assert.rejects(build('{}', out)); await assert.rejects(build('[]', out)); }
  finally { await rm(out, { recursive: true, force: true }); }
});

const log = { id: 'fake-request-id', projectId: 'fake-project', source: 'static', environment: 'production', timestamp: 1793400000000,
  proxy: { path: '/v1/models/example?email=private@example.com', method: 'GET', statusCode: 200, vercelCache: 'HIT', clientIp: '192.0.2.1', userAgent: ['private-agent'] } };
const env = { VERCEL_DRAIN_SECRET: 'fake-test-secret', MIXPANEL_TOKEN: 'fake-mixpanel-token', CATALOG_VERCEL_PROJECT_ID: 'fake-project' };

test('analytics includes CDN hits, deduplicates, filters projects, and drops personal data', () => {
  const events = eventsFromLogs([log, log, { ...log, id: 'other', projectId: 'other-project' }, { ...log, id: 'preview', environment: 'preview' }, { ...log, id: 'loop', source: 'lambda' }], env.CATALOG_VERCEL_PROJECT_ID, env.MIXPANEL_TOKEN);
  assert.equal(events.length, 1);
  assert.equal(events[0].properties.cache_status, 'HIT');
  assert.equal(events[0].properties.request_count, 1);
  assert.deepEqual(events, eventsFromLogs([log], env.CATALOG_VERCEL_PROJECT_ID, env.MIXPANEL_TOKEN));
  const serialized = JSON.stringify(events);
  for (const privateValue of ['private@example.com', '192.0.2.1', 'private-agent', 'fake-request-id', '/v1/models/example']) assert.ok(!serialized.includes(privateValue));
});

async function deliver(handler, logs, signature) {
  const body = Buffer.from(JSON.stringify(logs));
  const req = Readable.from([body]);
  req.method = 'POST';
  req.headers = { 'x-vercel-signature': signature ?? createHmac('sha1', env.VERCEL_DRAIN_SECRET).update(body).digest('hex') };
  const result = {};
  const res = { writeHead(status, headers) { result.status = status; result.headers = headers; }, end(value) { result.body = JSON.parse(value); } };
  await handler(req, res);
  return result;
}

test('signed drain delivery batches Mixpanel calls and rejects tampering', async () => {
  const calls = [];
  const handler = createHandler({ env, send: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ status: 1 }) }; } });
  const logs = Array.from({ length: 51 }, (_, i) => ({ ...log, id: `fake-request-${i}` }));
  assert.equal((await deliver(handler, logs)).status, 200);
  assert.deepEqual(calls.map(c => JSON.parse(c.options.body).length), [50, 1]);
  assert.ok(calls.every(c => c.url.endsWith('/track?ip=0&verbose=1')));
  assert.equal((await deliver(handler, logs, '0'.repeat(40))).status, 403);
  assert.equal(calls.length, 2);
});

test('analytics failures ask Vercel to retry; missing config never claims delivery', async () => {
  const failed = createHandler({ env, send: async () => ({ ok: false }) });
  assert.equal((await deliver(failed, [log])).status, 502);
  assert.equal((await deliver(createHandler({ env: {} }), [log])).status, 503);
});
