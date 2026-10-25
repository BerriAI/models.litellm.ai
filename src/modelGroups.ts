export type GroupableItem = {
  name: string;
  display_name: string;
  release_date: string | null;
  max_input_tokens?: number;
  [key: string]: any;
};

export type ModelGroupItem<T extends GroupableItem> = T & {
  groupKey: string;
  groupSlug: string | null;
  members: T[];
};

/**
 * Collapses one row per provider listing into one row per model. Keys share a
 * group when the build-time grouping (`scripts/seo/group.ts`, shipped as
 * `/models/slugs.json`) puts them on the same model page; keys without a page
 * fall back to their display name and mode. Groups keep the order of their
 * first member, so search relevance still decides the order.
 */
export function groupByModel<T extends GroupableItem>(
  items: readonly T[],
  slugs: Readonly<Record<string, string>>,
  inputSortValue: (item: T) => number,
): (T | ModelGroupItem<T>)[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const slug = slugs[item.name];
    const key = slug
      ? `page:${slug}`
      : `name:${item.display_name.toLowerCase()}|${item.mode ?? ""}`;
    const members = groups.get(key);
    if (members) members.push(item);
    else groups.set(key, [item]);
  }
  const out: (T | ModelGroupItem<T>)[] = [];
  for (const [key, members] of groups) {
    if (members.length === 1) {
      out.push(members[0]);
      continue;
    }
    const byInput = [...members].sort(
      (a, b) => priceOrder(inputSortValue(a)) - priceOrder(inputSortValue(b)),
    );
    const releases = members
      .map((m) => m.release_date)
      .filter((d): d is string => !!d)
      .sort();
    out.push({
      ...byInput[0],
      display_name: members[0].display_name,
      name: `group:${key}`,
      groupKey: key,
      groupSlug: slugs[members[0].name] ?? null,
      members: byInput,
      release_date: releases[0] ?? null,
      max_input_tokens:
        Math.max(0, ...members.map((m) => m.max_input_tokens ?? 0)) ||
        undefined,
    });
  }
  return out;
}

/** Unknown prices sort as 0 upstream; push them after every known price. */
export function priceOrder(value: number): number {
  return value > 0 ? value : Number.POSITIVE_INFINITY;
}

export function cheapestBy<T>(
  members: readonly T[],
  sortValue: (item: T) => number,
): T {
  let best = members[0];
  for (const m of members)
    if (priceOrder(sortValue(m)) < priceOrder(sortValue(best))) best = m;
  return best;
}

export function providerCount(
  members: readonly { litellm_provider?: string }[],
): number {
  return new Set(members.map((m) => m.litellm_provider ?? "")).size;
}
