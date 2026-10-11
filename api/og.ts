/**
 * Renders a page's social share image on request: /og/<kind>/<id>.png is
 * rewritten here (vercel.json). The card's text comes only from the
 * /og/<kind>/<id>.json file the build wrote, so the URL can't be used to draw
 * arbitrary text with the LiteLLM brand. Responses are cached by the CDN; the
 * ?v= hash in each page's og:image changes whenever the card does.
 */
import {
  OG_FONTS,
  OG_ID,
  OG_KINDS,
  type CardInput,
} from "../scripts/seo/og-card.js";
import { renderCardPng, type CardAssets } from "../scripts/seo/og-render.js";

let assets: Promise<CardAssets> | null = null;

async function fetchOk(url: URL): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url.pathname}: ${res.status}`);
  return res;
}

/** Fonts and logo come from the same deployment's static files; kept for the life of the instance. */
function loadAssets(origin: string): Promise<CardAssets> {
  assets ??= (async () => {
    const fonts = await Promise.all(
      OG_FONTS.map(async (f) => ({
        name: "Geist",
        data: await (
          await fetchOk(new URL(`/og/fonts/${f.file}`, origin))
        ).arrayBuffer(),
        weight: f.weight,
        style: "normal" as const,
      })),
    );
    const logo = Buffer.from(
      await (
        await fetchOk(new URL("/brand/litellm-logo-white.png", origin))
      ).arrayBuffer(),
    );
    return { fonts, logo: `data:image/png;base64,${logo.toString("base64")}` };
  })().catch((err) => {
    assets = null; // retry on the next request
    throw err;
  });
  return assets;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!(OG_KINDS as readonly string[]).includes(kind) || !OG_ID.test(id)) {
    return new Response("Not found", { status: 404 });
  }
  const card = await fetch(new URL(`/og/${kind}/${id}.json`, url.origin));
  if (!card.ok) return new Response("Not found", { status: 404 });
  const png = await renderCardPng(
    (await card.json()) as CardInput,
    await loadAssets(url.origin),
  );
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
    },
  });
}
