import { existsSync } from "node:fs";
import path from "node:path";
import auditedCatalog from "./provider-logo-catalog.json";
import providerLogos from "../src/providerLogos.json";
import { providerLogoKey } from "../src/providers";

type AuditInputs = {
  publicDir?: string;
  audited?: ReadonlySet<string>;
  logos?: Readonly<Record<string, string | null>>;
};

export function auditProviderLogos(
  providers: Iterable<string>,
  { publicDir = path.resolve("public"), audited = new Set(auditedCatalog), logos = providerLogos }: AuditInputs = {},
): string[] {
  const unique = [...new Set(Array.from(providers, providerLogoKey))];
  const unmapped = unique.filter((provider) => !Object.hasOwn(logos, provider));
  const failures = [
    ...unique.flatMap((provider) => {
      const file = Object.hasOwn(logos, provider) ? logos[provider] : null;
      return file && !existsSync(path.join(publicDir, "provider-logos", file))
        ? [`${provider}: missing /provider-logos/${file}`]
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
