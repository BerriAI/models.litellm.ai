import {
  MAX_DEPRECATION_DAYS,
  deprecationDays,
  type DeprecationSearchRow,
} from "../src/deprecations.js";
import { deprecationRss } from "../scripts/seo/deprecation-feed.js";
import { selfHeaders } from "./og.js";

const HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const days = deprecationDays(url.searchParams);
  if (days === null) {
    return new Response(
      `Use one days parameter with a whole number from 0 to ${MAX_DEPRECATION_DAYS}.`,
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
  return new Response(deprecationRss(rows, today, days), {
    headers: {
      ...HEADERS,
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
