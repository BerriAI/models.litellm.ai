import { describe, expect, test } from "vitest";
import { rssFeed } from "./crawl";
import {
  assignSlugs,
  groupCostMap,
  type CostMap,
  type Overrides,
} from "./group";
import { buildModelView, type ModelView } from "./model-view";
import { blended } from "./compare";
import {
  buildRankings,
  indexableRanking,
  rankingAnswer,
  rankingTitle,
} from "./rankings";

const chat = (
  provider: string,
  input: number,
  output: number,
  context: number,
  extra: Record<string, unknown> = {},
) => ({
  litellm_provider: provider,
  mode: "chat",
  input_cost_per_token: input / 1e6,
  output_cost_per_token: output / 1e6,
  max_input_tokens: context,
  ...extra,
});

const COST_MAP: CostMap = {
  // Sold by its lab: always eligible.
  "gpt-cheap-1": chat("openai", 0.1, 0.4, 128_000, { supports_vision: true }),
  "claude-mid-1": chat("anthropic", 3, 15, 1_000_000, {
    supports_vision: false,
  }),
  "gemini/gemini-big-1": chat("gemini", 1, 4, 2_000_000),
  "mistral/mistral-cheap-1": chat("mistral", 0.2, 0.6, 128_000),
  // Two resellers: eligible.
  "together_ai/acme/acme-open-1": chat("together_ai", 0.05, 0.1, 64_000),
  "fireworks_ai/acme/acme-open-1": chat("fireworks_ai", 0.06, 0.12, 64_000),
  // One reseller only, not the lab: left out, however cheap.
  "deepinfra/acme/acme-oneoff-1": chat("deepinfra", 0.001, 0.001, 128_000),
  // One reseller with a huge window: left out of the context ranking too.
  "deepinfra/acme/acme-huge-1": chat("deepinfra", 0.1, 0.4, 10_000_000),
  // Too small a context window: left out.
  "gpt-tiny-1": chat("openai", 0.01, 0.01, 8_000),
  // Retired: left out.
  "gpt-old-1": chat("openai", 0.02, 0.02, 128_000, {
    deprecation_date: "2025-01-01",
  }),
};

function views(
  overrides: Overrides = {},
  costMap: CostMap = COST_MAP,
): ModelView[] {
  const groups = groupCostMap(costMap);
  const slugs = assignSlugs(groups);
  return groups.map((g) =>
    buildModelView(g, slugs.get(g.pageKey)!, overrides, {}, null, "2026-10-20"),
  );
}

describe("rankings", () => {
  const rankings = buildRankings(views(), {});
  const get = (slug: string) => rankings.find((r) => r.slug === slug)!;

  test("cheapest lists sort by blended price (3 input : 1 output) and leave out what the method says", () => {
    const r = get("cheapest-chat-models");
    expect(r.items.map((x) => x.view.slug)).toEqual([
      "acme-open-1",
      "gpt-cheap-1",
      "mistral-cheap-1",
      "gemini-big-1",
      "claude-mid-1",
    ]);
    expect(r.items[0].value).toBeCloseTo(blended(r.items[0].view));
    expect(r.items[1].display).toBe("$0.175");
  });

  test("feature lists only hold models that list the feature", () => {
    expect(
      get("cheapest-vision-models")?.items.map((x) => x.view.slug) ?? [],
    ).not.toContain("claude-mid-1");
  });

  test("the context ranking goes largest first, with exact counts", () => {
    const r = get("largest-context-window");
    expect(r.items[0].view.slug).toBe("gemini-big-1");
    expect(r.items[0].display).toBe("2,000,000 tokens");
    expect(rankingAnswer(r, "October 20, 2026")).toBe(
      "As of October 20, 2026, among LiteLLM's active models with a 32K-token context window or more, offered by at least two providers or by their own lab, Gemini Big 1 has the largest context window, at 2,000,000 tokens, from Google AI Studio.",
    );
  });

  test("price-capped lists sort by provider coverage, so they don't repeat the cheapest list", () => {
    const r = get("models-under-1-dollar");
    expect(r.items[0].view.slug).toBe("acme-open-1");
    expect(r.items.map((x) => x.view.slug)).not.toContain("claude-mid-1");
    expect(rankingAnswer(r, "October 20, 2026")).toContain(
      "3 of LiteLLM's active models with a 32K-token context window or more, offered by at least two providers or by their own lab, cost under $1 per 1M tokens",
    );
  });

  test("the embedding answer names the models it ranks, not the chat pool", () => {
    const embed = (provider: string, input: number) => ({
      litellm_provider: provider,
      mode: "embedding",
      input_cost_per_token: input / 1e6,
      max_input_tokens: 8_192,
    });
    const r = buildRankings(
      views(
        {},
        {
          ...COST_MAP,
          "deepinfra/acme/acme-embed-1": embed("deepinfra", 0.01),
          "text-embed-2": embed("openai", 0.02),
          "mistral/mistral-embed-3": embed("mistral", 0.1),
        },
      ),
      {},
    ).find((x) => x.slug === "cheapest-embedding-models")!;
    expect(r.items[0].view.slug).toBe("acme-embed-1");
    expect(rankingAnswer(r, "October 20, 2026")).toMatch(
      /^As of October 20, 2026, the cheapest of LiteLLM's active paid embedding models is Acme Embed 1, at \$0\.01 per 1M tokens \(input\), from /,
    );
  });

  test("the answer says when the top model's price is introductory", () => {
    const intro = buildRankings(
      views({
        introPricing: {
          "acme-open-1": {
            until: "2026-12-31",
            source: "https://example.com/pricing",
            providers: ["together_ai"],
          },
        },
      }),
      {},
    ).find((r) => r.slug === "cheapest-chat-models")!;
    expect(intro.items[0].view.slug).toBe("acme-open-1");
    expect(rankingAnswer(intro, "October 20, 2026")).toContain(
      "That price is introductory through December 31, 2026.",
    );
    expect(
      rankingAnswer(get("cheapest-chat-models"), "October 20, 2026"),
    ).not.toContain("introductory");
  });

  test("a published family list keeps its page with fewer than three models, but is not indexed", () => {
    const families = { mixed: "^(gpt-cheap|mistral-cheap|acme-open)-1$" };
    const slug = "cheapest-mixed";
    const fresh = buildRankings(views(), families).find((r) => r.slug === slug);
    expect(fresh && indexableRanking(fresh)).toBe(true);
    const fewer = views().filter((v) => v.slug !== "acme-open-1");
    expect(buildRankings(fewer, families).map((r) => r.slug)).not.toContain(
      slug,
    );
    const kept = buildRankings(fewer, families, new Set([slug])).find(
      (r) => r.slug === slug,
    );
    expect(kept?.items.map((x) => x.view.slug)).toEqual([
      "gpt-cheap-1",
      "mistral-cheap-1",
    ]);
    expect(indexableRanking(kept!)).toBe(false);
    const none = fewer.filter((v) => !new RegExp(families.mixed).test(v.slug));
    expect(
      buildRankings(none, families, new Set([slug])).map((r) => r.slug),
    ).not.toContain(slug);
  });

  test("titles name the measure and the month, never a quality claim", () => {
    for (const r of rankings) {
      const title = rankingTitle(r, "Oct 2026");
      expect(title).toContain("(Oct 2026)");
      expect(title).not.toMatch(/\bbest\b|\btop\b/i);
    }
  });
});

describe("new models feed", () => {
  test("is valid RSS with one item per model", () => {
    const xml = rssFeed(
      "New AI models on LiteLLM",
      "https://models.litellm.ai/new-models",
      "d",
      [
        {
          title: "Gemini 4 Argon added to LiteLLM",
          link: "https://models.litellm.ai/models/gemini-4-argon",
          description: "$2 / $10 & more",
          date: "2026-10-13",
        },
      ],
    );
    expect(xml).toContain("<pubDate>Tue, 13 Oct 2026 00:00:00 GMT</pubDate>");
    expect(xml).toContain("$2 / $10 &amp; more");
    expect(xml.match(/<item>/g)).toHaveLength(1);
  });
});
