import type { Deprecation } from "../../src/deprecations";
import { escapeHtml as esc, longDate, shortDate } from "./format";
import { modelUpdatesMeta, modelUpdatesNav } from "./html";
import { modelPath } from "./site";
import { refreshCadence } from "./deprecation-sources";

export const deprecationPath = (entry: Deprecation) =>
  `/deprecated-models/${entry.date.slice(0, 7)}#${entry.id}`;
const monthName = (ym: string) => longDate(`${ym}-01`).replace(/ 1, /, " ");

/** The notice's host, so the reference reads as a citation and not as a button. */
const noticeLabel = (url: string): string =>
  new URL(url).hostname.replace(/^www\./, "");

const noticeLink = (url: string | undefined): string =>
  url
    ? `<a class="ref" href="${esc(url)}" rel="noopener" target="_blank">${esc(noticeLabel(url))}</a>`
    : "–";

const TABLE_HEAD =
  "<thead><tr><th>Effective date</th><th>Model</th><th>API provider</th><th>Affected listings</th><th>Replacement</th><th>Reference</th></tr></thead>";
const SEARCH_LIMIT = 100;

/** What the in-page search reads from /deprecated-models.json: one row per grouped deprecation. */
export type DeprecationSearchRow = {
  id: string;
  n: string;
  s: string;
  p: string;
  pn: string;
  d: string;
  dt: string;
  ids: string[];
  r?: string;
  ref?: string;
  rl?: string;
};

export function deprecationSearchIndex(
  entries: Deprecation[],
): DeprecationSearchRow[] {
  return entries.map((entry) => ({
    id: entry.id,
    n: entry.name,
    s: entry.slug,
    p: entry.provider,
    pn: entry.providerName,
    d: entry.date,
    dt: shortDate(entry.date),
    ids: [...new Set(entry.listings.map((row) => row.modelId))],
    ...(entry.successor ? { r: entry.successor } : {}),
    ...(entry.reference
      ? { ref: entry.reference, rl: noticeLabel(entry.reference) }
      : {}),
  }));
}

function deprecationFilters(entries: Deprecation[], month?: string): string {
  const providers = [
    ...new Map(
      entries.map((entry) => [entry.provider, entry.providerName]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  return `<form class="dep-filter" role="search" data-dep-filter${month ? ` data-month="${esc(month)}"` : ""}><label>Search<input type="search" name="q" placeholder="Model name or id, e.g. azure/gpt-4o" autocomplete="off" spellcheck="false"></label><label>API provider<select name="provider"><option value="">All API providers</option>${providers.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join("")}</select></label></form><p class="note" data-dep-status aria-live="polite" hidden></p><div data-dep-results hidden></div>`;
}

/** Filters /deprecated-models.json in the browser, fetched on first use so the page stays the same size as the list grows. */
export const DEPRECATION_SEARCH_JS = `<script>(function(){
var form=document.querySelector("[data-dep-filter]");if(!form)return;
var q=form.querySelector('[name="q"]'),sel=form.querySelector('[name="provider"]'),month=form.getAttribute("data-month")||"";
var out=document.querySelector("[data-dep-results]"),status=document.querySelector("[data-dep-status]"),def=document.querySelector("[data-dep-default]");
var rows=null,loading=null,matches=0,MONTHS="/deprecated-models/",MODELS="/models/",timer=null,MAX=${SEARCH_LIMIT};
var esc=function(v){return String(v).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
function load(){if(!loading)loading=fetch("/deprecated-models.json").then(function(r){return r.json()}).then(function(d){rows=Array.isArray(d)?d:[]},function(e){loading=null;throw e});return loading}
function row(e){var ids=e.ids.map(function(m){return"<code>"+esc(m)+"</code>"});return'<tr><td><a href="'+MONTHS+esc(e.d.slice(0,7))+"#"+esc(e.id)+'"><time datetime="'+esc(e.d)+'">'+esc(e.dt)+'</time></a></td><td><a href="'+MODELS+esc(e.s)+'">'+esc(e.n)+"</a></td><td>"+esc(e.pn)+'</td><td class="affected-routes">'+(ids.length===1?ids[0]:"<details><summary>"+ids.length+" listings</summary><ul>"+ids.map(function(c){return"<li>"+c+"</li>"}).join("")+"</ul></details>")+"</td><td>"+(e.r?"<code>"+esc(e.r)+"</code>":"–")+"</td><td>"+(e.ref?'<a class="ref" href="'+esc(e.ref)+'" rel="noopener" target="_blank">'+esc(e.rl||e.ref)+"</a>":"–")+"</td></tr>"}
function sync(text,p){var u=new URLSearchParams(location.search);if(text)u.set("q",text);else u.delete("q");if(p)u.set("provider",p);else u.delete("provider");var s=u.toString();history.replaceState(null,"",location.pathname+(s?"?"+s:"")+location.hash)}
function apply(){
  var text=q.value.trim(),p=sel.value;sync(text,p);
  if(!text&&!p){out.hidden=true;out.innerHTML="";status.hidden=true;if(def)def.hidden=false;return Promise.resolve()}
  return load().then(function(){
    if(q.value.trim()!==text||sel.value!==p)return;
    var terms=text.toLowerCase().split(/\\s+/).filter(Boolean);
    var hits=rows.filter(function(e){if(month&&e.d.slice(0,7)!==month)return false;if(p&&e.p!==p)return false;var h=(e.n+" "+e.pn+" "+e.ids.join(" ")+" "+(e.r||"")).toLowerCase();return terms.every(function(t){return h.indexOf(t)>=0})});
    matches=hits.length;if(def)def.hidden=true;status.hidden=false;out.hidden=!hits.length;
    status.textContent=!hits.length?"No deprecations match.":hits.length>MAX?"Showing the first "+MAX+" of "+hits.length+" matching deprecations.":hits.length+(hits.length===1?" matching deprecation.":" matching deprecations.");
    out.innerHTML=hits.length?'<div class="tbl"><table>${TABLE_HEAD}<tbody>'+hits.slice(0,MAX).map(row).join("")+"</tbody></table></div>":"";
  },function(){status.hidden=false;status.textContent="Search could not load. Reload the page to try again."});
}
function track(){if((q.value.trim()||sel.value)&&window.litellmTrack)litellmTrack("deprecations_filtered",{provider:sel.value||null,has_query:!!q.value.trim(),matches:matches,page_kind:month?"deprecated-models-month":"deprecated-models"})}
form.addEventListener("submit",function(e){e.preventDefault()});
q.addEventListener("focus",function(){load().catch(function(){})});
q.addEventListener("input",function(){clearTimeout(timer);apply().then(function(){timer=setTimeout(track,1000)})});
sel.addEventListener("change",function(){clearTimeout(timer);apply().then(track)});
var start=new URLSearchParams(location.search),sp=start.get("provider");
if(start.get("q"))q.value=start.get("q");
if(sp&&sel.querySelector('option[value="'+sp.replace(/[^a-z0-9_-]/g,"")+'"]'))sel.value=sp;
if(q.value||sel.value)apply();
})()</script>`;

/** One row per API provider with dated listings: how many, how often LiteLLM re-reads it, and where to check. */
export function trackedProvidersTable(entries: Deprecation[]): string {
  const byProvider = new Map<
    string,
    { name: string; listings: number; references: Map<string, number> }
  >();
  for (const entry of entries) {
    const row = byProvider.get(entry.provider) ?? {
      name: entry.providerName,
      listings: 0,
      references: new Map<string, number>(),
    };
    row.listings += entry.listings.length;
    if (entry.reference)
      row.references.set(
        entry.reference,
        (row.references.get(entry.reference) ?? 0) + entry.listings.length,
      );
    byProvider.set(entry.provider, row);
  }
  /** The notice most of the provider's dated listings cite. */
  const mainReference = (references: Map<string, number>) =>
    [...references.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const rows = [...byProvider.entries()].sort(
    (a, b) =>
      b[1].listings - a[1].listings || a[1].name.localeCompare(b[1].name),
  );
  if (!rows.length)
    return '<p class="note">No providers with recorded deprecation dates.</p>';
  return `<div class="tbl"><table><thead><tr><th>API provider</th><th class="n">Dated listings</th><th>Checked</th><th>Reference</th></tr></thead><tbody>${rows
    .map(
      ([provider, row]) =>
        `<tr><td>${esc(row.name)}</td><td class="n">${row.listings}</td><td>${esc(refreshCadence(provider))}</td><td>${noticeLink(mainReference(row.references))}</td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}

export function deprecationTable(entries: Deprecation[]): string {
  if (!entries.length)
    return '<p class="note">No deprecations recorded for this period.</p>';
  return `<div class="tbl"><table>${TABLE_HEAD}<tbody>${entries
    .map((entry) => {
      const routes = [...new Set(entry.listings.map((row) => row.modelId))];
      const listing = (route: string) => `<code>${esc(route)}</code>`;
      return `<tr id="${esc(entry.id)}"><td><a href="${deprecationPath(entry)}"><time datetime="${entry.date}">${shortDate(entry.date)}</time></a></td><td><a href="${modelPath(entry.slug)}">${esc(entry.name)}</a></td><td>${esc(entry.providerName)}</td><td class="affected-routes">${routes.length === 1 ? listing(routes[0]) : `<details><summary>${routes.length} listings</summary><ul>${routes.map((route) => `<li>${listing(route)}</li>`).join("")}</ul></details>`}</td><td>${entry.successor ? `<code>${esc(entry.successor)}</code>` : "–"}</td><td>${noticeLink(entry.reference)}</td></tr>`;
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
${deprecationFilters(entries, month)}
<div data-dep-default><section><h2>${month ? "Deprecated this month" : "Recently deprecated"}</h2>${deprecationTable(month ? recent : recent.slice(0, 30))}</section>
${upcoming.length ? `<section><h2>Scheduled for deprecation</h2><p class="note">These dates are still ahead. Entries join the RSS feed when their effective date arrives.</p>${deprecationTable(month ? upcoming : upcoming.slice(0, 15))}</section>` : ""}
${month ? "" : `<section><h2>Tracked providers</h2><p class="note">LiteLLM reads each provider's own retirement notice into its price file on the schedule below, and this site rebuilds within about 20 minutes of a price file change. Providers checked by hand get their dates recorded when a maintainer finds them.</p>${trackedProvidersTable(entries)}</section>`}</div>
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
      ...(entry.reference
        ? [`Reference: [${noticeLabel(entry.reference)}](${entry.reference})`]
        : []),
      "",
      ...entry.listings.map((row) => `- \`${row.modelId.replace(/`/g, "")}\``),
      "",
    ]),
  ].join("\n");
}
