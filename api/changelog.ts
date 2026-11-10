/**
 * Serves /changelog.xml (rewritten here in vercel.json) from the build's
 * /changelog.json, filtered by ?kind= and ?providers=. A function rather than a
 * static file because the CDN caches static files by path alone, so a filtered
 * URL would be answered with the unfiltered feed once either was cached.
 */
import {
  FEED_URL,
  changelogItems,
  changelogRss,
  feedFilter,
  filterChangelogItems,
} from "../src/changelogPresentation";
import { selfHeaders } from "./og";

const FEED_HEADERS = {
  "Content-Type": "application/rss+xml; charset=utf-8",
  "Cache-Control":
    "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
};

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const data = await fetch(new URL("/changelog.json", url.origin), {
    headers: selfHeaders(request),
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (!data?.updates) {
    return new Response("Changelog unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const items = filterChangelogItems(
    changelogItems(data.updates, data.providerNames ?? {}),
    feedFilter(url.searchParams),
  );
  return new Response(
    changelogRss(items, data.generatedAt, `${FEED_URL}${url.search}`),
    { headers: FEED_HEADERS },
  );
}
