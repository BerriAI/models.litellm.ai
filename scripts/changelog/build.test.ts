import { describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { buildChangelog } from "./build";
import { catalogChanges } from "../../src/discoveryChangelog";
import {
  changelogItems,
  changelogRss,
  changeLine,
  digestFeedEntries,
  feedEntry,
  feedFilter,
  feedQuery,
  feedUrl,
  parseModelList,
  filterChangelogItems,
} from "../../src/changelogPresentation";
const sha = "a".repeat(40),
  parent = "b".repeat(40);
const commit = {
  sha,
  parent,
  timestamp: "2026-10-30T20:00:00Z",
  subject: "Prices (#1)",
};
const before = {
  "example/model": {
    litellm_provider: "example",
    input_cost_per_token: 2e-6,
    output_cost_per_token: 4e-6,
  },
};
const after = {
  "example/model": {
    ...before["example/model"],
    input_cost_per_token: 1e-6,
    output_cost_per_token: 6e-6,
  },
};
const options = {
  commits: [commit],
  previous: [],
  head: sha,
  since: "2026-10-01T00:00:00Z",
  now: "2026-10-31T00:00:00Z",
  providerNames: { example: "Example" },
};
describe("automatic catalog changelog", () => {
  it("refreshes from pinned parent/commit blobs and keeps both price directions explicit", async () => {
    const loadCatalog = vi.fn(async (ref: string) =>
      ref === parent ? before : after,
    );
    const result = await buildChangelog({ ...options, loadCatalog });
    expect(loadCatalog.mock.calls.map((c) => c[0])).toEqual([parent, sha]);
    const items = changelogItems(result.updates, result.providerNames);
    expect(items[0].lines).toEqual([
      "Input decreased $2 → $1 (−50%) / 1M tokens",
      "Output increased $4 → $6 (+50%) / 1M tokens",
    ]);
    expect(items[0].headline).toContain("on Example");
  });
  it("reuses immutable diffs on the next build and processes new commits, including reverts", async () => {
    const first = await buildChangelog({
      ...options,
      loadCatalog: async (ref) => (ref === parent ? before : after),
    });
    const revert = {
      ...commit,
      sha: "c".repeat(40),
      parent: sha,
      timestamp: "2026-10-31T01:00:00Z",
    };
    const loadCatalog = vi.fn(async (ref: string) =>
      ref === sha ? after : before,
    );
    const next = await buildChangelog({
      ...options,
      commits: [revert, commit],
      head: revert.sha,
      previous: [first],
      loadCatalog,
    });
    expect(loadCatalog.mock.calls.map((c) => c[0])).toEqual([sha, revert.sha]);
    expect(next.updates).toHaveLength(2);
    expect(changelogItems(next.updates, next.providerNames)[0].lines[0]).toBe(
      "Input increased $1 → $2 (+100%) / 1M tokens",
    );
    expect(next.updates[1].id).toBe(first.updates[0].id);
    const empty = vi.fn();
    await buildChangelog({ ...options, previous: [first], loadCatalog: empty });
    expect(empty).not.toHaveBeenCalled();
  });
  it("fails instead of publishing partial or stale history when a required blob cannot load", async () => {
    await expect(
      buildChangelog({
        ...options,
        loadCatalog: async () => {
          throw new Error("Unavailable");
        },
      }),
    ).rejects.toThrow("Unavailable");
  });
  it("does not duplicate provider additions and gives each affected model its own price entry", () => {
    const added = catalogChanges({}, after, commit, { example: "Example" });
    const items = changelogItems(added, { example: "Example" });
    expect(items).toHaveLength(1);
    expect(items[0].headline).toBe("Example added with 1 model");
    const updates = catalogChanges(before, after, commit);
    updates[0].entries.push({
      ...updates[0].entries[0],
      modelId: "example/second",
      name: "Second",
    });
    const prices = changelogItems(updates, { example: "Example" });
    expect(prices).toHaveLength(2);
    expect(new Set(prices.map((p) => p.id)).size).toBe(2);
    updates[0].entries[1].name = updates[0].entries[0].name;
    const aliases = changelogItems(updates, { example: "Example" });
    expect(aliases).toHaveLength(1);
    expect(aliases[0].entries).toHaveLength(2);
    expect(
      changeLine({
        field: "search_context_cost_per_query",
        before: null,
        after: {
          search_context_size_low: 0.01,
          search_context_size_high: 0.01,
        },
      }),
    ).toBe("Web search price added: $0.01 / query");
  });
  it("generates parseable RSS with values, stable unique GUIDs and correctly escaped model names", () => {
    const updates = catalogChanges(before, after, commit);
    updates[0].entries[0].name = 'Model <A> & "B"';
    const items = changelogItems(updates, { example: "A&B" });
    const rss = changelogRss(items.map(feedEntry), options.now);
    const window = new Window();
    const doc = new window.DOMParser().parseFromString(rss, "text/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelector("item title")?.textContent).toContain(
      'Model <A> & "B" on A&B: Input decreased $2 → $1 (−50%)',
    );
    expect(doc.querySelector("item description")?.textContent).toContain(
      "Output increased $4 → $6 (+50%)",
    );
    expect(doc.querySelector("item guid")?.textContent).toBe(items[0].id);
    expect(
      changelogRss(items.map(feedEntry), "2026-11-01T00:00:00Z"),
    ).toContain(`<guid isPermaLink="false">${items[0].id}</guid>`);
    expect(doc.querySelector("item link")?.textContent).toBe(
      `https://github.com/BerriAI/litellm/commit/${sha}`,
    );
  });
  it("keeps unknown prices, DBU rates and capability changes honest without boilerplate", () => {
    expect(
      changeLine({ field: "input_cost_per_token", before: null, after: 1e-6 }),
    ).toBe("Input price added: $1 / 1M tokens");
    expect(
      changeLine({
        field: "input_dbu_cost_per_token",
        before: 2e-6,
        after: 1e-6,
      }),
    ).toContain("2 DBU → 1 DBU (−50%) / 1M tokens");
    expect(
      changeLine({ field: "supports_vision", before: false, after: true }),
    ).toBe("Vision enabled");
    expect(
      changeLine({ field: "max_input_tokens", before: 32000, after: 128000 }),
    ).toBe("Input context: 32,000 → 128,000");
  });
  it("filters feed items by kind and provider from the query string and points the feed at itself", () => {
    const updates = [
      ...catalogChanges(before, after, commit, { example: "Example" }),
      ...catalogChanges({}, after, commit, { example: "Example" }).map((u) => ({
        ...u,
        provider: "other",
      })),
    ];
    const items = changelogItems(updates, {
      example: "Example",
      other: "Other",
    });
    expect(items.map((i) => i.kind)).toEqual(["price", "provider"]);
    const prices = filterChangelogItems(
      items,
      feedFilter(new URLSearchParams("kind=price")),
    );
    expect(prices.map((i) => i.kind)).toEqual(["price"]);
    expect(
      filterChangelogItems(
        items,
        feedFilter(new URLSearchParams("providers=Other,%20missing")),
      ).map((i) => i.provider),
    ).toEqual(["other"]);
    expect(
      filterChangelogItems(
        items,
        feedFilter(new URLSearchParams("kind=price&providers=other")),
      ).length,
    ).toBe(0);
    expect(
      filterChangelogItems(items, feedFilter(new URLSearchParams(""))),
    ).toEqual(items);
    const metadata = { ...items[0], id: "meta", kind: "metadata" as const };
    expect(
      filterChangelogItems(
        [...items, metadata],
        feedFilter(new URLSearchParams("")),
      ),
    ).toEqual(items);
    expect(
      filterChangelogItems(
        [...items, metadata],
        feedFilter(new URLSearchParams("kind=metadata")),
      ),
    ).toEqual([metadata]);
    expect(
      changelogRss([feedEntry(metadata)], options.now).match(/<item>/g),
    ).toHaveLength(1);
    expect(feedQuery("all", "all")).toBe("");
    expect(feedQuery("price", "all")).toBe("?kind=price");
    expect(feedQuery("all", "bedrock_converse")).toBe(
      "?providers=bedrock_converse",
    );
    const self =
      "https://models.litellm.ai/changelog.xml?kind=price&providers=example";
    const rss = changelogRss(prices.map(feedEntry), options.now, self);
    expect(rss).toContain(
      `<atom:link href="${self.replace("&", "&amp;")}" rel="self"`,
    );
    expect(rss.match(/<item>/g)).toHaveLength(1);
  });
  it("folds every change of one commit into one digest item with a counts headline and a bullet per model", () => {
    const priced = catalogChanges(before, after, commit, {
      example: "Example",
    });
    const added = catalogChanges({}, after, commit, { other: "Other" }).map(
      (u) => ({ ...u, provider: "other" }),
    );
    const items = changelogItems([...priced, ...added], {
      example: "Example",
      other: "Other",
    });
    expect(items.length).toBeGreaterThan(1);
    const [digest, ...others] = digestFeedEntries(items);
    expect(others).toEqual([]);
    expect(digest.id).toBe(`digest:${sha}`);
    expect(digest.link).toBe(
      `https://github.com/BerriAI/litellm/commit/${sha}`,
    );
    expect(digest.title).toBe("1 model added, 1 updated on Other, Example");
    expect(digest.body.split("\n")).toEqual([
      "• Other added with 1 model",
      `• ${items[0].entries[0].name} on Example: Input decreased $2 → $1 (−50%) / 1M tokens, Output increased $4 → $6 (+50%) / 1M tokens`,
    ]);
    expect(digest.body).not.toContain("example/");
    const rss = changelogRss([digest], options.now);
    const doc = new new Window().DOMParser().parseFromString(rss, "text/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelector("item category")?.textContent).toBe("digest");
    expect(doc.querySelector("item description")?.textContent).toBe(
      digest.body,
    );
    const twoCommits = [
      ...items,
      ...items.map((i) => ({
        ...i,
        id: `${i.id}:again`,
        source: i.source.replace(/a+$/, "c".repeat(40)),
      })),
    ];
    expect(digestFeedEntries(twoCommits).map((d) => d.id)).toEqual([
      `digest:${sha}`,
      `digest:${"c".repeat(40)}`,
    ]);
    const lone = digestFeedEntries(items.filter((i) => i.kind === "price"));
    expect(lone[0].title).toBe(lone[0].body.slice(2));
    const vertex = { ...after["example/model"], litellm_provider: "vertex_ai" };
    const [regions] = digestFeedEntries(
      changelogItems(
        catalogChanges(
          { "vertex_ai/other": vertex },
          {
            "vertex_ai/other": vertex,
            "vertex_ai/claude": vertex,
            "vertex_ai/us/claude": vertex,
          },
          commit,
        ),
        { vertex_ai: "Vertex" },
      ),
    );
    expect(regions.title).toBe("Claude added on Vertex");
    expect(regions.body).toBe("• Claude added on Vertex");
  });
  it("stops a digest body before Slack's cut and counts the rest", () => {
    const wide = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [
        `example/model-number-${i}`,
        { litellm_provider: "example", input_cost_per_token: 1e-6 },
      ]),
    );
    const items = filterChangelogItems(
      changelogItems(
        catalogChanges(
          { "example/old": wide["example/model-number-0"] },
          wide,
          commit,
        ),
        { example: "Example" },
      ),
      feedFilter(new URLSearchParams("digest=commit")),
    );
    const [digest] = digestFeedEntries(items);
    expect(digest.title).toBe("40 models added on Example");
    const lines = digest.body.split("\n");
    expect(lines.at(-1)).toMatch(/^• \+\d+ more$/);
    expect(lines.length).toBeLessThan(40);
    expect(lines.slice(0, -1).join("\n").length).toBeLessThanOrEqual(480);
    expect(Number(/\d+/.exec(lines.at(-1) ?? "")?.[0]) + lines.length - 1).toBe(
      40,
    );
  });
  it("counts a new provider's models in the digest title and notes a regional alias once", () => {
    const model = before["example/model"];
    const prior = { "example/model": model, "example/eu/model": model };
    const next = {
      "example/model": after["example/model"],
      "example/eu/model": after["example/model"],
      "newprov/one": { ...model, litellm_provider: "newprov" },
      "newprov/two": { ...model, litellm_provider: "newprov" },
      "newprov/three": { ...model, litellm_provider: "newprov" },
    };
    const names = { example: "Example", newprov: "New Provider" };
    const [digest] = digestFeedEntries(
      changelogItems(catalogChanges(prior, next, commit, names), names),
    );
    expect(digest.title).toBe(
      "3 models added, 1 updated on New Provider, Example",
    );
    expect(digest.body).toBe(
      [
        "• New Provider added with 3 models",
        "• Model on Example: Input decreased $2 → $1 (−50%) / 1M tokens, Output increased $4 → $6 (+50%) / 1M tokens",
      ].join("\n"),
    );
  });
  it("folds a clock-aligned time window into one item and holds back a window still open", () => {
    const at = (hhmm: string, suffix: string) => ({
      ...commit,
      sha: suffix.repeat(40),
      timestamp: `2026-10-30T${hhmm}:00Z`,
    });
    const names = { example: "Example", other: "Other" };
    const updates = [
      ...catalogChanges(before, after, at("20:10", "c"), names),
      ...catalogChanges(
        {},
        { "other/new": after["example/model"] },
        at("20:40", "d"),
        names,
      ).map((u) => ({ ...u, provider: "other" })),
      ...catalogChanges(after, before, at("21:05", "e"), names),
    ];
    const items = changelogItems(updates, names);
    const hour = 3_600_000;
    const mid = Date.parse("2026-10-30T21:30:00Z");
    expect(feedFilter(new URLSearchParams("digest=1h")).digest).toBe("1h");
    expect(feedFilter(new URLSearchParams("digest=90x")).digest).toBe("");
    const [closed, ...open] = digestFeedEntries(items, "1h", mid);
    expect(open).toEqual([]);
    expect(closed.id).toBe("digest:1h:2026-10-30T20:00:00.000Z");
    expect(closed.timestamp).toBe("2026-10-30T21:00:00.000Z");
    expect(closed.link).toContain("https://models.litellm.ai/changelog?");
    expect(closed.title).toBe("1 model added, 1 updated on Other, Example");
    const later = digestFeedEntries(items, "1h", mid + hour);
    expect(later.map((e) => e.id)).toEqual([
      "digest:1h:2026-10-30T20:00:00.000Z",
      "digest:1h:2026-10-30T21:00:00.000Z",
    ]);
    expect(later[1].link).toBe(
      `https://github.com/BerriAI/litellm/commit/${"e".repeat(40)}`,
    );
    expect(digestFeedEntries(items, "1d", mid + hour)).toEqual([]);
    expect(digestFeedEntries(items, "30m", mid)).toHaveLength(3);
  });
  it("narrows the feed to the models a reader names, however their proxy spells them", () => {
    const listing = (modelId: string, name: string) => ({
      modelId,
      name,
      changes: [{ field: "input_cost_per_token", before: 1e-6, after: 2e-6 }],
    });
    const base = {
      date: "2026-11-09",
      timestamp: "2026-11-09T00:00:00Z",
      title: "",
      description: "",
      source: "https://github.com/BerriAI/litellm/commit/s",
      sourceLabel: "",
    };
    const items = changelogItems(
      [
        {
          ...base,
          id: "p1",
          kind: "price",
          provider: "openai",
          entries: [listing("gpt-5", "GPT-5")],
        },
        {
          ...base,
          id: "p2",
          kind: "price",
          provider: "vertex_ai",
          entries: [
            listing("vertex_ai/claude-sonnet-4-5", "Claude Sonnet 4.5"),
          ],
        },
        {
          ...base,
          id: "m1",
          kind: "model",
          provider: "fireworks_ai",
          entries: [
            listing("fireworks_ai/accounts/fireworks/models/kimi", "Kimi"),
            listing("fireworks_ai/accounts/fireworks/models/glm", "GLM"),
            listing("fireworks_ai/accounts/fireworks/models/qwen", "Qwen"),
          ],
        },
        {
          ...base,
          id: "n1",
          kind: "provider",
          provider: "newco",
          entries: [
            listing("newco/alpha", "Alpha"),
            listing("newco/beta", "Beta"),
          ],
        },
      ],
      { openai: "OpenAI", vertex_ai: "Vertex", fireworks_ai: "Fireworks AI" },
    );
    const only = (query: string) =>
      filterChangelogItems(items, feedFilter(new URLSearchParams(query)));
    const ids = (query: string) => only(query).map((i) => i.id.split(":")[0]);
    expect(ids("models=azure/gpt-5")).toEqual(["p1"]);
    expect(ids("models=GPT-5")).toEqual(["p1"]);
    expect(ids("models=Claude%20Sonnet%204.5")).toEqual(["p2"]);
    const kimi = only("models=fireworks_ai/accounts/fireworks/models/kimi,glm");
    expect(kimi.map((i) => i.headline)).toEqual([
      "2 models added on Fireworks AI",
    ]);
    expect(kimi[0].entries.map((e) => e.name)).toEqual(["Kimi", "GLM"]);
    const alpha = only("models=newco/alpha");
    expect(alpha.map((i) => [i.kind, i.headline])).toEqual([
      ["model", "Alpha added on Newco"],
    ]);
    expect(only("models=nobody")).toEqual([]);
    expect(only("models=gpt-5&providers=vertex_ai")).toEqual([]);
    expect(only("models=gpt-5&kind=model")).toEqual([]);
    expect(
      filterChangelogItems(items, feedFilter(new URLSearchParams(""))).length,
    ).toBe(4);
  });
  it("builds the subscribe URL a proxy's pasted model list resolves to", () => {
    const modelInfo = JSON.stringify({
      data: [
        { model_name: "fast", litellm_params: { model: "azure/gpt-5" } },
        { model_name: "fast", litellm_params: { model: "azure/gpt-5" } },
        {
          model_name: "claude",
          litellm_params: { model: "vertex_ai/claude-sonnet-4-5@20250929" },
        },
        { model_name: "bare" },
      ],
    });
    expect(parseModelList(modelInfo)).toEqual([
      "azure/gpt-5",
      "vertex_ai/claude-sonnet-4-5@20250929",
      "bare",
    ]);
    expect(
      parseModelList(
        JSON.stringify({
          object: "list",
          data: [{ id: "gpt-5" }, { id: "o3" }],
        }),
      ),
    ).toEqual(["gpt-5", "o3"]);
    expect(
      parseModelList(
        [
          "model_list:",
          "  - model_name: fast",
          "    litellm_params:",
          '      model: "openai/gpt-5" # prod',
          "      api_key: os.environ/OPENAI_API_KEY",
          "  - model_name: slow",
          "    litellm_params:",
          "      model: bedrock/anthropic.claude-sonnet-4-5-v1:0",
        ].join("\n"),
      ),
    ).toEqual(["openai/gpt-5", "bedrock/anthropic.claude-sonnet-4-5-v1:0"]);
    expect(parseModelList("gpt-5, o3\nclaude-opus-4-5 gpt-5")).toEqual([
      "gpt-5",
      "o3",
      "claude-opus-4-5",
    ]);
    expect(parseModelList("   ")).toEqual([]);
    expect(feedUrl({ kinds: [], providers: [], models: [], digest: "" })).toBe(
      "https://models.litellm.ai/changelog.xml",
    );
    const url = feedUrl({
      kinds: ["price", "deprecation"],
      providers: ["azure", "vertex_ai"],
      models: ["azure/gpt-5", "vertex_ai/claude-sonnet-4-5@20250929"],
      digest: "1h",
    });
    expect(url).toBe(
      "https://models.litellm.ai/changelog.xml?kind=price,deprecation&providers=azure,vertex_ai&models=azure/gpt-5,vertex_ai/claude-sonnet-4-5@20250929&digest=1h",
    );
    expect(feedFilter(new URL(url).searchParams)).toEqual({
      kinds: ["price", "deprecation"],
      providers: ["azure", "vertex_ai"],
      models: ["azure/gpt-5", "vertex_ai/claude-sonnet-4-5@20250929"],
      digest: "1h",
    });
    expect(
      feedUrl({ kinds: [], providers: [], models: ["a b&c"], digest: "" }),
    ).toBe("https://models.litellm.ai/changelog.xml?models=a%20b%26c");
  });
});
