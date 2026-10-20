// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest";
import { CALCULATOR_PAGE_JS } from "./calculator";
import { TOOL_JS, toolBody } from "./compare-tool";
import { calculatorBody, type CalcModel } from "./html";

const run = (script: string) =>
  new Function(script.replace(/^<script>|<\/script>$/g, ""))();

const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));

const type = (el: HTMLInputElement, text: string) => {
  el.value = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

const model = (slug: string, name: string, intro?: string): CalcModel => ({
  slug,
  name,
  input: 1,
  output: 2,
  providers: 1,
  ...(intro ? { intro } : {}),
});

const MODELS = [
  model("gpt-oss-120b", "GPT OSS 120B"),
  model("gpt-5-5", "GPT-5.5"),
  model("gpt-5", "GPT-5"),
  model("claude-opus-5-5", "Claude Opus 5.5"),
  model("gemini-4-argon", "Gemini 4 Argon", "November 30, 2026"),
];

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("calculator model picker", () => {
  const open = (search = "") => {
    history.replaceState(null, "", `/calculator${search}`);
    document.body.innerHTML = calculatorBody(
      MODELS,
      "claude-opus-5-5",
      [],
      "2026-10-20",
    );
    run(CALCULATOR_PAGE_JS);
    const box = document.querySelector<HTMLInputElement>(".calc-pick")!;
    box.dispatchEvent(new Event("focus"));
    return box;
  };
  const picked = () =>
    document.querySelector<HTMLInputElement>('[name="model"]')!.value;
  const introNote = () =>
    document.querySelector<HTMLElement>("[data-r=intro]")!;

  test("an exact name is picked before longer names that contain it", () => {
    const box = open();
    type(box, "gpt-5");
    key(box, "Enter");
    expect(picked()).toBe("gpt-5");
  });

  test("Enter on a freshly opened list keeps the current model", () => {
    const box = open();
    key(box, "Enter");
    expect(picked()).toBe("claude-opus-5-5");
  });

  test("Tab after typing takes the highlighted match", () => {
    const box = open();
    type(box, "gpt-5.5");
    key(box, "Tab");
    expect(picked()).toBe("gpt-5-5");
  });

  test("a model key that is not a model, like constructor, falls back to the default", () => {
    const box = open("?model=constructor");
    expect(picked()).toBe("claude-opus-5-5");
    expect(box.placeholder || box.value).toBe("Claude Opus 5.5");
  });

  test("an introductory price shows its end date in the list and under the picked model", () => {
    const box = open();
    type(box, "argon");
    expect(document.getElementById("calc-list")!.textContent).toContain(
      "introductory price until November 30, 2026",
    );
    expect(introNote().hidden).toBe(true);
    key(box, "Enter");
    expect(introNote().hidden).toBe(false);
    expect(introNote().textContent).toBe(
      "Introductory price until November 30, 2026",
    );
    type(box, "opus");
    key(box, "Enter");
    expect(introNote().hidden).toBe(true);
  });

  test("a shared link to an introductory model shows the end date on load", () => {
    open("?model=gemini-4-argon");
    expect(introNote().hidden).toBe(false);
    expect(introNote().textContent).toContain("November 30, 2026");
  });
});

describe("comparison tool picker", () => {
  const data = {
    models: Object.fromEntries(
      MODELS.map((m) => [
        m.slug,
        {
          n: m.name,
          by: "Lab",
          in: m.input,
          out: m.output,
          ctx: 128_000,
          p: 1,
          f: {},
        },
      ]),
    ),
    pairs: [],
    asOf: null,
  };
  const open = async (d: object = data) => {
    history.replaceState(null, "", "/compare/custom");
    vi.stubGlobal("fetch", async () => ({ json: async () => d }));
    document.body.innerHTML = toolBody();
    run(TOOL_JS);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const box = document.querySelector<HTMLInputElement>("[data-add]")!;
    box.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    return box;
  };
  const added = () => new URLSearchParams(location.search).get("models");

  test("an exact name is added before longer names that contain it", async () => {
    const box = await open();
    type(box, "gpt-5");
    key(box, "Enter");
    expect(added()).toBe("gpt-5");
  });

  test("Enter on a freshly opened list adds nothing and marks no row active", async () => {
    const box = await open();
    expect(box.hasAttribute("aria-activedescendant")).toBe(false);
    key(box, "Enter");
    expect(added()).toBeNull();
  });

  test("every match is listed, not the first 40", async () => {
    const many = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [
        `m-${i}`,
        { n: `Model ${i}`, by: "Lab", in: 1, out: 2, ctx: 1, p: 1, f: {} },
      ]),
    );
    const box = await open({ models: many, pairs: [], asOf: null });
    type(box, "model");
    expect(document.querySelectorAll("#ct-list [data-i]").length).toBe(60);
  });
});
