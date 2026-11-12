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
      expect(document.body.textContent).not.toContain("Loading the catalog"),
    );
  };
  const row = (id: string) =>
    document.querySelector<HTMLLIElement>(`.provider[data-provider="${id}"]`)!;
  const wholeBox = (id: string) =>
    row(id).querySelector<HTMLInputElement>(".row input")!;
  const expand = async (id: string) => {
    row(id).querySelector<HTMLButtonElement>(".expand")!.click();
    await tick();
  };
  const modelBoxes = (id: string) =>
    Array.from(row(id).querySelectorAll<HTMLInputElement>(".model-grid input"));
  const tickModel = async (id: string, name: string) => {
    modelBoxes(id)
      .find((box) => box.value === name)!
      .click();
    await tick();
  };
  const chips = () =>
    Array.from(document.querySelectorAll(".chip")).map((c) =>
      c.textContent!.replace(/×$/, "").replace(/\s+/g, " ").trim(),
    );
  const url = () => document.querySelector(".output code")?.textContent;
  it("follows a ticked provider whole and ticked models on that provider only", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    component = new Changelog({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("GPT-6 Rosalind"),
    );
    await openBuilder();
    expect(track).toHaveBeenCalledWith("Changelog Feed Builder Opened");
    expect(document.querySelector(".model-grid")).toBeNull();
    expect(chips()).toEqual([]);
    expect(document.body.textContent).toContain(
      "Nothing ticked follows every provider.",
    );
    wholeBox("openai").click();
    await tick();
    expect(url()).toBe("https://models.litellm.ai/changelog.xml?all=openai");
    expect(row("openai").textContent).toMatch(/all \d+ models/);
    expect(chips()).toEqual(["OpenAI all models"]);
    expect(track).toHaveBeenCalledWith("Changelog Feed Builder Changed", {
      field: "all",
      value: 1,
    });
    const posts = Number(
      document.body.textContent?.match(
        /([1-9]\d*) posts in the last 30 days\./,
      )?.[1],
    );
    expect(posts).toBeGreaterThan(0);
    await expand("azure");
    expect(
      row("azure").querySelector(".expand")!.getAttribute("aria-expanded"),
    ).toBe("true");
    expect(track).toHaveBeenCalledWith(
      "Changelog Feed Builder Provider Toggled",
      { provider: "azure", open: true },
    );
    await vi.waitFor(() =>
      expect(modelBoxes("azure").map((box) => box.value)).toContain(
        "Never Changed",
      ),
    );
    const azureModels = modelBoxes("azure").map((box) => box.value);
    expect(azureModels).toContain("GPT-5");
    expect(azureModels).toContain("GPT-6 Astra");
    expect(azureModels).not.toContain("GPT-6 Rosalind");
    expect(azureModels).toEqual(
      [...azureModels].sort((a, b) => a.localeCompare(b)),
    );
    expect(modelBoxes("openai")).toEqual([]);
    await tickModel("azure", "GPT-5");
    expect(url()).toBe(
      "https://models.litellm.ai/changelog.xml?all=openai&models=azure:GPT-5",
    );
    expect(wholeBox("azure").checked).toBe(false);
    expect(wholeBox("azure").indeterminate).toBe(true);
    expect(row("azure").textContent).toMatch(/1 of \d+ models/);
    expect(chips()).toEqual(["OpenAI all models", "GPT-5 Azure OpenAI"]);
    expect(document.body.textContent).toContain("1 whole, 1 partial of");
    expect(track).toHaveBeenCalledWith("Changelog Feed Builder Changed", {
      field: "models",
      value: 1,
    });
    expect(
      Number(
        document.body.textContent?.match(
          /([1-9]\d*) posts in the last 30 days\./,
        )?.[1],
      ),
    ).toBeGreaterThan(posts);
    await tickModel("azure", "GPT-6 Astra");
    expect(url()).toBe(
      "https://models.litellm.ai/changelog.xml?all=openai&models=azure:GPT-5,azure:GPT-6%20Astra",
    );
    await tickModel("azure", "GPT-5");
    expect(url()).toBe(
      "https://models.litellm.ai/changelog.xml?all=openai&models=azure:GPT-6%20Astra",
    );
    wholeBox("azure").click();
    await tick();
    expect(url()).toBe(
      "https://models.litellm.ai/changelog.xml?all=openai,azure",
    );
    expect(wholeBox("azure").indeterminate).toBe(false);
    expect(
      modelBoxes("azure").every((box) => box.checked && box.disabled),
    ).toBe(true);
    wholeBox("openai").click();
    await tick();
    expect(url()).toBe("https://models.litellm.ai/changelog.xml?all=azure");
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
      "https://models.litellm.ai/changelog.xml?all=azure&digest=1h",
    );
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
      providers: ["azure"],
      models: 0,
    });
    document
      .querySelector<HTMLButtonElement>(
        '.chip button[aria-label="Stop following Azure OpenAI"]',
      )!
      .click();
    await tick();
    expect(url()).toBe("https://models.litellm.ai/changelog.xml?digest=1h");
    expect(chips()).toEqual([]);
    await expand("azure");
    expect(modelBoxes("azure")).toEqual([]);
  });
  it("lists a provider's recent models when the catalog fails", async () => {
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
    await expand("openai");
    const names = modelBoxes("openai").map((box) => box.value);
    expect(names).toContain("GPT-6 Rosalind");
    expect(names).not.toContain("Never Changed");
    await tickModel("openai", "GPT-6 Rosalind");
    expect(url()).toBe(
      "https://models.litellm.ai/changelog.xml?models=openai:GPT-6%20Rosalind",
    );
    expect(document.body.textContent).toContain("1 post in the last 30 days.");
  });
  it("picks providers from a filterable checklist", async () => {
    component = new Changelog({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("GPT-6 Rosalind"),
    );
    const all = document.querySelectorAll(".provider-list .row input").length;
    expect(all).toBeGreaterThan(1);
    const filter = document.querySelector<HTMLInputElement>(
      ".provider-tools input",
    )!;
    filter.value = "vertex";
    filter.dispatchEvent(new Event("input"));
    await tick();
    const shown = Array.from(
      document.querySelectorAll<HTMLLIElement>(".provider"),
    ).map((li) => li.dataset.provider!);
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
    expect(url()).toBe(
      `https://models.litellm.ai/changelog.xml?all=${shown.join(",")}`,
    );
    expect(document.body.textContent).toContain(
      `${shown.length} whole, 0 partial of ${all}`,
    );
    buttons()[1].click();
    await tick();
    expect(url()).toBe("https://models.litellm.ai/changelog.xml");
  });
  it("opens the builder prefilled from a shared link, reading an old providers+models link as those models on those providers", async () => {
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
    expect(url()).toBe(
      "https://models.litellm.ai/changelog.xml?kind=price&models=azure:azure/gpt-5,azure:Claude%20Sonnet%204.5&digest=4h",
    );
    await vi.waitFor(() =>
      expect(document.body.textContent).not.toContain("Loading the catalog"),
    );
    expect(chips()).toEqual([
      "azure/gpt-5 Azure OpenAI",
      "Claude Sonnet 4.5 Azure OpenAI",
    ]);
    expect(wholeBox("azure").indeterminate).toBe(true);
    expect(modelBoxes("azure").length).toBeGreaterThan(0);
    expect(
      modelBoxes("azure")
        .filter((box) => box.checked)
        .map((box) => box.value),
    ).toEqual(["GPT-5"]);
    expect(modelBoxes("openai")).toEqual([]);
  });
  it("keeps whole providers and everywhere models from a new-form link", async () => {
    window.history.replaceState(
      {},
      "",
      "/changelog?all=openai&models=azure:gpt-5,gpt-6*",
    );
    component = new Changelog({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("GPT-6 Rosalind"),
    );
    expect(url()).toBe(
      "https://models.litellm.ai/changelog.xml?all=openai&models=azure:gpt-5,gpt-6*",
    );
    expect(wholeBox("openai").checked).toBe(true);
    expect(chips()).toEqual([
      "OpenAI all models",
      "gpt-5 Azure OpenAI",
      "All matching gpt-6* every provider",
    ]);
    document
      .querySelector<HTMLButtonElement>(
        '.chip button[aria-label="Stop following All matching gpt-6*"]',
      )!
      .click();
    await tick();
    expect(url()).toBe(
      "https://models.litellm.ai/changelog.xml?all=openai&models=azure:gpt-5",
    );
    window.history.replaceState({}, "", "/changelog?providers=azure");
    component.$destroy();
    component = new Changelog({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("GPT-6 Rosalind"),
    );
    expect(url()).toBe("https://models.litellm.ai/changelog.xml?all=azure");
  });
});
