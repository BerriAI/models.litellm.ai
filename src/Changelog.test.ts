// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import Changelog from "./Changelog.svelte";
import Main from "./Main.svelte";
import { track, trackPageView } from "./analytics";
import snapshot from "../scripts/changelog/seed.json";
vi.mock("svelte", () =>
  vi.importActual<typeof import("svelte")>("svelte/internal"),
);
vi.mock("./analytics", () => ({
  track: vi.fn(),
  initAnalytics: vi.fn(),
  trackPageView: vi.fn(),
  trackTabChange: vi.fn(),
}));
let component: Changelog | Main;
beforeEach(() => {
  vi.clearAllMocks();
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
  it("tracks the restored page on both Back and Forward", async () => {
    component = new Main({ target: document.body });
    await tick();
    expect(trackPageView).toHaveBeenLastCalledWith("changelog");
    document
      .querySelector<HTMLAnchorElement>('nav a[href="/providers"]')!
      .click();
    await tick();
    expect(trackPageView).toHaveBeenLastCalledWith("providers");

    window.history.back();
    await vi.waitFor(() => {
      expect(window.location.pathname).toBe("/changelog");
      expect(trackPageView).toHaveBeenLastCalledWith("changelog");
    });
    window.history.forward();
    await vi.waitFor(() => {
      expect(window.location.pathname).toBe("/providers");
      expect(trackPageView).toHaveBeenLastCalledWith("providers");
    });
    expect(vi.mocked(trackPageView).mock.calls).toEqual([
      ["changelog"],
      ["providers"],
      ["changelog"],
      ["providers"],
    ]);
  });
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
    const select = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Filter by provider"]',
    )!;
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
  it("builds a feed URL and Slack command from a pasted proxy model list", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    component = new Changelog({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("GPT-6 Rosalind"),
    );
    const known = snapshot.updates[0].entries[0].modelId;
    const textarea = document.querySelector("textarea")!;
    textarea.value = JSON.stringify({
      data: [
        { model_name: "a", litellm_params: { model: known } },
        { model_name: "b", litellm_params: { model: "azure/never-changed" } },
      ],
    });
    textarea.dispatchEvent(new Event("input"));
    await tick();
    const digest =
      document.querySelector<HTMLSelectElement>(".builder select")!;
    digest.value = "1h";
    const querySelector = digest.querySelector.bind(digest);
    digest.querySelector = ((selector: string) =>
      selector === ":checked"
        ? digest.selectedOptions[0] ?? null
        : querySelector(selector)) as typeof digest.querySelector;
    digest.dispatchEvent(new Event("change"));
    await tick();
    const outputs = Array.from(document.querySelectorAll(".output code")).map(
      (c) => c.textContent,
    );
    const knownProvider = known.split("/")[0];
    expect(outputs[0]).toBe(
      `https://models.litellm.ai/changelog.xml?providers=${knownProvider},azure&models=${known},azure/never-changed&digest=1h`,
    );
    expect(
      Array.from(
        document.querySelectorAll<HTMLInputElement>(
          ".provider-grid input:checked",
        ),
      )
        .map((i) => i.value)
        .sort(),
    ).toEqual([knownProvider, "azure"].sort());
    expect(outputs[1]).toBe(`/feed subscribe ${outputs[0]}`);
    expect(document.body.textContent).toContain(
      "2 models, 1 changed in the last 30 days",
    );
    Array.from(document.querySelectorAll<HTMLButtonElement>(".output button"))
      .find((b) => b.textContent === "Copy Slack command")!
      .click();
    await tick();
    expect(writeText).toHaveBeenCalledWith(outputs[1]);
    expect(track).toHaveBeenCalledWith("Changelog Feed Copied", {
      what: "slack",
      digest: "1h",
      kind: [],
      providers: [knownProvider, "azure"],
      models: 2,
    });
  });
  it("picks providers from a filterable checklist and fills the Models box from an example", async () => {
    component = new Changelog({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("GPT-6 Rosalind"),
    );
    const all = document.querySelectorAll(".provider-grid input").length;
    expect(all).toBeGreaterThan(1);
    const filter = document.querySelector<HTMLInputElement>(
      ".provider-tools input",
    )!;
    filter.value = "vertex";
    filter.dispatchEvent(new Event("input"));
    await tick();
    const shown = Array.from(
      document.querySelectorAll<HTMLInputElement>(".provider-grid input"),
    ).map((i) => i.value);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(all);
    expect(shown.every((id) => id.includes("vertex"))).toBe(true);
    const buttons = () =>
      Array.from(
        document.querySelectorAll<HTMLButtonElement>(".provider-tools button"),
      );
    expect(buttons()[0].textContent).toBe("Select shown");
    buttons()[0].click();
    await tick();
    expect(document.querySelector(".output code")?.textContent).toBe(
      `https://models.litellm.ai/changelog.xml?providers=${shown.join(",")}`,
    );
    expect(document.body.textContent).toContain(
      `${shown.length} of ${all} selected`,
    );
    buttons()[1].click();
    await tick();
    expect(document.querySelector(".output code")?.textContent).toBe(
      "https://models.litellm.ai/changelog.xml",
    );
    Array.from(document.querySelectorAll<HTMLButtonElement>(".examples button"))
      .find((b) => b.textContent === "config.yaml")!
      .click();
    await tick();
    expect(document.querySelector("textarea")!.value).toContain(
      "model: azure/gpt-5",
    );
    expect(document.querySelector(".output code")?.textContent).toContain(
      "models=azure/gpt-5,bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0,vertex_ai/gemini-2.5-pro",
    );
    expect(track).toHaveBeenCalledWith("Changelog Feed Example Shown", {
      format: "yaml",
    });
  });
  it("opens the builder prefilled from a shared link's query string", async () => {
    window.history.replaceState(
      {},
      "",
      "/changelog?models=azure/gpt-5,Claude%20Sonnet%204.5&providers=azure&digest=4h&kind=price",
    );
    component = new Changelog({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("GPT-6 Rosalind"),
    );
    expect(document.querySelector<HTMLDetailsElement>(".subscribe")!.open).toBe(
      true,
    );
    expect(document.querySelector(".output code")?.textContent).toBe(
      "https://models.litellm.ai/changelog.xml?kind=price&providers=azure&models=azure/gpt-5,Claude%20Sonnet%204.5&digest=4h",
    );
  });
});
