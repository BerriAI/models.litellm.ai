#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { loadCatalog, selectModels } from "../lib/catalog.mjs";
import { renderTable, renderLineup } from "../lib/render.mjs";
import { buildLineup } from "../lib/lineup.mjs";

// Commands such as `prism --json | head` may close the pipe early.
process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

const { version } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const help = `Prism ${version} · The LiteLLM model table in your terminal.

Usage: prism [search] [options]

  prism                         Model families by size: XL, L, M+, M, S/XS
  prism --table                 Recent models with pricing, context and capabilities
  prism sonnet                  Search active text models across all labs
  prism --lab anthropic         All active Anthropic text models
  prism --all --sort input      All labs, lowest input price first

Options:
      --table                    Show the detailed model table
  -l, --lab <name>               Filter by lab; repeat or separate with commas
      --all                      Include all labs and older models
      --limit <n>                Show at most n models per lab (newest first)
      --sort <field>             name, input, output, context, newest
      --json                     Machine-readable data, including seller and source
      --refresh                  Fetch fresh data (cache lasts one hour)
      --offline                  Use the saved catalog without a network request
      --no-color                 Disable terminal colors (also respects NO_COLOR)
  -h, --help                     Show help
  -v, --version                  Show version

Prices: USD per 1M tokens, from models.litellm.ai. No API key required.
Size tiers follow a curated layout; each model must exist in the active catalog.
Search, lab, sort and limit options open the detailed table. --limit applies before --sort.
`;

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      lab: { type: "string", short: "l", multiple: true },
      all: { type: "boolean" },
      table: { type: "boolean" },
      limit: { type: "string" },
      sort: { type: "string" },
      json: { type: "boolean" },
      refresh: { type: "boolean" },
      offline: { type: "boolean" },
      "no-color": { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  if (values.help) process.stdout.write(help);
  else if (values.version) process.stdout.write(`${version}\n`);
  else {
    if (values.refresh && values.offline)
      throw new Error("Use either --refresh or --offline.");
    if (
      values.sort &&
      !["name", "input", "output", "context", "newest"].includes(values.sort)
    )
      throw new Error(
        "--sort must be name, input, output, context, or newest.",
      );
    if (
      values.limit !== undefined &&
      (!/^[1-9]\d*$/.test(values.limit) ||
        !Number.isSafeInteger(Number(values.limit)))
    )
      throw new Error("--limit must be a positive whole number.");
    const labs = (values.lab || [])
      .flatMap((lab) => lab.split(","))
      .map((lab) => lab.trim())
      .filter(Boolean);
    if (values.lab && !labs.length) throw new Error("--lab needs a lab name.");
    const catalog = await loadCatalog({
      refresh: values.refresh,
      offline: values.offline,
    });
    const selection = selectModels(catalog.models, {
      labs,
      query: positionals.join(" "),
      all: values.all,
      limit: values.limit === undefined ? undefined : Number(values.limit),
      sort: values.sort,
    });
    const lineup =
      !values.table &&
      !values.all &&
      !labs.length &&
      !positionals.length &&
      values.sort === undefined &&
      values.limit === undefined
        ? buildLineup(catalog.models)
        : null;
    const displayed = lineup
      ? {
          models: lineup.flatMap((row) =>
            Object.values(row.tiers).flatMap((entries) =>
              entries.map((entry) => entry.model),
            ),
          ),
          total: lineup.reduce(
            (sum, row) => sum + Object.values(row.tiers).flat().length,
            0,
          ),
          limited: false,
        }
      : selection;
    if (values.json) {
      process.stdout.write(
        `${JSON.stringify({ source: "https://models.litellm.ai", pricingUnit: "USD per 1M tokens", buildDate: catalog.buildDate, fetchedAt: catalog.fetchedAt, cached: catalog.cached, stale: catalog.stale, view: lineup ? "lineup" : "table", ...(lineup ? { tiers: "curated", rows: lineup } : {}), ...displayed }, null, 2)}\n`,
      );
    } else {
      process.stdout.write(
        (lineup ? renderLineup : renderTable)(lineup || selection.models, {
          ...catalog,
          ...displayed,
          color: Boolean(
            process.stdout.isTTY &&
              !("NO_COLOR" in process.env) &&
              !values["no-color"] &&
              process.env.TERM !== "dumb",
          ),
          width: process.stdout.columns || 120,
          version,
          groupByLab: !values.sort,
        }),
      );
    }
  }
} catch (error) {
  process.stderr.write(
    `prism: ${error instanceof Error ? error.message : "Something went wrong."}\nRun prism --help for usage.\n`,
  );
  process.exitCode = 1;
}
