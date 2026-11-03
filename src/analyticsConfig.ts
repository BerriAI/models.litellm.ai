/**
 * Mixpanel settings shared by the Svelte app and the generated static pages,
 * so both surfaces write the same anonymous id (localStorage on this origin)
 * and one visitor's journey is a single Mixpanel timeline.
 */
import type { Config } from "mixpanel-browser";

export const MIXPANEL_OPTIONS: Partial<Config> = {
  persistence: "localStorage",
  // "Page View" is tracked explicitly with page context on both surfaces.
  track_pageview: false,
  autocapture: {
    pageview: false,
    click: true,
    input: true,
    scroll: true,
    submit: true,
    rage_click: true,
    dead_click: true,
    capture_text_content: true,
    scroll_depth_percent_checkpoints: [25, 50, 75, 100],
    block_selectors: [".ph-no-capture", "[data-ph-no-capture]", "[data-mp-no-capture]"],
  },
};

/** Page kind for any path on the site, so every page view and event can be split by page type. */
export function pageKind(path: string): string {
  const p = path.replace(/\/$/, "") || "/";
  if (p === "/" || p === "/search") return "models";
  const [first, second] = p.slice(1).split("/");
  if (first === "models") return second ? "model" : "models-index";
  if (first === "providers") return second ? "provider" : "providers";
  if (first === "compare") return !second ? "compare-index" : second === "custom" ? "compare-tool" : "compare";
  if (first === "rankings") return second ? "ranking" : "rankings";
  if (first === "new-models") return second ? "new-models-month" : "new-models";
  if (first === "deprecated-models") return second ? "deprecated-models-month" : "deprecated-models";
  return first;
}

export function outboundLinkProps(link: HTMLAnchorElement, origin: string) {
  if (link.origin === origin || !/^https?:$/.test(link.protocol)) return undefined;
  return { url: link.href, host: link.hostname, text: (link.textContent ?? "").trim().slice(0, 80) };
}
