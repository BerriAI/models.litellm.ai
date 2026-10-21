/**
 * Build side of the share images: writes each page's card data to
 * /og/<kind>/<id>.json and returns the image URL for its meta tags. The PNG is
 * rendered on request by api/og.ts and cached by the CDN, so builds stay fast
 * and only shared or crawled images are ever drawn. The URL carries a hash of
 * the card, so a price change gets a fresh image instead of a cached one.
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { headlinePrice } from "./copy";
import { int, shortDate, tokensShort, usd, usdShort } from "./format";
import type { ModelView } from "./model-view";
import {
  OG_FONTS,
  OG_KINDS,
  OG_HEIGHT,
  OG_WIDTH,
  cardHash,
  type CardInput,
  type Stat,
} from "./og-card";
import { abs } from "./site";

export type OgImage = {
  url: string;
  alt: string;
  width: number;
  height: number;
};

export function writeCard(
  out: string,
  kind: (typeof OG_KINDS)[number],
  id: string,
  input: CardInput,
): OgImage {
  const json = JSON.stringify(input);
  const file = path.join(out, "og", kind, `${id}.json`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, json);
  const v = cardHash(json);
  const alt = [
    input.title,
    input.subtitle,
    ...input.stats.map((s) => `${s.value} ${s.label}`),
  ]
    .filter(Boolean)
    .join(". ");
  return {
    url: abs(`/og/${kind}/${id}.png?v=${v}`),
    alt,
    width: OG_WIDTH,
    height: OG_HEIGHT,
  };
}

/** api/og.ts loads Geist from /og/fonts on the same origin. */
export function copyCardFonts(out: string, root: string): void {
  const dir = path.join(out, "og", "fonts");
  mkdirSync(dir, { recursive: true });
  for (const f of OG_FONTS)
    copyFileSync(
      path.join(root, "scripts/seo/fonts", f.file),
      path.join(dir, f.file),
    );
}

function priceStat(v: ModelView): Stat | null {
  const price = headlinePrice(v);
  if (!price) return null;
  switch (price.unit) {
    case "free":
      return { value: "Free", label: "to use" };
    case "tokens":
      return {
        value: `${usdShort(price.input)} / ${usdShort(price.output)}`,
        label: "per 1M input / output tokens",
      };
    case "input_tokens":
      return { value: usdShort(price.value), label: "per 1M input tokens" };
    case "image":
      return { value: usd(price.value), label: "per image" };
    case "image_tokens":
      return {
        value: usdShort(price.value),
        label: "per 1M output image tokens",
      };
    case "second":
      return { value: usd(price.value), label: "per second of video" };
    case "chars":
      return { value: usdShort(price.value), label: "per 1M characters" };
    case "minute":
      return { value: usd(price.value), label: "per minute of audio" };
    case "metric":
      return { value: usd(price.value), label: price.label };
  }
}

export function modelCard(v: ModelView): CardInput {
  const n = v.providers.length;
  const who = v.lab ? `by ${v.lab} · ` : "";
  const subtitle =
    v.headlineBasis === "lowest"
      ? `${who}lowest price of ${n} providers`
      : `${who}${n} provider${n === 1 ? "" : "s"} on LiteLLM`;
  const stats: Stat[] = [];
  const price = priceStat(v);
  if (price) stats.push(price);
  if (v.context)
    stats.push({ value: tokensShort(v.context), label: "context window" });
  if (v.maxOutput && stats.length < 3)
    stats.push({ value: tokensShort(v.maxOutput), label: "max output" });
  if (stats.length < 3)
    stats.push({ value: int(n), label: n === 1 ? "provider" : "providers" });
  const kicker = v.intro ? `Introductory price until ${shortDate(v.intro.until)}` : "Model pricing";
  return { kicker, title: v.name, subtitle, stats };
}

export function providerCard(
  name: string,
  models: number,
  newest: string | undefined,
): CardInput {
  const stats: Stat[] = [{ value: int(models), label: "models with pricing" }];
  if (newest) stats.push({ value: newest, label: "recently added" });
  return {
    kicker: "Provider pricing",
    title: name,
    subtitle: `Every ${name} model and price on LiteLLM`,
    stats,
  };
}

/** Two models, side by side: each one's input / output price, then both context windows. */
export function compareCard(a: ModelView, b: ModelView): CardInput {
  const price = (v: ModelView) => `${usdShort(v.headline!.prices.input!)} / ${usdShort(v.headline!.prices.output!)}`;
  return {
    kicker: "Model comparison",
    title: `${a.name} vs ${b.name}`,
    subtitle: "Price per 1M input / output tokens",
    stats: [
      { value: price(a), label: a.name },
      { value: price(b), label: b.name },
      { value: `${tokensShort(a.context!)} vs ${tokensShort(b.context!)}`, label: "context window" },
    ],
  };
}
