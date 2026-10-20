import { describe, expect, test } from "vitest";
import { CALC_DEFAULTS, CALC_JS, calcCost, calcMoney } from "./calculator";
import { calcSection } from "./html";
import { assignSlugs, groupCostMap } from "./group";
import { buildModelView } from "./model-view";

const view = (input: number, output: number, mode = "chat") => {
  const groups = groupCostMap({
    "claude-opus-5-5": {
      litellm_provider: "anthropic",
      mode,
      input_cost_per_token: input / 1e6,
      output_cost_per_token: output / 1e6,
      max_input_tokens: 1_000_000,
    },
  });
  const slugs = assignSlugs(groups);
  return buildModelView(
    groups[0],
    slugs.get(groups[0].pageKey)!,
    {},
    {},
    null,
    "2026-10-20",
  );
};

describe("cost calculator", () => {
  test("renders the default workload's result in the HTML, so crawlers see a number", () => {
    const html = calcSection(view(4, 20));
    expect(CALC_DEFAULTS).toEqual({
      input: 1000,
      output: 500,
      requests: 10_000,
    });
    expect(html).toContain('<dd data-r="req">$0.014</dd>');
    expect(html).toContain('<dd data-r="day">$140</dd>');
    expect(html).toContain('<dd data-r="month">$4,200</dd>');
    expect(html).toContain("cost $140 a day, about $4,200 a month");
  });

  test("is left off models that aren't priced per input and output token", () => {
    expect(calcSection(view(0, 0))).toBe("");
  });

  test("the page script formats money exactly like the build", () => {
    const src = /var fmt=(function\(n\)\{[^}]*\})/.exec(CALC_JS)![1];
    const fmt = new Function(`return ${src}`)() as (n: number) => string;
    for (const n of [
      0, 0.000115, 0.007, 0.0175, 0.7, 1, 3.5, 99.99, 100, 4200, 123456.7,
    ])
      expect(fmt(n)).toBe(calcMoney(n));
    expect(calcMoney(0.7)).toBe("$0.70");
  });

  test("arithmetic: (in × input price + out × output price) per request, × requests, × 30 days", () => {
    expect(calcCost(4, 20, 2000, 500, 10_000)).toEqual({
      perRequest: 0.018,
      perDay: 180,
      perMonth: 5400,
    });
  });
});
