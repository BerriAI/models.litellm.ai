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

type FilteredModels<T extends SearchableModel> = {
  readonly key: string;
  readonly items: readonly T[];
  fuse: Fuse<T> | null;
};

export type ModelIndex<T extends SearchableModel> = {
  readonly all: FilteredModels<T>;
  lastFiltered: FilteredModels<T> | null;
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
  };
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
  const filtered = filteredModels(index, filters);
  if (!query) return [...filtered.items];
  filtered.fuse ??= new Fuse(filtered.items, SEARCH_OPTIONS);
  return filtered.fuse.search(query).map((result) => result.item);
}
