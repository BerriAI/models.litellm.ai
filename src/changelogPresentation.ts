import {
  fieldLabel,
  fieldValue,
  priceDelta,
  type CatalogUpdate,
  type FieldChange,
} from "./discoveryChangelog.js";
import { getProviderDisplayName } from "./providerNames.js";

export interface ChangelogItem extends CatalogUpdate {
  providerName: string;
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
  supports_web_search: "Web search",
  supports_tool_choice: "Tool choice",
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
      return [{ ...update, providerName: provider, headline, lines }];
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
        providerName: provider,
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
/** One RSS `<item>`, however many catalog changes it stands for. */
export interface FeedEntry {
  id: string;
  link: string;
  timestamp: string;
  category: string;
  title: string;
  body: string;
}
export const feedEntry = (item: ChangelogItem): FeedEntry => ({
  id: item.id,
  link: item.source,
  timestamp: item.timestamp,
  category: item.kind,
  title: rssTitle(item),
  body: [...item.lines, ...item.entries.map((e) => e.modelId)].join("\n"),
});
/** Slack's RSS app cuts an item body around 500 characters, so a digest stops listing before that. */
export const DIGEST_BODY_LIMIT = 480;
const kindRank: Record<string, number> = {
  provider: 0,
  model: 0,
  price: 1,
  capability: 2,
  deprecation: 3,
  metadata: 4,
};
interface DigestBullet {
  text: string;
  added: boolean;
  providerName: string;
}
function digestBullets(items: ChangelogItem[]): DigestBullet[] {
  const bullets = new Map<string, DigestBullet>();
  for (const item of [...items].sort(
    (a, b) => kindRank[a.kind] - kindRank[b.kind],
  )) {
    if (item.kind === "provider") {
      const n = item.entries.length;
      bullets.set(`provider|${item.provider}`, {
        text: `${item.providerName} added with ${n} ${n === 1 ? "model" : "models"}`,
        added: true,
        providerName: item.providerName,
      });
      continue;
    }
    for (const entry of item.entries) {
      const key = `${item.provider}|${entry.name}`;
      const note = item.kind === "model" ? "" : item.lines.join(", ");
      const match = bullets.get(key);
      if (match && note) match.text += `, ${note}`;
      else if (!match)
        bullets.set(key, {
          text:
            item.kind === "model"
              ? `${entry.name} added on ${item.providerName}`
              : `${entry.name} on ${item.providerName}: ${note}`,
          added: item.kind === "model",
          providerName: item.providerName,
        });
    }
  }
  return [...bullets.values()];
}
function digestTitle(bullets: DigestBullet[]): string {
  const added = bullets.filter((b) => b.added).length;
  const updated = bullets.length - added;
  const providers = [...new Set(bullets.map((b) => b.providerName))];
  const where =
    providers.length > 3
      ? `${providers.length} providers`
      : providers.join(", ");
  const counts = [
    added ? `${added} ${added === 1 ? "model" : "models"} added` : "",
    updated
      ? added
        ? `${updated} updated`
        : `${updated} ${updated === 1 ? "model" : "models"} updated`
      : "",
  ].filter(Boolean);
  return `${counts.join(", ")} on ${where}`;
}
/** One feed item per catalog commit: a counts headline and a bullet per model, cut to fit a Slack post. */
export function digestFeedEntries(items: ChangelogItem[]): FeedEntry[] {
  const byCommit = new Map<string, ChangelogItem[]>();
  for (const item of items)
    byCommit.set(item.source, [...(byCommit.get(item.source) ?? []), item]);
  return [...byCommit.values()].map((commitItems) => {
    const bullets = digestBullets(commitItems);
    const sha = commitItems[0].source.split("/").pop() ?? "";
    const shown: string[] = [];
    let length = 0;
    for (const bullet of bullets) {
      const line = `• ${bullet.text}`;
      if (shown.length && length + line.length + 1 > DIGEST_BODY_LIMIT) break;
      shown.push(line);
      length += line.length + 1;
    }
    const rest = bullets.length - shown.length;
    return {
      id: `digest:${sha}`,
      link: commitItems[0].source,
      timestamp: commitItems[0].timestamp,
      category: "digest",
      title: bullets.length === 1 ? bullets[0].text : digestTitle(bullets),
      body: [...shown, ...(rest ? [`• +${rest} more`] : [])].join("\n"),
    };
  });
}
const xml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
export const FEED_URL = "https://models.litellm.ai/changelog.xml";
export interface FeedFilter {
  kinds: string[];
  providers: string[];
  digest: boolean;
}
const list = (value: string | null) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
/** `?kind=price,deprecation&providers=bedrock,openai&digest=commit` as the feed reads it. */
export const feedFilter = (params: URLSearchParams): FeedFilter => ({
  kinds: list(params.get("kind")),
  providers: list(params.get("providers")),
  digest: params.get("digest") === "commit",
});
/** The query string the page's RSS link carries for its current tab and provider. */
export function feedQuery(kind: string, provider: string): string {
  const params = new URLSearchParams();
  if (kind !== "all") params.set("kind", kind);
  if (provider !== "all") params.set("providers", provider);
  const query = params.toString();
  return query ? `?${query}` : "";
}
export function filterChangelogItems(
  items: ChangelogItem[],
  filter: FeedFilter,
): ChangelogItem[] {
  return items.filter(
    (item) =>
      (filter.kinds.length
        ? filter.kinds.includes(item.kind)
        : item.kind !== "metadata") &&
      (!filter.providers.length || filter.providers.includes(item.provider)),
  );
}
export function changelogRss(
  items: FeedEntry[],
  generatedAt: string,
  selfUrl = FEED_URL,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>LiteLLM model changelog</title><link>https://models.litellm.ai/changelog</link><description>Model pricing, new models, providers, and capabilities from the LiteLLM catalog.</description><language>en-us</language><lastBuildDate>${new Date(generatedAt).toUTCString()}</lastBuildDate><atom:link href="${xml(selfUrl)}" rel="self" type="application/rss+xml"/>${items
    .map(
      (item) =>
        `<item><title>${xml(item.title)}</title><link>${xml(item.link)}</link><guid isPermaLink="false">${xml(item.id)}</guid><pubDate>${new Date(item.timestamp).toUTCString()}</pubDate><category>${xml(item.category)}</category><description>${xml(item.body)}</description></item>`,
    )
    .join("")}</channel></rss>\n`;
}
