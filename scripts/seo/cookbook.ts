/**
 * The cookbook: every tutorial on docs.litellm.ai, plus the hand-picked guides in
 * the litellm repo's cookbook index. The docs are the source, so a new tutorial
 * shows up on the next build with nothing to add here. The build writes the
 * merged list to /cookbook.json, which the app's Cookbook tab reads too.
 */
import type { CookbookGuide } from "./app-pages";

export const DOCS_SITEMAP_URL = "https://docs.litellm.ai/sitemap.xml";
const TUTORIAL = /^https:\/\/docs\.litellm\.ai\/docs\/tutorials\/[^/?#]+$/;

type Fetch = (url: string) => Promise<string>;

/** title and summary from a docs page's markdown copy (`<page>.md`). */
export function frontmatter(md: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---/.exec(md)?.[1] ?? "";
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const m = /^([a-z_]+):\s*"?(.*?)"?\s*$/.exec(line);
    if (m && m[2]) out[m[1]] = m[2].replace(/\\"/g, '"');
  }
  return out;
}

export function tutorialUrls(sitemapXml: string): string[] {
  return [
    ...new Set(
      [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map((m) => m[1].trim())
        .filter((u) => TUTORIAL.test(u)),
    ),
  ];
}

async function inBatches<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

/**
 * Docs tutorials first, then index guides the docs don't cover, newest first. The docs page's own title and
 * summary win over the index's copy of the same URL; the index's date and tags are kept. Docs pages carry no
 * date: their last_updated comes from a shallow clone at deploy time, so it reads as the deploy date.
 * Returns null only when neither source loads.
 */
export async function loadCookbook(
  fetchText: Fetch,
  index: CookbookGuide[] | null,
): Promise<CookbookGuide[] | null> {
  let docs: CookbookGuide[] = [];
  try {
    const urls = tutorialUrls(await fetchText(DOCS_SITEMAP_URL));
    const pages = await inBatches(urls, 24, async (url) => {
      try {
        const fm = frontmatter(await fetchText(`${url}.md`));
        return fm.title
          ? {
              title: fm.title,
              description: fm.summary,
              url,
              tags: [] as string[],
            }
          : null;
      } catch {
        return null;
      }
    });
    docs = pages.filter((p): p is NonNullable<typeof p> => p !== null);
  } catch (err) {
    console.warn("seo: docs tutorials unavailable for the cookbook", err);
  }
  if (!docs.length && !index) return null;
  const byUrl = new Map<string, CookbookGuide>();
  const key = (u?: string) => (u ?? "").replace(/\/$/, "");
  for (const g of index ?? []) if (g.url) byUrl.set(key(g.url), g);
  for (const d of docs) {
    const prev = byUrl.get(key(d.url));
    byUrl.set(key(d.url), {
      ...prev,
      ...d,
      tags: prev?.tags?.length ? prev.tags : d.tags,
    });
  }
  return [...byUrl.values()]
    .filter((g) => g.title && g.url)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}
