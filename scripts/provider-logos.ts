import { existsSync } from "node:fs";
import path from "node:path";
import auditedCatalog from "./provider-logo-catalog.json";
import providerLogos from "../src/providerLogos.json";
import { getProviderLogo, providerLogoKey } from "../src/providers";

const auditedProviders: ReadonlySet<string> = new Set(auditedCatalog);

export function auditProviderLogos(
  providers: Iterable<string>,
  publicDir = path.resolve("public"),
  audited = auditedProviders,
): string[] {
  const unique = [...new Set(Array.from(providers, providerLogoKey))];
  const unmapped = unique.filter((provider) => !Object.hasOwn(providerLogos, provider));
  const failures = [
    ...unique.flatMap((provider) => {
      const logo = getProviderLogo(provider);
      return logo && !existsSync(path.join(publicDir, logo))
        ? [`${provider}: missing ${logo}`]
        : [];
    }),
    ...unmapped
      .filter((provider) => audited.has(provider))
      .map((provider) => `${provider}: listed in scripts/provider-logo-catalog.json but has no entry in src/providerLogos.json`),
  ];
  if (failures.length) {
    throw new Error(`Provider logo audit failed:\n${failures.join("\n")}`);
  }
  return unmapped.filter((provider) => !audited.has(provider)).sort();
}
