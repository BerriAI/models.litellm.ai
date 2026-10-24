import { describe, expect, it, vi } from "vitest";
import {
  fetchTerminalBench,
  loadDiscoveryBenchmarkData,
  terminalBenchModel,
  TERMINAL_BENCH_DATASET_REF,
  TERMINAL_BENCH_VERSION,
} from "./discovery-benchmarks";
import { rankValue } from "../../src/discoveryBenchmarks";
import { readFileSync } from "node:fs";
import type { BenchmarkData } from "./benchmarks";

const submission = (metrics: Record<string, unknown> = {}) => ({
  metadata: {
    model_display: { label: "Example model" },
    model_org: { label: "Example lab" },
    agent_display: { label: "Example agent" },
    reasoning_effort: "high",
    date: "2025-01-01",
  },
  source_filter: { model_name: "provider/example", agent_version: "1.0" },
  metrics: {
    accuracy: 60,
    n_trials: 50,
    successes: 30,
    total_cost_usd: 5,
    ...metrics,
  },
});
const file = "2026-10-20-example.json";
function publicFetch(overrides: { pin?: string; submission?: unknown } = {}) {
  return vi.fn(async (url: string | URL | Request) => {
    const path = String(url);
    if (path.endsWith("hub.py"))
      return new Response(
        overrides.pin ?? `DATASET_REF = "${TERMINAL_BENCH_DATASET_REF}"`,
      );
    if (path.includes("api.github.com"))
      return Response.json([
        { type: "file", name: file },
        { type: "file", name: "README.md" },
      ]);
    return Response.json(overrides.submission ?? submission());
  });
}

describe("Terminal-Bench public discovery feed", () => {
  it("should derive reported trial cost and successful tasks per dollar from one run", () => {
    const model = terminalBenchModel(file, submission())!;
    expect(model).toMatchObject({
      coding: 0.6,
      costPerTask: 0.1,
      trials: 50,
      passed: 30,
      totalCost: 5,
      harness: "Example agent",
      setting: "high",
      releaseSlug: "provider/example",
    });
    expect(rankValue([model])[0].solvedPerDollar).toBeCloseTo(6);
  });
  it("should retain coding scores but exclude missing and zero reported costs from value", () => {
    for (const total_cost_usd of [null, undefined, 0, -1]) {
      const model = terminalBenchModel(file, submission({ total_cost_usd }))!;
      expect(model.coding).toBe(0.6);
      expect(model.costPerTask).toBeNull();
      expect(rankValue([model])).toEqual([]);
    }
  });
  it("should reject impossible counts, rounded score inconsistencies and unsafe filenames", () => {
    for (const metrics of [
      { n_trials: 0 },
      { n_trials: 1.5 },
      { successes: 51 },
      { successes: -1 },
      { accuracy: 59 },
    ])
      expect(terminalBenchModel(file, submission(metrics))).toBeNull();
    expect(terminalBenchModel("../bad.json", submission())).toBeNull();
    expect(
      terminalBenchModel(
        file,
        submission({ n_trials: 330, successes: 214, accuracy: 64.85 }),
      ),
    ).not.toBeNull();
  });
  it("should fetch public files without authentication and retain the capture date", async () => {
    const fetchFn = publicFetch();
    const result = await fetchTerminalBench(
      fetchFn as typeof fetch,
      "2026-10-24T12:00:00Z",
    );
    expect(result.models).toHaveLength(1);
    expect(result.asOf).toBe("2026-10-24T12:00:00Z");
    expect(result.version).toBe("4.0");
    for (const [, options] of fetchFn.mock.calls as unknown as [
      string,
      RequestInit,
    ][]) {
      expect(options).toEqual({ signal: expect.any(AbortSignal) });
    }
  });
  it("should fail closed when the dataset changes or any submission is malformed", async () => {
    await expect(
      fetchTerminalBench(
        publicFetch({ pin: 'DATASET_REF = "new-version"' }) as typeof fetch,
      ),
    ).rejects.toThrow("version changed");
    await expect(
      fetchTerminalBench(publicFetch({ submission: {} }) as typeof fetch),
    ).rejects.toThrow("format changed");
  });
  it("should preserve bundled capture freshness when both public sources are unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const data = await loadDiscoveryBenchmarkData(null, [], {
        fetchFn: vi.fn(
          async () => new Response("", { status: 403 }),
        ) as typeof fetch,
      });
      const snapshot = JSON.parse(
        readFileSync(
          new URL("./terminal-bench-snapshot.json", import.meta.url),
          "utf8",
        ),
      );
      expect(data.models.length).toBe(snapshot.models.length);
      expect(data.terminalBenchAsOf).toBe(snapshot.asOf);
      expect(data.fetchedAt).toBe(snapshot.asOf);
      expect(data.epochAsOf).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });
  it.each<BenchmarkData | null>([
    null,
    { eci: new Map(), runs: new Map(), snapshots: new Map() },
    {
      eci: new Map([["invalid", { score: Number.NaN, date: null }]]),
      runs: new Map(),
      snapshots: new Map(),
    },
  ])(
    "should preserve newer published source subsets and dates when Epoch is missing or invalid (%j)",
    async (epochData) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const coding = terminalBenchModel(file, submission())!;
        const epoch = {
          ...coding,
          slug: "eci-example",
          intelligence: 150,
          trials: null,
          passed: null,
          totalCost: null,
          coding: null,
          costPerTask: null,
        };
        const previous = {
          source: "public-feeds",
          models: [epoch, coding],
          asOf: "2026-10-26T00:00:00Z",
          fetchedAt: "2026-10-26T00:00:00Z",
          epochAsOf: "2026-10-25",
          terminalBenchAsOf: "2026-10-26T00:00:00Z",
          terminalBenchVersion: TERMINAL_BENCH_VERSION,
        };
        const fetchFn = vi.fn(async (url: string | URL | Request) =>
          String(url) === "https://example.com/previous.json"
            ? Response.json(previous)
            : new Response("", { status: 503 }),
        );
        const result = await loadDiscoveryBenchmarkData(epochData, [], {
          fetchFn: fetchFn as typeof fetch,
          previousSnapshotUrl: "https://example.com/previous.json",
        });
        expect(result.models).toHaveLength(2);
        expect(result.fetchedAt).toBe(previous.fetchedAt);
        expect(result.epochAsOf).toBe(previous.epochAsOf);
        expect(result.terminalBenchAsOf).toBe(previous.terminalBenchAsOf);
      } finally {
        warn.mockRestore();
      }
    },
  );
  it("should preserve cached Epoch data when its ECI file is missing even if Terminal-Bench refreshes", async () => {
    const run = terminalBenchModel(file, submission())!;
    const epoch = {
      ...run,
      slug: "eci-cached",
      intelligence: 150,
      coding: null,
      costPerTask: null,
      trials: null,
      passed: null,
      totalCost: null,
    };
    const previous = {
      source: "public-feeds",
      models: [epoch],
      epochAsOf: "2026-10-20T00:00:00Z",
    };
    const terminalFetch = publicFetch();
    const fetchFn = vi.fn(async (url: string | URL | Request) =>
      String(url) === "https://example.com/previous.json"
        ? Response.json(previous)
        : terminalFetch(url),
    );
    const result = await loadDiscoveryBenchmarkData(
      { eci: new Map(), runs: new Map(), snapshots: new Map() },
      [],
      {
        fetchFn: fetchFn as typeof fetch,
        previousSnapshotUrl: "https://example.com/previous.json",
      },
    );
    expect(
      result.models.find((model) => model.slug === epoch.slug)?.intelligence,
    ).toBe(150);
    expect(result.epochAsOf).toBe(previous.epochAsOf);
    expect(result.terminalBenchAsOf).not.toBeNull();
  });
});
