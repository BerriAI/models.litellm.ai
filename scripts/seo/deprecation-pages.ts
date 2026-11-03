import type { Deprecation } from "../../src/deprecations";
import { escapeHtml as esc, longDate, shortDate } from "./format";
import { modelUpdatesMeta, modelUpdatesNav } from "./html";
import { modelPath } from "./site";

export const deprecationPath = (entry: Deprecation) =>
  `/deprecated-models/${entry.date.slice(0, 7)}#${entry.id}`;
const monthName = (ym: string) => longDate(`${ym}-01`).replace(/ 1, /, " ");

const auditCadence =
  "Deprecation audits typically run daily. Verified changes appear here after they are merged into LiteLLM’s price file; the site checks for merged updates every 10 minutes.";
// Provider-sync configuration, not a list inferred from dated catalog entries.
// Keep this maintained alongside changes to the provider-sync coverage.
const auditedProviders = [
  "Anthropic",
  "AWS Bedrock",
  "Azure OpenAI and Azure AI Foundry",
  "Baseten",
  "Databricks",
  "Fireworks AI",
  "Google Gemini",
  "Google Vertex AI",
  "GitHub Copilot",
  "Meta",
  "OpenAI",
  "Together AI",
  "TypeSafe",
  "W&B Inference",
  "xAI",
];
const coverageNote =
  "Deprecation coverage varies by provider and source availability.";

export function deprecationTable(entries: Deprecation[]): string {
  if (!entries.length)
    return '<p class="note">No deprecations recorded for this period.</p>';
  return `<div class="tbl"><table><thead><tr><th>Effective date</th><th>Model</th><th>API provider</th><th>Affected listings</th></tr></thead><tbody>${entries
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
${modelUpdatesMeta("deprecated", today)}</div>
${modelUpdatesNav("deprecated")}
<section><h2>${month ? "Deprecated this month" : "Recently deprecated"}</h2>${deprecationTable(month ? recent : recent.slice(0, 30))}</section>
${upcoming.length ? `<section><h2>Scheduled for deprecation</h2><p class="note">These dates are still ahead. Entries join the RSS feed when their effective date arrives.</p>${deprecationTable(month ? upcoming : upcoming.slice(0, 15))}</section>` : ""}
<section><h2>By month</h2><ul class="links">${byMonth}</ul></section>
<section aria-labelledby="about-notices"><h2 id="about-notices">About these notices</h2>
<p class="note">Dates come from <a href="https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json">LiteLLM’s price file</a> and reflect provider listings, not announcement dates. History is backfilled from recorded dates; it may not include models removed before tracking began. Regional and pricing variants with the same provider and date are grouped together.</p>
<div class="grid2" style="align-items:start">
<section aria-labelledby="audit-cadence"><h3 id="audit-cadence">Update cadence</h3><p class="note">${esc(auditCadence)}</p></section>
<section aria-labelledby="audit-coverage"><h3 id="audit-coverage">Provider coverage</h3>
<p class="note">Automated catalog checks are configured for:</p>
<ul class="caps">${auditedProviders.map((provider) => `<li>${esc(provider)}</li>`).join("")}</ul>
<p class="note">${esc(coverageNote)}</p></section>
</div></section>`;
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
    "## About these notices",
    "",
    "### Update cadence",
    "",
    auditCadence,
    "",
    "### Provider coverage",
    "",
    "Automated catalog checks are configured for:",
    "",
    ...auditedProviders.map((provider) => `- ${provider}`),
    "",
    coverageNote,
  ].join("\n");
}
