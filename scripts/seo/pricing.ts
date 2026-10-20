/**
 * Turns one cost-map row into display prices. Token prices are per 1M tokens,
 * the unit every pricing page and search snippet uses.
 */
import type { CostRow } from "./group";

export type LongContextTier = { above: number; input?: number; output?: number; cacheRead?: number };

export type RowPrices = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cacheWrite1h?: number;
  batchInput?: number;
  batchOutput?: number;
  priorityInput?: number;
  priorityOutput?: number;
  flexInput?: number;
  flexOutput?: number;
  longContext: LongContextTier[];
  perImage?: number;
  inputPerImage?: number;
  imageOutputTokens?: number;
  perMegapixel?: number;
  perSecond?: number;
  perMinute?: number;
  per1MChars?: number;
  audioInput?: number;
  audioOutput?: number;
  searchPer1K?: number;
  queryPer1K?: number;
  pagePer1K?: number;
};

export type MetricUnit =
  | "per_1m_tokens"
  | "per_image"
  /** `output_cost_per_image` on a model that doesn't make images, such as Lyria's music clips. */
  | "per_output"
  | "per_megapixel"
  | "per_second"
  | "per_minute"
  | "per_1m_chars"
  | "per_1k_queries"
  | "per_1k_pages";

export type Metric = { value: number; unit: MetricUnit };

export const UNIT_LABEL: Record<MetricUnit, string> = {
  per_1m_tokens: "per 1M tokens",
  per_image: "per image",
  per_output: "per generation",
  per_megapixel: "per megapixel",
  per_second: "per second",
  per_minute: "per minute",
  per_1m_chars: "per 1M characters",
  per_1k_queries: "per 1K queries",
  per_1k_pages: "per 1K pages",
};

export const CHAT_MODES = new Set(["chat", "responses", "completion", "realtime", "moderation"]);
export const IMAGE_MODES = new Set(["image_generation", "image_edit"]);

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }
  return undefined;
}

const perM = (v: unknown) => {
  const n = num(v);
  return n === undefined ? undefined : n * 1e6;
};
const times = (v: unknown, k: number) => {
  const n = num(v);
  return n === undefined ? undefined : n * k;
};

const LONG_CONTEXT = /^input_cost_per_token_above_(\d+)k_tokens$/;

export function rowPrices(row: CostRow): RowPrices {
  const longContext: LongContextTier[] = [];
  for (const field of Object.keys(row)) {
    const m = LONG_CONTEXT.exec(field);
    if (!m) continue;
    const k = m[1];
    longContext.push({
      above: Number(k) * 1000,
      input: perM(row[field]),
      output: perM(row[`output_cost_per_token_above_${k}k_tokens`]),
      cacheRead: perM(row[`cache_read_input_token_cost_above_${k}k_tokens`]),
    });
  }
  longContext.sort((a, b) => a.above - b.above);

  const search = row.search_context_cost_per_query;
  const searchMedium =
    search && typeof search === "object"
      ? num((search as Record<string, unknown>).search_context_size_medium)
      : undefined;

  return {
    input: perM(row.input_cost_per_token),
    output: perM(row.output_cost_per_token),
    cacheRead: perM(row.cache_read_input_token_cost),
    cacheWrite: perM(row.cache_creation_input_token_cost),
    cacheWrite1h: perM(row.cache_creation_input_token_cost_above_1hr),
    batchInput: perM(row.input_cost_per_token_batches),
    batchOutput: perM(row.output_cost_per_token_batches),
    priorityInput: perM(row.input_cost_per_token_priority),
    priorityOutput: perM(row.output_cost_per_token_priority),
    flexInput: perM(row.input_cost_per_token_flex),
    flexOutput: perM(row.output_cost_per_token_flex),
    longContext,
    perImage: num(row.output_cost_per_image),
    inputPerImage: num(row.input_cost_per_image),
    imageOutputTokens: perM(row.output_cost_per_image_token),
    perMegapixel: perM(row.output_cost_per_pixel),
    perSecond: num(row.output_cost_per_second) ?? num(row.cost_per_second),
    perMinute: times(row.input_cost_per_second, 60),
    per1MChars: perM(row.input_cost_per_character),
    audioInput: perM(row.input_cost_per_audio_token),
    audioOutput: perM(row.output_cost_per_audio_token),
    searchPer1K: searchMedium === undefined ? undefined : searchMedium * 1000,
    queryPer1K: times(row.input_cost_per_query, 1000),
    pagePer1K: times(row.ocr_cost_per_page, 1000),
  };
}

/** The one number that best answers "how much does this model cost" for its mode. */
export function primaryMetric(mode: string, p: RowPrices): Metric | null {
  // A positive price beats a zero one: Lyria lists $0 tokens next to its real per-clip price.
  const pick = (...candidates: [number | undefined, MetricUnit][]): Metric | null => {
    for (const [value, unit] of candidates) if (value !== undefined && value > 0) return { value, unit };
    for (const [value, unit] of candidates) if (value !== undefined) return { value, unit };
    return null;
  };
  if (IMAGE_MODES.has(mode)) {
    return pick(
      [p.perImage, "per_image"],
      [p.imageOutputTokens, "per_1m_tokens"],
      [p.perMegapixel, "per_megapixel"],
      [p.output, "per_1m_tokens"],
      [p.input, "per_1m_tokens"],
    );
  }
  if (mode === "video_generation") return pick([p.perSecond, "per_second"], [p.perImage, "per_image"]);
  if (mode === "audio_speech") {
    return pick([p.per1MChars, "per_1m_chars"], [p.perSecond, "per_second"], [p.output, "per_1m_tokens"], [p.perImage, "per_output"]);
  }
  if (mode === "audio_transcription") {
    return pick([p.perMinute, "per_minute"], [p.input, "per_1m_tokens"], [p.audioInput, "per_1m_tokens"]);
  }
  if (mode === "rerank") return pick([p.queryPer1K, "per_1k_queries"], [p.input, "per_1m_tokens"]);
  if (mode === "ocr") return pick([p.pagePer1K, "per_1k_pages"], [p.input, "per_1m_tokens"]);
  return pick(
    [p.input, "per_1m_tokens"],
    [p.output, "per_1m_tokens"],
    [p.perImage, "per_output"],
    [p.perSecond, "per_second"],
  );
}

/** Whether a row's headline is its token prices, rather than a per-output price on a $0-token row. */
export function leadsWithTokens(mode: string, p: RowPrices, metric: Metric | null | undefined): boolean {
  return CHAT_MODES.has(mode) && p.input !== undefined && p.output !== undefined && metric?.unit === "per_1m_tokens";
}

export function isTokenPriced(mode: string): boolean {
  return CHAT_MODES.has(mode) || mode === "embedding";
}
