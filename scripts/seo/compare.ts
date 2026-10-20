/**
 * Comparison pages (/compare/<a>-vs-<b>): which pairs get a page, and every
 * sentence on it, computed from the price file. Nothing is typed per page.
 *
 * Pairs come from two places. `overrides.json` `compare.pairs` lists reviewed
 * pairs; they are built whenever both models are priced. The build also adds
 * pairs on its own so new models get compared soon after launch: a model's
 * predecessor in its family, and for models added in the last 45 days, the two
 * closest models from other labs. New pages are released in weekly waves
 * (`WEEKLY_CAP`, reviewed pairs counted first), tracked in the manifest, so
 * pages arrive gradually instead of all at once.
 */
import { usd, int, tokensShort, longDate } from "./format";
import type { Overrides } from "./group";
import type { ModelView, RowView } from "./model-view";
import type { ModelBenchmarks } from "./benchmarks";

export type PairKind =
  | "successor"
  | "tier"
  | "flagship"
  | "mid"
  | "small"
  | "open"
  | "coding"
  | "new";

export const KIND_LABELS: Record<PairKind, string> = {
  successor: "New versions vs the previous one",
  tier: "Tiers within a model family",
  flagship: "Flagship models",
  mid: "Mid-tier models",
  small: "Small and fast models",
  open: "Open-weight models",
  coding: "Coding models",
  new: "New models vs their closest rivals",
};

export type Pair = {
  slug: string;
  a: ModelView;
  b: ModelView;
  kind: PairKind;
  reviewed: boolean;
};

/** Most new automatic pairs released per 7 days. */
export const WEEKLY_CAP = 40;
const NEW_MODEL_DAYS = 45;
const RIVAL_POOL = 50;

/** One URL per pair: the two slugs in alphabetical order. The reverse order redirects (middleware.ts). */
export const compareSlug = (x: string, y: string) => [x, y].sort().join("-vs-");
export const comparePath = (slug: string) => `/compare/${slug}`;

/** A model has the numbers a comparison page leads with. */
export function priced(v: ModelView): boolean {
  const p = v.headline?.prices;
  return (
    v.mode === "chat" &&
    !!v.context &&
    !!p &&
    (p.input ?? 0) > 0 &&
    (p.output ?? 0) > 0
  );
}

/** A model can be newly compared when it's sold normally and has the numbers the page leads with. */
export function comparable(v: ModelView): boolean {
  return v.status === "active" && priced(v);
}

export function familyOf(
  v: ModelView,
  families: Record<string, string>,
): string | null {
  for (const [name, rx] of Object.entries(families))
    if (new RegExp(rx).test(v.slug)) return name;
  return null;
}

const daysBetween = (a: string, b: string) =>
  (Date.parse(b) - Date.parse(a)) / 86_400_000;
const priceBand = (x: number) => (x < 0.5 ? 0 : x < 3 ? 1 : x < 10 ? 2 : 3);
const contextBand = (c: number) => (c < 64_000 ? 0 : c <= 256_000 ? 1 : 2);
const added = (v: ModelView) => v.addedDate ?? "";

/** The newest active model in `v`'s family that is newer than `v`, linked from a retired model's page. */
export function successorOf(
  v: ModelView,
  views: ModelView[],
  families: Record<string, string>,
): ModelView | null {
  const fam = familyOf(v, families);
  if (!fam) return null;
  const newer = views.filter(
    (o) =>
      o !== v &&
      o.status === "active" &&
      familyOf(o, families) === fam &&
      added(o) > added(v),
  );
  return newer.sort((a, b) => added(b).localeCompare(added(a)))[0] ?? null;
}

type Candidate = { a: ModelView; b: ModelView; kind: PairKind; score: number };

/** Pairs the build proposes by itself, best first. */
export function autoCandidates(
  views: ModelView[],
  families: Record<string, string>,
  today: string,
): Candidate[] {
  const ok = views.filter(comparable);
  const out: Candidate[] = [];
  // Each model with its predecessor in the same family (the two newest steps per family).
  const byFamily = new Map<string, ModelView[]>();
  for (const v of ok) {
    const f = familyOf(v, families);
    if (f) byFamily.set(f, [...(byFamily.get(f) ?? []), v]);
  }
  for (const list of byFamily.values()) {
    const sorted = list
      .filter((v) => v.addedDate)
      .sort((a, b) => added(b).localeCompare(added(a)));
    for (let i = 0; i < Math.min(2, sorted.length - 1); i++) {
      out.push({
        a: sorted[i],
        b: sorted[i + 1],
        kind: "successor",
        score: 100 + sorted[i].providers.length - i,
      });
    }
  }
  // New models against the closest models from other labs, among the most widely offered.
  const pool = [...ok]
    .sort((a, b) => b.providers.length - a.providers.length)
    .slice(0, RIVAL_POOL);
  for (const v of ok) {
    if (
      !v.addedDate ||
      v.addedDate.length < 10 ||
      daysBetween(v.addedDate, today) > NEW_MODEL_DAYS ||
      v.providers.length < 2
    )
      continue;
    const price = v.headline!.prices.input!;
    const rivals = pool
      .filter((o) => o !== v && o.lab && o.lab !== v.lab)
      .filter(
        (o) =>
          Math.abs(priceBand(o.headline!.prices.input!) - priceBand(price)) <=
            1 &&
          Math.abs(contextBand(o.context!) - contextBand(v.context!)) <= 1,
      )
      .sort(
        (x, y) =>
          Math.abs(Math.log(x.headline!.prices.input! / price)) -
          Math.abs(Math.log(y.headline!.prices.input! / price)),
      )
      .slice(0, 2);
    for (const o of rivals)
      out.push({
        a: v,
        b: o,
        kind: "new",
        score: 50 + v.providers.length + o.providers.length,
      });
  }
  return out.sort((x, y) => y.score - x.score);
}

export type Published = Record<string, { firstSeen: string; kind: PairKind }>;

/** The two models behind a comparison slug, trying each "-vs-" since a model slug may contain one. */
function modelsOf(
  slug: string,
  bySlug: Map<string, ModelView>,
): [ModelView, ModelView] | null {
  for (
    let i = slug.indexOf("-vs-");
    i !== -1;
    i = slug.indexOf("-vs-", i + 1)
  ) {
    const a = bySlug.get(slug.slice(0, i));
    const b = bySlug.get(slug.slice(i + 4));
    if (a && b) return [a, b];
  }
  return null;
}

/**
 * Reviewed pairs, then automatic pairs already published, then new automatic pairs up to this week's cap.
 * Returns the pairs to build and the record to store in the manifest.
 */
export function selectPairs(
  views: ModelView[],
  overrides: Overrides,
  previous: Published,
  today: string,
): { pairs: Pair[]; published: Published } {
  const bySlug = new Map(views.map((v) => [v.slug, v]));
  const families = overrides.families ?? {};
  const pairs = new Map<string, Pair>();
  const published: Published = {};
  const add = (
    a: ModelView,
    b: ModelView,
    kind: PairKind,
    reviewed: boolean,
    kept = false,
  ) => {
    const slug = compareSlug(a.slug, b.slug);
    const fits = reviewed || kept ? priced : comparable;
    if (pairs.has(slug) || a === b || !fits(a) || !fits(b)) return false;
    const [first, second] = a.slug < b.slug ? [a, b] : [b, a];
    pairs.set(slug, { slug, a: first, b: second, kind, reviewed });
    published[slug] = { firstSeen: previous[slug]?.firstSeen ?? today, kind };
    return true;
  };
  for (const [x, y, kind] of overrides.compare?.pairs ?? []) {
    const a = bySlug.get(x);
    const b = bySlug.get(y);
    if (a && b) add(a, b, kind as PairKind, true);
  }
  const candidates = autoCandidates(views, families, today);
  for (const c of candidates)
    if (previous[compareSlug(c.a.slug, c.b.slug)])
      add(c.a, c.b, previous[compareSlug(c.a.slug, c.b.slug)].kind, false);
  for (const [slug, p] of Object.entries(previous)) {
    const models = modelsOf(slug, bySlug);
    if (models) add(models[0], models[1], p.kind, false, true);
  }
  // This week's quota counts everything first published in the last 7 days: earlier builds' pairs (even ones
  // since dropped) from the previous manifest, plus reviewed pairs this build publishes for the first time.
  const recentBefore = Object.values(previous).filter(
    (p) => daysBetween(p.firstSeen, today) < 7,
  ).length;
  const newReviewed = Object.keys(published).filter(
    (slug) => !previous[slug],
  ).length;
  let quota = WEEKLY_CAP - recentBefore - newReviewed;
  for (const c of candidates) {
    if (quota <= 0) break;
    if (add(c.a, c.b, c.kind, false)) quota--;
  }
  return { pairs: [...pairs.values()], published };
}

// ---- Copy -----------------------------------------------------------------------------------------------

const input = (v: ModelView) => v.headline!.prices.input!;
const output = (v: ModelView) => v.headline!.prices.output!;
/** How much more `hi` costs than `lo`: $10 vs $4 is 150% more. */
const pct = (hi: number, lo: number) => Math.round(((hi - lo) / lo) * 100);
/** How much less `lo` costs than `hi`: $4 vs $10 is 60% less. Not the same number as `pct`. */
const pctLess = (lo: number, hi: number) => Math.round(((hi - lo) / hi) * 100);
const differs = (x: number, y: number, by: number) =>
  Math.abs(x - y) / Math.min(x, y) >= by;
const cap = (v: ModelView, label: string) =>
  v.capabilities.find((c) => c.label === label)?.supported;

/** Cheapest standard listing by input price, for "where to buy it". */
export function cheapestRow(v: ModelView): RowView | null {
  const rows = v.rows.filter(
    (r) =>
      !r.outlier &&
      r.standard &&
      r.prices.input !== undefined &&
      r.prices.input > 0,
  );
  return rows.sort((x, y) => x.prices.input! - y.prices.input!)[0] ?? null;
}

/** Two context windows in words: "1M versus 922K", or exact counts when both round to the same short form. */
export function contextPair(x: number, y: number): [string, string] {
  return tokensShort(x) === tokensShort(y)
    ? [int(x), int(y)]
    : [tokensShort(x), tokensShort(y)];
}

/** "Claude Opus 5.5 costs 150% more per input token than GPT-6 Astra and has a 1M context window versus 922K." */
export function answerLine(p: Pair): string {
  const { a, b } = p;
  let subject = a;
  let other = b;
  let price: string;
  if (differs(input(a), input(b), 0.01)) {
    [subject, other] = input(a) > input(b) ? [a, b] : [b, a];
    price = `${subject.name} costs ${pct(input(subject), input(other))}% more per input token than ${other.name} (${usd(input(subject))} vs ${usd(input(other))} per 1M)`;
  } else if (differs(output(a), output(b), 0.01)) {
    [subject, other] = output(a) > output(b) ? [a, b] : [b, a];
    price = `${subject.name} and ${other.name} cost the same per input token (${usd(input(a))} per 1M), but ${subject.name} costs ${pct(output(subject), output(other))}% more per output token (${usd(output(subject))} vs ${usd(output(other))})`;
  } else {
    price = `${a.name} and ${b.name} cost the same: ${usd(input(a))} per 1M input tokens and ${usd(output(a))} per 1M output tokens`;
  }
  const [cs, co] = contextPair(subject.context!, other.context!);
  const ctx =
    subject.context === other.context
      ? `, and both have a ${tokensShort(subject.context!)}-token context window`
      : ` and has a ${cs}-token context window versus ${co}`;
  const tied =
    !differs(input(a), input(b), 0.01) && !differs(output(a), output(b), 0.01);
  const [big, small] = a.context! > b.context! ? [a, b] : [b, a];
  const [cb, cm] = contextPair(big.context!, small.context!);
  return tied && subject.context !== other.context
    ? `${price}. ${big.name} has the larger context window: ${cb} tokens versus ${cm}.`
    : `${price}${ctx}.`;
}

/** Up to two reasons to pick `x` over `y`, each from a real difference in the data. Equal data gives none. */
export function reasonsToPick(x: ModelView, y: ModelView): string[] {
  const out: string[] = [];
  if (input(x) < input(y) && differs(input(x), input(y), 0.05)) {
    out.push(
      `Costs ${pctLess(input(x), input(y))}% less per input token: ${usd(input(x))} vs ${usd(input(y))} per 1M.`,
    );
  } else if (output(x) < output(y) && differs(output(x), output(y), 0.05)) {
    out.push(
      `Costs ${pctLess(output(x), output(y))}% less per output token: ${usd(output(x))} vs ${usd(output(y))} per 1M.`,
    );
  }
  if (x.context! > y.context! && differs(x.context!, y.context!, 0.1))
    out.push(
      `Larger context window: ${int(x.context!)} vs ${int(y.context!)} tokens.`,
    );
  for (const label of [
    "Function calling",
    "Image input",
    "Structured output",
    "Prompt caching",
    "Reasoning",
    "PDF input",
    "Audio input",
  ]) {
    if (out.length >= 2) break;
    if (cap(x, label) === true && cap(y, label) === false)
      out.push(
        `Supports ${label.toLowerCase().replace("pdf", "PDF")}, which ${y.name} doesn't list.`,
      );
  }
  if (
    out.length < 2 &&
    x.maxOutput &&
    y.maxOutput &&
    x.maxOutput > y.maxOutput &&
    differs(x.maxOutput, y.maxOutput, 0.1)
  ) {
    out.push(
      `Returns up to ${int(x.maxOutput)} tokens per response, vs ${int(y.maxOutput)}.`,
    );
  }
  if (
    out.length < 2 &&
    x.providers.length >= 2 * y.providers.length &&
    x.providers.length - y.providers.length >= 3
  ) {
    out.push(
      `Available from ${x.providers.length} providers through LiteLLM, vs ${y.providers.length}.`,
    );
  }
  return out.slice(0, 2);
}

/** Nothing a reader would compare differs: prices within 5%, context within 10%, same features. */
export function negligible(p: Pair): boolean {
  const { a, b } = p;
  const sameCaps = a.capabilities.every(
    (c) => cap(b, c.label) === undefined || cap(b, c.label) === c.supported,
  );
  return (
    !differs(input(a), input(b), 0.05) &&
    !differs(output(a), output(b), 0.05) &&
    !differs(a.context!, b.context!, 0.1) &&
    sameCaps
  );
}

/**
 * Indexable unless a model in it is retired or it's an automatic pair that says nothing new: reviewed pairs and
 * successor pairs always are ("X vs X.5" is searched even when prices match); automatic pairs need 3+ providers
 * on each side and a real difference.
 */
export function indexable(p: Pair): boolean {
  if (p.a.status === "retired" || p.b.status === "retired") return false;
  if (p.reviewed || p.kind === "successor") return true;
  return (
    p.a.providers.length >= 3 && p.b.providers.length >= 3 && !negligible(p)
  );
}

export type CompareCopy = {
  title: string;
  description: string;
  h1: string;
  answer: string;
  pickA: string[];
  pickB: string[];
  faq: { q: string; a: string }[];
};

export function compareCopy(p: Pair, buildDate: string): CompareCopy {
  const { a, b } = p;
  const intro = [a, b]
    .filter((v) => v.intro)
    .map(
      (v) =>
        ` ${v.name}'s price is introductory through ${longDate(v.intro!.until)}.`,
    )
    .join("");
  const answer = answerLine(p) + intro;
  const cheaper =
    input(a) === input(b)
      ? output(a) <= output(b)
        ? a
        : b
      : input(a) < input(b)
        ? a
        : b;
  const bigger = a.context! >= b.context! ? a : b;
  const title = `${a.name} vs ${b.name}: Price, Context Window and Features | LiteLLM`;
  // Meta descriptions over ~160 characters get cut: the full answer if it fits, else its first clause, else a plain summary.
  const firstClause = `${answer.split(" (")[0].replace(/\.$/, "")}.`;
  const description = [
    answer,
    firstClause,
    `${a.name} vs ${b.name}: prices per 1M tokens, context windows, features and benchmark scores.`,
  ].find((d) => d.length <= 160)!;
  const faq = [
    {
      q: `Which is cheaper, ${a.name} or ${b.name}?`,
      a:
        input(a) === input(b) && output(a) === output(b)
          ? `They cost the same: ${usd(input(a))} per 1M input tokens and ${usd(output(a))} per 1M output tokens, as of ${longDate(buildDate)}.`
          : `${cheaper.name} is cheaper: ${usd(input(cheaper))} per 1M input tokens and ${usd(output(cheaper))} per 1M output tokens, versus ${usd(input(cheaper === a ? b : a))} and ${usd(output(cheaper === a ? b : a))} for ${(cheaper === a ? b : a).name}, as of ${longDate(buildDate)}.`,
    },
    {
      q: `Which has the larger context window, ${a.name} or ${b.name}?`,
      a:
        a.context === b.context
          ? `Both have a ${int(a.context!)}-token context window.`
          : `${bigger.name} has the larger context window: ${int(bigger.context!)} tokens, versus ${int((bigger === a ? b : a).context!)} for ${(bigger === a ? b : a).name}.`,
    },
    {
      q: `Can I switch from ${a.name} to ${b.name} without changing my code?`,
      a: `Yes. Through LiteLLM both use the OpenAI format, so switching means changing the model name from "${a.headline!.modelString}" to "${b.headline!.modelString}", or pointing a LiteLLM gateway model alias at the other model. You can also use one as a fallback for the other.`,
    },
  ];
  return {
    title,
    description,
    h1: `${a.name} vs ${b.name}`,
    answer,
    pickA: reasonsToPick(a, b),
    pickB: reasonsToPick(b, a),
    faq,
  };
}

export type BenchRow = {
  name: string;
  url: string;
  category: string;
  epoch: boolean;
  a: string;
  b: string;
};

const pctText = (s: number) => `${(s * 100).toFixed(1)}%`;

/** Benchmark rows both models have, plus the Capabilities Index when both have one. */
export function benchRows(
  x: ModelBenchmarks | null,
  y: ModelBenchmarks | null,
): BenchRow[] {
  if (!x || !y) return [];
  const rows: BenchRow[] = [];
  if (x.eci && y.eci)
    rows.push({
      name: "Epoch Capabilities Index",
      url: "https://epoch.ai/eci",
      category: "Overall",
      epoch: true,
      a: x.eci.score.toFixed(1),
      b: y.eci.score.toFixed(1),
    });
  for (const s of x.scores) {
    const t = y.scores.find((o) => o.benchmark === s.benchmark);
    if (!t) continue;
    const label = (sc: typeof s) =>
      `${pctText(sc.score)}${sc.setting ? ` (${sc.setting})` : ""}`;
    rows.push({
      name: s.benchmark,
      url: s.url,
      category: s.category,
      epoch: s.epoch,
      a: label(s),
      b: label(t),
    });
  }
  return rows;
}
