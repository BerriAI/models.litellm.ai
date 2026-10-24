// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("svelte", () =>
  vi.importActual<typeof import("svelte")>("svelte/internal"),
);
vi.mock("./analytics", () => ({ trackSearch: vi.fn() }));

import Providers from "./Providers.svelte";

let app: Providers;
let catalogAvailable = true;
let catalogResponse: unknown;
beforeEach(() => {
  document.body.innerHTML = "";
  catalogAvailable = true;
  catalogResponse = { zai: "/providers/zai" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/provider-catalog.json") {
        if (!catalogAvailable) throw new Error("Catalog pages unavailable");
        return new Response(JSON.stringify(catalogResponse));
      }
      return new Response(
        JSON.stringify({
          providers: {
            zai: {
              display_name: "Z.AI",
              url: "https://docs.litellm.ai/docs/providers/zai",
              endpoints: { chat_completions: true },
            },
            "vertex_ai/agent_engine": {
              display_name: "Vertex AI Agent Engine",
              url: "https://docs.litellm.ai/docs/providers/vertex_ai/agent_engine",
              endpoints: { chat_completions: true },
            },
          },
        }),
      );
    }),
  );
});
afterEach(() => {
  app?.$destroy();
  vi.unstubAllGlobals();
});

describe("provider catalog navigation", () => {
  it("should render the provider directory", async () => {
    app = new Providers({ target: document.body });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Z.AI"));
    expect(document.body.textContent).toContain("Browse the current catalog");
  });

  it("should give Z.AI separate current-model and setup-doc links", async () => {
    app = new Providers({ target: document.body });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Z.AI"));
    const links = Array.from(document.links);
    const models = links.find(
      (link) => link.getAttribute("aria-label") === "Models & pricing for Z.AI",
    )!;
    const docs = links.find(
      (link) => link.getAttribute("aria-label") === "Setup docs for Z.AI",
    )!;
    expect(models.getAttribute("href")).toBe("/providers/zai");
    expect(models.target).toBe("");
    expect(docs.href).toBe("https://docs.litellm.ai/docs/providers/zai");
    expect(docs.rel).toContain("noopener");
  });

  it("should keep models accessible when generated catalog pages are unavailable", async () => {
    catalogAvailable = false;
    app = new Providers({ target: document.body });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Z.AI"));
    const models = Array.from(document.links).find(
      (link) => link.getAttribute("aria-label") === "Models & pricing for Z.AI",
    )!;
    expect(models.getAttribute("href")).toBe("/search?provider=zai");
  });

  it("should encode provider IDs that contain a slash", async () => {
    app = new Providers({ target: document.body });
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("Vertex AI Agent Engine"),
    );
    const link = Array.from(document.links).find(
      (link) =>
        link.getAttribute("aria-label") ===
        "Models & pricing for Vertex AI Agent Engine",
    )!;
    expect(link.getAttribute("href")).toBe(
      "/search?provider=vertex_ai%2Fagent_engine",
    );
  });

  it.each([null, [], { zai: "https://example.com" }, { zai: 42 }])(
    "should fall back to provider search for invalid catalog data %j",
    async (response) => {
      catalogResponse = response;
      app = new Providers({ target: document.body });
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain("Z.AI"),
      );
      const models = Array.from(document.links).find(
        (link) =>
          link.getAttribute("aria-label") === "Models & pricing for Z.AI",
      )!;
      expect(models.getAttribute("href")).toBe("/search?provider=zai");
    },
  );
});
