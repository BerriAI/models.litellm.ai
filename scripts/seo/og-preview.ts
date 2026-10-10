/**
 * Renders share cards from a built dist/ to PNG files, the same way api/og.ts
 * does on Vercel, so they can be checked locally.
 * Run: npx vite-node scripts/seo/og-preview.ts [models/claude-opus-5-5 ...] [--out dir]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { OG_FONTS, type CardInput } from "./og-card";
import { renderCardPng } from "./og-render";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const out =
  outIndex >= 0
    ? path.resolve(args[outIndex + 1])
    : path.join(ROOT, "dist/og-preview");
const ids = (
  outIndex >= 0
    ? args.filter((_, i) => i !== outIndex && i !== outIndex + 1)
    : args
).filter(Boolean);
const targets = ids.length
  ? ids
  : [
      "models/claude-opus-5-5",
      "models/gemini-nano-banana-2.1",
      "providers/bedrock",
      "pages/home",
    ];

const fonts = OG_FONTS.map((f) => ({
  name: "Geist",
  data: readFileSync(path.join(ROOT, "scripts/seo/fonts", f.file)),
  weight: f.weight,
  style: "normal" as const,
}));
const logo = `data:image/png;base64,${readFileSync(path.join(ROOT, "public/brand/litellm-logo-white.png")).toString("base64")}`;

mkdirSync(out, { recursive: true });
for (const target of targets) {
  const input = JSON.parse(
    readFileSync(path.join(ROOT, "dist/og", `${target}.json`), "utf8"),
  ) as CardInput;
  const file = path.join(out, `${target.replace("/", "-")}.png`);
  writeFileSync(file, await renderCardPng(input, { fonts, logo }));
  console.log(file);
}
