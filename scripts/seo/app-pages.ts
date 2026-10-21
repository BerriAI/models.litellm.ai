/**
 * Server-rendered content for the app's routes (/, /providers, /cookbook,
 * /guardrails). shell.ts puts it in the page itself, not in <noscript>, so
 * crawlers that don't run JavaScript read the same content the app shows.
 * Every count comes from the data the app reads; nothing here is typed by hand.
 */
import { escapeHtml as esc, int, longDate } from "./format";
import { hubProvider, type ProviderSupport } from "./providers";
import { modelPath, providerPath } from "./site";

export type Crumb = { name: string; path: string };

export type AppPage = {
  body: string;
  breadcrumbs: Crumb[];
  /** Date the content last changed, for the sitemap; omitted when the data has no dates. */
  lastmod?: string;
};

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

export function homePage(
  models: number,
  hubs: Hub[],
  recent: RecentModel[],
  lastmod: string,
): AppPage {
  return {
    breadcrumbs: crumbs(),
    lastmod,
    body: `<h1>AI model pricing, context windows and providers</h1>
<p>Prices, context windows and features for ${int(models)} AI models across ${int(hubs.length)} providers, from LiteLLM's open-source price file, as of ${longDate(lastmod)}. <a href="/models">Browse every model</a>, <a href="/compare">compare models side by side</a>, see <a href="/rankings">rankings by price</a> the <a href="/new-models">latest new models</a>, or use the <a href="/calculator">pricing calculator</a>.</p>
<h2>Recently added models</h2>
<ul>${recent.map((m) => `<li><a href="${modelPath(m.slug)}">${esc(m.name)}</a>${m.price ? `: ${esc(m.price)}` : ""}</li>`).join("")}</ul>
<h2>Pricing by provider</h2>
<ul>${hubs.map((h) => `<li><a href="${providerPath(h.hub)}">${esc(h.name)} pricing</a>: ${int(h.count)} models</li>`).join("")}</ul>`,
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
      const name = (p.display_name ?? id)
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
