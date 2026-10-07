# models.litellm.ai

LiteLLM's model catalog: pricing, context windows and providers for every model in LiteLLM's open-source [price file](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json). Every price, model and provider on the site comes from that file and from `provider_endpoints_support.json` in the same repo; nothing is scraped from other sites.

## Development

```bash
npm install
npm run dev      # the catalog app on http://localhost:5173
npm run build    # app + static model pages into dist/
npm test
```

## What the build produces

`npm run build` runs three steps. `vite build` builds the Svelte catalog app. `npm run seo` (`scripts/seo/generate.ts`) then writes a static, server-rendered page for every model and provider, so search engines and AI agents can read prices without running JavaScript. `npm run seo:check` (`scripts/seo/validate.ts`) fails the build if a page lacks a title, description or canonical tag, has invalid JSON-LD, or links to a page that doesn't exist.

The generator writes:

| Path | What it is |
|---|---|
| `/models/<model-id>` | One page per model, grouping every provider's listing of it, with prices, context window, features, code samples, FAQ and JSON-LD |
| `/models/<model-id>.md` | The same page as markdown, also served for `Accept: text/markdown` by `middleware.ts` |
| `/models` | Every model, most recently added first |
| `/providers/<provider>` | Every model one provider sells, at that provider's price |
| `/sitemap.xml`, `/sitemaps/*.xml` | Sitemap index split by page type, with `lastmod` from real data changes |
| `/robots.txt`, `/llms.txt` | Crawl rules and a plain-text index for AI agents |
| `/models/slugs.json` | Price-file key to page slug, used by the catalog table to link rows |
| `/models/manifest.json` | Per-model content hash, change date, date added and price history; the next build diffs against it |
| `/build-info.json` | Counts, GitHub stars and price-file freshness for the home page stats |
| `/changes.json` | URLs that changed in this build, for IndexNow |

## Model grouping

`scripts/seo/group.ts` maps price-file keys to one page per model: `gemini/gemini-nano-banana-2.1`, `vertex_ai/gemini-nano-banana-2.1` and `openrouter/google/gemini-nano-banana-2.1` share `/models/gemini-nano-banana-2.1`. Regions, inference profiles, dated snapshots and tiers become rows on that page. When the heuristic gets a model wrong, fix it in `scripts/seo/overrides.json` (merge or split pages, pin a name or slug) rather than in code. Published slugs never change: the build reads them back from the live manifest.

The page's headline price is the model's own lab when it sells the model (Anthropic for Claude, Google AI Studio for Gemini), otherwise the cheapest provider. A price more than 8x away from the median of the other providers is flagged on the page and kept out of the headline.

`scripts/seo/added-dates.json` holds the date each model first appeared in the price file, read from its git history. New models get their date from the manifest, so the seed only needs rebuilding (`GITHUB_TOKEN=$(gh auth token) npx vite-node scripts/seo/seed-added-dates.ts`) after a grouping change.

## Keeping pages fresh

`.github/workflows/refresh-model-pages.yml` runs every 30 minutes. When the price file's hash differs from the live `build-info.json`, it calls the Vercel deploy hook in the `VERCEL_DEPLOY_HOOK_URL` secret, waits for the new build, and submits the changed URLs to IndexNow. Set `GITHUB_TOKEN` in the Vercel project's environment so the build can read the star count without hitting GitHub's anonymous rate limit.

Build-time environment variables: `SITE_URL` (default `https://models.litellm.ai`), `COST_MAP_FILE` and `PROVIDER_SUPPORT_FILE` to build from local files, `PREVIOUS_MANIFEST_URL` (or `none`), `BUILD_DATE`, `SEO_OUT_DIR`, `GITHUB_TOKEN`.
