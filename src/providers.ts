import providerLogos from "./providerLogos.json";
import {
  PROVIDER_DISPLAY_NAMES,
  getProviderDisplayName,
} from "./providerNames";

/**
 * Shared provider display names, logos and initials
 */

export { PROVIDER_DISPLAY_NAMES, getProviderDisplayName };

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
