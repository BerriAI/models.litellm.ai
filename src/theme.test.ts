import { readFileSync } from "node:fs";
import { Window, HTMLButtonElement, HTMLDetailsElement } from "happy-dom";
import { afterEach, describe, expect, it } from "vitest";
import { layout } from "../scripts/seo/html";

const script = readFileSync("public/theme.js", "utf8");
const windows: Window[] = [];
function page(saved?: string) {
  const window = new Window({ url: "https://models.litellm.ai/new-models" });
  windows.push(window);
  if (saved) window.localStorage.setItem("litellm-handoff-theme", saved);
  window.document.write(
    layout({
      title: "New models",
      description: "Model updates",
      path: "/new-models",
      body: "<h1>New models</h1>",
    }),
  );
  window.eval(script);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  return window;
}
afterEach(async () => {
  await Promise.all(windows.splice(0).map((window) => window.happyDOM.close()));
});

describe("theme continuity between the app and generated pages", () => {
  it("uses the app's light default even when no theme is saved", () => {
    expect(page().document.documentElement.dataset.theme).toBe("light");
  });
  it("reads the app's saved theme, toggles it, and restores that choice on the next page", () => {
    const first = page("dark");
    expect(first.document.documentElement.dataset.theme).toBe("dark");
    const toggle = first.document.querySelector<HTMLButtonElement>(
      "[data-theme-toggle]",
    )!;
    expect(toggle.getAttribute("aria-label")).toBe("Switch to light mode");
    toggle.click();
    expect(first.document.documentElement.dataset.theme).toBe("light");
    const next = page(first.localStorage.getItem("litellm-handoff-theme")!);
    expect(next.document.documentElement.dataset.theme).toBe("light");
    expect(
      next.document
        .querySelector("[data-theme-toggle]")!
        .getAttribute("aria-label"),
    ).toBe("Switch to dark mode");
  });
  it("keeps search and secondary navigation usable by keyboard", () => {
    const window = page();
    window.document.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "k", ctrlKey: true }),
    );
    expect(window.document.activeElement?.getAttribute("name")).toBe("q");
    expect(window.document.querySelector("form")?.getAttribute("action")).toBe(
      "/search",
    );
    const menu =
      window.document.querySelector<HTMLDetailsElement>("details.hf-more")!;
    menu.open = true;
    window.document.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape" }),
    );
    expect(menu.open).toBe(false);
  });
});
