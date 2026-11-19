/** Data-only answer views shared by the query tool and the chat renderer. */
export type ModelCard = {
  id: string;
  name: string;
  provider: string;
  href: string;
  input: string;
  output: string;
  context: number | null;
  capabilities: { key: string; label: string; supported: boolean }[];
};
export type ChartPoint = {
  label: string;
  x: number;
  xValue: string | number;
  y: number | null;
};
export type AnswerView =
  | { type: "model_cards"; title: string; models: ModelCard[] }
  | {
      type: "bar" | "line" | "scatter";
      title: string;
      xLabel: string;
      yLabel: string;
      series: { name: string; points: ChartPoint[] }[];
      hasMore: boolean;
    };

export function viewText(view: AnswerView): string {
  const cell = (value: unknown) =>
    String(value)
      .replace(/\|/g, "\\|")
      .replace(/[\r\n]+/g, " ");
  if (view.type === "model_cards")
    return [
      view.title,
      "Listed base rates. Pricing tiers and other charges may apply.",
      ...view.models.map(
        (m) =>
          `${m.name} (${m.provider})\n${m.id}\nInput: ${m.input}; output: ${m.output}\nInput context: ${m.context?.toLocaleString("en-US") ?? "Unknown"} tokens${m.capabilities.length ? `\n${m.capabilities.map((c) => `${c.label}: ${c.supported ? "Yes" : "No"}`).join(", ")}` : ""}`,
      ),
    ].join("\n\n");
  const labels = view.series[0].points.some(
    (p) => p.label !== String(p.xValue),
  );
  const headers = [
    ...(labels ? ["Label"] : []),
    view.xLabel,
    ...view.series.map((s) => viewLabel(s.name)),
  ];
  return [
    view.title,
    `${view.xLabel}; ${view.yLabel}`,
    `| ${headers.map(cell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...view.series[0].points.map(
      (point, index) =>
        `| ${[...(labels ? [point.label] : []), point.xValue, ...view.series.map((s) => s.points[index].y ?? "Unknown")].map(cell).join(" | ")} |`,
    ),
    ...(view.hasMore ? ["More query results are available."] : []),
  ].join("\n");
}

export function viewLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b(usd|pdf|url|json)\b/gi, (word) => word.toUpperCase())
    .replace(/^./, (letter) => letter.toUpperCase());
}
