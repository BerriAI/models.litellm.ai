export const harnesses = [
  { id: "pi", name: "Pi", mark: "π" },
  { id: "codex", name: "Codex", mark: ">_" },
  { id: "claude-code", name: "Claude Code", mark: "✳" },
  { id: "opencode", name: "OpenCode", mark: "▣" },
  { id: "muse-code", name: "Muse Code", mark: "∞" },
  { id: "kimi-cli", name: "Kimi Code", mark: "K" },
] as const;
export type Harness = (typeof harnesses)[number]["id"];
export type CostBasis = "api" | "total";
export interface BenchmarkCohort {
  id: string;
  label: string;
  dataset: string;
  version: string;
  taskIds: string[];
  repetitions: number;
  scope: "full" | "subset";
  environment: string;
}
export interface BenchmarkRun {
  id: string;
  cohortId: string;
  harness: Harness;
  harnessVersion: string;
  model: string;
  modelName: string;
  provider: string;
  providerName: string;
  status: "queued" | "running" | "complete" | "failed" | "blocked";
  passed: number;
  attempts: number;
  plannedAttempts: number;
  apiCostUsd: number | null;
  computeCostUsd: number | null;
  costSource: "metered" | "estimated" | "unavailable";
  totalSeconds: number | null;
  notes?: string;
}
export interface BenchmarkResults {
  schemaVersion: 1;
  updatedAt: string | null;
  status: "preparing" | "running" | "complete";
  message?: string;
  cohorts: BenchmarkCohort[];
  runs: BenchmarkRun[];
}
export const emptyResults: BenchmarkResults = {
  schemaVersion: 1,
  updatedAt: null,
  status: "preparing",
  cohorts: [],
  runs: [],
};
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const amount = (value: unknown): value is number | null =>
  value === null ||
  (typeof value === "number" && Number.isFinite(value) && value >= 0);
const includes = (options: readonly string[], value: unknown) =>
  typeof value === "string" && options.includes(value);

/** Reject incomplete or contradictory published data before calculating scores. */
export function parseBenchmarkResults(value: unknown): BenchmarkResults {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !includes(["preparing", "running", "complete"], value.status) ||
    !(
      value.updatedAt === null ||
      (text(value.updatedAt) && Number.isFinite(Date.parse(value.updatedAt)))
    ) ||
    !Array.isArray(value.cohorts) ||
    !Array.isArray(value.runs) ||
    !(value.message === undefined || typeof value.message === "string")
  ) {
    throw new Error("Unsupported benchmark results format");
  }
  const cohortIds = new Set<string>();
  for (const cohort of value.cohorts) {
    if (
      !record(cohort) ||
      !text(cohort.id) ||
      cohortIds.has(cohort.id) ||
      ![cohort.label, cohort.dataset, cohort.version, cohort.environment].every(
        text,
      ) ||
      !Array.isArray(cohort.taskIds) ||
      !cohort.taskIds.every(text) ||
      cohort.taskIds.length === 0 ||
      new Set(cohort.taskIds).size !== cohort.taskIds.length ||
      !count(cohort.repetitions) ||
      cohort.repetitions < 1 ||
      !includes(["full", "subset"], cohort.scope)
    ) {
      throw new Error("Invalid benchmark cohort");
    }
    cohortIds.add(cohort.id);
  }
  const runIds = new Set<string>();
  for (const run of value.runs) {
    if (
      !record(run) ||
      !text(run.id) ||
      runIds.has(run.id) ||
      !text(run.cohortId) ||
      !cohortIds.has(run.cohortId) ||
      !includes(
        harnesses.map((h) => h.id),
        run.harness,
      ) ||
      ![
        run.harnessVersion,
        run.model,
        run.modelName,
        run.provider,
        run.providerName,
      ].every(text) ||
      !includes(
        ["queued", "running", "complete", "failed", "blocked"],
        run.status,
      ) ||
      !includes(["metered", "estimated", "unavailable"], run.costSource) ||
      !count(run.passed) ||
      !count(run.attempts) ||
      !count(run.plannedAttempts) ||
      run.plannedAttempts === 0 ||
      run.passed > run.attempts ||
      run.attempts > run.plannedAttempts ||
      !amount(run.apiCostUsd) ||
      !amount(run.computeCostUsd) ||
      !amount(run.totalSeconds) ||
      !(run.notes === undefined || typeof run.notes === "string")
    ) {
      throw new Error("Invalid benchmark run");
    }
    const cohort = value.cohorts.find((item) => item.id === run.cohortId);
    if (
      run.plannedAttempts !== cohort.taskIds.length * cohort.repetitions ||
      (run.status === "complete" && run.attempts !== run.plannedAttempts)
    ) {
      throw new Error("Run does not cover its declared cohort");
    }
    runIds.add(run.id);
  }
  return value as unknown as BenchmarkResults;
}

export function runMetrics(run: BenchmarkRun, basis: CostBasis) {
  const complete =
    run.status === "complete" &&
    run.attempts > 0 &&
    run.attempts === run.plannedAttempts;
  const cost =
    run.costSource === "unavailable" || run.apiCostUsd === null
      ? null
      : basis === "total"
        ? run.computeCostUsd === null
          ? null
          : run.apiCostUsd + run.computeCostUsd
        : run.apiCostUsd;
  return {
    complete,
    quality: complete ? (run.passed / run.attempts) * 100 : null,
    tasksPerDollar:
      complete && cost !== null && cost > 0 ? run.passed / cost : null,
    costPerSuccess:
      complete && cost !== null && run.passed > 0 ? cost / run.passed : null,
    secondsPerTask:
      complete && run.totalSeconds !== null
        ? run.totalSeconds / run.attempts
        : null,
    cost,
  };
}
/** Prefer a completed comparison without combining results across cohorts. */
export function defaultBenchmarkCohort(
  data: BenchmarkResults,
): BenchmarkCohort | undefined {
  let best: BenchmarkCohort | undefined;
  let bestScope = 0;
  let bestCompleted = 0;
  let bestActive = false;
  for (const cohort of data.cohorts) {
    const scope = cohort.taskIds.length * cohort.repetitions;
    const runs = data.runs.filter((run) => run.cohortId === cohort.id);
    const completed = runs.filter(
      (run) => run.plannedAttempts === scope && runMetrics(run, "api").complete,
    ).length;
    if (!completed) continue;
    const active = runs.some(
      (run) => run.status === "running" || run.status === "queued",
    );
    if (
      !best ||
      scope > bestScope ||
      (scope === bestScope && completed > bestCompleted) ||
      (scope === bestScope &&
        completed === bestCompleted &&
        active &&
        !bestActive)
    ) {
      best = cohort;
      bestScope = scope;
      bestCompleted = completed;
      bestActive = active;
    }
  }
  return (
    best ??
    data.cohorts.find((cohort) =>
      data.runs.some(
        (run) =>
          run.cohortId === cohort.id &&
          (run.status === "running" || run.status === "queued"),
      ),
    ) ??
    data.cohorts[0]
  );
}

export const harnessName = (id: Harness) =>
  harnesses.find((h) => h.id === id)!.name;

/** Illustrative layout preview only; never mixed with measured results. */
export const previewResults: BenchmarkResults = {
  schemaVersion: 1,
  updatedAt: null,
  status: "complete",
  cohorts: [
    {
      id: "design-preview",
      label: "Illustrative comparison",
      dataset: "Design preview",
      version: "—",
      taskIds: Array.from({ length: 100 }, (_, i) => `illustrative-${i}`),
      repetitions: 1,
      scope: "subset",
      environment: "Illustrative only",
    },
  ],
  runs: [
    ["pi", "kimi-k3", "Kimi K3", "moonshot", "Moonshot AI", 68, 48, 39000],
    ["codex", "gpt-6.1-sol", "GPT-6.1 Sol", "openai", "OpenAI", 76, 98, 31000],
    [
      "claude-code",
      "claude-sonnet-5-5",
      "Claude Sonnet 5.5",
      "anthropic",
      "Anthropic",
      79,
      125,
      46000,
    ],
    [
      "opencode",
      "kimi-k3",
      "Kimi K3",
      "moonshot",
      "Moonshot AI",
      64,
      51,
      42000,
    ],
    [
      "muse-code",
      "muse-wonder-1.0",
      "Muse Wonder 1.0",
      "meta",
      "Meta",
      73,
      86,
      35000,
    ],
    [
      "kimi-cli",
      "kimi-k3",
      "Kimi K3",
      "moonshot",
      "Moonshot AI",
      74,
      60,
      36000,
    ],
    [
      "pi",
      "claude-sonnet-5-5",
      "Claude Sonnet 5.5",
      "anthropic",
      "Anthropic",
      70,
      106,
      38000,
    ],
    [
      "opencode",
      "gpt-6.1-sol",
      "GPT-6.1 Sol",
      "openai",
      "OpenAI",
      72,
      94,
      33000,
    ],
  ].map((row, index) => ({
    id: `preview-${index}`,
    cohortId: "design-preview",
    harness: row[0] as Harness,
    harnessVersion: "Illustrative",
    model: row[1] as string,
    modelName: row[2] as string,
    provider: row[3] as string,
    providerName: row[4] as string,
    status: "complete",
    passed: row[5] as number,
    attempts: 100,
    plannedAttempts: 100,
    apiCostUsd: row[6] as number,
    computeCostUsd: 12,
    costSource: "estimated",
    totalSeconds: row[7] as number,
    notes:
      "Synthetic design preview. Neither scores nor harness compatibility have been measured.",
  })),
};
