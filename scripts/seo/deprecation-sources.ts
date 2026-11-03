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
