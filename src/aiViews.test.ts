import { describe, expect, it } from "vitest";
import { answerView } from "../server/views";
import { buildSnapshot } from "../server/catalog";
import { viewText } from "./aiViews";
const snapshot = buildSnapshot(
  {
    "seller/alpha": {
      litellm_provider: "seller",
      input_cost_per_token: 0,
      max_input_tokens: 1000000,
      supports_function_calling: true,
      supports_vision: false,
      supports_future_capability: true,
    },
  },
  {},
  { models: { alpha: { modelId: "seller/alpha" } } },
  {},
  {},
);

describe("grounded answer views", () => {
  it("resolves cards from catalog ids rather than model-authored prices and includes every reported capability", () => {
    const view = answerView(
      { type: "model_cards", title: "Selected models" },
      { rows: [{ id: "seller/alpha", input_cost_per_token: 99 }] },
      snapshot,
    );
    expect(view.type).toBe("model_cards");
    if (view.type !== "model_cards") throw new Error();
    expect(view.models[0].input).not.toContain("99");
    expect(view.models[0].output).toBe("—");
    expect(view.models[0].href).toBe("/models/alpha");
    expect(view.models[0].capabilities).toEqual([
      {
        key: "supports_function_calling",
        label: "Tool calling",
        supported: true,
      },
      { key: "supports_vision", label: "Vision", supported: false },
      {
        key: "supports_future_capability",
        label: "Future capability",
        supported: true,
      },
    ]);
    expect(viewText(view)).toContain("Vision: No");
    expect(() =>
      answerView(
        { type: "model_cards", title: "Unknown" },
        { rows: [{ id: "invented" }] },
        snapshot,
      ),
    ).toThrow(/models.id/);
  });
  it("preserves zero, negative and unknown chart values and pagination", () => {
    const view = answerView(
      {
        type: "bar",
        title: "Changes",
        x: "name",
        y: ["cost"],
        x_label: "Model",
        y_label: "USD change",
      },
      {
        rows: [
          { name: "Alpha", cost: 0 },
          { name: "Beta", cost: -2 },
          { name: "Gamma", cost: null },
        ],
        has_more: true,
      },
      snapshot,
    );
    if (view.type === "model_cards") throw new Error();
    expect(view.series[0].points.map((p) => p.y)).toEqual([0, -2, null]);
    expect(view.hasMore).toBe(true);
    expect(viewText(view)).toContain("Unknown");
  });
  it("rejects nonexistent or nonnumeric chart columns and executable fields", () => {
    const params = {
      type: "bar",
      title: "Pricing",
      x: "name",
      y: ["cost"],
      x_label: "Model",
      y_label: "USD",
    };
    for (const row of [
      { name: "Alpha" },
      { name: "Alpha", cost: "2" },
      { name: "Alpha", cost: Infinity },
    ])
      expect(() => answerView(params, { rows: [row] }, snapshot)).toThrow(
        /Y columns/,
      );
    expect(() =>
      answerView(
        { ...params, html: "<script>anything</script>" },
        { rows: [{ name: "Alpha", cost: 2 }] },
        snapshot,
      ),
    ).toThrow(/documented/);
  });
  it("places dates at their actual distance, preserves line gaps, and rejects ambiguous ordering", () => {
    const params = {
      type: "line",
      title: "Releases",
      x: "date",
      y: ["n"],
      x_label: "Month",
      y_label: "Models",
    };
    const view = answerView(
      params,
      {
        rows: [
          { date: "2026-01", n: 1 },
          { date: "2026-02", n: null },
          { date: "2026-04", n: 2 },
        ],
      },
      snapshot,
    );
    if (view.type === "model_cards") throw new Error();
    const points = view.series[0].points;
    expect(points[1].y).toBeNull();
    expect(points[2].x - points[1].x).toBeGreaterThan(
      points[1].x - points[0].x,
    );
    expect(() =>
      answerView(
        params,
        {
          rows: [
            { date: "2026-04", n: 2 },
            { date: "2026-01", n: 1 },
          ],
        },
        snapshot,
      ),
    ).toThrow(/sorted/);
    expect(() =>
      answerView(params, { rows: [{ date: "2026-02-30", n: 1 }] }, snapshot),
    ).toThrow(/ISO dates/);
  });
});
