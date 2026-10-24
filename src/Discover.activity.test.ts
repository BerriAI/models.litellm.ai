// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import Discover from "./Discover.svelte";
import {
  harnessName,
  type BenchmarkResults,
  type BenchmarkRun,
} from "./codingBenchmarks";

vi.mock("svelte", () =>
  vi.importActual<typeof import("svelte")>("svelte/internal"),
);

const note =
  "Concurrency limit exceeded during this run; excluded from quality, cost-efficiency and speed comparisons.";
const baseRun: BenchmarkRun = {
  id: "fixture",
  cohortId: "test-cohort",
  harness: "kimi-cli",
  harnessVersion: "2.3.1",
  model: "test-model",
  modelName: "Test model",
  provider: "moonshot",
  providerName: "Moonshot",
  status: "failed",
  passed: 0,
  attempts: 0,
  plannedAttempts: 1,
  apiCostUsd: null,
  computeCostUsd: null,
  costSource: "unavailable",
  totalSeconds: null,
  notes: note,
};
const fixture: BenchmarkResults = {
  schemaVersion: 1,
  updatedAt: "2026-01-01T00:00:00Z",
  status: "running",
  cohorts: [
    {
      id: "test-cohort",
      label: "Test cohort",
      dataset: "Test dataset",
      version: "1.0",
      taskIds: ["test-task"],
      repetitions: 1,
      scope: "subset",
      environment: "Test",
    },
  ],
  runs: [
    ...Array.from({ length: 25 }, (_, index) => ({
      ...baseRun,
      id: `fixture-${index}`,
      status: (["failed", "running", "queued", "blocked"] as const)[index % 4],
    })),
    {
      ...baseRun,
      id: "completed",
      status: "complete",
      passed: 1,
      attempts: 1,
      apiCostUsd: 1,
      costSource: "estimated",
      totalSeconds: 60,
      notes: "Completed fixture",
    },
  ],
};
let component: Discover;
const activityButton = () =>
  document.getElementById("run-activity-toggle") as HTMLButtonElement;
const activityList = () =>
  document.getElementById("run-activity-list") as HTMLDivElement;
const detailsButtons = () =>
  Array.from(activityList().getElementsByTagName("button"));

beforeEach(async () => {
  document.body.innerHTML = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(fixture))),
  );
  component = new Discover({ target: document.body });
  await vi.waitFor(() => expect(activityButton()).not.toBeNull());
});
afterEach(() => {
  component.$destroy();
  vi.unstubAllGlobals();
});

describe("coding benchmark run activity", () => {
  it("should start collapsed with status counts and no repeated notes or run rows", () => {
    expect(activityButton().getAttribute("aria-expanded")).toBe("false");
    expect(activityButton().getAttribute("aria-controls")).toBe(
      activityList().id,
    );
    expect(activityList().hidden).toBe(true);
    expect(detailsButtons()).toHaveLength(0);
    expect(activityButton().textContent).toContain("25");
    for (const count of ["6 running", "6 queued", "6 blocked", "7 failed"]) {
      expect(activityButton().textContent).toContain(count);
    }
    expect(document.body.textContent).not.toContain(note);
  });

  it("should reveal concise rows with provider logos and visible exclusion status", async () => {
    activityButton().click();
    await tick();
    expect(activityButton().getAttribute("aria-expanded")).toBe("true");
    expect(activityList().hidden).toBe(false);
    expect(activityList().textContent).toContain(
      "These runs are excluded from comparisons",
    );
    expect(activityList().textContent).toContain("Failed · excluded");
    expect(activityList().getElementsByTagName("img")).toHaveLength(25);
    expect(
      Array.from(activityList().getElementsByTagName("img")).every(
        (img) => img.alt === "Moonshot" && img.getAttribute("src"),
      ),
    ).toBe(true);
    expect(detailsButtons()).toHaveLength(25);
    expect(document.body.textContent).not.toContain(note);
  });

  it("should expose one run's full evidence only on intentional accessible disclosure", async () => {
    activityButton().click();
    await tick();
    const [first, second] = detailsButtons();
    expect(first.getAttribute("aria-label")).toContain(
      "Kimi Code, Test model, run 1",
    );
    first.focus();
    first.click();
    await tick();
    const firstPanel = document.getElementById(
      first.getAttribute("aria-controls")!,
    )!;
    expect(first.getAttribute("aria-expanded")).toBe("true");
    expect(firstPanel.hidden).toBe(false);
    expect(firstPanel.textContent).toContain(note);
    expect(firstPanel.textContent).toContain("Unavailable");
    expect(firstPanel.textContent).toContain("2.3.1");
    expect(document.activeElement).toBe(first);
    second.click();
    await tick();
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(firstPanel.hidden).toBe(true);
    expect(firstPanel.textContent).toBe("");
    expect(second.getAttribute("aria-expanded")).toBe("true");
    activityButton().focus();
    activityButton().click();
    await tick();
    expect(activityList().hidden).toBe(true);
    expect(document.activeElement).toBe(activityButton());
    expect(document.body.textContent).not.toContain(note);
  });

  it("should label native Kimi Code consistently and distinguish agent time from full wall time", () => {
    expect(harnessName("kimi-cli")).toBe("Kimi Code");
    expect(document.body.textContent).toContain(
      "Mean agent time · all attempts",
    );
    expect(document.body.textContent).toContain(
      "Setup and verification are excluded",
    );
    expect(document.body.textContent).not.toContain("Mean wall time");
    expect(document.body.textContent).not.toContain("Kimi CLI");
  });
});
