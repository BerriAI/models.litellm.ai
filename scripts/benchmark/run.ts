import type {
  BenchmarkReport,
  BenchmarkRow,
  BenchmarkWorkload,
} from "../../src/benchmark/types";
import {
  compatible,
  hash,
  random,
  reconstruct,
  sampleSessions,
  traffic,
  type Example,
  type Model,
  type Obj,
} from "./data";
import { Gateway, Meter } from "./gateway";
import {
  CRITERIA,
  inferRubric,
  score,
  type Rubric,
  type Verdict,
} from "./evaluate";
export interface Progress {
  stage: string;
  done: number;
  total: number | null;
  spend: number;
}
export interface Options {
  days: number;
  sessions: number;
  seed: number;
  candidates: Model[];
  judge: Model;
  budget: number;
  rows: Obj[];
  inventoryComplete: boolean;
  imported?: boolean;
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
}
interface Observation {
  example: Example;
  model: string;
  verdict: Verdict;
  cost: number | null;
  seconds: number | null;
  weight: number;
}
export function interval(
  passed: number,
  total: number,
): [number, number] | null {
  if (!total) return null;
  const z = 1.96,
    p = passed / total,
    d = 1 + (z * z) / total,
    center = (p + (z * z) / (2 * total)) / d,
    delta =
      (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) /
      d;
  return [100 * (center - delta), 100 * (center + delta)];
}
function aggregate(
  id: string,
  name: string,
  items: Observation[],
  expected: number,
): BenchmarkRow {
  const known = items.filter((x) => x.verdict !== "unknown");
  const passed = items.filter((x) => x.verdict === "pass");
  const weights = items.reduce((n, x) => n + x.weight, 0);
  const passWeight = passed.reduce((n, x) => n + x.weight, 0);
  const costs = items.filter((x) => x.cost !== null);
  const latencies = items
    .map((x) => x.seconds)
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  const complete = items.length === expected;
  const cost =
    complete && costs.length === expected && weights
      ? costs.reduce((n, x) => n + x.cost! * x.weight, 0) / weights
      : null;
  return {
    id,
    name,
    quality:
      complete && known.length === expected && weights
        ? (passWeight / weights) * 100
        : null,
    speed:
      complete && latencies.length === expected
        ? latencies[Math.ceil(latencies.length * 0.95) - 1] ?? null
        : null,
    cost,
    successCost:
      cost !== null && passWeight > 0 ? (cost * weights) / passWeight : null,
    attempted: items.length,
    passed: passed.length,
    failed: items.filter((x) => x.verdict === "fail").length,
    unknown: expected - known.length,
    interval: interval(passed.length, expected),
  };
}
export async function run(
  gateway: Gateway,
  options: Options,
): Promise<BenchmarkReport> {
  const all = traffic(options.rows),
    sample = sampleSessions(all, options.sessions, options.seed),
    meter = new Meter(options.budget);
  const exclusions: Record<string, number> = {};
  const exclude = (reason: string) =>
    (exclusions[reason] = (exclusions[reason] || 0) + 1);
  const report: BenchmarkReport = {
    version: 1,
    createdAt: new Date().toISOString(),
    periodDays: options.days,
    seed: options.seed,
    status: "readiness",
    population: all.length,
    sampled: sample.rows.length,
    eligible: 0,
    development: 0,
    heldout: 0,
    exclusions,
    evaluationSpend: 0,
    costEstimated: false,
    inventoryComplete: options.inventoryComplete,
    judge: options.judge.id,
    workloads: [],
    notices: [
      "Quality measures inferred request requirements, not business outcomes or session completion.",
      "Model names are the gateway IDs used for this run. This local report includes deployment names and usage metrics; review it before sharing. Raw request contents and connection credentials are excluded.",
      "Cost uses gateway response-cost headers where available, otherwise token-rate estimates. Historical baseline latency is not a simultaneous control.",
      "Traffic shares are weighted estimates of the scanned period. Unsupported and unevaluated traffic is not counted as a replacement opportunity.",
      "Intervals are descriptive request-level Wilson intervals; turns within a session are correlated. Results are exploratory and do not certify a production routing policy.",
    ],
  };
  const emit = (stage: string, done: number, total: number | null) =>
    options.onProgress?.({ stage, done, total, spend: meter.spent });
  const examples: Example[] = [];
  for (const [i, row] of sample.rows.entries()) {
    if (options.signal?.aborted) break;
    emit("Preparing your sample", i, sample.rows.length);
    try {
      const payload = options.imported
        ? row.raw
        : await gateway.payload(row.id);
      const result = reconstruct(row, payload);
      if (result.example) examples.push(result.example);
      else exclude(result.reason!);
    } catch {
      exclude("Request contents unavailable");
    }
  }
  emit(
    "Preparing your sample",
    examples.length + Object.values(exclusions).reduce((a, b) => a + b, 0),
    sample.rows.length,
  );
  report.eligible = examples.length;
  // Split globally by session before learning rubrics. Shared sessions never cross the split.
  const sessions = [...new Set(examples.map((e) => e.session))];
  const rng = random(options.seed + 1);
  sessions.sort((a, b) =>
    hash([a, options.seed]).localeCompare(hash([b, options.seed])),
  );
  const dev = new Set(
    sessions.slice(0, Math.max(1, Math.ceil(sessions.length * 0.2))),
  );
  const groups = new Map<string, Example[]>();
  for (const e of examples)
    groups.set(e.workload, [...(groups.get(e.workload) || []), e]);
  report.development = examples.filter((e) => dev.has(e.session)).length;
  report.heldout = examples.length - report.development;
  const rubrics = new Map<string, Rubric>();
  const observations: Observation[] = [];
  let stopped = false;
  try {
    let n = 0;
    for (const [key, items] of groups) {
      const development = items.find((e) => dev.has(e.session));
      emit("Preparing quality checks", n++, groups.size);
      if (options.signal?.aborted) throw new Error("Cancelled");
      if (!development || !items.some((e) => !dev.has(e.session))) continue;
      rubrics.set(
        key,
        await inferRubric(gateway, meter, options.judge, development),
      );
    }
    const jobs = examples.filter(
      (e) => !dev.has(e.session) && rubrics.has(e.workload),
    );
    // Interleave requests so a budget stop does not systematically favor one workload.
    const ordered = jobs
      .map((e) => ({ e, r: rng() }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.e);
    const total = ordered.length * (options.candidates.length + 1);
    let done = 0;
    for (const e of ordered) {
      const rubric = rubrics.get(e.workload)!;
      const tasks = [
        { model: null as Model | null, id: "baseline" },
        ...options.candidates.map((model, i) => ({
          model,
          id: "candidate-" + (i + 1),
        })),
      ];
      // Blind independent scoring; order randomization reduces temporal/model-order effects.
      const orderedTasks = tasks
        .map((task) => ({ task, r: rng() }))
        .sort((a, b) => a.r - b.r)
        .map((x) => x.task);
      for (const task of orderedTasks) {
        if (options.signal?.aborted) throw new Error("Cancelled");
        emit("Comparing models", done, total);
        const weight = sample.weights.get(e.session)!;
        if (task.model && !compatible(task.model, e)) {
          observations.push({
            example: e,
            model: task.id,
            verdict: "unknown",
            cost: null,
            seconds: null,
            weight,
          });
        } else {
          const result = task.model
            ? await meter.call(gateway, task.model, e.body)
            : { response: e.response, cost: e.spend, seconds: e.seconds };
          const verdict = await score(
            gateway,
            meter,
            options.judge,
            e,
            result.response,
            rubric,
          );
          observations.push({
            example: e,
            model: task.id,
            verdict,
            cost: result.cost,
            seconds: result.seconds,
            weight,
          });
        }
        emit("Comparing models", ++done, total);
      }
    }
  } catch {
    stopped = true;
    report.notices.push(
      options.signal?.aborted
        ? "Stopped by the user. Completed measurements are retained."
        : "Run stopped after reaching the spending target, an uncosted call, or a gateway/evaluator error. No potentially billed call was automatically retried.",
    );
  }
  let index = 0;
  for (const [key, items] of groups) {
    const heldout = items.filter((e) => !dev.has(e.session));
    const rubric = rubrics.get(key);
    const population = items.reduce(
      (n, e) => n + sample.weights.get(e.session)!,
      0,
    );
    const current = observations.filter((x) => x.example.workload === key);
    const rows = [
      aggregate(
        "baseline",
        "Current · " + items[0].model,
        current.filter((x) => x.model === "baseline"),
        heldout.length,
      ),
      ...options.candidates.map((model, i) =>
        aggregate(
          "candidate-" + (i + 1),
          model.id,
          current.filter((x) => x.model === "candidate-" + (i + 1)),
          heldout.length,
        ),
      ),
    ];
    const w: BenchmarkWorkload = {
      id: "workload-" + ++index,
      name:
        (items[0].agent
          ? "Tool turns"
          : items[0].body.response_format
            ? "Structured output"
            : "Text requests") +
        " " +
        index,
      baseline: "baseline",
      sample: heldout.length,
      population,
      sampledSessions: new Set(items.map((e) => e.session)).size,
      trafficShare: all.length ? (population / all.length) * 100 : 0,
      agentTurns: items.some((e) => e.agent),
      criteria: rubric ? rubric.criteria.map((c) => CRITERIA[c]) : [],
      calibrated: rubric?.calibrated || false,
      rows,
    };
    report.workloads.push(w);
  }
  if (options.signal?.aborted && !stopped)
    report.notices.push(
      "Stopped by the user. Completed measurements are retained.",
    );
  report.status =
    stopped || options.signal?.aborted
      ? "partial"
      : observations.length
        ? "complete"
        : "readiness";
  report.evaluationSpend = meter.spent;
  report.costEstimated = meter.estimated;
  if (meter.uncertain)
    report.notices.push(
      "One call has unknown cost or billing status. Reported evaluation spend is a lower bound.",
    );
  if (!options.inventoryComplete)
    report.notices.push(
      "The gateway capped the inventory. Traffic shares apply only to scanned records.",
    );
  if (!report.eligible)
    report.notices.push(
      "No complete supported requests were found. Enable prompt/response storage for future traffic or import complete request/response logs, then run again.",
    );
  return report;
}
