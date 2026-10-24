export type SearchIntent = {
  query: string;
  freeOnly: boolean;
  providers?: string[];
  title?: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  modelSearch?: boolean;
};

/** Interpret navigation and price requests separately from model names. */
export function searchIntent(rawQuery: string): SearchIntent {
  const query = rawQuery.trim();
  const normalized = query.toLowerCase().replace(/[\s_-]+/g, " ");
  if (/^(fre|free|zero cost|\$0)( models?)?$/.test(normalized)) {
    return {
      query: "",
      freeOnly: true,
      title: "Models with zero listed prices",
      description:
        "Explicit zero prices only. Unknown prices are excluded; hosting and other charges may still apply.",
    };
  }
  if (normalized === "openrouter") {
    return {
      query: "",
      freeOnly: false,
      providers: ["openrouter"],
      title: "OpenRouter",
      description: "Model listings served through OpenRouter.",
      href: "https://docs.litellm.ai/docs/providers/openrouter",
      linkLabel: "Provider setup",
    };
  }
  if (normalized === "ollama" || normalized === "ollama chat") {
    return {
      query: "",
      freeOnly: false,
      providers: ["ollama", "ollama_chat"],
      title: "Ollama",
      description:
        "Ollama catalog entries. Use the provider guide to configure ollama_chat.",
      href: "https://docs.litellm.ai/docs/providers/ollama",
      linkLabel: "Provider setup",
    };
  }
  if (normalized === "opencode") {
    return {
      query: "",
      freeOnly: false,
      modelSearch: false,
      title: "Looking for OpenCode?",
      description:
        "OpenCode is a coding tool. Browse setup guides, then search for the model you want to use.",
      href: "/cookbook",
      linkLabel: "Browse tool guides",
    };
  }
  if (normalized === "litellm" || normalized === "lite llm") {
    return {
      query: "",
      freeOnly: false,
      title: "The LiteLLM model catalog",
      description:
        "Browse model pricing below, or explore provider and endpoint integrations.",
      href: "/providers",
      linkLabel: "Browse integrations",
    };
  }
  return { query, freeOnly: false };
}

function numericPrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pricesIn(value: unknown): number[] {
  const price = numericPrice(value);
  if (price !== null) return [price];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(pricesIn);
}

/** A missing price is never interpreted as zero. Check non-token charges too. */
export function hasZeroListedPrice(item: Record<string, unknown>): boolean {
  const prices: number[] = [];
  let inputKnown = false;
  let outputKnown = false;
  for (const [key, value] of Object.entries(item)) {
    if (!/(^|_)cost(_|$)/.test(key)) continue;
    const amounts = pricesIn(value);
    prices.push(...amounts);
    if (amounts.length && key.startsWith("input_cost_")) inputKnown = true;
    if (amounts.length && key.startsWith("output_cost_")) outputKnown = true;
  }
  const slots = item.pricing_slots;
  if (slots && typeof slots === "object") {
    for (const [name, value] of Object.entries(slots)) {
      if (!value || typeof value !== "object") continue;
      const amount = numericPrice(
        (value as { amount_usd?: unknown }).amount_usd,
      );
      if (amount === null) continue;
      prices.push(amount);
      if (name === "input") inputKnown = true;
      if (name === "output") outputKnown = true;
    }
  }
  const coverageKnown =
    item.mode === "embedding"
      ? inputKnown
      : ["image_generation", "image_edit", "audio_speech"].includes(
            String(item.mode),
          )
        ? outputKnown
        : inputKnown && outputKnown;
  return (
    coverageKnown && prices.length > 0 && prices.every((price) => price === 0)
  );
}
