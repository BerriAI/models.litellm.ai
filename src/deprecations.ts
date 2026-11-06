/** A dated provider listing, preserved after it leaves the catalog. Dates are effective dates, not announcements. */
export type DeprecationListing = {
  key: string;
  slug: string;
  name: string;
  provider: string;
  providerName: string;
  modelId: string;
  date: string;
  firstObservedOn: string;
  /** The provider's recommended replacement, when its notice names one. */
  successor?: string;
  /** The provider page or feed the date was read from. */
  reference?: string;
};

export type Deprecation = Omit<
  DeprecationListing,
  "key" | "modelId" | "firstObservedOn"
> & {
  id: string;
  listings: DeprecationListing[];
  successor?: string;
  reference?: string;
};

export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const day = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value
  );
}

/** Also used when reading the published manifest in the browser. */
export function parseDeprecations(value: unknown): DeprecationListing[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is DeprecationListing => {
    if (!entry || typeof entry !== "object") return false;
    return (
      ["key", "name", "providerName", "modelId"].every(
        (key) => typeof entry[key] === "string" && entry[key].trim(),
      ) &&
      typeof entry.slug === "string" &&
      /^[a-z0-9][a-z0-9._-]*$/.test(entry.slug) &&
      typeof entry.provider === "string" &&
      /^[a-z0-9][a-z0-9_-]*$/.test(entry.provider) &&
      isDay(entry.date) &&
      isDay(entry.firstObservedOn) &&
      (entry.successor === undefined ||
        (typeof entry.successor === "string" &&
          entry.successor.trim() !== "")) &&
      (entry.reference === undefined ||
        (typeof entry.reference === "string" &&
          /^https?:\/\//.test(entry.reference)))
    );
  });
}

/** Group regional/price variants, but never hide which seller or exact routes are affected. */
export function groupDeprecations(
  listings: DeprecationListing[],
): Deprecation[] {
  const groups = new Map<string, Deprecation>();
  for (const listing of listings) {
    const id = `${listing.slug}--${listing.provider}--${listing.date}`;
    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        slug: listing.slug,
        name: listing.name,
        provider: listing.provider,
        providerName: listing.providerName,
        date: listing.date,
        listings: [],
      };
      groups.set(id, group);
    }
    if (!group.listings.some((row) => row.key === listing.key))
      group.listings.push(listing);
    if (!group.successor && listing.successor)
      group.successor = listing.successor;
    if (!group.reference && listing.reference)
      group.reference = listing.reference;
  }
  for (const group of groups.values())
    group.listings.sort(
      (a, b) =>
        a.modelId.localeCompare(b.modelId) || a.key.localeCompare(b.key),
    );
  return [...groups.values()].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.name.localeCompare(b.name) ||
      a.provider.localeCompare(b.provider),
  );
}
