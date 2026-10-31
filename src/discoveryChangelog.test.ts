import { describe, expect, it } from "vitest";
import { catalogChanges, fieldValue, priceDelta } from "./discoveryChangelog";
const commit = {
  sha: "a".repeat(40),
  timestamp: "2026-10-31T01:00:00Z",
  subject: "Update catalog (#123)",
};
const row = { litellm_provider: "openai", input_cost_per_token: 2e-6 };

describe("sourced catalog changelog", () => {
  it("uses the actual commit day in Pacific time and preserves exact changed rates", () => {
    const updates = catalogChanges(
      { model: row },
      {
        model: {
          ...row,
          input_cost_per_token: 1e-6,
          output_cost_per_token: 4e-6,
        },
      },
      commit,
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      date: "2026-10-30",
      kind: "price",
      source: `https://github.com/BerriAI/litellm/commit/${commit.sha}`,
    });
    const prices = updates[0].entries[0].changes;
    expect(priceDelta(prices[0])).toBe("−50%");
    expect(fieldValue(prices[0].field, prices[0].before)).toBe(
      "$2 / 1M tokens",
    );
    expect(prices[1].before).toBeNull();
    expect(priceDelta(prices[1])).toBe("Added");
    expect(fieldValue(prices[1].field, prices[1].before)).toBe("Not listed");
  });
  it("groups additions without losing aliases and only calls a provider new when absent before", () => {
    const updates = catalogChanges(
      { old: row },
      {
        old: row,
        new: row,
        alias: row,
        other: { litellm_provider: "example" },
      },
      commit,
    );
    expect(
      updates
        .filter((update) => update.kind === "provider")
        .map((update) => update.provider),
    ).toEqual(["example"]);
    expect(
      updates
        .find(
          (update) => update.kind === "model" && update.provider === "openai",
        )
        ?.entries.map((entry) => entry.modelId),
    ).toEqual(["alias", "new"]);
  });
  it("keeps capability changes, deprecation corrections and removed listings distinct", () => {
    const updates = catalogChanges(
      {
        model: {
          ...row,
          supports_vision: false,
          deprecation_date: "2026-11-01",
        },
        removed: row,
      },
      { model: { ...row, supports_vision: true } },
      commit,
    );
    expect(updates.map((update) => update.kind).sort()).toEqual([
      "capability",
      "deprecation",
      "metadata",
    ]);
    expect(
      updates.find((update) => update.kind === "deprecation")?.entries[0]
        .changes[0],
    ).toEqual({ field: "deprecation_date", before: "2026-11-01", after: null });
    expect(
      updates.find((update) => update.kind === "metadata")?.entries[0]
        .changes[0].after,
    ).toBe("Removed");
  });
  it("does not manufacture a percentage for missing or previously free pricing", () => {
    expect(
      priceDelta({ field: "input_cost_per_token", before: 0, after: 1e-6 }),
    ).toBe("Previously free");
    expect(
      priceDelta({ field: "input_cost_per_token", before: 1e-6, after: null }),
    ).toBe("Removed");
    expect(fieldValue("input_cost_per_token", 0.000000014)).toBe(
      "$0.014 / 1M tokens",
    );
    expect(fieldValue("output_cost_per_character", 0.000015)).toBe(
      "$15 / 1M characters",
    );
    expect(fieldValue("output_cost_per_image", 0.04)).toBe("$0.04");
    expect(fieldValue("cache_read_input_token_cost", 3e-7)).toBe(
      "$0.3 / 1M tokens",
    );
    expect(fieldValue("input_dbu_cost_per_token", 6e-7)).toBe(
      "0.6 DBU / 1M tokens",
    );
  });
  it("ignores JSON object ordering while retaining nested pricing changes", () => {
    const before = {
      model: {
        ...row,
        search_context_cost_per_query: { low: 0.01, high: 0.02 },
      },
    };
    expect(
      catalogChanges(
        before,
        {
          model: {
            ...row,
            search_context_cost_per_query: { high: 0.02, low: 0.01 },
          },
        },
        commit,
      ),
    ).toEqual([]);
    expect(
      catalogChanges(
        before,
        {
          model: {
            ...row,
            search_context_cost_per_query: { high: 0.03, low: 0.01 },
          },
        },
        commit,
      )[0].kind,
    ).toBe("price");
  });
});
