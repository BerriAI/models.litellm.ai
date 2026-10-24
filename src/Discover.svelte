<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import PageHero from "./PageHero.svelte";
  import { getProviderLogo } from "./providers";
  import {
    emptyResults,
    harnesses,
    harnessName,
    parseBenchmarkResults,
    previewResults,
    runMetrics,
    type BenchmarkResults,
    type Harness,
    type CostBasis,
  } from "./codingBenchmarks";
  const dispatch = createEventDispatcher<{ browse: { query?: string } }>();
  let results: BenchmarkResults = emptyResults;
  let preview = false;
  let loading = true;
  let error = "";
  let activeHarness: Harness | "all" = "all";
  let cohortId = "";
  let provider = "all";
  let qualityFloor = 50;
  let basis: CostBasis = "api";
  let selected = "";
  let activityOpen = false;
  let activityRun = "";
  let methodDialog: HTMLDialogElement;
  let runDialog: HTMLDialogElement;
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
        results = emptyResults;
        error = "";
        return;
      }
      if (!response.ok) throw new Error("Results are temporarily unavailable");
      results = parseBenchmarkResults(await response.json());
      error = "";
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      error =
        "Could not refresh results. Previously loaded results remain visible.";
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
  $: data = preview ? previewResults : results;
  $: cohort =
    data.cohorts.find((item) => item.id === cohortId) ?? data.cohorts[0];
  $: isPilot = Boolean(
    cohort && (cohort.taskIds.length < 20 || cohort.repetitions < 3),
  );
  $: cohortRuns = data.runs.filter((run) => run.cohortId === cohort?.id);
  $: providers = [
    ...new Map(
      cohortRuns.map((run) => [run.provider, run.providerName]),
    ).entries(),
  ];
  $: visibleRuns = cohortRuns.filter(
    (run) =>
      (activeHarness === "all" || run.harness === activeHarness) &&
      (provider === "all" || run.provider === provider),
  );
  $: rows = visibleRuns
    .map((run) => ({ ...run, ...runMetrics(run, basis) }))
    .sort((a, b) => {
      const aEligible = a.quality !== null && a.quality >= qualityFloor;
      const bEligible = b.quality !== null && b.quality >= qualityFloor;
      return (
        Number(bEligible) - Number(aEligible) ||
        (b.tasksPerDollar ?? -1) - (a.tasksPerDollar ?? -1) ||
        (b.quality ?? -1) - (a.quality ?? -1)
      );
    });
  $: completed = rows.filter((row) => row.complete);
  $: activityRuns = rows.filter((row) => !row.complete);
  $: activityCounts = (["running", "queued", "blocked", "failed"] as const)
    .map((status) => ({
      status,
      count: activityRuns.filter((run) => run.status === status).length,
    }))
    .filter(({ count }) => count > 0);
  $: leading = completed.find(
    (row) =>
      row.quality !== null &&
      row.quality >= qualityFloor &&
      row.tasksPerDollar !== null,
  );
  $: picked = rows.find((row) => row.id === selected);
  $: charts = [
    {
      id: "value",
      title: "Tasks per dollar",
      subtitle: "Successful tasks / USD",
      direction: "Higher is better",
      max: Math.max(...completed.map((r) => r.tasksPerDollar ?? 0), 1),
      get: (r: (typeof rows)[number]) => r.tasksPerDollar,
      format: (n: number) => n.toFixed(2),
    },
    {
      id: "quality",
      title: "Quality",
      subtitle: "Tasks resolved",
      direction: "Higher is better",
      max: 100,
      get: (r: (typeof rows)[number]) => r.quality,
      format: (n: number) => n.toFixed(1) + "%",
    },
    {
      id: "time",
      title: "Task time",
      subtitle: "Mean agent time · all attempts",
      direction: "Lower is better",
      max: Math.max(...completed.map((r) => r.secondsPerTask ?? 0), 60),
      get: (r: (typeof rows)[number]) => r.secondsPerTask,
      format: (n: number) => (n / 60).toFixed(1) + "m",
    },
  ];
  function changeSource() {
    preview = !preview;
    cohortId = "";
    provider = "all";
    selected = "";
    activityOpen = false;
    activityRun = "";
  }
  const usd = (n: number) => "$" + n.toFixed(2);
</script>

<div class="discover-page">
  <PageHero
    id="discover"
    title="CODING AGENTS"
    eyebrow="THE OPEN BENCHMARK LAB"
    description="The right harness. The right model. More work per dollar."
    diagramLabels={["HARNESS", "MODEL", "VALUE"]}
    diagramCaption="BUILD / MEASURE / COMPARE"
  />

  <section class="benchmark-section" aria-labelledby="benchmark-title">
    <div class="section-top">
      <div>
        <span class="eyebrow">01 / COMPARE CODING STACKS</span>
        <h2 id="benchmark-title">Choose your coding agent.</h2>
      </div>
      <button class="outline-button" on:click={() => runDialog.showModal()}
        >Run on your stack <span>↗</span></button
      >
    </div>
    <div class="harness-tabs" aria-label="Coding agent">
      <button
        class:active={activeHarness === "all"}
        aria-pressed={activeHarness === "all"}
        on:click={() => {
          activeHarness = "all";
          selected = "";
        }}><span class="harness-mark all-mark">⊞</span>All agents</button
      >
      {#each harnesses as harness}
        <button
          class:active={activeHarness === harness.id}
          aria-pressed={activeHarness === harness.id}
          on:click={() => {
            activeHarness = harness.id;
            selected = "";
          }}
          ><span class="harness-mark">{harness.mark}</span
          >{harness.name}</button
        >
      {/each}
    </div>
    <div class="filter-row">
      <div class="data-controls">
        {#if data.cohorts.length > 1}
          <label class="select-wrap"
            ><span>Dataset</span><select
              aria-label="Benchmark cohort"
              value={cohort?.id}
              on:change={(event) => {
                cohortId = event.currentTarget.value;
                provider = "all";
                selected = "";
              }}
              >{#each data.cohorts as item}<option value={item.id}
                  >{item.label}</option
                >{/each}</select
            ></label
          >
        {:else}<span class="dataset-label"
            >{cohort ? cohort.dataset : "Terminal-Bench"}
            <span>{cohort?.version ?? "4.0"}</span></span
          >{/if}
        <span class="status-chip" class:preview-chip={preview}
          >{preview
            ? "ILLUSTRATIVE"
            : loading
              ? "LOADING"
              : data.status === "running"
                ? "RUNNING"
                : completed.length
                  ? "MEASURED"
                  : "AWAITING RESULTS"}</span
        >
        {#if cohort}<span class="sample-label"
            >{cohort.taskIds.length} tasks × {cohort.repetitions}
            {cohort.repetitions === 1 ? "trial" : "trials"}{cohort.scope ===
            "subset"
              ? " · subset"
              : ""}</span
          >{/if}
      </div>
      <button class="text-button" on:click={() => methodDialog.showModal()}
        >Methodology ↗</button
      >
    </div>
    {#if preview}<div class="preview-notice" role="status">
        <strong>Design preview</strong><span
          >Invented values to explore the interface. These are not benchmark
          results or confirmed model compatibility.</span
        ><button on:click={changeSource}>Back to real results ↗</button>
      </div>{/if}
    {#if error && !preview}<div class="error-notice" role="status">
        {error} <button class="text-button" on:click={refresh}>Retry</button>
      </div>{/if}
    <div class="comparison-controls">
      <label class="quality-control"
        ><span>Minimum quality <strong>{qualityFloor}%</strong></span><input
          aria-label="Minimum quality"
          type="range"
          min="0"
          max="100"
          step="5"
          bind:value={qualityFloor}
        /></label
      >
      <div class="right-controls">
        <label class="select-wrap"
          ><span>Provider</span><select
            aria-label="Provider"
            bind:value={provider}
            ><option value="all">All providers</option
            >{#each providers as [id, name]}<option value={id}>{name}</option
              >{/each}</select
          ></label
        >
        <label class="select-wrap"
          ><span>Cost basis</span><select
            aria-label="Cost basis"
            bind:value={basis}
            ><option value="api">API only</option><option value="total"
              >API + compute</option
            ></select
          ></label
        >
      </div>
    </div>

    {#if isPilot && !preview}
      <div class="pilot-notice">
        <strong>PILOT</strong><span
          >{cohort.taskIds.length} tasks × {cohort.repetitions} trial(s). Insufficient
          coverage for a stable ranking.</span
        >
      </div>
    {/if}

    {#if leading}
      <div class="value-summary">
        <span class="summary-icon">↗</span>
        <div>
          <strong
            >{preview
              ? "Preview leader"
              : isPilot
                ? "Most tasks/$ in this pilot"
                : "Highest observed tasks/$"}</strong
          ><span
            >{harnessName(leading.harness)} <span class="separator">/</span>
            <img
              src={getProviderLogo(leading.provider) ?? ""}
              alt={leading.providerName}
            />
            {leading.modelName}</span
          >
        </div>
        <div class="summary-number">
          {leading.tasksPerDollar?.toFixed(2)}<span>successful tasks / $</span>
        </div>
      </div>
    {:else if completed.length}
      <div class="value-summary">
        <span class="summary-icon">—</span>
        <div>
          <strong>No eligible cost comparison</strong><span
            >{completed.some(
              (row) => row.quality !== null && row.quality >= qualityFloor,
            )
              ? "Cost data is missing for this basis. Try API only."
              : "Lower the quality threshold to include more results."}</span
          >
        </div>
      </div>
    {/if}

    <div class="charts">
      {#each charts as chart}
        <section
          class="chart-panel"
          class:value-chart={chart.id === "value"}
          aria-label={chart.title + " comparison"}
        >
          <div class="chart-title">
            <h3>{chart.title}</h3>
            <span>{chart.id === "time" ? "↘" : "↗"}</span>
          </div>
          <div class="chart-caption">
            <span>{chart.subtitle}</span><span
              >{preview ? "Illustrative · " : ""}{chart.direction}</span
            >
          </div>
          {#if completed.length}
            <div class="chart-rows">
              {#each completed as row}
                {@const value = chart.get(row)}
                <button
                  class="chart-row"
                  class:selected={selected === row.id}
                  class:below-floor={row.quality !== null &&
                    row.quality < qualityFloor}
                  aria-pressed={selected === row.id}
                  aria-label={harnessName(row.harness) +
                    ", " +
                    row.modelName +
                    ", " +
                    chart.title +
                    ": " +
                    (value === null ? "unavailable" : chart.format(value))}
                  on:click={() =>
                    (selected = selected === row.id ? "" : row.id)}
                >
                  <span class="row-top"
                    ><span class="agent-name">{harnessName(row.harness)}</span
                    ><strong
                      >{value === null ? "—" : chart.format(value)}{chart.id ===
                        "value" &&
                      value !== null &&
                      row.costSource === "estimated"
                        ? "*"
                        : ""}</strong
                    ></span
                  >
                  <span class="model-line"
                    ><img
                      src={getProviderLogo(row.provider) ?? ""}
                      alt={row.providerName}
                    /><span>{row.modelName}</span
                    >{#if row.quality !== null && row.quality < qualityFloor}<span
                        class="floor-label">Below floor</span
                      >{/if}</span
                  >
                  <span class="bar-track"
                    ><span
                      class="bar"
                      style:width={(value === null
                        ? 0
                        : Math.min(100, (value / chart.max) * 100)) + "%"}
                    ></span></span
                  >
                </button>
              {/each}
            </div>
            <div class="axis" aria-hidden="true">
              <span>0</span><span>{chart.format(chart.max / 2)}</span><span
                >{chart.format(chart.max)}</span
              >
            </div>
          {:else}
            <div class="empty-chart" aria-label="No completed results">
              <div class="empty-line"></div>
              <div class="empty-line"></div>
              <div class="empty-line"></div>
              <span
                >{loading
                  ? "Loading results"
                  : "Waiting for completed runs"}</span
              >
              <div class="empty-axis">
                0<span>{chart.id === "quality" ? "100%" : "—"}</span>
              </div>
            </div>
          {/if}
        </section>
      {/each}
    </div>
    <div class="chart-footnote">
      <span
        >{basis === "api"
          ? "API spend only · compute excluded"
          : "API + compute · missing compute costs are not ranked"} · Failed attempts
        included{completed.some((r) => r.costSource === "estimated")
          ? " · * Estimated cost"
          : ""}</span
      ><span
        >{completed.length} complete {completed.length === 1
          ? "stack"
          : "stacks"}</span
      >
    </div>
    {#if isPilot && !preview}<p class="small-sample">
        Pilot results are directional. Provider logos identify the endpoint
        used; these results do not establish the most efficient provider.
      </p>{/if}

    {#if picked}
      <div class="run-detail">
        <div>
          <span class="eyebrow">SELECTED STACK</span>
          <h3>
            {harnessName(picked.harness)} <span>+ {picked.modelName}</span>
          </h3>
        </div>
        <button
          class="text-button"
          aria-label="Close selected stack"
          on:click={() => (selected = "")}>Close ×</button
        >
        <dl>
          <div>
            <dt>Provider</dt>
            <dd>{picked.providerName}</dd>
          </div>
          <div>
            <dt>Resolved</dt>
            <dd>{picked.passed} / {picked.attempts}</dd>
          </div>
          <div>
            <dt>Cost / success</dt>
            <dd>
              {picked.costPerSuccess === null
                ? "Unavailable"
                : usd(picked.costPerSuccess)}
            </dd>
          </div>
          <div>
            <dt>API spend</dt>
            <dd>
              {picked.apiCostUsd === null
                ? "Unavailable"
                : usd(picked.apiCostUsd)}
            </dd>
          </div>
          <div>
            <dt>Compute spend</dt>
            <dd>
              {picked.computeCostUsd === null
                ? "Not recorded"
                : usd(picked.computeCostUsd)}
            </dd>
          </div>
          <div>
            <dt>Harness version</dt>
            <dd>{picked.harnessVersion}</dd>
          </div>
        </dl>
        <p>
          <code>{picked.model}</code>{picked.notes ? " · " + picked.notes : ""}
        </p>
      </div>
    {/if}

    {#if activityRuns.length}
      <section class="queue-section" aria-labelledby="run-activity-title">
        <h3 id="run-activity-title">
          <button
            id="run-activity-toggle"
            class="queue-heading"
            aria-expanded={activityOpen}
            aria-controls="run-activity-list"
            on:click={() => {
              activityOpen = !activityOpen;
              activityRun = "";
            }}
          >
            <span class="queue-title"
              >Run activity <span class="queue-total"
                >{activityRuns.length}</span
              ></span
            >
            <span class="queue-counts"
              >{#each activityCounts as item, index}{index
                  ? " · "
                  : ""}{item.count}
                {item.status}{/each}</span
            >
            <span class="queue-toggle"
              >{activityOpen ? "Hide runs" : "Show runs"}
              <span aria-hidden="true">{activityOpen ? "−" : "+"}</span></span
            >
          </button>
        </h3>
        <div id="run-activity-list" hidden={!activityOpen}>
          {#if activityOpen}
            <p class="queue-explanation">
              These runs are excluded from comparisons. Open a run for its
              validation and cost details.
            </p>
            {#each activityRuns as row, index (row.id)}
              <div class="queue-row">
                <span class="queue-agent">{harnessName(row.harness)}</span>
                <span class="queue-model"
                  ><img
                    src={getProviderLogo(row.provider) ?? ""}
                    alt={row.providerName}
                  />{row.modelName}</span
                >
                <span
                  class="queue-progress"
                  aria-label={`${row.attempts} of ${row.plannedAttempts} attempts scored`}
                  >{row.attempts} / {row.plannedAttempts}</span
                >
                <span
                  class="run-status"
                  class:running={row.status === "running"}
                  >{row.status === "failed"
                    ? "Failed · excluded"
                    : row.status}</span
                >
                <button
                  class="text-button queue-details-toggle"
                  aria-label={`Details for ${harnessName(row.harness)}, ${row.modelName}, run ${index + 1}`}
                  aria-expanded={activityRun === row.id}
                  aria-controls={`run-activity-notes-${index}`}
                  on:click={() =>
                    (activityRun = activityRun === row.id ? "" : row.id)}
                  >{activityRun === row.id ? "Less −" : "Details +"}</button
                >
                <div
                  id={`run-activity-notes-${index}`}
                  class="queue-details"
                  hidden={activityRun !== row.id}
                >
                  {#if activityRun === row.id}
                    <dl>
                      <div>
                        <dt>API spend</dt>
                        <dd>
                          {row.apiCostUsd === null
                            ? "Unavailable"
                            : usd(row.apiCostUsd)}{row.costSource ===
                          "estimated"
                            ? " · estimated"
                            : ""}
                        </dd>
                      </div>
                      <div>
                        <dt>Harness version</dt>
                        <dd>{row.harnessVersion}</dd>
                      </div>
                      <div>
                        <dt>Model</dt>
                        <dd><code>{row.model}</code></dd>
                      </div>
                    </dl>
                    {#if row.notes}<p>{row.notes}</p>{/if}
                  {/if}
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </section>
    {:else if !completed.length}
      <div class="awaiting">
        <div>
          <span class="eyebrow">REAL RUNS. REPRODUCIBLE RESULTS.</span>
          <h3>
            {rows.length
              ? "No complete runs for these filters."
              : "The lab is getting ready."}
          </h3>
          <p>
            {data.message ??
              "Results will appear as each coding stack completes the same task set. No scores are filled in ahead of the runs."}
          </p>
        </div>
        <button class="outline-button" on:click={refresh}
          >Refresh results ↻</button
        >
      </div>
    {/if}
    <div class="results-footer">
      <span
        >{preview
          ? "Synthetic data · no evaluation claims"
          : data.updatedAt
            ? "Updated " + new Date(data.updatedAt).toLocaleString()
            : "Results refresh automatically every 30 seconds"}</span
      >
      <div>
        {#if results.runs.length && !preview}<a
            href="/benchmarks/results.json"
            download="coding-benchmark-results.json">Download results ↓</a
          >{/if}<button class="text-button" on:click={changeSource}
          >{preview
            ? "Real results ↗"
            : "Preview the comparison UI ↗"}</button
        >
      </div>
    </div>
  </section>

  <section class="next-step">
    <div>
      <span class="eyebrow">02 / MAKE IT YOURS</span>
      <h2>Your tasks. Your infrastructure.</h2>
      <p>
        Public scores are a starting point. Compare the same stacks on the work
        your company actually does.
      </p>
    </div>
    <button class="outline-button" on:click={() => runDialog.showModal()}
      >Plan your evaluation ↗</button
    ><button
      class="text-button catalog-link"
      on:click={() => dispatch("browse", {})}
      >Explore the model catalog →</button
    >
  </section>
</div>

<dialog bind:this={methodDialog} aria-labelledby="method-title">
  <div class="dialog-heading">
    <span class="eyebrow">EVALUATION PROTOCOL</span><button
      class="text-button"
      on:click={() => methodDialog.close()}
      aria-label="Close methodology">Close ×</button
    >
  </div>
  <h2 id="method-title">A fair comparison.</h2>
  <p>
    One cohort means the same dataset version, task IDs, repetition count and
    environment. Different cohorts are never combined into one ranking.
  </p>
  <dl class="method-list">
    <div>
      <dt>Tasks per dollar</dt>
      <dd>
        Passed attempts ÷ total spend across all attempts, including failures
        and retries. Zero or unavailable spend is not ranked.
      </dd>
    </div>
    <div>
      <dt>Quality</dt>
      <dd>
        Passed attempts ÷ all planned attempts. Only completed stacks enter
        charts. The minimum quality control dims configurations below your
        threshold.
      </dd>
    </div>
    <div>
      <dt>Time</dt>
      <dd>
        Mean agent execution time across all attempts, including failed tasks.
        Setup and verification are excluded; this is not tokens per second.
      </dd>
    </div>
    <div>
      <dt>Cost</dt>
      <dd>
        API only excludes compute. API + compute requires both costs. Estimated
        token-based costs are marked with an asterisk; they may differ from your
        invoice.
      </dd>
    </div>
  </dl>
  {#if cohort}<details>
      <summary>Current cohort: {cohort.label}</summary>
      <p>
        {cohort.dataset}
        {cohort.version} · {cohort.scope} · {cohort.environment}
      </p>
      <p>{cohort.taskIds.length} tasks · {cohort.repetitions} trial(s) each</p>
      <ul>
        {#each cohort.taskIds as task}<li><code>{task}</code></li>{/each}
      </ul>
    </details>{/if}
  <p class="dialog-note">
    Fewer than 20 tasks or fewer than 3 trials per task is labeled a pilot.
    Passing these thresholds does not establish statistical significance.
    Provider comparisons require the same model and harness across providers; a
    collection of native endpoints does not establish provider superiority.
    Native harnesses are compared as distinct stacks. Model access alone does
    not establish harness compatibility. Small task sets and single trials do
    not establish statistical superiority.
  </p>
</dialog>

<dialog bind:this={runDialog} aria-labelledby="run-title">
  <div class="dialog-heading">
    <span class="eyebrow">BRING YOUR OWN STACK</span><button
      class="text-button"
      on:click={() => runDialog.close()}
      aria-label="Close evaluation plan">Close ×</button
    >
  </div>
  <h2 id="run-title">Same test. Your setup.</h2>
  <p>
    Run a shared task set with your exact harness, model and provider. Publish
    the results without publishing your credentials.
  </p>
  <ol class="run-steps">
    <li>
      <strong>Choose the work</strong><span
        >Pin the benchmark version and task IDs, or bring private tasks with
        verifiers. Label local subsets explicitly.</span
      >
    </li>
    <li>
      <strong>Connect the stack</strong><span
        >Supply provider access through local environment secrets or a
        restricted LiteLLM gateway key. Set a spend cap before execution.</span
      >
    </li>
    <li>
      <strong>Measure every attempt</strong><span
        >Record passes, failures, retries, agent execution time and API usage.
        Capture compute separately. Compare identical cohorts.</span
      >
    </li>
  </ol>
  <p class="dialog-note">
    This page reads published results; it does not launch jobs or accept API
    keys. The evaluation runner executes separately. Full datasets may require
    infrastructure beyond a local CPU runner.
  </p>
  <a
    class="outline-button"
    href="https://www.tbench.ai/run"
    target="_blank"
    rel="noreferrer">Terminal-Bench runner guide ↗</a
  >
</dialog>

<style>
  .discover-page {
    max-width: 1440px;
    margin: auto;
    padding: 0 42px;
    color: var(--hf-ink);
    font-family: "DM Sans", sans-serif;
  }
  button,
  select,
  input {
    font: inherit;
  }
  button {
    cursor: pointer;
  }
  button:focus-visible,
  a:focus-visible,
  select:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--hf-accent);
    outline-offset: 4px;
  }
  button {
    color: inherit;
  }
  .eyebrow {
    font:
      10px "IBM Plex Mono",
      monospace;
    letter-spacing: 0.12em;
    color: var(--hf-muted);
  }
  h2,
  h3,
  p {
    margin: 0;
  }
  h2 {
    font-size: 26px;
    font-weight: 500;
    letter-spacing: -0.8px;
  }
  h3 {
    font-weight: 500;
  }
  .benchmark-section {
    border-top: 1px solid var(--hf-line);
    padding-top: 30px;
  }
  .section-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 25px;
  }
  .section-top h2 {
    margin-top: 10px;
  }
  .outline-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 22px;
    min-height: 39px;
    padding: 9px 14px;
    border: 1px solid var(--hf-line);
    background: transparent;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    text-decoration: none;
    color: var(--hf-ink);
  }
  .outline-button:hover {
    background: var(--hf-faint);
    border-color: var(--hf-muted);
  }
  .harness-tabs {
    display: flex;
    border-bottom: 1px solid var(--hf-line);
    overflow-x: auto;
    gap: 5px;
  }
  .harness-tabs button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 13px 14px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    white-space: nowrap;
    font-size: 13px;
    color: var(--hf-muted);
  }
  .harness-tabs button.active {
    border-bottom-color: var(--hf-ink);
    color: var(--hf-ink);
    background: var(--hf-faint);
  }
  .harness-mark {
    font:
      17px "IBM Plex Mono",
      monospace;
    display: inline-grid;
    place-items: center;
    min-width: 23px;
    height: 23px;
    color: var(--hf-ink);
  }
  .filter-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 67px;
    border-bottom: 1px solid var(--hf-line);
  }
  .data-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .dataset-label {
    font-size: 13px;
    font-weight: 500;
  }
  .dataset-label > span {
    color: var(--hf-muted);
    margin-left: 3px;
  }
  .status-chip {
    font:
      9px "IBM Plex Mono",
      monospace;
    letter-spacing: 0.08em;
    border: 1px solid var(--hf-line);
    padding: 5px 6px;
    border-radius: 3px;
    white-space: nowrap;
  }
  .sample-label {
    font-size: 11px;
    color: var(--hf-muted);
  }
  .text-button {
    border: 0;
    background: transparent;
    padding: 5px 0;
    font-size: 11px;
    color: var(--hf-muted);
    white-space: nowrap;
  }
  .text-button:hover {
    color: var(--hf-ink);
  }
  .comparison-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 30px;
    padding: 20px 0 24px;
  }
  .quality-control {
    width: 235px;
    max-width: 100%;
    font-size: 12px;
  }
  .quality-control > span {
    display: flex;
    justify-content: space-between;
  }
  .quality-control strong {
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .quality-control input {
    width: 100%;
    margin: 10px 0 0;
    accent-color: var(--hf-ink);
    height: 3px;
    display: block;
    cursor: pointer;
  }
  .right-controls {
    display: flex;
    gap: 24px;
  }
  .select-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--hf-muted);
  }
  select {
    background: var(--hf-bg);
    color: var(--hf-ink);
    border: 1px solid var(--hf-line);
    border-radius: 3px;
    font-size: 12px;
    padding: 7px 22px 7px 8px;
    max-width: 240px;
  }
  .pilot-notice {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 12px 15px;
    margin-bottom: 16px;
    border: 1px solid var(--hf-line);
    border-radius: 3px;
    font-size: 11px;
    line-height: 1.6;
    color: var(--hf-muted);
  }
  .pilot-notice strong {
    font:
      10px "IBM Plex Mono",
      monospace;
    letter-spacing: 0.08em;
    color: var(--hf-ink);
  }
  .value-summary {
    display: flex;
    align-items: center;
    gap: 16px;
    border: 1px solid var(--hf-line);
    border-left: 2px solid var(--hf-accent);
    padding: 16px 20px;
    margin-bottom: 20px;
    border-radius: 3px;
  }
  .summary-icon {
    font-size: 27px;
    color: var(--hf-accent);
  }
  .value-summary > div:not(.summary-number) {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .value-summary strong {
    font-size: 12px;
    font-weight: 500;
  }
  .value-summary > div > span {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--hf-muted);
    font-size: 12px;
  }
  .value-summary img,
  .model-line img,
  .queue-model img {
    width: 17px;
    height: 17px;
    object-fit: contain;
    background: #fff;
    padding: 2px;
    border-radius: 3px;
    box-sizing: border-box;
  }
  .separator {
    opacity: 0.5;
    margin: 0 3px;
  }
  .value-summary .summary-number {
    margin-left: auto;
    font-size: 30px;
    font-weight: 500;
    letter-spacing: -1px;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .summary-number > span {
    font-size: 10px !important;
    letter-spacing: 0;
    margin-top: 5px;
  }
  .charts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }
  .chart-panel {
    border: 1px solid var(--hf-line);
    border-radius: 5px;
    padding: 20px 20px 14px;
    min-width: 0;
  }
  .chart-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .chart-title h3 {
    font-size: 18px;
    letter-spacing: -0.4px;
  }
  .chart-title > span {
    font-size: 20px;
    color: var(--hf-muted);
  }
  .chart-caption {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    color: var(--hf-muted);
    font-size: 10px;
    line-height: 1.5;
    margin: 6px 0 24px;
  }
  .chart-caption > span:last-child {
    text-align: right;
    font-size: 9px;
  }
  .chart-rows {
    display: flex;
    flex-direction: column;
    gap: 19px;
  }
  .chart-row {
    text-align: left;
    background: transparent;
    padding: 0;
    border: 0;
    display: block;
    border-radius: 2px;
  }
  .chart-row.selected {
    outline: 1px solid var(--hf-accent);
    outline-offset: 7px;
  }
  .row-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .agent-name {
    font-weight: 500;
  }
  .row-top strong {
    font-size: 14px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .model-line {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 5px;
    font-size: 10px;
    color: var(--hf-muted);
    min-width: 0;
  }
  .model-line > span:first-of-type {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .floor-label {
    margin-left: auto;
    font-size: 8px;
    white-space: nowrap;
  }
  .bar-track {
    display: block;
    height: 7px;
    background: var(--hf-faint);
    margin-top: 9px;
    border-radius: 1px;
    overflow: hidden;
  }
  .bar {
    display: block;
    height: 100%;
    background: var(--hf-bar);
    transition: width 0.25s ease;
    border-radius: 1px;
  }
  .value-chart .bar {
    background: #678c7b;
  }
  .chart-row.selected .bar {
    background: var(--hf-accent);
  }
  .below-floor {
    opacity: 0.45;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    font:
      9px "IBM Plex Mono",
      monospace;
    color: var(--hf-muted);
    border-top: 1px solid var(--hf-line);
    padding-top: 9px;
    margin-top: 22px;
  }
  .chart-footnote {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    padding: 13px 0;
    color: var(--hf-muted);
    font-size: 10px;
    line-height: 1.5;
  }
  .empty-chart {
    height: 210px;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    padding-bottom: 25px;
  }
  .empty-line {
    border-top: 1px dashed var(--hf-line);
  }
  .empty-chart > span {
    position: absolute;
    top: 45%;
    left: 0;
    right: 0;
    text-align: center;
    color: var(--hf-muted);
    font-size: 11px;
    background: var(--hf-bg);
    padding: 9px;
  }
  .empty-axis {
    display: flex;
    justify-content: space-between;
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    border-top: 1px solid var(--hf-line);
    padding-top: 9px;
    font:
      9px "IBM Plex Mono",
      monospace;
    color: var(--hf-muted);
  }
  .queue-section {
    margin-top: 25px;
    border: 1px solid var(--hf-line);
    border-radius: 4px;
  }
  .queue-heading {
    display: flex;
    width: 100%;
    gap: 16px;
    align-items: center;
    padding: 16px 18px;
    border: 0;
    background: transparent;
    text-align: left;
  }
  .queue-heading:hover {
    background: var(--hf-faint);
  }
  .queue-title {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
  }
  .queue-total {
    color: var(--hf-muted);
    font-size: 11px;
    margin-left: 6px;
    font-variant-numeric: tabular-nums;
  }
  .queue-counts {
    font-size: 11px;
    font-weight: 400;
    color: var(--hf-muted);
    line-height: 1.6;
  }
  .queue-toggle {
    margin-left: auto;
    font-size: 11px;
    font-weight: 400;
    white-space: nowrap;
    color: var(--hf-muted);
  }
  .queue-toggle > span {
    margin-left: 8px;
  }
  .queue-explanation {
    border-top: 1px solid var(--hf-line);
    padding: 14px 18px 0;
    font-size: 11px;
    line-height: 1.6;
    color: var(--hf-muted);
  }
  .queue-row {
    display: grid;
    grid-template-columns: 115px minmax(0, 1fr) 65px 110px 65px;
    gap: 12px;
    align-items: center;
    padding: 14px 18px;
    border-bottom: 1px solid var(--hf-line);
    font-size: 12px;
  }
  .queue-row:last-child {
    border-bottom: 0;
  }
  .queue-model {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--hf-muted);
  }
  .queue-progress {
    color: var(--hf-muted);
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    text-align: right;
  }
  .run-status {
    text-transform: capitalize;
    text-align: right;
    font-size: 11px;
    color: var(--hf-muted);
  }
  .run-status.running {
    color: #54916f;
  }
  .queue-details {
    grid-column: 1/-1;
  }
  .queue-details-toggle {
    text-align: right;
  }
  .queue-details dl {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 30px;
    margin: 0 0 10px;
    padding-top: 10px;
  }
  .queue-details dt {
    font-size: 10px;
    color: var(--hf-muted);
    margin-bottom: 5px;
  }
  .queue-details dd {
    margin: 0;
    font-size: 11px;
    overflow-wrap: anywhere;
  }
  .queue-details p {
    font-size: 11px;
    color: var(--hf-muted);
    line-height: 1.6;
  }
  .awaiting {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 28px;
    border-top: 1px solid var(--hf-line);
    padding: 30px 0 24px;
    margin-top: 15px;
  }
  .awaiting h3 {
    margin: 9px 0;
    font-size: 20px;
  }
  .awaiting p {
    max-width: 560px;
    color: var(--hf-muted);
    font-size: 12px;
    line-height: 1.7;
  }
  .awaiting .outline-button {
    flex-shrink: 0;
  }
  .results-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    border-bottom: 1px solid var(--hf-line);
    padding: 20px 0;
    color: var(--hf-muted);
    font-size: 10px;
  }
  .results-footer > div {
    display: flex;
    gap: 20px;
    align-items: center;
  }
  .results-footer a {
    color: inherit;
    text-decoration: none;
    font-size: 11px;
  }
  .next-step {
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
    padding: 45px 0 35px;
  }
  .next-step > div {
    flex: 1;
    min-width: 260px;
  }
  .next-step h2 {
    margin: 10px 0;
    font-size: 26px;
  }
  .next-step p {
    font-size: 12px;
    color: var(--hf-muted);
    line-height: 1.7;
    max-width: 490px;
  }
  .catalog-link {
    width: 100%;
    text-align: left;
    margin-top: 6px;
  }
  .preview-notice {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 15px;
    margin-top: 15px;
    background: var(--hf-faint);
    border: 1px dashed var(--hf-muted);
    border-radius: 3px;
    font-size: 11px;
    line-height: 1.6;
  }
  .preview-notice strong {
    white-space: nowrap;
    font-weight: 500;
  }
  .preview-notice > span {
    color: var(--hf-muted);
  }
  .preview-notice button {
    font-size: 10px;
    background: transparent;
    border: 0;
    padding: 0;
    white-space: nowrap;
    margin-left: auto;
  }
  .error-notice,
  .small-sample {
    font-size: 11px;
    line-height: 1.6;
    color: var(--hf-warning);
    padding: 12px 0;
  }
  .small-sample {
    padding-top: 0;
  }
  .run-detail {
    position: relative;
    padding: 20px;
    border: 1px solid var(--hf-line);
    border-radius: 4px;
    margin: 15px 0;
  }
  .run-detail h3 {
    font-size: 17px;
    margin: 8px 0 18px;
  }
  .run-detail h3 span {
    color: var(--hf-muted);
  }
  .run-detail > button {
    position: absolute;
    top: 15px;
    right: 20px;
  }
  .run-detail dl {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin: 0;
  }
  .run-detail dt {
    color: var(--hf-muted);
    font-size: 10px;
  }
  .run-detail dd {
    font-size: 12px;
    margin: 6px 0 0;
    overflow-wrap: anywhere;
  }
  .run-detail p {
    font-size: 11px;
    color: var(--hf-muted);
    line-height: 1.7;
    margin-top: 20px;
  }
  .run-detail code {
    font-size: 10px;
  }
  dialog {
    box-sizing: border-box;
    width: min(580px, calc(100vw - 36px));
    max-height: 85vh;
    overflow: auto;
    padding: 28px;
    background: var(--hf-dialog);
    color: var(--hf-ink);
    border: 1px solid var(--hf-line);
    border-radius: 6px;
    font-family: "DM Sans", sans-serif;
  }
  dialog::backdrop {
    background: #0008;
  }
  .dialog-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 22px;
  }
  dialog h2 {
    font-size: 27px;
    margin: 0 0 14px;
  }
  dialog p {
    font-size: 13px;
    color: var(--hf-muted);
    line-height: 1.8;
  }
  .method-list {
    margin: 25px 0;
  }
  .method-list > div {
    border-top: 1px solid var(--hf-line);
    padding: 14px 0;
  }
  .method-list dt {
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 7px;
  }
  .method-list dd {
    margin: 0;
    font-size: 12px;
    color: var(--hf-muted);
    line-height: 1.7;
  }
  dialog details {
    border: 1px solid var(--hf-line);
    padding: 14px;
    font-size: 12px;
    margin: 20px 0;
  }
  dialog summary {
    cursor: pointer;
  }
  dialog details p {
    margin-top: 12px;
    font-size: 11px;
  }
  dialog ul {
    max-height: 170px;
    overflow: auto;
    padding-left: 18px;
    font-size: 10px;
    line-height: 1.8;
  }
  dialog .dialog-note {
    font-size: 11px;
    border-top: 1px solid var(--hf-line);
    padding-top: 15px;
    margin-top: 20px;
  }
  .run-steps {
    padding: 0;
    list-style: none;
    counter-reset: steps;
    margin: 25px 0;
  }
  .run-steps li {
    counter-increment: steps;
    position: relative;
    padding: 16px 0 16px 35px;
    border-top: 1px solid var(--hf-line);
  }
  .run-steps li:before {
    content: "0" counter(steps);
    position: absolute;
    left: 0;
    top: 18px;
    font:
      10px "IBM Plex Mono",
      monospace;
    color: var(--hf-muted);
  }
  .run-steps strong {
    display: block;
    font-size: 13px;
    font-weight: 500;
  }
  .run-steps span {
    display: block;
    color: var(--hf-muted);
    font-size: 12px;
    line-height: 1.8;
    margin-top: 6px;
  }
  dialog .outline-button {
    margin-top: 20px;
  }
  @media (min-width: 1300px) {
    .chart-panel {
      padding: 22px 24px 16px;
    }
    .chart-caption {
      font-size: 11px;
    }
    .chart-caption > span:last-child {
      font-size: 10px;
    }
    .chart-row .model-line {
      font-size: 11px;
    }
    .charts {
      gap: 20px;
    }
    .row-top {
      font-size: 13px;
    }
    .bar-track {
      height: 9px;
    }
    .chart-rows {
      gap: 21px;
    }
  }
  @media (max-width: 950px) {
    .discover-page {
      padding: 0 25px;
    }
    .harness-tabs button {
      padding: 12px 10px;
      font-size: 12px;
      gap: 5px;
    }
    .harness-mark {
      min-width: 18px;
      font-size: 15px;
    }
    .charts {
      gap: 10px;
    }
    .chart-panel {
      padding: 16px 12px 12px;
    }
    .chart-title h3 {
      font-size: 16px;
    }
    .chart-caption {
      flex-direction: column;
      gap: 1px;
      margin-bottom: 20px;
    }
    .chart-caption > span:last-child {
      text-align: left;
    }
    .row-top {
      font-size: 11px;
    }
    .row-top strong {
      font-size: 13px;
    }
    .model-line {
      font-size: 9px;
      gap: 4px;
    }
    .floor-label {
      display: none;
    }
    .right-controls {
      gap: 12px;
    }
    .select-wrap {
      gap: 6px;
    }
    .select-wrap > span {
      font-size: 10px;
    }
    .quality-control {
      width: 200px;
    }
    .sample-label {
      font-size: 10px;
    }
    .preview-notice {
      flex-wrap: wrap;
    }
    .preview-notice > span {
      flex: 1;
      min-width: 220px;
    }
  }
  @media (max-width: 650px) {
    .discover-page {
      padding: 0 18px;
    }
    .section-top {
      align-items: flex-start;
    }
    .section-top h2 {
      font-size: 22px;
    }
    .section-top > .outline-button {
      font-size: 10px;
      padding: 8px;
      gap: 5px;
      min-height: 34px;
      margin-top: 18px;
    }
    .filter-row {
      padding: 13px 0;
    }
    .data-controls {
      gap: 8px;
    }
    .data-controls .sample-label {
      width: 100%;
    }
    .comparison-controls {
      align-items: stretch;
      flex-direction: column;
      gap: 18px;
    }
    .quality-control {
      width: 100%;
    }
    .right-controls {
      justify-content: space-between;
      gap: 8px;
    }
    .select-wrap select {
      font-size: 11px;
      max-width: 165px;
    }
    .charts {
      grid-template-columns: 1fr;
    }
    .chart-panel {
      padding: 20px;
    }
    .chart-caption {
      flex-direction: row;
    }
    .chart-title h3 {
      font-size: 18px;
    }
    .chart-rows {
      gap: 18px;
    }
    .row-top {
      font-size: 13px;
    }
    .model-line {
      font-size: 11px;
    }
    .bar-track {
      height: 8px;
    }
    .chart-footnote {
      font-size: 9px;
      gap: 10px;
    }
    .value-summary {
      padding: 14px 12px;
      gap: 10px;
    }
    .summary-icon {
      display: none;
    }
    .value-summary > div > span {
      font-size: 10px;
      gap: 4px;
      flex-wrap: wrap;
    }
    .value-summary .summary-number {
      font-size: 25px;
      flex-shrink: 0;
    }
    .summary-number > span {
      font-size: 8px !important;
    }
    .queue-heading {
      flex-wrap: wrap;
      gap: 8px;
      padding: 14px 12px;
    }
    .queue-counts {
      order: 3;
      width: 100%;
      font-size: 10px;
    }
    .queue-explanation {
      padding: 12px 12px 0;
    }
    .queue-row {
      grid-template-columns: 95px minmax(0, 1fr) 55px;
      gap: 8px;
      padding: 13px 12px;
      font-size: 11px;
    }
    .queue-model {
      font-size: 10px;
      overflow-wrap: anywhere;
    }
    .queue-progress {
      font-size: 10px;
    }
    .run-status {
      grid-column: 1 / 3;
      font-size: 10px;
      text-align: left;
    }
    .queue-details-toggle {
      grid-column: 3;
    }
    .awaiting {
      flex-direction: column;
      align-items: flex-start;
    }
    .results-footer {
      align-items: flex-start;
      flex-direction: column;
      gap: 10px;
    }
    .next-step {
      padding-top: 30px;
    }
    .next-step h2 {
      font-size: 23px;
    }
    .run-detail dl {
      grid-template-columns: repeat(2, 1fr);
    }
    .run-detail h3 {
      max-width: 80%;
      line-height: 1.5;
    }
    .empty-chart {
      height: 145px;
    }
    .preview-notice {
      gap: 6px;
    }
    .preview-notice button {
      margin: 5px 0 0;
    }
    .preview-notice > span {
      min-width: 100%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bar {
      transition: none;
    }
  }
</style>
