import { describe, expect, test, vi } from "vitest";
import {
  loadDiscoveryBenchmarks,
  rankQuality,
  rankValue,
} from "./discoveryBenchmarks";

const base = { n: "Alpha", lab: "Acme", in: 1, out: 4, by: "Acme" };
const run = (
  score: number,
  costPerTask: number,
  setting = "high",
  benchmark = "DeepSWE",
) => ({
  benchmark,
  score,
  costPerTask,
  setting,
  modelVersion: `alpha_${setting}`,
  harness: "mini-swe-agent",
  date: "2026-10-01",
  url: "javascript:alert(1)",
});
const load = (models: unknown) =>
  loadDiscoveryBenchmarks(
    vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ models, asOf: "October 1, 2026" })),
    ),
  );

describe("discovery benchmark rankings", () => {
  test("loads numeric scores, prices and sources for real benchmark rankings", async () => {
    const catalog = await load({
      alpha: {
        ...base,
        benchmarks: {
          eci: { score: 160.5, date: "2026-10-01" },
          scores: [run(0.8, 4)],
          valueRuns: [run(0.8, 4)],
        },
      },
    });
    expect(catalog.asOf).toBe("October 1, 2026");
    expect(catalog.models[0]).toMatchObject({
      slug: "alpha",
      href: "/models/alpha",
      inputPrice: 1,
      outputPrice: 4,
      provider: "Acme",
    });
    expect(rankQuality(catalog.models, "overall")[0]).toMatchObject({
      score: 160.5,
      date: "2026-10-01",
    });
    expect(rankQuality(catalog.models, "coding")[0]).toMatchObject({
      score: 0.8,
      setting: "high",
      sourceUrl: "https://deepswe.datacurve.ai/",
    });
  });

  test("reads legacy quality strings without inventing task costs from token prices", async () => {
    const catalog = await load({
      alpha: {
        ...base,
        b: {
          "Epoch Capabilities Index": "160.5",
          "GPQA Diamond": "91.2% (max)",
          DeepSWE: "80.0%",
        },
      },
    });
    expect(rankQuality(catalog.models, "overall")[0].score).toBe(160.5);
    expect(rankQuality(catalog.models, "reasoning")[0]).toMatchObject({
      score: 0.912,
      setting: "max",
      date: null,
    });
    expect(rankValue(catalog.models, "coding")).toEqual([]);
  });

  test("sorts within the selected benchmark numerically and leaves missing results unranked", async () => {
    const catalog = await load({
      alpha: {
        ...base,
        b: { "Epoch Capabilities Index": "99.9", "GPQA Diamond": "95.0%" },
      },
      beta: {
        ...base,
        n: "Beta",
        b: { "Epoch Capabilities Index": "160.5", "GPQA Diamond": "80.0%" },
      },
      gamma: { ...base, n: "Gamma" },
    });
    expect(
      rankQuality(catalog.models, "overall").map((r) => r.model.slug),
    ).toEqual(["beta", "alpha"]);
    expect(
      rankQuality(catalog.models, "reasoning").map((r) => r.model.slug),
    ).toEqual(["alpha", "beta"]);
    expect(rankQuality(catalog.models, "math")).toEqual([]);
  });

  test("ranks values from matching runs and chooses one efficient setting per model", async () => {
    const catalog = await load({
      alpha: {
        ...base,
        benchmarks: {
          scores: [run(0.8, 4)],
          valueRuns: [
            run(0.8, 4),
            run(0.6, 1, "low"),
            run(0.9, 0.01, "high", "ARC-AGI-2"),
          ],
        },
      },
      beta: {
        ...base,
        n: "Beta",
        benchmarks: { scores: [run(0.9, 3)], valueRuns: [run(0.9, 3)] },
      },
    });
    const ranked = rankValue(catalog.models, "coding");
    expect(ranked.map((r) => r.model.slug)).toEqual(["alpha", "beta"]);
    expect(ranked[0]).toMatchObject({
      score: 0.6,
      costPerTask: 1,
      solvedPerDollar: 0.6,
      setting: "low",
    });
    expect(rankValue(catalog.models, "coding", 0.7)[0].model.slug).toBe("beta");
    expect(rankValue(catalog.models, "reasoning")[0]).toMatchObject({
      score: 0.9,
      costPerTask: 0.01,
      solvedPerDollar: 90,
    });
    expect(rankQuality(catalog.models, "coding")[0].model.slug).toBe("beta");
  });

  test("rejects unsafe model paths, malformed values, zero costs and partial-credit task values", async () => {
    const catalog = await load({
      "../unsafe": base,
      broken: { ...base, in: "free" },
      alpha: {
        ...base,
        benchmarks: {
          scores: [run(2, 1)],
          valueRuns: [
            run(0.8, 0),
            run(0.8, -1),
            run(0.8, Infinity),
            run(0, 1),
            run(0.8, 1, "high", "FrontierSWE"),
            run(2, 1),
            { ...run(0.8, 1), costPerTask: "0.01" },
          ],
        },
      },
    });
    expect(catalog.models.map((m) => m.slug)).toEqual(["alpha"]);
    expect(rankQuality(catalog.models, "coding")).toEqual([]);
    expect(rankValue(catalog.models, "coding")).toEqual([]);
  });

  test("accepts decimal model slugs and keeps unknown evaluation dates unknown", async () => {
    const catalog = await load({
      "model-1.5": {
        ...base,
        benchmarks: { scores: [{ ...run(0.8, 1), date: "2026-02-31" }] },
      },
    });
    expect(catalog.models[0].href).toBe("/models/model-1.5");
    expect(rankQuality(catalog.models, "coding")[0].date).toBeNull();
  });

  test("does not substitute legacy scores when structured results are invalid", async () => {
    const catalog = await load({
      alpha: {
        ...base,
        b: { "Epoch Capabilities Index": "160" },
        benchmarks: { eci: { score: "160" }, scores: [] },
      },
    });
    expect(rankQuality(catalog.models, "overall")).toEqual([]);
  });

  test("reports unavailable or malformed feeds", async () => {
    await expect(
      loadDiscoveryBenchmarks(async () => new Response("", { status: 503 })),
    ).rejects.toThrow("unavailable");
    await expect(
      loadDiscoveryBenchmarks(async () => new Response("{}")),
    ).rejects.toThrow("unavailable");
  });
});
