import { readable } from "svelte/store";

/** Written by scripts/seo/generate.ts at build time; absent in `npm run dev`. */
export type BuildInfo = {
  builtAt: string;
  /** Models with their own page (all provider listings of a model share one page). */
  models: number;
  /** Entries in model_prices_and_context_window.json. */
  listings: number;
  /** Providers with at least one priced model. */
  providers: number;
  /** GitHub stars on BerriAI/litellm, when the build could read them. */
  stars: number | null;
  /** Last commit to the price file, when the build could read it. */
  priceFileUpdatedAt: string | null;
};

/** `undefined` while loading, `null` when the file is missing (dev server). */
export const buildInfo = readable<BuildInfo | null | undefined>(undefined, (set) => {
  fetch("/build-info.json")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => set(data && typeof data.models === "number" ? (data as BuildInfo) : null))
    .catch(() => set(null));
});

/** 60255 -> "60K+". */
export function formatStars(stars: number): string {
  return stars >= 1000 ? `${Math.floor(stars / 1000)}K+` : String(stars);
}

/** "12 min ago", "3 h ago", "2 days ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
