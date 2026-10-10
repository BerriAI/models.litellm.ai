/**
 * Copies of the app's index.html for each of its routes (/, /providers,
 * /cookbook, /guardrails), each with its own title, description, canonical and
 * share image. Without these every route served the home page's head with a
 * canonical pointing at /, so search engines folded them into the home page.
 *
 * Each copy also carries a <noscript> summary with real links, for crawlers
 * that don't run JavaScript (most AI search crawlers). The app replaces nothing
 * and hides nothing: browsers with JavaScript never render <noscript>.
 */
import { escapeHtml as esc } from "./format";
import { imageTags } from "./html";
import type { OgImage } from "./og";
import { abs } from "./site";

export type ShellPage = {
  path: string;
  title: string;
  description: string;
  image: OgImage;
  /** HTML shown to clients without JavaScript. */
  noscript: string;
};

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
    `<!-- seo:start -->\n${imageTags(page.image)}\n<!-- seo:end -->\n</head>`,
  );
  html = replaceOnce(
    html,
    /<div id="app"><\/div>/,
    `<div id="app"></div><!-- seo:start --><noscript>${page.noscript}</noscript><!-- seo:end -->`,
  );
  return html;
}

/** A plain list of links for the <noscript> summaries. */
export function linkList(
  items: { href: string; text: string; note?: string }[],
): string {
  return `<ul>${items.map((i) => `<li><a href="${esc(i.href)}">${esc(i.text)}</a>${i.note ? `: ${esc(i.note)}` : ""}</li>`).join("")}</ul>`;
}
