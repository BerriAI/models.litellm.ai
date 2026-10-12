/**
 * Draws a share card to PNG with satori (layout to SVG) and resvg (SVG to
 * PNG). Used by api/og.ts on Vercel and by og-preview.ts locally, so a local
 * preview matches what the site serves.
 */
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { OG_HEIGHT, OG_WIDTH, cardElement, type CardInput } from "./og-card.js";

export type CardAssets = {
  fonts: {
    name: string;
    data: ArrayBuffer | Buffer;
    weight: 500 | 600 | 700;
    style: "normal";
  }[];
  /** The white Primary Logo as a data URI. */
  logo: string;
};

export async function renderCardPng(
  input: CardInput,
  assets: CardAssets,
): Promise<Buffer> {
  const svg = await satori(
    cardElement(input, assets.logo) as unknown as Parameters<typeof satori>[0],
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts: assets.fonts,
    },
  );
  return new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } })
    .render()
    .asPng();
}
