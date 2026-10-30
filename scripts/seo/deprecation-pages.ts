import type { Deprecation } from "../../src/deprecations";
import { escapeHtml as esc, longDate, shortDate } from "./format";
import { modelUpdatesNav } from "./html";
import { modelPath } from "./site";

export const deprecationPath = (entry: Deprecation) =>
  `/deprecated-models/${entry.date.slice(0, 7)}#${entry.id}`;
const monthName = (ym: string) => longDate(`${ym}-01`).replace(/ 1, /, " ");

export function deprecationTable(entries: Deprecation[]): string {
  if (!entries.length)
    return '<p class="note">No deprecations recorded for this period.</p>';
  return `<div class="tbl"><table><thead><tr><th>Effective date</th><th>Model</th><th>Provider</th><th>Affected listings</th></tr></thead><tbody>${entries
    .map((entry) => {
      const routes = [...new Set(entry.listings.map((row) => row.modelId))];
      const listing = (route: string) => `<code>${esc(route)}</code>`;
      return `<tr id="${esc(entry.id)}"><td><a href="${deprecationPath(entry)}"><time datetime="${entry.date}">${shortDate(entry.date)}</time></a></td><td><a href="${modelPath(entry.slug)}">${esc(entry.name)}</a></td><td>${esc(entry.providerName)}</td><td class="affected-routes">${routes.length === 1 ? listing(routes[0]) : `<details><summary>${routes.length} listings</summary><ul>${routes.map((route) => `<li>${listing(route)}</li>`).join("")}</ul></details>`}</td></tr>`;
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
<div class="meta"><span>Updated <time datetime="${today}">${longDate(today)}</time></span><a href="/deprecated-models.xml">RSS feed ↗</a></div></div>
${modelUpdatesNav("deprecated")}
<section><h2>${month ? "Deprecated this month" : "Recently deprecated"}</h2>${deprecationTable(month ? recent : recent.slice(0, 30))}</section>
${upcoming.length ? `<section><h2>Scheduled for deprecation</h2><p class="note">These dates are still ahead. Entries join the RSS feed when their effective date arrives.</p>${deprecationTable(month ? upcoming : upcoming.slice(0, 15))}</section>` : ""}
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
      "",
      ...entry.listings.map((row) => `- \`${row.modelId.replace(/`/g, "")}\``),
      "",
    ]),
  ].join("\n");
}
