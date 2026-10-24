/** Public benchmark feeds. Composite capability scores and success rates keep their own scales. */
export const EPOCH_URL = "https://epoch.ai/eci";
export const TERMINAL_BENCH_URL = "https://www.tbench.ai/?version=4";
export const VALUE_QUALITY_FRACTION = 0.8;
export type QualityBenchmarkId = "overall" | "coding";
export type DiscoveryBenchmarkModel = {
  slug: string;
  name: string;
  lab: string | null;
  href: string;
  releaseSlug?: string;
  intelligence: number | null;
  coding: number | null;
  costPerTask: number | null;
  harness: string | null;
  setting: string | null;
  trials: number | null;
  passed: number | null;
  totalCost: number | null;
};
export type DiscoveryBenchmarkCatalog = {
  models: DiscoveryBenchmarkModel[];
  asOf: string | null;
  fetchedAt: string | null;
  epochAsOf: string | null;
  terminalBenchAsOf: string | null;
  terminalBenchVersion: string | null;
  source: "public-feeds";
};
export type QualityRanking = {
  model: DiscoveryBenchmarkModel;
  score: number;
  sourceUrl: string;
};
export type ValueRanking = QualityRanking & {
  costPerTask: number;
  solvedPerDollar: number;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function nonnegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
const slugPattern = /^[a-z0-9][a-z0-9._-]*$/;
const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const timestamp = (value: unknown) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z)?$/.test(value) &&
  Number.isFinite(Date.parse(value))
    ? value
    : null;
function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/^\/models\/[a-z0-9][a-z0-9._-]*$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      [
        "epoch.ai",
        "www.tbench.ai",
        "hub.harborframework.com",
        "github.com",
      ].includes(url.hostname) &&
      !url.username &&
      !url.password
    )
      return value;
  } catch {
    /* Invalid source link. */
  }
  return null;
}
function parseModel(value: unknown): DiscoveryBenchmarkModel | null {
  if (
    !isRecord(value) ||
    typeof value.slug !== "string" ||
    !slugPattern.test(value.slug)
  )
    return null;
  const name = text(value.name),
    href = safeHref(value.href);
  if (!name || !href) return null;
  const coding = nonnegative(value.coding);
  const trials = nonnegative(value.trials),
    passed = nonnegative(value.passed),
    totalCost = nonnegative(value.totalCost);
  const validCounts =
    trials !== null &&
    trials > 0 &&
    Number.isInteger(trials) &&
    passed !== null &&
    Number.isInteger(passed) &&
    passed <= trials;

  return {
    slug: value.slug,
    name,
    lab: text(value.lab),
    href,
    ...(text(value.releaseSlug)
      ? { releaseSlug: text(value.releaseSlug)! }
      : {}),
    intelligence: nonnegative(value.intelligence),
    coding: validCounts
      ? passed! / trials!
      : coding !== null && coding <= 1
        ? coding
        : null,
    // Value must derive from the same reported run, never a separately supplied cost estimate.
    costPerTask:
      validCounts && totalCost !== null && totalCost > 0
        ? totalCost / trials!
        : null,
    harness: text(value.harness),
    setting: text(value.setting),
    trials: validCounts ? trials : null,
    passed: validCounts ? passed : null,
    totalCost,
  };
}
export function parseDiscoveryBenchmarks(
  data: unknown,
): DiscoveryBenchmarkCatalog {
  if (
    !isRecord(data) ||
    !Array.isArray(data.models) ||
    data.source !== "public-feeds"
  )
    throw new Error("Benchmark results are unavailable.");
  const seen = new Set<string>();
  const models = data.models
    .map(parseModel)
    .filter((model): model is DiscoveryBenchmarkModel => {
      if (!model || seen.has(model.slug)) return false;
      seen.add(model.slug);
      return true;
    });
  return {
    models,
    source: "public-feeds",
    asOf: timestamp(data.asOf),
    fetchedAt: timestamp(data.fetchedAt),
    epochAsOf: timestamp(data.epochAsOf),
    terminalBenchAsOf: timestamp(data.terminalBenchAsOf),
    terminalBenchVersion: text(data.terminalBenchVersion),
  };
}
export async function loadDiscoveryBenchmarks(
  fetchFn: typeof fetch = fetch,
): Promise<DiscoveryBenchmarkCatalog> {
  const response = await fetchFn("/discovery/benchmarks.json", {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Benchmark results are unavailable.");
  return parseDiscoveryBenchmarks(await response.json());
}
function oneConfigurationPerRelease<
  T extends { model: DiscoveryBenchmarkModel },
>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter(({ model }) => {
    const id = model.releaseSlug ?? model.slug;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
export function rankQuality(
  models: DiscoveryBenchmarkModel[],
  id: QualityBenchmarkId,
): QualityRanking[] {
  return oneConfigurationPerRelease(
    models
      .flatMap((model): QualityRanking[] => {
        const score = id === "overall" ? model.intelligence : model.coding;
        return score === null
          ? []
          : [
              {
                model,
                score,
                sourceUrl: id === "overall" ? EPOCH_URL : model.href,
              },
            ];
      })
      .sort(
        (a, b) => b.score - a.score || a.model.name.localeCompare(b.model.name),
      ),
  );
}
export function qualityFloor(models: DiscoveryBenchmarkModel[]): number | null {
  const scores = models.flatMap((model) =>
    model.coding === null ? [] : [model.coding],
  );
  return scores.length ? Math.max(...scores) * VALUE_QUALITY_FRACTION : null;
}
/** Successful trials / source-reported USD, with a coding success floor. Cost coverage is not reported. */
export function rankValue(models: DiscoveryBenchmarkModel[]): ValueRanking[] {
  const floor = qualityFloor(models);
  if (floor === null) return [];
  return oneConfigurationPerRelease(
    models
      .flatMap((model): ValueRanking[] => {
        if (
          model.coding === null ||
          model.coding <= 0 ||
          model.coding < floor ||
          model.costPerTask === null ||
          model.costPerTask <= 0
        )
          return [];
        const solvedPerDollar = model.coding / model.costPerTask;
        return Number.isFinite(solvedPerDollar)
          ? [
              {
                model,
                score: model.coding,
                costPerTask: model.costPerTask,
                solvedPerDollar,
                sourceUrl: model.href,
              },
            ]
          : [];
      })
      .sort(
        (a, b) =>
          b.solvedPerDollar - a.solvedPerDollar ||
          b.score - a.score ||
          a.model.name.localeCompare(b.model.name),
      ),
  );
}
