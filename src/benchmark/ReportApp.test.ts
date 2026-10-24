// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import Discover from "../BenchmarkWorkspace.svelte";
import type { BenchmarkReport } from "./types";
let component: Discover;
afterEach(() => {
  component?.$destroy();
  document.body.innerHTML = "";
});
const report = (): BenchmarkReport => ({
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  periodDays: 7,
  seed: 42,
  status: "readiness",
  population: 3,
  sampled: 3,
  eligible: 0,
  development: 0,
  heldout: 0,
  exclusions: { "Missing request body": 3 },
  evaluationSpend: 0,
  costEstimated: false,
  inventoryComplete: true,
  judge: "Example judge",
  workloads: [],
  notices: [],
});
it("renders readiness without falling back to demo charts", () => {
  component = new Discover({
    target: document.body,
    props: { report: report(), reportIcon: "data:image/svg+xml,<svg/>" },
  });
  expect(document.querySelector(".charts")).toBeNull();
  expect(document.body.textContent).toContain("No evaluable requests");
  expect(document.body.textContent).toContain("Missing request body");
});
it("renders gateway-provided model names as inert text", () => {
  const r = report();
  r.judge = '<img data-model-injection="true" src=x>';
  component = new Discover({
    target: document.body,
    props: { report: r, reportIcon: "data:image/svg+xml,<svg/>" },
  });
  expect(document.body.textContent).toContain(r.judge);
  expect(document.querySelector("[data-model-injection]")).toBeNull();
});
it("keeps zero-cost baselines finite and unavailable metrics explicit", () => {
  const r = report();
  r.status = "complete";
  r.workloads = [
    {
      id: "example",
      name: "Example workload",
      baseline: "baseline",
      sample: 1,
      population: 1,
      sampledSessions: 1,
      trafficShare: 100,
      agentTurns: false,
      criteria: [],
      calibrated: true,
      rows: [
        {
          id: "baseline",
          name: "Current",
          quality: 100,
          speed: 1,
          cost: 0,
          successCost: 0,
          attempted: 1,
          passed: 1,
          failed: 0,
          unknown: 0,
          interval: [20, 100],
        },
        {
          id: "candidate-1",
          name: "Candidate 1",
          quality: 100,
          speed: null,
          cost: 0.01,
          successCost: 0.01,
          attempted: 1,
          passed: 1,
          failed: 0,
          unknown: 0,
          interval: [20, 100],
        },
      ],
    },
  ];
  component = new Discover({
    target: document.body,
    props: { report: r, reportIcon: "data:image/svg+xml,<svg/>" },
  });
  expect(document.body.textContent).not.toMatch(/Infinity|NaN/);
  expect(document.body.textContent).toContain("Baseline recorded cost is $0");
  expect(document.body.textContent).toContain("Not measured");
});
