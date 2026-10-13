/**
 * Static HTML for the generated pages. Everything a reader or crawler needs is
 * in the HTML; the only scripts are a copy button and analytics.
 */
import { getLiteLLmProxyCurlSnippet, getLiteLLmSdkSnippet } from "../../src/modelPresentation";
import type { PageCopy } from "./copy";
import { escapeHtml as esc, int, longDate, tokensShort, usd } from "./format";
import { jsonLdScript } from "./jsonld";
import type { OgImage } from "./og";
import type { ModelView, RowView } from "./model-view";
import type { RowPrices } from "./pricing";
import { DOCS_URL, GITHUB_URL, PRICE_FILE_URL, SITE_NAME, abs, modelPath, providerPath } from "./site";

const POSTHOG_KEY = "phc_upsFA5iBuDFKnznEdV9pA5HYW8fwsLMJ8pF2p4xZzzpD";

const CSS = `
:root{--bg:#fff;--bg2:#f7f8fc;--bg3:#f2f4fd;--fg:#272b37;--fg2:#3a3e4b;--muted:#646875;--rule:#ececf0;--rule2:#d3d8f3;--accent:#0117be;--code:#f7f8fc;--warn:#b45309;--ok:#047857;--no:#9a9caa;--nav:rgba(255,255,255,.72);--mesh:radial-gradient(48% 540px at 4% -6%,rgba(1,23,190,.07) 0%,rgba(1,23,190,0) 64%),radial-gradient(42% 500px at 98% -4%,rgba(56,170,240,.12) 0%,rgba(56,170,240,0) 66%);color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#080b26;--bg2:#0f1335;--bg3:#151a44;--fg:#ffffff;--fg2:#d6d4ea;--muted:#a6a4c6;--rule:#1a1f45;--rule2:#2b3170;--accent:#9fabff;--code:#0f1335;--warn:#f0b35a;--ok:#5fd3a5;--no:#5c6290;--nav:rgba(8,11,38,.72);--mesh:radial-gradient(48% 560px at 2% -8%,rgba(20,45,220,.3) 0%,rgba(20,45,220,0) 64%),radial-gradient(42% 500px at 100% -6%,rgba(56,170,240,.12) 0%,rgba(56,170,240,0) 66%);color-scheme:dark}}
*{box-sizing:border-box;margin:0;padding:0}
html{font-family:Geist,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
body{background:var(--mesh) no-repeat,var(--bg);color:var(--fg);line-height:1.6;font-size:15px}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
a:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px}
code,pre{font-family:"Geist Mono",ui-monospace,Menlo,monospace;font-size:.86em}
code{background:var(--bg3);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
.top{border-bottom:1px solid var(--rule);background:var(--nav);backdrop-filter:blur(12px);position:sticky;top:0;z-index:10}
.top-in{max-width:1080px;margin:0 auto;padding:12px 20px;display:flex;gap:20px;align-items:center;flex-wrap:wrap}
.brand{display:flex;gap:10px;align-items:center;color:var(--muted);font-size:13px;font-weight:500}.brand:hover{text-decoration:none}
.brand img{display:block;height:25px;width:auto}.brand span{padding-left:10px;border-left:1px solid var(--rule2);line-height:1.1}
.top nav{display:flex;gap:18px;flex-wrap:wrap;margin-left:auto;font-size:14px}
.top nav a{color:var(--fg2)}
main{max-width:1080px;margin:0 auto;padding:28px 20px 64px;display:grid;gap:36px}
.crumbs{font-size:13px;color:var(--muted);display:flex;gap:6px;flex-wrap:wrap}
.crumbs a{color:var(--muted)}
h1{font-size:clamp(28px,4.5vw,40px);line-height:1.15;letter-spacing:-.025em;font-weight:650;text-wrap:balance}
h2{font-size:21px;line-height:1.25;letter-spacing:-.01em}
h3{font-size:16px}
.head{display:grid;gap:12px}
.answer{font-size:17px;color:var(--fg);max-width:72ch}
.meta{font-size:13px;color:var(--muted);display:flex;gap:6px 16px;flex-wrap:wrap}
.facts{display:flex;flex-wrap:wrap;border:1px solid var(--rule);border-radius:10px;overflow:hidden}
.fact{flex:1 1 160px;padding:14px 16px;display:grid;gap:2px;min-width:0;border-right:1px solid var(--rule);border-bottom:1px solid var(--rule);margin:0 -1px -1px 0}
.fact dt{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.fact dd{font-size:19px;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.fact dd small{font-size:12px;font-weight:400;color:var(--muted)}
section{display:grid;gap:14px;min-width:0}
section>p,.note{max-width:75ch;color:var(--fg2)}
.tbl{overflow-x:auto;border:1px solid var(--rule);border-radius:10px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--rule);vertical-align:top}
th{font-size:12px;font-weight:600;color:var(--muted);background:var(--bg2);white-space:nowrap;text-transform:uppercase;letter-spacing:.04em}
tbody tr:last-child td{border-bottom:0}
td.n{font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
th.n{text-align:right}
td .q{display:block;font-size:12px;color:var(--muted)}
td code{white-space:nowrap}
td.p{min-width:150px}td.p a{white-space:nowrap}td.pr{white-space:nowrap;font-variant-numeric:tabular-nums}
tr.hl td{background:var(--bg2)}
caption{caption-side:bottom;text-align:left;font-size:12px;color:var(--muted);padding:8px 12px}
.flag{color:var(--warn);font-weight:600}
details summary{cursor:pointer;color:var(--accent);font-size:14px;padding:6px 0}
.caps{display:flex;flex-wrap:wrap;gap:8px;list-style:none}
.caps li{font-size:13px;border:1px solid var(--rule);border-radius:999px;padding:3px 10px}
.caps li.y::before{content:"✓ ";color:var(--ok)}
.caps li.n{color:var(--no)}.caps li.n::before{content:"✕ "}
.code{display:grid;gap:10px}
.code-h{display:flex;justify-content:space-between;align-items:center;gap:12px}
.code-h span{font-size:13px;font-weight:600;color:var(--fg2)}
.copy{font:inherit;font-size:12px;border:1px solid var(--rule2);background:var(--bg);color:var(--fg2);border-radius:6px;padding:2px 10px;cursor:pointer}
pre{background:var(--code);border:1px solid var(--rule);border-radius:8px;padding:14px 16px;overflow-x:auto;line-height:1.55}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}
.faq{display:grid;gap:16px;max-width:80ch}
.faq h3{font-size:16px}.faq p{color:var(--fg2)}
.links{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;list-style:none}
.links li a{display:grid;gap:2px;border:1px solid var(--rule);border-radius:8px;padding:10px 12px;color:var(--fg)}
.links li a:hover{border-color:var(--rule2);text-decoration:none;background:var(--bg2)}
.links li a span{font-size:13px;color:var(--muted)}
.src{font-size:13px;color:var(--muted);display:grid;gap:4px}
.src ul{padding-left:18px}
.intro{display:flex;gap:6px 10px;align-items:center;flex-wrap:wrap;font-size:14px;color:var(--fg2)}
.tag{font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--accent);border:1px solid currentColor;border-radius:999px;padding:1px 10px}
.pill{display:inline-block;font-size:12px;padding:1px 8px;border-radius:999px;background:var(--bg3);color:var(--fg2)}
.warnbox{border:1px solid var(--warn);border-radius:8px;padding:10px 14px;color:var(--fg);max-width:75ch}
footer{border-top:1px solid var(--rule);color:var(--muted);font-size:13px}
footer div{max-width:1080px;margin:0 auto;padding:20px;display:flex;gap:8px 20px;flex-wrap:wrap}
footer a{color:var(--muted)}
@media (max-width:600px){main{padding:20px 16px 48px;gap:28px}.top-in{padding:10px 16px}th,td{padding:8px 9px}.grid2{grid-template-columns:1fr}}
`;

const ANALYTICS = `<script>if(location.hostname==="models.litellm.ai"){!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister identify reset get_distinct_id set_config opt_in_capturing opt_out_capturing".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init(${JSON.stringify(POSTHOG_KEY)},{api_host:"https://us.i.posthog.com",defaults:"2026-05-30",person_profiles:"identified_only",cross_subdomain_cookie:true,capture_pageview:true,capture_pageleave:true,disable_session_recording:true,capture_heatmaps:false,disable_surveys:true,autocapture:{dom_event_allowlist:["click"],element_allowlist:["a","button"]}})}</script>`;

const COPY_JS = `<script>document.addEventListener("click",function(e){var b=e.target.closest("[data-copy]");if(!b)return;var t=document.getElementById(b.getAttribute("data-copy"));if(!t||!navigator.clipboard)return;navigator.clipboard.writeText(t.innerText).then(function(){b.textContent="Copied";setTimeout(function(){b.textContent="Copy"},1500)}).catch(function(){})})</script>`;

export type Layout = {
  title: string;
  description: string;
  path: string;
  body: string;
  jsonLd?: Record<string, unknown>;
  markdownPath?: string;
  noindex?: boolean;
  ogType?: string;
  image?: OgImage;
};

/** Share-image tags; large cards on X, Slack, LinkedIn and iMessage. */
export function imageTags(image: OgImage | undefined): string {
  if (!image) return `<meta name="twitter:card" content="summary">`;
  return [
    `<meta property="og:image" content="${esc(image.url)}">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:width" content="${image.width}">`,
    `<meta property="og:image:height" content="${image.height}">`,
    `<meta property="og:image:alt" content="${esc(image.alt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:image" content="${esc(image.url)}">`,
    `<meta name="twitter:image:alt" content="${esc(image.alt)}">`,
  ].join("\n");
}

export function layout(l: Layout): string {
  const url = abs(l.path);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(l.title)}</title>
<meta name="description" content="${esc(l.description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="${l.noindex ? "noindex,follow" : "index,follow,max-snippet:-1,max-image-preview:large"}">
${l.markdownPath ? `<link rel="alternate" type="text/markdown" href="${esc(abs(l.markdownPath))}">\n` : ""}<meta property="og:type" content="${l.ogType ?? "website"}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(l.title)}">
<meta property="og:description" content="${esc(l.description)}">
<meta property="og:url" content="${esc(url)}">
${imageTags(l.image)}
<meta name="twitter:title" content="${esc(l.title)}">
<meta name="twitter:description" content="${esc(l.description)}">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/svg+xml" href="/brand/litellm-favicon.svg">
<link rel="apple-touch-icon" href="/brand/litellm-monogram-blue-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400&display=swap" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400&display=swap"></noscript>
<style>${CSS.trim()}</style>
${l.jsonLd ? jsonLdScript(l.jsonLd) : ""}
</head>
<body>
<header class="top"><div class="top-in">
<a class="brand" href="/"><picture><source srcset="/brand/litellm-logo-white.png" media="(prefers-color-scheme: dark)"><img src="/brand/litellm-logo-blue.png" alt="LiteLLM" width="132" height="25"></picture><span>Models</span></a>
<nav aria-label="Site"><a href="/models">All models</a><a href="/">Search</a><a href="/providers">Providers</a><a href="${DOCS_URL}">Docs</a><a href="${GITHUB_URL}">GitHub</a></nav>
</div></header>
<main>
${l.body}
</main>
<footer><div>
<span>Prices from LiteLLM's open-source <a href="${PRICE_FILE_URL}">model price file</a>.</span>
<a href="/models">All models</a><a href="/llms.txt">llms.txt</a><a href="/sitemap.xml">Sitemap</a><a href="${DOCS_URL}/docs/proxy/cost_tracking">Cost tracking docs</a>
</div></footer>
${COPY_JS}
${ANALYTICS}
</body>
</html>
`;
}

type Col = { label: string; get: (p: RowPrices) => number | undefined };

const PRICE_COLS: Col[] = [
  { label: "Per image", get: (p) => p.perImage },
  { label: "Per second", get: (p) => p.perSecond },
  { label: "Per minute", get: (p) => p.perMinute },
  { label: "Per 1M chars", get: (p) => p.per1MChars },
  { label: "Input", get: (p) => p.input },
  { label: "Output", get: (p) => p.output },
  { label: "Image output", get: (p) => p.imageOutputTokens },
  { label: "Cache read", get: (p) => p.cacheRead },
  { label: "Cache write", get: (p) => p.cacheWrite },
  { label: "Batch in", get: (p) => p.batchInput },
  { label: "Batch out", get: (p) => p.batchOutput },
  { label: "Per 1K queries", get: (p) => p.queryPer1K },
  { label: "Per 1K pages", get: (p) => p.pagePer1K },
];

const providerLink = (hub: string, name: string, hubs: Set<string>) =>
  hubs.has(hub) ? `<a href="${providerPath(hub)}">${esc(name)}</a>` : esc(name);

/** `caption` makes a table quotable on its own: model, units, currency and date. */
function priceTable(v: ModelView, rows: RowView[], cols: Col[], hubs: Set<string>, caption: string): string {
  const head = `<tr><th>Provider</th><th>Model name in LiteLLM</th>${cols.map((c) => `<th class="n">${c.label}</th>`).join("")}<th class="n">Context</th></tr>`;
  const body = rows
    .map((r) => {
      const cells = cols
        .map((c) => {
          const value = c.get(r.prices);
          return `<td class="n">${value === undefined ? "–" : usd(value)}</td>`;
        })
        .join("");
      const flag = r.outlier ? ` <span class="flag" title="Differs from other providers by more than 8x; check the provider's pricing page">†</span>` : "";
      const q = r.qualifier ? `<span class="q">${esc(r.qualifier)}</span>` : "";
      return `<tr${r === v.headline ? ' class="hl"' : ""}><td class="p">${providerLink(r.hub, r.providerName, hubs)}${flag}${q}</td><td><code>${esc(r.modelString)}</code></td>${cells}<td class="n">${r.context ? tokensShort(r.context) : "–"}</td></tr>`;
    })
    .join("");
  return `<div class="tbl"><table><caption>${esc(caption)}</caption><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function otherPrices(r: RowView): [string, string][] {
  const p = r.prices;
  const out: [string, string][] = [];
  const add = (label: string, value: number | undefined, unit = "per 1M tokens") => {
    if (value !== undefined) out.push([label, `${usd(value)} ${unit}`]);
  };
  add("Cache write, 1 hour", p.cacheWrite1h);
  add("Priority input", p.priorityInput);
  add("Priority output", p.priorityOutput);
  add("Flex input", p.flexInput);
  add("Flex output", p.flexOutput);
  for (const t of p.longContext) {
    add(`Input above ${tokensShort(t.above)} tokens`, t.input);
    add(`Output above ${tokensShort(t.above)} tokens`, t.output);
    add(`Cache read above ${tokensShort(t.above)} tokens`, t.cacheRead);
  }
  add("Audio input", p.audioInput);
  add("Audio output", p.audioOutput);
  add("Input image", p.inputPerImage, "per image");
  add("Web search", p.searchPer1K, "per 1K searches");
  return out;
}

const API_KEY_ENV: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  xai: "XAI_API_KEY",
  groq: "GROQ_API_KEY",
  together_ai: "TOGETHERAI_API_KEY",
  fireworks_ai: "FIREWORKS_AI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  cohere: "COHERE_API_KEY",
  deepinfra: "DEEPINFRA_API_KEY",
  perplexity: "PERPLEXITYAI_API_KEY",
  moonshot: "MOONSHOT_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
};

function proxyConfig(v: ModelView, r: RowView): string {
  const env = API_KEY_ENV[r.hub];
  const creds = env
    ? `      api_key: os.environ/${env}`
    : r.hub === "bedrock"
      ? "      aws_region_name: os.environ/AWS_REGION_NAME"
      : r.hub === "vertex_ai"
        ? "      vertex_project: os.environ/VERTEX_PROJECT\n      vertex_location: os.environ/VERTEX_LOCATION"
        : r.hub === "azure"
          ? "      api_base: os.environ/AZURE_API_BASE\n      api_key: os.environ/AZURE_API_KEY"
          : "      # credentials: see the provider's LiteLLM docs page";
  return `model_list:
  - model_name: ${v.slug}
    litellm_params:
      model: ${r.modelString}
${creds}`;
}

function codeBlock(id: string, label: string, code: string): string {
  return `<div class="code"><div class="code-h"><span>${label}</span><button class="copy" type="button" data-copy="${id}">Copy</button></div><pre id="${id}">${esc(code)}</pre></div>`;
}

export type ModelPageContext = {
  buildDate: string;
  lastChanged: string;
  related: { name: string; slug: string; price: string | null }[];
  history: { date: string; price: string }[];
  /** Provider pages that exist, so rows only link to real pages. */
  hubs: Set<string>;
};

export function modelBody(v: ModelView, copy: PageCopy, ctx: ModelPageContext): string {
  const h = v.headline;
  const facts: [string, string][] = [];
  if (h) {
    const p = h.prices;
    if (v.free) facts.push(["Price", "Free"]);
    if (p.perImage !== undefined) facts.push(["Per image", usd(p.perImage)]);
    if (p.perSecond !== undefined) facts.push(["Per second", usd(p.perSecond)]);
    if (p.perMinute !== undefined) facts.push(["Per minute", usd(p.perMinute)]);
    if (p.per1MChars !== undefined) facts.push(["Per 1M characters", usd(p.per1MChars)]);
    if (p.input !== undefined && !v.free) facts.push(["Input", `${usd(p.input)} <small>/ 1M tokens</small>`]);
    if (p.output !== undefined && !v.free) facts.push(["Output", `${usd(p.output)} <small>/ 1M tokens</small>`]);
    if (p.cacheRead !== undefined) facts.push(["Cache read", `${usd(p.cacheRead)} <small>/ 1M tokens</small>`]);
  }
  if (v.context) facts.push(["Context window", `${int(v.context)} <small>tokens</small>`]);
  if (v.maxOutput) facts.push(["Max output", `${int(v.maxOutput)} <small>tokens</small>`]);
  facts.push(["Providers", String(v.providers.length)]);
  if (v.addedDate) facts.push(["Added to LiteLLM", longDate(v.addedDate)]);

  const cols = PRICE_COLS.filter((c) => v.rows.some((r) => c.get(r.prices) !== undefined)).slice(0, 7);
  const shown = v.rows.slice(0, 25);
  const rest = v.rows.slice(25);
  const anyOutlier = v.rows.some((r) => r.outlier);
  const others = h ? otherPrices(h) : [];
  const tableCaption = `${v.name} prices by provider in US dollars, token prices per 1M tokens, as of ${longDate(ctx.buildDate)}. Source: LiteLLM model price file.`;
  const mode = h?.mode ?? v.mode;
  const ms = h?.modelString ?? v.rows[0].modelString;

  const parts: string[] = [];
  parts.push(`<div class="head">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><a href="/models">Models</a><span>›</span><span>${esc(v.name)}</span></nav>
<h1>${esc(copy.h1)}</h1>
<p class="answer">${esc(copy.answer)}</p>
${v.intro && h ? `<p class="intro"><span class="tag">Introductory price</span><span>Until ${longDate(v.intro.until)}, per <a href="${esc(v.intro.source)}">${esc(v.lab ?? h.providerName)}'s pricing page</a></span></p>` : ""}
<div class="meta">${v.lab ? `<span>By ${esc(v.lab)}</span>` : ""}<span>Model ID <code>${esc(ms)}</code></span><span>Prices updated <time datetime="${ctx.lastChanged}">${longDate(ctx.lastChanged)}</time></span><span>Checked <time datetime="${ctx.buildDate}">${longDate(ctx.buildDate)}</time></span></div>
</div>`);

  if (v.deprecation) {
    const past = v.deprecation <= ctx.buildDate.slice(0, 10);
    parts.push(`<div class="warnbox">${past ? "Deprecated" : "Scheduled for deprecation"}: ${esc(h?.providerName ?? "The provider")} lists ${longDate(v.deprecation)} as the deprecation date for <code>${esc(ms)}</code>.</div>`);
  }

  parts.push(`<dl class="facts">${facts.map(([k, val]) => `<div class="fact"><dt>${k}</dt><dd>${val}</dd></div>`).join("")}</dl>`);

  parts.push(`<section id="pricing"><h2>${esc(v.name)} pricing by provider</h2>
<p>${v.rows.length} ${v.rows.length === 1 ? "listing" : "listings"} across ${v.providers.length} ${v.providers.length === 1 ? "provider" : "providers"}. Token prices are in US dollars per 1M tokens. The highlighted row is the price quoted above.</p>
${priceTable(v, shown, cols, ctx.hubs, tableCaption)}
${rest.length ? `<details><summary>Show ${rest.length} more listings</summary>${priceTable(v, rest, cols, ctx.hubs, tableCaption)}</details>` : ""}
${anyOutlier ? `<p class="note"><span class="flag">†</span> This price differs from the other providers by more than 8x and is left out of the headline price. Check the provider's pricing page.</p>` : ""}
</section>`);

  if (others.length && h) {
    parts.push(`<section id="tiers"><h2>Other ${esc(v.name)} prices on ${esc(h.providerName)}</h2>
<div class="tbl"><table><tbody>${others.map(([k, val]) => `<tr><td>${esc(k)}</td><td class="n">${esc(val)}</td></tr>`).join("")}</tbody></table></div></section>`);
  }

  if (copy.examples.length) {
    parts.push(`<section id="cost"><h2>What ${esc(v.name)} costs in practice</h2>
${copy.examples
  .map(
    (ex) => `<h3>${esc(ex.label)}</h3><div class="tbl"><table><tbody>${ex.rows
      .map((row) => `<tr><td>${esc(row.who)}</td><td class="n">${usd(Number(row.cost.toPrecision(4)))}</td></tr>`)
      .join("")}</tbody></table></div>`,
  )
  .join("")}
</section>`);
  }

  if (v.capabilities.length || v.inputModalities.length) {
    parts.push(`<section id="features"><h2>${esc(v.name)} features</h2>
${v.inputModalities.length ? `<p>Input: ${esc(v.inputModalities.join(", "))}.${v.outputModalities.length ? ` Output: ${esc(v.outputModalities.join(", "))}.` : ""}</p>` : ""}
<ul class="caps">${v.capabilities.map((c) => `<li class="${c.supported ? "y" : "n"}">${esc(c.label)}</li>`).join("")}</ul></section>`);
  }

  parts.push(`<section id="use"><h2>Use ${esc(v.name)} with LiteLLM</h2>
<p>Call ${esc(v.name)} through the LiteLLM Python SDK, or put it behind the LiteLLM proxy and send OpenAI-format requests to <code>${copy.endpoint}</code>. LiteLLM tracks the cost of every request at these prices.</p>
<div class="grid2">
${codeBlock("sdk", "Python SDK", getLiteLLmSdkSnippet(mode, ms))}
${h ? codeBlock("cfg", "Proxy config.yaml", proxyConfig(v, h)) : ""}
</div>
${codeBlock("curl", "Call the proxy", getLiteLLmProxyCurlSnippet(mode, v.slug))}
</section>`);

  if (ctx.history.length > 1) {
    parts.push(`<section id="history"><h2>${esc(v.name)} price history</h2>
<div class="tbl"><table><thead><tr><th>Date</th><th>Price</th></tr></thead><tbody>${ctx.history
      .map((e) => `<tr><td>${longDate(e.date)}</td><td>${esc(e.price)}</td></tr>`)
      .join("")}</tbody></table></div></section>`);
  }

  parts.push(`<section id="faq"><h2>${esc(v.name)} FAQ</h2><div class="faq">${copy.faq
    .map((f) => `<div><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`)
    .join("")}</div></section>`);

  if (ctx.related.length) {
    parts.push(`<section id="related"><h2>${v.lab ? `More ${esc(v.lab)} models` : "Related models"}</h2>
<ul class="links">${ctx.related
      .map((r) => `<li><a href="${modelPath(r.slug)}">${esc(r.name)}${r.price ? `<span>${esc(r.price)}</span>` : ""}</a></li>`)
      .join("")}</ul></section>`);
  }

  const providerLinks = v.providers
    .slice(0, 12)
    .map((p) => providerLink(p.hub, p.name, ctx.hubs))
    .join(", ");
  parts.push(`<section class="src" id="sources"><h2>Sources</h2>
<p>Prices come from LiteLLM's open-source <a href="${PRICE_FILE_URL}">model_prices_and_context_window.json</a>, which LiteLLM uses to calculate the cost of every request. Maintainers update it from each provider's published pricing, and this page is usually rebuilt within 20 minutes of every change. ${v.sources.length ? "Provider pricing pages:" : ""}</p>
${v.sources.length ? `<ul>${v.sources.map((s) => `<li><a href="${esc(s)}" rel="nofollow">${esc(s.replace(/^https?:\/\//, ""))}</a></li>`).join("")}</ul>` : ""}
${v.docs.length ? `<p>LiteLLM docs: ${v.docs.map((d) => `<a href="${esc(d.url)}">${esc(d.name)}</a>`).join(", ")}.</p>` : ""}
<p>Provider pages: ${providerLinks}.</p>
</section>`);

  return parts.join("\n");
}

export type IndexRow = { name: string; slug: string; lab: string | null; price: string | null; context?: number; providers: number; added: string | null };

export function indexTable(rows: IndexRow[]): string {
  return `<div class="tbl"><table><thead><tr><th>Model</th><th>Lab</th><th>Price</th><th class="n">Context</th><th class="n">Providers</th><th>Added</th></tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr><td><a href="${modelPath(r.slug)}">${esc(r.name)}</a></td><td>${esc(r.lab ?? "–")}</td><td class="pr">${esc(r.price ?? "–")}</td><td class="n">${r.context ? tokensShort(r.context) : "–"}</td><td class="n">${r.providers}</td><td>${r.added ? esc(r.added) : "–"}</td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}

export function notFoundBody(): string {
  return `<div class="head"><h1>Page not found</h1><p class="answer">This page doesn't exist. Search the catalog or browse every model.</p>
<p><a href="/">Search the model catalog</a> · <a href="/models">Browse all models</a></p></div>`;
}
