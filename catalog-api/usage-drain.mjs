import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const HOSTS = new Set(['https://api.mixpanel.com', 'https://api-eu.mixpanel.com', 'https://api-in.mixpanel.com']);
const sha = value => createHash('sha256').update(value).digest('hex');

export function eventsFromLogs(logs, projectId, token) {
  const seen = new Set(), events = [];
  for (const log of logs) {
    if (!log || log.projectId !== projectId || log.environment !== 'production' || log.source !== 'static') continue;
    const proxy = log.proxy ?? {};
    const pathname = String(proxy.path ?? log.path ?? '').split('?')[0];
    const match = /^\/v1\/(?:snapshots\/[a-f0-9]{64}\/)?(models|providers|names|snapshot)(?:\/|$)/.exec(pathname);
    const method = proxy.method;
    const id = log.requestId || log.id;
    const timestamp = proxy.timestamp ?? log.timestamp;
    const status = proxy.statusCode ?? log.statusCode;
    if (!match || !['GET', 'HEAD'].includes(method) || typeof id !== 'string' || !Number.isFinite(timestamp) || !Number.isInteger(status)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    events.push({ event: 'model_catalog_api_request', properties: {
      token, distinct_id: 'public-model-catalog-api', $insert_id: sha(id), time: Math.floor(timestamp / 1000),
      endpoint: match[1], method, status, cache_status: ['HIT', 'MISS', 'STALE', 'BYPASS', 'REVALIDATED', 'PRERENDER'].includes(proxy.vercelCache) ? proxy.vercelCache : 'unknown',
      request_count: 1,
    } });
  }
  return events;
}

export function createHandler({ env = process.env, send = fetch } = {}) {
  return async function handler(req, res) {
    // Legacy drain endpoint ownership verification, if requested by the dashboard.
    if (env.VERCEL_DRAIN_VERIFY) res.setHeader('x-vercel-verify', env.VERCEL_DRAIN_VERIFY);
    if (req.method === 'GET' && env.VERCEL_DRAIN_VERIFY) { res.writeHead(200, { 'Cache-Control': 'no-store' }); return res.end(); }
    const reply = (status, code) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ status: code })); };
    if (req.method !== 'POST') return reply(405, 'method_not_allowed');
    const secret = env.VERCEL_DRAIN_SECRET, token = env.MIXPANEL_TOKEN, projectId = env.VERCEL_PROJECT_ID || env.CATALOG_VERCEL_PROJECT_ID;
    const host = env.MIXPANEL_API_HOST || 'https://api.mixpanel.com';
    if (!secret || !token || !projectId || !HOSTS.has(host)) return reply(503, 'not_configured');
    try {
      const parts = []; let size = 0;
      for await (const part of req) {
        size += part.length;
        if (size > 4_000_000) return reply(413, 'payload_too_large');
        parts.push(part);
      }
      const body = Buffer.concat(parts);
      const signature = req.headers['x-vercel-signature'];
      if (typeof signature !== 'string' || !/^[a-f0-9]{40}$/.test(signature)) return reply(403, 'invalid_signature');
      const expected = createHmac('sha1', secret).update(body).digest();
      if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return reply(403, 'invalid_signature');
      let logs;
      try { logs = JSON.parse(body.toString('utf8')); } catch { return reply(400, 'invalid_json'); }
      if (!Array.isArray(logs)) return reply(400, 'expected_array');
      const events = eventsFromLogs(logs, projectId, token);
      // Await only in the off-path drain receiver so a failed delivery can be retried.
      for (let i = 0; i < events.length; i += 50) {
        const response = await send(`${host}/track?ip=0&verbose=1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(events.slice(i, i + 50)), signal: AbortSignal.timeout(8000), redirect: 'error' });
        if (!response.ok || (await response.json()).status !== 1) return reply(502, 'analytics_unavailable');
      }
      return reply(200, 'accepted');
    } catch { return reply(502, 'delivery_failed'); }
  };
}

export default createHandler();
