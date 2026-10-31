import { describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { buildChangelog } from "./build";
import { catalogChanges } from "../../src/discoveryChangelog";
import {
  changelogItems,
  changelogRss,
  changeLine,
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
    const rss = changelogRss(items, options.now);
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
    expect(changelogRss(items, "2026-11-01T00:00:00Z")).toContain(
      `<guid isPermaLink="false">${items[0].id}</guid>`,
    );
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
});
