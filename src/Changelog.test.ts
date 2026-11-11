// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import Changelog from "./Changelog.svelte";
import Main from "./Main.svelte";
import { track, trackPageView } from "./analytics";
import snapshot from "../scripts/changelog/seed.json";
const catalog = {
  "azure/gpt-5": { litellm_provider: "azure", mode: "chat" },
  "gpt-5": { litellm_provider: "openai", mode: "chat" },
  "vertex_ai/claude-sonnet-4-5@20250929": { litellm_provider: "vertex_ai" },
  "never-changed": { litellm_provider: "azure" },
};
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
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("model_prices")
        ? new Response(JSON.stringify(catalog))
        : String(input).includes("models.dev")
          ? new Response("{}")
          : new Response(JSON.stringify(snapshot)),
    ),
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
  const openBuilder = async () => {
    const details = document.querySelector<HTMLDetailsElement>(".subscribe")!;
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
    await vi.waitFor(() =>
      expect(document.body.textContent).not.toContain("loading the catalog"),
    );
  };
  const modelBoxes = () =>
    Array.from(
      document.querySelectorAll<HTMLInputElement>(".model-grid input"),
    );
  it("builds a feed URL and Slack command from picked model names", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    component = new Changelog({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("GPT-6 Rosalind"),
    );
    await openBuilder();
    expect(track).toHaveBeenCalledWith("Changelog Feed Builder Opened");
    expect(modelBoxes()).toHaveLength(0);
    expect(document.body.textContent).toContain(
      "Tick a provider above to list its models",
    );
    const filter = document.querySelector<HTMLInputElement>(
      ".models .provider-tools input",
    )!;
    const narrow = async (q: string) => {
      filter.value = q;
      filter.dispatchEvent(new Event("input"));
      await tick();
      return modelBoxes().map((i) => i.value);
    };
    const gpt5 = await narrow("gpt-5");
    expect(gpt5.filter((n) => n === "GPT-5")).toHaveLength(1);
    expect(gpt5.every((n) => n.toLowerCase().includes("gpt-5"))).toBe(true);
    expect(await narrow("sonnet 4.5")).toContain("Claude Sonnet 4.5");
    const haiku = await narrow("haiku 4.5");
    expect(haiku).toContain("Claude Haiku 4.5");
    expect(haiku.some((n) => / v\d$/.test(n))).toBe(false);
    await narrow("never");
    expect(modelBoxes().map((i) => i.value)).toEqual(["Never Changed"]);
    modelBoxes()[0].click();
    await tick();
    filter.value = "rosalind";
    filter.dispatchEvent(new Event("input"));
    await tick();
    expect(modelBoxes().map((i) => i.value)).toEqual([
      "Never Changed",
      "GPT-6 Rosalind",
    ]);
    modelBoxes()[1].click();
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
    expect(outputs[0]).toBe(
      "https://models.litellm.ai/changelog.xml?models=Never%20Changed,GPT-6%20Rosalind&digest=1h",
    );
    expect(document.body.textContent).toContain(
      "Following Never Changed, GPT-6 Rosalind, 1 changed in the last 30 days.",
    );
    expect(track).toHaveBeenCalledWith("Changelog Feed Builder Changed", {
      field: "models",
      value: 2,
    });
    expect(outputs[1]).toBe(`/feed subscribe ${outputs[0]}`);
    Array.from(document.querySelectorAll<HTMLButtonElement>(".output button"))
      .find((b) => b.textContent === "Copy Slack command")!
      .click();
    await tick();
    expect(writeText).toHaveBeenCalledWith(outputs[1]);
    expect(track).toHaveBeenCalledWith("Changelog Feed Copied", {
      what: "slack",
      digest: "1h",
      kind: [],
      providers: [],
      models: 2,
    });
    Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        ".models .provider-tools button",
      ),
    )
      .find((b) => b.textContent === "Clear")!
      .click();
    await tick();
    expect(document.querySelector(".output code")?.textContent).toBe(
      "https://models.litellm.ai/changelog.xml?digest=1h",
    );
    const wild = await narrow("gpt-6*");
    expect(wild[0]).toBe("gpt-6*");
    expect(modelBoxes()[0].parentElement?.textContent?.trim()).toBe(
      "All matching gpt-6*",
    );
    expect(wild.slice(1)).toContain("GPT-6 Rosalind");
    expect(
      wild.slice(1).every((n) => n.toLowerCase().startsWith("gpt-6")),
    ).toBe(true);
    modelBoxes()[0].click();
    await tick();
    expect(await narrow("")).toEqual(["gpt-6*"]);
    expect(document.querySelector(".output code")?.textContent).toBe(
      "https://models.litellm.ai/changelog.xml?models=gpt-6*&digest=1h",
    );
    expect(document.body.textContent).toMatch(
      /Following gpt-6\*, [1-9]\d* changed in the last 30 days\./,
    );
  });
  it("narrows the model list to the picked providers and keeps picking when the catalog fails", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) =>
      String(input).includes("model_prices")
        ? new Response("down", { status: 500 })
        : new Response(JSON.stringify(snapshot)),
    );
    component = new Changelog({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("GPT-6 Rosalind"),
    );
    await openBuilder();
    expect(modelBoxes()).toHaveLength(0);
    document
      .querySelector<HTMLInputElement>('.provider-grid input[value="openai"]')!
      .click();
    await tick();
    const shown = modelBoxes().map((i) => i.value);
    expect(shown).toContain("GPT-6 Rosalind");
    expect(shown).not.toContain("Never Changed");
    expect(shown).not.toContain("Claude Haiku 4.5");
    const filter = document.querySelector<HTMLInputElement>(
      ".models .provider-tools input",
    )!;
    filter.value = "haiku";
    filter.dispatchEvent(new Event("input"));
    await tick();
    expect(modelBoxes()).toHaveLength(0);
    expect(document.body.textContent).toContain('No model matches "haiku"');
  });
  it("picks providers from a filterable checklist", async () => {
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
    await vi.waitFor(() =>
      expect(document.body.textContent).not.toContain("loading the catalog"),
    );
    const checked = Array.from(
      document.querySelectorAll<HTMLInputElement>(".model-grid input"),
    )
      .filter((i) => i.checked)
      .map((i) => i.value);
    expect(checked).toEqual(["azure/gpt-5", "Claude Sonnet 4.5"]);
    expect(
      document.querySelector<HTMLInputElement>(
        '.provider-grid input[value="azure"]',
      )!.checked,
    ).toBeTruthy();
  });
});
