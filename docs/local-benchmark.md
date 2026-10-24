# Compare models on your gateway traffic

Run a local benchmark and open an interactive HTML report with the same charts and design as models.litellm.ai. The website never receives your gateway address, key, traffic, or report.

You need **Node.js 22 or later**, Git, and a LiteLLM gateway key authorized to read the relevant logs and call your chosen models. An inference-only key may not have log access. You can use an authorized local export instead; a master key is not required by the runner.

```sh
git clone https://github.com/BerriAI/models.litellm.ai.git
cd models.litellm.ai
npm ci
npm run benchmark
```

For an existing checkout, install its locked dependencies with `npm ci`, then run `npm run benchmark`. This command is part of the repository; there is no separately published CLI package.

## Run your first comparison

1. Keep or replace the detected gateway URL. The runner checks `LITELLM_BASE_URL`, `LITELLM_API_BASE`, then `OPENAI_BASE_URL`.
2. Select the detected key or enter another one. It checks `LITELLM_API_KEY`, then `OPENAI_API_KEY`; a detected key shows only its last three characters. New input is hidden. Credentials stay in process memory.
3. Choose the date window, gateway logs or a local export, and session sample size. Defaults are seven days and 40 sessions.
4. Select candidate models. The cheapest models with known token prices are preselected; price is not a claim about quality. Select a judge from the same gateway. The most-used available original model is the initial judge choice.
5. Review destinations, the planning cost estimate, and your spending target. The target includes rubric generation and judging. Press **Start**.
6. Follow the stage, progress, elapsed time, spending, and estimated remaining time in the terminal. ETA is based on completed work in the current stage; discovery and report generation have no artificial countdown.
7. Open the generated `litellm-benchmark-<timestamp>.html`. It works offline, including charts, quality thresholds, workload switching, and light/dark themes.

For a free, synthetic demonstration with no credentials or network model calls:

```sh
npm run benchmark -- --demo
```

Demo scores and costs are simulated and explicitly marked. They are not model-performance measurements.

## Spending and data handling

Evaluation sends sampled request contents and responses to the selected candidate and judge models **through your gateway**. Its provider routing, logging, and retention policies still apply. Review the selected destinations before starting.

The runner makes one paid request at a time. It stops scheduling calls once recorded spend reaches the target, or a call's billing cannot be determined. **One in-flight call can exceed the target.** Use a dedicated gateway key with an enforced budget if you need a hard spending limit. The runner does not create keys or change gateway configuration. Planning estimates use logged token volumes and published gateway rates; they are not a bound on future output length. Existing request output settings are preserved; the runner adds no output-token cap.

No potentially billed request is automatically retried. A timeout, rate limit, model error, or uncosted call stops the evaluation and produces a partial report. Ctrl+C during evaluation cancels the current request and saves completed aggregate results. A cancelled request may still incur provider charges.

Raw requests and responses are held in memory, not written to a cache. The report contains aggregate measurements, inferred-check labels, exclusions, and the actual gateway model IDs for candidates, original traffic, and the judge. Recommendations use the same model IDs you can select in your gateway. Connection credentials, gateway connection settings, raw prompts/responses, and request/session IDs are not saved. The HTML stays on your device unless you share it; review it before sharing because model names can identify internal deployments and the metrics describe your usage.

The report bundles its own JavaScript, fonts, styles, and logo. Its Content Security Policy blocks network connections. It has no analytics, remote assets, or automatic upload. New report files use owner-only permissions on systems that support POSIX modes and never overwrite an existing file. Delete the HTML file when you no longer need it; the runner creates no hidden credential store or raw-data cache. Your source export and gateway logs are not modified.

## What is measured

The runner uses the gateway's model list and optional model information. The current log adapter uses `/spend/logs/ui` and `/spend/logs/ui/{request_id}`. These UI endpoints are version-dependent; older or restricted gateways can use an export instead. Model names alone do not guarantee access to every requested feature; known incompatibilities are skipped, and provider errors stop the run.

It samples complete session groups from metadata strata based on original model, team, and input length. Sessions are selected reproducibly using the seed recorded in the report. Use `npm run benchmark -- --seed 42` to repeat a sampling seed against the same inventory. Session IDs are scoped by key ownership. Requests without session IDs are individual groups. A date window can contain only part of a longer session; no claim of complete session replay is made. Previous benchmark requests are excluded using their marker. When the API caps inventory, the report states that coverage applies only to the scanned records.

Within the sample, workloads share an original model, system/developer instructions, tool definitions, and response schema. Twenty percent of session groups are reserved for rubric development; the remainder are held out. No session crosses that boundary. Small workloads without both development and held-out sessions retain unknown semantic quality.

The judge selects applicable checks for instruction following, groundedness, completeness, and tool appropriateness from a development request. Actual request instructions and schemas remain the source of task-specific requirements. A deliberately incorrect response checks basic judge discrimination. This does **not** establish human agreement or complete business-policy coverage. Deterministic checks validate finish reasons, JSON/schema requirements, and tool arguments. Schema validation runs in a separate worker with a 32 MiB old-generation heap limit and a two-second wall-clock deadline. Schema size, depth, and node count are bounded before transfer; validation data is limited to 1 MiB. Async schemas, oversized inputs, timeouts, worker failures, unsupported schema features, and missing evidence remain unknown. These limits apply to local validation, not model output-token settings.

The original response is scored against the same criteria as candidates; it is not treated as the correct answer. Model identifiers are omitted from semantic judging, and evaluation order is randomized. A judge can still be biased, including toward its own output style.

Quality is reported only when all held-out requests for that model have determinate scores. Unknown, unsupported, and pending results remain visible. Costs include passing and failing attempts. Response latency measures the candidate API call, excluding judging; baseline latency comes from historical logs and may reflect different cache, load, or streaming conditions. Gateway cost headers take precedence over estimated input/output-token pricing; complex pricing may not be captured by the fallback.

Traffic shares and per-request costs use inverse sampling weights. Displayed intervals are descriptive, unweighted request-level Wilson intervals; repeated turns are correlated and these intervals must not be interpreted as session-level guarantees. Monthly figures extrapolate the selected period to 30 days. The allocation table chooses one cheaper candidate per non-tool workload only when its observed pass rate meets the selected floor and is not below the baseline. This selection is exploratory because it is made after comparing candidates on the evaluation sample. Confirm the selected rules on a fresh sample before deployment. These comparisons are not validated deployment policies or guaranteed savings.

## Supported requests and recovery

The initial evaluator supports complete text-only Chat Completions requests, including JSON schemas and recorded tool-call turns. It does not call customer tools, run the client application, or simulate new sessions. A tool-turn result means the proposed next response met visible requirements; it does not mean an agent completed its task.

| Result                                                | Next step                                                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid key                                           | Choose another credential or check its validity.                                                                                                  |
| Log access denied or endpoint unavailable             | Use an authorized JSON export or ask your gateway administrator for scoped access.                                                                |
| Missing prompts or responses                          | Enable prompt/response storage for future traffic or supply complete exported logs. Historical metadata cannot reconstruct missing content.       |
| Truncated/redacted content                            | Use a complete authorized source. These requests are excluded rather than guessed.                                                                |
| No traffic in the selected window                     | Expand the window or check export timestamps and key scope.                                                                                       |
| Unsupported modality, endpoint, or generation setting | Review the exclusion count; this evaluator currently supports text Chat Completions only.                                                         |
| Missing pricing or usage                              | A planning estimate may be unavailable; an uncosted paid call stops subsequent calls. Check gateway model pricing and cost headers.               |
| Partial report                                        | Review completed measurements and run again with a smaller sample, different model, or larger approved target. There is no raw-data resume cache. |

### Local export format

Choose **Local JSON export** during setup, or supply one after a log-access failure. It accepts an array of LiteLLM spend-log rows or an object with a `data` array. The selected date window filters `startTime`; rows without a valid timestamp are excluded.

Each row needs `request_id`. For evaluation it also needs a complete `proxy_server_request.body` (or `request`) and a full Chat Completions `response`. Useful metadata includes `session_id`, `model_group` or `model`, `prompt_tokens`, `completion_tokens`, `spend`, `startTime`, `endTime`, and `call_type`. Serialized JSON fields are accepted for stored request and response objects. A messages-only export cannot prove that the full request settings were preserved.

Do not commit exports. Keep them outside the repository and pass their path interactively. The runner never exports them to the website.

## Development checks

```sh
npm run benchmark:check
npm test
npm run check
npm run build
npm run benchmark -- --demo
```

Tests use synthetic logs and a loopback HTTP gateway. They do not call real models or validate provider quality, all deployed LiteLLM versions, or customer permissions.
