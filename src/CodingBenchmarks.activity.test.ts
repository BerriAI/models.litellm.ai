// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import CodingBenchmarks from "./CodingBenchmarks.svelte";
import Home from "./Discover.svelte";
import Main from "./Main.svelte";
import { PAGE_TITLES } from "./pageTitles";
import { type BenchmarkResults, type BenchmarkRun } from "./codingBenchmarks";

vi.mock("svelte", () =>
  vi.importActual<typeof import("svelte")>("svelte/internal"),
);
vi.mock("./analytics", () => ({
  initAnalytics: vi.fn(),
  trackPageView: vi.fn(),
  trackTabChange: vi.fn(),
  trackSearch: vi.fn(),
  trackQuickStartCopy: vi.fn(),
  trackRequest: vi.fn(),
  trackRequestFormOpened: vi.fn(),
}));
vi.mock("./catalogData", () => ({
  loadCatalogData: vi.fn(async () => ({
    items: [],
    lines: [],
    metadata: Promise.resolve(new Map()),
    fetchedAt: Date.now(),
  })),
}));

const baseRun: BenchmarkRun = {
  id: "codex",
  cohortId: "pilot",
  harness: "codex",
  harnessVersion: "1",
  model: "sol",
  modelName: "Sol fixture",
  provider: "openai",
  providerName: "OpenAI",
  status: "complete",
  passed: 4,
  attempts: 6,
  plannedAttempts: 6,
  apiCostUsd: 1,
  computeCostUsd: null,
  costSource: "estimated",
  totalSeconds: null,
  notes: "Fixture methodology note.",
};
const fixture: BenchmarkResults = {
  schemaVersion: 1,
  updatedAt: "2026-01-01T00:00:00Z",
  status: "complete",
  message: "Timing withheld; this is a preliminary subset.",
  cohorts: [
    {
      id: "pilot",
      label: "Pilot fixture",
      dataset: "Terminal-Bench",
      version: "4.0",
      taskIds: ["a", "b", "c", "d", "e", "f"],
      repetitions: 1,
      scope: "subset",
      environment: "Fixture environment",
    },
  ],
  runs: [
    baseRun,
    {
      ...baseRun,
      id: "kimi",
      harness: "kimi-cli",
      modelName: "Kimi fixture",
      provider: "moonshot",
      providerName: "Moonshot",
      passed: 2,
      apiCostUsd: 8,
    },
    {
      ...baseRun,
      id: "pi",
      harness: "pi",
      modelName: "Sonnet fixture",
      provider: "anthropic",
      providerName: "Anthropic",
      passed: 1,
      apiCostUsd: 0.5,
    },
    {
      ...baseRun,
      id: "claude",
      harness: "claude-code",
      modelName: "Sonnet fixture",
      provider: "anthropic",
      providerName: "Anthropic",
      passed: 1,
      apiCostUsd: 1,
    },
    {
      ...baseRun,
      id: "partial",
      harness: "opencode",
      modelName: "Incomplete fixture",
      status: "running",
      passed: 0,
      attempts: 1,
    },
  ],
};
let component: CodingBenchmarks | Home | Main;
const panels = () =>
  Array.from(document.getElementsByTagName("section")).filter((section) =>
    section.getAttribute("aria-label")?.endsWith(" comparison"),
  );
const panel = (name: string) =>
  panels().find(
    (section) => section.getAttribute("aria-label") === name + " comparison",
  )!;
const chartRows = (name: string) =>
  Array.from(panel(name).getElementsByTagName("button"));
const order = (name: string) =>
  chartRows(name).map(
    (row) => row.getAttribute("aria-label")?.split(", Model:")[0],
  );
async function mount(data = fixture, embedded = false) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(data))),
  );
  component = new CodingBenchmarks({
    target: document.body,
    props: { embedded },
  });
  await vi.waitFor(() => expect(chartRows("Quality")).toHaveLength(4));
}
beforeEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/");
});
afterEach(() => {
  component?.$destroy();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("coding benchmark results", () => {
  it("should render two results charts without filters, recommendations or demo controls", async () => {
    await mount();
    expect(
      panels().map((section) => section.getAttribute("aria-label")),
    ).toEqual(["Quality comparison", "Tasks per dollar comparison"]);
    expect(document.getElementsByTagName("h1")[0].textContent).toBe(
      "Coding benchmarks",
    );
    expect(document.getElementsByTagName("select")).toHaveLength(0);
    expect(document.getElementsByTagName("input")).toHaveLength(0);
    expect(document.body.textContent).toContain("Preliminary results");
    expect(document.body.textContent).toContain("6 tasks · 1 trial each");
    expect(document.body.textContent).not.toContain("Most tasks/$");
    expect(document.body.textContent).not.toContain("Preview");
    expect(document.body.textContent).not.toContain("Run on your stack");
    expect(document.body.textContent).not.toContain("Incomplete fixture");
    expect(document.getElementsByTagName("details")[0].open).toBe(false);
  });

  it("should sort each chart by its own metric and break quality ties by harness name", async () => {
    await mount();
    expect(order("Tasks per dollar")).toEqual([
      "Harness: Codex",
      "Harness: Pi",
      "Harness: Claude Code",
      "Harness: Kimi Code",
    ]);
    expect(order("Quality")).toEqual([
      "Harness: Codex",
      "Harness: Kimi Code",
      "Harness: Claude Code",
      "Harness: Pi",
    ]);
    for (const row of chartRows("Quality")) {
      expect(row.textContent).toContain("Harness:");
      expect(row.textContent).toContain("Model:");
      expect(row.textContent).toContain("Provider:");
      expect(
        row.getElementsByTagName("img")[0].getAttribute("src"),
      ).toBeTruthy();
    }
  });

  it("should show whole-run costs under quality and the arithmetic behind value", async () => {
    await mount();
    expect(chartRows("Quality")[1].textContent).toContain(
      "2 / 6 solved · $8.00 estimated API total",
    );
    expect(chartRows("Tasks per dollar").at(-1)?.textContent).toContain(
      "2 solved ÷ $8.00 total ≈ 0.25 / $",
    );
    expect(chartRows("Tasks per dollar")[1].textContent).toContain(
      "1 solved ÷ $0.50 total ≈ 2.00 / $",
    );
    expect(panel("Tasks per dollar").textContent).toContain(
      "Tasks solved ÷ total API spend",
    );
    expect(document.body.textContent).toContain(
      "API spend includes failed attempts.",
    );
  });

  it("should show zero total cost without dividing by zero", async () => {
    await mount({
      ...fixture,
      runs: fixture.runs.map((run) =>
        run.id === "codex" ? { ...run, apiCostUsd: 0 } : run,
      ),
    });
    expect(chartRows("Quality")[0].textContent).toContain(
      "4 / 6 solved · $0.00 estimated API total",
    );
    const row = chartRows("Tasks per dollar").at(-1)!;
    expect(row.textContent).toContain(
      "4 solved · $0.00 total · value unavailable",
    );
    expect(row.textContent).not.toContain("÷");
    expect(row.textContent).not.toContain("Infinity");
  });

  it("should keep unmeasured cost unavailable and exclude incomplete rows without creating a time chart", async () => {
    await mount({
      ...fixture,
      runs: fixture.runs.map((run) =>
        run.id === "codex"
          ? { ...run, apiCostUsd: null, costSource: "unavailable" }
          : run,
      ),
    });
    expect(order("Tasks per dollar").at(-1)).toBe("Harness: Codex");
    expect(chartRows("Tasks per dollar").at(-1)?.textContent).toContain("—");
    expect(order("Quality")[0]).toBe("Harness: Codex");
    expect(chartRows("Quality")[0].textContent).toContain(
      "4 / 6 solved · API cost unavailable",
    );
    expect(chartRows("Tasks per dollar").at(-1)?.textContent).toContain(
      "4 solved · API cost unavailable",
    );
    expect(chartRows("Tasks per dollar").at(-1)?.textContent).not.toContain(
      "÷",
    );
    expect(
      panels().some(
        (section) =>
          section.getAttribute("aria-label") === "Task time comparison",
      ),
    ).toBe(false);
  });

  it("should show selected model/provider/cost evidence and close it without changing the ranking", async () => {
    await mount();
    chartRows("Quality")[1].click();
    await tick();
    const detail = document.getElementsByTagName("aside")[0];
    expect(detail.textContent).toContain("Harness: Kimi Code");
    expect(detail.textContent).toContain("Kimi fixture");
    expect(detail.textContent).toContain("Moonshot");
    expect(detail.textContent).toContain("$8.0000");
    expect(detail.getElementsByTagName("details")[0].open).toBe(false);
    detail.getElementsByTagName("button")[0].click();
    await tick();
    expect(document.getElementsByTagName("aside")).toHaveLength(0);
    expect(order("Quality")[1]).toBe("Harness: Kimi Code");
  });

  it("should keep comparison cohorts separate and prefer completed data over a new active cohort", async () => {
    await mount({
      ...fixture,
      cohorts: [{ ...fixture.cohorts[0], id: "new" }, ...fixture.cohorts],
      runs: [
        {
          ...baseRun,
          cohortId: "new",
          id: "new-run",
          status: "running",
          modelName: "New active fixture",
        },
        ...fixture.runs,
      ],
    });
    expect(document.body.textContent).not.toContain("New active fixture");
    expect(chartRows("Quality")).toHaveLength(4);
  });

  it("should embed real charts without the retired evaluation demo and retain the standalone link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(fixture))),
    );
    component = new Home({ target: document.body });
    await vi.waitFor(() => expect(chartRows("Quality")).toHaveLength(4));
    expect(document.body.textContent).not.toContain("Evaluation workspace");
    expect(document.body.textContent).not.toContain("illustrative data");
    expect(document.querySelectorAll("dialog")).toHaveLength(0);
    const link = Array.from(document.getElementsByTagName("a")).find((a) =>
      a.textContent?.includes("Open benchmarks"),
    );
    expect(link?.getAttribute("href")).toBe("/benchmarks");
  });

  it("should navigate from the main header to the standalone results page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(fixture))),
    );
    component = new Main({ target: document.body });
    const link = Array.from(document.getElementsByTagName("a")).find(
      (a) => a.textContent?.trim() === "Benchmarks",
    )!;
    link.click();
    await vi.waitFor(() =>
      expect(window.location.pathname).toBe("/benchmarks"),
    );
    expect(document.title).toBe(PAGE_TITLES.benchmarks);
    document.querySelector<HTMLDetailsElement>(".pilot")!.open = true;
    document.querySelector(".pilot")!.dispatchEvent(new Event("toggle"));
    await vi.waitFor(() => expect(chartRows("Quality")).toHaveLength(4));
    expect(link.getAttribute("aria-current")).toBe("page");
  });
});
