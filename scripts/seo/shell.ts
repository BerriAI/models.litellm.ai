/**
 * Copies of the app's index.html for each of its routes (/, /providers,
 * /cookbook, /guardrails), each with its own title, description, canonical and
 * share image. Without these every route served the home page's head with a
 * canonical pointing at /, so search engines folded them into the home page.
 *
 * Each copy also carries the route's content as plain HTML in #seo-shell, for
 * crawlers that don't run JavaScript (most AI search crawlers). It is the same
 * content the app renders: an inline script hides it as soon as JavaScript
 * runs, and src/main.ts removes it when the app mounts.
 */
import { escapeHtml as esc } from "./format";
import { imageTags } from "./html";
import { jsonLdScript } from "./jsonld";
import type { OgImage } from "./og";
import { abs } from "./site";

export type ShellPage = {
  path: string;
  title: string;
  description: string;
  image: OgImage;
  /** The route's content as plain HTML, read by crawlers that don't run JavaScript. */
  body: string;
  jsonLd?: Record<string, unknown>;
  noindex?: boolean;
};

const SHELL_HEAD = `<script>document.documentElement.classList.add("js")</script>
<style>.js #seo-shell{display:none}#seo-shell{max-width:1000px;margin:0 auto;padding:24px 16px;font:16px/1.6 system-ui,sans-serif}#seo-shell table{border-collapse:collapse;width:100%}#seo-shell th,#seo-shell td{text-align:left;padding:6px 8px;border-bottom:1px solid #e6e7ee;vertical-align:top}</style>`;

function replaceOnce(
  html: string,
  pattern: RegExp,
  replacement: string,
): string {
  if (!pattern.test(html))
    throw new Error(`app shell: ${pattern} not found in index.html`);
  return html.replace(pattern, replacement);
}

const INJECTED = /\n?<!-- seo:start -->[\s\S]*?<!-- seo:end -->/g;

export function appShell(indexHtml: string, page: ShellPage): string {
  const url = abs(page.path);
  // Drop anything a previous run injected, so re-running the generator is safe.
  let html = indexHtml.replace(INJECTED, "");
  html = replaceOnce(
    html,
    /<title>[^<]*<\/title>/,
    `<title>${esc(page.title)}</title>`,
  );
  html = replaceOnce(
    html,
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${esc(page.description)}" />`,
  );
  html = replaceOnce(
    html,
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${esc(url)}" />`,
  );
  html = replaceOnce(
    html,
    /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${esc(page.title)}" />`,
  );
  html = replaceOnce(
    html,
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${esc(page.description)}" />`,
  );
  html = replaceOnce(
    html,
    /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${esc(url)}" />`,
  );
  html = replaceOnce(
    html,
    /<\/head>/,
    `<!-- seo:start -->\n${page.noindex ? '<meta name="robots" content="noindex,follow">\n' : ""}${imageTags(page.image)}\n${SHELL_HEAD}\n${page.jsonLd ? jsonLdScript(page.jsonLd) : ""}\n<!-- seo:end -->\n</head>`,
  );
  html = replaceOnce(
    html,
    /<div id="app"><\/div>/,
    `<!-- seo:start --><div id="seo-shell"><main>${page.body}</main></div><!-- seo:end --><div id="app"></div>`,
  );
  return html;
}
