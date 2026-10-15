/**
 * Everything one model page says, computed once from its group of cost-map
 * rows so the HTML, markdown and JSON-LD renderers agree on every number.
 */
import { EMPTY_MODELS_DEV_INDEX, deriveModelMeta } from "../../src/modelMeta";
import { FIRST_PARTY_PROVIDERS, type Group, type IntroPricing, type Member, type Overrides } from "./group";
import { CHAT_MODES, IMAGE_MODES, primaryMetric, rowPrices, type Metric, type RowPrices } from "./pricing";
import { hubProvider, isLabProvider, labFor, providerDocsUrl, providerName, type ProviderSupport } from "./providers";

export type RowView = {
  key: string;
  provider: string;
  providerName: string;
  hub: string;
  qualifier: string;
  modelString: string;
  mode: string;
  prices: RowPrices;
  metric: Metric | null;
  outlier: boolean;
  firstParty: boolean;
  standard: boolean;
  context?: number;
  maxOutput?: number;
  deprecation?: string;
  source?: string;
};

export type Capability = { label: string; supported: boolean };

export type ModelView = {
  pageKey: string;
  slug: string;
  name: string;
  alsoKnownAs: string[];
  lab: string | null;
  mode: string;
  rows: RowView[];
  headline: RowView | null;
  /** Why the headline row was picked: the lab's own API, the cheapest host, or the only one. */
  headlineBasis: "first_party" | "lowest" | "only";
  providers: { name: string; hub: string }[];
  context?: number;
  maxOutput?: number;
  /** When the model first appeared in LiteLLM's price file: YYYY-MM-DD, or YYYY-MM for older models. */
  addedDate: string | null;
  deprecation?: string;
  /** Set while the headline price is an introductory one, from overrides.json. */
  intro?: IntroPricing;
  capabilities: Capability[];
  inputModalities: string[];
  outputModalities: string[];
  sources: string[];
  docs: { name: string; url: string }[];
  /** Range of the primary price across standard rows from different providers. */
  range?: { min: number; max: number; minProvider: string };
  free: boolean;
};

const CAPABILITIES: [string, string][] = [
  ["supports_function_calling", "Function calling"],
  ["supports_parallel_function_calling", "Parallel tool calls"],
  ["supports_response_schema", "Structured output"],
  ["supports_vision", "Image input"],
  ["supports_pdf_input", "PDF input"],
  ["supports_audio_input", "Audio input"],
  ["supports_audio_output", "Audio output"],
  ["supports_video_input", "Video input"],
  ["supports_reasoning", "Reasoning"],
  ["supports_prompt_caching", "Prompt caching"],
  ["supports_web_search", "Web search"],
  ["supports_computer_use", "Computer use"],
];

/** Lab APIs first, Google AI Studio ahead of Vertex. */
const FIRST_PARTY_ORDER = ["openai", "anthropic", "gemini", "mistral", "xai", "deepseek", "cohere", "moonshot", "dashscope", "zai", "minimax"];

const GEO_LABELS: Record<string, string> = {
  us: "US cross-region",
  eu: "EU cross-region",
  apac: "APAC cross-region",
  global: "Global cross-region",
  jp: "Japan cross-region",
  au: "Australia cross-region",
  ca: "Canada cross-region",
  in: "India cross-region",
  "us-gov": "US GovCloud cross-region",
};

function qualifierFor(m: Member): string {
  const f = m.flags;
  const parts: string[] = [];
  if (f.geoProfile) parts.push(GEO_LABELS[f.geoProfile] ?? f.geoProfile);
  if (f.region) parts.push(f.region);
  if (f.commitment) parts.push(f.commitment.replace(/-/g, " "));
  if (f.imageSize) parts.push(f.imageSize.replace("-x-", "×"));
  if (f.quality) parts.push(`${f.quality} quality`);
  if (f.steps) parts.push(f.steps.replace("-", " "));
  if (f.tag) parts.push(f.tag);
  if (f.quant) parts.push(f.quant);
  if (f.fineTune) parts.push("fine-tuned");
  if (f.routerAlias) parts.push("router alias");
  if (f.snapshot) parts.push(`snapshot ${f.snapshot}`);
  if (f.latestAlias) parts.push("latest alias");
  return parts.join(", ");
}

function isStandard(m: Member): boolean {
  const f = m.flags;
  return !(
    f.geoProfile ||
    f.region ||
    f.commitment ||
    f.imageSize ||
    f.quality ||
    f.steps ||
    f.tag ||
    f.quant ||
    f.fineTune ||
    f.routerAlias
  );
}

/** Same rule the catalog table uses for the copyable model name. */
export function modelString(key: string, provider: string): string {
  if (!key.includes("/") && provider.startsWith("vertex_ai")) return `vertex_ai/${key}`;
  return key;
}

function intOf(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Rows priced 8x above or below the group median are likely data errors; keep them out of headlines. */
function flagOutliers(rows: RowView[]): void {
  const byUnit = new Map<string, RowView[]>();
  for (const r of rows) {
    if (!r.metric || r.metric.value <= 0) continue;
    const list = byUnit.get(r.metric.unit) ?? [];
    list.push(r);
    byUnit.set(r.metric.unit, list);
  }
  for (const list of byUnit.values()) {
    if (list.length < 3) continue;
    const m = median(list.map((r) => r.metric!.value));
    for (const r of list) if (r.metric!.value > m * 8 || r.metric!.value < m / 8) r.outlier = true;
  }
}

function dominantMode(members: Member[]): string {
  const counts = new Map<string, number>();
  for (const m of members) counts.set(m.mode, (counts.get(m.mode) ?? 0) + (FIRST_PARTY_PROVIDERS.has(m.provider) ? 3 : 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

function pickHeadline(rows: RowView[]): { row: RowView | null; basis: ModelView["headlineBasis"] } {
  const clean = rows.filter((r) => r.metric && !r.outlier);
  const standard = clean.filter((r) => r.standard);
  const firstParty = standard.filter((r) => r.firstParty);
  if (firstParty.length) {
    const order = (r: RowView) => {
      const i = FIRST_PARTY_ORDER.indexOf(r.provider);
      return i === -1 ? FIRST_PARTY_ORDER.length : i;
    };
    const undated = (r: RowView) => (/snapshot|latest/.test(r.qualifier) ? 1 : 0);
    const best = [...firstParty].sort(
      (a, b) => undated(a) - undated(b) || order(a) - order(b) || a.key.length - b.key.length || a.key.localeCompare(b.key),
    )[0];
    return { row: best, basis: "first_party" };
  }
  const pool = standard.length ? standard : clean;
  if (!pool.length) return { row: null, basis: "only" };
  const cheapest = [...pool].sort(
    (a, b) => a.metric!.value - b.metric!.value || a.key.length - b.key.length || a.key.localeCompare(b.key),
  )[0];
  const providers = new Set(pool.map((r) => r.providerName));
  return { row: cheapest, basis: providers.size > 1 ? "lowest" : "only" };
}

/** Tidy a name built from a model id: drop region and size qualifiers, "v4" -> "V4", trailing "03 2025" dates. */
export function cleanName(name: string): string {
  return name
    .replace(/\s\((US|EU|APAC|Global|JP|AU|CA|IN|US-GOV)\)$/i, "")
    .replace(/\s·\s.*$/, "")
    .replace(/\bv(\d)/g, "V$1")
    .replace(/\s(0[1-9]|1[0-2])\s20\d{2}$/, "")
    .trim();
}

export function buildModelView(
  group: Group,
  slug: string,
  overrides: Overrides,
  support: ProviderSupport,
  addedDate: string | null,
  /** Build date; an introductory price is dropped once it has ended. */
  today?: string,
): ModelView {
  const mode = dominantMode(group.members);
  const lab = labFor(slug, group.members.map((m) => m.vendor));
  const memberKeys = new Set(group.members.map((m) => m.key));
  const isShadowedByPrefixedTwin = (m: Member) => {
    const callName = modelString(m.key, m.provider);
    return callName !== m.key && memberKeys.has(callName);
  };
  const rows: RowView[] = group.members.filter((m) => !isShadowedByPrefixedTwin(m)).map((m) => {
    const prices = rowPrices(m.row);
    const deprecation = typeof m.row.deprecation_date === "string" ? m.row.deprecation_date : undefined;
    const source = typeof m.row.source === "string" && m.row.source.startsWith("http") ? m.row.source : undefined;
    return {
      key: m.key,
      provider: m.provider,
      providerName: providerName(m.provider, support),
      hub: hubProvider(m.provider),
      qualifier: qualifierFor(m),
      modelString: modelString(m.key, m.provider),
      mode: m.mode,
      prices,
      metric: primaryMetric(m.mode, prices),
      outlier: false,
      firstParty: FIRST_PARTY_PROVIDERS.has(m.provider) && isLabProvider(m.provider, lab),
      standard: isStandard(m),
      context: intOf(m.row.max_input_tokens) ?? intOf(m.row.max_tokens),
      maxOutput: intOf(m.row.max_output_tokens),
      deprecation,
      source,
    };
  });
  flagOutliers(rows);
  const { row: headline, basis } = pickHeadline(rows);

  // Headline first, then the lab's own rows, then providers alphabetically.
  rows.sort((a, b) => {
    if (a === headline) return -1;
    if (b === headline) return 1;
    return (
      Number(b.firstParty) - Number(a.firstParty) ||
      Number(b.standard) - Number(a.standard) ||
      a.providerName.localeCompare(b.providerName) ||
      a.key.localeCompare(b.key)
    );
  });

  // Names come from LiteLLM's own model ids (plus overrides.json), never from outside sources.
  const nameMember = group.members.find((m) => m.key === headline?.key) ?? group.members.find(isStandard) ?? group.members[0];
  const name = overrides.displayNames?.[group.pageKey] ?? cleanName(deriveModelMeta(nameMember.displayId, EMPTY_MODELS_DEV_INDEX).display_name);

  const providers: ModelView["providers"] = [];
  for (const r of rows) {
    if (!providers.some((p) => p.name === r.providerName)) providers.push({ name: r.providerName, hub: r.hub });
  }

  const capRow = headline ? group.members.find((m) => m.key === headline.key)!.row : group.members[0].row;
  const capabilities: Capability[] = [];
  for (const [field, label] of CAPABILITIES) {
    const own = capRow[field];
    const value = typeof own === "boolean" ? own : group.members.some((m) => m.row[field] === true) ? true : undefined;
    if (value !== undefined) capabilities.push({ label, supported: value });
  }
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

  const standardPriced = rows.filter((r) => r.metric && !r.outlier && r.standard && r.metric.unit === headline?.metric?.unit);
  let range: ModelView["range"];
  if (new Set(standardPriced.map((r) => r.providerName)).size > 1) {
    const sorted = [...standardPriced].sort((a, b) => a.metric!.value - b.metric!.value);
    range = {
      min: sorted[0].metric!.value,
      max: sorted[sorted.length - 1].metric!.value,
      minProvider: sorted[0].providerName,
    };
  }

  const sources = [...new Set(rows.filter((r) => r.source).sort((a, b) => Number(b.firstParty) - Number(a.firstParty)).map((r) => r.source!))].slice(0, 4);
  const docs: ModelView["docs"] = [];
  for (const p of providers) {
    const url = providerDocsUrl(p.hub, support);
    if (url && !docs.some((d) => d.url === url)) docs.push({ name: p.name, url });
  }

  const introEntry = overrides.introPricing?.[group.pageKey];
  const intro = introEntry && headline && (!today || introEntry.until >= today) ? introEntry : undefined;

  const p = headline?.prices;
  const free =
    !!headline &&
    (CHAT_MODES.has(mode) || mode === "embedding") &&
    p?.input === 0 &&
    (p?.output === 0 || p?.output === undefined);

  return {
    pageKey: group.pageKey,
    slug,
    name,
    alsoKnownAs: overrides.alsoKnownAs?.[group.pageKey] ?? [],
    lab,
    mode,
    rows,
    headline,
    headlineBasis: basis,
    providers,
    context: headline?.context ?? rows.find((r) => r.context)?.context,
    maxOutput: headline?.maxOutput ?? rows.find((r) => r.maxOutput)?.maxOutput,
    addedDate,
    deprecation: headline?.deprecation,
    intro,
    capabilities,
    inputModalities: strings(capRow.supported_modalities),
    outputModalities: strings(capRow.supported_output_modalities),
    sources,
    docs: docs.slice(0, 6),
    range,
    free,
  };
}

export function isImageMode(mode: string): boolean {
  return IMAGE_MODES.has(mode);
}
