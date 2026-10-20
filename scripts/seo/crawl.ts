/** robots.txt, the sitemap index and its children, and llms.txt. */
import { SITE_URL, abs } from "./site";

/** `lastmod` only when we know when the page's content changed. */
export type SitemapEntry = { path: string; lastmod?: string };

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function robotsTxt(): string {
  return `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

export function urlset(entries: SitemapEntry[]): string {
  const urls = entries
    .map((e) => `<url><loc>${xmlEscape(abs(e.path))}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function sitemapIndex(children: { path: string; lastmod: string }[]): string {
  const items = children
    .map((c) => `<sitemap><loc>${xmlEscape(abs(c.path))}</loc><lastmod>${c.lastmod}</lastmod></sitemap>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</sitemapindex>
`;
}

/**
 * `limit` writes the short llms.txt (newest models only, linking llms-full.txt); without it, the full list.
 * The full file runs to about 190 KB, more than most agents fetch in one go.
 */
export function llmsTxt(
  models: { name: string; slug: string; summary: string }[],
  providers: { name: string; hub: string; count: number }[],
  limit?: number,
  comparisons: { title: string; slug: string }[] = [],
): string {
  const listed = limit ? models.slice(0, limit) : models;
  const lines = [
    "# LiteLLM Model Catalog",
    "",
    `> Pricing, context windows and providers for ${models.length.toLocaleString("en-US")} AI models, from LiteLLM's open-source model price file. Every model page has a markdown copy at the same URL plus \`.md\`, and model pages also return markdown for \`Accept: text/markdown\`.`,
    "",
    "## Overview",
    "",
    `- [All models](${SITE_URL}/models): every model with its headline price, grouped by lab`,
    ...(limit ? [`- [Full model list](${SITE_URL}/llms-full.txt): all ${models.length.toLocaleString("en-US")} models with prices, as plain text`] : []),
    `- [Price file on GitHub](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json): the raw data, updated several times a day`,
    `- [LiteLLM docs](https://docs.litellm.ai): the SDK and AI gateway that use these prices for cost tracking`,
    "",
    "## Providers",
    "",
    ...providers.map((p) => `- [${p.name}](${SITE_URL}/providers/${p.hub}): ${p.count} models`),
    "",
    ...(comparisons.length
      ? [
          "## Model comparisons",
          "",
          `- [All comparisons](${SITE_URL}/compare): side-by-side prices, context windows, features and benchmark scores`,
          ...comparisons.slice(0, 50).map((x) => `- [${x.title}](${SITE_URL}/compare/${x.slug}.md)`),
          "",
        ]
      : []),
    limit ? `## Newest ${listed.length} models` : "## Models",
    "",
    ...listed.map((m) => `- [${m.name}](${SITE_URL}/models/${m.slug}.md): ${m.summary}`),
    "",
  ];
  return lines.join("\n");
}
