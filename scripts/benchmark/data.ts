import { createHash } from "node:crypto";
export type Obj = Record<string, any>;
export interface Model {
  id: string;
  label?: string;
  mode?: string;
  input?: number;
  output?: number;
  context?: number;
  tools?: boolean;
  structured?: boolean;
}
export interface Traffic {
  id: string;
  session: string;
  model: string;
  spend: number | null;
  tokens: number;
  bucket: string;
  raw: Obj;
}
export interface Example extends Traffic {
  body: Obj;
  response: Obj;
  workload: string;
  agent: boolean;
  seconds: number | null;
}
export const object = (value: unknown): Obj => {
  if (typeof value === "string") {
    try {
      return object(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Obj)
    : {};
};
export const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
export function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}
export function traffic(rows: Obj[]): Traffic[] {
  const seen = new Set<string>();
  return rows.flatMap((raw) => {
    const id = raw.request_id;
    const metadata = object(raw.metadata);
    const tags = Array.isArray(raw.request_tags) ? raw.request_tags : [];
    if (
      typeof id !== "string" ||
      seen.has(id) ||
      metadata.models_benchmark ||
      tags.includes("models-litellm-benchmark")
    )
      return [];
    seen.add(id);
    const model = String(raw.model_group || raw.model || "unknown");
    const tokens = number(raw.prompt_tokens) ?? 0;
    // Scope session IDs by their owner; different keys can reuse a session name.
    const session = hash([
      raw.api_key || raw.team_id || "",
      raw.session_id || id,
    ]);
    return [
      {
        id,
        session,
        model,
        spend: number(raw.spend) ?? null,
        tokens,
        bucket: hash([
          model,
          raw.team_id || "",
          tokens < 4000 ? "short" : tokens < 32000 ? "medium" : "long",
        ]),
        raw,
      },
    ];
  });
}
export function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Stratify sessions, never individual turns. The random ordering is reproducible. */
export function sampleSessions(rows: Traffic[], count: number, seed: number) {
  const sessions = new Map<string, Traffic[]>();
  for (const row of rows)
    sessions.set(row.session, [...(sessions.get(row.session) || []), row]);
  const groups = new Map<string, string[]>();
  for (const [id, items] of sessions) {
    const bucket = items.reduce((a, b) => (a.tokens > b.tokens ? a : b)).bucket;
    groups.set(bucket, [...(groups.get(bucket) || []), id]);
  }
  const rng = random(seed);
  const shuffled = [...groups].map(([bucket, ids]) => ({
    bucket,
    ids: ids
      .map((id) => ({ id, r: rng() }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.id),
  }));
  const chosen = new Set<string>();
  const weights = new Map<string, number>();
  // Proportional allocation, with one per stratum when the sample permits it.
  const allocation = shuffled.map((g) => ({
    ...g,
    n: 0,
    target: (Math.min(count, sessions.size) * g.ids.length) / sessions.size,
  }));
  while (chosen.size < Math.min(count, sessions.size)) {
    const available = allocation.filter((g) => g.n < g.ids.length);
    available.sort((a, b) => b.target - b.n - (a.target - a.n));
    const g = available[0];
    chosen.add(g.ids[g.n++]);
  }
  for (const g of allocation)
    for (const id of g.ids.slice(0, g.n)) weights.set(id, g.ids.length / g.n);
  return {
    rows: rows.filter((r) => chosen.has(r.session)),
    weights,
    sessions: chosen.size,
  };
}
const ALLOWED = [
  "messages",
  "tools",
  "tool_choice",
  "response_format",
  "temperature",
  "top_p",
  "seed",
  "stop",
  "frequency_penalty",
  "presence_penalty",
  "parallel_tool_calls",
  "reasoning_effort",
  "max_tokens",
  "max_completion_tokens",
];
export function reconstruct(
  row: Traffic,
  payload: unknown,
): { example?: Example; reason?: string } {
  const p = object(payload);
  const request = object(p.proxy_server_request);
  const body = object(request.body ?? p.request);
  if (!Array.isArray(body.messages) || body.messages.length === 0)
    return { reason: "Missing request body" };
  if (
    JSON.stringify(body).match(
      /LITELLM_TRUNCATED|litellm_truncated|\[REDACTED\]|\[TRUNCATED\]/i,
    )
  )
    return { reason: "Truncated or redacted request" };
  if (
    row.raw.call_type &&
    !["completion", "acompletion"].includes(row.raw.call_type)
  )
    return { reason: "Unsupported endpoint" };
  if (
    body.messages.some(
      (m: Obj) =>
        !m ||
        !["system", "developer", "user", "assistant", "tool"].includes(
          m.role,
        ) ||
        !(
          typeof m.content === "string" ||
          (m.role === "assistant" &&
            m.content == null &&
            Array.isArray(m.tool_calls))
        ),
    )
  )
    return { reason: "Multimodal or unsupported messages" };
  if (
    body.tools &&
    (!Array.isArray(body.tools) ||
      body.tools.some(
        (tool: Obj) => tool?.type !== "function" || !tool.function,
      ))
  )
    return { reason: "Unsupported tool type" };
  if (body.n && body.n !== 1) return { reason: "Multiple completions" };
  // Unknown generation parameters can materially change behavior; never silently drop them.
  const transport = new Set([
    "model",
    "stream",
    "stream_options",
    "metadata",
    "user",
    "api_key",
    "api_base",
    "base_url",
    "extra_headers",
    "timeout",
    "num_retries",
    "caching",
    "cache",
    "litellm_session_id",
  ]);
  if (Object.keys(body).some((k) => !ALLOWED.includes(k) && !transport.has(k)))
    return { reason: "Unsupported request settings" };
  const clean = Object.fromEntries(
    ALLOWED.filter((k) => k in body).map((k) => [k, body[k]]),
  );
  const response = object(p.response);
  if (!Array.isArray(response.choices) || !response.choices[0]?.message)
    return { reason: "Missing original response" };
  if (
    /LITELLM_TRUNCATED|litellm_truncated|\[REDACTED\]|\[TRUNCATED\]/i.test(
      JSON.stringify(response),
    )
  )
    return { reason: "Truncated or redacted response" };
  const instructions = body.messages.filter((m: Obj) =>
    ["system", "developer"].includes(m.role),
  );
  const agent = Boolean(
    body.tools?.length ||
      body.messages.some((m: Obj) => m.role === "tool" || m.tool_calls?.length),
  );
  const workload = hash([
    row.model,
    instructions,
    body.tools || [],
    body.response_format || {},
  ]);
  const start = Date.parse(row.raw.startTime),
    end = Date.parse(row.raw.endTime);
  return {
    example: {
      ...row,
      body: clean,
      response,
      workload,
      agent,
      seconds:
        Number.isFinite(end - start) && end >= start
          ? (end - start) / 1000
          : null,
    },
  };
}
export function compatible(model: Model, example: Example): boolean {
  return (
    !(model.tools === false && example.agent) &&
    !(
      model.structured === false &&
      example.body.response_format?.type === "json_schema"
    ) &&
    !(model.context && example.tokens > model.context)
  );
}
