/** Local report: includes gateway model IDs; excludes raw traffic and connection settings. */
export interface BenchmarkRow {
  id: string;
  name: string;
  quality: number | null;
  speed: number | null;
  cost: number | null;
  successCost: number | null;
  attempted: number;
  passed: number;
  failed: number;
  unknown: number;
  interval: [number, number] | null;
}
export interface BenchmarkWorkload {
  id: string;
  name: string;
  baseline: string;
  sample: number;
  population: number;
  sampledSessions: number;
  trafficShare: number;
  agentTurns: boolean;
  criteria: string[];
  calibrated: boolean;
  rows: BenchmarkRow[];
}
export interface BenchmarkReport {
  version: 1;
  synthetic?: boolean;
  createdAt: string;
  periodDays: number;
  seed: number;
  status: "complete" | "partial" | "readiness";
  population: number;
  sampled: number;
  eligible: number;
  development: number;
  heldout: number;
  exclusions: Record<string, number>;
  evaluationSpend: number;
  costEstimated: boolean;
  inventoryComplete: boolean;
  judge: string;
  workloads: BenchmarkWorkload[];
  notices: string[];
}
