import {
  buildModelsDevIndex,
  deriveModelMeta,
  type ModelsDevApi,
} from "../src/modelMeta.js";

export type Row = Record<string, unknown>;
export type Source = { id: number; title: string; url: string };
export type Table = { rows: Row[]; sources: number[]; descriptions?: Row };
export type Snapshot = {
  tables: Record<string, Table>;
  sources: Source[];
  loadedAt: string;
  schema: string;
};
const COST_MAP =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const PROVIDERS =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/provider_endpoints_support.json";
const MANIFEST = "https://models.litellm.ai/models/manifest.json";
const CHANGES = "https://models.litellm.ai/changelog.json";
const METADATA = "https://models.dev/api.json";

export function columns(rows: Row[]): string[] {
  return [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
}

export function buildSnapshot(
  prices: Row,
  providers: Row,
  manifest: Row,
  changes: Row,
  metadata: Row,
): Snapshot {
  const index = buildModelsDevIndex(metadata as ModelsDevApi);
  const sources = [
    { id: 1, title: "LiteLLM prices and capabilities", url: COST_MAP },
    { id: 2, title: "Model names and release dates", url: METADATA },
    { id: 3, title: "LiteLLM provider endpoint support", url: PROVIDERS },
    { id: 4, title: "Model catalog and deprecations", url: MANIFEST },
    { id: 5, title: "Catalog changelog", url: CHANGES },
  ];
  const modelRows = Object.entries(prices)
    .filter(
      ([id, row]) => id !== "sample_spec" && row && typeof row === "object",
    )
    .map(([id, fields]) => {
      const meta = deriveModelMeta(id, index);
      return {
        ...(fields as Row),
        id,
        display_name: meta.display_name,
        release_date: meta.release_date,
      };
    });
  const tables: Record<string, Table> = {
    models: {
      rows: modelRows,
      sources: [1, 2],
      descriptions: {
        ...(prices.sample_spec as Row),
        id: "Exact provider listing ID; one model can have several provider listings.",
        release_date:
          "Model release date from the site's existing metadata resolver. YYYY-MM-DD or YYYY-MM (month precision); NULL means unknown. Not first catalog appearance.",
        display_name: "The site's resolved display name.",
        input_cost_per_token:
          "USD per input token. Multiply by 1,000,000 for USD per million. NULL is unknown, zero is free. Check tier-specific columns for long-context workloads.",
        output_cost_per_token:
          "USD per output token. Input/output are separate rates; define the workload before combining them.",
        max_input_tokens:
          "Maximum input context in tokens. Do not substitute max_output_tokens.",
      },
    },
    providers: {
      rows: Object.entries((providers.providers || {}) as Row).map(
        ([id, fields]) => ({ ...(fields as Row), id }),
      ),
      sources: [3],
      descriptions: (providers._schema as Row)?.provider_slug as Row,
    },
    catalog: {
      rows: Object.entries((manifest.models || {}) as Row).map(
        ([slug, fields]) => ({ ...(fields as Row), slug }),
      ),
      sources: [4],
      descriptions: {
        modelId:
          "Representative listing; join to models.id when applicable. Provider listings are not canonical model counts.",
        firstSeen:
          "First appearance in this site's catalog, NOT a model release date.",
        retiredOn:
          "Date removed from catalog; not necessarily provider deprecation.",
        history: "JSON history of this canonical catalog entry.",
      },
    },
    deprecations: {
      rows: (manifest.deprecations || []) as Row[],
      sources: [4],
      descriptions: {
        date: "Effective provider deprecation date, not announcement date.",
        firstObservedOn: "When the site observed the deprecation notice.",
        modelId:
          "Exact listing ID; join to models.id or catalog.slug via slug. Removed listings remain here.",
        reference: "Provider notice supporting the deprecation.",
      },
    },
    changes: {
      rows: ((changes.updates || []) as Row[]).flatMap((update) => {
        const { entries, ...rest } = update;
        return ((entries || [{}]) as Row[]).map((entry) => ({
          ...rest,
          ...entry,
          update_id: update.id,
        }));
      }),
      sources: [5],
      descriptions: {
        date: "Date added or changed in LiteLLM's catalog, NOT model release date.",
        changes:
          "JSON array of field/before/after changes. Use json_each to inspect individual changes.",
        source: "Public source commit for this catalog change.",
      },
    },
  };
  const schema = Object.entries(tables)
    .map(([name, table]) => {
      const fields = columns(table.rows).map((column) => {
        const sample = table.rows.find((row) => row[column] != null)?.[column];
        const type =
          typeof sample === "number"
            ? "REAL"
            : typeof sample === "boolean"
              ? "INTEGER (0/1)"
              : typeof sample === "object"
                ? "TEXT (JSON)"
                : "TEXT";
        const description = table.descriptions?.[column];
        return `${column}: ${type}${typeof description === "string" ? ` — ${description}` : ""}`;
      });
      return `${name} (${table.rows.length} rows; source IDs ${table.sources.join(", ")}):\n${fields.join("\n")}`;
    })
    .join("\n\n");
  return { tables, sources, loadedAt: new Date().toISOString(), schema };
}

let cached: { expires: number; promise: Promise<Snapshot> } | undefined;
export function loadSnapshot(): Promise<Snapshot> {
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = Promise.all(
    [COST_MAP, PROVIDERS, MANIFEST, CHANGES, METADATA].map(async (url) => {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      });
      if (!response.ok) throw new Error("Catalog unavailable");
      return response.json();
    }),
  ).then(([prices, providers, manifest, changes, metadata]) =>
    buildSnapshot(prices, providers, manifest, changes, metadata),
  );
  cached = { expires: Date.now() + 300_000, promise };
  promise.catch(() => {
    if (cached?.promise === promise) cached = undefined;
  });
  return promise;
}
