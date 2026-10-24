import { describe, expect, it, vi } from "vitest";
import {
  loadDiscoveryBenchmarks,
  parseDiscoveryBenchmarks,
  rankQuality,
  rankValue,
  type DiscoveryBenchmarkModel,
} from "./discoveryBenchmarks";

function model(
  slug: string,
  fields: Partial<DiscoveryBenchmarkModel> = {},
): DiscoveryBenchmarkModel {
  return {
    slug,
    name: slug,
    lab: "Example lab",
    href: `/models/${slug}`,
    modelId: null,
    intelligence: null,
    coding: null,
    costPerTask: null,
    harness: null,
    setting: null,
    trials: null,
    passed: null,
    totalCost: null,
    ...fields,
  };
}
const catalog = (models: unknown[]) => ({
  source: "public-feeds",
  asOf: "2026-10-24T12:00:00.000Z",
  models,
});

describe("public benchmark discovery", () => {
  it("should load same-origin results with a timeout and without credentials", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify(catalog([model("alpha", { intelligence: 154 })])),
        ),
    );
    const data = await loadDiscoveryBenchmarks(fetchFn as typeof fetch);
    expect(fetchFn).toHaveBeenCalledWith("/discovery/benchmarks.json", {
      signal: expect.any(AbortSignal),
    });
    expect(data.models[0].intelligence).toBe(154);
  });
  it("should preserve missing measurements instead of treating them as zero", () => {
    const data = parseDiscoveryBenchmarks(catalog([model("alpha")]));
    expect(rankQuality(data.models, "coding")).toEqual([]);
    expect(rankValue(data.models)).toEqual([]);
  });
  it("should rank ECI points above 100 separately from coding success fractions", () => {
    const models = [
      model("alpha", { intelligence: 150, coding: 0.9 }),
      model("beta", { intelligence: 155, coding: 0.8 }),
    ];
    expect(rankQuality(models, "overall").map((row) => row.model.slug)).toEqual(
      ["beta", "alpha"],
    );
    expect(rankQuality(models, "coding").map((row) => row.model.slug)).toEqual([
      "alpha",
      "beta",
    ]);
  });
  it("should rank all successful measured runs per dollar while retaining each success rate", () => {
    const models = [
      model("leader", { coding: 0.9, costPerTask: 0.11 }),
      model("cheaper", { coding: 0.75, costPerTask: 0.1 }),
      model("efficient", { coding: 0.8, costPerTask: 0.08 }),
      model("low-success", { coding: 0.1, costPerTask: 0.001 }),
      model("no-success", { coding: 0, costPerTask: 0.001 }),
      model("missing", { coding: 0.9 }),
      model("zero", { coding: 0.9, costPerTask: 0 }),
    ];
    expect(rankValue(models).map((row) => row.model.slug)).toEqual([
      "low-success",
      "efficient",
      "leader",
      "cheaper",
    ]);
    expect(rankValue(models)[0]).toMatchObject({
      score: 0.1,
      costPerTask: 0.001,
      solvedPerDollar: 100,
    });
    expect(rankValue(models)[1]).toMatchObject({
      score: 0.8,
      costPerTask: 0.08,
      solvedPerDollar: 10,
    });
  });
  it("should show the most efficient configuration per exact source model id", () => {
    const models = [
      model("high", {
        releaseSlug: "provider/alpha",
        coding: 0.9,
        costPerTask: 2,
        harness: "Agent A",
      }),
      model("low", {
        releaseSlug: "provider/alpha",
        coding: 0.8,
        costPerTask: 0.2,
        harness: "Agent B",
      }),
      model("beta", { coding: 0.85, costPerTask: 0.5 }),
    ];
    expect(rankQuality(models, "coding").map((row) => row.model.slug)).toEqual([
      "high",
      "beta",
    ]);
    expect(rankValue(models).map((row) => row.model.slug)).toEqual([
      "low",
      "beta",
    ]);
    expect(rankValue(models)[0].model.harness).toBe("Agent B");
  });
  it("should not guess grouping from similar model names", () => {
    expect(
      rankQuality(
        [
          model("alpha-high", { intelligence: 150 }),
          model("alpha-low", { intelligence: 140 }),
        ],
        "overall",
      ),
    ).toHaveLength(2);
  });
  it("should reject unsafe links and sanitize invalid measurements", () => {
    const data = parseDiscoveryBenchmarks(
      catalog([
        model("bad", { href: "javascript:alert(1)" }),
        model("credentials", { href: "https://user:password@github.com/path" }),
        model("../bad"),
        model("alpha", { intelligence: 155, coding: 101, costPerTask: -2 }),
        model("alpha", { intelligence: 160 }),
      ]),
    );
    expect(data.models).toHaveLength(1);
    expect(data.models[0]).toMatchObject({
      intelligence: 155,
      coding: null,
      costPerTask: null,
    });
  });
  it("should derive value from valid run counts and reported total cost rather than trusting a separately supplied estimate", () => {
    const data = parseDiscoveryBenchmarks(
      catalog([
        model("run", {
          coding: 0.99,
          costPerTask: 0.001,
          trials: 50,
          passed: 30,
          totalCost: 5,
        }),
        model("missing-cost", {
          coding: 0.8,
          costPerTask: 0.001,
          trials: 50,
          passed: 40,
        }),
        model("invalid-counts", {
          coding: 0.8,
          costPerTask: 0.001,
          trials: 0,
          passed: 40,
          totalCost: 5,
        }),
      ]),
    );
    expect(data.models[0]).toMatchObject({ coding: 0.6, costPerTask: 0.1 });
    expect(data.models[1].costPerTask).toBeNull();
    expect(data.models[2].costPerTask).toBeNull();
  });
  it("should retain a source-matched LiteLLM model ID without inventing one when absent", () => {
    const data = parseDiscoveryBenchmarks(
      catalog([
        model("known", { modelId: "vertex_ai/example" }),
        { ...model("unknown"), modelId: undefined },
      ]),
    );
    expect(data.models[0].modelId).toBe("vertex_ai/example");
    expect(data.models[1].modelId).toBeNull();
  });
  it("should preserve independent source dates on cached results", () => {
    const data = parseDiscoveryBenchmarks({
      ...catalog([]),
      epochAsOf: "2026-10-22",
      terminalBenchAsOf: "2026-10-20T00:00:00Z",
      terminalBenchVersion: "4.0",
    });
    expect(data.epochAsOf).toBe("2026-10-22");
    expect(data.terminalBenchAsOf).toBe("2026-10-20T00:00:00Z");
    expect(data.terminalBenchVersion).toBe("4.0");
  });
  it("should reject failed requests and unexpected payloads", async () => {
    await expect(
      loadDiscoveryBenchmarks(
        vi.fn(async () => new Response("", { status: 503 })) as typeof fetch,
      ),
    ).rejects.toThrow("unavailable");
    expect(() => parseDiscoveryBenchmarks({ models: [] })).toThrow(
      "unavailable",
    );
  });
});
