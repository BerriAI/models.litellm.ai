// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { buildDeprecations } from "./deprecations";
import { groupDeprecations, parseDeprecations } from "../../src/deprecations";
import { assignSlugs, groupCostMap, type CostMap } from "./group";
import { buildModelView } from "./model-view";
import { deprecationBody, deprecationPath } from "./deprecation-pages";
import { rssFeed } from "./crawl";
import { loadDiscoveryCatalog } from "../../src/discoveryCatalog";

const row = (provider: string, date?: string) => ({
  litellm_provider: provider,
  mode: "chat",
  input_cost_per_token: 0.000001,
  output_cost_per_token: 0.000002,
  ...(date ? { deprecation_date: date } : {}),
});
const map: CostMap = {
  "gpt-example": row("openai"),
  "azure/gpt-example": row("azure", "2026-10-30"),
  "azure/eu/gpt-example": row("azure", "2026-10-30"),
  "anthropic/claude-example": row("anthropic", "2026-11-01"),
  "openai/invalid-example": row("openai", "2026-02-30"),
};
function build(data = map, previous: unknown = [], today = "2026-10-30") {
  const groups = groupCostMap(data);
  const slugs = assignSlugs(groups);
  const views = groups.map((group) =>
    buildModelView(group, slugs.get(group.pageKey)!, {}, {}, null, today),
  );
  return buildDeprecations(views, data, previous, today);
}

describe("provider deprecation history", () => {
  test("backfills valid dates and groups variants without deprecating the active seller", () => {
    const listings = build();
    expect(listings).toHaveLength(3);
    const groups = groupDeprecations(listings);
    expect(groups).toHaveLength(2);
    expect(
      groups
        .find((entry) => entry.provider === "azure")
        ?.listings.map((entry) => entry.key),
    ).toEqual(["azure/eu/gpt-example", "azure/gpt-example"]);
    expect(groups.some((entry) => entry.provider === "openai")).toBe(false);
    expect(
      parseDeprecations([
        null,
        {},
        { ...listings[0], slug: "../bad" },
        { ...listings[0], date: "2025-02-29" },
      ]),
    ).toEqual([]);
  });

  test("keeps identifiers and observation dates stable across rebuilds and includes dates as they arrive", async () => {
    const before = build();
    const after = build(map, before, "2026-11-01");
    expect(after).toEqual(before);
    async function catalog(date: string) {
      return loadDiscoveryCatalog(
        async (input) =>
          new Response(
            JSON.stringify(
              input === "/models/manifest.json"
                ? {
                    version: 1,
                    models: {},
                    buildDate: date,
                    deprecations: after,
                  }
                : {},
            ),
          ),
      );
    }
    expect((await catalog("2026-10-29")).deprecations).toHaveLength(0);
    expect(
      (await catalog("2026-10-30")).deprecations?.map(
        (entry) => entry.provider,
      ),
    ).toEqual(["azure"]);
    expect(
      (await catalog("2026-11-01")).deprecations?.map(
        (entry) => entry.provider,
      ),
    ).toEqual(["anthropic", "azure"]);
  });

  test("preserves past removed listings without treating removed schedules or undated models as deprecations", () => {
    const prior = build();
    expect(build({}, prior).map((entry) => entry.key)).toEqual([
      "azure/eu/gpt-example",
      "azure/gpt-example",
    ]);
    expect(build({}, undefined)).toEqual([]);
  });

  test("honors date postponements and removals on existing listings", () => {
    const prior = build();
    const changed = {
      ...map,
      "azure/gpt-example": row("azure", "2026-12-01"),
      "azure/eu/gpt-example": row("azure"),
    };
    const updated = build(changed, prior, "2026-10-31");
    expect(
      updated.find((entry) => entry.key === "azure/eu/gpt-example"),
    ).toBeUndefined();
    expect(
      updated.find((entry) => entry.key === "azure/gpt-example"),
    ).toMatchObject({ date: "2026-12-01", firstObservedOn: "2026-10-31" });
    expect(
      groupDeprecations(updated).filter((entry) => entry.date <= "2026-10-31"),
    ).toEqual([]);
  });

  test("renders separate recent and upcoming sections, with exact routes, archive anchors and escaping", () => {
    const entries = groupDeprecations(build());
    entries[0].name = "Model <example> & sample";
    const html = deprecationBody(
      entries,
      [
        { ym: "2026-10", count: 1 },
        { ym: "2026-11", count: 1 },
      ],
      "2026-10-30",
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("model")).toBeNull();
    expect(doc.body.textContent).toContain("Model <example> & sample");
    expect(doc.querySelectorAll("details li")).toHaveLength(2);
    expect(
      doc.querySelector('[aria-current="page"]')?.getAttribute("href"),
    ).toBe("/deprecated-models");
    for (const entry of entries)
      expect(doc.getElementById(entry.id)).not.toBeNull();
    expect(doc.querySelectorAll("section")[0].textContent).not.toContain(
      "Anthropic",
    );
    expect(doc.querySelectorAll("section")[1].textContent).toContain(
      "Anthropic",
    );
  });

  test("RSS uses its own subscription URL, effective date and distinct stable identifiers", () => {
    const entries = groupDeprecations(build()).filter(
      (entry) => entry.date <= "2026-10-30",
    );
    const xml = rssFeed(
      "Deprecations & updates",
      "https://models.litellm.ai/deprecated-models",
      "Effective dates",
      entries.map((entry) => ({
        title: entry.name,
        date: entry.date,
        description: "Provider <example> & listings",
        link: `https://models.litellm.ai${deprecationPath(entry)}`,
        guid: `urn:litellm:deprecation:${entry.id}`,
      })),
      "/deprecated-models.xml",
    );
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelectorAll("item")).toHaveLength(1);
    expect(doc.getElementsByTagName("atom:link")[0].getAttribute("href")).toBe(
      "https://models.litellm.ai/deprecated-models.xml",
    );
    expect(doc.querySelector("guid")?.getAttribute("isPermaLink")).toBe(
      "false",
    );
    expect(doc.querySelector("pubDate")?.textContent).toBe(
      "Fri, 30 Oct 2026 00:00:00 GMT",
    );
    expect(doc.querySelector("item description")?.textContent).toBe(
      "Provider <example> & listings",
    );
  });
});
