import { describe, expect, test } from "vitest";
import type { BenchmarkData } from "./benchmarks";
import { epochDiscoveryModels } from "./discovery-epoch";
import type { ModelStatus } from "./model-view";

function catalogModel(
  slug: string,
  name: string,
  alsoKnownAs: string[] = [],
  status: ModelStatus = "active",
) {
  return { slug, name, alsoKnownAs, status, lab: "Example Lab" };
}

function data(rows: [string, number, string | null][]): BenchmarkData {
  return {
    eci: new Map(rows.map(([name, score, date]) => [name, { score, date }])),
    runs: new Map(),
    snapshots: new Map(),
  };
}

describe("Epoch discovery models", () => {
  test("should preserve ECI points, canonical catalog links and the source-reported date", () => {
    const result = epochDiscoveryModels(
      data([
        ["alpha", 160.5, "2026-10-01"],
        ["beta", 148.2, "2026-10-20"],
      ]),
      [catalogModel("alpha-model", "Alpha"), catalogModel("beta", "Beta")],
    );
    expect(result.models).toEqual([
      {
        slug: "alpha-model",
        name: "Alpha",
        modelId: null,
        lab: "Example Lab",
        href: "/models/alpha-model",
        score: 160.5,
        date: "2026-10-01",
      },
      {
        slug: "beta",
        name: "Beta",
        modelId: null,
        lab: "Example Lab",
        href: "/models/beta",
        score: 148.2,
        date: "2026-10-20",
      },
    ]);
    expect(result.asOf).toBe("2026-10-20");
  });

  test("should preserve the catalog headline routing string for a matched ECI row", () => {
    const result = epochDiscoveryModels(data([["alpha", 155, "2026-10-20"]]), [
      {
        ...catalogModel("alpha", "Alpha"),
        headline: { modelString: "vertex_ai/alpha" },
      },
    ]);
    expect(result.models[0].modelId).toBe("vertex_ai/alpha");
  });

  test("should keep an active routing identifier when a matched model has no price headline", () => {
    const result = epochDiscoveryModels(data([["alpha", 155, "2026-10-20"]]), [
      {
        ...catalogModel("alpha", "Alpha"),
        headline: null,
        rows: [{ modelString: "provider/alpha" }],
      },
    ]);
    expect(result.models[0].modelId).toBe("provider/alpha");
  });

  test("should accept approved exact aliases without fuzzy name matching or duplicate releases", () => {
    const result = epochDiscoveryModels(
      data([["alpha pro", 155, "2026-10-20"]]),
      [
        catalogModel("alpha", "Alpha"),
        catalogModel("canonical", "Alpha Professional", ["Alpha Pro"]),
        catalogModel("alias", "Alpha Pro"),
      ],
    );
    expect(result.models.map((model) => model.slug)).toEqual(["canonical"]);
  });

  test("should exclude retired and invalid results while keeping zero distinct from missing", () => {
    const result = epochDiscoveryModels(
      data([
        ["retired", 200, "2026-10-24"],
        ["infinite", Infinity, "2026-10-24"],
        ["negative", -1, "2026-10-24"],
        ["zero", 0, null],
      ]),
      [
        catalogModel("retired", "Retired", [], "retired"),
        catalogModel("infinite", "Infinite"),
        catalogModel("negative", "Negative"),
        catalogModel("zero", "Zero"),
        catalogModel("unmeasured", "Unmeasured"),
      ],
    );
    expect(result.models.map((model) => [model.slug, model.score])).toEqual([
      ["zero", 0],
    ]);
    expect(result.asOf).toBeNull();
  });

  test("should preserve missing or malformed source-reported dates as unknown", () => {
    const result = epochDiscoveryModels(
      data([
        ["unknown", 150, null],
        ["invalid", 151, "2026-02-30"],
      ]),
      [catalogModel("unknown", "Unknown"), catalogModel("invalid", "Invalid")],
    );
    expect(result.models.map((model) => model.date)).toEqual([null, null]);
    expect(result.asOf).toBeNull();
    expect(
      epochDiscoveryModels(null, [catalogModel("alpha", "Alpha")]),
    ).toEqual({ models: [], asOf: null });
  });
});
