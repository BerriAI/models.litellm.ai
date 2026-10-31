/** Fictional events for the Discover design preview. Never a source of catalog truth. */
export type UpdateKind =
  | "price"
  | "model"
  | "provider"
  | "capability"
  | "deprecation";
export interface CatalogUpdate {
  id: string;
  date: string;
  kind: UpdateKind;
  provider: string;
  model?: string;
  title: string;
  description: string;
  facts?: string[];
  prices?: { label: string; before: number; after: number }[];
}

export const updateKinds: {
  id: UpdateKind | "all";
  label: string;
  icon: string;
}[] = [
  { id: "all", label: "All updates", icon: "≡" },
  { id: "price", label: "Pricing", icon: "↗" },
  { id: "model", label: "New models", icon: "+" },
  { id: "provider", label: "New providers", icon: "◇" },
  { id: "capability", label: "Capabilities", icon: "✳" },
  { id: "deprecation", label: "Deprecations", icon: "−" },
];

export const mockUpdates: CatalogUpdate[] = [
  {
    id: "deepseek-price",
    date: "2026-10-30",
    kind: "price",
    provider: "deepseek",
    model: "DeepSeek V3",
    title: "DeepSeek V3 is now 50% cheaper on DeepSeek",
    description: "Both input and output token prices decreased.",
    prices: [
      { label: "Input", before: 0.28, after: 0.14 },
      { label: "Output", before: 1.1, after: 0.55 },
    ],
  },
  {
    id: "sonnet-model",
    date: "2026-10-30",
    kind: "model",
    provider: "anthropic",
    model: "Claude Sonnet 4.5",
    title: "Claude Sonnet 4.5 added to Anthropic",
    description:
      "A new chat model joins the catalog with vision, reasoning, and tool calling.",
    facts: ["200K context", "Text + image input", "Tool calling"],
  },
  {
    id: "cerebras-provider",
    date: "2026-10-30",
    kind: "provider",
    provider: "cerebras",
    title: "Cerebras joins the provider catalog",
    description:
      "A new inference provider, available through the same LiteLLM interface.",
    facts: ["Chat completions", "Streaming", "OpenAI-compatible"],
  },
  {
    id: "gpt-price",
    date: "2026-10-29",
    kind: "price",
    provider: "azure",
    model: "GPT-4.1",
    title: "GPT-4.1 input pricing increased 20% on Azure OpenAI",
    description: "Input tokens cost more. Output pricing is unchanged.",
    prices: [
      { label: "Input", before: 2, after: 2.4 },
      { label: "Output", before: 8, after: 8 },
    ],
  },
  {
    id: "gemini-context",
    date: "2026-10-29",
    kind: "capability",
    provider: "gemini",
    model: "Gemini 2.5 Flash",
    title: "More room for context in Gemini 2.5 Flash",
    description:
      "The catalog's maximum input context increased on Google AI Studio.",
    facts: ["128K → 1M input tokens", "Context window updated"],
  },
  {
    id: "llama-groq",
    date: "2026-10-29",
    kind: "model",
    provider: "groq",
    model: "Llama 3.3 70B",
    title: "Llama 3.3 70B is now available on Groq",
    description:
      "An existing model gets a new provider listing and another deployment option.",
    facts: ["New provider listing", "128K context", "Tool calling"],
  },
  {
    id: "haiku-retirement",
    date: "2026-10-29",
    kind: "deprecation",
    provider: "anthropic",
    model: "Claude 3 Haiku",
    title: "Claude 3 Haiku marked for retirement on Anthropic",
    description:
      "A retirement notice was added to the catalog. Review affected deployments before the effective date.",
    facts: ["Effective Dec 1, 2026", "Migration required"],
  },
  {
    id: "gemini-price",
    date: "2026-10-28",
    kind: "price",
    provider: "vertex_ai",
    model: "Gemini 2.5 Flash",
    title: "Gemini 2.5 Flash output pricing decreased 25% on Vertex AI",
    description: "Lower output token pricing; input pricing stays the same.",
    prices: [
      { label: "Input", before: 0.3, after: 0.3 },
      { label: "Output", before: 2, after: 1.5 },
    ],
  },
  {
    id: "mistral-tools",
    date: "2026-10-28",
    kind: "capability",
    provider: "mistral",
    model: "Mistral Small",
    title: "Mistral Small adds structured output support",
    description:
      "JSON schema responses are now listed as supported on Mistral AI.",
    facts: ["Structured outputs", "JSON schema"],
  },
  {
    id: "together-model",
    date: "2026-10-28",
    kind: "model",
    provider: "together_ai",
    model: "DeepSeek V3",
    title: "DeepSeek V3 added to Together AI",
    description:
      "Another provider option for the same model, with its own pricing and limits.",
    facts: ["New provider listing", "128K context"],
  },
  {
    id: "fireworks-cache",
    date: "2026-10-27",
    kind: "capability",
    provider: "fireworks_ai",
    model: "DeepSeek V3",
    title: "Prompt caching added for DeepSeek V3 on Fireworks AI",
    description:
      "The provider listing now includes support for cached input tokens.",
    facts: ["Prompt caching", "Provider capability updated"],
  },
  {
    id: "groq-price",
    date: "2026-10-27",
    kind: "price",
    provider: "groq",
    model: "Llama 3.3 70B",
    title: "Llama 3.3 70B input pricing decreased 25% on Groq",
    description: "A lower input rate for this provider listing.",
    prices: [
      { label: "Input", before: 0.8, after: 0.6 },
      { label: "Output", before: 0.8, after: 0.8 },
    ],
  },
];
