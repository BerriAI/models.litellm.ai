import {
  isDay,
  parseDeprecations,
  type DeprecationListing,
} from "../../src/deprecations";
import type { CostMap } from "./group";
import type { ModelView } from "./model-view";

/** Backfill recorded dates. Preserve past listings removed from the price file, but honor explicit date corrections. */
export function buildDeprecations(
  views: ModelView[],
  costMap: CostMap,
  previous: unknown,
  today: string,
): DeprecationListing[] {
  const prior = new Map(
    parseDeprecations(previous).map((entry) => [entry.key, entry]),
  );
  const current = new Map<string, DeprecationListing>();
  for (const view of views) {
    for (const row of view.rows) {
      if (!isDay(row.deprecation)) continue;
      const old = prior.get(row.key);
      current.set(row.key, {
        key: row.key,
        slug: view.slug,
        name: view.name,
        provider: row.hub,
        providerName: row.providerName,
        modelId: row.modelString,
        date: row.deprecation,
        firstObservedOn:
          old?.date === row.deprecation ? old.firstObservedOn : today,
      });
    }
  }
  for (const entry of prior.values()) {
    if (!(entry.key in costMap) && entry.date <= today)
      current.set(entry.key, entry);
  }
  return [...current.values()].sort((a, b) => a.key.localeCompare(b.key));
}
