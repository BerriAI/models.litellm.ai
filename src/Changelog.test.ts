// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import Changelog from "./Changelog.svelte";
import Main from "./Main.svelte";
import snapshot from "../scripts/changelog/seed.json";
vi.mock("svelte", () =>
  vi.importActual<typeof import("svelte")>("svelte/internal"),
);
vi.mock("./analytics", () => ({
  initAnalytics: vi.fn(),
  trackPageView: vi.fn(),
  trackTabChange: vi.fn(),
}));
let component: Changelog | Main;
beforeEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/changelog");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(snapshot))),
  );
});
afterEach(() => {
  component?.$destroy();
  vi.unstubAllGlobals();
});
describe("Changelog page", () => {
  it("opens directly and puts Changelog immediately after Benchmarks", async () => {
    component = new Main({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("GPT-6 Rosalind"),
    );
    const nav = Array.from(
      document.querySelectorAll('nav[aria-label="Main navigation"] a'),
    );
    expect(nav.map((a) => a.textContent?.trim())).toEqual([
      "Models",
      "Providers",
      "Benchmarks",
      "Changelog",
    ]);
    expect(nav[3].getAttribute("aria-current")).toBe("page");
    expect(document.title).toBe("Model Changelog | LiteLLM");
    expect(document.querySelector('a[href="/changelog.xml"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain(
      "this may be a pricing correction",
    );
  });
  it("combines query/provider/type filters and expands exact changed rates", async () => {
    component = new Changelog({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("GPT-6 Rosalind"),
    );
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search updates"]',
    )!;
    input.value = "qwen3.7";
    input.dispatchEvent(new Event("input"));
    await tick();
    expect(document.body.textContent).toContain("Input decreased $2.5");
    const select = document.querySelector<HTMLSelectElement>("select")!;
    select.selectedIndex = Array.from(select.options).findIndex(
      (option) => option.value === "together_ai",
    );
    expect(select.value).toBe("together_ai");
    // happy-dom 20 only implements :checked for inputs; Svelte uses it for selects.
    // The real combined filters are also verified in the browser.
    const querySelector = select.querySelector.bind(select);
    select.querySelector = ((selector: string) =>
      selector === ":checked"
        ? select.selectedOptions[0] ?? null
        : querySelector(selector)) as typeof select.querySelector;
    select.dispatchEvent(new Event("change"));
    await tick();
    expect(document.body.textContent).toContain("Input decreased $2.5");
    Array.from(document.querySelectorAll("nav button"))
      .find((b) => b.textContent === "Prices")
      ?.dispatchEvent(new MouseEvent("click"));
    await tick();
    expect(document.body.textContent).toContain(
      "Input decreased $2.5 → $1.5 (−40%) / 1M tokens",
    );
    expect(document.body.textContent).not.toContain("GPT-6 Rosalind");
    document.querySelector<HTMLButtonElement>("article button")!.click();
    await tick();
    expect(document.querySelector(".details")?.textContent).toContain(
      "Input cost per token",
    );
  });
  it("offers a retry after fetch failure without showing a stale sample feed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(new Response(JSON.stringify(snapshot))),
    );
    component = new Changelog({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Couldn't load updates"),
    );
    Array.from(document.querySelectorAll("button"))
      .find((b) => b.textContent === "Try again")!
      .click();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("GPT-6 Rosalind"),
    );
  });
});
