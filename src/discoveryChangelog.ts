import { humanizeModelId } from "./modelMeta";
import { getProviderDisplayName } from "./providers";

export type UpdateKind =
  | "price"
  | "model"
  | "provider"
  | "capability"
  | "deprecation"
  | "metadata";
export type CatalogRow = Record<string, unknown>;
export type CatalogMap = Record<string, CatalogRow>;
export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}
export interface ChangedListing {
  modelId: string;
  name: string;
  changes: FieldChange[];
}
export interface CatalogUpdate {
  id: string;
  date: string;
  timestamp: string;
  kind: UpdateKind;
  provider: string;
  title: string;
  description: string;
  source: string;
  sourceLabel: string;
  entries: ChangedListing[];
}
export const updateKinds: {
  id: UpdateKind | "all";
  label: string;
  icon: string;
}[] = [
  { id: "all", label: "All updates", icon: "≡" },
  { id: "price", label: "Pricing", icon: "↗" },
  { id: "model", label: "New listings", icon: "+" },
  { id: "provider", label: "New providers", icon: "◇" },
  { id: "capability", label: "Capabilities", icon: "✳" },
  { id: "deprecation", label: "Deprecations", icon: "−" },
  { id: "metadata", label: "Other changes", icon: "·" },
];

// A missing price is unknown, never zero. Rates here are recorded catalog values,
// which may be corrections rather than provider-announced price changes.
export function priceDelta(change: FieldChange): string {
  const { before, after } = change;
  if (typeof before !== "number" || typeof after !== "number")
    return after == null ? "Removed" : "Added";
  if (before === after) return "Unchanged";
  if (before === 0) return "Previously free";
  const percent = Math.abs(((after - before) / before) * 100);
  return `${after > before ? "+" : "−"}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(percent)}%`;
}
export function fieldLabel(field: string): string {
  return field.replace(/_/g, " ").replace(/^./, (s) => s.toUpperCase());
}
export function fieldValue(field: string, value: unknown): string {
  if (value == null) return "Not listed";
  if (typeof value === "number" && field.includes("cost")) {
    const tokenRate =
      /_per_(?:[a-z]+_)*token(?:_|$)/.test(field) ||
      /_token_cost(?:_|$)/.test(field);
    const characterRate = /_per_character(?:_|$)/.test(field);
    const scaled = tokenRate || characterRate;
    const amount = new Intl.NumberFormat("en-US", {
      maximumSignificantDigits: 10,
    }).format(value * (scaled ? 1e6 : 1));
    return `${field.includes("_dbu_") ? "" : "$"}${amount}${field.includes("_dbu_") ? " DBU" : ""}${tokenRate ? " / 1M tokens" : characterRate ? " / 1M characters" : ""}`;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function category(field: string): UpdateKind {
  if (field.includes("cost")) return "price";
  if (/deprecat|retire/.test(field)) return "deprecation";
  if (
    /^(supports_|max_input_tokens|max_output_tokens|supported_|mode$)/.test(
      field,
    )
  )
    return "capability";
  return "metadata";
}
function comparable(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return JSON.stringify(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, comparable(v)]),
    );
  }
  return JSON.stringify(value) ?? "undefined";
}
function changes(before: CatalogRow, after: CatalogRow): FieldChange[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .filter((field) => comparable(before[field]) !== comparable(after[field]))
    .map((field) => ({
      field,
      before: before[field] ?? null,
      after: after[field] ?? null,
    }));
}
export function catalogChanges(
  before: CatalogMap,
  after: CatalogMap,
  commit: { sha: string; timestamp: string; subject: string },
  providerNames: Record<string, string> = {},
): CatalogUpdate[] {
  const groups = new Map<string, CatalogUpdate>();
  const providersBefore = new Set(
    Object.values(before).map((row) => row.litellm_provider),
  );
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(commit.timestamp));
  const source = `https://github.com/BerriAI/litellm/commit/${commit.sha}`;
  const pr = /\(#(\d+)\)$/.exec(commit.subject)?.[1];
  const append = (
    kind: UpdateKind,
    provider: string,
    entry: ChangedListing,
  ) => {
    const key = `${kind}:${provider}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        id: `${commit.sha}:${key}`,
        date,
        timestamp: commit.timestamp,
        kind,
        provider,
        title: "",
        description: "",
        source,
        sourceLabel: pr
          ? `Source · #${pr}`
          : `Source · ${commit.sha.slice(0, 7)}`,
        entries: [],
      };
      groups.set(key, group);
    }
    group.entries.push(entry);
  };
  for (const modelId of [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].sort()) {
    if (modelId === "sample_spec" || modelId === "fallback_generalizations")
      continue;
    const oldRow = before[modelId],
      row = after[modelId];
    const provider = String(
      row?.litellm_provider ?? oldRow?.litellm_provider ?? "unknown",
    );
    const name = humanizeModelId(modelId);
    const diff = changes(oldRow ?? {}, row ?? {});
    if (!diff.length) continue;
    if (!oldRow) {
      append("model", provider, { modelId, name, changes: diff });
      if (!providersBefore.has(provider))
        append("provider", provider, { modelId, name, changes: [] });
    } else if (!row) {
      append("metadata", provider, {
        modelId,
        name,
        changes: [
          { field: "catalog_listing", before: "Listed", after: "Removed" },
        ],
      });
    } else {
      for (const kind of new Set(diff.map((item) => category(item.field)))) {
        append(kind, provider, {
          modelId,
          name,
          changes: diff.filter((item) => category(item.field) === kind),
        });
      }
    }
  }
  for (const group of groups.values()) {
    const count = group.entries.length;
    const who =
      providerNames[group.provider] ?? getProviderDisplayName(group.provider);
    const model = count === 1 ? group.entries[0].name : `${count} listings`;
    if (group.kind === "provider") {
      group.title = `${who} added to the price catalog`;
      group.description = `${count} initial catalog ${count === 1 ? "listing" : "listings"}. The provider was absent from the preceding catalog version; this is not a provider launch date.`;
    } else if (group.kind === "model") {
      group.title = `${model} added on ${who}`;
      group.description =
        "Added to LiteLLM's price file. May be a new model, provider listing, alias, or restored entry.";
    } else {
      const label = {
        price: "Recorded pricing",
        capability: "Capabilities",
        deprecation: "Deprecation dates",
        metadata: "Catalog metadata",
      }[group.kind];
      group.title = `${label} updated for ${model} on ${who}`;
      group.description =
        group.kind === "price"
          ? "Before and after values from the catalog commit; this may be a pricing correction."
          : "Recorded changes from LiteLLM's catalog history.";
    }
  }
  return [...groups.values()];
}
