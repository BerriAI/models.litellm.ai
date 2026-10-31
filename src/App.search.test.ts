// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the browser lifecycle when the test runner resolves Svelte's server entry.
vi.mock("svelte", () =>
  vi.importActual<typeof import("svelte")>("svelte/internal"),
);
vi.mock("./searchWorker?worker", () => ({
  default: class {
    constructor() {
      throw new Error("Worker unavailable");
    }
  },
}));
vi.mock("./analytics", () => ({
  trackSearch: vi.fn(),
  initAnalytics: vi.fn(),
  trackPageView: vi.fn(),
  trackTabChange: vi.fn(),
  trackQuickStartCopy: vi.fn(),
}));
vi.mock("./catalogData", () => ({
  loadCatalogData: vi.fn(async () => ({
    items: [
      {
        name: "claude-sonnet-4",
        mode: "chat",
        litellm_provider: "anthropic",
        input_cost_per_token: 1,
        output_cost_per_token: 2,
        max_input_tokens: 200000,
      },
      {
        name: "kimi-k2",
        mode: "chat",
        litellm_provider: "moonshot",
        input_cost_per_token: 0,
        output_cost_per_token: 0,
        max_input_tokens: 100000,
      },
    ],
    lines: [],
    metadata: Promise.resolve(new Map()),
    fetchedAt: Date.now(),
  })),
}));

import App from "./App.svelte";
import Main from "./Main.svelte";
import { loadCatalogData } from "./catalogData";

let app: App | Main;
beforeEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/search");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}")),
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => {
  app?.$destroy();
  vi.unstubAllGlobals();
});

describe("Models page search", () => {
  it("keeps header search available on Models, focuses it with the shortcut, and submits a new query", async () => {
    window.history.replaceState({}, "", "/");
    app = new Main({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("2 models"),
    );
    const search = document.querySelector<HTMLInputElement>(
      ".hf-header-search input",
    )!;
    expect(search).not.toBeNull();
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(search);
    search.value = "kimi";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    search.form!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => {
      expect(window.location.search).toBe("?q=kimi");
      expect(document.querySelectorAll(".model-row")).toHaveLength(1);
      expect(document.querySelector(".model-row")?.textContent).toContain(
        "Kimi K2",
      );
    });
    expect(document.querySelector(".hf-header-search input")).not.toBeNull();
  });

  it("should replace the initial skeleton with catalog rows when synchronous results settle", async () => {
    app = new App({ target: document.body, props: { compact: true } });
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("2 models");
      expect(document.body.textContent).toContain("Claude Sonnet 4");
      expect(document.body.textContent).toContain("Kimi K2");
      expect(document.querySelector(".skeleton-table")).toBeNull();
    });
  });

  it("should emit the typed query and recover results after a cleared typo search", async () => {
    app = new App({ target: document.body, props: { compact: true } });
    const changed = vi.fn();
    app.$on("querychange", changed);
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("2 models"),
    );
    const input = document.getElementById("query") as HTMLInputElement;
    input.value = "kmi";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("1 model");
      expect(changed.mock.lastCall?.[0].detail).toEqual({ query: "kmi" });
    });
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("2 models"),
    );
  });

  it("should filter by the Mantle provider ID while displaying its name, prices, limits and routing snippet", async () => {
    const mantleModel = "bedrock_mantle/anthropic.claude-opus-5-5";
    vi.mocked(loadCatalogData).mockResolvedValueOnce({
      items: [
        {
          name: mantleModel,
          mode: "chat",
          litellm_provider: "bedrock_mantle",
          input_cost_per_token: 4.4e-6,
          output_cost_per_token: 22e-6,
          max_input_tokens: 1_000_000,
          max_output_tokens: 128_000,
        },
        {
          name: "anthropic.claude-opus-5-5",
          mode: "chat",
          litellm_provider: "bedrock_converse",
          input_cost_per_token: 4e-6,
          output_cost_per_token: 20e-6,
          max_input_tokens: 1_000_000,
          max_output_tokens: 64_000,
        },
      ],
      lines: [],
      metadata: Promise.resolve(new Map()),
      fetchedAt: Date.now(),
    });
    app = new App({ target: document.body, props: { compact: true } });
    await vi.waitFor(() =>
      expect(document.querySelectorAll(".model-row")).toHaveLength(2),
    );

    document
      .querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!
      .click();
    const mantleOption = await vi.waitFor(() => {
      const option = [
        ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
      ].find(
        (candidate) =>
          candidate.textContent?.trim() === "Amazon Bedrock Mantle",
      );
      expect(option).toBeDefined();
      return option!;
    });
    mantleOption.click();

    await vi.waitFor(() => {
      const rows = document.querySelectorAll<HTMLTableRowElement>(".model-row");
      expect(rows).toHaveLength(1);
      expect(rows[0].dataset.name).toBe(mantleModel);
      expect(rows[0].textContent).toContain("Amazon Bedrock Mantle");
      expect(
        [...rows[0].cells].map((cell) => cell.textContent?.trim()),
      ).toEqual(expect.arrayContaining(["$4.40/M", "$22.00/M"]));
    });
    document.querySelector<HTMLTableRowElement>(".model-row")!.click();
    await vi.waitFor(() => {
      const detail = document.querySelector(".expanded-content")!;
      expect(detail.textContent).toContain("Amazon Bedrock Mantle");
      expect(detail.textContent).toContain("128,000 tokens");
      expect(detail.textContent).not.toContain("64,000 tokens");
      expect(detail.querySelector(".code-snippet")?.textContent).toContain(
        `model="${mantleModel}"`,
      );
    });
  });
});

describe("Models landing and route compatibility", () => {
  it.each(["/", "/?q=claude", "/search?q=claude", "/discover?q=claude"])(
    "loads the catalog at %s",
    async (path) => {
      window.history.replaceState({}, "", path);
      app = new Main({ target: document.body });
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain("Claude Sonnet 4"),
      );
      expect(
        document.querySelector(
          'nav[aria-label="Main navigation"] a[aria-current="page"]',
        )?.textContent,
      ).toBe("Models");
      expect(
        document.querySelector('nav[aria-label="Model views"]')?.textContent,
      ).toContain("What's new");
      expect(document.querySelector("summary")?.textContent).toContain(
        "Quick start with LiteLLM",
      );
      expect(
        document.querySelector('input[aria-label="Search models"]'),
      ).not.toBeNull();
      if (path.includes("q="))
        expect(
          document.querySelector<HTMLInputElement>(
            'input[aria-label="Search models"]',
          )?.value,
        ).toBe("claude");
    },
  );
  it("preserves a model query on browser history navigation", async () => {
    window.history.replaceState({}, "", "/?q=claude");
    app = new Main({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Claude Sonnet 4"),
    );
    Array.from(document.querySelectorAll('nav[aria-label="Main navigation"] a'))
      .find((a) => a.textContent === "Benchmarks")
      ?.dispatchEvent(new MouseEvent("click", { button: 0 }));
    await vi.waitFor(() =>
      expect(document.querySelector("h1")?.textContent).toBe("BENCHMARKS"),
    );
    window.history.replaceState({}, "", "/?q=claude");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLInputElement>(
          'input[aria-label="Search models"]',
        )?.value,
      ).toBe("claude"),
    );
    expect(
      document.querySelector(
        'nav[aria-label="Main navigation"] a[aria-current="page"]',
      )?.textContent,
    ).toBe("Models");
  });
});
