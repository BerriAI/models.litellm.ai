import { reportedCapabilities } from "../src/modelCapabilities.js";
import type { Snapshot, Row } from "./catalog.js";
import type { QueryResult } from "./query.js";
import type { AnswerView } from "../src/aiViews.js";
import { getProviderDisplayName } from "../src/providerNames.js";
import {
  displayChatInputCost,
  displayChatOutputCost,
  isImagePricingMode,
  tableImageInputCost,
  tableImageOutputCost,
} from "../src/modelPresentation.js";

export const viewSchema = {
  type: "object",
  description:
    "Optional visual of this query result, displayed directly in chat. Omit for research-only queries. No HTML or manually authored data.",
  properties: {
    type: { type: "string", enum: ["model_cards", "bar", "line", "scatter"] },
    title: {
      type: "string",
      description: "Short title describing the actual selection.",
    },
    x: {
      type: "string",
      description:
        "Result column for labels (bar), numeric/date x (line), or numeric x (scatter).",
    },
    y: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 4,
      description:
        "Numeric result columns sharing the same units. The user can switch between them. Use readable SQL aliases.",
    },
    label: {
      type: "string",
      description:
        "Optional result column identifying each scatter/line point, e.g. model name.",
    },
    x_label: {
      type: "string",
      description: "X-axis meaning, including units if numeric.",
    },
    y_label: {
      type: "string",
      description: "Y-axis meaning and units, e.g. USD per 1M tokens.",
    },
  },
  required: ["type", "title"],
  additionalProperties: false,
};
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 240;
const fail = (message: string): never => {
  throw new Error(message);
};

/** Resolve cards from authoritative records, and charts from actual SQL rows. */
export function answerView(
  value: unknown,
  result: QueryResult,
  snapshot: Snapshot,
): AnswerView {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("view must be an object");
  const view = value as Record<string, unknown>;
  if (
    Object.keys(view).some(
      (k) =>
        !["type", "title", "x", "y", "label", "x_label", "y_label"].includes(k),
    ) ||
    !text(view.title)
  )
    return fail("Use a short title and only the documented view fields");
  const rows = result.rows;
  if (!rows?.length)
    return fail("No rows to display; answer in prose or revise the query");
  if (view.type === "model_cards") {
    if (rows.length > 12 || result.has_more)
      return fail(
        "Select at most 12 model cards with a deliberate SQL LIMIT, or use a table",
      );
    const models = rows.map((row) => {
      const model = snapshot.tables.models.rows.find(
        (m) => typeof row.id === "string" && m.id === row.id,
      );
      if (!model)
        return fail(
          "Model cards require an id column matching models.id exactly",
        );
      const id = String(model.id);
      const canonical = snapshot.tables.catalog.rows.find(
        (c) => c.modelId === id,
      );
      const provider =
        typeof model.litellm_provider === "string"
          ? model.litellm_provider
          : "";
      const image = isImagePricingMode(String(model.mode ?? ""));
      return {
        id,
        name: String(model.display_name || canonical?.name || id),
        provider: provider
          ? getProviderDisplayName(provider)
          : "Provider not listed",
        href:
          typeof canonical?.slug === "string" &&
          /^[a-z0-9][a-z0-9._-]*$/.test(canonical.slug)
            ? `/models/${canonical.slug}`
            : `/?q=${encodeURIComponent(id)}`,
        input: image ? tableImageInputCost(model) : displayChatInputCost(model),
        output: image
          ? tableImageOutputCost(model)
          : displayChatOutputCost(model),
        context: finite(model.max_input_tokens) ? model.max_input_tokens : null,
        capabilities: reportedCapabilities(model),
      };
    });
    if (new Set(models.map((m) => m.id)).size !== models.length)
      return fail("Select distinct model ids for cards");
    return { type: "model_cards", title: view.title, models };
  }
  if (
    !["bar", "line", "scatter"].includes(String(view.type)) ||
    !text(view.x) ||
    !text(view.x_label) ||
    !text(view.y_label) ||
    !Array.isArray(view.y) ||
    !view.y.length ||
    view.y.length > 4 ||
    !view.y.every(text) ||
    (view.label !== undefined && !text(view.label))
  )
    return fail(
      "Charts need a supported type, x column, 1–4 y columns, and explicit x_label/y_label units",
    );
  const x = view.x,
    y = view.y as string[],
    label = view.label as string | undefined;
  const numericX = (row: Row, index: number) => {
    const raw = row[x];
    if (view.type === "bar") return index;
    if (finite(raw)) return raw;
    if (
      view.type === "line" &&
      typeof raw === "string" &&
      /^\d{4}-\d{2}(?:-\d{2})?$/.test(raw)
    ) {
      const date = raw.length === 7 ? `${raw}-01` : raw;
      const parsed = Date.parse(`${date}T00:00:00Z`);
      if (
        Number.isFinite(parsed) &&
        new Date(parsed).toISOString().startsWith(date)
      )
        return parsed;
    }
    return fail(
      "Line x must be numbers or ISO dates; scatter x must be numeric. Unknown x values need an explicit SQL filter.",
    );
  };
  const points = rows.map((row, index) => {
    if (
      row[x] == null ||
      (typeof row[x] !== "string" && !finite(row[x])) ||
      (label && row[label] == null)
    )
      return fail("Every point needs an existing, non-null x/label column");
    return {
      label: String(label ? row[label] : row[x]),
      x: numericX(row, index),
      xValue: row[x] as string | number,
    };
  });
  if (
    view.type === "line" &&
    points.some((p, i) => i > 0 && p.x <= points[i - 1].x)
  )
    return fail(
      "Line charts require unique x values sorted ascending; aggregate duplicate dates in SQL",
    );
  const series = y.map((name) => ({
    name,
    points: rows.map((row, index) => {
      if (!(name in row) || (row[name] !== null && !finite(row[name])))
        return fail(
          "Y columns must exist and contain finite numbers or NULL for unknown values",
        );
      return { ...points[index], y: row[name] as number | null };
    }),
  }));
  if (series.some((s) => s.points.every((p) => p.y === null)))
    return fail("Each series needs at least one known numeric value");
  return {
    type: view.type as "bar" | "line" | "scatter",
    title: view.title,
    xLabel: view.x_label,
    yLabel: view.y_label,
    series,
    hasMore: !!result.has_more,
  };
}
