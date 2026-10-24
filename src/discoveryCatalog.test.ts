import { describe, expect, test, vi } from "vitest";
import {
  loadDiscoveryCatalog,
  selectDiscoveryModels,
  type DiscoveryModel,
} from "./discoveryCatalog";

const support = {
  providers: {
    anthropic: { display_name: "Anthropic (`anthropic`)" },
    bedrock: { display_name: "AWS - Bedrock (`bedrock`)" },
    elevenlabs: { display_name: "ElevenLabs" },
  },
};

function model(name: string, firstSeen: string | null, extra = {}) {
  return {
    pageKey: name.toLowerCase(),
    name,
    firstSeen,
    lab: "Anthropic",
    providers: ["Anthropic"],
    price: "$2 / $10",
    context: 200000,
    ...extra,
  };
}

function manifest(models: Record<string, unknown>) {
  return { version: 1, buildDate: "2026-10-24", models };
}

function fetchCatalog(data: unknown, providerData: unknown = support) {
  return vi.fn<typeof fetch>(
    async (input) =>
      new Response(
        JSON.stringify(input === "/models/manifest.json" ? data : providerData),
        { headers: { "content-type": "application/json" } },
      ),
  );
}

describe("discovery catalog", () => {
  test("should keep canonical model slugs containing decimal versions and underscores", async () => {
    const catalog = await loadDiscoveryCatalog(
      fetchCatalog(
        manifest({
          "muse-image-1.0": model("Muse Image 1.0", "2026-10-23"),
          eleven_flash_v2_5: model("Eleven Flash V2 5", "2026-10-23"),
        }),
      ),
    );
    expect(catalog.models.map((entry) => entry.href)).toEqual([
      "/models/eleven_flash_v2_5",
      "/models/muse-image-1.0",
    ]);
  });

  test("should load canonical catalog additions newest first with real provider links and logos", async () => {
    const fetchFn = fetchCatalog(
      manifest({
        older: model("Older", "2026-10-10"),
        newest: model("Newest", "2026-10-23", {
          providers: ["Anthropic", "Amazon Bedrock"],
        }),
        month: model("Month", "2026-09"),
      }),
    );
    const catalog = await loadDiscoveryCatalog(fetchFn);

    expect(catalog.updatedAt).toBe("2026-10-24");
    expect(catalog.models.map((entry) => entry.name)).toEqual([
      "Newest",
      "Older",
      "Month",
    ]);
    expect(catalog.models[0]).toMatchObject({
      href: "/models/newest",
      logo: "/provider-logos/anthropic.svg",
      price: "$2 / $10",
      context: 200000,
    });
    expect(catalog.models[0].providers).toEqual([
      {
        id: "anthropic",
        name: "Anthropic",
        logo: "/provider-logos/anthropic.svg",
        href: "/providers/anthropic",
      },
      {
        id: "bedrock",
        name: "Amazon Bedrock",
        logo: "/provider-logos/bedrock-color.svg",
        href: "/providers/bedrock",
      },
    ]);
    expect(fetchFn).toHaveBeenCalledWith(
      "/models/manifest.json",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  test("should exclude retired models and avoid inventing dates for undated, invalid, or future entries", async () => {
    const catalog = await loadDiscoveryCatalog(
      fetchCatalog(
        manifest({
          active: model("Active", "2026-10-22"),
          retired: model("Retired", "2026-10-23", { retiredOn: "2026-10-24" }),
          deprecated: model("Deprecated", "2026-10-23", { status: "retired" }),
          undated: model("Undated", null),
          invalid: model("Invalid", "2026-02-30"),
          future: model("Future", "2026-10-25"),
          malformed: { name: "No page key", firstSeen: "2026-10-23" },
          "../escape": model("Unsafe path", "2026-10-23"),
        }),
      ),
    );

    expect(catalog.models.map((entry) => entry.name)).toEqual(["Active"]);
    expect(catalog.providers[0].modelCount).toBe(4);
    expect(catalog.providers[0].recentModelCount).toBe(1);
  });

  test("should merge duplicate canonical models without presenting a later alias as a new model", async () => {
    const catalog = await loadDiscoveryCatalog(
      fetchCatalog(
        manifest({
          "regional-alias": model("Regional Alias", "2026-10-23", {
            pageKey: "canonical",
            providers: ["Amazon Bedrock"],
          }),
          canonical: model("Canonical", "2026-09-01"),
        }),
      ),
    );

    expect(catalog.models).toHaveLength(1);
    expect(catalog.models[0]).toMatchObject({
      name: "Canonical",
      href: "/models/canonical",
      firstSeen: "2026-09-01",
    });
    expect(catalog.models[0].providers.map((provider) => provider.id)).toEqual([
      "anthropic",
      "bedrock",
    ]);
    expect(catalog.providers.map((provider) => provider.modelCount)).toEqual([
      1, 1,
    ]);
    expect(
      catalog.providers.map((provider) => provider.recentModelCount),
    ).toEqual([0, 0]);
  });

  test("should preserve unknown canonical history when a dated duplicate appears", async () => {
    const catalog = await loadDiscoveryCatalog(
      fetchCatalog(
        manifest({
          canonical: model("Canonical", null),
          alias: model("Alias", "2026-10-23", { pageKey: "canonical" }),
        }),
      ),
    );
    expect(catalog.models).toEqual([]);
    expect(catalog.providers[0]).toMatchObject({
      modelCount: 1,
      recentModelCount: 0,
      latestModelDate: null,
    });
  });

  test("should count provider catalog additions over the last 30 days rather than invent provider launch dates", async () => {
    const catalog = await loadDiscoveryCatalog(
      fetchCatalog(
        manifest({
          recent: model("Recent", "2026-10-23"),
          boundary: model("Boundary", "2026-09-24"),
          old: model("Old", "2026-09-23"),
          undated: model("Undated", null),
        }),
      ),
    );

    expect(catalog.providers[0]).toMatchObject({
      modelCount: 4,
      recentModelCount: 2,
      latestModelDate: "2026-10-23",
      latestModelName: "Recent",
    });
    expect(catalog.providers[0]).not.toHaveProperty("firstSeen");
  });

  test("should use stable provider ids from newer manifests without depending on matching labels", async () => {
    const catalog = await loadDiscoveryCatalog(
      fetchCatalog(
        manifest({
          latest: model("Latest", "2026-10-23", {
            providers: ["A changed label"],
            providerIds: ["bedrock_converse", "bedrock"],
          }),
        }),
      ),
    );
    expect(catalog.models[0].providers).toHaveLength(1);
    expect(catalog.models[0].providers[0]).toMatchObject({
      id: "bedrock",
      name: "Amazon Bedrock",
      href: "/providers/bedrock",
    });
  });

  test("should keep models available when provider metadata fails and avoid guessing unknown provider urls", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      if (input !== "/models/manifest.json")
        throw new TypeError("Network error");
      return new Response(
        JSON.stringify(
          manifest({
            newest: model("Newest", "2026-10-23", {
              providers: ["Unmapped provider"],
            }),
          }),
        ),
      );
    });
    const catalog = await loadDiscoveryCatalog(fetchFn);
    expect(catalog.models).toHaveLength(1);
    expect(catalog.models[0].providers[0]).toMatchObject({
      name: "Unmapped provider",
      logo: null,
      href: "/providers",
    });
  });

  test.each([
    { version: 2, buildDate: "2026-10-24", models: {} },
    { version: 1, buildDate: "invalid", models: {} },
    { version: 1, buildDate: "2026-02-30", models: {} },
    { version: 1, buildDate: "2026-10-24", models: [] },
    null,
  ])("should reject an invalid manifest shape", async (data) => {
    await expect(loadDiscoveryCatalog(fetchCatalog(data))).rejects.toThrow(
      "catalog is unavailable",
    );
  });

  test("should report a catalog server error instead of showing an empty success state", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async () => new Response("Unavailable", { status: 503 }),
    );
    await expect(loadDiscoveryCatalog(fetchFn)).rejects.toThrow("503");
  });

  test("should report malformed JSON rather than using fabricated fallback data", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async () => new Response("<!doctype html>"),
    );
    await expect(loadDiscoveryCatalog(fetchFn)).rejects.toThrow();
  });
});

function card(slug: string, lab: string): DiscoveryModel {
  return {
    slug,
    name: slug,
    lab,
    logo: null,
    href: `/models/${slug}`,
    firstSeen: "2026-10-23",
    price: null,
    context: null,
    providers: [],
  };
}

describe("discovery model selection", () => {
  test("should show one model per lab when the newest batch contains many variants", () => {
    const models = [
      card("a1", "A"),
      card("a2", "A"),
      card("a3", "A"),
      card("a4", "A"),
      card("b1", "B"),
      card("b2", "B"),
      card("c1", "C"),
      card("c2", "C"),
      card("d1", "D"),
      card("e1", "E"),
      card("f1", "F"),
    ];
    expect(selectDiscoveryModels(models).map((model) => model.slug)).toEqual([
      "a1",
      "b1",
      "c1",
      "d1",
      "e1",
      "f1",
    ]);
    expect(models).toHaveLength(11);
  });

  test("should fill remaining spaces when fewer labs are available while retaining date order", () => {
    const models = [
      card("a1", "A"),
      card("a2", "A"),
      card("a3", "A"),
      card("b1", "B"),
    ];
    expect(selectDiscoveryModels(models)).toEqual(models);
    expect(selectDiscoveryModels(models, 3).map((model) => model.slug)).toEqual(
      ["a1", "a2", "b1"],
    );
    expect(selectDiscoveryModels(models, 0)).toEqual([]);
  });
});
