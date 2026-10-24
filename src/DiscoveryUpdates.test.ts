// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("svelte", () =>
  vi.importActual<typeof import("svelte")>("svelte/internal"),
);
vi.mock("./discoveryCatalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./discoveryCatalog")>()),
  loadDiscoveryCatalog: vi.fn(),
}));
vi.mock("./discoveryBenchmarks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./discoveryBenchmarks")>()),
  loadDiscoveryBenchmarks: vi.fn(),
}));

import DiscoveryUpdates from "./DiscoveryUpdates.svelte";
import {
  loadDiscoveryCatalog,
  type DiscoveryCatalog,
} from "./discoveryCatalog";
import {
  EPOCH_URL,
  TERMINAL_BENCH_URL,
  loadDiscoveryBenchmarks,
  type DiscoveryBenchmarkCatalog,
} from "./discoveryBenchmarks";

const anthropic = {
  id: "anthropic",
  name: "Anthropic",
  logo: "/provider-logos/anthropic.svg",
  href: "/providers/anthropic",
};
const elevenlabs = {
  id: "elevenlabs",
  name: "ElevenLabs",
  logo: "/provider-logos/elevenlabs.svg",
  href: "/providers/elevenlabs",
};
const catalog: DiscoveryCatalog = {
  updatedAt: "2026-10-24",
  models: [
    {
      slug: "eleven-example",
      name: "Eleven Example",
      modelId: "elevenlabs/eleven-example",
      lab: "ElevenLabs",
      logo: elevenlabs.logo,
      href: "/models/eleven-example",
      firstSeen: "2026-10-23",
      price: null,
      context: null,
      mode: "audio_speech",
      inputModalities: [],
      outputModalities: [],
      providers: [elevenlabs],
    },
    {
      slug: "claude-example",
      name: "Claude Example",
      modelId: "anthropic/claude-example",
      lab: "Anthropic",
      logo: anthropic.logo,
      href: "/models/claude-example",
      firstSeen: "2026-10-20",
      price: "$1 / $2 per 1M tokens",
      context: 200000,
      mode: "chat",
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      providers: [anthropic],
    },
  ],
  providers: [
    {
      ...elevenlabs,
      modelCount: 10,
      recentModelCount: 1,
      latestModelDate: "2026-10-23",
      latestModelName: "Eleven Example",
    },
    {
      ...anthropic,
      modelCount: 20,
      recentModelCount: 1,
      latestModelDate: "2026-10-20",
      latestModelName: "Claude Example",
    },
  ],
};

const unmeasured = {
  modelId: null,
  intelligence: null,
  coding: null,
  costPerTask: null,
  harness: null,
  setting: null,
  trials: null,
  passed: null,
  totalCost: null,
};
const benchmarks: DiscoveryBenchmarkCatalog = {
  asOf: "2026-10-24",
  fetchedAt: "2026-10-24T12:00:00Z",
  epochAsOf: "2026-10-23",
  terminalBenchAsOf: "2026-10-24",
  terminalBenchVersion: "4.0",
  source: "public-feeds",
  models: [
    {
      ...unmeasured,
      slug: "epoch-claude-example",
      name: "Claude Example",
      lab: "Anthropic",
      href: EPOCH_URL,
      intelligence: 140,
    },
    {
      ...unmeasured,
      slug: "epoch-gpt-example",
      name: "GPT Example",
      lab: "OpenAI",
      href: EPOCH_URL,
      intelligence: 150,
    },
    {
      ...unmeasured,
      slug: "epoch-gemini-example",
      modelId: "vertex_ai/gemini-example",
      name: "Gemini Example",
      lab: "Google",
      href: EPOCH_URL,
      intelligence: 130,
    },
    {
      ...unmeasured,
      slug: "terminal-claude-example",
      name: "Claude Example",
      lab: "Anthropic",
      href: TERMINAL_BENCH_URL,
      coding: 0.9,
      costPerTask: 0.11,
      harness: "Harbor Example",
      trials: 100,
      passed: 90,
      totalCost: 11,
    },
    {
      ...unmeasured,
      slug: "terminal-gpt-example",
      name: "GPT Example",
      lab: "OpenAI",
      href: TERMINAL_BENCH_URL,
      coding: 0.75,
      costPerTask: 0.1,
      harness: "Harbor Example",
      trials: 100,
      passed: 75,
      totalCost: 10,
    },
    {
      ...unmeasured,
      slug: "terminal-gemini-example",
      modelId: "vertex_ai/gemini-example",
      name: "Gemini Example",
      lab: "Google",
      href: TERMINAL_BENCH_URL,
      coding: 0.8,
      costPerTask: 0.08,
      harness: "Harbor Example",
      trials: 100,
      passed: 80,
      totalCost: 8,
    },
  ],
};

let component: DiscoveryUpdates;
beforeEach(() => {
  document.body.innerHTML = "";
  vi.mocked(loadDiscoveryCatalog).mockReset().mockResolvedValue(catalog);
  vi.mocked(loadDiscoveryBenchmarks).mockReset().mockResolvedValue(benchmarks);
});
afterEach(() => {
  component?.$destroy();
  vi.restoreAllMocks();
});

function section(titleId: string): HTMLElement {
  const result = titleId.startsWith("ranking-")
    ? document.getElementById(titleId.replace("ranking-", "ranking-panel-"))
    : document.getElementById(titleId)?.closest("section");
  expect(result, `Section ${titleId} should be available`).toBeDefined();
  return result!;
}

type RankingId = "overall" | "coding" | "value";
function rankingTab(id: RankingId): HTMLButtonElement {
  const tab = document.getElementById(`ranking-tab-${id}`) as HTMLButtonElement;
  expect(tab?.getAttribute("role")).toBe("tab");
  return tab;
}

async function selectRanking(id: RankingId): Promise<void> {
  rankingTab(id).click();
  await vi.waitFor(() => {
    expect(rankingTab(id).getAttribute("aria-selected")).toBe("true");
    expect(document.getElementById(`ranking-panel-${id}`)).not.toBeNull();
  });
}

function recentLinks(): HTMLAnchorElement[] {
  return Array.from(
    section("new-models-title").getElementsByTagName("a"),
  ).filter((link) => link.getAttribute("href")?.startsWith("/models/"));
}

function rankingLinks(id: "overall" | "coding" | "value"): HTMLAnchorElement[] {
  const list = document
    .getElementById(`ranking-panel-${id}`)
    ?.getElementsByTagName("ol")[0];
  return list ? Array.from(list.getElementsByTagName("a")) : [];
}

function rankingRows(id: "overall" | "coding" | "value"): HTMLLIElement[] {
  const list = document
    .getElementById(`ranking-panel-${id}`)
    ?.getElementsByTagName("ol")[0];
  return list ? Array.from(list.getElementsByTagName("li")) : [];
}

function barWidths(id: "overall" | "coding" | "value"): number[] {
  return Array.from(
    section(`ranking-${id}`).getElementsByClassName("bar-fill"),
  ).map((bar) => Number.parseFloat((bar as HTMLElement).style.width));
}

function copyButton(
  scope: HTMLElement,
  modelId: string,
): HTMLButtonElement | undefined {
  return Array.from(scope.getElementsByTagName("button")).find(
    (button) =>
      button.getAttribute("aria-label") === `Copy model ID ${modelId}`,
  );
}

function rankingNames(id: "overall" | "coding" | "value"): string[] {
  return rankingLinks(id).map(
    (link) => link.getElementsByTagName("strong")[0]?.textContent?.trim() ?? "",
  );
}

function buttonNamed(name: string): HTMLButtonElement | undefined {
  return Array.from(document.getElementsByTagName("button")).find(
    (button) => button.textContent?.trim() === name,
  );
}

function clickButton(name: string): void {
  const button = buttonNamed(name);
  expect(button, `Button ${name} should be available`).toBeDefined();
  button!.click();
}

describe("Discover updates", () => {
  it("should render new models with readable modalities, provider logos and detail links", async () => {
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(recentLinks()).toHaveLength(2));
    expect(document.getElementsByTagName("h1")[0]?.textContent).toBe(
      "Discover models",
    );
    expect(recentLinks().map((link) => link.getAttribute("href"))).toEqual([
      "/models/eleven-example",
      "/models/claude-example",
    ]);
    const recent = section("new-models-title");
    expect(recent.textContent).toContain("Speech generation");
    expect(recent.textContent).toContain("Text → Audio");
    expect(recent.textContent).toContain("Text + Image → Text");
    expect(recent.textContent).toContain("Added Oct 23");
    expect(
      Array.from(recent.getElementsByTagName("img")).some(
        (img) => img.getAttribute("src") === elevenlabs.logo,
      ),
    ).toBe(true);
  });

  it("should switch one ranking panel between quality, coding and value without refetching data", async () => {
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(rankingLinks("overall")).toHaveLength(3));
    expect(rankingNames("overall")).toEqual([
      "GPT Example",
      "Claude Example",
      "Gemini Example",
    ]);
    expect(rankingTab("overall").getAttribute("aria-selected")).toBe("true");
    expect(document.getElementById("ranking-panel-coding")).toBeNull();
    expect(document.getElementById("ranking-panel-value")).toBeNull();
    expect(
      section("ranking-overall")
        .getElementsByTagName("a")[0]
        .getAttribute("aria-label"),
    ).toBe("Open Epoch Capabilities Index");
    expect(rankingRows("overall")[0].textContent).toContain("150");
    expect(
      rankingLinks("overall").every((link) => link.href === EPOCH_URL),
    ).toBe(true);

    await selectRanking("coding");
    expect(document.getElementById("ranking-panel-overall")).toBeNull();
    expect(rankingNames("coding")).toEqual([
      "Claude Example",
      "Gemini Example",
      "GPT Example",
    ]);
    expect(
      section("ranking-coding")
        .getElementsByTagName("a")[0]
        .getAttribute("aria-label"),
    ).toBe("Open Terminal-Bench 4.0");
    expect(rankingRows("coding")[0].textContent).toMatch(/90(?:\.0)?%/);
    expect(rankingRows("coding")[0].textContent).toContain("Harbor Example");
    expect(
      rankingLinks("coding").every((link) => link.href === TERMINAL_BENCH_URL),
    ).toBe(true);

    await selectRanking("value");
    expect(document.getElementById("ranking-panel-coding")).toBeNull();
    // Solved tasks per dollar differs from simply sorting by the cheapest trial.
    expect(rankingNames("value")).toEqual([
      "Gemini Example",
      "Claude Example",
      "GPT Example",
    ]);
    expect(
      rankingRows("value")[0]
        .getElementsByClassName("chart-caption")[0]
        .getAttribute("title"),
    ).toBe("Harbor Example");
    expect(rankingRows("value")[0].textContent).toMatch(/80(?:\.0)?% solved/);
    expect(rankingRows("value")[0].textContent).toMatch(
      /1,000\s*solved \/ \$100/,
    );
    expect(
      Array.from(rankingRows("value")[0].getElementsByTagName("span")).some(
        (span) => span.getAttribute("title") === "$0.08 reported per attempt",
      ),
    ).toBe(true);
    expect(
      rankingLinks("value").every((link) => link.href === TERMINAL_BENCH_URL),
    ).toBe(true);
    expect(document.body.textContent).not.toContain("Artificial Analysis");
    expect(loadDiscoveryCatalog).toHaveBeenCalledTimes(1);
    expect(loadDiscoveryBenchmarks).toHaveBeenCalledTimes(1);
  });

  it("should show named benchmark sources, visible units and scores converted to successful attempts per $100", async () => {
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(rankingRows("overall")).toHaveLength(3));
    const expectations = [
      {
        id: "overall",
        source: "Epoch Capabilities Index",
        href: EPOCH_URL,
        unit: "ECI points",
        explanation:
          "Combined benchmark score, not a percentage. Higher is better.",
      },
      {
        id: "coding",
        source: "Terminal-Bench 4.0",
        href: TERMINAL_BENCH_URL,
        unit: "solved",
        explanation:
          "Share of attempts solved by the model + agent. Higher is better.",
      },
      {
        id: "value",
        source: "Terminal-Bench 4.0",
        href: TERMINAL_BENCH_URL,
        unit: "solved / $100",
        explanation:
          "Successful attempts per $100 of reported spend. Higher is better.",
      },
    ] as const;
    for (const expected of expectations) {
      await selectRanking(expected.id);
      const panel = section(`ranking-${expected.id}`);
      const sourceLink = panel.getElementsByTagName("a")[0];
      expect(sourceLink.textContent?.replace(/\s+/g, " ").trim()).toBe(
        `${expected.source} ↗`,
      );
      expect(sourceLink.getAttribute("href")).toBe(expected.href);
      expect(sourceLink.getAttribute("aria-label")).toBe(
        `Open ${expected.source}`,
      );
      expect(panel.textContent?.replace(/\s+/g, " ")).toContain(
        expected.explanation,
      );
      expect(panel.textContent).not.toContain("View all");
      const units = Array.from(panel.getElementsByClassName("metric-unit"));
      expect(units).toHaveLength(3);
      for (const unit of units) {
        expect(unit.textContent).toBe(expected.unit);
        expect(unit.classList.contains("visually-hidden")).toBe(false);
      }
    }
    const metrics =
      section("ranking-value").getElementsByClassName("rank-metric");
    expect(metrics[0].getElementsByTagName("strong")[0].textContent).toBe(
      "1,000",
    );
    expect(metrics[2].getElementsByTagName("strong")[0].textContent).toBe(
      "750",
    );
  });

  it("should expose accessible tabs with one active panel and keyboard navigation", async () => {
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(rankingRows("overall")).toHaveLength(3));
    function expectSelected(id: RankingId) {
      const tab = rankingTab(id);
      expect(tab.getAttribute("aria-selected")).toBe("true");
      expect(tab.tabIndex).toBe(0);
      const panel = document.getElementById(tab.getAttribute("aria-controls")!);
      expect(panel?.getAttribute("role")).toBe("tabpanel");
      expect(panel?.getAttribute("aria-labelledby")).toBe(tab.id);
      expect(
        Array.from(document.getElementsByTagName("*")).filter(
          (element) => element.getAttribute("role") === "tabpanel",
        ),
      ).toHaveLength(1);
      for (const other of ["overall", "coding", "value"] as const) {
        if (other === id) continue;
        expect(rankingTab(other).getAttribute("aria-selected")).toBe("false");
        expect(rankingTab(other).tabIndex).toBe(-1);
      }
    }
    expectSelected("overall");
    rankingTab("overall").focus();
    for (const [key, expected] of [
      ["ArrowRight", "coding"],
      ["End", "value"],
      ["Home", "overall"],
      ["ArrowLeft", "value"],
    ] as const) {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
      await vi.waitFor(() => {
        expectSelected(expected);
        expect(document.activeElement).toBe(rankingTab(expected));
      });
    }
  });

  it("should show only the top ten measured results in each chart when twelve are available", async () => {
    const qualityModels = Array.from({ length: 12 }, (_, index) => ({
      ...unmeasured,
      slug: `quality-${index}`,
      name: `Quality model ${index}`,
      lab: "Example lab",
      href: EPOCH_URL,
      intelligence: 200 - index,
    }));
    const codingModels = Array.from({ length: 12 }, (_, index) => ({
      ...unmeasured,
      slug: `coding-${index}`,
      name: `Coding model ${index}`,
      lab: "Example lab",
      href: TERMINAL_BENCH_URL,
      coding: (95 - index * 5) / 100,
      costPerTask: 1,
      trials: 100,
      passed: 95 - index * 5,
      totalCost: 100,
      harness: "Example agent",
    }));
    vi.mocked(loadDiscoveryBenchmarks).mockResolvedValue({
      ...benchmarks,
      models: [...qualityModels, ...codingModels],
    });
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(rankingRows("overall")).toHaveLength(10));
    expect(rankingNames("overall")).toEqual(
      qualityModels.slice(0, 10).map((model) => model.name),
    );
    for (const id of ["coding", "value"] as const) {
      await selectRanking(id);
      expect(rankingRows(id)).toHaveLength(10);
      expect(rankingNames(id)).toEqual(
        codingModels.slice(0, 10).map((model) => model.name),
      );
    }
  });

  it("should preserve each chart's scale when switching between rankings", async () => {
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(rankingRows("overall")).toHaveLength(3));
    expect(barWidths("overall")[0]).toBe(100);
    expect(barWidths("overall")[1]).toBeCloseTo((140 / 150) * 100);
    await selectRanking("coding");
    expect(barWidths("coding")).toEqual([90, 80, 75]);
    await selectRanking("value");
    expect(barWidths("value")[0]).toBe(100);
    expect(barWidths("value")[1]).toBeCloseTo((0.9 / 0.11 / 10) * 100);
    expect(barWidths("value")[2]).toBe(75);
  });

  it("should copy canonical LiteLLM IDs from new models and rankings without following model links", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(recentLinks()).toHaveLength(2));
    const beforeUrl = window.location.href;
    const recentCopy = copyButton(
      section("new-models-title"),
      "elevenlabs/eleven-example",
    );
    expect(recentCopy).toBeDefined();
    expect(recentCopy!.closest("a")).toBeNull();
    recentCopy!.click();
    await vi.waitFor(() =>
      expect(section("new-models-title").textContent).toContain("Copied"),
    );
    expect(writeText).toHaveBeenNthCalledWith(1, "elevenlabs/eleven-example");
    await selectRanking("value");
    const rankedCopy = copyButton(
      section("ranking-value"),
      "vertex_ai/gemini-example",
    );
    expect(rankedCopy).toBeDefined();
    expect(rankedCopy!.closest("a")).toBeNull();
    rankedCopy!.click();
    await vi.waitFor(() =>
      expect(section("ranking-value").textContent).toContain("Copied"),
    );
    expect(writeText).toHaveBeenNthCalledWith(2, "vertex_ai/gemini-example");
    expect(window.location.href).toBe(beforeUrl);
  });

  it("should keep detail links but omit copy buttons rather than invent missing LiteLLM IDs", async () => {
    vi.mocked(loadDiscoveryCatalog).mockResolvedValue({
      ...catalog,
      models: catalog.models.map((model) => ({ ...model, modelId: null })),
    });
    vi.mocked(loadDiscoveryBenchmarks).mockResolvedValue({
      ...benchmarks,
      models: benchmarks.models.map((model) => ({ ...model, modelId: null })),
    });
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(recentLinks()).toHaveLength(2));
    expect(
      Array.from(document.getElementsByTagName("button")).some((button) =>
        button.getAttribute("aria-label")?.startsWith("Copy model ID "),
      ),
    ).toBe(false);
    expect(document.getElementsByTagName("code")).toHaveLength(0);
    expect(recentLinks().map((link) => link.getAttribute("href"))).toEqual([
      "/models/eleven-example",
      "/models/claude-example",
    ]);
    expect(rankingRows("overall")[0].textContent).toContain("ID not matched");
  });

  it("should report clipboard failure honestly and allow a successful retry", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValueOnce(new Error("Clipboard denied"))
      .mockResolvedValue(undefined);
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(recentLinks()).toHaveLength(2));
    const recent = section("new-models-title");
    const button = copyButton(recent, "elevenlabs/eleven-example")!;
    button.click();
    await vi.waitFor(() =>
      expect(recent.textContent).toContain("Couldn't copy"),
    );
    expect(recent.textContent).not.toContain("Copied");
    expect(button.textContent).toContain("elevenlabs/eleven-example");
    button.click();
    await vi.waitFor(() => expect(recent.textContent).toContain("Copied"));
    expect(recent.textContent).not.toContain("Couldn't copy");
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it("should keep new models focused without duplicated ranking tabs or provider filters and cards", async () => {
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(recentLinks()).toHaveLength(2));
    expect(document.getElementsByTagName("select")).toHaveLength(0);
    expect(
      section("new-models-title").getElementsByTagName("button"),
    ).toHaveLength(2);
    expect(rankingTab("overall").textContent).toBe("Top quality");
    expect(rankingTab("value").textContent).toBe("Best Task per Dollar");
    expect(document.body.textContent).not.toContain("Provider updates");
    expect(document.body.textContent).not.toContain("Most viewed");
    expect(section("new-models-title").textContent).not.toContain(
      "Top quality",
    );
  });

  it("should preserve rankings and retry only the catalog when additions fail to load", async () => {
    vi.mocked(loadDiscoveryCatalog).mockRejectedValueOnce(
      new Error("Unavailable"),
    );
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => {
      expect(buttonNamed("Try again")).toBeDefined();
      expect(rankingLinks("overall")).toHaveLength(3);
    });
    expect(recentLinks()).toHaveLength(0);
    clickButton("Try again");
    await vi.waitFor(() => expect(recentLinks()).toHaveLength(2));
    expect(loadDiscoveryCatalog).toHaveBeenCalledTimes(2);
    expect(loadDiscoveryBenchmarks).toHaveBeenCalledTimes(1);
    expect(buttonNamed("Try again")).toBeUndefined();
  });

  it("should preserve new model modalities and the selected tab when retrying a ranking failure", async () => {
    vi.mocked(loadDiscoveryBenchmarks).mockRejectedValueOnce(
      new Error("Unavailable"),
    );
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => {
      expect(recentLinks()).toHaveLength(2);
      expect(buttonNamed("Retry rankings")).toBeDefined();
    });
    expect(section("new-models-title").textContent).toContain("Text → Audio");
    await selectRanking("value");
    expect(rankingLinks("value")).toHaveLength(0);
    expect(section("ranking-value").textContent).toContain(
      "temporarily unavailable",
    );
    clickButton("Retry rankings");
    await vi.waitFor(() => expect(rankingLinks("value")).toHaveLength(3));
    expect(rankingTab("value").getAttribute("aria-selected")).toBe("true");
    expect(loadDiscoveryBenchmarks).toHaveBeenCalledTimes(2);
    expect(loadDiscoveryCatalog).toHaveBeenCalledTimes(1);
    expect(buttonNamed("Retry rankings")).toBeUndefined();
  });

  it("should show no fabricated rankings when both public sources have no measured results", async () => {
    vi.mocked(loadDiscoveryBenchmarks).mockResolvedValue({
      ...benchmarks,
      asOf: null,
      epochAsOf: null,
      terminalBenchAsOf: null,
      models: [],
    });
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(recentLinks()).toHaveLength(2));
    for (const id of ["overall", "coding", "value"] as const) {
      await selectRanking(id);
      expect(rankingLinks(id)).toHaveLength(0);
      expect(
        section(`ranking-${id}`).textContent?.replace(/\s+/g, " "),
      ).toContain("No published results");
    }
    expect(document.body.textContent).not.toContain("GPT Example");
    expect(document.body.textContent).not.toContain("Gemini Example");
    expect(document.body.textContent).not.toContain("0.00");
  });

  it("should allow switching to coding and value when the Epoch source is unavailable", async () => {
    vi.mocked(loadDiscoveryBenchmarks).mockResolvedValue({
      ...benchmarks,
      epochAsOf: null,
      models: benchmarks.models.filter((model) => model.coding !== null),
    });
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() =>
      expect(
        section("ranking-overall").textContent?.replace(/\s+/g, " "),
      ).toContain("No published results"),
    );
    expect(rankingLinks("overall")).toHaveLength(0);
    expect(section("ranking-overall").textContent).not.toContain("150");
    await selectRanking("coding");
    expect(rankingLinks("coding")).toHaveLength(3);
    await selectRanking("value");
    expect(rankingLinks("value")).toHaveLength(3);
    expect(recentLinks()).toHaveLength(2);
  });

  it("should preserve quality while coding and value show missing-source states", async () => {
    vi.mocked(loadDiscoveryBenchmarks).mockResolvedValue({
      ...benchmarks,
      terminalBenchAsOf: null,
      models: benchmarks.models.filter((model) => model.intelligence !== null),
    });
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(rankingLinks("overall")).toHaveLength(3));
    for (const id of ["coding", "value"] as const) {
      await selectRanking(id);
      expect(rankingLinks(id)).toHaveLength(0);
      expect(
        section(`ranking-${id}`).textContent?.replace(/\s+/g, " "),
      ).toContain("No published results");
    }
    expect(section("ranking-value").textContent).not.toContain("$0");
    await selectRanking("overall");
    expect(rankingLinks("overall")).toHaveLength(3);
    expect(recentLinks()).toHaveLength(2);
  });

  it("should preserve coding scores without inventing value when trial costs are unreported", async () => {
    vi.mocked(loadDiscoveryBenchmarks).mockResolvedValue({
      ...benchmarks,
      models: benchmarks.models.map((model) => ({
        ...model,
        costPerTask: null,
        totalCost: null,
      })),
    });
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(rankingLinks("overall")).toHaveLength(3));
    await selectRanking("coding");
    expect(rankingLinks("coding")).toHaveLength(3);
    await selectRanking("value");
    expect(rankingLinks("value")).toHaveLength(0);
    expect(
      section("ranking-value").textContent?.replace(/\s+/g, " "),
    ).toContain("No published results");
  });

  it("should include the year for older catalog additions", async () => {
    vi.mocked(loadDiscoveryCatalog).mockResolvedValue({
      ...catalog,
      models: [{ ...catalog.models[0], firstSeen: "2025-10-23" }],
    });
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() =>
      expect(section("new-models-title").textContent).toContain(
        "Added Oct 23, 2025",
      ),
    );
  });

  it("should keep rankings and a catalog browse link available when there are no dated additions", async () => {
    vi.mocked(loadDiscoveryCatalog).mockResolvedValue({
      updatedAt: "2026-10-24",
      models: [],
      providers: [],
    });
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() =>
      expect(section("new-models-title").textContent).toContain(
        "No dated model additions",
      ),
    );
    expect(recentLinks()).toHaveLength(0);
    expect(rankingLinks("overall")).toHaveLength(3);
    expect(
      Array.from(document.links).some(
        (link) => link.getAttribute("href") === "/search",
      ),
    ).toBe(true);
  });
});
