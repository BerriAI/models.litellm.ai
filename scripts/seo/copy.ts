/**
 * The sentences a model page is built around. Search engines and AI answers
 * lift these verbatim, so each one stands alone and leads with numbers.
 */
import { article, int, listProse, longDate, monthYear, tokensShort, usd, usdShort } from "./format";
import type { ModelView, RowView } from "./model-view";
import { CHAT_MODES, IMAGE_MODES } from "./pricing";

export type Faq = { q: string; a: string };
export type CostExample = { label: string; rows: { who: string; cost: number }[] };

export type PageCopy = {
  title: string;
  description: string;
  h1: string;
  priceSentence: string | null;
  answer: string;
  faq: Faq[];
  examples: CostExample[];
  endpoint: string;
};

const ENDPOINTS: Record<string, string> = {
  chat: "/v1/chat/completions",
  completion: "/v1/completions",
  responses: "/v1/responses",
  embedding: "/v1/embeddings",
  image_generation: "/v1/images/generations",
  image_edit: "/v1/images/edits",
  audio_speech: "/v1/audio/speech",
  audio_transcription: "/v1/audio/transcriptions",
  video_generation: "/v1/videos",
  rerank: "/v1/rerank",
  moderation: "/v1/moderations",
  realtime: "/v1/realtime",
  ocr: "/v1/ocr",
};

const where = (v: ModelView, r: RowView) =>
  v.headlineBasis === "lowest" ? `from ${r.providerName}, the lowest of ${v.providers.length} providers` : `on ${r.providerName}`;

export type HeadlinePrice =
  | { unit: "free" }
  | { unit: "tokens"; input: number; output: number }
  | { unit: "input_tokens"; value: number }
  | { unit: "image"; value: number }
  | { unit: "image_tokens"; value: number }
  | { unit: "second"; value: number }
  | { unit: "chars"; value: number }
  | { unit: "minute"; value: number }
  | { unit: "metric"; value: number; label: string };

/** The one price a model page leads with; the price sentence and the share card both read it from here. */
export function headlinePrice(v: ModelView): HeadlinePrice | null {
  const r = v.headline;
  if (!r) return null;
  const p = r.prices;
  if (v.free) return { unit: "free" };
  if (CHAT_MODES.has(r.mode) && p.input !== undefined && p.output !== undefined) {
    return { unit: "tokens", input: p.input, output: p.output };
  }
  if (r.mode === "embedding" && p.input !== undefined) return { unit: "input_tokens", value: p.input };
  if (IMAGE_MODES.has(r.mode) && p.perImage !== undefined) return { unit: "image", value: p.perImage };
  if (IMAGE_MODES.has(r.mode) && p.imageOutputTokens !== undefined) {
    return { unit: "image_tokens", value: p.imageOutputTokens };
  }
  if (r.mode === "video_generation" && p.perSecond !== undefined) return { unit: "second", value: p.perSecond };
  if (r.mode === "audio_speech" && p.per1MChars !== undefined) return { unit: "chars", value: p.per1MChars };
  if (r.mode === "audio_transcription" && p.perMinute !== undefined) return { unit: "minute", value: p.perMinute };
  if (r.metric) return { unit: "metric", value: r.metric.value, label: metricUnit(r.metric.unit) };
  return null;
}

function metricUnit(unit: string): string {
  return unit.replace(/_/g, " ").replace("per 1m", "per 1M").replace("per 1k", "per 1K");
}

/** "X costs $4.00 per 1M input tokens and $20.00 per 1M output tokens on Anthropic". */
export function priceSentence(v: ModelView): string | null {
  const r = v.headline;
  const price = headlinePrice(v);
  if (!r || !price) return null;
  const p = r.prices;
  const at = where(v, r);
  switch (price.unit) {
    case "free":
      return `${v.name} is free to use ${at}`;
    case "tokens": {
      let s = `${v.name} costs ${usd(price.input)} per 1M input tokens and ${usd(price.output)} per 1M output tokens ${at}`;
      if (p.cacheRead !== undefined && p.cacheWrite !== undefined) {
        s += `, with cache reads at ${usd(p.cacheRead)} and cache writes at ${usd(p.cacheWrite)} per 1M tokens`;
      } else if (p.cacheRead !== undefined) {
        s += `, with cache reads at ${usd(p.cacheRead)} per 1M tokens`;
      }
      return s;
    }
    case "input_tokens":
      return `${v.name} costs ${usd(price.value)} per 1M input tokens ${at}`;
    case "image": {
      const extra = p.input ? `, plus ${usd(p.input)} per 1M input tokens` : "";
      return `${v.name} costs ${usd(price.value)} per image ${at}${extra}`;
    }
    case "image_tokens":
      return `${v.name} costs ${usd(price.value)} per 1M output image tokens ${at}`;
    case "second":
      return `${v.name} costs ${usd(price.value)} per second of video ${at}`;
    case "chars":
      return `${v.name} costs ${usd(price.value)} per 1M characters ${at}`;
    case "minute":
      return `${v.name} costs ${usd(price.value)} per minute of audio ${at}`;
    case "metric":
      return `${v.name} costs ${usd(price.value)} ${price.label} ${at}`;
  }
}

function titlePrice(v: ModelView): string | null {
  const r = v.headline;
  if (!r) return null;
  const p = r.prices;
  const from = v.headlineBasis === "lowest" ? "from " : "";
  if (v.free) return "Free";
  if (CHAT_MODES.has(r.mode) && p.input !== undefined && p.output !== undefined) {
    return `${from}${usdShort(p.input)}/${usdShort(p.output)} per 1M Tokens`;
  }
  if (r.mode === "embedding" && p.input !== undefined) return `${from}${usdShort(p.input)} per 1M Tokens`;
  if (IMAGE_MODES.has(r.mode) && p.perImage !== undefined) return `${from}${usd(p.perImage)} per Image`;
  if (r.mode === "video_generation" && p.perSecond !== undefined) return `${from}${usd(p.perSecond)} per Second`;
  if (r.mode === "audio_speech" && p.per1MChars !== undefined) return `${from}${usdShort(p.per1MChars)} per 1M Characters`;
  if (r.mode === "audio_transcription" && p.perMinute !== undefined) return `${from}${usd(p.perMinute)} per Minute`;
  return null;
}

/** " Google lists these as introductory prices through November 30, 2026." */
function introSentence(v: ModelView): string {
  if (!v.intro || !v.headline) return "";
  return ` ${v.lab ?? v.headline.providerName} lists these as introductory prices through ${longDate(v.intro.until)}.`;
}

function rangeSentence(v: ModelView): string {
  if (!v.range || v.headlineBasis !== "first_party" || usd(v.range.min) === usd(v.range.max)) return "";
  const unit = v.headline?.metric?.unit === "per_1m_tokens" ? "the input price" : "the price";
  return ` Across ${v.providers.length} providers on LiteLLM, ${unit} ranges from ${usd(v.range.min)} to ${usd(v.range.max)}.`;
}

function contextSentence(v: ModelView): string {
  if (!v.context) return "";
  const out = v.maxOutput ? ` and returns up to ${int(v.maxOutput)} tokens per response` : "";
  return ` It has ${article(int(v.context))} ${int(v.context)}-token context window${out}.`;
}

function onOrIn(date: string): string {
  return date.length === 10 ? `on ${longDate(date)}` : `in ${longDate(date)}`;
}

function examples(v: ModelView): CostExample[] {
  const pool: RowView[] = [];
  const consider = (r: RowView | null) => {
    if (r && !r.outlier && !pool.some((x) => x.providerName === r.providerName)) pool.push(r);
  };
  consider(v.headline);
  const others = v.rows
    .filter((r) => r.standard && !r.outlier && r.metric && r.metric.unit === v.headline?.metric?.unit)
    .sort((a, b) => a.metric!.value - b.metric!.value);
  for (const r of others) {
    if (pool.length >= 4) break;
    consider(r);
  }
  const make = (label: string, cost: (r: RowView) => number | undefined): CostExample | null => {
    const rows = pool
      .map((r) => ({ who: r.providerName, cost: cost(r) }))
      .filter((x): x is { who: string; cost: number } => x.cost !== undefined);
    const h = v.headline?.prices;
    if (v.headline && h?.batchInput !== undefined && h.batchOutput !== undefined && cost === chatCost) {
      rows.push({ who: `${v.headline.providerName} batch`, cost: 2 * h.batchInput + 0.5 * h.batchOutput });
    }
    return rows.length ? { label, rows } : null;
  };
  const chatCost = (r: RowView) =>
    r.prices.input !== undefined && r.prices.output !== undefined ? 2 * r.prices.input + 0.5 * r.prices.output : undefined;
  const mode = v.headline?.mode ?? v.mode;
  const list: (CostExample | null)[] = [];
  if (CHAT_MODES.has(mode)) {
    list.push(make("1,000 requests with 2,000 input and 500 output tokens each", chatCost));
    if ((v.context ?? 0) >= 110_000) {
      list.push(
        make("100 long-document requests with 100,000 input and 2,000 output tokens each", (r) =>
          r.prices.input !== undefined && r.prices.output !== undefined ? 10 * r.prices.input + 0.2 * r.prices.output : undefined,
        ),
      );
    }
  } else if (mode === "embedding") {
    list.push(make("Embedding 10,000 documents of 500 tokens each", (r) => (r.prices.input !== undefined ? 5 * r.prices.input : undefined)));
  } else if (IMAGE_MODES.has(mode)) {
    list.push(make("Generating 1,000 images", (r) => (r.prices.perImage !== undefined ? 1000 * r.prices.perImage : undefined)));
  } else if (mode === "video_generation") {
    list.push(make("100 clips of 8 seconds each", (r) => (r.prices.perSecond !== undefined ? 800 * r.prices.perSecond : undefined)));
  } else if (mode === "audio_speech") {
    list.push(make("Narrating 500,000 characters", (r) => (r.prices.per1MChars !== undefined ? 0.5 * r.prices.per1MChars : undefined)));
  } else if (mode === "audio_transcription") {
    list.push(make("Transcribing 1,000 minutes of audio", (r) => (r.prices.perMinute !== undefined ? 1000 * r.prices.perMinute : undefined)));
  }
  return list.filter((x): x is CostExample => x !== null);
}

function faq(v: ModelView, price: string | null, buildDate: string): Faq[] {
  const items: Faq[] = [];
  const h = v.headline;
  if (price && h) {
    let a = `${price}.${introSentence(v)}`;
    const p = h.prices;
    if (p.batchInput !== undefined && p.batchOutput !== undefined) {
      a += ` Batch requests cost ${usd(p.batchInput)} per 1M input tokens and ${usd(p.batchOutput)} per 1M output tokens.`;
    }
    const tier = p.longContext.find((t) => t.input !== undefined);
    if (tier) {
      a += ` Above ${tokensShort(tier.above)} input tokens, input costs ${usd(tier.input!)}${tier.output !== undefined ? ` and output costs ${usd(tier.output)}` : ""} per 1M tokens.`;
    }
    a += rangeSentence(v);
    items.push({ q: `How much does ${v.name} cost?`, a });
  }
  if (v.context) {
    items.push({ q: `What is the context window of ${v.name}?`, a: `${v.name} has ${article(int(v.context))} ${int(v.context)}-token context window${v.maxOutput ? ` and returns up to ${int(v.maxOutput)} tokens per response` : ""}.` });
  }
  if (v.providers.length === 1 && h) {
    items.push({ q: `Which providers offer ${v.name}?`, a: `${v.name} is available from ${h.providerName} through LiteLLM, using the model name ${h.modelString}.` });
  } else if (v.providers.length > 1) {
    const names = v.providers.slice(0, 12).map((p) => p.name);
    const more = v.providers.length > 12 ? ` and ${v.providers.length - 12} more` : "";
    let a = `${v.name} is available from ${v.providers.length} providers through LiteLLM: ${listProse(names)}${more}.`;
    if (v.range && v.range.min < v.range.max) a += ` The lowest price is on ${v.range.minProvider}.`;
    items.push({ q: `Which providers offer ${v.name}?`, a });
  }
  if (h) {
    const endpoint = ENDPOINTS[h.mode] ?? "/v1/chat/completions";
    items.push({
      q: `How do I call ${v.name} with an OpenAI-compatible API?`,
      a: `Use the LiteLLM Python SDK with model="${h.modelString}", or add the model to the LiteLLM proxy's config.yaml and send requests to ${endpoint} from any OpenAI client. LiteLLM tracks the cost of every request at the prices on this page.`,
    });
  }
  const yes = v.capabilities.filter((c) => c.supported).map((c) => c.label.toLowerCase().replace("pdf", "PDF"));
  const no = v.capabilities.filter((c) => !c.supported).map((c) => c.label.toLowerCase().replace("pdf", "PDF"));
  if (yes.length || no.length) {
    let a = yes.length ? `${v.name} supports ${listProse(yes)}.` : "";
    if (no.length) a += `${a ? " " : ""}It does not support ${listProse(no)}.`;
    items.push({ q: `What features does ${v.name} support?`, a });
  }
  if (v.addedDate) {
    items.push({ q: `When did LiteLLM add ${v.name}?`, a: `${v.name} was added to LiteLLM's model price file ${onOrIn(v.addedDate)}.` });
  }
  if (v.deprecation && h) {
    const past = v.deprecation <= buildDate.slice(0, 10);
    items.push({
      q: `Is ${v.name} being deprecated?`,
      a: past
        ? `${h.providerName} deprecated ${h.modelString} on ${longDate(v.deprecation)}.`
        : `${h.providerName} lists a deprecation date of ${longDate(v.deprecation)} for ${h.modelString}.`,
    });
  }
  return items;
}

/** Meta description: whole sentences only, numbers first, within 160 characters. */
function describe(v: ModelView, price: string | null): string {
  const short = price?.replace(/, with cache (reads|writes) at .*$/, "") ?? null;
  // An introductory price matters more to a searcher than the cache price, so it takes that room.
  const intro = v.intro ? `Introductory price through ${longDate(v.intro.until)}.` : null;
  const fits = (s: string) => s.length <= 160;
  const lead =
    price && fits(`${price}.`) && (!intro || fits(`${price}. ${intro}`))
      ? `${price}.`
      : short
        ? `${short}.`
        : `${v.name} pricing, context window and providers.`;
  const extras = [
    intro,
    v.context ? `${tokensShort(v.context)}-token context.` : null,
    v.providers.length > 1 ? `Compare ${v.providers.length} providers and call it through LiteLLM.` : "Call it through LiteLLM.",
  ];
  let out = lead;
  for (const e of extras) if (e && `${out} ${e}`.length <= 160) out = `${out} ${e}`;
  return out;
}

export function pageCopy(v: ModelView, buildDate: string): PageCopy {
  const price = priceSentence(v);
  const tp = titlePrice(v);
  const base = tp ? `${v.name} API Pricing (${monthYear(buildDate)}): ${tp}` : `${v.name} API Pricing, Context Window & Providers`;
  const title = `${base} | LiteLLM`.length <= 70 ? `${base} | LiteLLM` : base;

  const description = describe(v, price);

  const answer = price
    ? `As of ${longDate(buildDate)}, ${price}.${introSentence(v)}${rangeSentence(v)}${contextSentence(v)}`
    : `${v.name} is available through LiteLLM.${contextSentence(v)}`;

  return {
    title,
    description,
    h1: `${v.name} API Pricing`,
    priceSentence: price,
    answer,
    faq: faq(v, price, buildDate),
    examples: examples(v),
    endpoint: ENDPOINTS[v.headline?.mode ?? v.mode] ?? "/v1/chat/completions",
  };
}
