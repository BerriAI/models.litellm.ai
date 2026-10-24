/**
 * Provider utility functions for mapping provider names to logos and initials
 */

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

// LobeHub icons-static-svg 1.98.0; Databricks and Oracle use LiteLLM's existing artwork.
const PROVIDER_LOGOS: Record<string, string> = {
  openai: "openai.svg",
  azure: "azure-color.svg",
  azure_ai: "azureai-color.svg",
  azure_text: "azure-color.svg",
  anthropic: "anthropic.svg",
  bedrock: "bedrock-color.svg",
  bedrock_converse: "bedrock-color.svg",
  vertex_ai: "google-color.svg",
  vertexai: "google-color.svg",
  cohere: "cohere-color.svg",
  cohere_chat: "cohere-color.svg",
  groq: "groq.svg",
  mistral: "mistral-color.svg",
  deepinfra: "deepinfra-color.svg",
  fireworks_ai: "fireworks-color.svg",
  fireworks: "fireworks-color.svg",
  ollama: "ollama.svg",
  openrouter: "openrouter-color.svg",
  deepseek: "deepseek-color.svg",
  cerebras: "cerebras-color.svg",
  "text-completion-openai": "openai.svg",
  "text-completion-codestral": "mistral-color.svg",
  codestral: "mistral-color.svg",
  sagemaker: "aws-color.svg",
  aws: "aws-color.svg",
  aws_polly: "aws-color.svg",
  google: "google-color.svg",
  gemini: "google-color.svg",
  google_pse: "google-color.svg",
  palm: "palm-color.svg",
  ai21: "ai21.svg",
  aleph_alpha: "alephalpha.svg",
  anyscale: "anyscale-color.svg",
  assemblyai: "assemblyai-color.svg",
  cloudflare: "cloudflare-color.svg",
  elevenlabs: "elevenlabs.svg",
  exa_ai: "exa-color.svg",
  fal_ai: "fal-color.svg",
  featherless_ai: "featherless-color.svg",
  friendliai: "friendli.svg",
  github_copilot: "githubcopilot.svg",
  huggingface: "huggingface-color.svg",
  hyperbolic: "hyperbolic-color.svg",
  jina_ai: "jina.svg",
  lambda_ai: "lambda.svg",
  meta_llama: "meta-color.svg",
  minimax: "minimax-color.svg",
  moonshot: "moonshot.svg",
  morph: "morph-color.svg",
  novita: "novita-color.svg",
  nvidia_nim: "nvidia-color.svg",
  perplexity: "perplexity-color.svg",
  recraft: "recraft.svg",
  replicate: "replicate.svg",
  runwayml: "runway.svg",
  sambanova: "sambanova-color.svg",
  snowflake: "snowflake-color.svg",
  stability: "stability-color.svg",
  tavily: "tavily-color.svg",
  together_ai: "together-color.svg",
  v0: "v0.svg",
  vercel_ai_gateway: "vercel.svg",
  volcengine: "volcengine-color.svg",
  voyage: "voyage-color.svg",
  watsonx: "ibm.svg",
  xai: "xai.svg",
  zai: "zai.svg",
  amazon_nova: "nova-color.svg",
  chatgpt: "openai.svg",
  dashscope: "alibaba-color.svg",
  meta: "meta-color.svg",
  typesafe: "typesafeai.svg",
  databricks: "databricks.svg",
  oracle: "oracle.svg",
};

/** Use bundled, verified color artwork; monochrome brands keep their official mark. */
export function getProviderLogo(provider: string): string | null {
  if (!provider) return null;

  const lowerProvider = provider.toLowerCase();

  const logoFile = PROVIDER_LOGOS[lowerProvider];
  if (logoFile) {
    return `/provider-logos/${logoFile}`;
  }

  return null;
}
