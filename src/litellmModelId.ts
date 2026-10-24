/** A copyable catalog identifier, never an endpoint URL or a command. */
export function parseLiteLLMModelId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._/@:+-]{0,511}$/.test(id) &&
    !id.includes("://")
    ? id
    : null;
}

type CatalogRoute = { modelString: string; deprecation?: string };
/** Pricing may be absent; an active catalog route is still a valid copy target. */
export function catalogModelId(
  model: {
    headline?: CatalogRoute | null;
    rows?: readonly CatalogRoute[];
    status?: string;
  },
  today = new Date().toISOString().slice(0, 10),
): string | null {
  if (model.status === "retired") return null;
  for (const row of [model.headline, ...(model.rows ?? [])]) {
    if (!row || (row.deprecation && row.deprecation <= today)) continue;
    const id = parseLiteLLMModelId(row.modelString);
    if (id) return id;
  }
  return null;
}
