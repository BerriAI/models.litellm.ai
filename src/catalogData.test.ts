import { beforeEach, describe, expect, it, vi } from "vitest";

describe("catalog loading", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("should fetch new releases when the shared cache expires or refresh is requested", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    let catalogVersion = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("models.dev"))
        return Promise.resolve(new Response("{}"));
      catalogVersion += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            [`model-${catalogVersion}`]: { litellm_provider: "example" },
          }),
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { loadCatalogData, CATALOG_CACHE_TTL_MS } = await import(
      "./catalogData"
    );
    const first = await loadCatalogData(false, "");
    expect(first.fetchedAt).toBe(1_000);
    now += CATALOG_CACHE_TTL_MS - 1;
    expect(await loadCatalogData(false, "")).toBe(first);
    now += 1;
    expect((await loadCatalogData(false, "")).items[0].name).toBe("model-2");
    const refreshed = await loadCatalogData(false, "", { forceRefresh: true });
    expect(refreshed.items[0].name).toBe("model-3");
    expect(await loadCatalogData(false, "")).toBe(refreshed);
    expect(catalogVersion).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("raw.githubusercontent"),
      { cache: "no-cache" },
    );
  });

  it("should keep a newer refresh cached if an older request fails later", async () => {
    let rejectFirst: (reason: Error) => void;
    let attempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("models.dev"))
          return Promise.resolve(new Response("{}"));
        attempts += 1;
        if (attempts === 1)
          return new Promise<Response>((_, reject) => {
            rejectFirst = reject;
          });
        return Promise.resolve(new Response("{}"));
      }),
    );
    const { loadCatalogData } = await import("./catalogData");
    const older = loadCatalogData(false, "");
    const rejected = expect(older).rejects.toThrow("old request failed");
    const newer = await loadCatalogData(false, "", { forceRefresh: true });
    rejectFirst!(new Error("old request failed"));
    await rejected;
    expect(await loadCatalogData(false, "")).toBe(newer);
    expect(attempts).toBe(2);
  });

  it("should show prices without waiting for optional model metadata and reuse data across visits", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("models.dev")) return new Promise<Response>(() => {});
      return Promise.resolve(
        new Response(
          JSON.stringify({
            sample_spec: {},
            "example-model": {
              litellm_provider: "example",
              input_cost_per_token: 0.00001,
            },
          }),
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { loadCatalogData } = await import("./catalogData");
    const first = loadCatalogData(false, "");
    expect(loadCatalogData(false, "")).toBe(first);
    const data = await first;
    expect(data.items).toEqual([
      {
        name: "example-model",
        litellm_provider: "example",
        input_cost_per_token: 0.00001,
      },
    ]);
    expect(await loadCatalogData(false, "")).toBe(data);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        url.includes("raw.githubusercontent"),
      ),
    ).toHaveLength(1);
  });

  it("should retry a failed catalog request on the next visit", async () => {
    let attempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("models.dev"))
          return Promise.resolve(new Response("{}"));
        attempts += 1;
        return Promise.resolve(
          attempts === 1
            ? new Response("Unavailable", { status: 503 })
            : new Response("{}"),
        );
      }),
    );
    const { loadCatalogData } = await import("./catalogData");
    await expect(loadCatalogData(false, "")).rejects.toThrow("503");
    await expect(loadCatalogData(false, "")).resolves.toMatchObject({
      items: [],
    });
    expect(attempts).toBe(2);
  });
});
