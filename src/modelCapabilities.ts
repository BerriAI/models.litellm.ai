/** Use reported catalog fields so new capabilities need no UI release. */
export function capabilityLabel(key: string): string {
  const labels: Record<string, string> = {
    supports_function_calling: "Tool calling",
    supports_parallel_function_calling: "Parallel tool calling",
    supports_response_schema: "Structured output",
  };
  return (
    labels[key] ??
    key
      .replace(/^supports_/, "")
      .replace(/_/g, " ")
      .replace(/\b(pdf|url|json|xml)\b/g, (word) => word.toUpperCase())
      .replace(/^./, (letter) => letter.toUpperCase())
  );
}

export function reportedCapabilities(model: Record<string, unknown>) {
  return Object.entries(model)
    .filter(
      ([key, value]) =>
        key.startsWith("supports_") &&
        (typeof value === "boolean" || value === 0 || value === 1),
    )
    .map(([key, value]) => ({
      key,
      label: capabilityLabel(key),
      supported: value === true || value === 1,
    }));
}

export function catalogCapabilities(
  models: readonly Record<string, unknown>[],
) {
  const common = [
    "supports_function_calling",
    "supports_reasoning",
    "supports_response_schema",
    "supports_vision",
    "supports_prompt_caching",
    "supports_web_search",
    "supports_computer_use",
    "supports_parallel_function_calling",
  ];
  const rank = (key: string) =>
    common.includes(key) ? common.indexOf(key) : common.length;
  const keys = new Set(
    models.flatMap((model) =>
      reportedCapabilities(model).map(({ key }) => key),
    ),
  );
  return [...keys]
    .map((key) => ({ key, label: capabilityLabel(key) }))
    .sort(
      (a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label),
    );
}
