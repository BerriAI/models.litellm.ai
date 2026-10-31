import {
  fieldLabel,
  fieldValue,
  priceDelta,
  type CatalogUpdate,
  type FieldChange,
} from "./discoveryChangelog";
import { getProviderDisplayName } from "./providers";

export interface ChangelogItem extends CatalogUpdate {
  headline: string;
  lines: string[];
}
const labels: Record<string, string> = {
  search_context_cost_per_query: "Web search",
  input_cost_per_token: "Input",
  output_cost_per_token: "Output",
  cache_read_input_token_cost: "Cached input",
  cache_creation_input_token_cost: "Cache write",
  max_input_tokens: "Input context",
  max_output_tokens: "Max output",
  max_tokens: "Context",
  supports_function_calling: "Tool calling",
  supports_parallel_function_calling: "Parallel tool calling",
  supports_vision: "Vision",
  supports_reasoning: "Reasoning",
  supports_prompt_caching: "Prompt caching",
  deprecation_date: "Deprecation date",
  catalog_listing: "Listing",
};
function conciseLabel(field: string): string {
  if (labels[field]) return labels[field];
  for (const base of [
    "cache_creation_input_token_cost",
    "cache_read_input_token_cost",
    "input_cost_per_token",
    "output_cost_per_token",
  ]) {
    if (!field.startsWith(base + "_")) continue;
    const suffix = field.slice(base.length + 1);
    const label = labels[base];
    if (suffix === "batches") return `Batch ${label.toLowerCase()}`;
    if (suffix === "flex") return `Flex ${label.toLowerCase()}`;
    if (suffix === "priority") return `Priority ${label.toLowerCase()}`;
    return `${label} (${suffix.replace(/_/g, " ")})`;
  }
  return fieldLabel(field);
}
export function changeLine(change: FieldChange): string {
  const { field, before, after } = change;
  const label = conciseLabel(field);
  if (
    field.includes("cost") &&
    ((before && typeof before === "object") ||
      (after && typeof after === "object")) &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const old = (before ?? {}) as Record<string, unknown>,
      next = (after ?? {}) as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(old), ...Object.keys(next)])];
    const changed = keys.filter(
      (key) => JSON.stringify(old[key]) !== JSON.stringify(next[key]),
    );
    const lines = changed.map((key) =>
      changeLine({ field, before: old[key] ?? null, after: next[key] ?? null }),
    );
    if (lines.length && lines.every((line) => line === lines[0]))
      return lines[0];
    return lines
      .map(
        (line, i) =>
          `${line} (${changed[i].replace(/search_context_size_/g, "").replace(/_/g, " ")})`,
      )
      .join("; ");
  }
  const price = (value: unknown) => {
    const text = fieldValue(field, value);
    const unit = /_per_(query|image|second|minute|request)(?:_|$)/.exec(
      field,
    )?.[1];
    return unit && !text.includes(" / ") ? `${text} / ${unit}` : text;
  };
  if (
    field.includes("cost") &&
    (typeof before === "number" || before == null) &&
    (typeof after === "number" || after == null)
  ) {
    if (after == null) return `${label} price removed`;
    if (before == null) return `${label} price added: ${price(after)}`;
    const a = price(before),
      b = price(after);
    const unit = b.includes(" / ") ? b.slice(b.indexOf(" / ")) : "";
    const direction =
      Number(after) < Number(before) ? "decreased" : "increased";
    return `${label} ${direction} ${a.replace(unit, "")} → ${b.replace(unit, "")} (${priceDelta(change)})${unit}`;
  }
  if (field.startsWith("supports_") && typeof after === "boolean")
    return `${label} ${after ? "enabled" : "disabled"}`;
  if (after == null) return `${label} removed`;
  const value = (v: unknown) =>
    typeof v === "number" && !field.includes("cost")
      ? new Intl.NumberFormat("en-US").format(v)
      : Array.isArray(v)
        ? v.join(", ")
        : fieldValue(field, v);
  return before == null
    ? `${label} added: ${value(after)}`
    : `${label}: ${value(before)} → ${value(after)}`;
}

export function changelogItems(
  updates: CatalogUpdate[],
  names: Record<string, string>,
): ChangelogItem[] {
  const newProviders = new Set(
    updates
      .filter((u) => u.kind === "provider")
      .map((u) => `${u.source}:${u.provider}`),
  );
  const items = updates.flatMap((update) => {
    const hub = update.provider.startsWith("vertex_ai")
      ? "vertex_ai"
      : update.provider;
    const provider = names[hub] ?? getProviderDisplayName(hub);
    if (
      update.kind === "model" &&
      newProviders.has(`${update.source}:${update.provider}`)
    )
      return [];
    if (update.kind === "model" || update.kind === "provider") {
      const n = update.entries.length;
      const headline =
        update.kind === "provider"
          ? `${provider} added with ${n} ${n === 1 ? "model" : "models"}`
          : n === 1
            ? `${update.entries[0].name} added on ${provider}`
            : `${n} models added on ${provider}`;
      const lines =
        n === 1
          ? []
          : [
              update.entries
                .slice(0, 3)
                .map((e) => e.name)
                .join(", ") + (n > 3 ? ` +${n - 3} more` : ""),
            ];
      return [{ ...update, headline, lines }];
    }
    return update.entries.map((entry) => {
      const ordered = [...entry.changes].sort((a, b) => {
        const rank = (field: string) =>
          field === "input_cost_per_token"
            ? 0
            : field === "output_cost_per_token"
              ? 1
              : 2;
        return rank(a.field) - rank(b.field);
      });
      return {
        ...update,
        id: `${update.id}:${encodeURIComponent(entry.modelId)}`,
        entries: [entry],
        headline: `${entry.name} on ${provider}`,
        lines: ordered.map(changeLine),
      };
    });
  });
  // Collapse aliases/regions only when the model name, provider, commit AND exact
  // changes agree. Different prices must always remain separate entries.
  const grouped = new Map<string, ChangelogItem>();
  for (const item of items) {
    const key = [
      item.source,
      item.provider,
      item.kind,
      item.headline,
      JSON.stringify(item.entries[0]?.changes),
    ].join("|");
    const match = grouped.get(key);
    if (match && item.kind !== "model" && item.kind !== "provider")
      match.entries.push(...item.entries);
    else grouped.set(key, item);
  }
  return [...grouped.values()];
}

export const rssTitle = (item: ChangelogItem) =>
  item.lines.length && item.kind !== "model" && item.kind !== "provider"
    ? `${item.headline}: ${item.lines[0]}`
    : item.headline;
const xml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
export function changelogRss(
  items: ChangelogItem[],
  generatedAt: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>LiteLLM model changelog</title><link>https://models.litellm.ai/changelog</link><description>Model pricing, new models, providers, and capabilities from the LiteLLM catalog.</description><language>en-us</language><lastBuildDate>${new Date(generatedAt).toUTCString()}</lastBuildDate><atom:link href="https://models.litellm.ai/changelog.xml" rel="self" type="application/rss+xml"/>${items
    .filter((i) => i.kind !== "metadata")
    .map(
      (item) =>
        `<item><title>${xml(rssTitle(item))}</title><link>${xml(item.source)}</link><guid isPermaLink="false">${xml(item.id)}</guid><pubDate>${new Date(item.timestamp).toUTCString()}</pubDate><category>${xml(item.kind)}</category><description>${xml([...item.lines, ...item.entries.map((e) => e.modelId)].join("\n"))}</description></item>`,
    )
    .join("")}</channel></rss>\n`;
}
