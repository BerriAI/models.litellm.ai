import { build } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { BenchmarkReport } from "../../src/benchmark/types";
const root = fileURLToPath(new URL("../../", import.meta.url));
export function safeJSON(value: unknown) {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}
export async function renderReport(report: BenchmarkReport): Promise<string> {
  const result = await build({
    root,
    configFile: false,
    publicDir: false,
    logLevel: "silent",
    plugins: [svelte()],
    build: {
      write: false,
      cssCodeSplit: false,
      assetsInlineLimit: Infinity,
      lib: {
        entry: resolve(root, "src/benchmark/report-entry.ts"),
        name: "LiteLLMReport",
        formats: ["iife"],
      },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) =>
    "output" in r ? r.output : [],
  );
  const script = outputs
    .flatMap((x) => (x.type === "chunk" ? [x.code] : []))
    .join("\n")
    .replace(/<\/script/gi, "<\\/script");
  const style = outputs
    .flatMap((x) =>
      x.type === "asset" && x.fileName.endsWith(".css")
        ? [String(x.source)]
        : [],
    )
    .join("\n");
  if (!script || !style || /https?:\/\//.test(style))
    throw new Error("Report assets were not fully bundled.");
  const icon = await readFile(
    resolve(root, "public/provider-logos/upstream/litellm_proxy.svg"),
  );
  const reportIcon = "data:image/svg+xml;base64," + icon.toString("base64");
  const licenses = (
    await Promise.all(
      ["barlow-condensed", "dm-sans", "ibm-plex-mono"].map((name) =>
        readFile(
          resolve(root, "node_modules/@fontsource", name, "LICENSE"),
          "utf8",
        ),
      ),
    )
  )
    .join("\n\n")
    .replace(/-->/g, "-- >");
  const digest = createHash("sha256").update(script).digest("base64");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${digest}'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>Your LiteLLM benchmark</title><style>*{box-sizing:border-box}${style}</style></head><body><div id="app"></div><script id="benchmark-data" type="application/json">${safeJSON({ report, reportIcon })}</script><script>${script}</script></body><!-- Bundled font licenses\n${licenses}\n--></html>`;
}
export async function saveReport(report: BenchmarkReport, path: string) {
  await writeFile(path, await renderReport(report), {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
}
