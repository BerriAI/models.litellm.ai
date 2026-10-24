import { describe, expect, test } from "vitest";
import { strToU8, zipSync } from "fflate";
import { benchmarksFor, parseBenchmarkZip } from "./benchmarks";

const archive = () =>
  zipSync({
    "benchmark_metadata.csv": strToU8(
      "source_file,score_column,scale\narc_agi_2_external.csv,Score,1\nfrontierswe_external.csv,Score,1",
    ),
    // DeepSWE is intentionally absent from metadata, as in Epoch's published archive.
    "deepswe_external.csv": strToU8(
      "Model version,Pass@1,Mean cost (USD),Harness\nalpha_high,0.8,4,mini-swe-agent\nalpha_low,0.6,1,mini-swe-agent\nalpha-preview_high,0.95,0.1,mini-swe-agent\nbeta_high,0.7,,mini-swe-agent\ngamma_high,0.9,0,mini-swe-agent\ndelta_high,0.9,Infinity,mini-swe-agent\ninvalid_high,1.5,1,mini-swe-agent",
    ),
    "arc_agi_2_external.csv": strToU8(
      "Model version,Score,Cost per task\nalpha_high,0.5,0.25\nsnapshot-2026-01-01_high,0.8,1\nsnapshot-2026-09-01_low,0.6,0.1",
    ),
    "frontierswe_external.csv": strToU8(
      "Model version,Score,Average cost (USD)\nalpha_high,0.9,2",
    ),
  });

describe("measured benchmark value", () => {
  test("keeps every measured setting with its own score and cost while quality keeps the best score", () => {
    const model = benchmarksFor(
      parseBenchmarkZip(archive()),
      ["alpha"],
      ["Alpha"],
    )!;
    expect(model.scores.find((s) => s.benchmark === "DeepSWE")).toMatchObject({
      score: 0.8,
      setting: "high",
    });
    expect(
      model.valueRuns?.filter((s) => s.benchmark === "DeepSWE"),
    ).toMatchObject([
      {
        score: 0.8,
        costPerTask: 4,
        setting: "high",
        modelVersion: "alpha_high",
        harness: "mini-swe-agent",
      },
      {
        score: 0.6,
        costPerTask: 1,
        setting: "low",
        modelVersion: "alpha_low",
        harness: "mini-swe-agent",
      },
    ]);
    expect(
      model.valueRuns?.find((s) => s.benchmark === "ARC-AGI-2"),
    ).toMatchObject({ score: 0.5, costPerTask: 0.25 });
    expect(model.valueRuns?.some((s) => s.benchmark === "FrontierSWE")).toBe(
      false,
    );
  });

  test("excludes absent, free, nonfinite costs and invalid success scores", () => {
    const data = parseBenchmarkZip(archive());
    for (const id of ["beta", "gamma", "delta"])
      expect(benchmarksFor(data, [id], [id])?.valueRuns).toBeUndefined();
    expect(benchmarksFor(data, ["invalid"], ["Invalid"])).toBeNull();
  });

  test("uses the exact score snapshot for costs and never borrows cheaper aliases", () => {
    const data = parseBenchmarkZip(archive());
    const alpha = benchmarksFor(data, ["alpha", "alpha-preview"], ["Alpha"])!;
    expect(
      alpha.valueRuns?.some((s) => s.modelVersion.startsWith("alpha-preview")),
    ).toBe(false);
    const snapshot = benchmarksFor(data, ["snapshot"], ["Snapshot"])!;
    expect(snapshot.valueRuns).toMatchObject([
      { score: 0.6, costPerTask: 0.1, modelVersion: "snapshot-2026-09-01_low" },
    ]);
    expect(
      benchmarksFor(data, ["snapshot-2026-01-01"], ["Snapshot"])!.valueRuns,
    ).toMatchObject([{ score: 0.8, costPerTask: 1 }]);
  });
});
