import { existsSync } from "node:fs";
import path from "node:path";
import providerLogos from "../src/providerLogos.json";
import { getProviderLogo } from "../src/providers";

/** Stop new catalog providers or missing bundled files from silently becoming initials. */
export function validateProviderLogos(
  providers: Iterable<string>,
  publicDir = path.resolve("public"),
): void {
  const errors: string[] = [];
  for (const provider of new Set(providers)) {
    if (!Object.hasOwn(providerLogos, provider.toLowerCase())) {
      errors.push(`${provider}: no audited logo entry`);
      continue;
    }
    const logo = getProviderLogo(provider);
    if (logo && !existsSync(path.join(publicDir, logo))) {
      errors.push(`${provider}: missing ${logo}`);
    }
  }
  if (errors.length) {
    throw new Error(`Provider logo audit failed:\n${errors.join("\n")}`);
  }
}
