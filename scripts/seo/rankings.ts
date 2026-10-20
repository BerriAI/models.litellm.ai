/**
 * Ranking pages (/rankings/<slug>): models sorted by one fact the price file holds (price or context window),
 * never by quality. Each page states how it sorts and what it leaves out, so a reader can check it.
 */
import { int, longDate, usd } from "./format";
import { comparable, familyOf } from "./compare";
import type { ModelView } from "./model-view";

export type Ranking = {
  slug: string;
  /** Page heading, e.g. "Cheapest Vision API Models"; the title adds the month. */
  heading: string;
  /** "chat models", "vision models"...; the page title is built from it. */
  subject: string;
  /** The value the list is sorted by, as a column label. */
  measure: string;
  /** One sentence on how the list is built. */
  method: string;
  /** Sorted, best first. */
  items: { view: ModelView; value: number; display: string }[];
  /** Largest first (context windows) rather than cheapest first. */
  largest?: boolean;
  /** Price-capped lists sorted by how many providers offer each model; `cap` is the price limit. */
  byProviders?: { cap: number; total: number };
};

/** 3 input tokens per output token: the usual chat ratio, and the one most price comparisons use. */
export const blended = (v: ModelView) =>
  (3 * v.headline!.prices.input! + v.headline!.prices.output!) / 4;
const cap = (v: ModelView, label: string) =>
  v.capabilities.find((c) => c.label === label)?.supported === true;

/**
 * Who goes on a ranking: sold normally, priced, at least 32K context, and offered by 2+ providers or by
 * its own lab, which keeps one-off resale variants (`-fast`, `-us`) from crowding the top.
 */
function rankable(v: ModelView): boolean {
  return (
    comparable(v) &&
    v.context! >= 32_000 &&
    (v.providers.length >= 2 || v.headlineBasis === "first_party")
  );
}

const TOP = 20;
const COMMON =
  "Active models only, with a 32K-token context window or more, offered by at least two providers or by their own lab. Free models are left out.";

function cheapest(
  slug: string,
  heading: string,
  subject: string,
  pool: ModelView[],
  extra = "",
): Ranking {
  const items = pool
    .map((view) => ({ view, value: blended(view) }))
    .sort((a, b) => a.value - b.value || a.view.name.localeCompare(b.view.name))
    .slice(0, TOP)
    .map((x) => ({ ...x, display: usd(x.value) }));
  return {
    slug,
    heading,
    subject,
    measure: "Blended price per 1M tokens",
    method: `Sorted by blended price: 3 input tokens for every output token, at each model's headline price (its own lab's API where it sells it, otherwise its cheapest provider). ${extra}${COMMON}`,
    items,
  };
}

/**
 * Models under a price, sorted by how many providers offer them (then by price): a different list from the
 * cheapest-first ones, which would repeat "Cheapest Chat API Models".
 */
function underPrice(cap: number, pool: ModelView[]): Ranking {
  const under = pool.filter((v) => blended(v) < cap);
  return {
    slug: `models-under-${cap}-dollar${cap === 1 ? "" : "s"}`,
    heading: `AI Models Under $${cap} per 1M Tokens`,
    subject: `models under $${cap} per 1M tokens`,
    measure: "Providers on LiteLLM",
    method: `Models whose blended price (3 input tokens per output token, at the headline price) is under $${cap.toFixed(2)}, sorted by how many providers offer them through LiteLLM, then by price. ${COMMON}`,
    byProviders: { cap, total: under.length },
    items: under
      .map((view) => ({ view, value: view.providers.length }))
      .sort(
        (a, b) =>
          b.value - a.value ||
          blended(a.view) - blended(b.view) ||
          a.view.name.localeCompare(b.view.name),
      )
      .slice(0, TOP)
      .map((x) => ({ ...x, display: `${x.value} providers` })),
  };
}

const MIN_ITEMS = 3;

/** A ranking published with fewer models than a new one needs is kept for its URL, but not indexed. */
export const indexableRanking = (r: Ranking) => r.items.length >= MIN_ITEMS;

export function buildRankings(
  views: ModelView[],
  families: Record<string, string>,
  published: ReadonlySet<string> = new Set(),
): Ranking[] {
  const pool = views.filter(rankable);
  const out: Ranking[] = [
    cheapest(
      "cheapest-chat-models",
      "Cheapest Chat API Models",
      "chat models",
      pool,
    ),
    cheapest(
      "cheapest-vision-models",
      "Cheapest Vision API Models",
      "vision models",
      pool.filter((v) => cap(v, "Image input")),
      "Only models that list image input. ",
    ),
    cheapest(
      "cheapest-models-with-tool-calling",
      "Cheapest API Models with Tool Calling",
      "models with tool calling",
      pool.filter((v) => cap(v, "Function calling")),
      "Only models that list function calling. ",
    ),
    cheapest(
      "cheapest-reasoning-models",
      "Cheapest Reasoning API Models",
      "reasoning models",
      pool.filter((v) => cap(v, "Reasoning")),
      "Only models that list reasoning support. ",
    ),
    underPrice(1, pool),
    underPrice(5, pool),
    {
      slug: "largest-context-window",
      heading: "AI Models with the Largest Context Windows",
      subject: "models by context window",
      measure: "Context window",
      method: `Sorted by context window, largest first; ties sorted by blended price. ${COMMON}`,
      largest: true,
      items: [...pool]
        .sort((a, b) => b.context! - a.context! || blended(a) - blended(b))
        .slice(0, TOP)
        .map((view) => ({
          view,
          value: view.context!,
          display: `${int(view.context!)} tokens`,
        })),
    },
  ];
  const embeddings = views
    .filter(
      (v) =>
        v.status === "active" &&
        v.mode === "embedding" &&
        (v.headline?.prices.input ?? 0) > 0,
    )
    .map((view) => ({ view, value: view.headline!.prices.input! }))
    .sort((a, b) => a.value - b.value || a.view.name.localeCompare(b.view.name))
    .slice(0, TOP)
    .map((x) => ({ ...x, display: usd(x.value) }));
  out.push({
    slug: "cheapest-embedding-models",
    heading: "Cheapest Embedding API Models",
    subject: "embedding models",
    measure: "Price per 1M input tokens",
    method:
      "Sorted by input price at each model's headline price. Active embedding models only; free models are left out.",
    items: embeddings,
  });
  // One per model family with at least three models on the list.
  const byFamily = new Map<string, ModelView[]>();
  for (const v of pool) {
    const f = familyOf(v, families);
    if (f) byFamily.set(f, [...(byFamily.get(f) ?? []), v]);
  }
  for (const [family, list] of [...byFamily.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    if (list.length < MIN_ITEMS && !published.has(`cheapest-${family}`))
      continue;
    const name = familyLabel(family);
    out.push(
      cheapest(
        `cheapest-${family}`,
        `Cheapest ${name} Models`,
        `${name} models`,
        list,
        `Only ${name} models. `,
      ),
    );
  }
  return out.filter(
    (r) => indexableRanking(r) || (published.has(r.slug) && r.items.length > 0),
  );
}

/** "claude-opus" -> "Claude Opus", "gpt-sol" -> "GPT Sol". */
export function familyLabel(family: string): string {
  const special: Record<string, string> = {
    gpt: "GPT",
    glm: "GLM",
    minimax: "MiniMax",
    deepseek: "DeepSeek",
    qwen: "Qwen",
    claude: "Claude",
    gemini: "Gemini",
    grok: "Grok",
    kimi: "Kimi",
  };
  return family
    .split("-")
    .map((w) => special[w] ?? w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export const rankingPath = (slug: string) => `/rankings/${slug}`;

export function rankingTitle(r: Ranking, month: string): string {
  return r.largest
    ? `${r.heading} (${month}) | LiteLLM`
    : `${r.heading} (${month}): Prices Compared | LiteLLM`;
}

/** "As of October 20, 2026, the cheapest chat model ... is X at $0.05 per 1M tokens (blended), from Y." */
export function rankingAnswer(r: Ranking, date: string): string {
  const top = r.items[0];
  if (!top) return "";
  const seller = top.view.headline!.providerName;
  const intro = top.view.intro
    ? ` That price is introductory through ${longDate(top.view.intro.until)}.`
    : "";
  if (r.byProviders) {
    return `As of ${date}, ${r.byProviders.total} active models on LiteLLM cost under $${r.byProviders.cap} per 1M tokens (blended). The most widely offered is ${top.view.name}, from ${top.view.providers.length} providers, at ${usd(blended(top.view))} per 1M tokens.${intro}`;
  }
  return r.largest
    ? `As of ${date}, the largest context window among ${r.subject.replace("models by context window", "active models")} on LiteLLM is ${top.view.name}'s, at ${top.display}, from ${seller}.`
    : `As of ${date}, the cheapest of the ${r.subject} on LiteLLM is ${top.view.name}, at ${top.display} per 1M tokens (${r.measure.startsWith("Blended") ? "blended" : "input"}), from ${seller}.${intro}`;
}
