# Public Model Catalog API

The independent Vercel project serves `api.models.litellm.ai`. Its root directory is **catalog-api**, in the existing website repository. It does not change the website's source, dependencies, middleware, build command, or Vercel settings.

## Build and check

Use Node 22. There are no application dependencies.

```sh
cd catalog-api
npm ci --ignore-scripts
npm test
npm run build
```

The build downloads the public LiteLLM map once, validates it, and produces Vercel Build Output API artifacts in `.vercel/output`. `COST_MAP_FILE` optionally supplies a local test snapshot. Invalid data fails the new build; the existing deployment remains available. No upstream fetch or function runs when serving catalog data. The only function receives asynchronous usage-log batches.

The API guide at `/` contains working curl examples. Exact lookups use `/v1/models/{model_id}`; provider and name lists use `/v1/providers/{provider}/models` and `/v1/names/{name}/models`. Lists contain at most 50 entries. Follow `links.next`, which embeds the snapshot version. Old snapshot links may return 404 after a deployment; restart pagination in that case. Lookup names are case-sensitive; query parameters do not filter static responses. There is no search engine or bulk-file endpoint.

## Create the isolated deployment

Import the existing `BerriAI/models.litellm.ai` repository into a **new** project in the existing Vercel team. Choose root directory `catalog-api`, preset **Other**, Node 22, and build command `npm run build`. Use the `codex/static-model-api` branch for this experiment's production branch. Its folder-local Vercel configuration permits that branch and disables automatic main-branch deployment for this API project. Do not change the website project's Git or build settings. If this is later merged and maintained on main, deliberately change the API project's production branch and its deployment filter together.

Add `api.models.litellm.ai` to this new project. At the authoritative DNS provider, add only the CNAME record that Vercel supplies for `api.models`; preserve every other record. If Vercel requests ownership verification, follow its displayed TXT instructions. Verify HTTPS and a real model response before calling the domain live.

## Protect the API

Vercel provides automatic DDoS mitigation. In **this API project's Firewall**, add a custom rule matching request paths starting with `/v1/`, count by IP, with a fixed 60-second window and 120 requests, action **429**. Rate-limit counters are regional, not global quotas; shared networks share their allowance. The rule must be enforced, not log-only. Keep it scoped to the API project; do not add middleware or firewall changes to the website. An IP rate limit alone does not stop a distributed attack or guarantee a spend cap.

Confirm any displayed metered-feature charges before activation. Do not enable an account-wide automatic pause that could stop the website. To stop the experiment, pause only the API project or block its `/v1/` routes.

## Track CDN requests in Mixpanel

The catalog response never waits for analytics. Configure a Vercel **Logs** drain for **only this API project**, production environment, source **static**, JSON format, sampling **100%**, and paths starting with `/v1/`. Destination: `https://api.models.litellm.ai/api/usage-drain`. Do not select function/build logs: the intake must not feed its own requests back into the drain. Do not attach the website project.

Set these environment variables on the API project through Vercel's secret controls, then redeploy:

| Variable | Value source |
| --- | --- |
| `MIXPANEL_TOKEN` | Existing models-site Mixpanel project's ingestion token |
| `VERCEL_DRAIN_SECRET` | This drain's signature secret |
| `MIXPANEL_API_HOST` | Optional; default US, or the existing project's EU/India ingestion host |
| `VERCEL_DRAIN_VERIFY` | Only if the dashboard requests legacy endpoint verification |

The receiver uses Vercel's runtime `VERCEL_PROJECT_ID` to reject records from other projects. If automatic system variables are disabled, enable them for this new project or set `CATALOG_VERCEL_PROJECT_ID` to its project ID. Keep all values runtime-only; no environment files or tokens belong in Git.

In Mixpanel, count **model_catalog_api_request** events, or sum **request_count**. Break down by `endpoint`, `method`, `status`, and `cache_status`. `HIT` requests count too. The receiver verifies HMAC signatures, sends at most 50 events per ingestion call, uses stable event IDs and timestamps for retries, and returns 502 on failed delivery so Vercel can retry. No IP, email, user agent, raw query string, or raw model path is forwarded. The constant service identity measures request volume, not unique users. Firewall-blocked requests are excluded from these static-log totals; inspect them in Vercel Firewall.

Drains, request delivery, and Mixpanel ingestion are metered services. Analytics are best-effort operational reporting, not a billing ledger; retention/retry limits can cause gaps. Do not claim tracking is active until a real CDN hit appears in Mixpanel. A missing configuration returns 503 from the drain receiver and does not affect catalog availability.

## Live checks and rollback

1. Request a known model twice. Verify JSON, source values, snapshot metadata, CORS, and the CDN cache headers. Record cold and warm timing separately; a warm cache result alone does not prove first-request latency.
2. Follow a multi-page provider result. Verify missing models return JSON 404, writes return 405, and the old bulk map route is unavailable.
3. Test a temporary low rate limit on an isolated test path in this API project, confirm 429 and recovery, then remove that test rule. Verify the production rule remains 120/minute/IP. Avoid sending a load test to the website.
4. Confirm real static requests reach Mixpanel with cache-hit events and no personal fields. Test a malformed drain signature returns 403.
5. Verify the website's project settings, production deployment, and source/build files are unchanged.

Rollback by promoting the previous deployment of the **API project only**. Pause its drain and project to shut it down. Delete only its dedicated DNS record after a deliberate shutdown decision; do not alter `models.litellm.ai`.
