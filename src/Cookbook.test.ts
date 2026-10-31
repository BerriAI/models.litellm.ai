// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import Cookbook from "./Cookbook.svelte";
vi.mock("svelte", () =>
  vi.importActual<typeof import("svelte")>("svelte/internal"),
);
let component: Cookbook;
afterEach(() => {
  component?.$destroy();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
it("shows useful guide links without missing-description placeholders", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              title: "First guide",
              url: "https://example.com/first",
              description: "undefined",
            },
            {
              title: "Second guide",
              url: "https://example.com/second",
              description: "A useful integration",
              tags: ["LiteLLM"],
            },
          ]),
          { headers: { "content-type": "application/json" } },
        ),
    ),
  );
  component = new Cookbook({ target: document.body });
  await vi.waitFor(() =>
    expect(document.querySelectorAll("a.guide-card")).toHaveLength(2),
  );
  expect(document.body.textContent).not.toContain("undefined");
  expect(document.body.textContent).toContain("A useful integration");
  expect(document.querySelector("a.guide-card")?.getAttribute("href")).toBe(
    "https://example.com/first",
  );
});
