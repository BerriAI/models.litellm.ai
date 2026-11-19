import { defineConfig, loadEnv } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Readable } from "node:stream";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const catalogProxyTarget =
    env.VITE_CATALOG_API_PROXY_TARGET || "http://127.0.0.1:8000";

  return {
    build: {
      rollupOptions: {
        input: {
          main: resolve("index.html"),
          "ask-ai": resolve("src/ask-ai-entry.ts"),
        },
        output: {
          entryFileNames: (chunk) =>
            chunk.name === "ask-ai"
              ? "assets/ask-ai.js"
              : "assets/[name]-[hash].js",
        },
      },
    },
    plugins: [
      svelte(),
      {
        name: "models-ai-api",
        configureServer(server) {
          server.middlewares.use("/api/ask", async (request, response) => {
            const controller = new AbortController();
            response.on("close", () => controller.abort());
            try {
              if (request.method !== "POST") {
                response.writeHead(405).end();
                return;
              }
              const { POST } = await server.ssrLoadModule("/api/ask.ts");
              const incoming = new Request(
                `http://${request.headers.host}/api/ask`,
                {
                  method: "POST",
                  headers: request.headers as Record<string, string>,
                  body: Readable.toWeb(request) as ReadableStream,
                  duplex: "half",
                  signal: controller.signal,
                } as RequestInit,
              );
              const result: Response = await POST(incoming);
              response.writeHead(
                result.status,
                Object.fromEntries(result.headers),
              );
              if (result.body)
                Readable.fromWeb(result.body as any).pipe(response);
              else response.end();
            } catch {
              if (!response.headersSent) response.writeHead(500);
              response.end();
            }
          });
        },
      },
      {
        name: "generated-catalog-data",
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            const pathname = request.url?.split("?")[0];
            const isArchive =
              pathname &&
              /^\/(?:new|deprecated)-models(?:\/\d{4}-\d{2})?(?:\.(?:md|xml))?$/.test(
                pathname,
              );
            const isCatalogPage =
              pathname &&
              /^\/(?:models|providers|compare)\/[a-z0-9][a-z0-9._-]*$/.test(
                pathname,
              ) &&
              !pathname.endsWith(".json");
            if (
              pathname &&
              (isArchive ||
                isCatalogPage ||
                pathname === "/compare" ||
                pathname === "/models")
            ) {
              try {
                const extension = /\.(md|xml)$/.exec(pathname)?.[1];
                const file = resolve(
                  "dist",
                  `${pathname.slice(1)}${extension ? "" : ".html"}`,
                );
                const contentType =
                  extension === "xml"
                    ? "application/rss+xml"
                    : extension === "md"
                      ? "text/markdown"
                      : "text/html";
                const data = readFileSync(file);
                response.setHeader(
                  "Content-Type",
                  `${contentType}; charset=utf-8`,
                );
                response.end(
                  contentType === "text/html"
                    ? data
                        .toString()
                        .replace(
                          'src="/assets/ask-ai.js"',
                          'src="/src/ask-ai-entry.ts"',
                        )
                    : data,
                );
              } catch {
                next();
              }
              return;
            }
            if (
              pathname !== "/models/manifest.json" &&
              pathname !== "/models/slugs.json" &&
              pathname !== "/compare/models.json" &&
              pathname !== "/discovery/benchmarks.json"
            )
              return next();
            try {
              const data = readFileSync(resolve("dist", pathname.slice(1)));
              response.setHeader("Content-Type", "application/json");
              response.end(data);
            } catch {
              // Before the first build, use the published catalog through the proxy.
              next();
            }
          });
        },
      },
    ],
    server: {
      // Enable SPA fallback for client-side routing
      historyApiFallback: true,
      // When VITE_USE_LOCAL_CATALOG_API=true, the app fetches /model_catalog (same origin);
      // proxy to litellm-model-catalog-api so the browser avoids CORS.
      proxy: {
        // Static catalog pages are generated during the production build.
        // Prefer local build output above; use the published catalog before the first build.
        "/models/": {
          target: "https://models.litellm.ai",
          changeOrigin: true,
        },
        "/providers/": {
          target: "https://models.litellm.ai",
          changeOrigin: true,
        },
        "/new-models": {
          target: "https://models.litellm.ai",
          changeOrigin: true,
        },
        "/deprecated-models": {
          target: "https://models.litellm.ai",
          changeOrigin: true,
        },
        "/compare/": {
          target: "https://models.litellm.ai",
          changeOrigin: true,
        },
        "/discovery/": {
          target: "https://models.litellm.ai",
          changeOrigin: true,
        },
        "/model_catalog": {
          target: catalogProxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      proxy: {
        "/model_catalog": {
          target: catalogProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
