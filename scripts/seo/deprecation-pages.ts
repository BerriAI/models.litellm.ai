import type { Deprecation } from "../../src/deprecations";
import { escapeHtml as esc, longDate, shortDate } from "./format";
import { modelUpdatesMeta, modelUpdatesNav } from "./html";
import { modelPath } from "./site";
import { deprecationNotice, refreshCadence } from "./deprecation-sources";

export const deprecationPath = (entry: Deprecation) =>
  `/deprecated-models/${entry.date.slice(0, 7)}#${entry.id}`;
const monthName = (ym: string) => longDate(`${ym}-01`).replace(/ 1, /, " ");

const noticeLink = (provider: string): string => {
  const url = deprecationNotice(provider);
  return url
    ? `<a href="${esc(url)}" rel="noopener" target="_blank">Provider notice</a>`
    : "–";
};

/** One row per API provider with dated listings: how many, how often LiteLLM re-reads it, and where to check. */
export function trackedProvidersTable(entries: Deprecation[]): string {
  const byProvider = new Map<string, { name: string; listings: number }>();
  for (const entry of entries) {
    const row = byProvider.get(entry.provider) ?? {
      name: entry.providerName,
      listings: 0,
    };
    row.listings += entry.listings.length;
    byProvider.set(entry.provider, row);
  }
  const rows = [...byProvider.entries()].sort(
    (a, b) =>
      b[1].listings - a[1].listings || a[1].name.localeCompare(b[1].name),
  );
  if (!rows.length)
    return '<p class="note">No providers with recorded deprecation dates.</p>';
  return `<div class="tbl"><table><thead><tr><th>API provider</th><th class="n">Dated listings</th><th>Checked</th><th>Reference</th></tr></thead><tbody>${rows
    .map(
      ([provider, row]) =>
        `<tr><td>${esc(row.name)}</td><td class="n">${row.listings}</td><td>${esc(refreshCadence(provider))}</td><td>${noticeLink(provider)}</td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}

export function deprecationTable(entries: Deprecation[]): string {
  if (!entries.length)
    return '<p class="note">No deprecations recorded for this period.</p>';
  return `<div class="tbl"><table><thead><tr><th>Effective date</th><th>Model</th><th>API provider</th><th>Affected listings</th><th>Replacement</th><th>Reference</th></tr></thead><tbody>${entries
    .map((entry) => {
      const routes = [...new Set(entry.listings.map((row) => row.modelId))];
      const listing = (route: string) => `<code>${esc(route)}</code>`;
      return `<tr id="${esc(entry.id)}"><td><a href="${deprecationPath(entry)}"><time datetime="${entry.date}">${shortDate(entry.date)}</time></a></td><td><a href="${modelPath(entry.slug)}">${esc(entry.name)}</a></td><td>${esc(entry.providerName)}</td><td class="affected-routes">${routes.length === 1 ? listing(routes[0]) : `<details><summary>${routes.length} listings</summary><ul>${routes.map((route) => `<li>${listing(route)}</li>`).join("")}</ul></details>`}</td><td>${entry.successor ? `<code>${esc(entry.successor)}</code>` : "–"}</td><td>${noticeLink(entry.provider)}</td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}

export function deprecationBody(
  entries: Deprecation[],
  months: { ym: string; count: number }[],
  today: string,
  month?: string,
): string {
  const recent = entries.filter((entry) => entry.date <= today);
  const upcoming = entries
    .filter((entry) => entry.date > today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const heading = month
    ? `AI model deprecations in ${monthName(month)}`
    : "Deprecated AI models on LiteLLM";
  const byMonth = months
    .map(
      (m) =>
        `<li><a href="/deprecated-models/${m.ym}"${m.ym === month ? ' aria-current="page"' : ""}>${esc(monthName(m.ym))}<span>${m.count} ${m.count === 1 ? "deprecation" : "deprecations"}</span></a></li>`,
    )
    .join("");
  return `<div class="head"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span>${month ? `<a href="/deprecated-models">Deprecated models</a><span>›</span><span>${esc(monthName(month))}</span>` : "<span>Deprecated models</span>"}</nav>
<h1>${esc(heading)}</h1><p class="answer">Model deprecations by provider, with effective dates and the exact listings affected. Other versions or providers may still be available.</p>
${modelUpdatesMeta("deprecated", today)}</div>
${modelUpdatesNav("deprecated")}
<section><h2>${month ? "Deprecated this month" : "Recently deprecated"}</h2>${deprecationTable(month ? recent : recent.slice(0, 30))}</section>
${upcoming.length ? `<section><h2>Scheduled for deprecation</h2><p class="note">These dates are still ahead. Entries join the RSS feed when their effective date arrives.</p>${deprecationTable(month ? upcoming : upcoming.slice(0, 15))}</section>` : ""}
${month ? "" : `<section><h2>Tracked providers</h2><p class="note">LiteLLM reads each provider's own retirement notice into its price file on the schedule below, and this site rebuilds within about 20 minutes of a price file change. Providers checked by hand get their dates recorded when a maintainer finds them.</p>${trackedProvidersTable(entries)}</section>`}
<section><h2>By month</h2><ul class="links">${byMonth}</ul></section>
<p class="note">Dates come from <a href="https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json">LiteLLM’s price file</a> and reflect provider listings, not announcement dates. History is backfilled from recorded dates; it may not include models removed before tracking began. Regional and pricing variants with the same provider and date are grouped together.</p>`;
}

export function deprecationMarkdown(
  entries: Deprecation[],
  title: string,
  today: string,
): string {
  return [
    `# ${title}`,
    "",
    `Updated ${today}. Dates are effective deprecation dates, not announcement dates. Other versions or providers may still offer the model.`,
    "",
    ...entries.flatMap((entry) => [
      `## ${entry.name} — ${entry.providerName}`,
      "",
      `${entry.date > today ? "Scheduled for" : "Deprecated"}: ${entry.date}`,
      ...(entry.successor
        ? [`Replacement: \`${entry.successor.replace(/`/g, "")}\``]
        : []),
      ...(deprecationNotice(entry.provider)
        ? [`Reference: ${deprecationNotice(entry.provider)}`]
        : []),
      "",
      ...entry.listings.map((row) => `- \`${row.modelId.replace(/`/g, "")}\``),
      "",
    ]),
  ].join("\n");
}
