import type { BenchmarkReport, BenchmarkRow } from "./types";

// Fictional data for the public sample page. Never fetched from a gateway.
const row = (
  id: string,
  name: string,
  passed: number,
  speed: number,
  cost: number,
): BenchmarkRow => ({
  id,
  name,
  passed,
  speed,
  cost,
  attempted: 40,
  failed: 40 - passed,
  unknown: 0,
  quality: (passed / 40) * 100,
  successCost: cost / (passed / 40),
  interval: null,
});

export const sampleReport: BenchmarkReport = {
  version: 1,
  synthetic: true,
  createdAt: "2026-01-01T00:00:00Z",
  periodDays: 7,
  seed: 42,
  status: "complete",
  population: 10000,
  sampled: 100,
  eligible: 100,
  development: 20,
  heldout: 80,
  exclusions: {},
  evaluationSpend: 1.2,
  costEstimated: true,
  inventoryComplete: true,
  judge: "example-judge",
  workloads: [
    {
      id: "extract",
      name: "Data extraction",
      baseline: "baseline",
      sample: 40,
      population: 6000,
      sampledSessions: 50,
      trafficShare: 60,
      agentTurns: false,
      criteria: [
        "Follow the requested JSON format",
        "Ground extracted values in the supplied text",
      ],
      calibrated: true,
      rows: [
        row("baseline", "Current · example-current", 38, 2.8, 0.02),
        row("candidate-1", "example-efficient", 39, 1.6, 0.004),
        row("candidate-2", "example-fast", 36, 0.8, 0.002),
      ],
    },
    {
      id: "support",
      name: "Support answers",
      baseline: "baseline",
      sample: 40,
      population: 4000,
      sampledSessions: 50,
      trafficShare: 40,
      agentTurns: false,
      criteria: [
        "Answer the user's question",
        "Use only the supplied support policy",
      ],
      calibrated: true,
      rows: [
        row("baseline", "Current · example-current", 39, 3.2, 0.03),
        row("candidate-1", "example-efficient", 36, 1.9, 0.006),
        row("candidate-2", "example-fast", 34, 1.1, 0.003),
      ],
    },
  ],
  notices: [
    "All models, traffic, costs, and scores on this page are fictional. These are not benchmark results or model recommendations.",
    "Your local report uses the actual model names from your gateway. Sharing it includes those names and aggregate usage metrics.",
    "Confirm any candidate routing policy on a fresh sample before deployment.",
  ],
};
