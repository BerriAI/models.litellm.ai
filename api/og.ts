/**
 * Renders a page's social share image on request: /og/<kind>/<id>.png is
 * rewritten here (vercel.json). The card's text comes only from the
 * /og/<kind>/<id>.json file the build wrote, so the URL can't be used to draw
 * arbitrary text with the LiteLLM brand. Responses are cached by the CDN; the
 * ?v= hash in each page's og:image changes whenever the card does, and a ?v=
 * that is not the card's hash answers 404, so each card renders under its own
 * URL only and a made-up query string cannot force endless renders.
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

/** A deployment's cards never change, so the CDN can keep a miss instead of invoking the function for every probe. */
const NOT_FOUND = {
  status: 404,
  headers: { "Cache-Control": "public, max-age=0, s-maxage=3600" },
};

type CardRef = { url: URL; v: string | null };

/** The build-written card behind /og/<kind>/<id>.png?v=<hash>, or null when the URL names no such card. */
function cardRef(request: Request): CardRef | null {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!(OG_KINDS as readonly string[]).includes(kind) || !OG_ID.test(id)) {
    return null;
  }
  return {
    url: new URL(`/og/${kind}/${id}.json`, url.origin),
    v: url.searchParams.get("v"),
  };
}

/** The card's JSON text, or null when there is no such card or ?v= is not its hash. */
async function loadCard(request: Request): Promise<string | null> {
  const card = cardRef(request);
  if (!card) return null;
  const res = await fetch(card.url, { headers: selfHeaders(request) });
  if (!res.ok) return null;
  const json = await res.text();
  return card.v === null || card.v === cardHash(json) ? json : null;
}

export async function GET(request: Request): Promise<Response> {
  const json = await loadCard(request);
  if (json === null) return new Response("Not found", NOT_FOUND);
  const png = await renderCardPng(
    JSON.parse(json) as CardInput,
    await loadAssets(new URL(request.url).origin, selfHeaders(request)),
  );
  return new Response(new Uint8Array(png), { headers: IMAGE_HEADERS });
}

/** A status probe only checks that the card exists at this version; nothing is rendered. */
export async function HEAD(request: Request): Promise<Response> {
  const json = await loadCard(request);
  return new Response(
    null,
    json === null ? NOT_FOUND : { headers: IMAGE_HEADERS },
  );
}
