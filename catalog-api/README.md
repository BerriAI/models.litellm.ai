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

Import the existing `BerriAI/models.litellm.ai` repository into a **new** project in the existing Vercel team. Choose root directory `catalog-api`, preset **Other**, Node 22, and build command `npm run build`. Exclude files outside the root, enable skipping deployments when that root and its dependencies are unchanged, and select **Only build production** for the ignored build step. The basic build machine is sufficient. Do not change the website project's Git or build settings.

Use `main` as the API production branch for ongoing deployment and refresh hooks. The initial deployment can use `codex/static-model-api` while this change awaits review. Switching the production branch to `main` preserves the current deployment until a new production build succeeds; merge this folder before expecting main-branch builds to work.

Add `api.models.litellm.ai` to this new project. At the authoritative DNS provider, add only the CNAME record that Vercel supplies for `api.models`; preserve every other record. If Vercel requests ownership verification, follow its displayed TXT instructions. Verify HTTPS and a real model response before calling the domain live.

## Refresh prices automatically

The existing **Refresh model pages** workflow runs every ten minutes. Its independent `catalog-api` job compares `/v1/snapshot` with the public price map and rebuilds only the API when they differ. An API failure retries on the next run even if the website is already current; the website jobs are unchanged.

Create a deploy hook in the **API project's** Git settings for branch `main`, then store its URL in the existing repository's Actions secret `CATALOG_API_DEPLOY_HOOK_URL`. Keep the website's `VERCEL_DEPLOY_HOOK_URL` unchanged. The scheduled API job starts after this workflow change is merged to the default branch. GitHub scheduling delays and upstream caching mean the ten-minute interval is not a freshness guarantee.

## Protect the API

Vercel provides automatic DDoS mitigation. In **this API project's Firewall**, add a custom rule matching request paths starting with `/v1/`, count by IP, with a fixed 60-second window and 120 requests, action **429**. Rate-limit counters are regional, not global quotas; shared networks share their allowance. The rule must be enforced, not log-only. Keep it scoped to the API project; do not add middleware or firewall changes to the website. An IP rate limit alone does not stop a distributed attack or guarantee a spend cap.

Confirm any displayed metered-feature charges before activation. Do not enable an account-wide automatic pause that could stop the website. To stop the experiment, pause only the API project or block its `/v1/` routes.

## Track CDN requests in Mixpanel

The catalog response never waits for analytics. Configure a Vercel **Logs** drain for **only this API project**, production environment, source **static**, JSON format, and sampling **100%** (no sampling rules). The receiver keeps only API paths starting with `/v1/`. Destination: `https://api.models.litellm.ai/api/usage-drain`. Do not select function/build logs: the intake must not feed its own requests back into the drain. Do not attach the website project.

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
3. From a test client, send a bounded burst slightly above 120 requests within one minute. Confirm 429 and recovery after the window ends. Verify the production rule remains 120/minute/IP. Do not send this test to the website.
4. Confirm real static requests reach Mixpanel with cache-hit events and no personal fields. Test a malformed drain signature returns 403.
5. Verify the website's project settings, production deployment, and source/build files are unchanged.

Rollback by promoting the previous deployment of the **API project only**. Pause its drain and project to shut it down. Delete only its dedicated DNS record after a deliberate shutdown decision; do not alter `models.litellm.ai`.
