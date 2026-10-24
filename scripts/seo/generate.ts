/**
 * Writes a static, crawlable page for every model and provider into dist/,
 * after `vite build`. Run with: vite-node scripts/seo/generate.ts
 *
 * Inputs are fetched at build time (the same files the catalog app loads in
 * the browser). The previous build's manifest supplies per-model change dates
 * and price history, so model and provider sitemap lastmod values only move
 * when data changes. Comparison, ranking, new-model and calculator sitemaps use
 * the build date.
 *
 * Env:
 *   SITE_URL               public origin (default https://models.litellm.ai)
 *   COST_MAP_FILE          read the cost map from disk instead of GitHub
 *   PROVIDER_SUPPORT_FILE  read provider_endpoints_support.json from disk
 *   PREVIOUS_MANIFEST_URL  manifest to diff against, or "none"
 *   BUILD_DATE             override today's date (YYYY-MM-DD), for tests
 *   SEO_OUT_DIR            output directory (default dist)
 *   COOKBOOK_FILE, GUARDRAILS_FILE  read the cookbook index and guardrails list from disk
 *   GITHUB_TOKEN           optional; avoids GitHub API rate limits for the star count
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pageCopy } from "./copy";
import { llmsTxt, robotsTxt, rssFeed, sitemapIndex, urlset, type SitemapEntry } from "./crawl";
import { escapeHtml as esc, int, longDate, monthYear, shortDate, tokensShort, usd, usdShort } from "./format";
import { assignSlugs, catalogSlugs, groupCostMap, type CostMap, type Overrides } from "./group";
import { calculatorBody, type CalcModel } from "./html";
import { CALC_JS, CALCULATOR_PAGE_JS, onCalculator } from "./calculator";
import { newModelsHubBody, newModelsMonthBody, rankingBody, rankingHubBody, type NewModelRow, type RankRow } from "./html";
import { buildRankings, indexableRanking, rankingAnswer, rankingPath, rankingTitle, type Ranking } from "./rankings";
import { compareBody, compareHubBody, indexTable, labSections, layout, modelBody, notFoundBody, type IndexRow } from "./html";
import { toolBody, toolData, TOOL_JS } from "./compare-tool";
import { benchRows, cheaperNote, cheapestRow, compareCopy, comparePath, indexable as compareIndexable, KIND_LABELS, selectPairs, successorOf, type Pair } from "./compare";
import { benchmarksFor, latestBenchmarkDate, loadBenchmarks, type BenchmarkData } from "./benchmarks";
import { breadcrumb, compareGraph, listGraph, modelGraph, siteNodes, webPage } from "./jsonld";
import { loadCookbook } from "./cookbook";
import { fetchBytes, fetchText } from "./fetch";
import { cookbookPage, guardrailsPage, homePage, providersPage, searchPage, type AppPage, type CookbookGuide, type Guardrail } from "./app-pages";
import { loadPreviousManifest, type Manifest } from "./manifest";
import { compareMarkdown, modelMarkdown, newModelsMarkdown, rankingMarkdown } from "./markdown";
import { compareCard, copyCardFonts, modelCard, providerCard, writeCard } from "./og";
import { appShell } from "./shell";
import type { CardInput } from "./og-card";
import { buildModelView, type ModelView, type RowView } from "./model-view";
import { CHAT_MODES, IMAGE_MODES, UNIT_LABEL, leadsWithTokens } from "./pricing";
import { providerDocsUrl, providerName, type ProviderSupport } from "./providers";
import { COOKBOOK_URL, COST_MAP_RAW_URL, GUARDRAILS_URL, PROVIDER_SUPPORT_RAW_URL, SITE_URL, abs, modelPath, providerPath } from "./site";
import { PAGE_TITLES } from "../../src/pageTitles";

const OUT = path.resolve(process.env.SEO_OUT_DIR ?? "dist");
const BUILD_DATE = (process.env.BUILD_DATE ?? new Date().toISOString()).slice(0, 10);
const HERE = path.dirname(new URL(import.meta.url).pathname);

function write(rel: string, content: string): void {
  const file = path.join(OUT, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

async function loadText(file: string | undefined, url: string): Promise<string> {
  return file ? readFileSync(file, "utf8") : fetchText(url);
}

/** Optional build data (the cookbook and guardrails lists); null when it can't be loaded. */
async function fetchJson<T>(file: string | undefined, url: string): Promise<T | null> {
  try {
    return JSON.parse(await loadText(file, url)) as T;
  } catch (err) {
    console.warn(`seo: ${url} unavailable; its page is built without that list`, err);
    return null;
  }
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
  if (leadsWithTokens(r.mode, p, r.metric) && p.input !== undefined && p.output !== undefined) {
    return p.input === 0 && p.output === 0 ? "Free" : `${usdShort(p.input)} / ${usdShort(p.output)} per 1M tokens`;
  }
  if (r.mode === "embedding" && p.input !== undefined) return p.input === 0 ? "Free" : `${usdShort(p.input)} per 1M tokens`;
  if (IMAGE_MODES.has(r.mode) && p.perImage !== undefined) return `${usd(p.perImage)} per image`;
  if (p.perSecond !== undefined) return `${usd(p.perSecond)} per second`;
  if (p.perMinute !== undefined) return `${usd(p.perMinute)} per minute`;
  if (p.per1MChars !== undefined) return `${usdShort(p.per1MChars)} per 1M characters`;
  if (r.metric && r.metric.value > 0 && r.metric.unit !== "per_1m_tokens") return `${usd(r.metric.value)} ${UNIT_LABEL[r.metric.unit]}`;
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
      intro: v.intro,
    }),
  ).slice(0, 16);
}

/** "Cheapest chat models on <provider>": its own prices, sorted by blended price (3 input : 1 output). */
function cheapestOnProvider(provider: string, list: { view: ModelView; row: RowView }[]): string {
  const priced = list
    .filter(({ view, row }) => view.status === "active" && view.mode === "chat" && (row.prices.input ?? 0) > 0 && (row.prices.output ?? 0) > 0)
    .map((x) => ({ ...x, blend: (3 * x.row.prices.input! + x.row.prices.output!) / 4 }))
    .sort((a, b) => a.blend - b.blend || a.view.name.localeCompare(b.view.name))
    .slice(0, 10);
  if (priced.length < 3) return "";
  return `<section id="cheapest"><h2>Cheapest chat models on ${esc(provider)}</h2><p class="note">Sorted by ${esc(provider)}'s own prices, blended at 3 input tokens per output token. Active chat models only.</p><div class="tbl"><table><thead><tr><th class="n">#</th><th>Model</th><th class="n">Blended per 1M</th><th>Input / output per 1M</th><th class="n">Context</th></tr></thead><tbody>${priced
    .map((x, i) => `<tr><td class="n">${i + 1}</td><td><a href="${modelPath(x.view.slug)}">${esc(x.view.name)}</a></td><td class="n">${usd(x.blend)}</td><td class="pr">${usd(x.row.prices.input!)} / ${usd(x.row.prices.output!)}</td><td class="n">${x.row.context ?? x.view.context ? tokensShort((x.row.context ?? x.view.context)!) : "–"}</td></tr>`)
    .join("")}</tbody></table></div></section>`;
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
  for (const dir of ["models", "providers", "compare", "rankings", "new-models", "sitemaps", "og"]) rmSync(path.join(OUT, dir), { recursive: true, force: true });
  // raw.githubusercontent.com serves `main` from a cache for up to five minutes, so a deploy
  // triggered right after a price change could rebuild the old file. A commit URL is never stale.
  const lastCommit = await github<{ sha?: string; commit?: { committer?: { date?: string } } }[]>(
    "repos/BerriAI/litellm/commits?path=model_prices_and_context_window.json&per_page=1",
  );
  const priceSha = lastCommit?.[0]?.sha;
  const costMapUrl = priceSha && /^[0-9a-f]{40}$/.test(priceSha) ? COST_MAP_RAW_URL.replace("/main/", `/${priceSha}/`) : COST_MAP_RAW_URL;
  const costMapText = await loadText(process.env.COST_MAP_FILE, costMapUrl);
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
  for (const [key, intro] of Object.entries(overrides.introPricing ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(intro.until) || !intro.source?.startsWith("https://")) {
      throw new Error(`overrides.json introPricing.${key} needs "until" as YYYY-MM-DD and an https "source"`);
    }
    if (!groups.some((g) => g.pageKey === key)) console.warn(`seo: overrides.json introPricing.${key} matches no model page`);
  }
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
    return buildModelView(g, slug, overrides, support, added, BUILD_DATE);
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
  /** Share images of changed pages; the refresh workflow loads them once so the CDN has them cached. */
  const changedImages: string[] = [];
  /** Retired models that now point at their successor. */
  const slugMap = catalogSlugs(groups, slugs);

  // Comparison pairs come first so each model page can link its comparisons.
  const families = overrides.families ?? {};
  const { pairs, published } = selectPairs(views, overrides, previous?.compare ?? {}, BUILD_DATE);
  manifest.compare = published;
  const pairsByModel = new Map<string, { slug: string; other: string }[]>();
  for (const p of pairs) {
    for (const [x, y] of [[p.a, p.b], [p.b, p.a]] as const) pairsByModel.set(x.slug, [...(pairsByModel.get(x.slug) ?? []), { slug: p.slug, other: y.name }]);
  }

  for (const v of views) {
    const copy = pageCopy(v, BUILD_DATE);
    const hash = contentHash(v);
    const prev = previous?.models[v.slug];
    const unchanged = !!prev && prev.hash === hash && !prev.retiredOn;
    const lastChanged = unchanged ? prev.lastChanged : BUILD_DATE;
    const firstSeen = v.addedDate;
    const price = shortPrice(v.headline);
    const history = [...(prev?.history ?? [])];
    const last = history[history.length - 1];
    if (price && last?.price !== price) {
      // Same data, new wording (a label fix): relabel the last entry instead of logging a price change.
      if (unchanged && last) history[history.length - 1] = { ...last, price };
      else history.push({ date: BUILD_DATE, price });
    }

    const thin = !v.headline && !v.context;
    const related = relatedFor(v, byLab, byFamily).map((o) => ({ name: o.name, slug: o.slug, price: shortPrice(o.headline) }));
    const successor = v.status === "retired" ? successorOf(v, views, families) : null;
    const body = modelBody(v, copy, { buildDate: BUILD_DATE, lastChanged, related, history: history.slice(-20), hubs: hubSet, comparisons: pairsByModel.get(v.slug), successor });
    const image = writeCard(OUT, "models", v.slug, modelCard(v));
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
        image,
        track: { kind: "model", id: v.slug },
        script: body.includes("data-calc") ? CALC_JS : undefined,
      }),
    );
    write(`models/${v.slug}.md`, modelMarkdown(v, copy, lastChanged, successor));

    // Retired models keep their page for reference but leave the sitemap.
    if (!thin && v.status !== "retired") modelEntries.push({ path: modelPath(v.slug), lastmod: lastChanged });
    // Compare with the previous build, not the date: a second build on the same day
    // must not report every page that changed earlier that day.
    if (!unchanged && !thin) {
      changed.push(abs(modelPath(v.slug)));
      changedImages.push(image.url);
    }
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
  const sorted = [...views].filter((v) => (v.headline || v.context) && v.status !== "retired").sort(newestFirst);
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
  const indexImage = writeCard(OUT, "pages", "models", {
    kicker: "AI model pricing",
    title: "Compare API pricing for every AI model",
    subtitle: "From LiteLLM's open-source price file",
    stats: [
      { value: int(rows.length), label: "models" },
      { value: int(hubList.length), label: "providers" },
      { value: int(Object.keys(costMap).filter((k) => k !== "sample_spec").length), label: "price listings" },
    ],
  });
  write(
    "models.html",
    layout({
      title: indexTitle,
      description: indexDescription,
      path: "/models",
      image: indexImage,
      jsonLd: listGraph("/models", indexTitle, indexDescription, latestChange, [{ name: "Models", path: "/models" }], rows.map((r) => ({ name: r.name, path: modelPath(r.slug) }))),
      body: `<div class="head"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><span>Models</span></nav>
<h1>AI model API pricing</h1>
<p class="answer">As of ${longDate(BUILD_DATE)}, LiteLLM tracks prices for ${int(rows.length)} models across ${hubList.length} providers. Each model page lists every provider's price, the context window, and the code to call it through LiteLLM. <a href="/compare">Compare models side by side</a>, see <a href="/rankings">rankings by price and context window</a>, the <a href="/new-models">newest models</a>, or estimate costs in the <a href="/calculator">pricing calculator</a>.</p></div>
<section><h2>Browse by provider</h2><ul class="links">${hubList
        .map((h) => `<li><a href="${providerPath(h.hub)}">${esc(h.name)}<span>${h.list.length} models</span></a></li>`)
        .join("")}</ul></section>
<section><h2>Models by lab</h2><p>Newest first within each lab. Retired models are left out; their pages stay up for reference.</p>${labSections(rows)}</section>`,
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
<div class="meta"><span>Prices updated <time datetime="${hubChanged}">${longDate(hubChanged)}</time></span><span>Checked <time datetime="${BUILD_DATE}">${longDate(BUILD_DATE)}</time></span>${docs ? `<a href="${esc(docs)}">How to call ${esc(h.name)} with LiteLLM</a>` : ""}</div></div>
${cheapestOnProvider(h.name, list)}
<section><h2>${esc(h.name)} models</h2>${indexTable(hubRows)}</section>`,
      }),
    );
    providerEntries.push({ path: providerPath(h.hub), lastmod: hubChanged });
  }

  // Comparison pages, their hub and sitemap.
  const benchData: BenchmarkData | null = await loadBenchmarks(async (url) =>
    process.env.EPOCH_FILE ? new Uint8Array(readFileSync(process.env.EPOCH_FILE)) : fetchBytes(url),
  );
  const benchFor = (v: ModelView) =>
    benchmarksFor(
      benchData,
      [v.slug, ...[v.headline, ...v.rows].flatMap((r) => (r ? [r.modelString.split("/").pop()!] : []))],
      [v.name, ...v.alsoKnownAs],
    );
  const benchDate = (pair: Pair) => latestBenchmarkDate([benchFor(pair.a), benchFor(pair.b)]);
  const introUntil = (v: ModelView) => (v.intro ? `introductory until ${longDate(v.intro.until)}` : null);
  const priceFrom = (v: ModelView) => [esc(v.headline!.providerName), introUntil(v)].filter(Boolean).join(", ");
  const yesNo = (v: ModelView, label: string) => {
    const c = v.capabilities.find((x) => x.label === label)?.supported;
    return c === undefined ? "–" : c ? "Yes" : "No";
  };
  const money = (n: number | undefined) => (n === undefined ? "–" : usd(n));
  const compareEntries: SitemapEntry[] = [];
  for (const pair of pairs) {
    const { a, b } = pair;
    const copy = compareCopy(pair, BUILD_DATE);
    const pa = a.headline!.prices;
    const pb = b.headline!.prices;
    const rows: [string, string, string][] = [
      ["Input, per 1M tokens", money(pa.input), money(pb.input)],
      ["Output, per 1M tokens", money(pa.output), money(pb.output)],
      ["Cache read, per 1M tokens", money(pa.cacheRead), money(pb.cacheRead)],
      ["Cache write, per 1M tokens", money(pa.cacheWrite), money(pb.cacheWrite)],
      ["Context window", `${int(a.context!)} tokens`, `${int(b.context!)} tokens`],
      ["Max output", a.maxOutput ? `${int(a.maxOutput)} tokens` : "–", b.maxOutput ? `${int(b.maxOutput)} tokens` : "–"],
      ["Image input", yesNo(a, "Image input"), yesNo(b, "Image input")],
      ["Tool calling", yesNo(a, "Function calling"), yesNo(b, "Function calling")],
      ["Structured output (JSON)", yesNo(a, "Structured output"), yesNo(b, "Structured output")],
      ["Prompt caching", yesNo(a, "Prompt caching"), yesNo(b, "Prompt caching")],
      ["Reasoning", yesNo(a, "Reasoning"), yesNo(b, "Reasoning")],
      ["Providers on LiteLLM", String(a.providers.length), String(b.providers.length)],
      ["Price shown is from", priceFrom(a), priceFrom(b)],
      ["Added to LiteLLM", a.addedDate ? longDate(a.addedDate) : "–", b.addedDate ? longDate(b.addedDate) : "–"],
    ];
    const related = pairs
      .filter((o) => o !== pair && (o.a === a || o.b === a || o.a === b || o.b === b))
      .slice(0, 5)
      .map((o) => ({ slug: o.slug, title: `${o.a.name} vs ${o.b.name}` }));
    const view = {
      slug: pair.slug,
      a,
      b,
      copy,
      rows,
      bench: benchRows(benchFor(a), benchFor(b)),
      benchDate: benchDate(pair),
      cheapest: [a, b].map((m) => ({ model: m, row: cheapestRow(m) })),
      related,
      buildDate: BUILD_DATE,
      hubs: hubSet,
    };
    const path = comparePath(pair.slug);
    const index = compareIndexable(pair);
    write(
      `compare/${pair.slug}.html`,
      layout({
        title: copy.title,
        description: copy.description,
        path,
        body: compareBody(view),
        jsonLd: compareGraph(path, copy.title, copy.description, BUILD_DATE, copy.h1, copy.faq),
        markdownPath: `${path}.md`,
        noindex: !index,
        image: writeCard(OUT, "compare", pair.slug, compareCard(a, b)),
        track: { kind: "compare", id: pair.slug },
      }),
    );
    write(`compare/${pair.slug}.md`, compareMarkdown(view));
    if (index) compareEntries.push({ path, lastmod: BUILD_DATE });
    if (index && !previous?.compare?.[pair.slug]) changed.push(abs(path));
  }
  const groupsByKind = (Object.keys(KIND_LABELS) as (keyof typeof KIND_LABELS)[]).map((kind) => ({
    label: KIND_LABELS[kind],
    items: pairs
      .filter((p) => p.kind === kind)
      .map((p) => ({ slug: p.slug, title: `${p.a.name} vs ${p.b.name}`, note: cheaperNote(p) })),
  }));
  const hubTitle = `AI Model Comparisons: Prices, Context Windows and Benchmarks | LiteLLM`;
  const hubDescription = `${pairs.length} side-by-side AI model comparisons: prices per 1M tokens, context windows, features and benchmark scores, from LiteLLM's price file.`;
  write(
    "compare.html",
    layout({
      title: hubTitle,
      description: hubDescription,
      path: "/compare",
      body: compareHubBody(groupsByKind, pairs.length, BUILD_DATE),
      jsonLd: listGraph("/compare", hubTitle, hubDescription, BUILD_DATE, [{ name: "Compare", path: "/compare" }], pairs.map((p) => ({ name: `${p.a.name} vs ${p.b.name}`, path: comparePath(p.slug) }))),
      image: writeCard(OUT, "pages", "compare", { kicker: "LiteLLM Model Catalog", title: "AI model comparisons", subtitle: "Prices, context windows and benchmarks side by side", stats: [{ value: int(pairs.length), label: "comparisons" }] }),
    }),
  );
  // The comparison tool and its data, rebuilt with every price change so it never goes stale.
  write("compare/models.json", JSON.stringify(toolData(views, benchFor, new Set(pairs.map((p) => p.slug)))));
  write(
    "compare/custom.html",
    layout({
      title: "Compare AI Models Side by Side | LiteLLM",
      description: "Pick up to four AI models and compare their prices, context windows, features and benchmark scores, from LiteLLM's price file.",
      path: "/compare/custom",
      body: toolBody(),
      noindex: true,
      track: { kind: "compare-tool", id: "custom" },
      script: TOOL_JS,
    }),
  );

  // Rankings: lists sorted by one fact (price or context window), never by quality.
  const rankings = buildRankings(views, families, new Set(previous?.rankings ?? []));
  manifest.rankings = rankings.map((r) => r.slug);
  const rankingEntries: SitemapEntry[] = [];
  const rankRows = (r: Ranking): RankRow[] =>
    r.items.map((x, i) => ({
      rank: i + 1,
      slug: x.view.slug,
      name: x.view.name,
      lab: x.view.lab,
      display: x.display,
      price: x.view.headline
        ? `${usd(x.view.headline.prices.input ?? 0)} / ${(x.view.headline.prices.output ?? 0) > 0 ? usd(x.view.headline.prices.output!) : "–"}${x.view.intro ? ` (${introUntil(x.view)})` : ""}`
        : null,
      context: x.view.context,
      providers: x.view.providers.length,
      seller: x.view.headline?.providerName ?? "–",
    }));
  for (const r of rankings) {
    const path = rankingPath(r.slug);
    const title = rankingTitle(r, month);
    const h1 = r.heading;
    const answer = rankingAnswer(r, longDate(BUILD_DATE));
    const description = answer.length <= 160 ? answer : `${h1}: the top ${r.items.length}, sorted by ${r.measure.toLowerCase()}, from LiteLLM's price file.`;
    const rows = rankRows(r);
    const others = rankings.filter((o) => o !== r).slice(0, 8).map((o) => ({ slug: o.slug, title: o.heading }));
    write(
      `rankings/${r.slug}.html`,
      layout({
        title,
        description,
        path,
        body: rankingBody({ title, h1, answer, method: r.method, measure: r.measure, rows, others, updated: BUILD_DATE, slug: r.slug }),
        jsonLd: listGraph(path, title, description, BUILD_DATE, [{ name: "Rankings", path: "/rankings" }, { name: h1, path }], r.items.map((x) => ({ name: x.view.name, path: modelPath(x.view.slug) }))),
        markdownPath: `${path}.md`,
        noindex: !indexableRanking(r),
        image: writeCard(OUT, "pages", `ranking-${r.slug}`, {
          kicker: "Ranking",
          title: h1,
          subtitle: `Sorted by ${r.measure.toLowerCase()}, as of ${shortDate(BUILD_DATE)}`,
          stats: r.items.slice(0, 3).map((x, i) => ({ value: `#${i + 1}`, label: `${x.view.name}, ${x.display}` })),
        }),
      }),
    );
    write(`rankings/${r.slug}.md`, rankingMarkdown({ h1, answer, method: r.method, measure: r.measure, path, rows }));
    if (indexableRanking(r)) rankingEntries.push({ path, lastmod: BUILD_DATE });
  }
  const rankingsTitle = "AI Model Rankings by Price and Context Window | LiteLLM";
  const rankingsDescription = `${rankings.length} lists of AI models sorted by price or context window, from LiteLLM's price file. None rank by quality.`;
  write(
    "rankings.html",
    layout({
      title: rankingsTitle,
      description: rankingsDescription,
      path: "/rankings",
      body: rankingHubBody(rankings.map((r) => ({ slug: r.slug, title: r.heading, note: r.items[0] ? `#1: ${r.items[0].view.name}` : "" })), BUILD_DATE),
      jsonLd: listGraph("/rankings", rankingsTitle, rankingsDescription, BUILD_DATE, [{ name: "Rankings", path: "/rankings" }], rankings.map((r) => ({ name: rankingTitle(r, month), path: rankingPath(r.slug) }))),
      image: writeCard(OUT, "pages", "rankings", { kicker: "LiteLLM Model Catalog", title: "AI model rankings", subtitle: "By price and context window, never by quality", stats: [{ value: int(rankings.length), label: "rankings" }] }),
    }),
  );

  // New models: a page per month, from each model's date added, and an RSS feed.
  const dated = views
    .filter((v) => v.addedDate && (v.headline || v.context))
    .sort((a, b) => b.addedDate!.localeCompare(a.addedDate!) || a.name.localeCompare(b.name));
  const newRow = (v: ModelView): NewModelRow => ({ slug: v.slug, name: v.name, lab: v.lab, date: v.addedDate!, price: shortPrice(v.headline), context: v.context, providers: v.providers.length, status: v.status });
  const byMonth = new Map<string, ModelView[]>();
  for (const v of dated) byMonth.set(v.addedDate!.slice(0, 7), [...(byMonth.get(v.addedDate!.slice(0, 7)) ?? []), v]);
  const months = [...byMonth.entries()].map(([ym, list]) => ({ ym, count: list.length }));
  const newModelEntries: SitemapEntry[] = [];
  for (const [ym, list] of byMonth) {
    const path = `/new-models/${ym}`;
    const name = longDate(`${ym}-01`).replace(/ 1, /, " ");
    const title = `New AI Models in ${name}: ${list.length} Added to LiteLLM | LiteLLM`;
    const description = `${list.length} AI ${list.length === 1 ? "model" : "models"} added to LiteLLM in ${name}, including ${list.slice(0, 3).map((v) => v.name).join(", ")}, with prices and context windows.`.slice(0, 200);
    const rows = list.map(newRow);
    const lastmod = list.map((v) => v.addedDate!).sort().at(-1)!;
    write(
      `new-models/${ym}.html`,
      layout({
        title,
        description: description.length <= 160 ? description : `${list.length} AI models added to LiteLLM in ${name}, with prices and context windows.`,
        path,
        body: newModelsMonthBody(ym, rows, months),
        jsonLd: listGraph(path, title, description, lastmod.length === 10 ? lastmod : `${lastmod}-01`, [{ name: "New models", path: "/new-models" }, { name, path }], list.map((v) => ({ name: v.name, path: modelPath(v.slug) }))),
        markdownPath: `${path}.md`,
        image: writeCard(OUT, "pages", `new-models-${ym}`, { kicker: "New models", title: `New AI models in ${name}`, subtitle: "Added to LiteLLM's price file", stats: [{ value: int(list.length), label: list.length === 1 ? "model" : "models" }] }),
      }),
    );
    write(`new-models/${ym}.md`, newModelsMarkdown(`New AI models in ${name}`, path, rows));
    newModelEntries.push({ path, lastmod: lastmod.length === 10 ? lastmod : undefined });
  }
  const latestNew = dated.slice(0, 30);
  const newTitle = "New AI Models on LiteLLM: Latest Additions by Month | LiteLLM";
  const newDescription = `The AI models most recently added to LiteLLM's price file, with prices and context windows, newest first. ${latestNew[0] ? `Latest: ${latestNew[0].name}.` : ""}`;
  write(
    "new-models.html",
    layout({
      title: newTitle,
      description: newDescription.length <= 160 ? newDescription : "The AI models most recently added to LiteLLM's price file, with prices and context windows, newest first.",
      path: "/new-models",
      body: newModelsHubBody(latestNew.map(newRow), months, BUILD_DATE),
      jsonLd: listGraph("/new-models", newTitle, newDescription, latestNew[0]?.addedDate?.length === 10 ? latestNew[0].addedDate : BUILD_DATE, [{ name: "New models", path: "/new-models" }], latestNew.map((v) => ({ name: v.name, path: modelPath(v.slug) }))),
      image: writeCard(OUT, "pages", "new-models", { kicker: "LiteLLM Model Catalog", title: "New AI models", subtitle: "Latest additions to LiteLLM's price file", stats: latestNew[0] ? [{ value: shortDate(latestNew[0].addedDate!.length === 10 ? latestNew[0].addedDate! : `${latestNew[0].addedDate}-01`), label: `latest: ${latestNew[0].name}` }] : [] }),
    }),
  );
  write(
    "new-models.xml",
    rssFeed(
      "New AI models on LiteLLM",
      abs("/new-models"),
      "AI models added to LiteLLM's model price file, with their prices.",
      dated.slice(0, 50).map((v) => ({ title: `${v.name} added to LiteLLM`, link: abs(modelPath(v.slug)), description: [shortPrice(v.headline), v.context ? `${tokensShort(v.context)} context` : null, v.lab ? `by ${v.lab}` : null].filter(Boolean).join(", "), date: v.addedDate! })),
    ),
  );

  // Cost calculator for every model still sold and priced per input and output token.
  const calcModels: CalcModel[] = views
    .filter(onCalculator)
    .sort((a, b) => b.providers.length - a.providers.length || a.name.localeCompare(b.name))
    .map((v) => ({
      slug: v.slug,
      name: v.name,
      input: v.headline!.prices.input!,
      output: v.headline!.prices.output!,
      providers: v.providers.length,
      ...(v.intro ? { intro: longDate(v.intro.until) } : {}),
    }));
  const calcInPairs = new Set(pairs.flatMap((p) => [p.a.slug, p.b.slug]));
  const calcTable = calcModels.filter((m) => calcInPairs.has(m.slug));
  const calcDefault = (overrides.compare?.pairs?.[0]?.[1] && calcModels.find((m) => m.slug === overrides.compare!.pairs[0][1])?.slug) || calcModels[0]?.slug;
  if (calcModels.length) {
    const title = `LLM API Pricing Calculator: Costs for ${int(calcModels.length)} AI Models | LiteLLM`;
    const description = `Estimate the cost of ${int(calcModels.length)} AI models for your workload: per request, per day and per month, at prices from LiteLLM's price file.`;
    write(
      "calculator.html",
      layout({
        title,
        description,
        path: "/calculator",
        body: calculatorBody(calcModels, calcDefault!, calcTable, BUILD_DATE),
        jsonLd: { "@context": "https://schema.org", "@graph": [...siteNodes(), { ...webPage("/calculator", title, description, BUILD_DATE), "@type": ["WebPage", "WebApplication"], applicationCategory: "FinanceApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: 0, priceCurrency: "USD" } }, breadcrumb([{ name: "Home", path: "/" }, { name: "Calculator", path: "/calculator" }])] },
        image: writeCard(OUT, "pages", "calculator", { kicker: "LiteLLM Model Catalog", title: "LLM API pricing calculator", subtitle: "Cost per request, day and month", stats: [{ value: int(calcModels.length), label: "models" }] }),
        track: { kind: "calculator", id: "calculator" },
        script: CALCULATOR_PAGE_JS,
      }),
    );
  }

  write("404.html", layout({ title: "Page not found | LiteLLM", description: "This page doesn't exist.", path: "/404", body: notFoundBody(), noindex: true }));


  // Share-image fonts, then the app's routes with their own head and server-rendered content.
  copyCardFonts(OUT, path.resolve(HERE, "../.."));
  const indexFile = path.join(OUT, "index.html");
  const appEntries: SitemapEntry[] = [];
  if (existsSync(indexFile)) {
    const appHtml = readFileSync(indexFile, "utf8");
    const supported = Object.keys(support.providers ?? {}).length;
    const listings = Object.keys(costMap).filter((k) => k !== "sample_spec").length;
    const hubs = hubList.map((h) => ({ hub: h.hub, name: h.name, count: h.list.length }));
    const recent = sorted.slice(0, 20).map((v) => ({ slug: v.slug, name: v.name, price: shortPrice(v.headline) }));
    const [cookbookIndex, guardrails] = await Promise.all([
      fetchJson<CookbookGuide[]>(process.env.COOKBOOK_FILE, COOKBOOK_URL),
      fetchJson<Record<string, Guardrail>>(process.env.GUARDRAILS_FILE, GUARDRAILS_URL),
    ]);
    // A local COOKBOOK_FILE means an offline build: skip the docs crawl.
    const guides = process.env.COOKBOOK_FILE ? cookbookIndex : await loadCookbook((u) => fetchText(u, { timeoutMs: 15_000 }), cookbookIndex);
    if (guides) write("cookbook.json", JSON.stringify(guides));
    const homeDescription = `Discover ${int(rows.length)} AI models across ${hubList.length} providers. Explore model pricing, context windows, new releases and published benchmark comparisons.`;
    const providersDescription = `LiteLLM supports ${supported} AI providers, ${hubList.length} with model prices here. See the endpoints each supports: chat, embeddings, images, audio, batches and more.`;
    const routes: { path: string; title: string; description: string; card: CardInput; page: AppPage }[] = [
      {
        path: "/",
        title: PAGE_TITLES.discover,
        description: homeDescription,
        card: {
          kicker: "LiteLLM Model Catalog",
          title: "Discover AI models",
          subtitle: "Model pricing, providers and published benchmark comparisons",
          stats: [
            { value: int(rows.length), label: "models" },
            { value: int(hubList.length), label: "providers" },
            { value: int(listings), label: "price listings" },
          ],
        },
        page: homePage(rows.length, hubs, recent, latestChange),
      },
      {
        path: "/search",
        title: PAGE_TITLES.models,
        description: `Search pricing, context windows and features for ${int(rows.length)} AI models across ${hubList.length} providers, from LiteLLM's open-source price file.`,
        card: { kicker: "LiteLLM Model Catalog", title: "Search AI models", subtitle: "Pricing, context windows and provider support", stats: [{ value: int(rows.length), label: "models" }, { value: int(hubList.length), label: "providers" }] },
        page: searchPage(rows.length, hubs, recent, latestChange),
      },
      {
        path: "/providers",
        title: PAGE_TITLES.providers,
        description: providersDescription,
        card: { kicker: "LiteLLM providers", title: "AI provider integrations", subtitle: "Supported endpoints for every provider", stats: [{ value: int(supported), label: "providers" }, { value: int(hubList.length), label: "with model prices" }] },
        page: providersPage(support, hubs, latestChange),
      },
      {
        path: "/cookbook",
        title: PAGE_TITLES.cookbook,
        description: `${guides?.length ? `${guides.length} guides` : "Guides"} for using LiteLLM with popular AI tools and coding assistants, from the LiteLLM cookbook.`,
        card: { kicker: "LiteLLM cookbook", title: "AI tool guides", subtitle: "Use LiteLLM with popular AI tools and coding assistants", stats: guides?.length ? [{ value: int(guides.length), label: "guides" }] : [] },
        page: cookbookPage(guides),
      },
      {
        path: "/guardrails",
        title: PAGE_TITLES.guardrails,
        description: `${guardrails ? `${Object.keys(guardrails).length} ready-made guardrails` : "Guardrails"} to copy, customize, and deploy on the LiteLLM AI Gateway to protect your LLM applications.`,
        card: { kicker: "LiteLLM guardrails", title: "Custom code guardrails", subtitle: "Copy, customize, and deploy them with LiteLLM", stats: guardrails ? [{ value: int(Object.keys(guardrails).length), label: "guardrails" }] : [] },
        page: guardrailsPage(guardrails),
      },
    ];
    for (const r of routes) {
      const id = r.path === "/" ? "home" : r.path.slice(1);
      const lastmod = r.page.lastmod ?? BUILD_DATE;
      const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [webPage(r.path, r.title, r.description, lastmod), breadcrumb(r.page.breadcrumbs)],
      };
      write(
        r.path === "/" ? "index.html" : `${id}.html`,
        appShell(appHtml, { path: r.path, title: r.title, description: r.description, image: writeCard(OUT, "pages", id, r.card), body: r.page.body, jsonLd }),
      );
      if (r.path !== "/") appEntries.push({ path: r.path, lastmod: r.page.lastmod });
    }
    // /discover is an alias of the root, with the same canonical and structured data.
    write("discover.html", readFileSync(indexFile, "utf8"));
  } else {
    console.warn("seo: dist/index.html not found; run vite build first to write the app route pages");
  }
  // Crawl files, after the app routes so their entries reflect whether their data loaded.
  const pageEntries: SitemapEntry[] = [
    { path: "/", lastmod: latestChange },
    { path: "/models", lastmod: latestChange },
    { path: "/compare", lastmod: BUILD_DATE },
    { path: "/rankings", lastmod: BUILD_DATE },
    { path: "/new-models", lastmod: BUILD_DATE },
    { path: "/calculator", lastmod: BUILD_DATE },
    ...appEntries,
  ];
  write("sitemaps/pages.xml", urlset(pageEntries));
  write("sitemaps/models.xml", urlset(modelEntries.sort((a, b) => (b.lastmod ?? "").localeCompare(a.lastmod ?? ""))));
  write("sitemaps/providers.xml", urlset(providerEntries));
  write("sitemaps/compare.xml", urlset(compareEntries));
  write("sitemaps/rankings.xml", urlset(rankingEntries));
  write("sitemaps/new-models.xml", urlset(newModelEntries));
  write(
    "sitemap.xml",
    sitemapIndex([
      { path: "/sitemaps/pages.xml", lastmod: latestChange },
      { path: "/sitemaps/models.xml", lastmod: latestChange },
      { path: "/sitemaps/providers.xml", lastmod: latestChange },
      { path: "/sitemaps/compare.xml", lastmod: BUILD_DATE },
      { path: "/sitemaps/rankings.xml", lastmod: BUILD_DATE },
      { path: "/sitemaps/new-models.xml", lastmod: BUILD_DATE },
    ]),
  );
  write("robots.txt", robotsTxt());
  const llmsModels = sorted.map((v) => ({
    name: v.name,
    slug: v.slug,
    summary: [shortPrice(v.headline), v.context ? `${tokensShort(v.context)} context` : null, `${v.providers.length} provider${v.providers.length === 1 ? "" : "s"}`]
      .filter(Boolean)
      .join(", "),
  }));
  const llmsProviders = hubList.map((h) => ({ name: h.name, hub: h.hub, count: h.list.length }));
  const llmsCompare = pairs.filter(compareIndexable).map((p) => ({ title: `${p.a.name} vs ${p.b.name}`, slug: p.slug }));
  write("llms.txt", llmsTxt(llmsModels, llmsProviders, 100, llmsCompare));
  write("llms-full.txt", llmsTxt(llmsModels, llmsProviders, undefined, llmsCompare));


  write("models/manifest.json", JSON.stringify(manifest));
  write("models/slugs.json", JSON.stringify(slugMap));
  if (changed.length) {
    changed.push(abs("/models"));
    changedImages.push(indexImage.url);
  }
  write("changes.json", JSON.stringify({ buildDate: BUILD_DATE, urls: changed, images: changedImages }));
  const repo = await github<{ stargazers_count?: number }>("repos/BerriAI/litellm");
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
