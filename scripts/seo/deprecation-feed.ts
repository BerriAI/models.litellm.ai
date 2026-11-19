import {
  DEPRECATION_FEED_PATH,
  inDeprecationDateRange,
  type DeprecationDateRange,
  type DeprecationSearchRow,
} from "../../src/deprecations.js";
import { rssFeed } from "./crawl.js";
import { abs, deprecationPath } from "./site.js";

export function deprecationRss(
  rows: DeprecationSearchRow[],
  today: string,
  range?: DeprecationDateRange,
): string {
  const items = rows
    .filter((row) =>
      range ? inDeprecationDateRange(row.d, range) : row.d <= today,
    )
    .map((row) => ({
      title: `${row.n} listings ${row.d <= today ? "deprecated" : "scheduled for deprecation"} on ${row.pn}`,
      link: abs(deprecationPath({ date: row.d, id: row.id })),
      guid: `urn:litellm:deprecation:${row.id}`,
      date: range && row.observed < row.d ? row.observed : row.d,
      description: `Effective ${row.d} on ${row.pn}. Affected listings: ${row.ids.join(", ")}. Other versions or providers may still offer this model.${row.r ? ` Recommended replacement: ${row.r}.` : ""}${row.ref ? ` Provider notice: ${row.ref}` : ""}`,
    }));
  return rssFeed(
    range
      ? "Model deprecations by effective date on LiteLLM"
      : "Recently deprecated AI models on LiteLLM",
    abs("/deprecated-models"),
    range
      ? `Provider-specific model deprecations effective from ${range.from} through ${range.to} (inclusive). The effective date is in each item description.`
      : "Provider-specific model deprecations recorded by LiteLLM. Publication dates are effective deprecation dates, not announcement dates.",
    items,
    DEPRECATION_FEED_PATH,
    range
      ? `${DEPRECATION_FEED_PATH}?${new URLSearchParams(range)}`
      : DEPRECATION_FEED_PATH,
  );
}
