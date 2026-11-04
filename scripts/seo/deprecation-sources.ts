/**
 * Where each API provider publishes its own retirement schedule, so every date on the
 * deprecated-models pages can be checked against the provider that set it. Keys are
 * hub providers (see `hubProvider`). A provider without a public notice page is left out.
 */
export const DEPRECATION_NOTICES: Readonly<Record<string, string>> = {
  openai: "https://developers.openai.com/api/docs/deprecations",
  anthropic:
    "https://platform.claude.com/docs/en/about-claude/model-deprecations",
  gemini: "https://ai.google.dev/gemini-api/docs/deprecations",
  vertex_ai:
    "https://cloud.google.com/vertex-ai/generative-ai/docs/deprecations",
  azure:
    "https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirements",
  azure_ai:
    "https://learn.microsoft.com/en-us/azure/foundry/concepts/model-lifecycle-retirement",
  bedrock:
    "https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle.html",
  bedrock_mantle:
    "https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle.html",
  together_ai: "https://docs.together.ai/docs/deprecations",
  fireworks_ai: "https://fireworks.ai/models",
  xai: "https://docs.x.ai/docs/models",
  databricks:
    "https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis/supported-models",
  github_copilot:
    "https://docs.github.com/en/copilot/reference/ai-models/supported-models",
  wandb: "https://docs.wandb.ai/guides/inference/models/lifecycle",
  mistral: "https://docs.mistral.ai/getting-started/models/models_overview",
  groq: "https://console.groq.com/docs/deprecations",
  moonshot: "https://platform.moonshot.ai/docs/guide/deprecation",
  cerebras: "https://inference-docs.cerebras.ai/models/overview",
  deepseek: "https://api-docs.deepseek.com/updates",
};

export const deprecationNotice = (provider: string): string | undefined =>
  DEPRECATION_NOTICES[provider];

/**
 * How often LiteLLM's pricing sync reads each provider's pages into the price file this site
 * is built from. Mirrors the tiers of the litellm-provider-sync dispatcher; a provider it does
 * not cover gets its dates recorded by hand.
 */
const EVERY_30_MINUTES = [
  "openai",
  "anthropic",
  "gemini",
  "vertex_ai",
  "azure",
  "azure_ai",
  "bedrock",
  "bedrock_mantle",
];
const EVERY_4_HOURS = [
  "baseten",
  "fireworks_ai",
  "together_ai",
  "xai",
  "github_copilot",
  "typesafe",
  "databricks",
];
const DAILY = ["wandb"];

export function refreshCadence(provider: string): string {
  if (EVERY_30_MINUTES.includes(provider)) return "Every 30 minutes";
  if (EVERY_4_HOURS.includes(provider)) return "Every 4 hours";
  if (DAILY.includes(provider)) return "Daily";
  return "By hand";
}
