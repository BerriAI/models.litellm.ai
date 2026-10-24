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
  loadDiscoveryBenchmarks,
  type DiscoveryBenchmarkCatalog,
} from "./discoveryBenchmarks";

const anthropic = {
  id: "anthropic",
  name: "Anthropic",
  logo: "/provider-logos/anthropic.svg",
  href: "/providers/anthropic",
};
const openai = {
  id: "openai",
  name: "OpenAI",
  logo: "/provider-logos/openai.svg",
  href: "/providers/openai",
};
const catalog: DiscoveryCatalog = {
  updatedAt: "2026-10-24",
  models: [
    {
      slug: "claude-example",
      name: "Claude Example",
      lab: "Anthropic",
      logo: anthropic.logo,
      href: "/models/claude-example",
      firstSeen: "2026-10-23",
      price: "$1 / $2 per 1M tokens",
      context: 200000,
      providers: [anthropic],
    },
    {
      slug: "gpt-example",
      name: "GPT Example",
      lab: "OpenAI",
      logo: openai.logo,
      href: "/models/gpt-example",
      firstSeen: "2026-10-20",
      price: null,
      context: null,
      providers: [openai],
    },
  ],
  providers: [
    {
      ...anthropic,
      modelCount: 20,
      recentModelCount: 1,
      latestModelDate: "2026-10-23",
      latestModelName: "Claude Example",
    },
    {
      ...openai,
      modelCount: 40,
      recentModelCount: 1,
      latestModelDate: "2026-10-20",
      latestModelName: "GPT Example",
    },
  ],
};

const benchmarks: DiscoveryBenchmarkCatalog = {
  asOf: "2026-10-24",
  models: [
    {
      slug: "claude-example",
      name: "Claude Example",
      lab: "Anthropic",
      href: "/models/claude-example",
      inputPrice: 1,
      outputPrice: 2,
      provider: "anthropic",
      eci: { score: 55, date: "2026-10-20" },
      scores: [
        {
          benchmark: "DeepSWE",
          score: 0.8,
          setting: "high",
          date: "2026-10-20",
          sourceUrl: "https://deepswe.datacurve.ai/",
        },
        {
          benchmark: "GPQA Diamond",
          score: 0.7,
          setting: "high",
          date: "2026-10-20",
          sourceUrl: "https://epoch.ai/benchmarks/gpqa-diamond",
        },
      ],
      valueRuns: [
        {
          benchmark: "DeepSWE",
          score: 0.8,
          costPerTask: 0.4,
          setting: "high",
          date: "2026-10-20",
          sourceUrl: "https://deepswe.datacurve.ai/",
          modelVersion: "claude-example_high",
          harness: "published-harness",
        },
        {
          benchmark: "ARC-AGI-2",
          score: 0.75,
          costPerTask: 0.25,
          setting: "high",
          date: "2026-10-20",
          sourceUrl: "https://arcprize.org/leaderboard",
          modelVersion: "claude-example_high",
          harness: "published-harness",
        },
      ],
    },
    {
      slug: "gpt-example",
      name: "GPT Example",
      lab: "OpenAI",
      href: "/models/gpt-example",
      inputPrice: 5,
      outputPrice: 10,
      provider: "openai",
      eci: { score: 62, date: "2026-10-21" },
      scores: [
        {
          benchmark: "DeepSWE",
          score: 0.6,
          setting: "medium",
          date: "2026-10-21",
          sourceUrl: "https://deepswe.datacurve.ai/",
        },
        {
          benchmark: "GPQA Diamond",
          score: 0.9,
          setting: "medium",
          date: "2026-10-21",
          sourceUrl: "https://epoch.ai/benchmarks/gpqa-diamond",
        },
      ],
      valueRuns: [
        {
          benchmark: "DeepSWE",
          score: 0.6,
          costPerTask: 0.1,
          setting: "medium",
          date: "2026-10-21",
          sourceUrl: "https://deepswe.datacurve.ai/",
          modelVersion: "gpt-example_medium",
          harness: "published-harness",
        },
        {
          benchmark: "ARC-AGI-2",
          score: 0.95,
          costPerTask: 0.5,
          setting: "medium",
          date: "2026-10-21",
          sourceUrl: "https://arcprize.org/leaderboard",
          modelVersion: "gpt-example_medium",
          harness: "published-harness",
        },
      ],
    },
  ],
};

let component: DiscoveryUpdates;
beforeEach(() => {
  document.body.innerHTML = "";
  vi.mocked(loadDiscoveryCatalog).mockReset().mockResolvedValue(catalog);
  vi.mocked(loadDiscoveryBenchmarks).mockReset().mockResolvedValue(benchmarks);
});
afterEach(() => component?.$destroy());

function modelLinks(): HTMLAnchorElement[] {
  return Array.from(document.getElementsByTagName("a")).filter((link) =>
    link.getAttribute("aria-label")?.startsWith("Explore "),
  );
}

function modelHrefs(): Array<string | null> {
  return modelLinks().map((link) => link.getAttribute("href"));
}

function clickButton(name: string): void {
  const button = Array.from(document.getElementsByTagName("button")).find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  expect(button, `Button ${name} should be available`).toBeDefined();
  button!.click();
}

function chooseOption(id: string, value: string): void {
  const select = document.getElementById(id) as HTMLSelectElement;
  expect(select).not.toBeNull();
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("Discover updates", () => {
  it("should render recent catalog models, provider logos and working detail links", async () => {
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(modelLinks()).toHaveLength(2));
    expect(document.getElementsByTagName("h1")[0]?.textContent).toBe(
      "Discover models",
    );
    expect(modelLinks().map((link) => link.getAttribute("href"))).toEqual([
      "/models/claude-example",
      "/models/gpt-example",
    ]);
    expect(document.body.textContent).toContain("Added Oct 23");
    expect(document.body.textContent).toContain("Updated Oct 24");
    expect(document.body.textContent).toContain("Provider updates");
    expect(document.body.textContent).toContain("Pricing not listed");
    expect(
      Array.from(document.getElementsByTagName("img")).some(
        (img) => img.getAttribute("src") === anthropic.logo,
      ),
    ).toBe(true);
    expect(document.body.textContent).not.toContain("Most viewed");
  });

  it("should filter new models by provider while keeping provider discovery available", async () => {
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(modelLinks()).toHaveLength(2));
    chooseOption("discovery-provider", "openai");
    await vi.waitFor(() => {
      expect(modelLinks()).toHaveLength(1);
      expect(modelLinks()[0].getAttribute("href")).toBe("/models/gpt-example");
    });
    expect(document.body.textContent).toContain("Provider updates");
    chooseOption("discovery-provider", "all");
    await vi.waitFor(() => expect(modelLinks()).toHaveLength(2));
  });

  it("should switch between new, quality and value lists while preserving the provider selection", async () => {
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(modelLinks()).toHaveLength(2));
    chooseOption("discovery-provider", "openai");
    await vi.waitFor(() => expect(modelLinks()).toHaveLength(1));

    clickButton("Top quality");
    await vi.waitFor(() => {
      expect(modelHrefs()).toEqual([
        "/models/gpt-example",
        "/models/claude-example",
      ]);
      expect(document.getElementById("quality-benchmark")).not.toBeNull();
      expect(document.getElementById("discovery-provider")).toBeNull();
    });
    clickButton("Best value");
    await vi.waitFor(() => {
      expect(document.getElementById("value-benchmark")).not.toBeNull();
      expect(modelLinks()).toHaveLength(2);
    });
    clickButton("New models");
    await vi.waitFor(() => {
      expect(modelHrefs()).toEqual(["/models/gpt-example"]);
      expect(
        (document.getElementById("discovery-provider") as HTMLSelectElement)
          .value,
      ).toBe("openai");
    });
  });

  it("should rank the selected quality benchmark and show its source", async () => {
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(modelLinks()).toHaveLength(2));
    clickButton("Top quality");
    await vi.waitFor(() =>
      expect(document.getElementById("quality-benchmark")).not.toBeNull(),
    );
    chooseOption("quality-benchmark", "coding");
    await vi.waitFor(() => {
      expect(modelHrefs()).toEqual([
        "/models/claude-example",
        "/models/gpt-example",
      ]);
      expect(modelLinks()[0].textContent).toContain("80.0%");
      expect(modelLinks()[0].textContent).toContain("high");
    });
    chooseOption("quality-benchmark", "reasoning");
    await vi.waitFor(() => {
      expect(modelHrefs()[0]).toBe("/models/gpt-example");
      expect(modelLinks()[0].textContent).toContain("90.0%");
      expect(
        Array.from(document.links).some(
          (link) =>
            link.getAttribute("href") ===
            "https://epoch.ai/benchmarks/gpqa-diamond",
        ),
      ).toBe(true);
    });
    chooseOption("quality-benchmark", "math");
    await vi.waitFor(() => {
      expect(modelLinks()).toHaveLength(0);
      expect(document.body.textContent).toContain(
        "No matched results for this benchmark yet.",
      );
    });
  });

  it("should filter measured value runs by the selected minimum success rate", async () => {
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(modelLinks()).toHaveLength(2));
    clickButton("Best value");
    await vi.waitFor(() => {
      expect(modelHrefs()[0]).toBe("/models/gpt-example");
      expect(modelLinks()[0].textContent).toContain("60.0% solved");
      expect(modelLinks()[0].textContent).toContain("$0.10 / attempt");
    });
    chooseOption("minimum-success", "0.7");
    await vi.waitFor(() => {
      expect(modelHrefs()).toEqual(["/models/claude-example"]);
      expect(document.body.textContent).toContain("≥70.0% success");
    });
    chooseOption("minimum-success", "0.9");
    await vi.waitFor(() => {
      expect(modelLinks()).toHaveLength(0);
      expect(document.body.textContent).toContain(
        "No measured runs meet this success rate yet.",
      );
    });
    chooseOption("minimum-success", "0");
    await vi.waitFor(() => expect(modelLinks()).toHaveLength(2));
  });

  it("should switch value tasks and keep the highlight task selection in sync", async () => {
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(modelLinks()).toHaveLength(2));
    clickButton("Best value");
    await vi.waitFor(() =>
      expect(document.getElementById("value-benchmark")).not.toBeNull(),
    );
    chooseOption("value-benchmark", "reasoning");
    await vi.waitFor(() => {
      expect(modelHrefs()).toEqual([
        "/models/claude-example",
        "/models/gpt-example",
      ]);
      expect(modelLinks()[0].textContent).toContain("75.0% solved");
      expect(modelLinks()[0].textContent).toContain("$0.25 / attempt");
      expect(
        (document.getElementById("highlight-task") as HTMLSelectElement).value,
      ).toBe("reasoning");
    });
    chooseOption("highlight-task", "coding");
    await vi.waitFor(() => {
      expect(modelHrefs()[0]).toBe("/models/gpt-example");
      expect(
        (document.getElementById("value-benchmark") as HTMLSelectElement).value,
      ).toBe("coding");
    });
  });

  it("should keep rankings available and retry only the catalog when catalog loading fails", async () => {
    vi.mocked(loadDiscoveryCatalog).mockRejectedValueOnce(
      new Error("Unavailable"),
    );
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("couldn't be loaded"),
    );
    clickButton("Top quality");
    await vi.waitFor(() => expect(modelHrefs()[0]).toBe("/models/gpt-example"));
    clickButton("New models");
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        "Recent additions couldn't be loaded.",
      ),
    );
    clickButton("Try again");
    await vi.waitFor(() => expect(modelLinks()).toHaveLength(2));
    expect(loadDiscoveryCatalog).toHaveBeenCalledTimes(2);
    expect(loadDiscoveryBenchmarks).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain("couldn't be loaded");
  });

  it("should keep new models available and retry only benchmarks when scoring loading fails", async () => {
    vi.mocked(loadDiscoveryBenchmarks).mockRejectedValueOnce(
      new Error("Unavailable"),
    );
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(modelLinks()).toHaveLength(2));
    expect(document.body.textContent).toContain("Added Oct 23");
    clickButton("Top quality");
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        "Benchmark results couldn't be loaded.",
      ),
    );
    expect(document.body.textContent).toContain("Provider updates");
    clickButton("Retry benchmarks");
    await vi.waitFor(() => expect(modelHrefs()[0]).toBe("/models/gpt-example"));
    expect(loadDiscoveryBenchmarks).toHaveBeenCalledTimes(2);
    expect(loadDiscoveryCatalog).toHaveBeenCalledTimes(1);
    clickButton("New models");
    await vi.waitFor(() => {
      expect(modelHrefs()).toEqual([
        "/models/claude-example",
        "/models/gpt-example",
      ]);
      expect(document.body.textContent).toContain("Added Oct 23");
    });
  });

  it("should include the year for older catalog additions", async () => {
    vi.mocked(loadDiscoveryCatalog).mockResolvedValue({
      ...catalog,
      models: [{ ...catalog.models[0], firstSeen: "2025-10-23" }],
    });
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Added Oct 23, 2025"),
    );
  });

  it("should show a useful empty state without inventing models or provider updates", async () => {
    vi.mocked(loadDiscoveryCatalog).mockResolvedValue({
      updatedAt: "2026-10-24",
      models: [],
      providers: [],
    });
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("No dated model additions"),
    );
    expect(modelLinks()).toHaveLength(0);
    expect(document.body.textContent).not.toContain("Provider updates");
    expect(
      Array.from(document.links).some(
        (link) => link.getAttribute("href") === "/search",
      ),
    ).toBe(true);
  });
});
