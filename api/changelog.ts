/**
 * Serves /changelog.xml (rewritten here in vercel.json) from the build's
 * /changelog.json, filtered by ?kind= and ?providers=. A function rather than a
 * static file because the CDN caches static files by path alone, so a filtered
 * URL would be answered with the unfiltered feed once either was cached.
 * ?digest=commit folds every change of one catalog commit into one item, and
 * ?digest=1h (30m, 4h, 1d) every change of one clock hour, the shapes a Slack
 * channel subscription reads best. A window counts as closed by the time the
 * changelog was built, not the clock, so a commit the next build will add is
 * never missing from a window a reader has already posted.
 */
import {
  FEED_URL,
  changelogItems,
  changelogRss,
  digestFeedEntries,
  feedEntry,
  feedFilter,
  filterChangelogItems,
} from "../src/changelogPresentation.js";
import { selfHeaders } from "./og.js";

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
  const filter = feedFilter(url.searchParams);
  const items = filterChangelogItems(
    changelogItems(data.updates, data.providerNames ?? {}),
    filter,
  );
  const entries = filter.digest
    ? digestFeedEntries(items, filter.digest, Date.parse(data.generatedAt))
    : items.map(feedEntry);
  return new Response(
    changelogRss(entries, data.generatedAt, `${FEED_URL}${url.search}`),
    { headers: FEED_HEADERS },
  );
}
