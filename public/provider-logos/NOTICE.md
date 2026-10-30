# Provider artwork attribution

The active mapping is `src/providerLogos.json`. The October 24, 2026 audit covers all 215 provider identifiers in LiteLLM's endpoint-support and model-price catalogs, plus seven compatibility aliases. Assets in `upstream/` come from provider-owned websites, documentation, repositories, or provider-submitted integrations. [sources.json](./sources.json) records each source URL, official homepage, verification date, any transformations, and the SHA-256 of the bundled file. Existing artwork retained from LobeHub was checked against the corresponding upstream brand.

Six entries intentionally retain labeled initials: `auto_router`, `custom`, `custom_openai`, and `openai_like` describe generic adapters rather than independent brands; `infinity` and `pg_vector` have no published logo in their upstream repositories or documentation. LlamaGate's website was unavailable during the audit; its icon is the globe supplied by its maintainer in the linked Dify integration, not a newly invented brand mark.

The October 30, 2026 additions cover ai& and eight other providers that LiteLLM's catalogs gained after that audit, which brings `scripts/provider-logo-catalog.json` to 224 provider identifiers. BigModel, CLF AI Gateway, eu/jev, Kyma API, Refuseless, StreamLake and ZeroGPU use the unchanged icons their own websites serve, and Amazon OpenSearch shares the AWS mark that the other AWS services use.

When adding a provider, add its verified artwork and provenance together, update the shared mapping and the audited catalog fixture in `scripts/provider-logo-catalog.json`, and run `npm test`, `npm run check`, and `npm run build`. The build checks the live provider lists: a missing bundled file, or a provider in `scripts/provider-logo-catalog.json` that has lost its entry in the mapping, fails it before deployment, while a provider that LiteLLM's catalogs gain before its artwork is audited ships with initials, is listed under `unauditedProviders` in `/build-info.json`, and fails the `provider-logos` job of the refresh workflow after each deploy that workflow triggers until its artwork lands. All image URLs remain local; visitors do not contact upstream sites to load these marks.

OpenCode Go uses the unchanged square light brand mark from the official OpenCode repository, pinned to the commit recorded in `sources.json`.

ai& uses the unchanged icon from its brand kit, submitted by ai& and pinned to the commit recorded in `sources.json`.

## Previously bundled artwork

Provider SVGs are bundled from [`@lobehub/icons-static-svg` version 1.98.0](https://www.npmjs.com/package/@lobehub/icons-static-svg/v/1.98.0), published by [LobeHub](https://github.com/lobehub/lobe-icons) under the MIT license. Color variants are used where available. SVG `currentColor` values were resolved to black for rendering through image elements.

`databricks.svg` and `oracle.svg` retain the artwork previously used by this site from [LiteLLM's provider logos](https://github.com/BerriAI/litellm/tree/main/ui/litellm-dashboard/public/assets/logos). The existing `google.svg` also retains this site's previous artwork. Provider names and marks belong to their respective owners.

The LobeHub license below is reproduced verbatim from [the upstream license](https://raw.githubusercontent.com/lobehub/lobe-icons/86b3f06ad9a4cc57011a56e5a7d3a5d4f1e8d835/LICENSE).

```text
MIT License

Copyright (c) 2023 LobeHub

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
