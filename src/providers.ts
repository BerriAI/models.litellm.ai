import providerLogos from "./providerLogos.json";

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

/** Use bundled, verified color artwork; monochrome brands keep their official mark. */
export function getProviderLogo(provider: string): string | null {
  if (!provider) return null;

  const lowerProvider = provider.toLowerCase();

  const logos: Record<string, string | null> = providerLogos;
  const logoFile = Object.hasOwn(logos, lowerProvider)
    ? logos[lowerProvider]
    : null;
  if (logoFile) {
    return `/provider-logos/${logoFile}`;
  }

  return null;
}
