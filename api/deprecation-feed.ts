import {
  deprecationDateRange,
  type DeprecationSearchRow,
} from "../src/deprecations.js";
import { deprecationRss } from "../scripts/seo/deprecation-feed.js";
import { selfHeaders } from "./og.js";

const HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const range = deprecationDateRange(url.searchParams);
  if (!range) {
    return new Response(
      "Use one from date and one to date (YYYY-MM-DD). The from date must not be after the to date.",
      { status: 400, headers: HEADERS },
    );
  }

  const rows: DeprecationSearchRow[] | null = await fetch(
    new URL("/deprecated-models.json", url.origin),
    { headers: selfHeaders(request) },
  )
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  if (!Array.isArray(rows)) {
    return new Response("Deprecation feed unavailable", {
      status: 503,
      headers: HEADERS,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  return new Response(deprecationRss(rows, today, range), {
    headers: {
      ...HEADERS,
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
