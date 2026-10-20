/**
 * Markdown copy of each model page for AI agents (served at /models/<slug>.md
 * and for `Accept: text/markdown`). Unlike most catalogs' agent views, it
 * carries the prices, context window, providers and FAQ.
 */
import { getLiteLLmSdkSnippet } from "../../src/modelPresentation";
import type { PageCopy } from "./copy";
import { int, longDate, tokensShort, unescapeHtml, usd } from "./format";
import type { ModelView } from "./model-view";
import { PRICE_FILE_URL, abs, modelPath } from "./site";
import { comparePath } from "./compare";
import { CALC_DEFAULTS, calcCost, calcMoney, onCalculator } from "./calculator";
import { leadsWithTokens } from "./pricing";
import type { CompareView, NewModelRow, RankRow } from "./html";

const cell = (n: number | undefined) => (n === undefined ? "–" : usd(n));
const pipe = (s: string) => s.replace(/\|/g, "\\|");

export function modelMarkdown(
  v: ModelView,
  copy: PageCopy,
  lastChanged: string,
  successor: { name: string; slug: string } | null = null,
): string {
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
  if (v.status === "retired") {
    const next = successor ? ` Its successor is ${successor.name}: ${abs(modelPath(successor.slug))}` : "";
    lines.push(`- Status: retired. Prices below are the last listed and kept for reference.${next}`);
  }
  if (v.intro) lines.push(`- Introductory price until: ${longDate(v.intro.until)} (source: ${v.intro.source})`);
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
  if (h && leadsWithTokens(h.mode, h.prices, h.metric) && h.prices.input !== undefined && h.prices.output !== undefined && !v.free) {
    const d = CALC_DEFAULTS;
    const r = calcCost(h.prices.input, h.prices.output, d.input, d.output, d.requests);
    lines.push(
      "## Cost calculator",
      "",
      `${d.requests.toLocaleString("en-US")} requests a day with ${d.input.toLocaleString("en-US")} input and ${d.output.toLocaleString("en-US")} output tokens each, at ${h.providerName}'s price: ${calcMoney(r.perRequest)} per request, ${calcMoney(r.perDay)} per day, ${calcMoney(r.perMonth)} per month (30 days).${onCalculator(v) ? ` Try other numbers at ${abs(`/calculator?model=${v.slug}`)}` : ""}`,
      "",
    );
  }

  lines.push("## FAQ", "");
  for (const f of copy.faq) lines.push(`### ${f.q}`, "", f.a, "");
  lines.push(`Source: LiteLLM model price file, ${PRICE_FILE_URL}. Maintainers update it from each provider's published pricing, and this page is usually rebuilt within 20 minutes of every change.`, "");
  return lines.join("\n");
}

/** Markdown copy of a comparison page, served at /compare/<slug>.md and for `Accept: text/markdown`. */
export function compareMarkdown(c: CompareView): string {
  const { a, b, copy } = c;
  const strip = (s: string) => unescapeHtml(s.replace(/<[^>]+>/g, ""));
  const lines = [`# ${copy.h1}`, "", `As of ${longDate(c.buildDate)}, ${copy.answer}`, ""];
  lines.push(`- Page: ${abs(comparePath(c.slug))}`, `- ${a.name}: ${abs(modelPath(a.slug))}`, `- ${b.name}: ${abs(modelPath(b.slug))}`, "");
  lines.push("## Side by side", "", `| | ${pipe(a.name)} | ${pipe(b.name)} |`, "|---|---|---|");
  for (const [k, x, y] of c.rows) lines.push(`| ${pipe(k)} | ${pipe(strip(x))} | ${pipe(strip(y))} |`);
  lines.push("", "Headline prices in USD per 1M tokens, from LiteLLM's model price file.", "");
  const cheapest = c.cheapest.filter((x) => x.row);
  if (cheapest.length) {
    lines.push("## Cheapest provider for each", "");
    for (const { model, row } of cheapest) lines.push(`- ${model.name}: ${row!.providerName} at ${usd(row!.prices.input!)} input per 1M tokens (\`${row!.modelString}\`)`);
    lines.push("");
  }
  if (c.bench.length) {
    lines.push("## Benchmark scores", "", `| Benchmark | ${pipe(a.name)} | ${pipe(b.name)} |`, "|---|---|---|");
    for (const r of c.bench) lines.push(`| ${pipe(r.name)} (${r.category}) | ${r.a} | ${r.b} |`);
    const asOf = c.benchDate ? `, data as of ${longDate(c.benchDate)}` : "";
    lines.push("", `From the Epoch AI Benchmarking Hub (https://epoch.ai/benchmarks), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)${asOf}: Epoch's own runs and results it collects from each benchmark's leaderboard. Higher is better.`, "");
  }
  if (copy.pickA.length || copy.pickB.length) {
    lines.push("## When to pick which", "");
    for (const [m, list] of [[a, copy.pickA], [b, copy.pickB]] as const) for (const x of list) lines.push(`- ${m.name}: ${x}`);
    lines.push("");
  }
  lines.push("## FAQ", "");
  for (const f of copy.faq) lines.push(`### ${f.q}`, "", f.a, "");
  return lines.join("\n");
}

/** Markdown copy of a ranking page. */
export function rankingMarkdown(r: { h1: string; answer: string; method: string; measure: string; path: string; rows: RankRow[] }): string {
  const lines = [`# ${r.h1}`, "", r.answer, "", `- Page: ${abs(r.path)}`, `- How it's sorted: ${r.method}`, "", `| # | Model | Lab | ${pipe(r.measure)} | Price per 1M (in / out) | Context | Providers |`, "|---|---|---|---|---|---|---|"];
  for (const x of r.rows) lines.push(`| ${x.rank} | [${pipe(x.name)}](${abs(modelPath(x.slug))}) | ${pipe(x.lab ?? "–")} | ${x.display} | ${pipe(x.price ?? "–")} | ${x.context ? tokensShort(x.context) : "–"} | ${x.providers} |`);
  return `${lines.join("\n")}\n`;
}

/** Markdown copy of a month of new models. */
export function newModelsMarkdown(title: string, path: string, rows: NewModelRow[]): string {
  const lines = [`# ${title}`, "", `- Page: ${abs(path)}`, "", "| Added | Model | Lab | Price | Context | Providers |", "|---|---|---|---|---|---|"];
  for (const r of rows) lines.push(`| ${r.date} | [${pipe(r.name)}](${abs(modelPath(r.slug))}) | ${pipe(r.lab ?? "–")} | ${pipe(r.price ?? "–")} | ${r.context ? tokensShort(r.context) : "–"} | ${r.providers} |`);
  return `${lines.join("\n")}\n`;
}
