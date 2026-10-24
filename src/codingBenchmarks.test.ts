import { describe, expect, it } from "vitest";
import {
  parseBenchmarkResults,
  previewResults,
  runMetrics,
  type BenchmarkRun,
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
