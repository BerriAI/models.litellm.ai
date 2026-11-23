import { TIERS } from "./lineup.mjs";

const ESC = "\u001b[";

const palette = {
  purple: "38;2;214;137;255",
  muted: "38;2;150;150;165",
  rule: "38;2;77;65;91",
  text: "38;2;232;232;238",
  warning: "38;2;237;196;114",
};

const wordmark = ["█▀█ █▀█ █ █▀ █▀▄▀█", "█▀▀ █▀▄ █ ▄█ █ ▀ █"];

function clean(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .trim();
}

function clip(value, width) {
  const text = [...clean(value)];
  if (text.length <= width) return text.join("");
  if (width < 2) return text.slice(0, width).join("");
  return `${text.slice(0, width - 1).join("")}…`;
}

function cell(value, width, right = false) {
  const text = clip(value, width);
  const padding = " ".repeat(Math.max(0, width - [...text].length));
  return right ? padding + text : text + padding;
}

/** Base token rates in USD per million tokens. */
export function formatPrice(value) {
  if (!Number.isFinite(value) || value < 0) return "?";
  if (value === 0) return "$0";
  if (value < 0.001) return `$${value.toExponential(1)}`;
  return `$${Number(value.toPrecision(4)).toLocaleString("en-US", {
    maximumFractionDigits: 6,
  })}`;
}

/** Compact token counts; exact values remain available in JSON output. */
export function formatTokens(value) {
  if (!Number.isFinite(value) || value <= 0) return "?";
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(2))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}k`;
  return String(value);
}

function feature(value) {
  return value === true ? "✓" : value === false ? "·" : "?";
}

function shortDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "unknown";
  return date.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function columnsFor(width) {
  const columns = [
    { key: "lab", label: "LAB", width: 10 },
    { key: "name", label: "MODEL", width: 16 },
    { key: "input", label: "INPUT", width: 8, right: true },
    { key: "output", label: "OUTPUT", width: 8, right: true },
    { key: "context", label: "CONTEXT", width: 8, right: true },
  ];
  if (width >= 96)
    columns.push({ key: "maxOutput", label: "MAX OUT", width: 8, right: true });
  if (width >= 120)
    columns.push(
      { key: "tools", label: "TOOLS", width: 5, right: true },
      { key: "reason", label: "REASON", width: 6, right: true },
      { key: "vision", label: "VISION", width: 6, right: true },
    );
  const occupied =
    columns.reduce((sum, col) => sum + col.width, 0) + (columns.length - 1) * 2;
  columns[1].width += Math.max(0, Math.min(46, width - occupied));
  return columns;
}

/** Render a terminal-width-aware model table without changing terminal state. */
export function renderTable(models, options) {
  const width = Math.max(1, Math.floor(options.width || 100));
  const paint = (value, tone) =>
    options.color ? `${ESC}${palette[tone]}m${value}${ESC}0m` : value;
  const line = (value = "", tone) => {
    const text = clip(value, width);
    return tone ? paint(text, tone) : text;
  };
  const lines = [""];
  if (width >= 64) {
    lines.push(
      line(`${wordmark[0]}   The model table.`, "purple"),
      line(`${wordmark[1]}   v${options.version}`, "purple"),
    );
  } else {
    lines.push(line(`PRISM  v${options.version}`, "purple"));
  }
  lines.push("", line("Models from LiteLLM · USD / 1M tokens", "muted"), "");

  if (models.length === 0) {
    lines.push(
      line("No models match these filters.", "text"),
      line("Try a model name, --lab google, or --all.", "muted"),
    );
  } else if (width < 58) {
    for (const model of models) {
      lines.push(
        line(model.name, "text"),
        line(model.lab, "purple"),
        line(`Input    ${formatPrice(model.input)}`),
        line(`Output   ${formatPrice(model.output)}`),
        line(`Context  ${formatTokens(model.context)}`),
        "",
      );
    }
  } else {
    const columns = columnsFor(width);
    const tableWidth =
      columns.reduce((sum, col) => sum + col.width, 0) +
      (columns.length - 1) * 2;
    lines.push(
      paint(
        columns.map((col) => cell(col.label, col.width, col.right)).join("  "),
        "muted",
      ),
      paint("─".repeat(tableWidth), "rule"),
    );
    let previousLab = null;
    for (const model of models) {
      if (
        options.groupByLab !== false &&
        previousLab !== null &&
        model.lab !== previousLab
      )
        lines.push("");
      const values = {
        lab: model.lab,
        name: model.name,
        input: formatPrice(model.input),
        output: formatPrice(model.output),
        context: formatTokens(model.context),
        maxOutput: formatTokens(model.maxOutput),
        tools: feature(model.features.tools),
        reason: feature(model.features.reason),
        vision: feature(model.features.vision),
      };
      lines.push(
        columns
          .map((col) => {
            const value = cell(values[col.key], col.width, col.right);
            return paint(value, col.key === "lab" ? "purple" : "text");
          })
          .join("  "),
      );
      previousLab = model.lab;
    }
    lines.push(paint("─".repeat(tableWidth), "rule"));
    if (width >= 120)
      lines.push(line("✓ supported   · unsupported   ? unknown", "muted"));
  }

  lines.push("");
  const count = options.limited
    ? `${models.length} of ${options.total} models · use --all or raise --limit`
    : `${models.length} ${models.length === 1 ? "model" : "models"}`;
  lines.push(line(count, "muted"));
  if (models.length)
    lines.push(line("Base headline prices · sellers in --json", "muted"));
  if (options.stale)
    lines.push(line("Offline · showing saved catalog", "warning"));
  lines.push(
    line(
      `${options.cached ? "Cached" : "Fetched"} ${shortDate(options.fetchedAt)}`,
      "muted",
    ),
  );
  if (options.buildDate)
    lines.push(line(`Catalog built ${options.buildDate}`, "muted"));
  lines.push(line("models.litellm.ai · prism --help", "muted"), "");
  return lines.join("\n");
}

const tierWidths = { xl: 16, l: 10, mp: 10, m: 12, s: 8 };
const lineupTiers = TIERS.map((tier) => ({
  ...tier,
  width: tierWidths[tier.key],
}));

function tierLabel(row, key) {
  return (row.tiers[key] ?? []).map((entry) => clean(entry.label)).join(" / ");
}

/** Wrap compact layouts without hiding a model name or its assigned tier. */
function wrapLine(value, width) {
  const text = clean(value);
  if ([...text].length <= width) return [text];
  const words = text.split(/\s+/);
  const lines = [];
  let pending = "";
  for (const word of words) {
    if (pending && [...`${pending} ${word}`].length <= width) {
      pending += ` ${word}`;
      continue;
    }
    if (pending) lines.push(pending);
    const letters = [...word];
    while (letters.length > width)
      lines.push(letters.splice(0, width).join(""));
    pending = letters.join("");
  }
  if (pending) lines.push(pending);
  return lines;
}

/** The reference's size-tier matrix; the caller supplies live-verified entries. */
export function renderLineup(rows, options) {
  const width = Math.max(1, Math.floor(options.width || 120));
  const paint = (value, tone) =>
    options.color ? `${ESC}${palette[tone]}m${value}${ESC}0m` : value;
  const lines = [""];
  const append = (value, tone = "muted") => {
    for (const part of wrapLine(value, width)) lines.push(paint(part, tone));
  };
  if (width >= 64) {
    lines.push(
      `${paint(wordmark[0], "purple")}   ${paint("Model families, at a glance.", "text")}`,
      `${paint(wordmark[1], "purple")}   ${paint(`v${clean(options.version)}`, "muted")}`,
    );
  } else {
    append(`PRISM  v${options.version}`, "purple");
  }
  lines.push("");

  const columns = [
    { key: "lab", label: "LAB", width: 10 },
    { key: "family", label: "FAMILY", width: 15 },
    ...lineupTiers.map((tier) => ({ ...tier })),
  ];
  for (const column of columns) {
    for (const row of rows) {
      const value =
        column.key === "lab" || column.key === "family"
          ? clean(row[column.key])
          : tierLabel(row, column.key);
      column.width = Math.max(column.width, [...value].length);
    }
  }
  const minimumWidth =
    columns.reduce((sum, column) => sum + column.width, 0) + 18;
  const matrix = width >= minimumWidth;

  if (!rows.length) {
    append("No models match this lineup.", "text");
    append("Try prism without filters, or prism --table --all.");
  } else if (matrix) {
    const extra = Math.max(0, Math.min(width, 120) - minimumWidth);
    for (let i = 0; i < extra; i++) columns[2 + (i % 5)].width += 1;
    const tableWidth =
      columns.reduce((sum, column) => sum + column.width, 0) + 18;
    lines.push(
      columns
        .map((column) =>
          paint(
            cell(column.label, column.width),
            column.key === "lab" || column.key === "family"
              ? "muted"
              : "purple",
          ),
        )
        .join("   "),
    );
    lines.push(paint("─".repeat(tableWidth), "rule"));
    let previousLab = null;
    for (const row of rows) {
      const newLab = row.lab !== previousLab;
      if (previousLab !== null && newLab) lines.push("");
      lines.push(
        columns
          .map((column) => {
            const value =
              column.key === "lab"
                ? newLab
                  ? row.lab
                  : ""
                : column.key === "family"
                  ? row.family
                  : tierLabel(row, column.key);
            const tone =
              column.key === "lab"
                ? "purple"
                : column.key === "family"
                  ? "muted"
                  : "text";
            return paint(cell(value, column.width), tone);
          })
          .join("   "),
      );
      previousLab = row.lab;
    }
    lines.push(paint("─".repeat(tableWidth), "rule"));
  } else {
    let previousLab = null;
    for (const row of rows) {
      if (row.lab !== previousLab) {
        if (previousLab !== null) lines.push("");
        append(row.lab, "purple");
      }
      append(row.family);
      for (const tier of lineupTiers) {
        const value = tierLabel(row, tier.key);
        if (!value) continue;
        append(`${tier.label}  ${value}`, "text");
      }
      lines.push("");
      previousLab = row.lab;
    }
    if (lines.at(-1) === "") lines.pop();
  }

  const count = rows.reduce(
    (sum, row) =>
      sum +
      lineupTiers.reduce(
        (tierSum, tier) => tierSum + (row.tiers[tier.key]?.length ?? 0),
        0,
      ),
    0,
  );
  const labs = new Set(rows.map((row) => row.lab)).size;
  lines.push("");
  append(
    `${count} ${count === 1 ? "model" : "models"} · ${labs} ${labs === 1 ? "lab" : "labs"}`,
  );
  append("Curated size tiers · models from LiteLLM");
  if (options.stale) append("Saved catalog · refresh unavailable", "warning");
  append(
    `${options.cached ? "Cached" : "Fetched"} ${shortDate(options.fetchedAt)}`,
  );
  append("prism --table  prices & context");
  lines.push("");
  return lines.join("\n");
}
