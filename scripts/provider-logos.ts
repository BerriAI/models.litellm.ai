import { existsSync } from "node:fs";
import path from "node:path";
import providerLogos from "../src/providerLogos.json";
import { getProviderLogo } from "../src/providers";

export function auditProviderLogos(
  providers: Iterable<string>,
  publicDir = path.resolve("public"),
): string[] {
  const unique = [...new Set(providers)];
  const missingFiles = unique.flatMap((provider) => {
    const logo = getProviderLogo(provider);
    return logo && !existsSync(path.join(publicDir, logo))
      ? [`${provider}: missing ${logo}`]
      : [];
  });
  if (missingFiles.length) {
    throw new Error(`Provider logo audit failed:\n${missingFiles.join("\n")}`);
  }
  return unique
    .filter((provider) => !Object.hasOwn(providerLogos, provider.toLowerCase()))
    .sort();
}
