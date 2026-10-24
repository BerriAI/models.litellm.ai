/** Discovery rankings use published evaluations, never token prices as a proxy for task costs. */
export const QUALITY_BENCHMARKS = [
  {
    id: "overall",
    label: "Overall",
    benchmark: "Epoch Capabilities Index",
    url: "https://epoch.ai/eci",
  },
  {
    id: "coding",
    label: "Coding",
    benchmark: "DeepSWE",
    url: "https://deepswe.datacurve.ai/",
  },
  {
    id: "reasoning",
    label: "Reasoning",
    benchmark: "GPQA Diamond",
    url: "https://epoch.ai/benchmarks/gpqa-diamond",
  },
  {
    id: "math",
    label: "Math",
    benchmark: "FrontierMath (tiers 1-3)",
    url: "https://epoch.ai/benchmarks/frontiermath-tiers-1-3-v2",
  },
] as const;

export const VALUE_BENCHMARKS = [
  {
    id: "coding",
    label: "Coding",
    benchmark: "DeepSWE",
    url: "https://deepswe.datacurve.ai/",
  },
  {
    id: "reasoning",
    label: "Reasoning",
    benchmark: "ARC-AGI-2",
    url: "https://arcprize.org/leaderboard",
  },
] as const;

export type QualityBenchmarkId = (typeof QUALITY_BENCHMARKS)[number]["id"];
export type ValueBenchmarkId = (typeof VALUE_BENCHMARKS)[number]["id"];
export type DiscoveryBenchmarkScore = {
  benchmark: string;
  score: number;
  setting: string | null;
  date: string | null;
  sourceUrl: string;
};
export type DiscoveryValueRun = DiscoveryBenchmarkScore & {
  costPerTask: number;
  modelVersion: string | null;
  harness: string | null;
};
export type DiscoveryBenchmarkModel = {
  slug: string;
  name: string;
  lab: string | null;
  href: string;
  inputPrice: number;
  outputPrice: number;
  provider: string;
  eci: { score: number; date: string | null } | null;
  scores: DiscoveryBenchmarkScore[];
  valueRuns: DiscoveryValueRun[];
};
export type DiscoveryBenchmarkCatalog = {
  models: DiscoveryBenchmarkModel[];
  asOf: string | null;
};
export type QualityRanking = {
  model: DiscoveryBenchmarkModel;
  score: number;
  setting: string | null;
  date: string | null;
  sourceUrl: string;
};
export type ValueRanking = QualityRanking & {
  costPerTask: number;
  solvedPerDollar: number;
  modelVersion: string | null;
  harness: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function date(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function score(value: unknown): DiscoveryBenchmarkScore | null {
  if (!isRecord(value) || !nonnegative(value.score) || value.score > 1)
    return null;
  const source = [...QUALITY_BENCHMARKS, ...VALUE_BENCHMARKS].find(
    (b) => b.benchmark === value.benchmark,
  );
  if (!source || source.id === "overall") return null;
  return {
    benchmark: source.benchmark,
    score: value.score,
    setting: typeof value.setting === "string" ? value.setting : null,
    date: date(value.date),
    // URLs come from the supported benchmark definitions, never an untrusted payload URL.
    sourceUrl: source.url,
  };
}

function legacyScores(
  value: unknown,
): Pick<DiscoveryBenchmarkModel, "eci" | "scores"> {
  const result: Pick<DiscoveryBenchmarkModel, "eci" | "scores"> = {
    eci: null,
    scores: [],
  };
  if (!isRecord(value)) return result;
  for (const b of QUALITY_BENCHMARKS) {
    const raw = value[b.benchmark];
    if (typeof raw !== "string") continue;
    if (b.id === "overall") {
      if (/^\d+(?:\.\d+)?$/.test(raw) && Number.isFinite(Number(raw)))
        result.eci = { score: Number(raw), date: null };
      continue;
    }
    const match = /^(\d+(?:\.\d+)?)%(?: \(([^)]+)\))?$/.exec(raw);
    if (!match) continue;
    const parsed = score({
      benchmark: b.benchmark,
      score: Number(match[1]) / 100,
      setting: match[2],
    });
    if (parsed) result.scores.push(parsed);
  }
  return result;
}

function parseModel(
  slug: string,
  value: unknown,
): DiscoveryBenchmarkModel | null {
  if (
    !/^[a-z0-9][a-z0-9._-]*$/.test(slug) ||
    !isRecord(value) ||
    typeof value.n !== "string" ||
    !value.n.trim() ||
    !nonnegative(value.in) ||
    !nonnegative(value.out)
  )
    return null;
  let eci: DiscoveryBenchmarkModel["eci"] = null;
  let scores: DiscoveryBenchmarkScore[] = [];
  const valueRuns: DiscoveryValueRun[] = [];
  if (isRecord(value.benchmarks)) {
    const benchmarks = value.benchmarks;
    if (isRecord(benchmarks.eci) && nonnegative(benchmarks.eci.score))
      eci = { score: benchmarks.eci.score, date: date(benchmarks.eci.date) };
    scores = (Array.isArray(benchmarks.scores) ? benchmarks.scores : [])
      .map(score)
      .filter((s): s is DiscoveryBenchmarkScore => s !== null);
    for (const run of Array.isArray(benchmarks.valueRuns)
      ? benchmarks.valueRuns
      : []) {
      const parsed = score(run);
      if (
        !parsed ||
        !isRecord(run) ||
        !VALUE_BENCHMARKS.some((b) => b.benchmark === parsed.benchmark) ||
        !nonnegative(run.costPerTask) ||
        run.costPerTask === 0
      )
        continue;
      valueRuns.push({
        ...parsed,
        costPerTask: run.costPerTask,
        modelVersion:
          typeof run.modelVersion === "string" ? run.modelVersion : null,
        harness: typeof run.harness === "string" ? run.harness : null,
      });
    }
  } else {
    // Older production catalogs have rounded score strings but no measured task costs.
    ({ eci, scores } = legacyScores(value.b));
  }
  return {
    slug,
    name: value.n,
    lab: typeof value.lab === "string" ? value.lab : null,
    href: `/models/${slug}`,
    inputPrice: value.in,
    outputPrice: value.out,
    provider: typeof value.by === "string" ? value.by : "",
    eci,
    scores,
    valueRuns,
  };
}

export async function loadDiscoveryBenchmarks(
  fetchFn: typeof fetch = fetch,
): Promise<DiscoveryBenchmarkCatalog> {
  const response = await fetchFn("/compare/models.json");
  if (!response.ok) throw new Error("Benchmark results are unavailable.");
  const data: unknown = await response.json();
  if (!isRecord(data) || !isRecord(data.models))
    throw new Error("Benchmark results are unavailable.");
  const models = Object.entries(data.models)
    .map(([slug, value]) => parseModel(slug, value))
    .filter((m): m is DiscoveryBenchmarkModel => m !== null);
  return { models, asOf: typeof data.asOf === "string" ? data.asOf : null };
}

export function rankQuality(
  models: DiscoveryBenchmarkModel[],
  id: QualityBenchmarkId,
): QualityRanking[] {
  const benchmark = QUALITY_BENCHMARKS.find((b) => b.id === id)!;
  return models
    .flatMap((model): QualityRanking[] => {
      if (id === "overall")
        return model.eci
          ? [{ model, ...model.eci, setting: null, sourceUrl: benchmark.url }]
          : [];
      const result = model.scores
        .filter((s) => s.benchmark === benchmark.benchmark)
        .sort((a, b) => b.score - a.score)[0];
      return result
        ? [
            {
              model,
              score: result.score,
              setting: result.setting,
              date: result.date,
              sourceUrl: result.sourceUrl,
            },
          ]
        : [];
    })
    .sort(
      (a, b) => b.score - a.score || a.model.name.localeCompare(b.model.name),
    );
}

/** Success fraction / mean USD per attempt, from the same benchmark and reasoning configuration. */
export function rankValue(
  models: DiscoveryBenchmarkModel[],
  id: ValueBenchmarkId,
  minScore = 0,
): ValueRanking[] {
  const benchmark = VALUE_BENCHMARKS.find((b) => b.id === id)!;
  return models
    .flatMap((model): ValueRanking[] => {
      const runs = model.valueRuns
        .filter(
          (r) =>
            r.benchmark === benchmark.benchmark &&
            r.score > 0 &&
            r.score >= minScore &&
            r.costPerTask > 0,
        )
        .map((run) => ({
          model,
          score: run.score,
          setting: run.setting,
          date: run.date,
          sourceUrl: run.sourceUrl,
          costPerTask: run.costPerTask,
          solvedPerDollar: run.score / run.costPerTask,
          modelVersion: run.modelVersion,
          harness: run.harness,
        }))
        .filter((run) => Number.isFinite(run.solvedPerDollar))
        .sort(
          (a, b) => b.solvedPerDollar - a.solvedPerDollar || b.score - a.score,
        );
      return runs.slice(0, 1);
    })
    .sort(
      (a, b) =>
        b.solvedPerDollar - a.solvedPerDollar ||
        b.score - a.score ||
        a.model.name.localeCompare(b.model.name),
    );
}
