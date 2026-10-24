import type { BenchmarkData } from "./benchmarks";
import type { ModelView } from "./model-view";

export type EpochDiscoveryModel = {
  slug: string;
  name: string;
  lab: string | null;
  href: string;
  /** Epoch Capabilities Index points; this is not a percentage. */
  score: number;
  /** Date supplied with the ECI row; it is not the feed's refresh timestamp. */
  date: string | null;
};

type CatalogModel = Pick<
  ModelView,
  "slug" | "name" | "lab" | "alsoKnownAs" | "status"
>;

function sourceReportedDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

/** Reuse Epoch's fetched data with the comparison pages' exact display-name matching. */
export function epochDiscoveryModels(
  data: BenchmarkData | null,
  views: readonly CatalogModel[],
): { models: EpochDiscoveryModel[]; asOf: string | null } {
  const models: EpochDiscoveryModel[] = [];
  const matchedNames = new Set<string>();
  for (const view of views) {
    if (view.status === "retired") continue;
    const name = [view.name, ...view.alsoKnownAs]
      .map((candidate) => candidate.toLowerCase())
      .find((candidate) => data?.eci.has(candidate));
    if (!name || matchedNames.has(name)) continue;
    const eci = data!.eci.get(name)!;
    if (!Number.isFinite(eci.score) || eci.score < 0) continue;
    matchedNames.add(name);
    models.push({
      slug: view.slug,
      name: view.name,
      lab: view.lab,
      href: `/models/${view.slug}`,
      score: eci.score,
      date: sourceReportedDate(eci.date),
    });
  }
  const dates = models.flatMap((model) => (model.date ? [model.date] : []));
  return { models, asOf: dates.sort().at(-1) ?? null };
}
