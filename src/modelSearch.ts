import Fuse from "fuse.js";

export type SearchableModel = {
  name: string;
  display_name: string;
  mode?: unknown;
  litellm_provider?: unknown;
  max_input_tokens?: unknown;
  max_output_tokens?: unknown;
};

export type ModelFilters = {
  provider: string;
  minInputTokens: number | null;
  minOutputTokens: number | null;
};

export type ModelIndex<T extends SearchableModel> = {
  readonly items: readonly T[];
  readonly fuse: Fuse<T>;
};

export const SEARCH_KEYS = [
  { name: "name", weight: 1.5 },
  { name: "display_name", weight: 1.5 },
  "mode",
  "litellm_provider",
];

export const SEARCH_OPTIONS = {
  threshold: 0.3,
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
    meetsMinimum(item.max_output_tokens, filters.minOutputTokens)
  );
}

export function indexModels<T extends SearchableModel>(
  items: readonly T[],
): ModelIndex<T> {
  return { items, fuse: new Fuse(items, SEARCH_OPTIONS) };
}

export function searchModels<T extends SearchableModel>(
  index: ModelIndex<T>,
  query: string,
  filters: ModelFilters,
): T[] {
  const matches = query
    ? index.fuse.search(query).map((result) => result.item)
    : index.items;
  return matches.filter((item) => passesFilters(item, filters));
}
