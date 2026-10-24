import Fuse from "fuse.js";
import { hasZeroListedPrice, searchIntent } from "./searchIntent";

export type SearchableModel = {
  name: string;
  display_name: string;
  mode?: unknown;
  litellm_provider?: unknown;
  max_input_tokens?: unknown;
  max_output_tokens?: unknown;
  zeroPriced?: boolean;
  [key: string]: unknown;
};

export type ModelFilters = {
  provider: string;
  minInputTokens: number | null;
  minOutputTokens: number | null;
  freeOnly?: boolean;
  output?: "" | "text" | "image" | "video" | "audio" | "embedding";
  inputs?: ("text" | "image" | "file" | "audio" | "video")[];
  toolsOnly?: boolean;
};

export function supportsOutput(
  item: SearchableModel,
  output: NonNullable<ModelFilters["output"]>,
): boolean {
  if (!output) return true;
  if (
    Array.isArray(item.supported_output_modalities) &&
    item.supported_output_modalities.length
  ) {
    return (
      item.supported_output_modalities.includes(output) ||
      (output === "embedding" && item.mode === "embedding")
    );
  }
  const modes: Record<string, string[]> = {
    text: [
      "chat",
      "completion",
      "responses",
      "audio_transcription",
      "ocr",
      "search",
    ],
    image: ["image_generation", "image_edit"],
    video: ["video_generation"],
    audio: ["audio_speech"],
    embedding: ["embedding"],
  };
  return modes[output].includes(String(item.mode));
}

export function supportsInput(
  item: SearchableModel,
  input: NonNullable<ModelFilters["inputs"]>[number],
): boolean {
  if (
    Array.isArray(item.supported_modalities) &&
    (item.supported_modalities.includes(input) ||
      (input === "file" && item.supported_modalities.includes("pdf")))
  )
    return true;
  if (input === "image")
    return (
      item.supports_vision === true ||
      item.mode === "image_edit" ||
      item.mode === "ocr"
    );
  if (input === "audio")
    return (
      item.supports_audio_input === true || item.mode === "audio_transcription"
    );
  if (input === "video") return item.supports_video_input === true;
  if (input === "file") return item.supports_pdf_input === true;
  return (
    !Array.isArray(item.supported_modalities) &&
    [
      "chat",
      "completion",
      "responses",
      "embedding",
      "audio_speech",
      "image_generation",
      "video_generation",
      "moderation",
      "rerank",
      "search",
    ].includes(String(item.mode))
  );
}

type FilteredModels<T extends SearchableModel> = {
  readonly key: string;
  readonly items: readonly T[];
  fuse: Fuse<T> | null;
};

export type ModelIndex<T extends SearchableModel> = {
  readonly all: FilteredModels<T>;
  lastFiltered: FilteredModels<T> | null;
  words: string[];
};

export const SEARCH_KEYS = [
  { name: "name", weight: 1.5 },
  { name: "display_name", weight: 1.5 },
  "mode",
  "litellm_provider",
];

export const SEARCH_OPTIONS = {
  threshold: 0.3,
  ignoreLocation: true,
  keys: SEARCH_KEYS,
};

/** Coerce a max_input/output_tokens field to a finite number for filtering.
 *  Accepts JS numbers and numeric strings (catalog payloads sometimes encode
 *  limits as strings); returns null for non-numeric values. */
export function tokenLimitValue(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function meetsMinimum(limit: unknown, minimum: number | null): boolean {
  if (minimum === null) return true;
  const value = tokenLimitValue(limit);
  return value !== null && value >= minimum;
}

export function passesFilters(
  item: SearchableModel,
  filters: ModelFilters,
): boolean {
  return (
    (!filters.provider || item.litellm_provider === filters.provider) &&
    meetsMinimum(item.max_input_tokens, filters.minInputTokens) &&
    meetsMinimum(item.max_output_tokens, filters.minOutputTokens) &&
    (!filters.freeOnly || (item.zeroPriced ?? hasZeroListedPrice(item))) &&
    (!filters.output || supportsOutput(item, filters.output)) &&
    (!filters.inputs?.length ||
      filters.inputs.every((input) => supportsInput(item, input))) &&
    (!filters.toolsOnly || item.supports_function_calling === true)
  );
}

const NO_FILTERS: ModelFilters = {
  provider: "",
  minInputTokens: null,
  minOutputTokens: null,
};

function filtersKey(filters: ModelFilters): string {
  return JSON.stringify([
    filters.provider,
    filters.minInputTokens,
    filters.minOutputTokens,
    !!filters.freeOnly,
    filters.output ?? "",
    [...(filters.inputs ?? [])].sort(),
    !!filters.toolsOnly,
  ]);
}

export function indexModels<T extends SearchableModel>(
  items: readonly T[],
): ModelIndex<T> {
  return {
    all: {
      key: filtersKey(NO_FILTERS),
      items,
      fuse: new Fuse(items, SEARCH_OPTIONS),
    },
    lastFiltered: null,
    words: [
      ...new Set(
        items.flatMap((item) =>
          [
            item.name,
            item.display_name,
            String(item.litellm_provider ?? ""),
          ].flatMap((value) =>
            value
              .toLowerCase()
              .split(/[^a-z0-9]+/)
              .filter((word) => /^[a-z]{3,}$/.test(word)),
          ),
        ),
      ),
    ],
  };
}

function editDistance(left: string, right: string): number {
  const rows = Array.from({ length: left.length + 1 }, () =>
    Array(right.length + 1).fill(0),
  );
  for (let i = 0; i <= left.length; i++) rows[i][0] = i;
  for (let j = 0; j <= right.length; j++) rows[0][j] = j;
  for (let i = 1; i <= left.length; i++)
    for (let j = 1; j <= right.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + Number(left[i - 1] !== right[j - 1]),
      );
      if (
        i > 1 &&
        j > 1 &&
        left[i - 1] === right[j - 2] &&
        left[i - 2] === right[j - 1]
      )
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  return rows[left.length][right.length];
}

/** Correct short typos only to words actually present in this catalog. */
function correctedQuery(words: string[], raw: string): string {
  const query = raw.toLowerCase();
  if (
    !/^[a-z]{3,}$/.test(query) ||
    words.some((word) => word.startsWith(query))
  )
    return raw;
  const maxEdits = Math.min(2, Math.max(1, Math.floor(query.length / 3)));
  const candidates = words
    .filter(
      (word) =>
        word[0] === query[0] &&
        Math.abs(word.length - query.length) <= maxEdits,
    )
    .map((word) => ({ word, edits: editDistance(query, word) }))
    .filter(({ edits }) => edits <= maxEdits)
    .sort(
      (a, b) =>
        a.edits - b.edits ||
        Math.abs(a.word.length - query.length) -
          Math.abs(b.word.length - query.length),
    );
  return candidates[0]?.word ?? raw;
}

function filteredModels<T extends SearchableModel>(
  index: ModelIndex<T>,
  filters: ModelFilters,
): FilteredModels<T> {
  const key = filtersKey(filters);
  if (key === index.all.key) return index.all;
  if (index.lastFiltered?.key !== key) {
    index.lastFiltered = {
      key,
      items: index.all.items.filter((item) => passesFilters(item, filters)),
      fuse: null,
    };
  }
  return index.lastFiltered;
}

export function searchModels<T extends SearchableModel>(
  index: ModelIndex<T>,
  query: string,
  filters: ModelFilters,
): T[] {
  const intent = searchIntent(query);
  if (intent.modelSearch === false) return [];
  const filtered = filteredModels(index, {
    ...filters,
    freeOnly: filters.freeOnly || intent.freeOnly,
  });
  if (intent.providers)
    return filtered.items.filter((item) =>
      intent.providers!.includes(String(item.litellm_provider)),
    );
  if (!intent.query) return [...filtered.items];
  filtered.fuse ??= new Fuse(filtered.items, SEARCH_OPTIONS);
  return filtered.fuse
    .search(correctedQuery(index.words, intent.query))
    .map((result) => result.item);
}

export type CatalogMatches<T> = { items: T[]; hiddenCount: number };

export function searchCatalog<T extends SearchableModel>(
  index: ModelIndex<T>,
  query: string,
  filters: ModelFilters,
): CatalogMatches<T> {
  const items = searchModels(index, query, filters);
  const hasFilters =
    !!filters.provider ||
    filters.minInputTokens != null ||
    filters.minOutputTokens != null ||
    !!filters.freeOnly ||
    !!filters.output ||
    !!filters.inputs?.length ||
    !!filters.toolsOnly;
  const total = hasFilters
    ? searchModels(index, query, NO_FILTERS).length
    : items.length;
  return { items, hiddenCount: Math.max(0, total - items.length) };
}
