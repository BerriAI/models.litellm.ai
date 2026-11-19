# Prism

The LiteLLM model table in your terminal. Purple accents, aligned columns, no API key.

Requires Node.js 20 or newer. From this repository:

```sh
npm run prism

# Install the prism command locally from the checkout
npm install --global ./cli
prism
```

`prism` opens a compact family matrix for Google, Anthropic, and OpenAI, with **XL, L, M+, M, and S/XS** columns. The tier placement follows a curated lineup; each model must exist in the live, active LiteLLM catalog. Tiers are editorial labels, not benchmark rankings or parameter counts.

Use `--table` for pricing, context limits, and capabilities. Search, lab filters, sorting, and limits also open the detailed table:

```sh
prism --table
prism sonnet
prism --lab anthropic
prism --lab openai,google --limit 3
prism --all --sort input
prism --all --sort context
prism gemini --json
prism --refresh
prism --offline
```

In the detailed table, input and output prices are **USD per million tokens**. Context and max output are token counts; the table abbreviates them and `--json` preserves exact numbers. Wide terminals also show tool calling, reasoning, and vision: `✓` means supported, `·` unsupported, and `?` unknown. Columns adapt to your terminal width. Piped output and `NO_COLOR=1 prism` omit color codes.

Prism reads the site's [canonical comparison catalog](https://models.litellm.ai/compare/models.json) and [model manifest](https://models.litellm.ai/models/manifest.json). It uses their grouping, display names, and headline prices. The headline seller may be a hosting provider; `--json` includes that seller, the exact LiteLLM model ID, and a link to each model page. Prices may vary by provider, context length, caching, and service tier. The table shows base token prices.

Only active chat, responses, and completion models with token pricing appear. The family matrix follows the curated layout in `lib/lineup.mjs`; new catalog models appear in the detailed table without automatically assigning them a tier. `--table` shows five models most recently added to LiteLLM per default lab. “Recent” means added to the catalog, not release date or a quality ranking. `--limit` selects the newest models per lab before `--sort` orders them; input/output sort ascending and context sorts descending.

The cache lasts one hour, at `$XDG_CACHE_HOME/prism/catalog-v1.json` or `~/.cache/prism/catalog-v1.json`. `--refresh` fetches both feeds again. `--offline` reads the cache without making requests. If the network fails, Prism labels the saved catalog and its fetch time. The catalog build date comes from the manifest; the comparison feed's benchmark date does not describe pricing freshness. No telemetry or credentials are required.

Run the CLI tests from the repository with `npm run test:cli`, or from this directory with `npm test`.
