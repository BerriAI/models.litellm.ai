# AGENTS.md

## Cursor Cloud specific instructions

This is a **Svelte 4 + Vite 5 + TypeScript** client-side SPA (no backend). The app fetches its data at runtime from public GitHub files. `npm run build` also runs `scripts/seo/generate.ts`, which writes a static page per model and provider into `dist/` (see README.md). Static pages and the app share `src/modelPresentation.ts` and `src/modelMeta.ts`.

Only LiteLLM's own data goes on the site: `model_prices_and_context_window.json` and `provider_endpoints_support.json` from BerriAI/litellm, plus the cookbook index and guardrails list the app already reads. Do not add prices, model names or dates from other sources to the generated pages; fix grouping and names in `scripts/seo/overrides.json`.

One exception: an `introPricing` entry in `overrides.json` may carry a hand-typed end date (`until`), because the price file can't say a price is temporary. It must cite the lab's own pricing page as an https `source`, and the build rejects it otherwise. Add `providers` when the introductory price applies to sellers other than the lab's own API. The price itself always comes from the price file.

A second exception: comparison pages show benchmark scores from Epoch AI's Benchmarking Hub (CC BY 4.0), credited on the page with a link and the date. Use Epoch's own runs, its Capabilities Index, and the external results Epoch republishes, each linked to its original source; match models exactly by id (the Capabilities Index, which has no ids, by exact display name), never by fuzzy name matching. Never turn scores into a verdict ("better", "best", "winner"), and never rank models by them.

### Running the dev server

```bash
npm run dev
```

The app runs on `http://localhost:5173` by default.

### Available scripts (see `package.json`)

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build to `dist/`: app, static model pages, then `seo:check` |
| `npm run seo` | Regenerate only the static model pages into `dist/` |
| `npm run seo:check` | Validate the generated pages and links |
| `npm test` | Vitest, including `scripts/seo/seo.test.ts` |
| `npm run check` | Run `svelte-check` (TypeScript + Svelte diagnostics) |
| `npm run format` | Run Prettier with `--write` |

### Known issues

- `npm run check` reports 9 pre-existing TypeScript errors (type-casting issues in `App.svelte`, `Providers.svelte`, `Main.svelte`). These do **not** block the build or dev server.
- `npx prettier --check .` reports 10 files with formatting issues (pre-existing).

### Environment variables (optional)

- `VITE_MIXPANEL_TOKEN` — enables Mixpanel analytics in the app, on the generated static pages (read at build time) and in `middleware.ts` (read at runtime). The site works fully without it.

### Mixpanel tracking is part of every change

Every new page, route, component, feed or user interaction ships with Mixpanel tracking in the same PR, and a change to an existing one keeps its tracking working. The goal is that one anonymous visitor's whole journey reads as a single Mixpanel timeline.

- In the app, use `track()` (or a named helper) from `src/analytics.ts`. Name events in Title Case ("Model Expanded") and send ids and filter values, never free text a user typed into a form, full emails or feedback text.
- On generated static pages (`scripts/seo/`), call `window.litellmTrack(event, props)` from page scripts; it sends to both Mixpanel and PostHog. `layout()` already sends "Page View" and "Page Leave", so a new page only needs a `track` kind and id, or a case in `pageKind()` in `src/analyticsConfig.ts`.
- Fetches that run no JavaScript (RSS feeds, `.md` copies, `llms.txt`) are reported from `middleware.ts`; add a new feed or machine-readable path to its `matcher` and `machineFetchEvent()`. Links back to this site in RSS items go through `feedLink()` so feed clicks carry `utm_source=rss`.
- Mixpanel's autocapture (clicks, inputs, scroll depth) is a backstop, not a replacement for named events.
- If something genuinely needs no tracking, say why in the PR description.
