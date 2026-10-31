import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const SOURCE = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
export const PAGE_SIZE = 50;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const urlPath = value => value.split('/').map(encodeURIComponent).join('/');
const perMillion = value => typeof value === 'number' && Number.isFinite(value) ? value * 1e6 : null;

export function normalize(id, raw) {
  if (!id || id.split('/').some(x => !x || x === '.' || x === '..') || !raw || Array.isArray(raw) || typeof raw !== 'object') {
    throw new Error('Invalid catalog entry');
  }
  const provider = typeof raw.litellm_provider === 'string' ? raw.litellm_provider : null;
  return {
    id, name: provider && id.startsWith(provider + '/') ? id.slice(provider.length + 1) : id,
    provider, mode: raw.mode ?? null,
    context: { max_input_tokens: raw.max_input_tokens ?? null, max_output_tokens: raw.max_output_tokens ?? null },
    pricing: {
      currency: 'USD',
      input_usd_per_million_tokens: perMillion(raw.input_cost_per_token),
      output_usd_per_million_tokens: perMillion(raw.output_cost_per_token),
      source_rates: Object.fromEntries(Object.entries(raw).filter(([key]) => key.includes('cost'))),
    },
    capabilities: Object.fromEntries(Object.entries(raw).filter(([key, value]) => key.startsWith('supports_') && (typeof value === 'boolean' || value === null))),
  };
}

export async function build(body, out, generatedAt = new Date().toISOString()) {
  const raw = JSON.parse(body);
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') throw new Error('Invalid catalog');
  const models = Object.entries(raw).filter(([id]) => id !== 'sample_spec')
    .map(([id, entry]) => normalize(id, entry)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (!models.length) throw new Error('Empty catalog');
  const snapshot = hash(body);
  const prefix = `v1/snapshots/${snapshot}`;
  const meta = { snapshot, generated_at: generatedAt };
  await rm(out, { recursive: true, force: true });
  await mkdir(path.join(out, 'static/objects'), { recursive: true });
  const overrides = {};
  const paths = new Set();
  async function emit(route, data) {
    if (route.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid API route');
    if (paths.has(route)) throw new Error('Duplicate API route');
    paths.add(route);
    const file = `objects/${hash(route)}.json`;
    overrides[file] = { path: route, contentType: 'application/json; charset=utf-8' };
    await writeFile(path.join(out, 'static', file), JSON.stringify(data));
  }
  const providers = new Map(), names = new Map();
  for (const model of models) {
    await emit(`${prefix}/models/${urlPath(model.id)}`, { data: model, meta });
    if (model.provider) providers.set(model.provider, [...(providers.get(model.provider) ?? []), model]);
    names.set(model.name, [...(names.get(model.name) ?? []), model]);
  }
  for (const [kind, groups] of [['providers', providers], ['names', names]]) {
    for (const [name, entries] of groups) {
      const base = `${prefix}/${kind}/${urlPath(name)}/models`;
      for (let offset = 0; offset < entries.length; offset += PAGE_SIZE) {
        const page = offset / PAGE_SIZE + 1;
        const route = page === 1 ? base : `${base}/pages/${page}`;
        await emit(route, { data: entries.slice(offset, offset + PAGE_SIZE), meta: { ...meta, page, page_size: PAGE_SIZE, total: entries.length },
          links: { next: offset + PAGE_SIZE < entries.length ? `/${base}/pages/${page + 1}` : null } });
      }
    }
  }
  await emit(`${prefix}/providers`, { data: [...providers.keys()].sort(), meta });
  await emit('v1/snapshot', { data: { model_count: models.length, provider_count: providers.size, source: SOURCE }, meta });
  await writeFile(path.join(out, 'static/not-found.json'), JSON.stringify({ error: { code: 'not_found', message: 'Unknown model, provider, name, page, or expired snapshot. See / for supported paths.' } }));
  await writeFile(path.join(out, 'static/method-not-allowed.json'), JSON.stringify({ error: { code: 'method_not_allowed', message: 'Use GET or HEAD.' } }));
  await copyFile(path.join(HERE, 'guide.html'), path.join(out, 'static/guide.html'));
  const fn = path.join(out, 'functions/api/usage-drain.func');
  await mkdir(fn, { recursive: true });
  await copyFile(path.join(HERE, 'usage-drain.mjs'), path.join(fn, 'index.mjs'));
  await writeFile(path.join(fn, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 15 }));
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=0, must-revalidate' };
  const routes = [
    { src: '^/v1(?:/.*)?$', methods: ['OPTIONS'], status: 204, headers },
    { src: '^/v1(?:/.*)?$', methods: ['POST', 'PUT', 'PATCH', 'DELETE'], dest: '/method-not-allowed.json', status: 405, headers: { ...headers, Allow: 'GET, HEAD, OPTIONS' } },
    { src: '^/v1(?:/.*)?$', headers, continue: true },
    { src: '^/$', dest: '/guide.html' },
    { src: '^/v1/(models|providers|names)(/.*)?$', dest: `/${prefix}/$1$2` },
    { handle: 'filesystem' },
    { src: '^/.*$', dest: '/not-found.json', status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } },
  ];
  await writeFile(path.join(out, 'config.json'), JSON.stringify({ version: 3, routes, overrides }));
  return { models: models.length, providers: providers.size, responses: paths.size, snapshot };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let body;
  if (process.env.COST_MAP_FILE) body = await readFile(process.env.COST_MAP_FILE, 'utf8');
  else {
    const response = await fetch(SOURCE, { signal: AbortSignal.timeout(30000), redirect: 'error' });
    if (!response.ok) throw new Error(`Catalog fetch failed: ${response.status}`);
    body = await response.text();
  }
  console.log(JSON.stringify(await build(body, path.join(HERE, '.vercel/output'))));
}
