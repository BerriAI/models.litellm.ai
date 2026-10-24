// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the browser lifecycle when the test runner resolves Svelte's server entry.
vi.mock("svelte", () => vi.importActual<typeof import("svelte")>("svelte/internal"));
vi.mock("./searchWorker?worker", () => ({
  default: class {
    constructor() {
      throw new Error("Worker unavailable");
    }
  },
}));
vi.mock("./analytics", () => ({
  trackSearch: vi.fn(),
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

let app: App;
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
});
