/**
 * Writes a static, crawlable page for every model and provider into dist/,
 * after `vite build`. Run with: vite-node scripts/seo/generate.ts
 *
 * Inputs are fetched at build time (the same files the catalog app loads in
 * the browser). The previous build's manifest supplies per-model change dates
 * and price history, so sitemap lastmod values only move when data changes.
 *
 * Env:
 *   SITE_URL               public origin (default https://models.litellm.ai)
 *   COST_MAP_FILE          read the cost map from disk instead of GitHub
 *   PROVIDER_SUPPORT_FILE  read provider_endpoints_support.json from disk
 *   PREVIOUS_MANIFEST_URL  manifest to diff against, or "none"
 *   BUILD_DATE             override today's date (YYYY-MM-DD), for tests
 *   SEO_OUT_DIR            output directory (default dist)
 *   GITHUB_TOKEN           optional; avoids GitHub API rate limits for the star count
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pageCopy } from "./copy";
import { llmsTxt, robotsTxt, sitemapIndex, urlset, type SitemapEntry } from "./crawl";
import { escapeHtml as esc, int, longDate, monthYear, tokensShort, usd, usdShort } from "./format";
import { assignSlugs, catalogSlugs, groupCostMap, type CostMap, type Overrides } from "./group";
import { indexTable, layout, modelBody, notFoundBody, type IndexRow } from "./html";
import { listGraph, modelGraph, siteNodes, webPage } from "./jsonld";
import { loadPreviousManifest, type Manifest } from "./manifest";
import { modelMarkdown } from "./markdown";
import { copyCardFonts, modelCard, providerCard, writeCard } from "./og";
import { appShell, linkList } from "./shell";
import { buildModelView, type ModelView, type RowView } from "./model-view";
import { CHAT_MODES, IMAGE_MODES } from "./pricing";
import { providerDocsUrl, providerName, type ProviderSupport } from "./providers";
import { COST_MAP_RAW_URL, PROVIDER_SUPPORT_RAW_URL, SITE_URL, abs, modelPath, providerPath } from "./site";

const OUT = path.resolve(process.env.SEO_OUT_DIR ?? "dist");
const BUILD_DATE = (process.env.BUILD_DATE ?? new Date().toISOString()).slice(0, 10);
const HERE = path.dirname(new URL(import.meta.url).pathname);

function write(rel: string, content: string): void {
  const file = path.join(OUT, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

async function fetchText(url: string, timeoutMs = 30_000): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.text();
}

async function loadText(file: string | undefined, url: string): Promise<string> {
  return file ? readFileSync(file, "utf8") : fetchText(url);
}

/** GitHub API read, authenticated when GITHUB_TOKEN is set; null on any failure. */
async function github<T>(pathAndQuery: string): Promise<T | null> {
  try {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(`https://api.github.com/${pathAndQuery}`, { headers, signal: AbortSignal.timeout(10_000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Short price for lists and history: "$4/$20 per 1M tokens", "$0.0336 per image". */
export function shortPrice(r: RowView | null): string | null {
  if (!r) return null;
  const p = r.prices;
  if (CHAT_MODES.has(r.mode) && p.input !== undefined && p.output !== undefined) {
    return p.input === 0 && p.output === 0 ? "Free" : `${usdShort(p.input)} / ${usdShort(p.output)} per 1M tokens`;
  }
  if (r.mode === "embedding" && p.input !== undefined) return p.input === 0 ? "Free" : `${usdShort(p.input)} per 1M tokens`;
  if (IMAGE_MODES.has(r.mode) && p.perImage !== undefined) return `${usd(p.perImage)} per image`;
  if (p.perSecond !== undefined) return `${usd(p.perSecond)} per second`;
  if (p.perMinute !== undefined) return `${usd(p.perMinute)} per minute`;
  if (p.per1MChars !== undefined) return `${usdShort(p.per1MChars)} per 1M characters`;
  if (p.input !== undefined) return `${usdShort(p.input)} per 1M input tokens`;
  if (p.imageOutputTokens !== undefined) return `${usdShort(p.imageOutputTokens)} per 1M image tokens`;
  return null;
}

function contentHash(v: ModelView): string {
  return sha(
    JSON.stringify({
      name: v.name,
      rows: v.rows.map((r) => [r.key, r.prices, r.context, r.maxOutput, r.deprecation, r.outlier]),
      caps: v.capabilities,
    }),
  ).slice(0, 16);
}

const family = (slug: string) => slug.split(/[-.]/).slice(0, 2).join("-");

/** Same family first, then the same kind of model (image, chat, embedding), newest first. */
function relatedFor(v: ModelView, byLab: Map<string, ModelView[]>, byFamily: Map<string, ModelView[]>): ModelView[] {
  const pool = (v.lab ? byLab.get(v.lab) ?? [] : byFamily.get(family(v.slug)) ?? []).filter((o) => o !== v && (o.headline || o.context));
  const score = (o: ModelView) => (family(o.slug) === family(v.slug) ? 2 : 0) + (o.mode === v.mode ? 1 : 0);
  return [...pool].sort((a, b) => score(b) - score(a)).slice(0, 8);
}

const newestFirst = (a: ModelView, b: ModelView) =>
  (b.addedDate ?? "").localeCompare(a.addedDate ?? "") || a.name.localeCompare(b.name);

function addedLabel(date: string | null): string | null {
  return date ? monthYear(date) : null;
}

async function main(): Promise<void> {
  // Start clean so pages for regrouped or renamed models never linger.
  for (const dir of ["models", "providers", "sitemaps", "og"]) rmSync(path.join(OUT, dir), { recursive: true, force: true });
  const costMapText = await loadText(process.env.COST_MAP_FILE, COST_MAP_RAW_URL);
  const costMap = JSON.parse(costMapText) as CostMap;
  let support: ProviderSupport = {};
  try {
    support = JSON.parse(await loadText(process.env.PROVIDER_SUPPORT_FILE, PROVIDER_SUPPORT_RAW_URL));
  } catch (err) {
    console.warn("seo: provider_endpoints_support.json unavailable, using built-in names", err);
  }
  const overrides = JSON.parse(readFileSync(path.join(HERE, "overrides.json"), "utf8")) as Overrides;
  const seededDates = JSON.parse(readFileSync(path.join(HERE, "added-dates.json"), "utf8")) as Record<string, string>;
  const previous = await loadPreviousManifest(process.env.PREVIOUS_MANIFEST_URL ?? `${SITE_URL}/models/manifest.json`);

  const groups = groupCostMap(costMap, overrides);
  const previousSlugs: Record<string, string> = {};
  for (const [slug, m] of Object.entries(previous?.models ?? {})) if (!m.retiredOn) previousSlugs[m.pageKey] = slug;
  const slugs = assignSlugs(groups, overrides, previousSlugs);
  // When each model joined LiteLLM: the previous build's record, else the git-history seed. Only a model
  // missing from the previous build is new today; one that was already there without a date stays undated.
  const views = groups.map((g) => {
    const slug = slugs.get(g.pageKey)!;
    const prev = previous?.models[slug];
    const seeded = seededDates[g.pageKey] ?? null;
    const added = prev && !prev.retiredOn ? prev.firstSeen ?? seeded : seeded ?? (previous ? BUILD_DATE : null);
    return buildModelView(g, slug, overrides, support, added);
  });

  const byLab = new Map<string, ModelView[]>();
  const byFamily = new Map<string, ModelView[]>();
  for (const v of [...views].sort(newestFirst)) {
    if (v.lab) byLab.set(v.lab, [...(byLab.get(v.lab) ?? []), v]);
    byFamily.set(family(v.slug), [...(byFamily.get(family(v.slug)) ?? []), v]);
  }

  const hubs = new Map<string, { view: ModelView; row: RowView }[]>();
  for (const v of views) {
    const best = new Map<string, RowView>();
    for (const r of v.rows) {
      if (r.outlier) continue;
      const cur = best.get(r.hub);
      const better =
        !cur ||
        (r.standard && !cur.standard) ||
        (r.standard === cur.standard && (r.metric?.value ?? Infinity) < (cur.metric?.value ?? Infinity));
      if (better) best.set(r.hub, r);
    }
    for (const [hub, row] of best) hubs.set(hub, [...(hubs.get(hub) ?? []), { view: v, row }]);
  }
  const hubList = [...hubs.entries()]
    .map(([hub, list]) => ({
      hub,
      name: providerName(hub, support),
      list: list.filter((x) => x.view.headline || x.view.context).sort((a, b) => newestFirst(a.view, b.view)),
    }))
    .filter((h) => h.list.length > 0)
    .sort((a, b) => b.list.length - a.list.length || a.name.localeCompare(b.name));

  const hubSet = new Set(hubList.map((h) => h.hub));

  const manifest: Manifest = { version: 1, buildDate: BUILD_DATE, costMapHash: sha(costMapText), models: {} };
  const modelEntries: SitemapEntry[] = [];
  const changed: string[] = [];
  const slugMap = catalogSlugs(groups, slugs);

  for (const v of views) {
    const copy = pageCopy(v, BUILD_DATE);
    const hash = contentHash(v);
    const prev = previous?.models[v.slug];
    const unchanged = !!prev && prev.hash === hash && !prev.retiredOn;
    const lastChanged = unchanged ? prev.lastChanged : BUILD_DATE;
    const firstSeen = v.addedDate;
    const price = shortPrice(v.headline);
    const history = [...(prev?.history ?? [])];
    if (price && history[history.length - 1]?.price !== price) history.push({ date: BUILD_DATE, price });

    const thin = !v.headline && !v.context;
    const related = relatedFor(v, byLab, byFamily).map((o) => ({ name: o.name, slug: o.slug, price: shortPrice(o.headline) }));
    const body = modelBody(v, copy, { buildDate: BUILD_DATE, lastChanged, related, history: history.slice(-20), hubs: hubSet });
    write(
      `models/${v.slug}.html`,
      layout({
        title: copy.title,
        description: copy.description,
        path: modelPath(v.slug),
        body,
        jsonLd: modelGraph(v, copy, lastChanged, firstSeen ?? undefined),
        markdownPath: `${modelPath(v.slug)}.md`,
        noindex: thin,
        image: writeCard(OUT, "models", v.slug, modelCard(v)),
      }),
    );
    write(`models/${v.slug}.md`, modelMarkdown(v, copy, lastChanged));

    if (!thin) modelEntries.push({ path: modelPath(v.slug), lastmod: lastChanged });
    // Compare with the previous build, not the date: a second build on the same day
    // must not report every page that changed earlier that day.
    if (!unchanged && !thin) changed.push(abs(modelPath(v.slug)));
    manifest.models[v.slug] = {
      pageKey: v.pageKey,
      name: v.name,
      lab: v.lab,
      price,
      context: v.context,
      providers: v.providers.map((p) => p.name),
      hash,
      firstSeen,
      lastChanged,
      history: history.slice(-50),
    };
  }

  // Models that left the price file keep a page with their last known price, outside the sitemap.
  for (const [slug, m] of Object.entries(previous?.models ?? {})) {
    if (manifest.models[slug]) continue;
    const retiredOn = m.retiredOn ?? BUILD_DATE;
    manifest.models[slug] = { ...m, retiredOn };
    const newer = (m.lab ? byLab.get(m.lab) ?? [] : []).slice(0, 6);
    const title = `${m.name} API Pricing (Retired) | LiteLLM`;
    const description = `${m.name} is no longer listed in LiteLLM's price file.${m.price ? ` Its last listed price was ${m.price}.` : ""}`;
    write(
      `models/${slug}.html`,
      layout({
        title,
        description,
        path: modelPath(slug),
        jsonLd: { "@context": "https://schema.org", "@graph": [...siteNodes(), webPage(modelPath(slug), title, description, retiredOn)] },
        body: `<div class="head"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><a href="/models">Models</a><span>›</span><span>${esc(m.name)}</span></nav>
<h1>${esc(m.name)} API Pricing</h1>
<p class="answer">${esc(m.name)} was removed from LiteLLM's model price file on ${longDate(retiredOn)}, usually because the provider retired it.${m.price ? ` Its last listed price was ${esc(m.price)}` : ""}${m.context ? `, with a ${int(m.context)}-token context window` : ""}.${m.providers.length ? ` It was available from ${esc(m.providers.join(", "))}.` : ""}</p></div>
${newer.length ? `<section><h2>Newer ${esc(m.lab ?? "")} models</h2><ul class="links">${newer.map((o) => `<li><a href="${modelPath(o.slug)}">${esc(o.name)}<span>${shortPrice(o.headline) ?? ""}</span></a></li>`).join("")}</ul></section>` : ""}`,
      }),
    );
  }

  // /models index, newest first.
  const sorted = [...views].filter((v) => v.headline || v.context).sort(newestFirst);
  const rows: IndexRow[] = sorted.map((v) => ({
    name: v.name,
    slug: v.slug,
    lab: v.lab,
    price: shortPrice(v.headline),
    context: v.context,
    providers: v.providers.length,
    added: addedLabel(v.addedDate),
  }));

  const latestChange = [...Object.values(manifest.models)].reduce((max, m) => (m.lastChanged > max ? m.lastChanged : max), "");
  const month = monthYear(BUILD_DATE);
  const indexTitle = `AI Model API Pricing (${month}): ${int(rows.length)} Models Compared | LiteLLM`;
  const indexDescription = `Prices per 1M tokens, per image and per second for ${int(rows.length)} AI models across ${hubList.length} providers, from LiteLLM's open-source price file. Updated ${longDate(latestChange)}.`;
  write(
    "models.html",
    layout({
      title: indexTitle,
      description: indexDescription,
      path: "/models",
      image: writeCard(OUT, "pages", "models", {
        kicker: "AI model pricing",
        title: "Compare API pricing for every AI model",
        subtitle: "From LiteLLM's open-source price file",
        stats: [
          { value: int(rows.length), label: "models" },
          { value: int(hubList.length), label: "providers" },
          { value: int(Object.keys(costMap).filter((k) => k !== "sample_spec").length), label: "price listings" },
        ],
      }),
      jsonLd: listGraph("/models", indexTitle, indexDescription, latestChange, [{ name: "Models", path: "/models" }], rows.map((r) => ({ name: r.name, path: modelPath(r.slug) }))),
      body: `<div class="head"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><span>Models</span></nav>
<h1>AI model API pricing</h1>
<p class="answer">As of ${longDate(BUILD_DATE)}, LiteLLM tracks prices for ${int(rows.length)} models across ${hubList.length} providers. Each model page lists every provider's price, the context window, and the code to call it through LiteLLM. Most recently added models first.</p></div>
<section><h2>Browse by provider</h2><ul class="links">${hubList
        .slice(0, 40)
        .map((h) => `<li><a href="${providerPath(h.hub)}">${esc(h.name)}<span>${h.list.length} models</span></a></li>`)
        .join("")}</ul></section>
<section><h2>All models</h2>${indexTable(rows)}</section>`,
    }),
  );

  const providerEntries: SitemapEntry[] = [];
  for (const h of hubList) {
    const list = h.list;
    const hubChanged = list.reduce((max, x) => {
      const lc = manifest.models[x.view.slug]?.lastChanged ?? BUILD_DATE;
      return lc > max ? lc : max;
    }, "");
    const title = `${h.name} Models & API Pricing (${month}) | LiteLLM`;
    const newest = list.slice(0, 3).map((x) => x.view.name);
    const base = `Prices and context windows for ${list.length} ${h.name} models available through LiteLLM`;
    const including = newest.length ? `${base}, including ${newest.join(", ")}.` : `${base}.`;
    const description = including.length <= 160 ? including : `${base}. Updated ${longDate(hubChanged)}.`;
    const docs = providerDocsUrl(h.hub, support);
    const hubRows: IndexRow[] = list.map(({ view, row }) => ({
      name: view.name,
      slug: view.slug,
      lab: view.lab,
      price: shortPrice(row),
      context: row.context ?? view.context,
      providers: view.providers.length,
      added: addedLabel(view.addedDate),
    }));
    write(
      `providers/${h.hub}.html`,
      layout({
        title,
        description,
        path: providerPath(h.hub),
        image: writeCard(OUT, "providers", h.hub, providerCard(h.name, list.length, list[0]?.view.name)),
        jsonLd: listGraph(
          providerPath(h.hub),
          title,
          description,
          hubChanged,
          [
            { name: "Models", path: "/models" },
            { name: h.name, path: providerPath(h.hub) },
          ],
          list.map((x) => ({ name: x.view.name, path: modelPath(x.view.slug) })),
        ),
        body: `<div class="head"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><a href="/models">Models</a><span>›</span><span>${esc(h.name)}</span></nav>
<h1>${esc(h.name)} model pricing</h1>
<p class="answer">As of ${longDate(BUILD_DATE)}, ${list.length} ${esc(h.name)} models are available through LiteLLM${newest.length ? `. The most recently added are ${esc(newest.join(", "))}` : ""}. Prices below are ${esc(h.name)}'s list prices.</p>
${docs ? `<p class="meta"><a href="${esc(docs)}">How to call ${esc(h.name)} with LiteLLM</a></p>` : ""}</div>
<section><h2>${esc(h.name)} models</h2>${indexTable(hubRows)}</section>`,
      }),
    );
    providerEntries.push({ path: providerPath(h.hub), lastmod: hubChanged });
  }

  write("404.html", layout({ title: "Page not found | LiteLLM", description: "This page doesn't exist.", path: "/404", body: notFoundBody(), noindex: true }));

  // Crawl files.
  const pageEntries: SitemapEntry[] = [
    { path: "/", lastmod: latestChange },
    { path: "/models", lastmod: latestChange },
    // The app's other routes have their own pages now (see shell.ts); their content isn't dated.
    ...(existsSync(path.join(OUT, "index.html")) ? [{ path: "/providers" }, { path: "/cookbook" }, { path: "/guardrails" }] : []),
  ];
  write("sitemaps/pages.xml", urlset(pageEntries));
  write("sitemaps/models.xml", urlset(modelEntries.sort((a, b) => (b.lastmod ?? "").localeCompare(a.lastmod ?? ""))));
  write("sitemaps/providers.xml", urlset(providerEntries));
  write(
    "sitemap.xml",
    sitemapIndex([
      { path: "/sitemaps/pages.xml", lastmod: latestChange },
      { path: "/sitemaps/models.xml", lastmod: latestChange },
      { path: "/sitemaps/providers.xml", lastmod: latestChange },
    ]),
  );
  write("robots.txt", robotsTxt());

  // Share-image fonts, then the app's routes with their own head and a no-JS summary.
  copyCardFonts(OUT, path.resolve(HERE, "../.."));
  const indexFile = path.join(OUT, "index.html");
  if (existsSync(indexFile)) {
    const appHtml = readFileSync(indexFile, "utf8");
    const supported = Object.keys(support.providers ?? {}).length;
    const listings = Object.keys(costMap).filter((k) => k !== "sample_spec").length;
    const recent = sorted.slice(0, 20).map((v) => ({ href: modelPath(v.slug), text: v.name, note: shortPrice(v.headline) ?? undefined }));
    const hubLinks = hubList.slice(0, 30).map((h) => ({ href: providerPath(h.hub), text: `${h.name} pricing`, note: `${h.list.length} models` }));
    const homeDescription = `Compare pricing, context windows and features for ${int(rows.length)} AI models across ${hubList.length} providers, from LiteLLM's open-source price file.`;
    write(
      "index.html",
      appShell(appHtml, {
        path: "/",
        title: "LiteLLM Model Catalog: AI Model Pricing & Context Windows",
        description: homeDescription,
        image: writeCard(OUT, "pages", "home", {
          kicker: "LiteLLM Model Catalog",
          title: "AI model pricing, context windows and providers",
          subtitle: "Updated several times a day",
          stats: [
            { value: int(rows.length), label: "models" },
            { value: int(hubList.length), label: "providers" },
            { value: int(listings), label: "price listings" },
          ],
        }),
        noscript: `<main><h1>AI model pricing, context windows and providers</h1><p>${esc(homeDescription)} <a href="/models">Browse every model</a>.</p><h2>Recently added models</h2>${linkList(recent)}<h2>Pricing by provider</h2>${linkList(hubLinks)}</main>`,
      }),
    );
    const routes = [
      {
        path: "/providers",
        title: "AI Provider Integrations and Supported Endpoints | LiteLLM",
        description: `Browse ${supported} AI providers and the endpoints LiteLLM supports for each: chat completions, embeddings, images, audio, batches and more.`,
        card: { kicker: "LiteLLM providers", title: "AI provider integrations", subtitle: "Supported endpoints for every provider", stats: [{ value: int(supported), label: "providers" }] },
        noscript: `<main><h1>AI provider integrations</h1><p>LiteLLM supports ${supported} AI providers. Model prices by provider:</p>${linkList(hubLinks)}</main>`,
      },
      {
        path: "/cookbook",
        title: "AI Tool Guides | LiteLLM Cookbook",
        description: "Guides for using LiteLLM with popular AI tools and coding assistants, from the LiteLLM community.",
        card: { kicker: "LiteLLM cookbook", title: "AI tool guides", subtitle: "Use LiteLLM with popular AI tools and coding assistants", stats: [] },
        noscript: `<main><h1>AI tool guides</h1><p>Guides for using LiteLLM with popular AI tools and coding assistants. See also the <a href="https://docs.litellm.ai">LiteLLM docs</a>.</p></main>`,
      },
      {
        path: "/guardrails",
        title: "Custom Code Guardrails | LiteLLM",
        description: "Copy, customize, and deploy guardrails that protect your LLM applications with LiteLLM.",
        card: { kicker: "LiteLLM guardrails", title: "Custom code guardrails", subtitle: "Copy, customize, and deploy them with LiteLLM", stats: [] },
        noscript: `<main><h1>Custom code guardrails</h1><p>Copy, customize, and deploy guardrails that protect your LLM applications. See the <a href="https://docs.litellm.ai/docs/proxy/guardrails/quick_start">guardrails docs</a>.</p></main>`,
      },
    ];
    for (const r of routes) {
      const id = r.path.slice(1);
      write(
        `${id}.html`,
        appShell(appHtml, { path: r.path, title: r.title, description: r.description, image: writeCard(OUT, "pages", id, r.card), noscript: r.noscript }),
      );
    }
  } else {
    console.warn("seo: dist/index.html not found; run vite build first to write the app route pages");
  }
  write(
    "llms.txt",
    llmsTxt(
      sorted.map((v) => ({
        name: v.name,
        slug: v.slug,
        summary: [shortPrice(v.headline), v.context ? `${tokensShort(v.context)} context` : null, `${v.providers.length} provider${v.providers.length === 1 ? "" : "s"}`]
          .filter(Boolean)
          .join(", "),
      })),
      hubList.map((h) => ({ name: h.name, hub: h.hub, count: h.list.length })),
    ),
  );

  write("models/manifest.json", JSON.stringify(manifest));
  write("models/slugs.json", JSON.stringify(slugMap));
  if (changed.length) changed.push(abs("/models"));
  write("changes.json", JSON.stringify({ buildDate: BUILD_DATE, urls: changed }));
  const repo = await github<{ stargazers_count?: number }>("repos/BerriAI/litellm");
  const lastCommit = await github<{ commit?: { committer?: { date?: string } } }[]>(
    "repos/BerriAI/litellm/commits?path=model_prices_and_context_window.json&per_page=1",
  );
  write(
    "build-info.json",
    JSON.stringify({
      builtAt: new Date().toISOString(),
      buildDate: BUILD_DATE,
      costMapHash: manifest.costMapHash,
      models: modelEntries.length,
      listings: Object.keys(costMap).filter((k) => k !== "sample_spec").length,
      providers: hubList.length,
      stars: repo?.stargazers_count ?? null,
      priceFileUpdatedAt: lastCommit?.[0]?.commit?.committer?.date ?? null,
    }),
  );

  const retired = Object.values(manifest.models).filter((m) => m.retiredOn).length;
  console.log(
    `seo: ${views.length} model pages (${modelEntries.length} indexable, ${changed.length ? changed.length - 1 : 0} new or changed, ${retired} retired), ${providerEntries.length} provider pages -> ${OUT}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
