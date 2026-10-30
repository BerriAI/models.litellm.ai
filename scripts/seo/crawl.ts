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
    `- [Pricing calculator](${SITE_URL}/calculator): cost per request, day and month for any model, with shareable links like ${SITE_URL}/calculator?model=gpt-5&in=1000&out=500&req=10000`,
    `- [Rankings](${SITE_URL}/rankings): models sorted by price or context window (never by quality)`,
    `- [New models](${SITE_URL}/new-models): models added to LiteLLM, by month, with an RSS feed at ${SITE_URL}/new-models.xml`,
    `- [Deprecated models](${SITE_URL}/deprecated-models): provider-specific effective deprecation dates, monthly history and an RSS feed at ${SITE_URL}/deprecated-models.xml`,
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

/** RSS 2.0 catalog feed; existing new-model callers retain their URL-based GUIDs. */
export function rssFeed(title: string, link: string, description: string, items: { title: string; link: string; description: string; date: string; guid?: string }[], feedPath = "/new-models.xml"): string {
  const rfc = (d: string) => new Date(`${d.length === 10 ? d : `${d}-01`}T00:00:00Z`).toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${xmlEscape(title)}</title>
<link>${xmlEscape(link)}</link>
<atom:link href="${xmlEscape(abs(feedPath))}" rel="self" type="application/rss+xml"/>
<description>${xmlEscape(description)}</description>
<language>en</language>
${items
  .map(
    (i) =>
      `<item><title>${xmlEscape(i.title)}</title><link>${xmlEscape(i.link)}</link><guid isPermaLink="${i.guid ? "false" : "true"}">${xmlEscape(i.guid ?? i.link)}</guid><pubDate>${rfc(i.date)}</pubDate><description>${xmlEscape(i.description)}</description></item>`,
  )
  .join("\n")}
</channel>
</rss>
`;
}
