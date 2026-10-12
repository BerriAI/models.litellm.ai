/**
 * Renders a page's social share image on request: /og/<kind>/<id>.png is
 * rewritten here (vercel.json). The card's text comes only from the
 * /og/<kind>/<id>.json file the build wrote, so the URL can't be used to draw
 * arbitrary text with the LiteLLM brand. Responses are cached by the CDN; the
 * ?v= hash in each page's og:image changes whenever the card does, and a ?v=
 * that is not the card's hash redirects to the card's current URL, so each
 * card renders under its own URL only, a made-up query string cannot force
 * endless renders, and a link shared before the card changed keeps its image.
 */
import {
  OG_FONTS,
  OG_ID,
  OG_KINDS,
  cardHash,
  type CardInput,
} from "../scripts/seo/og-card.js";
import { renderCardPng, type CardAssets } from "../scripts/seo/og-render.js";

let assets: Promise<CardAssets> | null = null;

/**
 * Preview deployments sit behind Vercel Authentication, which also covers the
 * static files this function reads from its own origin. Forwarding the
 * viewer's Vercel session (or an automation bypass token) lets a preview
 * render; a production request carries neither, so nothing is forwarded there.
 */
export function selfHeaders(request: Request): Record<string, string> {
  const bypass = request.headers.get("x-vercel-protection-bypass");
  const session = /(?:^|;\s*)_vercel_jwt=([^;]+)/.exec(
    request.headers.get("cookie") ?? "",
  )?.[1];
  return {
    ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
    ...(session ? { cookie: `_vercel_jwt=${session}` } : {}),
  };
}

async function fetchOk(
  url: URL,
  headers: Record<string, string>,
): Promise<Response> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url.pathname}: ${res.status}`);
  return res;
}

/** Fonts and logo come from the same deployment's static files; kept for the life of the instance. */
function loadAssets(
  origin: string,
  headers: Record<string, string>,
): Promise<CardAssets> {
  assets ??= (async () => {
    const fonts = await Promise.all(
      OG_FONTS.map(async (f) => ({
        name: "Geist",
        data: await (
          await fetchOk(new URL(`/og/fonts/${f.file}`, origin), headers)
        ).arrayBuffer(),
        weight: f.weight,
        style: "normal" as const,
      })),
    );
    const logo = Buffer.from(
      await (
        await fetchOk(new URL("/brand/litellm-logo-white.png", origin), headers)
      ).arrayBuffer(),
    );
    return { fonts, logo: `data:image/png;base64,${logo.toString("base64")}` };
  })().catch((err) => {
    assets = null; // retry on the next request
    throw err;
  });
  return assets;
}

const IMAGE_HEADERS = {
  "Content-Type": "image/png",
  "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
};

/** A deployment's cards never change, so the CDN can keep a miss or a redirect instead of invoking the function for every probe. */
const PROBE_CACHE = "public, max-age=0, s-maxage=3600";

const NOT_FOUND = { status: 404, headers: { "Cache-Control": PROBE_CACHE } };

type CardRef = { kind: string; id: string; v: string | null; url: URL };

/** The build-written card behind /og/<kind>/<id>.png?v=<hash>, or null when the URL names no such card. */
function cardRef(request: Request): CardRef | null {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!(OG_KINDS as readonly string[]).includes(kind) || !OG_ID.test(id)) {
    return null;
  }
  return {
    kind,
    id,
    v: url.searchParams.get("v"),
    url: new URL(`/og/${kind}/${id}.json`, url.origin),
  };
}

type Card = { ref: CardRef; json: string; hash: string };

/** The card's JSON text and its hash, or null when there is no such card. */
async function loadCard(request: Request): Promise<Card | null> {
  const ref = cardRef(request);
  if (!ref) return null;
  const res = await fetch(ref.url, { headers: selfHeaders(request) });
  if (!res.ok) return null;
  const json = await res.text();
  return { ref, json, hash: cardHash(json) };
}

/** A ?v= from before the card last changed, or a made-up one, is sent to the card's current URL: only that URL ever renders. */
function redirectStale(card: Card): Response | null {
  if (card.ref.v === null || card.ref.v === card.hash) return null;
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/og/${card.ref.kind}/${card.ref.id}.png?v=${card.hash}`,
      "Cache-Control": PROBE_CACHE,
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const card = await loadCard(request);
  if (card === null) return new Response("Not found", NOT_FOUND);
  const stale = redirectStale(card);
  if (stale) return stale;
  const png = await renderCardPng(
    JSON.parse(card.json) as CardInput,
    await loadAssets(new URL(request.url).origin, selfHeaders(request)),
  );
  return new Response(new Uint8Array(png), { headers: IMAGE_HEADERS });
}

/** A status probe only checks that the card exists at this version; nothing is rendered. */
export async function HEAD(request: Request): Promise<Response> {
  const card = await loadCard(request);
  if (card === null) return new Response(null, NOT_FOUND);
  return redirectStale(card) ?? new Response(null, { headers: IMAGE_HEADERS });
}
