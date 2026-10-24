// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("svelte", () =>
  vi.importActual<typeof import("svelte")>("svelte/internal"),
);
vi.mock("./discoveryCatalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./discoveryCatalog")>()),
  loadDiscoveryCatalog: vi.fn(),
}));

import DiscoveryUpdates from "./DiscoveryUpdates.svelte";
import {
  loadDiscoveryCatalog,
  type DiscoveryCatalog,
} from "./discoveryCatalog";

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

let component: DiscoveryUpdates;
beforeEach(() => {
  document.body.innerHTML = "";
  vi.mocked(loadDiscoveryCatalog).mockReset().mockResolvedValue(catalog);
});
afterEach(() => component?.$destroy());

function modelLinks(): HTMLAnchorElement[] {
  return Array.from(document.getElementsByTagName("a")).filter((link) =>
    link.getAttribute("aria-label")?.startsWith("Explore "),
  );
}

describe("Discover updates", () => {
  it("should render recent catalog models, provider logos and working detail links", async () => {
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(modelLinks()).toHaveLength(2));
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

  it("should filter model cards by provider while keeping provider discovery available", async () => {
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() => expect(modelLinks()).toHaveLength(2));
    const select = document.getElementById(
      "discovery-provider",
    ) as HTMLSelectElement;
    select.value = "openai";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => {
      expect(modelLinks()).toHaveLength(1);
      expect(modelLinks()[0].getAttribute("href")).toBe("/models/gpt-example");
    });
    expect(document.body.textContent).toContain("Provider updates");
    select.value = "all";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(modelLinks()).toHaveLength(2));
  });

  it("should recover from a failed catalog fetch when the visitor retries", async () => {
    vi.mocked(loadDiscoveryCatalog).mockRejectedValueOnce(
      new Error("Unavailable"),
    );
    component = new DiscoveryUpdates({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("couldn't be loaded"),
    );
    const retry = Array.from(document.getElementsByTagName("button")).find(
      (button) => button.textContent === "Try again",
    );
    expect(retry).toBeDefined();
    retry!.click();
    await vi.waitFor(() => expect(modelLinks()).toHaveLength(2));
    expect(loadDiscoveryCatalog).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).not.toContain("couldn't be loaded");
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
