/**
 * Markdown copy of each model page for AI agents (served at /models/<slug>.md
 * and for `Accept: text/markdown`). Unlike most catalogs' agent views, it
 * carries the prices, context window, providers and FAQ.
 */
import { getLiteLLmSdkSnippet } from "../../src/modelPresentation";
import type { PageCopy } from "./copy";
import { int, longDate, tokensShort, usd } from "./format";
import type { ModelView } from "./model-view";
import { PRICE_FILE_URL, abs, modelPath } from "./site";

const cell = (n: number | undefined) => (n === undefined ? "–" : usd(n));
const pipe = (s: string) => s.replace(/\|/g, "\\|");

export function modelMarkdown(v: ModelView, copy: PageCopy, lastChanged: string): string {
  const h = v.headline;
  const lines: string[] = [];
  lines.push(`# ${copy.h1}`, "", copy.answer, "");
  lines.push(`- Page: ${abs(modelPath(v.slug))}`);
  if (v.lab) lines.push(`- Lab: ${v.lab}`);
  if (h) lines.push(`- LiteLLM model name: \`${h.modelString}\``);
  if (v.context) lines.push(`- Context window: ${int(v.context)} tokens`);
  if (v.maxOutput) lines.push(`- Max output: ${int(v.maxOutput)} tokens`);
  if (v.addedDate) lines.push(`- Added to LiteLLM: ${longDate(v.addedDate)}`);
  if (v.deprecation) lines.push(`- Deprecation date: ${longDate(v.deprecation)}`);
  lines.push(`- Prices updated: ${longDate(lastChanged)}`, "");

  lines.push("## Pricing by provider", "", "Token prices in USD per 1M tokens.", "");
  lines.push("| Provider | Model name | Input | Output | Cache read | Per image | Per second | Context |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const r of v.rows.slice(0, 60)) {
    const who = r.qualifier ? `${r.providerName} (${r.qualifier})` : r.providerName;
    lines.push(
      `| ${pipe(who)}${r.outlier ? " †" : ""} | \`${pipe(r.modelString)}\` | ${cell(r.prices.input)} | ${cell(r.prices.output)} | ${cell(r.prices.cacheRead)} | ${cell(r.prices.perImage)} | ${cell(r.prices.perSecond)} | ${r.context ? tokensShort(r.context) : "–"} |`,
    );
  }
  if (v.rows.length > 60) lines.push("", `${v.rows.length - 60} more listings on the page.`);
  if (v.rows.some((r) => r.outlier)) lines.push("", "† Differs from other providers by more than 8x; check the provider's pricing page.");
  lines.push("");

  if (copy.examples.length) {
    lines.push("## Cost examples", "");
    for (const ex of copy.examples) {
      lines.push(`${ex.label}:`, "");
      for (const row of ex.rows) lines.push(`- ${row.who}: ${usd(Number(row.cost.toPrecision(4)))}`);
      lines.push("");
    }
  }

  if (v.capabilities.length) {
    lines.push("## Features", "");
    lines.push(`Supported: ${v.capabilities.filter((c) => c.supported).map((c) => c.label).join(", ") || "none listed"}.`);
    const no = v.capabilities.filter((c) => !c.supported).map((c) => c.label);
    if (no.length) lines.push(`Not supported: ${no.join(", ")}.`);
    lines.push("");
  }

  if (h) {
    lines.push("## Use it with LiteLLM", "", "```python", getLiteLLmSdkSnippet(h.mode, h.modelString), "```", "");
  }

  lines.push("## FAQ", "");
  for (const f of copy.faq) lines.push(`### ${f.q}`, "", f.a, "");
  lines.push(`Source: LiteLLM model price file, ${PRICE_FILE_URL}. Maintainers update it from each provider's published pricing, and this page is rebuilt within about 30 minutes of every change.`, "");
  return lines.join("\n");
}
