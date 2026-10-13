/**
 * Groups LiteLLM cost-map keys into one canonical model per page.
 *
 * `gemini/gemini-nano-banana-2.1`, `vertex_ai/gemini-nano-banana-2.1` and
 * `openrouter/google/gemini-nano-banana-2.1` all describe one model, so they
 * share a page. Each key is peeled of provider namespaces, regions, Bedrock
 * vendor prefixes and version suffixes, then dated snapshots collapse onto the
 * undated model. `overrides.json` fixes the cases the heuristic gets wrong.
 */

export type CostRow = Record<string, unknown> & {
  litellm_provider?: string;
  mode?: string;
};
export type CostMap = Record<string, CostRow>;

export type MemberFlags = {
  region?: string;
  geoProfile?: string;
  commitment?: string;
  imageSize?: string;
  steps?: string;
  quality?: string;
  fineTune?: boolean;
  tag?: string;
  quant?: string;
  snapshot?: string;
  latestAlias?: boolean;
  routerAlias?: boolean;
};

export type Member = {
  key: string;
  provider: string;
  mode: string;
  /** Normalised id before snapshot stripping, e.g. `gpt-4o-2024-08-06`. */
  matchKey: string;
  /** The model id as written by the provider, minus snapshot, e.g. `gemini-nano-banana-2.1`. */
  displayId: string;
  vendor: string | null;
  flags: MemberFlags;
  row: CostRow;
};

export type Group = {
  pageKey: string;
  members: Member[];
};

export type Overrides = {
  /** Cost-map key -> page key, for single keys the heuristic misplaces. */
  keyToPage?: Record<string, string>;
  /** Page key -> page key, to merge two groups that are the same model. */
  mergePages?: Record<string, string>;
  /** Page keys that never get a page. */
  excludePages?: string[];
  /** Page key -> display name. */
  displayNames?: Record<string, string>;
  /** Page key -> other names people search for. */
  alsoKnownAs?: Record<string, string[]>;
  /** Page key -> URL slug, to pin a slug. */
  slugs?: Record<string, string>;
  /**
   * Page key -> an introductory price window: the lab's pricing page (`source`) says the
   * current price ends after `until` (YYYY-MM-DD). The price itself still comes from the price file.
   */
  introPricing?: Record<string, IntroPricing>;
};

export type IntroPricing = { until: string; source: string };

const NON_MODEL_KEYS = new Set(["sample_spec", "fallback_generalizations"]);
const SIZE_BUCKET = /^(fireworks-ai|together-ai)-/;
/** Tools priced in the cost map that are not models. */
const TOOL_MODES = new Set(["search", "guardrail", "vector_store", "evaluation"]);

const AZURE_REGION = new Set(["us", "eu", "global", "apac", "us-gov", "global-standard"]);
const AWS_REGION = /^[a-z]{2}(-gov)?-[a-z]+-\d$/;
const COMMITMENT = /^\d+-month-commitment$/;
const IMG_SIZE = /^(\d+|max)-x-(\d+|max)$/;
const STEPS = /^(\d+|max)-steps$/;
const QUALITY = new Set(["low", "medium", "high", "standard", "hd", "xhigh", "max"]);
const IMAGE_MODES = new Set(["image_generation", "image_edit", "video_generation"]);
const FAL_OPS = new Set([
  "text-to-image",
  "image-to-image",
  "text-to-video",
  "image-to-video",
  "edit",
  "video-to-video",
  "reference-to-video",
  "image-to-3d",
  "upscale",
  "inpaint",
]);
const EXTRA_NAMESPACES = new Set([
  "vertex_ai",
  "amazon-nova",
  "fal-ai",
  "@cf",
  "@hf",
  "accounts",
  "fireworks",
  "models",
  "routers",
  "invoke",
  "*",
]);

const GEO_PREFIX = /^(us|eu|apac|global|jp|au|ca|us-gov|in)\./;
const BEDROCK_VENDOR =
  /^(anthropic|meta|amazon|mistral|cohere|ai21|stability|deepseek|qwen|openai|writer|twelvelabs|google|moonshot|moonshotai|minimax|nvidia|xai|zai|luma|kimi)\.(?=[a-z])/;
const DATE_ISO = /[-@]?20\d{2}-\d{2}-\d{2}$/;
const DATE_COMPACT = /[-@]?20\d{2}[01]\d[0-3]\d$/;
const MMDD = /-(0[1-9]|1[0-2])([0-2]\d|3[01])$/;
const MM_YYYY = /-(0[1-9]|1[0-2])-20\d{2}$/;
const MISTRAL_YYMM =
  /^(mistral|ministral|codestral|pixtral|magistral|devstral|voxtral|mixtral).*-(2[3-9])(0[1-9]|1[0-2])$/;
const QUANT = /-(fp8|fp16|bf16|int4|int8|awq|gguf|nvfp4)$/;
const NAME_VENDOR =
  /^(databricks|snowflake|anthropic|openai|alibaba|meta|mistralai|google|deepseek-ai|qwen|zai-org|moonshotai)-(?=(claude|gpt|o\d|qwen|llama|gemini|gemma|mistral|mixtral|codestral|deepseek|glm|kimi|bge|gte|dbrx|arctic))/;

/** LiteLLM providers that are the model's own lab, so their naming and prices lead. */
export const FIRST_PARTY_PROVIDERS = new Set([
  "openai",
  "text-completion-openai",
  "anthropic",
  "gemini",
  "vertex_ai-language-models",
  "mistral",
  "xai",
  "deepseek",
  "cohere",
  "cohere_chat",
  "moonshot",
  "dashscope",
  "zai",
  "minimax",
  "perplexity",
  "ai21",
  "amazon_nova",
  "voyage",
  "deepgram",
  "elevenlabs",
  "stability",
  "black_forest_labs",
  "runwayml",
  "recraft",
  "meta_llama",
  "xiaomi_mimo",
  "inception",
  "jina_ai",
]);

type Peeled = { segs: string[]; flags: MemberFlags };

function peel(key: string, providers: Set<string>, provider: string, mode: string | undefined): Peeled {
  const flags: MemberFlags = {};
  let segs = key.split("/");
  if (segs.some((s) => s.startsWith("~"))) {
    // openrouter/~anthropic/claude-opus-latest
    flags.routerAlias = true;
    segs = segs.map((s) => s.replace(/^~+/, ""));
  }
  const kept: string[] = [];
  segs.slice(0, -1).forEach((s, i) => {
    const sl = s.toLowerCase();
    if (providers.has(sl) || EXTRA_NAMESPACES.has(sl) || sl === provider) return;
    if (AZURE_REGION.has(sl) && i > 0) flags.region = sl;
    else if (AWS_REGION.test(sl)) flags.region = sl;
    else if (COMMITMENT.test(sl)) flags.commitment = sl;
    else if (IMG_SIZE.test(sl)) flags.imageSize = sl;
    else if (STEPS.test(sl)) flags.steps = sl;
    else if (QUALITY.has(sl) && (i === 0 || IMAGE_MODES.has(mode ?? "") || provider === "fal_ai")) flags.quality = sl;
    else kept.push(s);
  });
  kept.push(segs[segs.length - 1]);
  return { segs: kept, flags };
}

function pickModelId(segs: string[], provider: string): { id: string; vendor: string | null } {
  if (provider === "fal_ai" && segs.length > 1) {
    // fal ids are paths: flux-pro/v1.1, bytedance/seedream/v3/text-to-image
    let parts = segs.map((s) => s.toLowerCase());
    while (parts.length > 1 && FAL_OPS.has(parts[parts.length - 1])) parts.pop();
    let vendor: string | null = null;
    if (
      parts.length > 1 &&
      !/\d/.test(parts[0]) &&
      !["flux", "flux-pro", "kling-video", "veo"].includes(parts[0])
    ) {
      vendor = parts[0];
      parts = parts.slice(1);
    }
    return { id: parts.join("-"), vendor };
  }
  const vendor = segs.length > 1 ? segs[segs.length - 2].toLowerCase() : null;
  const tail = segs[segs.length - 1];
  if (/^v?\d+(\.\d+)*$/.test(tail) && segs.length > 1) {
    return { id: `${segs[segs.length - 2]}-${tail}`.toLowerCase(), vendor };
  }
  return { id: tail.toLowerCase(), vendor };
}

function cleanId(raw: string, provider: string, flags: MemberFlags): { id: string; vendor: string | null } {
  let mid = raw;
  let vendor: string | null = null;
  if (mid.startsWith("ft:")) {
    // ft:gpt-4o-mini-2024-07-18:org::id -> base model
    flags.fineTune = true;
    mid = mid.slice(3).split(":")[0];
  }
  const geo = GEO_PREFIX.exec(mid);
  if (geo) {
    flags.geoProfile = geo[1];
    mid = mid.slice(geo[0].length);
  }
  const v = BEDROCK_VENDOR.exec(mid);
  if (v) {
    vendor = v[1];
    mid = mid.slice(v[0].length);
    // deepseek.v3 -> deepseek-v3, deepseek.r1 -> deepseek-r1
    if (/^[vr]\d/.test(mid)) mid = `${vendor}-${mid}`;
  }
  mid = mid.replace(/@.*$/, ""); // vertex claude-x@20240620, @default
  const tag = /:([a-z]+)$/.exec(mid);
  if (tag) flags.tag = tag[1]; // openrouter :batch / :free / :thinking
  mid = mid.replace(/:\d+$/, ""); // bedrock :0
  mid = mid.replace(/:[a-z0-9.-]+$/, ""); // ollama tags, openrouter :batch
  if ((provider.startsWith("bedrock") || provider === "oci") && !mid.startsWith("titan")) {
    mid = mid.replace(/-v1$/, "");
  }
  mid = mid.replace(/-maas$/, "");
  const q = QUANT.exec(mid);
  if (q) {
    flags.quant = q[1];
    mid = mid.slice(0, q.index);
  }
  mid = mid.replace(/^meta-(?=llama)/, "");
  mid = mid.replace(NAME_VENDOR, "");
  return { id: mid, vendor };
}

export function matchKey(id: string): string {
  let k = id.toLowerCase().replace(/_/g, "-");
  k = k.replace(/(?<=\d)[.p](?=\d)/g, "-"); // 3.5 / 3p5 -> 3-5
  k = k.replace(/(?<=[a-z])(?=\d)/g, "-"); // llama3 -> llama-3
  return k.replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/** Collapse dated snapshots onto the undated model: -2024-08-06, -20240620, -0613, mistral -2407, -latest. */
export function stripSnapshot(input: string, flags: MemberFlags = {}): string {
  let k = input;
  for (const rx of [DATE_ISO, DATE_COMPACT]) {
    const m = rx.exec(k);
    if (m) {
      flags.snapshot = m[0].replace(/^[-@]/, "");
      k = k.slice(0, m.index);
    }
  }
  const monthYear = MM_YYYY.exec(k);
  if (monthYear) {
    // command-r-08-2024, gemini-...-preview-12-2025
    flags.snapshot = monthYear[0].replace(/^-/, "");
    k = k.slice(0, monthYear.index);
  }
  if (MISTRAL_YYMM.test(k)) {
    flags.snapshot = k.slice(-4);
    k = k.slice(0, -5);
  }
  const mmdd = MMDD.exec(k);
  if (mmdd && !k.endsWith("-1024")) {
    // 1024 is usually an image dimension, not Oct 24
    flags.snapshot = mmdd[0].replace(/^-/, "");
    k = k.slice(0, mmdd.index);
  }
  if (k.endsWith("-latest")) {
    flags.latestAlias = true;
    k = k.slice(0, -"-latest".length);
  }
  return k.replace(/^-+|-+$/g, "");
}

export type Normalized = {
  pageKey: string;
  matchKey: string;
  displayId: string;
  vendor: string | null;
  flags: MemberFlags;
};

export function normalizeKey(
  key: string,
  provider: string,
  providers: Set<string>,
  mode?: string,
): Normalized {
  const { segs, flags } = peel(key, providers, provider, mode);
  const picked = pickModelId(segs, provider);
  const cleaned = cleanId(picked.id, provider, flags);
  const displayId = stripSnapshot(cleaned.id.toLowerCase(), {});
  const mk = matchKey(cleaned.id);
  const pageKey = stripSnapshot(mk, flags);
  return { pageKey, matchKey: mk, displayId, vendor: picked.vendor ?? cleaned.vendor, flags };
}

export function providerNamespaces(costMap: CostMap): Set<string> {
  const providers = new Set<string>();
  for (const row of Object.values(costMap)) {
    const p = typeof row?.litellm_provider === "string" ? row.litellm_provider : "";
    if (!p) continue;
    providers.add(p);
    if (p.startsWith("vertex_ai-")) providers.add("vertex_ai");
  }
  return providers;
}

export function isModelRow(key: string, row: CostRow | undefined): boolean {
  if (!row || typeof row !== "object") return false;
  if (NON_MODEL_KEYS.has(key) || SIZE_BUCKET.test(key) || key.includes("*")) return false;
  const mode = typeof row.mode === "string" ? row.mode : "";
  return mode !== "" && !TOOL_MODES.has(mode);
}

export function groupCostMap(costMap: CostMap, overrides: Overrides = {}): Group[] {
  const providers = providerNamespaces(costMap);
  const byPage = new Map<string, Member[]>();
  const excluded = new Set(overrides.excludePages ?? []);
  for (const [key, row] of Object.entries(costMap)) {
    if (!isModelRow(key, row)) continue;
    const provider = String(row.litellm_provider ?? "");
    const mode = String(row.mode);
    const n = normalizeKey(key, provider, providers, mode);
    let pageKey = overrides.keyToPage?.[key] ?? n.pageKey;
    pageKey = overrides.mergePages?.[pageKey] ?? pageKey;
    if (!pageKey || excluded.has(pageKey)) continue;
    const member: Member = {
      key,
      provider,
      mode,
      matchKey: n.matchKey,
      displayId: n.displayId,
      vendor: n.vendor,
      flags: n.flags,
      row,
    };
    const list = byPage.get(pageKey);
    if (list) list.push(member);
    else byPage.set(pageKey, [member]);
  }
  return [...byPage.entries()]
    .map(([pageKey, members]) => ({
      pageKey,
      members: members.sort((a, b) => a.key.localeCompare(b.key)),
    }))
    .sort((a, b) => a.pageKey.localeCompare(b.pageKey));
}

const SLUG_SAFE = /[^a-z0-9._-]+/g;

export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(SLUG_SAFE, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

/**
 * The URL slug: the model id people paste, e.g. `gemini-nano-banana-2.1` or
 * `claude-opus-5-5`. First-party spellings win. Slugs already published (in
 * `previous`) are kept so URLs never change once indexed.
 */
export function assignSlugs(
  groups: Group[],
  overrides: Overrides = {},
  previous: Record<string, string> = {},
): Map<string, string> {
  const slugs = new Map<string, string>();
  const taken = new Set<string>();
  const claim = (pageKey: string, slug: string) => {
    slugs.set(pageKey, slug);
    taken.add(slug);
  };
  // Pinned and previously published slugs first, so they are never displaced.
  for (const g of groups) {
    const pinned = overrides.slugs?.[g.pageKey] ?? previous[g.pageKey];
    if (pinned && !taken.has(pinned)) claim(g.pageKey, pinned);
  }
  for (const g of groups) {
    if (slugs.has(g.pageKey)) continue;
    const votes = new Map<string, number>();
    for (const m of g.members) {
      const weight = FIRST_PARTY_PROVIDERS.has(m.provider) ? 3 : 1;
      votes.set(m.displayId, (votes.get(m.displayId) ?? 0) + weight);
    }
    const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const preferred = toSlug(ranked[0]?.[0] ?? g.pageKey);
    let slug = preferred && !taken.has(preferred) ? preferred : toSlug(g.pageKey);
    for (let n = 2; taken.has(slug); n++) slug = `${toSlug(g.pageKey)}-${n}`;
    claim(g.pageKey, slug);
  }
  return slugs;
}

export function catalogSlugs(groups: Group[], slugs: Map<string, string>): Record<string, string> {
  return Object.fromEntries(groups.flatMap((g) => g.members.map((m) => [m.key, slugs.get(g.pageKey)!])));
}
