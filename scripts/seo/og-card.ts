/**
 * The social share card (1200x630), as a satori element tree. Shared by the
 * build, which writes each page's card data, and api/og.ts, which renders it.
 *
 * Sizes are chosen for phones: a share card often shows at about 350px wide,
 * so headline numbers are 64px and up and no text is under 28px.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export type Stat = { value: string; label: string };

export type CardInput = {
  /** Small label above the title, e.g. "Model pricing". */
  kicker: string;
  title: string;
  subtitle?: string;
  /** Up to three; the first is the widest. */
  stats: Stat[];
};

const PAD_X = 72;
const PAD_TOP = 44;
const PAD_BOTTOM = 60;

const COLORS = {
  ground: "#080b26",
  brand: "#0117be",
  text: "#ffffff",
  soft: "#c6ceff",
  muted: "#a6a4c6",
  accent: "#9fabff",
  line: "#262c5c",
};

type El = { type: string; props: Record<string, unknown> };

function h(
  type: string,
  style: Record<string, unknown>,
  ...children: unknown[]
): El {
  const kids = children
    .flat()
    .filter((c) => c !== null && c !== undefined && c !== false);
  return {
    type,
    props: { style, children: kids.length === 1 ? kids[0] : kids },
  };
}

/** Long names drop a size so they still fit in two lines. */
function titleSize(title: string): number {
  const n = title.length;
  if (n <= 16) return 96;
  if (n <= 24) return 84;
  if (n <= 34) return 72;
  if (n <= 48) return 60;
  return 52;
}

function statSize(value: string, first: boolean): number {
  const n = value.length;
  if (n <= 6) return first ? 84 : 72;
  if (n <= 10) return first ? 72 : 64;
  if (n <= 16) return 52;
  return 40;
}

/** `logoSrc` is the official white Primary Logo (680x129), as a URL or data URI. */
export function cardElement(input: CardInput, logoSrc: string): El {
  const stats = input.stats.slice(0, 3);
  return h(
    "div",
    {
      // Satori adds padding outside width and height, so size the content box.
      width: OG_WIDTH - 2 * PAD_X,
      height: OG_HEIGHT - PAD_TOP - PAD_BOTTOM - 12,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: `${PAD_TOP}px ${PAD_X}px ${PAD_BOTTOM}px`,
      // A flat ground keeps each PNG near 50 KB; gradients pushed it past 180 KB.
      backgroundColor: COLORS.ground,
      borderTop: `12px solid ${COLORS.brand}`,
      fontFamily: "Geist",
      color: COLORS.text,
    },
    h(
      "div",
      {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      },
      {
        type: "img",
        props: {
          src: logoSrc,
          width: 232,
          height: 44,
          style: { width: 232, height: 44 },
        },
      },
      h(
        "div",
        { fontSize: 28, fontWeight: 500, color: COLORS.muted },
        "models.litellm.ai",
      ),
    ),
    h(
      "div",
      { display: "flex", flexDirection: "column" },
      h(
        "div",
        {
          fontSize: 28,
          fontWeight: 600,
          color: COLORS.accent,
          letterSpacing: 2,
          textTransform: "uppercase",
          marginBottom: 14,
        },
        input.kicker,
      ),
      h(
        "div",
        {
          fontSize: titleSize(input.title),
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: -1.5,
          maxWidth: OG_WIDTH - 2 * PAD_X,
          lineClamp: 2,
        },
        input.title,
      ),
      input.subtitle
        ? h(
            "div",
            {
              fontSize: 34,
              fontWeight: 500,
              color: COLORS.soft,
              marginTop: 16,
            },
            input.subtitle,
          )
        : null,
    ),
    stats.length === 0
      ? null
      : h(
          "div",
          {
            display: "flex",
            borderTop: `2px solid ${COLORS.line}`,
            paddingTop: 28,
          },
          ...stats.map((s, i) =>
            h(
              "div",
              {
                display: "flex",
                flexDirection: "column",
                flexGrow: i === 0 ? 1.4 : 1,
                flexBasis: 0,
                paddingLeft: i === 0 ? 0 : 32,
                borderLeft: i === 0 ? "none" : `2px solid ${COLORS.line}`,
              },
              h(
                "div",
                {
                  fontSize: statSize(s.value, i === 0),
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: -1,
                },
                s.value,
              ),
              h(
                "div",
                {
                  fontSize: 28,
                  fontWeight: 500,
                  color: COLORS.muted,
                  marginTop: 12,
                },
                s.label,
              ),
            ),
          ),
        ),
  );
}

/** The font weights the card uses; api/og.ts loads these files from /og/fonts. */
export const OG_FONTS = [
  { file: "Geist-Medium.ttf", weight: 500 },
  { file: "Geist-SemiBold.ttf", weight: 600 },
  { file: "Geist-Bold.ttf", weight: 700 },
] as const;

/** Only lowercase ids made of the characters our slugs use. */
export const OG_ID = /^[a-z0-9][a-z0-9._-]*$/;
export const OG_KINDS = ["models", "providers", "pages"] as const;
