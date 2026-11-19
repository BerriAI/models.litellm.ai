import {
  DEPRECATION_FEED_PATH,
  deprecationWindow,
  shiftDeprecationDay,
  type DeprecationSearchRow,
} from "../../src/deprecations.js";
import { rssFeed } from "./crawl.js";
import { abs, deprecationPath } from "./site.js";

export function deprecationRss(
  rows: DeprecationSearchRow[],
  today: string,
  days?: number,
): string {
  const includes =
    days === undefined
      ? (date: string) => date <= today
      : deprecationWindow(today, days);
  const items = rows
    .filter((row) => includes(row.d))
    .map((row) => {
      const opensOn =
        days === undefined ? row.d : shiftDeprecationDay(row.d, -days);
      return {
        title: `${row.n} listings ${row.d <= today ? "deprecated" : "scheduled for deprecation"} on ${row.pn}`,
        link: abs(deprecationPath({ date: row.d, id: row.id })),
        guid: `urn:litellm:deprecation:${row.id}`,
        date:
          days !== undefined && row.observed > opensOn ? row.observed : opensOn,
        description: `Effective ${row.d} on ${row.pn}. Affected listings: ${row.ids.join(", ")}. Other versions or providers may still offer this model.${row.r ? ` Recommended replacement: ${row.r}.` : ""}${row.ref ? ` Provider notice: ${row.ref}` : ""}`,
      };
    });
  if (days !== undefined) items.sort((a, b) => b.date.localeCompare(a.date));
  return rssFeed(
    days === undefined
      ? "Recently deprecated AI models on LiteLLM"
      : "Upcoming AI model deprecations on LiteLLM",
    abs("/deprecated-models"),
    days === undefined
      ? "Provider-specific model deprecations recorded by LiteLLM. Publication dates are effective deprecation dates, not announcement dates."
      : `Provider-specific model deprecations effective from today through ${days} ${days === 1 ? "day" : "days"} ahead (UTC). The effective date is in each item description.`,
    items,
    DEPRECATION_FEED_PATH,
    days === undefined
      ? DEPRECATION_FEED_PATH
      : `${DEPRECATION_FEED_PATH}?days=${days}`,
  );
}
