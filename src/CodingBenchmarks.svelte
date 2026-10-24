<script lang="ts">
  import { onMount } from "svelte";
  import { getProviderLogo } from "./providers";
  import {
    defaultBenchmarkCohort,
    emptyResults,
    harnessName,
    parseBenchmarkResults,
    runMetrics,
    type BenchmarkResults,
  } from "./codingBenchmarks";

  export let embedded = false;
  let data: BenchmarkResults = emptyResults;
  let loading = true;
  let error = "";
  let selected = "";
  let abort: AbortController;

  async function refresh() {
    abort?.abort();
    abort = new AbortController();
    try {
      const response = await fetch("/benchmarks/results.json", {
        cache: "no-store",
        signal: abort.signal,
      });
      if (response.status === 404) {
        data = emptyResults;
        error = "";
        return;
      }
      if (!response.ok) throw new Error("Results unavailable");
      data = parseBenchmarkResults(await response.json());
      error = "";
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      error =
        "Results could not refresh. Previously loaded results remain visible.";
    } finally {
      loading = false;
    }
  }
  onMount(() => {
    void refresh();
    const timer = setInterval(refresh, 30000);
    return () => {
      clearInterval(timer);
      abort?.abort();
    };
  });

  $: cohort = defaultBenchmarkCohort(data);
  $: rows = data.runs
    .filter((run) => run.cohortId === cohort?.id)
    .map((run) => ({ ...run, ...runMetrics(run, "api") }))
    .filter((run) => run.complete);
  $: charts = [
    {
      id: "quality",
      title: "Quality",
      subtitle: "Tasks resolved",
      max: 100,
      rows: [...rows].sort(
        (a, b) =>
          (b.quality ?? -1) - (a.quality ?? -1) ||
          harnessName(a.harness).localeCompare(harnessName(b.harness)) ||
          a.modelName.localeCompare(b.modelName) ||
          a.id.localeCompare(b.id),
      ),
      value: (row: (typeof rows)[number]) => row.quality,
      format: (value: number) => value.toFixed(1) + "%",
    },
    {
      id: "value",
      title: "Tasks per dollar",
      subtitle: "Tasks solved ÷ total API spend",
      max: Math.max(...rows.map((row) => row.tasksPerDollar ?? 0), 1),
      rows: [...rows].sort(
        (a, b) =>
          (b.tasksPerDollar ?? -1) - (a.tasksPerDollar ?? -1) ||
          harnessName(a.harness).localeCompare(harnessName(b.harness)) ||
          a.modelName.localeCompare(b.modelName) ||
          a.id.localeCompare(b.id),
      ),
      value: (row: (typeof rows)[number]) => row.tasksPerDollar,
      format: (value: number) => value.toFixed(2),
    },
  ];
  $: picked = rows.find((row) => row.id === selected);
  const totalCost = (value: number) =>
    "$" + value.toFixed(value > 0 && value < 0.01 ? 4 : 2);
  const usd = (value: number | null) =>
    value === null ? "Unavailable" : "$" + value.toFixed(4);
</script>

<section
  class="coding-results"
  class:embedded
  aria-labelledby="coding-results-title"
>
  <header>
    <div>
      <span class="eyebrow">LITELLM / CODING AGENTS</span>
      <svelte:element
        this={embedded ? "h2" : "h1"}
        id="coding-results-title"
        class="results-title">Coding benchmarks</svelte:element
      >
      <p class="scope">
        <span class="pilot">PILOT</span>
        {#if cohort}{cohort.taskIds.length} tasks · {cohort.repetitions}
          {cohort.repetitions === 1 ? "trial" : "trials"} each ·
        {/if}API cost only · Preliminary results
      </p>
    </div>
    {#if embedded}<a class="standalone-link" href="/benchmarks"
        >Open benchmarks ↗</a
      >{/if}
  </header>

  {#if error}<p class="notice" role="status">{error}</p>{/if}
  <div class="charts">
    {#each charts as chart}
      <section class="chart-panel" aria-label={chart.title + " comparison"}>
        <div class="chart-heading">
          <h3>{chart.title}</h3>
          <span>Higher is better ↗</span>
        </div>
        <p class="chart-subtitle">{chart.subtitle}</p>
        {#if chart.rows.length}
          <div class="chart-rows">
            {#each chart.rows as row (row.id)}
              {@const value = chart.value(row)}
              <button
                class="chart-row"
                class:selected={selected === row.id}
                aria-pressed={selected === row.id}
                aria-label={"Harness: " +
                  harnessName(row.harness) +
                  ", Model: " +
                  row.modelName +
                  ", Provider: " +
                  row.providerName +
                  ", " +
                  chart.title +
                  ": " +
                  (value === null ? "unavailable" : chart.format(value))}
                on:click={() => (selected = selected === row.id ? "" : row.id)}
              >
                <span class="row-heading"
                  ><span>Harness: {harnessName(row.harness)}</span><strong
                    >{value === null ? "—" : chart.format(value)}{chart.id ===
                      "value" &&
                    value !== null &&
                    row.costSource === "estimated"
                      ? "*"
                      : ""}</strong
                  ></span
                >
                <span class="model-line">Model: {row.modelName}</span>
                <span class="provider-line"
                  ><img
                    src={getProviderLogo(row.provider) ?? ""}
                    alt={row.providerName}
                  /><span>Provider: {row.providerName}</span></span
                >
                <span class="bar-track"
                  ><span
                    class="bar"
                    style:width={(value === null
                      ? 0
                      : Math.min(100, (value / chart.max) * 100)) + "%"}
                  ></span></span
                >
                <span class="row-calculation">
                  {#if chart.id === "quality"}
                    {row.passed} / {row.attempts} solved · {row.cost === null
                      ? "API cost unavailable"
                      : totalCost(row.cost) +
                        (row.costSource === "estimated" ? " estimated" : "") +
                        " API total"}
                  {:else if row.tasksPerDollar !== null && row.cost !== null}
                    {row.passed} solved ÷ {totalCost(row.cost)} total ≈ {row.tasksPerDollar.toFixed(
                      2,
                    )} / $
                  {:else}
                    {row.passed} solved · {row.cost === null
                      ? "API cost unavailable"
                      : totalCost(row.cost) + " total · value unavailable"}
                  {/if}
                </span>
              </button>
            {/each}
          </div>
          <div class="axis" aria-hidden="true">
            <span>0</span><span>{chart.format(chart.max / 2)}</span><span
              >{chart.format(chart.max)}</span
            >
          </div>
        {:else}<p class="empty">
            {loading
              ? "Loading results…"
              : "Completed results will appear here after validation."}
          </p>{/if}
      </section>
    {/each}
  </div>

  <p class="spend-note">API spend includes failed attempts.</p>

  {#if picked}
    <aside class="run-detail" aria-label="Selected result">
      <div class="detail-heading">
        <strong>Harness: {harnessName(picked.harness)}</strong><button
          on:click={() => (selected = "")}
          aria-label="Close selected result">Close ×</button
        >
      </div>
      <dl>
        <div>
          <dt>Model</dt>
          <dd>{picked.modelName}</dd>
        </div>
        <div>
          <dt>Provider</dt>
          <dd>{picked.providerName}</dd>
        </div>
        <div>
          <dt>Tasks resolved</dt>
          <dd>{picked.passed} / {picked.attempts}</dd>
        </div>
        <div>
          <dt>Estimated API cost</dt>
          <dd>{usd(picked.apiCostUsd)}</dd>
        </div>
        <div>
          <dt>Cost per successful task</dt>
          <dd>{usd(picked.costPerSuccess)}</dd>
        </div>
        <div>
          <dt>Harness version</dt>
          <dd>{picked.harnessVersion}</dd>
        </div>
      </dl>
      {#if picked.notes}<details>
          <summary>Run notes</summary>
          <p>{picked.notes}</p>
        </details>{/if}
    </aside>
  {/if}

  <div class="evidence">
    <details>
      <summary>Methodology &amp; scope</summary>
      {#if data.message}<p>{data.message}</p>{/if}
      <p>
        Tasks per dollar = successful tasks ÷ API spend across all attempts,
        including failures and retries. * Token-based cost estimates may differ
        from invoices; compute is excluded. Only complete stacks from the same
        cohort appear. Charts sort independently, highest first; ties sort
        alphabetically by harness, then model.
      </p>
      <p>
        This small pilot is directional, not a stable model ranking. Provider
        logos identify the endpoint used, not an optimal-provider claim. Timing
        is withheld when instrumentation or interruptions differ.
      </p>
      {#if cohort}<p>
          {cohort.dataset}
          {cohort.version} · {cohort.scope} · {cohort.environment}
        </p>
        <p>Tasks: {cohort.taskIds.join(", ")}</p>{/if}
    </details>
    {#if rows.length}<a
        href="/benchmarks/results.json"
        download="coding-benchmark-results.json">Download results ↓</a
      >{/if}
  </div>
</section>

<style>
  .coding-results {
    max-width: 1400px;
    margin: auto;
    padding: 32px 44px 48px;
    color: var(--hf-ink);
  }
  .coding-results.embedded {
    padding: 32px 0;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
  }
  .eyebrow {
    font:
      10px "IBM Plex Mono",
      monospace;
    color: var(--hf-muted);
    letter-spacing: 1.2px;
  }
  .results-title {
    font-size: 28px;
    font-weight: 500;
    letter-spacing: -0.8px;
    margin: 8px 0 10px;
  }
  .scope {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    margin: 0;
    color: var(--hf-muted);
  }
  .pilot {
    font:
      9px "IBM Plex Mono",
      monospace;
    border: 1px solid var(--hf-line);
    border-radius: 3px;
    padding: 3px 5px;
    color: var(--hf-ink);
  }
  a {
    color: var(--hf-muted);
    font-size: 12px;
    text-decoration: none;
  }
  a:hover {
    color: var(--hf-ink);
    text-decoration: underline;
  }
  .standalone-link {
    flex-shrink: 0;
  }
  .charts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;
  }
  .chart-panel {
    border: 1px solid var(--hf-line);
    border-radius: 5px;
    padding: 24px;
    min-width: 0;
  }
  .chart-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  h3 {
    font-size: 19px;
    font-weight: 500;
    letter-spacing: -0.4px;
    margin: 0;
  }
  .chart-heading > span,
  .chart-subtitle {
    font-size: 11px;
    color: var(--hf-muted);
  }
  .chart-subtitle {
    margin: 6px 0 26px;
  }
  .chart-rows {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .chart-row {
    display: block;
    border: 0;
    background: none;
    padding: 0;
    width: 100%;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .chart-row.selected {
    outline: 1px solid var(--hf-accent);
    outline-offset: 7px;
    border-radius: 2px;
  }
  .row-heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
    font-weight: 500;
  }
  .row-heading strong {
    font-size: 16px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .model-line {
    display: block;
    font-size: 12px;
    margin-top: 5px;
  }
  .provider-line {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 4px;
    color: var(--hf-muted);
    font-size: 11px;
  }
  .provider-line img {
    width: 16px;
    height: 16px;
    object-fit: contain;
    padding: 2px;
    background: white;
    border-radius: 3px;
    box-sizing: border-box;
  }
  .bar-track {
    display: block;
    height: 9px;
    margin-top: 10px;
    background: var(--hf-faint);
    border-radius: 1px;
    overflow: hidden;
  }
  .bar {
    display: block;
    height: 100%;
    background: var(--hf-accent);
  }
  .row-calculation {
    display: block;
    margin-top: 7px;
    color: var(--hf-muted);
    font-size: 11px;
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    margin-top: 18px;
    color: var(--hf-muted);
    font:
      10px "IBM Plex Mono",
      monospace;
    font-variant-numeric: tabular-nums;
  }
  .spend-note {
    margin: 12px 0 0;
    color: var(--hf-muted);
    font-size: 11px;
  }
  .evidence {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-top: 16px;
  }
  .evidence > a {
    flex-shrink: 0;
  }
  details {
    font-size: 12px;
    color: var(--hf-muted);
    line-height: 1.7;
  }
  summary {
    cursor: pointer;
    color: var(--hf-muted);
  }
  details p {
    max-width: 850px;
    margin: 12px 0 0;
  }
  .notice,
  .empty {
    font-size: 13px;
    color: var(--hf-muted);
    line-height: 1.7;
  }
  .empty {
    min-height: 160px;
    display: grid;
    place-items: center;
  }
  .run-detail {
    padding: 20px;
    border: 1px solid var(--hf-line);
    border-radius: 5px;
    margin-top: 20px;
  }
  .detail-heading {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    font-size: 14px;
  }
  .detail-heading strong {
    font-weight: 500;
  }
  .detail-heading button {
    background: none;
    border: 0;
    color: var(--hf-muted);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }
  dl {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;
    margin: 20px 0 0;
  }
  dt {
    color: var(--hf-muted);
    font-size: 11px;
  }
  dd {
    margin: 4px 0 0;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .run-detail details {
    margin-top: 16px;
  }
  button:focus-visible,
  a:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--hf-accent);
    outline-offset: 4px;
  }
  @media (max-width: 900px) {
    .coding-results {
      padding: 24px;
    }
    .charts {
      gap: 16px;
    }
    .chart-panel {
      padding: 18px;
    }
    .row-heading {
      font-size: 12px;
    }
  }
  @media (max-width: 650px) {
    .coding-results {
      padding: 20px 16px;
    }
    .coding-results.embedded {
      padding: 24px 0;
    }
    .charts {
      grid-template-columns: 1fr;
    }
    .results-title {
      font-size: 24px;
    }
    .chart-heading > span {
      font-size: 10px;
    }
    dl {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .evidence {
      gap: 16px;
    }
  }
</style>
