import { fetchAllCatalogModels } from "./catalogApi";
import {
  loadModelsDevIndex,
  MODELS_DEV_TIMEOUT_MS,
  type ModelsDevIndex,
} from "./modelMeta";

export type CatalogItem = {
  name: string;
  [key: string]: unknown;
};

export type CatalogData = {
  items: CatalogItem[];
  lines: string[];
  metadata: Promise<ModelsDevIndex>;
  fetchedAt: number;
};

const catalogUrl =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
export const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
type CacheEntry = { pending: Promise<CatalogData>; expiresAt: number };
const cache = new Map<string, CacheEntry>();

/** Share the catalog across route visits. Optional names/dates never block pricing. */
export function loadCatalogData(
  useLocalApi: boolean,
  apiBase: string,
  options: { forceRefresh?: boolean } = {},
): Promise<CatalogData> {
  const key = useLocalApi ? `api:${apiBase}` : "github";
  const cached = cache.get(key);
  if (!options.forceRefresh && cached && Date.now() < cached.expiresAt)
    return cached.pending;

  const metadata = loadModelsDevIndex(
    (input, init) => fetch(input, init),
    MODELS_DEV_TIMEOUT_MS,
  );
  const source = fetch(catalogUrl, { cache: "no-cache" }).then(
    async (response) => {
      if (!response.ok)
        throw new Error(`Catalog request failed (${response.status})`);
      return response.text();
    },
  );
  const pending = useLocalApi
    ? Promise.all([
        fetchAllCatalogModels(apiBase),
        source.catch(() => ""),
      ]).then(([catalog, text]) => ({
        items: catalog.models as CatalogItem[],
        lines: text.split("\n"),
        metadata,
        fetchedAt: Date.now(),
      }))
    : source.then((text) => {
        const parsed: unknown = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Invalid model catalog");
        }
        const items: CatalogItem[] = [];
        for (const [name, fields] of Object.entries(parsed)) {
          if (
            name === "sample_spec" ||
            !fields ||
            typeof fields !== "object" ||
            Array.isArray(fields)
          )
            continue;
          items.push({ ...fields, name });
        }
        return {
          items,
          lines: text.split("\n"),
          metadata,
          fetchedAt: Date.now(),
        };
      });
  const entry = { pending, expiresAt: Date.now() + CATALOG_CACHE_TTL_MS };
  cache.set(key, entry);
  pending.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return pending;
}
