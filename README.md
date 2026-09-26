# models.litellm.ai

The [LiteLLM](https://github.com/BerriAI/litellm) model catalog — pricing, context windows, and features for 2,600+ models across 140+ providers.

All data is fetched at runtime from public GitHub sources:

- **Models** — search, filter, and sort models from LiteLLM's [`model_prices_and_context_window.json`](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json), with per-model quick-start snippets (SDK and Proxy).
- **Providers** — supported providers and their available endpoints, from LiteLLM's [`provider_endpoints_support.json`](https://github.com/BerriAI/litellm/blob/main/provider_endpoints_support.json).
- **Cookbook** — AI coding tool guides from the LiteLLM repo.
- **Guardrails** — guardrails from [BerriAI/litellm-guardrails](https://github.com/BerriAI/litellm-guardrails), with a bundled local fallback (`public/guardrails.json`).

## Tech stack

Svelte 4 · Vite 5 · TypeScript · [Fuse.js](https://www.fusejs.io/) for fuzzy search. Client-side SPA deployed on Vercel.

## Development

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:5173`.

| Command          | Purpose                         |
| ---------------- | ------------------------------- |
| `npm run dev`    | Start the Vite dev server       |
| `npm run build`  | Production build to `dist/`     |
| `npm run check`  | TypeScript + Svelte diagnostics |
| `npm run format` | Format with Prettier            |

### Environment variables (optional)

- `VITE_MIXPANEL_TOKEN` — enables Mixpanel analytics. The app works fully without it.

## Contributing

To request a new provider, endpoint, or model, use the request form in the app, or open an issue in [BerriAI/litellm](https://github.com/BerriAI/litellm/issues).

## Credits

Based on the original [contextlengthof.com](https://github.com/fastrepl/contextlengthof) by [fastrepl](https://github.com/fastrepl).
