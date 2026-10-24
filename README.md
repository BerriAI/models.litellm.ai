# models.litellm.ai

Compare models on your own gateway traffic with `npm run benchmark`. See the [local benchmark guide](docs/local-benchmark.md) for setup, the offline report, evaluation methodology, and data handling.

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
| `/compare/<a>-vs-<b>` | Two models side by side: answer line, prices, features, cheapest provider for each, Epoch AI benchmark scores, "when to pick" from real differences, code, FAQ; markdown copy at `.md`. Model slugs in alphabetical order; the reverse order redirects |
| `/compare` | Every comparison, grouped by kind |
| `/compare/custom?models=a,b,c` | Pick up to four models and compare them side by side; every model page's "Compare" button opens it with that model first. Reads `/compare/models.json`, rebuilt with every price change. Noindex; it links the reviewed pair pages when the picked pair has one |
| `/rankings/<slug>`, `/rankings` | Models sorted by one fact: blended price (3 input : 1 output), context window, or provider count for the price-capped lists. Never by quality; each page states its method |
| `/calculator` | Cost per request, day and month for any token-priced model, with shareable links (`?model=&in=&out=&req=`) and a static table of the default workload for the compared models |
| `/new-models/<yyyy-mm>`, `/new-models`, `/new-models.xml` | Models added to the price file each month, from each model's date added, plus an RSS feed of the latest 50 |
| `/models/<model-id>.md` | The same page as markdown, also served for `Accept: text/markdown` by `middleware.ts` |
| `/models` | Every active model, grouped by lab with a jump menu, newest first within each lab |
| `/providers/<provider>` | Every model one provider sells, at that provider's price |
| `/sitemap.xml`, `/sitemaps/*.xml` | Sitemap index split by page type, with `lastmod` from real data changes |
| `/robots.txt`, `/llms.txt`, `/llms-full.txt` | Crawl rules, a short plain-text index for AI agents (newest 100 models), and the full model list |
| `/models/slugs.json` | Price-file key to page slug, used by the catalog table to link rows |
| `/models/manifest.json` | Per-model content hash, change date, date added and price history; the next build diffs against it |
| `/build-info.json` | Counts, GitHub stars and price-file freshness for the home page stats |
| `/changes.json` | URLs that changed in this build, for IndexNow |
| `/og/<kind>/<id>.json` | Each page's share-card text; `api/og.ts` draws it as `/og/<kind>/<id>.png` |
| `/index.html`, `/providers.html`, `/cookbook.html`, `/guardrails.html` | The app's routes, each with its own title, canonical, share image, BreadcrumbList and its content rendered as plain HTML (`#seo-shell`, built in `scripts/seo/app-pages.ts`) for crawlers that don't run JavaScript. The app removes it when it mounts. `/providers` lists every provider in `provider_endpoints_support.json`; `/cookbook` lists every tutorial on docs.litellm.ai (from its sitemap and each page's markdown copy, `scripts/seo/cookbook.ts`) plus the litellm repo's cookbook index, written to `/cookbook.json` for the app's Cookbook tab too; `/guardrails` renders the guardrails list. Both go noindex if the build can't load their data |

## Share images

Every page's `og:image` points at `/og/<kind>/<id>.png?v=<hash>`. `vercel.json` rewrites that to `api/og.ts`, which reads the card text the build wrote to `/og/<kind>/<id>.json` and draws a 1200x630 PNG with satori and resvg, using the 2026 logo and Geist. The CDN caches each image, and the `?v=` hash changes whenever a card's text does, so a price change gets a fresh image, and an image URL with any other query (an older hash, none, an extra parameter) redirects to the current one, so a link shared before the change shows the current card instead of a broken image, and only one URL per card is ever drawn (plus the `/api/og` path it rewrites to, which nothing links). Images are drawn on request rather than at build time, which keeps builds fast; only pages that are shared or crawled ever get one. The card layout is in `scripts/seo/og-card.ts`. To see cards locally after a build:

```bash
npm run og:preview -- models/claude-opus-5-5 providers/bedrock pages/home
```

## Comparisons

`scripts/seo/compare.ts` picks the pairs and writes every sentence on a comparison page from the price file. Reviewed pairs live in `overrides.json` under `compare.pairs` and are built whenever both models are priced. The build also adds pairs by itself so new models get compared soon after launch: each model with its predecessor in its family (`families` in `overrides.json`, a regex on the page slug), and models added in the last 45 days against the two closest models from other labs. New pages are released in weekly waves of at most 40 (`WEEKLY_CAP`), counted from `compare` in the manifest. Reviewed pairs count first, so the first build ships only the 40 reviewed pairs and automatic pairs follow from day 7. An automatic pair whose prices, context and features barely differ, or whose models have fewer than 3 providers, is built with noindex; reviewed and successor pairs are indexed unless one of their models is retired.

Benchmark scores come from [Epoch AI's Benchmarking Hub](https://epoch.ai/benchmarks) (CC BY 4.0, credited on every page), downloaded at build time by `scripts/seo/benchmarks.ts`. The page shows the Capabilities Index and a fixed list of benchmarks in three groups (coding and agents, reasoning and knowledge, math; see `BENCHMARKS`): Epoch's own runs, plus external results Epoch collects from each benchmark's leaderboard, linked to that source. Each file's score column and scale come from Epoch's `benchmark_metadata.csv`. Scores match a model only when Epoch's model id (before the `_<setting>` suffix) equals one of the page's ids; anything else is left out. The Capabilities Index file has no model ids, so it matches a page's display name exactly. A comparison shows only benchmarks both models have, at each model's best reported setting. Some benchmarks (Terminal-Bench, SWE-bench Verified) have few recent models in Epoch's data; they appear once Epoch records them. If the download fails, pages are built without scores. `EPOCH_FILE` reads the zip from disk.

A retired model's page stays up with its last listed prices and a notice that links to the newest active model in its family. A comparison already published keeps its page when one of its models is deprecated or retired; a pair with a retired model is built with noindex.

## Calculator and tracking

Every model priced per input and output token has a cost calculator (`scripts/seo/calculator.ts`). The build fills in the default workload (1,000 input and 500 output tokens, 10,000 requests a day), so crawlers and the markdown copy see a number; the page script reads the prices from the page's JSON-LD and recomputes as the reader types. Both use the same arithmetic and money format, which a test keeps in step.

Code snippets, calculators, comparison and ranking tables carry `data-track` attributes, and each page's `<main>` carries its kind and id. With PostHog loaded (it already is, on models.litellm.ai), copying a snippet sends `snippet_copied` and the first change to a calculator sends `calculator_used`, both with the page kind and id.

## Rankings and new models

`scripts/seo/rankings.ts` builds every ranking from the price file. A model qualifies when it's active, priced, has a 32K-token context window or more, and is offered by at least two providers or by its own lab, which keeps one-off resale variants off the top. Lists sort by blended price at the headline price, except the context ranking (largest first) and the "under $1/$5" lists (most providers first, so they don't repeat the cheapest list). There's one list per model family with three or more qualifying models; a list already published keeps its page with noindex when fewer than three are left, until none is, and each provider page has its own "cheapest chat models on <provider>" section at that provider's prices. Rankings never use benchmark scores.

`/new-models` groups models by the month they were added (from `added-dates.json` for older models and the manifest for new ones), so its history goes back to 2023.

## Model grouping

`scripts/seo/group.ts` maps price-file keys to one page per model: `gemini/gemini-nano-banana-2.1`, `vertex_ai/gemini-nano-banana-2.1` and `openrouter/google/gemini-nano-banana-2.1` share `/models/gemini-nano-banana-2.1`. Regions, inference profiles, dated snapshots and tiers become rows on that page. When the heuristic gets a model wrong, fix it in `scripts/seo/overrides.json` (merge or split pages, pin a name or slug) rather than in code. Published slugs never change: the build reads them back from the live manifest.

When a lab sells a model at an introductory price for a limited time, add it to `introPricing` in `overrides.json` with the end date and the lab's pricing page, for example `"gemini-4-argon": { "until": "2026-11-30", "source": "https://ai.google.dev/gemini-api/docs/pricing" }`. The page then shows an "Introductory price" badge, says so in its answer, FAQ and meta description, labels the share card, and sets `priceValidUntil` in its JSON-LD. The price itself still comes from the price file, and the note disappears on the first build after the end date. The note shows only when the headline price comes from the lab's own API, or from a provider listed in the entry's optional `providers`.

Each model has a status: `retired` when every priced listing's `deprecation_date` has passed, `deprecated` when any listing has one, otherwise `active`. Retired models get a banner, keep their page for reference and leave the sitemap and `/models`. Correct a wrong status with `status` in `overrides.json`. `npm run seo:check` also fails any model page whose quoted price range disagrees with its own price table.

The page's headline price is the model's own lab when it sells the model (Anthropic for Claude, Google AI Studio for Gemini), otherwise the cheapest provider. A price more than 8x away from the median of the other providers is flagged on the page and kept out of the headline.

`scripts/seo/added-dates.json` holds the date each model first appeared in the price file, read from its git history. New models get their date from the manifest, so the seed only needs rebuilding (`GITHUB_TOKEN=$(gh auth token) npx vite-node scripts/seo/seed-added-dates.ts`) after a grouping change.

## Keeping pages fresh

`.github/workflows/refresh-model-pages.yml` runs every 10 minutes. It reads the price file at its latest commit rather than at `main`, which raw.githubusercontent.com can serve up to five minutes stale, and the build does the same. When the price file's hash differs from the live `build-info.json`, it calls the Vercel deploy hook in the `VERCEL_DEPLOY_HOOK_URL` secret, waits for the new build, loads the share images of up to 200 changed model pages plus the models index so the CDN has them cached (this also fails the run if the image function is down; the home and provider cards, and anything past 200, render on their first share after a deploy, which takes well under a second), and submits the changed URLs to IndexNow. To submit every URL once, after a launch or a URL change, run the workflow manually with `submit_all` checked. Set `GITHUB_TOKEN` in the Vercel project's environment so the build can read the star count without hitting GitHub's anonymous rate limit.

Build-time environment variables: `SITE_URL` (default `https://models.litellm.ai`), `COST_MAP_FILE` and `PROVIDER_SUPPORT_FILE` to build from local files, `PREVIOUS_MANIFEST_URL` (or `none`), `BUILD_DATE`, `SEO_OUT_DIR`, `GITHUB_TOKEN`.

### Discovery rankings from public benchmark feeds

The Discover page refreshes its rankings from public data without API keys. Top quality uses the [Epoch Capabilities Index](https://epoch.ai/eci), matched to catalog names and their declared aliases. Top coding uses the official [Terminal-Bench 4.0 submissions](https://github.com/harbor-framework/terminal-bench/tree/main/leaderboard/submissions). Each coding result shows its agent harness and reasoning setting; these are evaluations of the model and agent together.

The homepage pairs six recent models with one compact chart panel. Keyboard-accessible tabs switch between the three top-ten lists without reloading their data. Blue bars share a scale within each list, and adjacent cards and their source footers align. Long model IDs truncate to fit the available space while retaining the full ID in the tooltip and copy action; the panels stack on narrow screens.

Each chart links directly to its named benchmark and explains the measure. Every row shows its unit: ECI points, percent of attempts solved, or successful attempts per $100 of reported spend. The $100 display scales the per-dollar value by 100 without changing the ranking or relative bar lengths. ECI is a combined benchmark index, not a percentage; Terminal-Bench rates include repeated attempts at the same tasks.

Best Task per Dollar ranks successful Terminal-Bench trials per reported dollar, using success count and reported total cost from the same submission. The source treats missing trial costs as zero and does not publish cost-coverage counts; these are reported-cost comparisons, not guarantees of complete billing coverage. All runs with positive successes and reported costs qualify, with success rates shown alongside efficiency. Missing or zero costs do not receive a value ranking. Each chart shows up to ten models, using one source-defined model id at its strongest or most efficient measured configuration without guessing which differently named models are equivalent.

`scripts/seo/discovery-benchmarks.ts` reads the public GitHub submission directory and files and reuses the existing Epoch ZIP loader. It pins the Terminal-Bench 4.0 dataset hash, preventing results from different task sets from being silently mixed. The existing refresh workflow rebuilds at least daily and when LiteLLM's catalog changes. No winners or scores are hardcoded in the interface.

If a public source cannot refresh, the build preserves the previous published data and its source date where available. Terminal-Bench also has a compact, dated bootstrap capture in `scripts/seo/terminal-bench-snapshot.json`. The UI exposes source dates; an unavailable source is never replaced with a different benchmark. `TERMINAL_BENCH_FILE` can select a normalized bootstrap capture for builds. Refreshes still run, with that file used only as a fallback.

Epoch data is credited under [CC BY 4.0](https://epoch.ai/data). Terminal-Bench's public repository is [Apache 2.0 licensed](https://github.com/harbor-framework/terminal-bench/blob/main/LICENSE). Source links remain available beside the rankings and individual coding results.
