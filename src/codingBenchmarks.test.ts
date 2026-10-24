import { describe, expect, it } from "vitest";
import {
  defaultBenchmarkCohort,
  emptyResults,
  parseBenchmarkResults,
  previewResults,
  runMetrics,
  type BenchmarkRun,
  type BenchmarkCohort,
  type BenchmarkResults,
} from "./codingBenchmarks";
const measuredRun = (override: Partial<BenchmarkRun> = {}): BenchmarkRun => ({
  id: "run",
  cohortId: "test",
  harness: "pi",
  harnessVersion: "1.0",
  model: "model",
  modelName: "Model",
  provider: "openai",
  providerName: "OpenAI",
  status: "complete",
  passed: 6,
  attempts: 10,
  plannedAttempts: 10,
  apiCostUsd: 12,
  computeCostUsd: 3,
  costSource: "metered",
  totalSeconds: 600,
  ...override,
});
describe("coding benchmark comparisons", () => {
  it("should calculate value from every attempt's spend, including failed attempts", () => {
    const result = runMetrics(measuredRun(), "api");
    expect(result.quality).toBe(60);
    expect(result.tasksPerDollar).toBe(0.5);
    expect(result.costPerSuccess).toBe(2);
    expect(result.secondsPerTask).toBe(60);
  });
  it("should include compute only when the requested basis is fully recorded", () => {
    expect(runMetrics(measuredRun(), "total").tasksPerDollar).toBe(0.4);
    expect(
      runMetrics(measuredRun({ computeCostUsd: null }), "total").tasksPerDollar,
    ).toBeNull();
    expect(
      runMetrics(measuredRun({ computeCostUsd: null }), "api").tasksPerDollar,
    ).toBe(0.5);
  });
  it("should exclude incomplete runs from every chart", () => {
    const result = runMetrics(
      measuredRun({ status: "running", attempts: 6 }),
      "api",
    );
    expect(result.quality).toBeNull();
    expect(result.tasksPerDollar).toBeNull();
    expect(result.secondsPerTask).toBeNull();
  });
  it("should not interpret zero or missing API prices as infinite value", () => {
    for (const apiCostUsd of [0, null])
      expect(
        runMetrics(measuredRun({ apiCostUsd }), "api").tasksPerDollar,
      ).toBeNull();
    expect(
      runMetrics(measuredRun({ costSource: "unavailable" }), "api")
        .tasksPerDollar,
    ).toBeNull();
  });
  it("should keep zero successes as zero value with undefined cost per success", () => {
    const result = runMetrics(measuredRun({ passed: 0 }), "api");
    expect(result.tasksPerDollar).toBe(0);
    expect(result.costPerSuccess).toBeNull();
  });
});
describe("published result validation", () => {
  it("should accept a complete coherent result manifest", () => {
    expect(parseBenchmarkResults(previewResults).runs.length).toBe(8);
  });
  it("should reject comparing a partial task set as a completed cohort", () => {
    const value = structuredClone(previewResults);
    value.runs[0].attempts = 99;
    expect(() => parseBenchmarkResults(value)).toThrow("Run does not cover");
  });
  it("should reject a run with a different planned task count from its cohort", () => {
    const value = structuredClone(previewResults);
    value.runs[0].plannedAttempts = 101;
    expect(() => parseBenchmarkResults(value)).toThrow("Run does not cover");
  });
  it("should reject negative costs, impossible pass counts and duplicate identities", () => {
    for (const override of [
      { apiCostUsd: -1 },
      { passed: 101 },
      { id: "preview-1" },
    ]) {
      const value = structuredClone(previewResults);
      Object.assign(value.runs[0], override);
      expect(() => parseBenchmarkResults(value)).toThrow(
        "Invalid benchmark run",
      );
    }
  });
  it("should reject duplicate tasks and unknown cohorts", () => {
    const value = structuredClone(previewResults);
    value.cohorts[0].taskIds[1] = value.cohorts[0].taskIds[0];
    expect(() => parseBenchmarkResults(value)).toThrow(
      "Invalid benchmark cohort",
    );
    const other = structuredClone(previewResults);
    other.runs[0].cohortId = "another-task-set";
    expect(() => parseBenchmarkResults(other)).toThrow("Invalid benchmark run");
  });
});

const cohortFixture = (
  id: string,
  tasks = 1,
  repetitions = 1,
): BenchmarkCohort => ({
  id,
  label: id,
  dataset: "Fixture",
  version: "1",
  taskIds: Array.from({ length: tasks }, (_, index) => `task-${index}`),
  repetitions,
  scope: "subset",
  environment: "Fixture",
});
const cohortRun = (
  cohort: BenchmarkCohort,
  override: Partial<BenchmarkRun> = {},
): BenchmarkRun =>
  measuredRun({
    id: cohort.id,
    cohortId: cohort.id,
    attempts: cohort.taskIds.length * cohort.repetitions,
    plannedAttempts: cohort.taskIds.length * cohort.repetitions,
    passed: 0,
    ...override,
  });
const cohortResults = (
  cohorts: BenchmarkCohort[],
  runs: BenchmarkRun[] = [],
): BenchmarkResults => ({ ...emptyResults, cohorts, runs });

describe("default benchmark cohort", () => {
  it("should open the largest completed scope instead of retired or running cohorts", () => {
    const retired = cohortFixture("retired", 20);
    const active = cohortFixture("active", 20);
    const pilot = cohortFixture("pilot", 6);
    const repeated = cohortFixture("repeated", 4, 2);
    const data = parseBenchmarkResults(
      cohortResults(
        [retired, active, pilot, repeated],
        [
          cohortRun(retired, { status: "failed" }),
          cohortRun(active, { status: "running", attempts: 1 }),
          cohortRun(pilot),
          cohortRun(repeated),
        ],
      ),
    );
    expect(defaultBenchmarkCohort(data)?.id).toBe("repeated");
  });

  it("should prefer more completed stacks when scope ties, regardless of hash IDs", () => {
    const first = cohortFixture("tb4-local-000aaa", 6);
    const broader = cohortFixture("tb4-local-fff999", 3, 2);
    const data = cohortResults(
      [first, broader],
      [
        cohortRun(first),
        cohortRun(broader),
        cohortRun(broader, { id: "second-stack", harness: "codex" }),
      ],
    );
    const before = structuredClone(data);
    expect(defaultBenchmarkCohort(data)?.id).toBe(broader.id);
    expect(data).toEqual(before);
  });

  it("should prefer active work only when scope and completed stack coverage tie", () => {
    const quiet = cohortFixture("tb4-local-000aaa", 6);
    const active = cohortFixture("tb4-local-fff999", 6);
    for (const status of ["running", "queued"] as const) {
      const data = cohortResults(
        [quiet, active],
        [
          cohortRun(quiet),
          cohortRun(active),
          cohortRun(active, { id: "active-stack", status, attempts: 0 }),
        ],
      );
      expect(defaultBenchmarkCohort(data)?.id).toBe(active.id);
      data.runs.push(
        cohortRun(quiet, { id: "second-completed-stack", harness: "codex" }),
      );
      expect(defaultBenchmarkCohort(data)?.id).toBe(quiet.id);
    }
  });

  it("should keep feed order for equal scope, completed coverage and activity", () => {
    const first = cohortFixture("tb4-local-fff999", 6);
    const second = cohortFixture("tb4-local-000aaa", 6);
    const data = cohortResults(
      [first, second],
      [cohortRun(first), cohortRun(second)],
    );
    expect(defaultBenchmarkCohort(data)?.id).toBe(first.id);
    expect(
      defaultBenchmarkCohort({ ...data, cohorts: [second, first] })?.id,
    ).toBe(second.id);
  });

  it("should exclude partial, blocked and failed rows from completed scope selection", () => {
    const selected = cohortFixture("selected");
    const excluded = cohortFixture("excluded", 20);
    for (const override of [
      { attempts: 1 },
      { status: "blocked" as const },
      { status: "failed" as const },
      { plannedAttempts: 10, attempts: 10 },
    ]) {
      expect(
        defaultBenchmarkCohort(
          cohortResults(
            [excluded, selected],
            [cohortRun(excluded, override), cohortRun(selected)],
          ),
        )?.id,
      ).toBe("selected");
    }
  });

  it("should keep completed zero-success or unknown-cost results eligible for display", () => {
    const completed = cohortFixture("complete", 6);
    const active = cohortFixture("active", 20);
    const data = parseBenchmarkResults(
      cohortResults(
        [active, completed],
        [
          cohortRun(active, { status: "running", attempts: 0 }),
          cohortRun(completed, { apiCostUsd: null, costSource: "unavailable" }),
        ],
      ),
    );
    expect(defaultBenchmarkCohort(data)?.id).toBe("complete");
  });

  it("should fall back to an active cohort when no completed comparison exists", () => {
    const retired = cohortFixture("retired");
    const active = cohortFixture("active");
    for (const status of ["running", "queued"] as const) {
      expect(
        defaultBenchmarkCohort(
          cohortResults(
            [retired, active],
            [
              cohortRun(retired, { status: "failed" }),
              cohortRun(active, { status, attempts: 0 }),
            ],
          ),
        )?.id,
      ).toBe("active");
    }
  });

  it("should retain the first cohort without active evidence and handle an empty feed", () => {
    const first = cohortFixture("first");
    expect(
      defaultBenchmarkCohort(cohortResults([first, cohortFixture("second")])),
    ).toBe(first);
    expect(defaultBenchmarkCohort(emptyResults)).toBeUndefined();
  });
});
