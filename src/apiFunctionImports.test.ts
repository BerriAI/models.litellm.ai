import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Vercel transpiles each api/ function file by file without bundling, so the
 * module graph under api/ is loaded by Node's ESM resolver at runtime: a
 * relative import needs its ".js" extension and a JSON import needs
 * `with { type: "json" }`, or the function fails on its first request.
 * This test lives outside api/ because Vercel deploys every api/*.ts file.
 */
const root = path.resolve(__dirname, "..");
const apiDir = path.join(root, "api");
const importPattern =
  /(?:import|export)\s[^"']*?from\s*["']([^"']+)["']([^;\n]*)/g;

function resolveImport(from: string, specifier: string): string {
  const target = path.resolve(path.dirname(from), specifier);
  if (specifier.endsWith(".js")) {
    const ts = target.replace(/\.js$/, ".ts");
    return existsSync(ts) ? ts : target;
  }
  return target;
}

function walk(file: string, seen: Set<string>, problems: string[]): void {
  if (seen.has(file)) return;
  seen.add(file);
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(importPattern)) {
    const [, specifier, attributes] = match;
    if (!specifier.startsWith(".")) continue;
    const where = `${path.relative(root, file)} -> ${specifier}`;
    if (specifier.endsWith(".json")) {
      if (!/with\s*\{\s*type:\s*["']json["']\s*\}/.test(attributes))
        problems.push(`${where} needs with { type: "json" }`);
      continue;
    }
    if (!specifier.endsWith(".js")) {
      problems.push(`${where} needs a .js extension`);
      continue;
    }
    const resolved = resolveImport(file, specifier);
    if (!existsSync(resolved)) {
      problems.push(`${where} does not resolve`);
      continue;
    }
    walk(resolved, seen, problems);
  }
}

describe("api functions load under Node's ESM resolver", () => {
  const functions = readdirSync(apiDir).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
  );

  it("finds the api functions", () => {
    expect(functions).toContain("changelog.ts");
  });

  for (const name of functions) {
    it(`${name} and everything it imports use explicit specifiers`, () => {
      const problems: string[] = [];
      walk(path.join(apiDir, name), new Set(), problems);
      expect(problems).toEqual([]);
    });
  }
});
