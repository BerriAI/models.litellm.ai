/** Public-feed discovery: Epoch capabilities plus comparable-version Terminal-Bench runs. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  isRecord,
  nonnegative,
  parseDiscoveryBenchmarks,
  type DiscoveryBenchmarkCatalog,
  type DiscoveryBenchmarkModel,
} from "../../src/discoveryBenchmarks";
import { epochDiscoveryModels } from "./discovery-epoch";
import { catalogModelId, parseLiteLLMModelId } from "../../src/litellmModelId";
import type { BenchmarkData } from "./benchmarks";
import type { ModelView } from "./model-view";

export const TERMINAL_BENCH_VERSION = "4.0";
// The official leaderboard pins this dataset. Fail closed if a new release changes the task set.
export const TERMINAL_BENCH_DATASET_REF =
  "sha256:39d9f44b40420cde8fdcc087579c0d72a7e14fa3656d603c3f0d22fb35e27732";
const REPOSITORY = "harbor-framework/terminal-bench";
const RAW = `https://raw.githubusercontent.com/${REPOSITORY}/main`;
const DIRECTORY = `https://api.github.com/repos/${REPOSITORY}/contents/leaderboard/submissions?ref=main`;
const SNAPSHOT = fileURLToPath(
  new URL("./terminal-bench-snapshot.json", import.meta.url),
);

type TerminalBenchCapture = {
  models: DiscoveryBenchmarkModel[];
  asOf: string | null;
  version: string;
  datasetRef: string;
};
const label = (value: unknown): string | null =>
  isRecord(value) && typeof value.label === "string" && value.label.trim()
    ? value.label.trim()
    : null;
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export function terminalBenchModel(
  file: string,
  value: unknown,
): DiscoveryBenchmarkModel | null {
  if (
    !/^[a-z0-9][a-z0-9._-]*\.json$/.test(file) ||
    !isRecord(value) ||
    !isRecord(value.metadata) ||
    !isRecord(value.metrics) ||
    !isRecord(value.source_filter)
  )
    return null;
  const { metadata, metrics, source_filter: filter } = value;
  const name = label(metadata.model_display),
    lab = label(metadata.model_org),
    harness = label(metadata.agent_display);
  const modelId = text(filter.model_name),
    setting = text(metadata.reasoning_effort);
  const trials = nonnegative(metrics.n_trials),
    passed = nonnegative(metrics.successes),
    totalCost = nonnegative(metrics.total_cost_usd);
  if (
    !name ||
    !harness ||
    !modelId ||
    trials === null ||
    !Number.isInteger(trials) ||
    trials <= 0 ||
    passed === null ||
    !Number.isInteger(passed) ||
    passed > trials
  )
    return null;
  const coding = passed / trials;
  // Published accuracy is rounded to two decimals; the exact success count governs value math.
  const accuracy = nonnegative(metrics.accuracy);
  if (accuracy === null || Math.abs(accuracy - coding * 100) > 0.011)
    return null;
  return {
    slug: `tb-${file.slice(0, -5)}`,
    name,
    modelId: null,
    lab,
    href: `https://github.com/${REPOSITORY}/blob/main/leaderboard/submissions/${file}`,
    releaseSlug: modelId,
    intelligence: null,
    coding,
    costPerTask:
      totalCost !== null && totalCost > 0 ? totalCost / trials : null,
    harness,
    setting,
    trials,
    passed,
    totalCost,
  };
}
async function get(url: string, fetchFn: typeof fetch): Promise<Response> {
  const response = await fetchFn(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok)
    throw new Error(`Public benchmark feed returned HTTP ${response.status}.`);
  return response;
}
export async function fetchTerminalBench(
  fetchFn: typeof fetch = fetch,
  asOf = new Date().toISOString(),
): Promise<TerminalBenchCapture> {
  const pin = await (
    await get(`${RAW}/leaderboard/src/leaderboard/core/hub.py`, fetchFn)
  ).text();
  if (!pin.includes(`DATASET_REF = "${TERMINAL_BENCH_DATASET_REF}"`))
    throw new Error("Terminal-Bench dataset version changed.");
  const directory: unknown = await (await get(DIRECTORY, fetchFn)).json();
  if (!Array.isArray(directory) || directory.length >= 1000)
    throw new Error("Terminal-Bench directory is incomplete.");
  const files = directory.flatMap((item): string[] =>
    isRecord(item) &&
    item.type === "file" &&
    typeof item.name === "string" &&
    /^[a-z0-9][a-z0-9._-]*\.json$/.test(item.name)
      ? [item.name]
      : [],
  );
  if (!files.length) throw new Error("Terminal-Bench has no submissions.");
  const models: DiscoveryBenchmarkModel[] = [];
  for (let start = 0; start < files.length; start += 5) {
    const batch = await Promise.all(
      files
        .slice(start, start + 5)
        .map(async (file) =>
          terminalBenchModel(
            file,
            await (
              await get(`${RAW}/leaderboard/submissions/${file}`, fetchFn)
            ).json(),
          ),
        ),
    );
    // Never publish a silently truncated leaderboard when a source schema changes.
    if (batch.some((model) => model === null))
      throw new Error("Terminal-Bench submission format changed.");
    models.push(...(batch as DiscoveryBenchmarkModel[]));
  }
  return {
    models,
    asOf,
    version: TERMINAL_BENCH_VERSION,
    datasetRef: TERMINAL_BENCH_DATASET_REF,
  };
}
function cachedTerminalBench(file: string): TerminalBenchCapture {
  const value: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (
    !isRecord(value) ||
    value.datasetRef !== TERMINAL_BENCH_DATASET_REF ||
    value.version !== TERMINAL_BENCH_VERSION
  )
    throw new Error("Terminal-Bench cache version differs.");
  const parsed = parseDiscoveryBenchmarks({ ...value, source: "public-feeds" });
  return {
    models: parsed.models,
    asOf: parsed.asOf,
    version: TERMINAL_BENCH_VERSION,
    datasetRef: TERMINAL_BENCH_DATASET_REF,
  };
}
/** Only catalog routing identifiers establish a copyable LiteLLM route for benchmark rows. */
export function withCatalogModelIds(
  models: DiscoveryBenchmarkModel[],
  views: readonly (Pick<ModelView, "slug" | "status"> & {
    headline: Pick<
      NonNullable<ModelView["headline"]>,
      "modelString" | "deprecation"
    > | null;
    rows: readonly Pick<
      ModelView["rows"][number],
      "key" | "modelString" | "provider" | "deprecation"
    >[];
  })[],
): DiscoveryBenchmarkModel[] {
  const today = new Date().toISOString().slice(0, 10);
  const routes = new Map<string, string>();
  const pages = new Map<string, string>();
  for (const view of views) {
    if (view.status === "retired") continue;
    const headlineId = catalogModelId(view, today);
    if (headlineId) pages.set(`/models/${view.slug}`, headlineId);
    for (const row of view.rows) {
      if (row.deprecation && row.deprecation <= today) continue;
      const modelId = parseLiteLLMModelId(row.modelString);
      if (!modelId) continue;
      routes.set(row.key, modelId);
      routes.set(row.modelString, modelId);
      // Benchmark providers may namespace an otherwise bare catalog key. Both fields must match exactly.
      if (!row.key.includes("/"))
        routes.set(`${row.provider}/${row.key}`, modelId);
    }
  }
  return models.map((model) => ({
    ...model,
    modelId:
      model.intelligence !== null
        ? pages.get(model.href) ?? null
        : routes.get(model.releaseSlug ?? "") ?? null,
  }));
}

export async function loadDiscoveryBenchmarkData(
  data: BenchmarkData | null,
  views: ModelView[],
  options: {
    fetchFn?: typeof fetch;
    snapshotFile?: string;
    previousSnapshotUrl?: string;
  } = {},
): Promise<DiscoveryBenchmarkCatalog> {
  const now = new Date().toISOString();
  // Other Epoch benchmark CSVs can load successfully while the ECI file is absent or invalid.
  const epochAvailable =
    data !== null &&
    [...data.eci.values()].some(
      ({ score }) => Number.isFinite(score) && score >= 0,
    );
  const epoch = epochDiscoveryModels(epochAvailable ? data : null, views);
  let terminal: TerminalBenchCapture = {
    models: [],
    asOf: null,
    version: TERMINAL_BENCH_VERSION,
    datasetRef: TERMINAL_BENCH_DATASET_REF,
  };
  try {
    terminal = cachedTerminalBench(options.snapshotFile ?? SNAPSHOT);
  } catch {
    /* A first build can start without cached data. */
  }
  let terminalRefreshed = false;
  try {
    terminal = await fetchTerminalBench(options.fetchFn, now);
    terminalRefreshed = true;
  } catch {
    console.warn(
      "seo: Terminal-Bench refresh unavailable; preserving its last capture date.",
    );
  }
  let previous: DiscoveryBenchmarkCatalog | null = null;
  if ((!epochAvailable || !terminalRefreshed) && options.previousSnapshotUrl) {
    try {
      previous = parseDiscoveryBenchmarks(
        await (
          await get(options.previousSnapshotUrl, options.fetchFn ?? fetch)
        ).json(),
      );
      if (
        !terminalRefreshed &&
        previous.terminalBenchVersion === TERMINAL_BENCH_VERSION &&
        previous.terminalBenchAsOf &&
        (!terminal.asOf ||
          Date.parse(previous.terminalBenchAsOf) > Date.parse(terminal.asOf))
      ) {
        const models = previous.models.filter((model) => model.coding !== null);
        if (models.length)
          terminal = { ...terminal, models, asOf: previous.terminalBenchAsOf };
      }
    } catch {
      /* Preserve the bundled capture when the live site is unavailable. */
    }
  }
  const epochModels: DiscoveryBenchmarkModel[] = !epochAvailable
    ? previous?.models.filter((model) => model.intelligence !== null) ?? []
    : epoch.models.map((model) => ({
        slug: `eci-${model.slug}`,
        name: model.name,
        modelId: model.modelId,
        lab: model.lab,
        href: model.href,
        intelligence: model.score,
        coding: null,
        costPerTask: null,
        harness: null,
        setting: null,
        trials: null,
        passed: null,
        totalCost: null,
      }));
  const fetchedAt =
    epochAvailable || terminalRefreshed
      ? now
      : previous?.fetchedAt ?? terminal.asOf;
  return {
    models: withCatalogModelIds([...epochModels, ...terminal.models], views),
    source: "public-feeds",
    asOf: fetchedAt,
    fetchedAt,
    epochAsOf: epochAvailable ? now : previous?.epochAsOf ?? null,
    terminalBenchAsOf: terminal.asOf,
    terminalBenchVersion: terminal.version,
  };
}
