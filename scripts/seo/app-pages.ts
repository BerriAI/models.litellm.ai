/**
 * Server-rendered content for the app's routes (/, /search, /providers, /cookbook,
 * /guardrails). shell.ts puts it in the page itself, not in <noscript>, so
 * crawlers that don't run JavaScript read the same content the app shows.
 * Every count comes from the data the app reads; nothing here is typed by hand.
 */
import { defaultBenchmarkCohort, parseBenchmarkResults, runMetrics, harnessName } from "../../src/codingBenchmarks";
import { escapeHtml as esc, int, longDate } from "./format";
import { hubProvider, type ProviderSupport } from "./providers";
import { PROVIDER_DISPLAY_NAMES } from "../../src/providers";
import { modelPath, providerPath } from "./site";

export type Crumb = { name: string; path: string };

export type AppPage = {
  body: string;
  breadcrumbs: Crumb[];
  /** Date the content last changed, for the sitemap; omitted when the data has no dates. */
  lastmod?: string;
};

export function evaluatePage(): AppPage {
  return {
    breadcrumbs: [{ name: "Home", path: "/" }, { name: "Evaluate", path: "/evaluate" }],
    body: `<h1>Evaluate your gateway traffic</h1>
<p>Find the right model for your traffic. Compare quality, speed, and cost using requests from your LiteLLM gateway.</p>
<h2>Run locally</h2><p>Requires Git and Node.js 22 or later.</p>
<pre><code>git clone https://github.com/BerriAI/models.litellm.ai.git &amp;&amp; cd models.litellm.ai &amp;&amp; npm ci &amp;&amp; npm run benchmark</code></pre>
<h2>What happens when you run it</h2>
<ol><li>Read gateway logs or a local export and sample by session.</li><li>Replay supported requests through your gateway to your selected models.</li><li>Infer checks from development requests and score held-out responses with local checks and a model judge.</li><li>Save an interactive HTML report on your device.</li></ol>
<p>Evaluation calls may incur model charges. The spending target stops new calls; one in-flight call can exceed it. Tools are not executed. Keys and raw traffic are excluded from the report. Nothing is uploaded to this website.</p>
<p><a href="/evaluate/sample">View sample report</a></p>`,
  };
}

export function sampleReportPage(): AppPage {
  return {
    breadcrumbs: [{ name: "Home", path: "/" }, { name: "Evaluate", path: "/evaluate" }, { name: "Sample report", path: "/evaluate/sample" }],
    body: `<h1>Sample evaluation report</h1><p>All models, traffic, costs, and scores in this example are fictional. They are not benchmark results or model recommendations.</p><p>Enable JavaScript to explore quality, speed, cost, workload allocation, and coverage in the interactive report.</p><p><a href="/evaluate">Run on your gateway traffic</a></p>`,
  };
}

/** Endpoint labels from provider_endpoints_support.json itself (e.g. "/chat/completions"), keyed by the provider field. */
function endpointLabels(support: ProviderSupport): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, e] of Object.entries(support.endpoints ?? {}))
    out[e.provider_json_field ?? key] =
      e.leftnav_label ?? e.display_name ?? key;
  return out;
}

const crumbs = (...rest: Crumb[]): Crumb[] => [
  { name: "Home", path: "/" },
  ...rest,
];

const nav = (items: Crumb[]) =>
  `<nav class="crumbs" aria-label="Breadcrumb">${items
    .map((c, i) =>
      i === items.length - 1
        ? `<span>${esc(c.name)}</span>`
        : `<a href="${c.path}">${esc(c.name)}</a><span>›</span>`,
    )
    .join("")}</nav>`;

export type Hub = { hub: string; name: string; count: number };
export type RecentModel = { slug: string; name: string; price: string | null };

function modelLists(hubs: Hub[], recent: RecentModel[]): string {
  return `<h2>Recently added models</h2>
<ul>${recent.map((m) => `<li><a href="${modelPath(m.slug)}">${esc(m.name)}</a>${m.price ? `: ${esc(m.price)}` : ""}</li>`).join("")}</ul>
<h2>Pricing by provider</h2>
<ul>${hubs.map((h) => `<li><a href="${providerPath(h.hub)}">${esc(h.name)} pricing</a>: ${int(h.count)} models</li>`).join("")}</ul>`;
}

export function homePage(
  models: number,
  hubs: Hub[],
  recent: RecentModel[],
  lastmod: string,
): AppPage {
  return {
    breadcrumbs: crumbs(),
    lastmod,
    body: `<h1>Discover AI models</h1>
<p>Explore ${int(models)} AI models across ${int(hubs.length)} providers, with prices and context windows from LiteLLM's open-source price file, as of ${longDate(lastmod)}.</p>
<p><a href="/search">Search models</a>, <a href="/compare">compare models and published benchmarks</a>, browse <a href="/new-models">new models</a>, view the <a href="/benchmarks">coding agent pilot</a>, or estimate your costs with the <a href="/calculator">pricing calculator</a>.</p>
${modelLists(hubs, recent)}`,
  };
}

export function searchPage(
  models: number,
  hubs: Hub[],
  recent: RecentModel[],
  lastmod: string,
): AppPage {
  return {
    lastmod,
    breadcrumbs: crumbs({ name: "Search models", path: "/search" }),
    body: `${nav(crumbs({ name: "Search models", path: "/search" }))}
<h1>Search AI models</h1>
<p>Search prices, context windows and features for ${int(models)} AI models across ${int(hubs.length)} providers.</p>
<form action="/search" method="get"><label for="model-search">Model or provider</label> <input id="model-search" name="q" type="search" /> <button type="submit">Search</button></form>
<p><a href="/models">Browse the full model catalog</a> or <a href="/rankings">see rankings by price and context window</a>.</p>
${modelLists(hubs, recent)}`,
  };
}

export function providersPage(
  support: ProviderSupport,
  hubs: Hub[],
  lastmod: string,
): AppPage {
  const supported = Object.entries(support.providers ?? {});
  const priced = new Map(hubs.map((h) => [h.hub, h]));
  const labels = endpointLabels(support);
  const rows = supported
    .map(([id, p]) => {
      const name = (PROVIDER_DISPLAY_NAMES[id] ?? p.display_name ?? id)
        .replace(/\s*\(`[^`]*`\)\s*$/, "")
        .trim();
      const endpoints = [
        ...new Set(
          Object.entries(p.endpoints ?? {})
            .filter(([, on]) => on === true)
            .map(([e]) => labels[e] ?? `/${e.replace(/_/g, "/")}`),
        ),
      ];
      return {
        id,
        name,
        endpoints,
        docs: p.url,
        hub: priced.get(hubProvider(id)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    breadcrumbs: crumbs({ name: "Providers", path: "/providers" }),
    lastmod,
    body: `${nav(crumbs({ name: "Providers", path: "/providers" }))}
<h1>AI provider integrations</h1>
<p>LiteLLM supports ${int(supported.length)} AI providers through one OpenAI-compatible API. ${int(hubs.length)} of them have model prices on this site. The table lists the endpoints LiteLLM supports for each provider and links its docs.</p>
<h2>Providers with model prices</h2>
<ul>${hubs.map((h) => `<li><a href="${providerPath(h.hub)}">${esc(h.name)} pricing</a>: ${int(h.count)} models</li>`).join("")}</ul>
<h2>Every supported provider and its endpoints</h2>
<table><thead><tr><th>Provider</th><th>Supported endpoints</th><th>Prices</th></tr></thead><tbody>${rows
      .map(
        (r) =>
          `<tr><td>${r.docs ? `<a href="${esc(r.docs)}">${esc(r.name)}</a>` : esc(r.name)}</td><td>${esc(r.endpoints.join(", ") || "–")}</td><td>${r.hub ? `<a href="${providerPath(r.hub.hub)}">${int(r.hub.count)} models</a>` : "–"}</td></tr>`,
      )
      .join("")}</tbody></table>`,
  };
}

export type CookbookGuide = {
  title?: string;
  description?: string;
  url?: string;
  date?: string;
  tags?: string[];
};

export function cookbookPage(guides: CookbookGuide[] | null): AppPage {
  const list = (guides ?? []).filter((g) => g.title && g.url);
  const dates = list
    .map((g) => g.date ?? "")
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const items = [...list].sort((a, b) =>
    (b.date ?? "").localeCompare(a.date ?? ""),
  );
  return {
    breadcrumbs: crumbs({ name: "Cookbook", path: "/cookbook" }),
    lastmod: dates[dates.length - 1],
    body: `${nav(crumbs({ name: "Cookbook", path: "/cookbook" }))}
<h1>AI tool guides</h1>
<p>${list.length ? `${int(list.length)} guides` : "Guides"} for using LiteLLM with AI coding tools and assistants, from the LiteLLM cookbook. See also the <a href="https://docs.litellm.ai">LiteLLM docs</a>.</p>
${items.length ? `<h2>All guides</h2><ul>${items.map((g) => `<li><a href="${esc(g.url!)}">${esc(g.title!)}</a>${g.description ? `: ${esc(g.description)}` : ""}${g.tags?.length ? ` <small>(${esc(g.tags.join(", "))})</small>` : ""}</li>`).join("")}</ul>` : ""}`,
  };
}

export type Guardrail = {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
};

export function guardrailsPage(
  guardrails: Record<string, Guardrail> | null,
): AppPage {
  const list = Object.values(guardrails ?? {}).filter((g) => g.name);
  const byCategory = new Map<string, Guardrail[]>();
  for (const g of list) {
    const c = g.category ?? "other";
    byCategory.set(c, [...(byCategory.get(c) ?? []), g]);
  }
  const sections = [...byCategory.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(
      ([c, gs]) =>
        `<h2>${esc(c[0].toUpperCase() + c.slice(1))} guardrails</h2><ul>${gs.map((g) => `<li><strong>${esc(g.name!)}</strong>${g.description ? `: ${esc(g.description)}` : ""}</li>`).join("")}</ul>`,
    )
    .join("");
  return {
    breadcrumbs: crumbs({ name: "Guardrails", path: "/guardrails" }),
    body: `${nav(crumbs({ name: "Guardrails", path: "/guardrails" }))}
<h1>Custom code guardrails</h1>
<p>${list.length ? `${int(list.length)} ready-made guardrails` : "Guardrails"} you can copy, customize and deploy on the LiteLLM AI Gateway to check requests and responses. See the <a href="https://docs.litellm.ai/docs/proxy/guardrails/custom_code_guardrail">custom code guardrails docs</a>.</p>
${sections}`,
  };
}

/** Completed-only pilot content from the same manifest consumed by the app. */
export function codingBenchmarksPage(raw: unknown): AppPage {
  const data = parseBenchmarkResults(raw);
  const cohort = defaultBenchmarkCohort(data);
  const rows = data.runs.filter(
    (run) => run.cohortId === cohort?.id && runMetrics(run, "api").complete,
  );
  const scope = cohort
    ? `${cohort.taskIds.length} tasks × ${cohort.repetitions} trial(s)`
    : "Results pending validation";
  return {
    breadcrumbs: crumbs({ name: "Coding benchmarks", path: "/benchmarks" }),
    ...(data.updatedAt ? { lastmod: data.updatedAt.slice(0, 10) } : {}),
    body: `<h1>Coding agent benchmarks</h1><p>Pilot: ${esc(scope)}. Directional results, not a stable overall ranking.</p>
${data.message ? `<p>${esc(data.message)}</p>` : ""}
<table><thead><tr><th>Harness</th><th>Model</th><th>Provider</th><th>Tasks resolved</th><th>Successful tasks / USD</th><th>Estimated API cost</th></tr></thead><tbody>${rows
      .map((run) => {
        const metrics = runMetrics(run, "api");
        return `<tr><td>${esc(harnessName(run.harness))}</td><td>${esc(run.modelName)}</td><td>${esc(run.providerName)}</td><td>${run.passed} / ${run.attempts}</td><td>${metrics.tasksPerDollar === null ? "Unavailable" : metrics.tasksPerDollar.toFixed(2)}</td><td>${run.apiCostUsd === null ? "Unavailable" : `$${run.apiCostUsd.toFixed(4)}`}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table><p>API estimates include failed attempts and retries; compute is excluded. Different cohorts are never combined. Missing or incomparable timing is not ranked.</p>`,
  };
}
