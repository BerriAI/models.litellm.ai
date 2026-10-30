import providerLogos from "./providerLogos.json";

/**
 * Shared provider display names, logos and initials
 */

/** Names people search for, which beat the docs labels like "AWS - Bedrock (`bedrock`)". */
export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google AI Studio",
  vertex_ai: "Google Vertex AI",
  bedrock: "Amazon Bedrock",
  bedrock_converse: "Bedrock Converse",
  bedrock_mantle: "Amazon Bedrock Mantle",
  sagemaker: "Amazon SageMaker",
  azure: "Azure OpenAI",
  azure_ai: "Azure AI Foundry",
  openrouter: "OpenRouter",
  huggingface: "Hugging Face",
  cohere_chat: "Cohere Chat",
  "text-completion-openai": "OpenAI Text Completion",
  "text-completion-codestral": "Codestral Text Completion",
  together_ai: "Together AI",
  fireworks_ai: "Fireworks AI",
  deepseek: "DeepSeek",
  xai: "xAI",
  mistral: "Mistral AI",
  groq: "Groq",
  cerebras: "Cerebras",
  databricks: "Databricks",
  perplexity: "Perplexity",
  fal_ai: "fal",
  moonshot: "Moonshot AI",
  dashscope: "Alibaba Cloud Model Studio",
  deepinfra: "DeepInfra",
  novita: "Novita AI",
  vercel_ai_gateway: "Vercel AI Gateway",
  cohere: "Cohere",
  oci: "Oracle Cloud (OCI)",
  github_copilot: "GitHub Copilot",
  nvidia_nim: "NVIDIA NIM",
  watsonx: "IBM watsonx.ai",
  zai: "Z.ai",
  minimax: "MiniMax",
  replicate: "Replicate",
  snowflake: "Snowflake Cortex",
  cloudflare: "Cloudflare Workers AI",
  nebius: "Nebius AI Studio",
  sambanova: "SambaNova",
  hyperbolic: "Hyperbolic",
  lambda_ai: "Lambda",
  baseten: "Baseten",
  friendliai: "FriendliAI",
  ollama: "Ollama",
  voyage: "Voyage AI",
  jina_ai: "Jina AI",
  elevenlabs: "ElevenLabs",
  deepgram: "Deepgram",
  stability: "Stability AI",
  black_forest_labs: "Black Forest Labs",
  recraft: "Recraft",
  runwayml: "Runway",
  aihubmix: "AIHubMix",
  ai21: "AI21 Labs",
  amazon_nova: "Amazon Nova",
  meta_llama: "Meta Llama API",
  xiaomi_mimo: "Xiaomi MiMo",
  inception: "Inception Labs",
  wandb: "Weights & Biases",
  scaleway: "Scaleway",
  ovhcloud: "OVHcloud",
  volcengine: "Volcano Engine",
  gmi: "GMI Cloud",
  aiand: "ai&",
};

/** A readable label for display only; filtering and routing continue to use the provider id. */
export function getProviderDisplayName(
  provider: string | null | undefined,
): string {
  const id = provider?.trim().toLowerCase() ?? "";
  if (!id) return "—";
  return (
    PROVIDER_DISPLAY_NAMES[id] ??
    id
      .split(/[_-]+/)
      .filter(Boolean)
      .map((word) =>
        word.length <= 3
          ? word.toUpperCase()
          : word[0].toUpperCase() + word.slice(1),
      )
      .join(" ")
  );
}

/**
 * Get the initial/abbreviation for a provider name
 */
export function getProviderInitial(provider: string): string {
  if (!provider) return "?";

  // Map common providers to their initials/abbreviations
  const providerMap: { [key: string]: string } = {
    anthropic: "A",
    openai: "O",
    azure: "Az",
    bedrock: "B",
    vertex_ai: "V",
    cohere: "C",
    huggingface: "H",
    replicate: "R",
    groq: "G",
    together_ai: "T",
    mistral: "M",
    deepinfra: "D",
  };

  const lowerProvider = provider.toLowerCase();
  if (providerMap[lowerProvider]) {
    return providerMap[lowerProvider];
  }

  // Default to first letter uppercase
  return provider.charAt(0).toUpperCase();
}

export function providerLogoKey(provider: string): string {
  const lowerProvider = provider.trim().toLowerCase();
  // Benchmark feeds use the lab's display name instead of the LiteLLM provider id.
  return lowerProvider === "z.ai" ? "zai" : lowerProvider;
}

/** Use bundled, verified color artwork; monochrome brands keep their official mark. */
export function getProviderLogo(provider: string): string | null {
  if (!provider) return null;

  const logoProvider = providerLogoKey(provider);

  const logos: Record<string, string | null> = providerLogos;
  const logoFile = Object.hasOwn(logos, logoProvider)
    ? logos[logoProvider]
    : null;
  if (logoFile) {
    return `/provider-logos/${logoFile}`;
  }

  return null;
}
