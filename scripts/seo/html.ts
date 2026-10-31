/**
 * Static HTML for the generated pages. Everything a reader or crawler needs is
 * in the HTML; the only scripts are a copy button and analytics.
 */
import { getLiteLLmProxyCurlSnippet, getLiteLLmSdkSnippet } from "../../src/modelPresentation";
import { headlinePrice, type PageCopy } from "./copy";
import { onCompareTool, TOOL_CSS } from "./compare-tool";
import { CALC_DEFAULTS, DAYS_PER_MONTH, calcCost, calcMoney, onCalculator } from "./calculator";
import { leadsWithTokens } from "./pricing";
import { escapeHtml as esc, int, longDate, shortDate, tokensShort, usd } from "./format";
import { jsonLdScript } from "./jsonld";
import type { OgImage } from "./og";
import type { ModelView, RowView } from "./model-view";
import type { RowPrices } from "./pricing";
import { DOCS_URL, GITHUB_URL, PRICE_FILE_URL, SITE_NAME, abs, modelPath, providerPath } from "./site";

const POSTHOG_KEY = "phc_upsFA5iBuDFKnznEdV9pA5HYW8fwsLMJ8pF2p4xZzzpD";

const CSS = `
.provider-list{max-width:320px;white-space:normal}.update-nav{width:fit-content;max-width:100%}.affected-routes{max-width:380px;white-space:normal}.affected-routes code{overflow-wrap:anywhere;font-size:12px}.affected-routes summary{cursor:pointer;color:var(--muted)}.affected-routes ul{padding-left:16px}.affected-routes li{margin:8px 0}
:root{--bg:var(--hf-bg);--bg2:var(--bg-secondary);--bg3:var(--bg-tertiary);--fg:var(--hf-ink);--fg2:var(--text-secondary);--muted:var(--hf-muted);--rule:var(--hf-line);--rule2:var(--border-color-strong);--accent:var(--hf-accent);--on-accent:var(--hf-button-ink);--ring:var(--focus-ring);--code:var(--code-bg);--warn:var(--hf-warning);--warn-bg:var(--bg-secondary);--ok:var(--success-color);--no:var(--hf-muted);--shadow:none}
*{box-sizing:border-box;margin:0;padding:0}
html{font-family:"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
body{background:var(--bg);color:var(--fg);line-height:1.6;font-size:15px}
a{color:var(--accent);text-decoration:none;text-underline-offset:3px}a:hover{text-decoration:underline}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
code,pre{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;font-size:.86em}
code{background:var(--bg3);padding:1px 6px;border-radius:5px;overflow-wrap:anywhere}
main{max-width:var(--page-width);margin:0 auto;padding:32px var(--page-gutter) 72px;display:grid;gap:40px}
.crumbs{font-size:13px;color:var(--muted);display:flex;gap:6px;flex-wrap:wrap}
.crumbs a{color:var(--muted)}.crumbs a:hover{color:var(--fg)}
h1{font-size:clamp(28px,4.5vw,40px);line-height:1.15;letter-spacing:-.025em;font-weight:650;text-wrap:balance}
h2{font-size:20px;line-height:1.3;letter-spacing:-.015em;font-weight:600}
h3{font-size:15px;font-weight:600}
.head{display:grid;gap:12px}
.answer{font-size:17px;color:var(--fg);max-width:72ch}
.meta{font-size:13px;color:var(--muted);display:flex;gap:6px 16px;flex-wrap:wrap;align-items:center}
.idline{display:flex;gap:8px 12px;align-items:center;flex-wrap:wrap;font-size:14px;color:var(--fg2)}
.idline .id{display:inline-flex;gap:6px;align-items:center;min-width:0}.idline code{font-size:13px}
.stats{display:flex;flex-wrap:wrap;gap:12px}
.stat{flex:1 1 140px;border:1px solid var(--rule);border-radius:var(--surface-radius);padding:14px 16px;display:grid;gap:4px;align-content:start;background:var(--card-bg);box-shadow:var(--shadow);min-width:0}
.stat.lead{flex:2 1 280px}.stat dd time{white-space:nowrap}
.stat dt{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;font-weight:500;color:var(--muted)}
.stat dd{font-size:24px;line-height:1.25;font-weight:650;letter-spacing:-.015em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.stat dd small{font-size:13px;font-weight:400;letter-spacing:0;color:var(--muted)}
section{display:grid;gap:14px;min-width:0}
section>p,.note{max-width:75ch;color:var(--fg2)}
.note{font-size:14px}
.tbl{overflow-x:auto;border:1px solid var(--rule);border-radius:var(--surface-radius);background:var(--card-bg);box-shadow:var(--shadow)}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--rule);vertical-align:top}
th{font-size:13px;font-weight:500;color:var(--muted);background:var(--bg2);white-space:nowrap}
tbody tr:hover td{background:var(--bg2)}
tbody tr:last-child td,tbody tr:last-child th{border-bottom:0}
td.n{font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
th.n{text-align:right}
td .q{display:block;font-size:12px;color:var(--muted)}
td code{white-space:nowrap}
td.p{min-width:150px}td.p a{white-space:nowrap}td.pr{white-space:nowrap;font-variant-numeric:tabular-nums}
tr.hl td,tbody tr.hl:hover td{background:var(--bg3)}
caption{caption-side:bottom;text-align:left;font-size:12px;line-height:1.5;color:var(--muted);padding:10px 14px;border-top:1px solid var(--rule)}
.flag{color:var(--warn);font-weight:600}
details summary{cursor:pointer;color:var(--accent);font-size:14px;font-weight:500;padding:6px 0}
.caps{display:flex;flex-wrap:wrap;gap:8px;list-style:none}
.caps li{font-size:13px;font-weight:500;border:1px solid var(--rule);background:var(--bg);border-radius:999px;padding:3px 12px}
.caps li.y::before{content:"✓ ";color:var(--ok)}
.caps li.n{color:var(--no)}.caps li.n::before{content:"✕ "}
.code{display:grid;gap:8px}
.code-h{display:flex;justify-content:space-between;align-items:center;gap:12px}
.code-h span{font-size:13px;font-weight:600;color:var(--fg2)}
.copy,.cmp,.ct .rm{display:inline-flex;align-items:center;gap:6px;height:28px;font:inherit;font-size:13px;font-weight:500;border:1px solid var(--rule2);background:var(--bg);color:var(--fg);border-radius:var(--control-radius);padding:0 10px;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s}
.copy:hover,.ct .rm:hover{background:var(--bg3);text-decoration:none}
.cmp{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}.cmp:hover{text-decoration:none;filter:brightness(1.1)}
pre{background:var(--code);border:1px solid var(--rule);border-radius:var(--surface-radius);padding:14px 16px;overflow-x:auto;line-height:1.6}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}
.faq{display:grid;gap:18px;max-width:80ch}
.faq>div{display:grid;gap:4px}.faq p{color:var(--fg2)}
.links{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;list-style:none}
.links li a{display:grid;gap:2px;height:100%;border:1px solid var(--rule);border-radius:var(--surface-radius);padding:12px 14px;color:var(--fg);font-weight:500;background:var(--card-bg);box-shadow:var(--shadow);transition:border-color .15s,background .15s}
.links li a:hover{border-color:var(--rule2);text-decoration:none;background:var(--bg2)}
.links li a span{font-size:13px;font-weight:400;color:var(--muted)}
.src{font-size:13px;color:var(--muted);display:grid;gap:4px}
.src ul{padding-left:18px}.src a{overflow-wrap:anywhere}
.intro{font-size:14px;color:var(--fg2)}
.tag{display:inline-flex;align-items:center;font-size:12px;font-weight:500;color:var(--accent);background:var(--bg3);border-radius:999px;padding:2px 10px;white-space:nowrap}
th[scope=row]{font-size:14px;font-weight:500;color:var(--fg2);background:transparent;white-space:normal}
th[scope=rowgroup]{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);background:var(--bg2)}
.calc{display:grid;gap:16px;border:1px solid var(--rule);border-radius:var(--surface-radius);padding:18px;max-width:780px;background:var(--card-bg);box-shadow:var(--shadow)}
.calc-in{display:flex;flex-wrap:wrap;gap:12px}.calc-intro{font-size:12px;font-weight:400;color:var(--muted)}.calc-in label{display:grid;gap:6px;font-size:13px;font-weight:500;color:var(--fg2);flex:1 1 160px}
.calc-in input,.calc-in select,.ct input{font:inherit;font-size:14px;height:36px;color:var(--fg);background:var(--bg);border:1px solid var(--rule2);border-radius:var(--control-radius);padding:0 10px;width:100%;transition:border-color .15s,box-shadow .15s}
.calc-in input:focus,.calc-in select:focus,.ct input:focus{outline:2px solid transparent;outline-offset:2px;border-color:var(--accent);box-shadow:0 0 0 3px var(--ring)}
.calc-out{display:flex;flex-wrap:wrap;gap:12px;padding-top:14px;border-top:1px solid var(--rule)}.calc-out div{flex:1 1 140px;display:grid;gap:2px}.calc-out dt{font-size:13px;font-weight:500;color:var(--muted)}.calc-out dd{font-size:24px;font-weight:650;letter-spacing:-.015em;font-variant-numeric:tabular-nums}
${TOOL_CSS}
.jump{display:flex;flex-wrap:wrap;gap:6px;font-size:13px}
.jump a{display:inline-flex;gap:6px;align-items:center;border:1px solid var(--rule);border-radius:999px;padding:3px 12px;background:var(--bg);color:var(--fg2);font-weight:500}.jump a:hover{border-color:var(--rule2);background:var(--bg2);text-decoration:none}
.jump span{color:var(--muted);font-weight:400}
.pill{display:inline-flex;align-items:center;font-size:12px;font-weight:500;padding:1px 8px;border-radius:999px;background:var(--bg3);color:var(--fg2)}
.warnbox{border:1px solid var(--warn);background:var(--warn-bg);border-radius:var(--surface-radius);padding:12px 16px;color:var(--fg);max-width:75ch}
footer{border-top:1px solid var(--rule);color:var(--muted);font-size:13px}
footer div{max-width:var(--page-width);margin:0 auto;padding:24px var(--page-gutter);display:flex;gap:8px 20px;flex-wrap:wrap}
footer a{color:var(--muted)}footer a:hover{color:var(--fg)}
@media (max-width:600px){main{padding:32px var(--page-gutter) 56px;gap:32px}.stats{gap:8px}.stat{padding:12px 14px}.stat dd{font-size:21px}th,td{padding:9px 10px}.grid2{grid-template-columns:1fr}.calc{padding:14px}}
@media (pointer:coarse){.calc-in input,.calc-in select,.ct input{font-size:16px}}
`;

const ANALYTICS = `<script>if(location.hostname==="models.litellm.ai"){!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister identify reset get_distinct_id set_config opt_in_capturing opt_out_capturing".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init(${JSON.stringify(POSTHOG_KEY)},{api_host:"https://us.i.posthog.com",defaults:"2026-05-30",person_profiles:"identified_only",cross_subdomain_cookie:true,capture_pageview:true,capture_pageleave:true,disable_session_recording:true,capture_heatmaps:false,disable_surveys:true,autocapture:{dom_event_allowlist:["click"],element_allowlist:["a","button"]}})}</script>`;

const COPY_JS = `<script>document.addEventListener("click",function(e){var b=e.target.closest("[data-copy]");if(!b)return;var t=document.getElementById(b.getAttribute("data-copy"));if(!t||!navigator.clipboard)return;navigator.clipboard.writeText(t.innerText).then(function(){b.textContent="Copied";setTimeout(function(){b.textContent="Copy"},1500)}).catch(function(){});var m=document.querySelector("main");if(window.posthog&&posthog.capture)posthog.capture("snippet_copied",{snippet:b.getAttribute("data-copy"),page_kind:m&&m.getAttribute("data-page-kind"),page_id:m&&m.getAttribute("data-page-id")})})</script>`;

export type Layout = {
  title: string;
  description: string;
  path: string;
  body: string;
  jsonLd?: Record<string, unknown>;
  markdownPath?: string;
  rssPath?: string;
  noindex?: boolean;
  ogType?: string;
  image?: OgImage;
  /** Page kind and id, on <main> for analytics (e.g. "model", "gpt-5"). */
  track?: { kind: string; id: string };
  /** Extra script for the page, after the shared ones. */
  script?: string;
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
${l.rssPath ? `<link rel="alternate" type="application/rss+xml" title="${esc(l.title)}" href="${esc(abs(l.rssPath))}">` : ""}
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
<style>${CSS.trim()}</style>
<link rel="stylesheet" href="/site.css">
<script src="/theme.js"></script>
<script type="module" src="/feedback.js"></script>
${l.jsonLd ? jsonLdScript(l.jsonLd) : ""}
</head>
<body>
<header class="hf-header"><div class="hf-header-inner">
<a class="hf-brand" href="/" aria-label="LiteLLM Discover home"><img class="hf-logo-light" src="/brand/litellm-primary-blue.svg" alt="LiteLLM" width="132" height="32"><img class="hf-logo-dark" src="/brand/litellm-primary-white.svg" alt="LiteLLM" width="132" height="32"><span>/ MODELS</span></a>
<nav class="hf-nav" aria-label="Main navigation"><a href="/">Discover</a><a href="/search"${l.path.startsWith("/models") ? ' aria-current="page"' : ""}>Models</a><a href="/providers"${l.path.startsWith("/providers/") ? ' aria-current="page"' : ""}>Providers</a><a href="/changelog"${l.path === "/changelog" ? ' aria-current="page"' : ""}>Changelog</a><a href="/benchmarks">Coding benchmarks</a></nav>
<form class="hf-header-search" action="/search" role="search"><svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><input name="q" type="search" placeholder="Search models" aria-label="Search models" autocomplete="off"><kbd aria-hidden="true">⌘ K</kbd></form>
<div class="hf-header-actions"><button class="hf-feedback" type="button" data-feedback-open aria-haspopup="dialog">Help us improve</button><a class="hf-docs" href="${DOCS_URL}" target="_blank" rel="noopener noreferrer">Docs ↗</a><button class="hf-theme-toggle" type="button" data-theme-toggle aria-label="Switch to dark mode"><svg class="theme-moon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20.8 13.1A9 9 0 0 1 10.9 3.2 9 9 0 1 0 20.8 13.1Z"/></svg><svg class="theme-sun" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg></button>
<details class="hf-more"><summary class="hf-more-toggle" aria-label="More navigation">···</summary><nav class="hf-more-menu" aria-label="More navigation"><a href="/cookbook">Cookbook</a><a href="/guardrails">Guardrails</a><a href="/models">All models index</a><a href="/compare/custom">Compare models</a><a href="/calculator">Pricing calculator</a><a href="/new-models">New models</a><a href="/deprecated-models">Recently deprecated</a><a href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer">GitHub ↗</a><a href="/?request=true">Request a model +</a></nav></details></div>
</div></header>
<main${l.track ? ` data-page-kind="${esc(l.track.kind)}" data-page-id="${esc(l.track.id)}"` : ""}>
${l.body}
</main>
<footer><div>
<span>Prices from LiteLLM's open-source <a href="${PRICE_FILE_URL}">model price file</a>.</span>
<a href="/models">All models</a><a href="/llms.txt">llms.txt</a><a href="/sitemap.xml">Sitemap</a><a href="${DOCS_URL}/docs/proxy/cost_tracking">Cost tracking docs</a>
</div></footer>
${COPY_JS}
${l.script ?? ""}
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
      return `<tr${r === v.headline ? ' class="hl"' : ""}${r.fineTuned ? " data-fine-tuned" : ""}><td class="p">${providerLink(r.hub, r.providerName, hubs)}${flag}${q}</td><td><code>${esc(r.modelString)}</code></td>${cells}<td class="n">${r.context ? tokensShort(r.context) : "–"}</td></tr>`;
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
  return `<div class="code" data-track="snippet" data-snippet="${id}"><div class="code-h"><span>${label}</span><button class="copy" type="button" data-copy="${id}">Copy</button></div><pre id="${id}">${esc(code)}</pre></div>`;
}

export type ModelPageContext = {
  buildDate: string;
  lastChanged: string;
  related: { name: string; slug: string; price: string | null }[];
  history: { date: string; price: string }[];
  /** Provider pages that exist, so rows only link to real pages. */
  hubs: Set<string>;
  /** Comparison pages this model is on. */
  comparisons?: { slug: string; other: string }[];
  /** A retired model's newer family member, linked from the retired notice. */
  successor?: { name: string; slug: string } | null;
};

type Stat = { label: string; value: string; lead?: boolean; tag?: string };

/** The numbers a reader came for, in one row under the title: price first, then limits. */
function keyStats(v: ModelView): Stat[] {
  const stats: Stat[] = [];
  const price = headlinePrice(v);
  const tag = v.intro ? "Intro price" : undefined;
  const per1M = "<small>per 1M tokens</small>";
  if (price) {
    const lead = (label: string, value: string): Stat => ({ label, value, lead: true, tag });
    switch (price.unit) {
      case "free":
        stats.push(lead("Price", "Free"));
        break;
      case "tokens":
        stats.push(lead("Input / output", `${usd(price.input)} / ${usd(price.output)} ${per1M}`));
        break;
      case "input_tokens":
        stats.push(lead("Input", `${usd(price.value)} ${per1M}`));
        break;
      case "image":
        stats.push(lead("Price", `${usd(price.value)} <small>per image</small>`));
        break;
      case "image_tokens":
        stats.push(lead("Image output", `${usd(price.value)} ${per1M}`));
        break;
      case "second":
        stats.push(lead("Price", `${usd(price.value)} <small>per second of video</small>`));
        break;
      case "chars":
        stats.push(lead("Price", `${usd(price.value)} <small>per 1M characters</small>`));
        break;
      case "minute":
        stats.push(lead("Price", `${usd(price.value)} <small>per minute of audio</small>`));
        break;
      case "metric":
        stats.push(lead("Price", `${usd(price.value)} <small>${esc(price.label)}</small>`));
        break;
    }
  }
  const cacheRead = v.headline?.prices.cacheRead;
  if (cacheRead !== undefined && !v.free) stats.push({ label: "Cache read", value: `${usd(cacheRead)} <small>/ 1M</small>` });
  if (v.context) stats.push({ label: "Context", value: `${tokensShort(v.context)} <small>tokens</small>` });
  if (v.maxOutput) stats.push({ label: "Max output", value: `${tokensShort(v.maxOutput)} <small>tokens</small>` });
  if (v.addedDate) stats.push({ label: "Added", value: `<a href="/new-models/${v.addedDate.slice(0, 7)}"><time datetime="${v.addedDate}">${v.addedDate.length === 10 ? shortDate(v.addedDate) : longDate(v.addedDate)}</time></a>` });
  return stats;
}

export function modelBody(v: ModelView, copy: PageCopy, ctx: ModelPageContext): string {
  const h = v.headline;
  const stats = keyStats(v);

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
<div class="idline"><span>${v.lab ? `By ${esc(v.lab)} · ` : ""}${v.providers.length} ${v.providers.length === 1 ? "provider" : "providers"}</span><span class="id"><code id="model-id">${esc(ms)}</code><button class="copy" type="button" data-copy="model-id">Copy</button></span>${onCompareTool(v) ? `<a class="cmp" href="/compare/custom?models=${encodeURIComponent(v.slug)}" data-track="compare-button">Compare</a>` : ""}</div>
<dl class="stats">${stats.map((s) => `<div class="stat${s.lead ? " lead" : ""}"><dt><span>${s.label}</span>${s.tag ? `<span class="tag">${s.tag}</span>` : ""}</dt><dd>${s.value}</dd></div>`).join("")}</dl>
<p class="answer">${esc(copy.answer)}</p>
${v.intro && h ? `<p class="intro">Introductory price until ${longDate(v.intro.until)}, per <a href="${esc(v.intro.source)}">${esc(v.lab ?? h.providerName)}'s pricing page</a>.</p>` : ""}
<div class="meta"><span>Prices updated <time datetime="${ctx.lastChanged}">${longDate(ctx.lastChanged)}</time></span><span>Checked <time datetime="${ctx.buildDate}">${longDate(ctx.buildDate)}</time></span></div>
</div>`);

  if (v.status === "retired") {
    parts.push(`<div class="warnbox"><strong>Retired.</strong> ${v.deprecation ? `${esc(h?.providerName ?? "The provider")} retired <code>${esc(ms)}</code> on ${longDate(v.deprecation)}. ` : ""}Prices below are the last listed and kept for reference.${ctx.successor ? ` Its successor is <a href="${modelPath(ctx.successor.slug)}">${esc(ctx.successor.name)}</a>.` : ""}</div>`);
  } else if (v.deprecation) {
    const past = v.deprecation <= ctx.buildDate.slice(0, 10);
    parts.push(`<div class="warnbox">${past ? "Deprecated" : "Scheduled for deprecation"}: ${esc(h?.providerName ?? "The provider")} lists ${longDate(v.deprecation)} as the deprecation date for <code>${esc(ms)}</code>.</div>`);
  }


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

  const calc = calcSection(v);
  if (calc) parts.push(calc);

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

  if (ctx.comparisons?.length) {
    parts.push(`<section id="compare"><h2>Compare ${esc(v.name)}</h2><ul class="links">${ctx.comparisons
      .map((c) => `<li><a href="/compare/${c.slug}">${esc(v.name)} vs ${esc(c.other)}</a></li>`)
      .join("")}</ul><p><a href="/compare">All model comparisons</a></p></section>`);
  }
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

/** `showLab: false` drops the Lab column, for tables already grouped under a lab heading. */
export function indexTable(rows: IndexRow[], { showLab = true } = {}): string {
  return `<div class="tbl"><table><thead><tr><th>Model</th>${showLab ? "<th>Lab</th>" : ""}<th>Price</th><th class="n">Context</th><th class="n">Providers</th><th>Added</th></tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr><td><a href="${modelPath(r.slug)}">${esc(r.name)}</a></td>${showLab ? `<td>${esc(r.lab ?? "–")}</td>` : ""}<td class="pr">${esc(r.price ?? "–")}</td><td class="n">${r.context ? tokensShort(r.context) : "–"}</td><td class="n">${r.providers}</td><td>${r.added ? esc(r.added) : "–"}</td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}

const anchor = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** /models body: one section per lab, largest first, with a jump menu; models without a known lab go last. */
export function labSections(rows: IndexRow[]): string {
  const byLab = new Map<string, IndexRow[]>();
  for (const r of rows) byLab.set(r.lab ?? "", [...(byLab.get(r.lab ?? "") ?? []), r]);
  const labs = [...byLab.entries()].sort((a, b) => Number(a[0] === "") - Number(b[0] === "") || b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const name = (lab: string) => lab || "Other labs";
  const jump = `<nav class="jump" aria-label="Jump to a lab">${labs.map(([lab, list]) => `<a href="#${anchor(name(lab))}">${esc(name(lab))} <span>${list.length}</span></a>`).join("")}</nav>`;
  return `${jump}${labs
    .map(([lab, list]) => `<section id="${anchor(name(lab))}"><h2>${lab ? `${esc(lab)} models` : "Models from other labs"}</h2>${indexTable(list, { showLab: false })}</section>`)
    .join("")}`;
}

export function notFoundBody(): string {
  return `<div class="head"><h1>Page not found</h1><p class="answer">This page doesn't exist. Search the catalog or browse every model.</p>
<p><a href="/">Search the model catalog</a> · <a href="/models">Browse all models</a></p></div>`;
}

// ---- Comparison pages ------------------------------------------------------------------------------------

export type CompareView = {
  slug: string;
  a: ModelView;
  b: ModelView;
  copy: import("./compare").CompareCopy;
  rows: [string, string, string][];
  bench: import("./compare").BenchRow[];
  benchDate: string | null;
  cheapest: { model: ModelView; row: RowView | null }[];
  related: { slug: string; title: string }[];
  buildDate: string;
  hubs: Set<string>;
};

export function compareBody(c: CompareView): string {
  const { a, b, copy } = c;
  const head = `<div class="head"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><a href="/compare">Compare</a><span>›</span><span>${esc(copy.h1)}</span></nav>
<h1>${esc(copy.h1)}</h1>
<p class="answer">As of ${longDate(c.buildDate)}, ${esc(copy.answer)}</p>
<div class="meta"><span>Prices from LiteLLM's price file</span><span>Checked <time datetime="${c.buildDate}">${longDate(c.buildDate)}</time></span></div></div>`;
  const table = `<section id="side-by-side"><h2>${esc(a.name)} vs ${esc(b.name)} side by side</h2><div class="tbl" data-track="compare-table" data-page-kind="compare" data-page-id="${c.slug}"><table><caption>Headline prices in US dollars per 1M tokens: each model's own lab where it sells it, otherwise its cheapest provider. Source: LiteLLM model price file, as of ${longDate(c.buildDate)}.</caption><thead><tr><th></th><th><a href="${modelPath(a.slug)}">${esc(a.name)}</a></th><th><a href="${modelPath(b.slug)}">${esc(b.name)}</a></th></tr></thead><tbody>${c.rows
    .map(([k, x, y]) => `<tr><th scope="row">${esc(k)}</th><td>${x}</td><td>${y}</td></tr>`)
    .join("")}</tbody></table></div></section>`;
  const buy = `<section id="providers"><h2>Cheapest provider for each</h2><ul>${c.cheapest
    .map(({ model, row }) => (row ? `<li><a href="${modelPath(model.slug)}">${esc(model.name)}</a>: ${row.hub && c.hubs.has(row.hub) ? `<a href="${providerPath(row.hub)}">${esc(row.providerName)}</a>` : esc(row.providerName)} at ${usd(row.prices.input!)} input and ${row.prices.output !== undefined ? usd(row.prices.output) : "–"} output per 1M tokens (<code>${esc(row.modelString)}</code>)</li>` : ""))
    .join("")}</ul></section>`;
  const benchCats = [...new Set(c.bench.map((r) => r.category))];
  const external = c.bench.some((r) => !r.epoch);
  const bench = c.bench.length
    ? `<section id="benchmarks"><h2>Benchmark scores</h2><div class="tbl"><table><caption>From the <a href="https://epoch.ai/benchmarks">Epoch AI Benchmarking Hub</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)${c.benchDate ? `, data as of ${longDate(c.benchDate)}` : ""}. ${external ? "Some results were run by Epoch and others collected by Epoch from each benchmark's own leaderboard, linked in the first column. " : ""}Each model's best reported reasoning setting is shown in brackets. Higher is better. Only benchmarks with a score for both models are shown.</caption><thead><tr><th>Benchmark</th><th>${esc(a.name)}</th><th>${esc(b.name)}</th></tr></thead><tbody>${benchCats
        .map(
          (cat) =>
            `<tr><th scope="rowgroup" colspan="3">${esc(cat)}</th></tr>${c.bench
              .filter((r) => r.category === cat)
              .map((r) => `<tr><th scope="row"><a href="${esc(r.url)}">${esc(r.name)}</a></th><td>${esc(r.a)}</td><td>${esc(r.b)}</td></tr>`)
              .join("")}`,
        )
        .join("")}</tbody></table></div></section>`
    : "";
  const picks = copy.pickA.length || copy.pickB.length
    ? `<section id="when"><h2>When to pick which</h2><div class="grid2">${[
        [a, copy.pickA],
        [b, copy.pickB],
      ]
        .filter(([, list]) => (list as string[]).length)
        .map(([m, list]) => `<div><h3>Pick ${esc((m as ModelView).name)} for</h3><ul>${(list as string[]).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`)
        .join("")}</div><p class="note">From differences in the data above only; where the data is equal, no reason is given.</p></section>`
    : "";
  const sa = a.headline!.modelString;
  const sb = b.headline!.modelString;
  const sdk = `from litellm import completion

messages = [{"role": "user", "content": "Hello!"}]

# ${a.name}
response = completion(model="${sa}", messages=messages)

# ${b.name}
response = completion(model="${sb}", messages=messages)

# ${a.name}, falling back to ${b.name} if the call fails
response = completion(model="${sa}", messages=messages, fallbacks=["${sb}"])`;
  const code = `<section id="code"><h2>Call ${esc(a.name)} or ${esc(b.name)} with LiteLLM</h2><p>Both use the OpenAI format through LiteLLM, so switching is a model name change. Set each provider's API key in the environment first.</p>${codeBlock(`sdk-${c.slug}`, "Python SDK", sdk)}</section>`;
  const faq = `<section id="faq"><h2>FAQ</h2><div class="faq">${copy.faq.map((f) => `<div><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`).join("")}</div></section>`;
  const more = `<section id="related"><h2>More comparisons</h2><ul class="links">${[
    `<li><a href="${modelPath(a.slug)}">${esc(a.name)} pricing<span>All providers</span></a></li>`,
    `<li><a href="${modelPath(b.slug)}">${esc(b.name)} pricing<span>All providers</span></a></li>`,
    ...c.related.map((r) => `<li><a href="/compare/${r.slug}">${esc(r.title)}</a></li>`),
    `<li><a href="/compare">All comparisons</a></li>`,
  ].join("")}</ul></section>`;
  return [head, table, buy, bench, picks, code, faq, more].join("\n");
}

export function compareHubBody(groups: { label: string; items: { slug: string; title: string; note: string }[] }[], count: number, buildDate: string): string {
  return `<div class="head"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><span>Compare</span></nav>
<h1>AI model comparisons</h1>
<p class="answer">As of ${longDate(buildDate)}, ${int(count)} side-by-side comparisons of AI models: prices per 1M tokens, context windows, features and benchmark scores, from LiteLLM's price file. Each line names the cheaper model at 3 input tokens per output token. New models get compared when they're added. To compare any models you choose, <a href="/compare/custom">build your own comparison</a>.</p></div>
${groups
  .filter((g) => g.items.length)
  .map((g) => `<section><h2>${esc(g.label)}</h2><ul class="links">${g.items.map((i) => `<li><a href="/compare/${i.slug}">${esc(i.title)}<span>${esc(i.note)}</span></a></li>`).join("")}</ul></section>`)
  .join("\n")}`;
}

// ---- Rankings and the new-models log --------------------------------------------------------------------

export type RankRow = { rank: number; slug: string; name: string; lab: string | null; display: string; price: string | null; context?: number; providers: number; seller: string };

export function rankingBody(r: { title: string; h1: string; answer: string; method: string; measure: string; rows: RankRow[]; others: { slug: string; title: string }[]; updated: string; slug: string }): string {
  return `<div class="head"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><a href="/rankings">Rankings</a><span>›</span><span>${esc(r.h1)}</span></nav>
<h1>${esc(r.h1)}</h1>
<p class="answer">${esc(r.answer)}</p>
<div class="meta"><span>Updated <time datetime="${r.updated}">${longDate(r.updated)}</time></span><span>Sorted by ${esc(r.measure.toLowerCase())} only, not by quality</span></div></div>
<section id="ranking"><h2>Top ${r.rows.length}</h2><p class="note">${esc(r.method)}</p><div class="tbl" data-track="ranking-table" data-page-kind="ranking" data-page-id="${r.slug}"><table><thead><tr><th class="n">#</th><th>Model</th><th>Lab</th><th class="n">${esc(r.measure)}</th><th>Price per 1M (in / out)</th><th class="n">Context</th><th class="n">Providers</th><th>Price from</th></tr></thead><tbody>${r.rows
    .map(
      (x) =>
        `<tr><td class="n">${x.rank}</td><td><a href="${modelPath(x.slug)}">${esc(x.name)}</a></td><td>${esc(x.lab ?? "–")}</td><td class="n">${esc(x.display)}</td><td class="pr">${esc(x.price ?? "–")}</td><td class="n">${x.context ? tokensShort(x.context) : "–"}</td><td class="n">${x.providers}</td><td>${esc(x.seller)}</td></tr>`,
    )
    .join("")}</tbody></table></div></section>
<section id="more"><h2>More rankings</h2><ul class="links">${r.others.map((o) => `<li><a href="/rankings/${o.slug}">${esc(o.title)}</a></li>`).join("")}<li><a href="/rankings">All rankings</a></li><li><a href="/compare">Model comparisons</a></li></ul></section>`;
}

export function rankingHubBody(items: { slug: string; title: string; note: string }[], updated: string): string {
  return `<div class="head"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><span>Rankings</span></nav>
<h1>AI model rankings by price and context window</h1>
<p class="answer">As of ${longDate(updated)}, ${items.length} lists of AI models sorted by price or context window, from LiteLLM's price file. Each list says how it's sorted and what it leaves out. None of them rank by quality.</p></div>
<section><h2>All rankings</h2><ul class="links">${items.map((i) => `<li><a href="/rankings/${i.slug}">${esc(i.title)}<span>${esc(i.note)}</span></a></li>`).join("")}</ul></section>`;
}

export type NewModelRow = { slug: string; name: string; lab: string | null; date: string; price: string | null; context?: number; providers: { name: string; hub: string }[]; status: string };

const monthName = (ym: string) => longDate(`${ym}-01`).replace(/ 1, /, " ");

function newModelProviders(providers: NewModelRow["providers"]): string {
  return providers.map((provider) => `<a href="${providerPath(provider.hub)}">${esc(provider.name)}</a>`).join(", ") || "–";
}

export function modelUpdatesMeta(active: "new" | "deprecated", updated: string): string {
  const feed = active === "new" ? "/new-models.xml" : "/deprecated-models.xml";
  return `<div class="meta"><span>Updated <time datetime="${esc(updated)}">${longDate(updated)}</time></span><a class="rss-link" href="${feed}">RSS feed</a></div>`;
}

export function modelUpdatesNav(active: "new" | "deprecated"): string {
  return `<nav class="update-nav segmented-tabs" aria-label="Model updates"><a href="/new-models"${active === "new" ? ' aria-current="page"' : ""}>What's new</a><a href="/deprecated-models"${active === "deprecated" ? ' aria-current="page"' : ""}>Recently deprecated</a></nav>`;
}

export function newModelsMonthBody(ym: string, rows: NewModelRow[], months: { ym: string; count: number }[], updated: string): string {
  const i = months.findIndex((m) => m.ym === ym);
  const newer = months[i - 1];
  const older = months[i + 1];
  return `<div class="head"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><a href="/new-models">New models</a><span>›</span><span>${esc(monthName(ym))}</span></nav>
<h1>New AI models in ${esc(monthName(ym))}</h1>
<p class="answer">${rows.length} ${rows.length === 1 ? "model was" : "models were"} added to LiteLLM's price file in ${esc(monthName(ym))}, newest first, with each one's headline price and context window.</p>
${modelUpdatesMeta("new", updated)}</div>
${modelUpdatesNav("new")}
<section><div class="tbl" data-track="new-models-table" data-page-kind="new-models" data-page-id="${ym}"><table><thead><tr><th>Added</th><th>Model</th><th>Model developer</th><th>API providers</th><th>Price</th><th class="n">Context</th></tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr><td>${r.date.length === 10 ? `<time datetime="${r.date}">${shortDate(r.date)}</time>` : esc(monthName(r.date))}</td><td><a href="${modelPath(r.slug)}">${esc(r.name)}</a>${r.status === "active" ? "" : ` <span class="pill">${esc(r.status)}</span>`}</td><td>${esc(r.lab ?? "–")}</td><td class="provider-list">${newModelProviders(r.providers)}</td><td class="pr">${esc(r.price ?? "–")}</td><td class="n">${r.context ? tokensShort(r.context) : "–"}</td></tr>`,
    )
    .join("")}</tbody></table></div></section>
<nav class="jump" aria-label="Other months">${newer ? `<a href="/new-models/${newer.ym}">← ${esc(monthName(newer.ym))}</a>` : ""}<a href="/new-models">All months</a>${older ? `<a href="/new-models/${older.ym}">${esc(monthName(older.ym))} →</a>` : ""}</nav>`;
}

export function newModelsHubBody(latest: NewModelRow[], months: { ym: string; count: number }[], updated: string): string {
  return `<div class="head"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><span>New models</span></nav>
<h1>New AI models on LiteLLM</h1>
<p class="answer">The ${latest.length} models most recently added to LiteLLM's price file, with their prices on the day. Every month has its own page.</p>
${modelUpdatesMeta("new", updated)}</div>
${modelUpdatesNav("new")}
<section><h2>Latest additions</h2><div class="tbl"><table><thead><tr><th>Added</th><th>Model</th><th>Model developer</th><th>API providers</th><th>Price</th><th class="n">Context</th></tr></thead><tbody>${latest
    .map((r) => `<tr><td>${r.date.length === 10 ? shortDate(r.date) : esc(monthName(r.date))}</td><td><a href="${modelPath(r.slug)}">${esc(r.name)}</a></td><td>${esc(r.lab ?? "–")}</td><td class="provider-list">${newModelProviders(r.providers)}</td><td class="pr">${esc(r.price ?? "–")}</td><td class="n">${r.context ? tokensShort(r.context) : "–"}</td></tr>`)
    .join("")}</tbody></table></div></section>
<section><h2>By month</h2><ul class="links">${months.map((m) => `<li><a href="/new-models/${m.ym}">${esc(monthName(m.ym))}<span>${m.count} ${m.count === 1 ? "model" : "models"}</span></a></li>`).join("")}</ul></section>`;
}

// ---- Cost calculator -------------------------------------------------------------------------------------

/** Inputs and results, with the default workload's result already filled in. */
function calcForm(kind: string, id: string, result: import("./calculator").CalcResult, select = "", listId = ""): string {
  const d = CALC_DEFAULTS;
  return `<div class="calc" data-calc data-track="calculator" data-page-kind="${kind}" data-page-id="${esc(id)}"${listId ? ` data-calc-list="${listId}"` : ""}>
<div class="calc-in">${select}<label>Input tokens per request<input type="number" name="in" value="${d.input}" min="0" inputmode="numeric"></label><label>Output tokens per request<input type="number" name="out" value="${d.output}" min="0" inputmode="numeric"></label><label>Requests per day<input type="number" name="req" value="${d.requests}" min="0" inputmode="numeric"></label></div>
<dl class="calc-out"><div><dt>Per request</dt><dd data-r="req">${calcMoney(result.perRequest)}</dd></div><div><dt>Per day</dt><dd data-r="day">${calcMoney(result.perDay)}</dd></div><div><dt>Per month (${DAYS_PER_MONTH} days)</dt><dd data-r="month">${calcMoney(result.perMonth)}</dd></div></dl>
</div>`;
}

/** The calculator section on a model page; only for models priced per input and output token. */
export function calcSection(v: ModelView): string {
  const h = v.headline;
  if (!h || !leadsWithTokens(h.mode, h.prices, h.metric) || h.prices.input === undefined || h.prices.output === undefined || v.free) return "";
  const d = CALC_DEFAULTS;
  const result = calcCost(h.prices.input, h.prices.output, d.input, d.output, d.requests);
  return `<section id="calculator"><h2>${esc(v.name)} cost calculator</h2>
<p>At ${esc(h.providerName)}'s price (${usd(h.prices.input)} input, ${usd(h.prices.output)} output per 1M tokens), ${int(d.requests)} requests a day with ${int(d.input)} input and ${int(d.output)} output tokens each cost ${calcMoney(result.perDay)} a day, about ${calcMoney(result.perMonth)} a month. Change the numbers for your workload${onCalculator(v) ? `, or <a href="/calculator?model=${encodeURIComponent(v.slug)}">compare it with other models</a>.` : "."}</p>
${calcForm("model", v.slug, result)}</section>`;
}

/** `intro` is the written-out last day of an introductory price. */
export type CalcModel = { slug: string; name: string; input: number; output: number; providers: number; intro?: string };

export function calculatorBody(models: CalcModel[], defaultSlug: string, table: CalcModel[], buildDate: string): string {
  const d = CALC_DEFAULTS;
  const first = models.find((m) => m.slug === defaultSlug) ?? models[0];
  const result = calcCost(first.input, first.output, d.input, d.output, d.requests);
  const list = Object.fromEntries(models.map((m) => [m.slug, m.intro ? [m.name, m.input, m.output, m.intro] : [m.name, m.input, m.output]]));
  // A searchable picker (CALCULATOR_PAGE_JS); the hidden field holds the model's slug, the visible box its name.
  const select = `<label>Model<input type="hidden" name="model" value="${esc(first.slug)}"><input type="text" class="calc-pick" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="calc-list" autocomplete="off" spellcheck="false" value="${esc(first.name)}" aria-label="Model" aria-describedby="calc-intro"><small class="calc-intro" id="calc-intro" data-r="intro"${first.intro ? "" : " hidden"}>${first.intro ? `Introductory price until ${esc(first.intro)}` : ""}</small></label>`;
  const rows = table
    .map((m) => ({ m, r: calcCost(m.input, m.output, d.input, d.output, d.requests) }))
    .sort((a, b) => a.r.perMonth - b.r.perMonth || a.m.name.localeCompare(b.m.name));
  return `<div class="head"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><span>Calculator</span></nav>
<h1>LLM API pricing calculator</h1>
<p class="answer">Estimate what ${int(models.length)} AI models cost for your workload, at prices from LiteLLM's price file as of ${longDate(buildDate)}. Pick a model, then enter tokens per request and requests per day.</p></div>
<section id="calculator">${calcForm("calculator", "calculator", result, select, "calc-models")}
<script type="application/json" id="calc-models">${JSON.stringify(list).replace(/</g, "\\u003c")}</script>
<p class="note">Uses each model's headline price: its own lab's API where it sells it, otherwise its cheapest provider. Cached input, batch discounts and long-context tiers aren't included; each model's page lists them.</p></section>
<section id="examples"><h2>What ${int(d.requests)} requests a day cost</h2><p>Each request with ${int(d.input)} input and ${int(d.output)} output tokens, for the models on our <a href="/compare">comparison pages</a>, cheapest first.</p><div class="tbl" data-track="calculator-table"><table><thead><tr><th>Model</th><th class="n">Per request</th><th class="n">Per day</th><th class="n">Per month</th></tr></thead><tbody>${rows
    .map(({ m, r }) => `<tr><td><a href="${modelPath(m.slug)}">${esc(m.name)}</a>${m.intro ? ` <span class="note">introductory price until ${esc(m.intro)}</span>` : ""}</td><td class="n">${calcMoney(r.perRequest)}</td><td class="n">${calcMoney(r.perDay)}</td><td class="n">${calcMoney(r.perMonth)}</td></tr>`)
    .join("")}</tbody></table></div></section>`;
}
