import type { BenchmarkReport } from "./types";
/** Workload-level exploratory choices, never an oracle picking a model per answer. */
export function allocation(report: BenchmarkReport, floor: number) {
  const choices = report.workloads.map((w) => {
    const baseline = w.rows.find((r) => r.id === w.baseline);
    const candidates =
      report.status === "complete" &&
      w.calibrated &&
      !w.agentTurns &&
      baseline?.cost !== null &&
      baseline?.quality !== null
        ? w.rows
            .filter(
              (r) =>
                r.id !== w.baseline &&
                r.quality !== null &&
                r.quality >= Math.max(floor, baseline?.quality ?? 100) &&
                r.cost !== null &&
                r.cost < (baseline?.cost ?? 0) &&
                r.unknown === 0,
            )
            .sort((a, b) => a.cost! - b.cost!)
        : [];
    const model = candidates[0];
    return {
      workload: w.name,
      model: model?.name ?? "Keep current / gather evidence",
      share: model ? w.trafficShare : 0,
      savings: model
        ? ((baseline!.cost! - model.cost!) * w.population * 30) /
          report.periodDays
        : 0,
    };
  });
  return {
    choices,
    share: Math.min(
      100,
      choices.reduce((n, c) => n + c.share, 0),
    ),
    savings: choices.reduce((n, c) => n + c.savings, 0),
  };
}
