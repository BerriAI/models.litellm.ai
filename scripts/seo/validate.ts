/**
 * Checks the generated site before it deploys: every page has a title,
 * description, canonical and valid JSON-LD; every internal link and sitemap
 * URL points at a file that exists; every catalog row links to a real page.
 * Exits non-zero on errors, so a bad build never replaces a good one.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { rangeMismatch } from "./consistency";
import { OG_ID } from "./og-card";
import { SITE_URL } from "./site";

const OUT = path.resolve(process.env.SEO_OUT_DIR ?? "dist");
const vercelConfig = JSON.parse(readFileSync(path.resolve("vercel.json"), "utf8")) as {
  rewrites?: { source: string; destination: string }[];
};
const appShellRewrites = (vercelConfig.rewrites ?? []).filter((r) => r.destination === "/").map((r) => r.source);
const SPA_ROUTES = new Set(["/", ...appShellRewrites]);
const errors: string[] = [];
const warnings: string[] = [];

function fileFor(urlPath: string): string | null {
  const clean = decodeURIComponent(urlPath.split(/[?#]/)[0]).replace(/\/$/, "") || "/";
  if (SPA_ROUTES.has(clean)) return path.join(OUT, "index.html");
  const candidates = [path.join(OUT, clean), path.join(OUT, `${clean}.html`), path.join(OUT, clean, "index.html")];
  return candidates.find((f) => existsSync(f) && statSync(f).isFile()) ?? null;
}

function htmlFiles(dir: string): string[] {
  return readdirSync(path.join(OUT, dir))
    .filter((f) => f.endsWith(".html"))
    .map((f) => path.join(dir, f));
}

// The app's routes are copies of index.html with their own head (scripts/seo/shell.ts).
const APP_PAGES: [string, string][] = [
  ["index.html", "/"],
  ["search.html", "/search"],
  ["providers.html", "/providers"],
  ["cookbook.html", "/cookbook"],
  ["guardrails.html", "/guardrails"],
];
const pages: [string, string][] = [
  ...[
    ...htmlFiles("models"),
    ...htmlFiles("providers"),
    ...htmlFiles("compare"),
    ...htmlFiles("rankings"),
    ...htmlFiles("new-models"),
    ...htmlFiles("deprecated-models"),
    "models.html",
    "compare.html",
    "rankings.html",
    "new-models.html",
    "deprecated-models.html",
    "calculator.html",
  ].map((rel): [string, string] => [
    rel,
    `/${rel.replace(/\.html$/, "")}`,
  ]),
  ...APP_PAGES,
];
const titles = new Map<string, string>();

for (const [rel, urlPath] of pages) {
  if (!existsSync(path.join(OUT, rel))) {
    errors.push(`${rel}: missing`);
    continue;
  }
  const html = readFileSync(path.join(OUT, rel), "utf8");
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
  const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? "";
  const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? "";
  const noindex = html.includes('content="noindex');
  if (!title) errors.push(`${rel}: missing title`);
  if (!description) errors.push(`${rel}: missing description`);
  const expected = urlPath === "/" ? `${SITE_URL}/` : `${SITE_URL}${urlPath}`;
  if (canonical !== expected) errors.push(`${rel}: canonical ${canonical} != ${expected}`);
  // Share image: every indexable page has one, and its card data exists for api/og.ts.
  const image = /<meta property="og:image" content="([^"]*)"/.exec(html)?.[1];
  const retired = html.includes("(Retired)");
  if (!image && !noindex && !retired) errors.push(`${rel}: missing og:image`);
  if (image) {
    const card = /^https?:\/\/[^/]+\/og\/([a-z]+)\/([^/?]+)\.png\?v=[0-9a-f]+$/.exec(image);
    if (!card) errors.push(`${rel}: unexpected og:image ${image}`);
    else if (!OG_ID.test(card[2])) errors.push(`${rel}: og:image id ${card[2]} is not one api/og.ts serves`);
    else if (!existsSync(path.join(OUT, "og", card[1], `${card[2]}.json`))) errors.push(`${rel}: no card data for ${image}`);
  }
  if (description.replace(/&[a-z#0-9]+;/g, "x").length > 170) warnings.push(`${rel}: description is ${description.length} characters`);
  if (!noindex) {
    const other = titles.get(title);
    if (other) warnings.push(`duplicate title "${title}" on ${rel} and ${other}`);
    titles.set(title, rel);
  }
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(m[1]);
    } catch {
      errors.push(`${rel}: invalid JSON-LD`);
    }
  }
  for (const m of html.matchAll(/href="(\/[^"]*)"/g)) {
    if (!fileFor(m[1])) errors.push(`${rel}: broken link ${m[1]}`);
  }
  if (rel.startsWith("models/")) {
    const mismatch = rangeMismatch(html);
    if (mismatch) errors.push(`${rel}: ${mismatch}`);
  }
}

for (const font of ["Geist-Medium.ttf", "Geist-SemiBold.ttf", "Geist-Bold.ttf"]) {
  if (!existsSync(path.join(OUT, "og", "fonts", font))) errors.push(`og/fonts/${font} missing`);
}

// The refresh workflow pre-warms these; each must have card data for api/og.ts.
const changes = JSON.parse(readFileSync(path.join(OUT, "changes.json"), "utf8")) as { images?: string[] };
for (const image of changes.images ?? []) {
  const card = /\/og\/([a-z]+)\/([^/?]+)\.png\?v=[0-9a-f]+$/.exec(image);
  if (!card || !existsSync(path.join(OUT, "og", card[1], `${card[2]}.json`))) errors.push(`changes.json: no card data for ${image}`);
}

const slugs = JSON.parse(readFileSync(path.join(OUT, "models/slugs.json"), "utf8")) as Record<string, string>;
for (const slug of new Set(Object.values(slugs))) {
  if (!existsSync(path.join(OUT, "models", `${slug}.html`))) errors.push(`slugs.json points at missing page ${slug}`);
  if (!existsSync(path.join(OUT, "models", `${slug}.md`))) errors.push(`missing markdown copy for ${slug}`);
}

for (const map of ["sitemaps/pages.xml", "sitemaps/models.xml", "sitemaps/providers.xml", "sitemaps/compare.xml", "sitemaps/rankings.xml", "sitemaps/new-models.xml", "sitemaps/deprecated-models.xml"]) {
  const xml = readFileSync(path.join(OUT, map), "utf8");
  for (const m of xml.matchAll(/<loc>([^<]*)<\/loc>/g)) {
    if (!m[1].startsWith(SITE_URL) || !fileFor(m[1].slice(SITE_URL.length) || "/")) errors.push(`${map}: ${m[1]} has no page`);
  }
}

for (const w of warnings.slice(0, 20)) console.warn(`seo:check warning: ${w}`);
if (warnings.length > 20) console.warn(`seo:check: ${warnings.length - 20} more warnings`);
if (errors.length) {
  for (const e of errors.slice(0, 50)) console.error(`seo:check error: ${e}`);
  console.error(`seo:check: ${errors.length} errors`);
  process.exit(1);
}
console.log(`seo:check: ${pages.length} pages ok, ${Object.keys(slugs).length} catalog keys linked, ${warnings.length} warnings`);
