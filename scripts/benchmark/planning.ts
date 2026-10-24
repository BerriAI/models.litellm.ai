import { number, type Model, type Traffic } from "./data";
/** A planning heuristic, never a spend bound or a token cap. */
export function estimateCost(
  rows: Traffic[],
  candidates: Model[],
  judge: Model,
): number | null {
  if (
    [...candidates, judge].some(
      (m) => m.input === undefined || m.output === undefined,
    )
  )
    return null;
  return rows.reduce((total, row) => {
    const input = row.tokens,
      output = number(row.raw.completion_tokens) ?? input;
    const generation = candidates.reduce(
      (n, m) => n + input * m.input! + output * m.output!,
      0,
    );
    // Include original/candidate scoring plus rubric preparation and calibration.
    const judging =
      (candidates.length + 3) *
      ((input + output) * judge.input! + output * judge.output!);
    return total + generation + judging;
  }, 0);
}
