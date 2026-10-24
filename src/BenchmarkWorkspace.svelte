<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import PageHero from "./PageHero.svelte";
  import { getProviderLogo } from "./providers";
  import {
    demoModels,
    demoWorkloads,
    estimateSpend,
    type WorkloadId,
    type DatasetSource,
  } from "./discoverDemo";
  import type { BenchmarkReport } from "./benchmark/types";
  import ReportDetails from "./benchmark/ReportDetails.svelte";
  import ReportSummary from "./benchmark/ReportSummary.svelte";
  export let report: BenchmarkReport | null = null;
  export let reportIcon = "";
  export let showRunLink = false;
  let copyLabel = "Copy command";
  const runCommand =
    "git clone https://github.com/BerriAI/models.litellm.ai.git && cd models.litellm.ai && npm ci && npm run benchmark";
  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(runCommand);
      copyLabel = "Copied";
    } catch {
      copyLabel = "Select and copy the command above";
    }
  }
  const dispatch = createEventDispatcher<{ browse: { query?: string } }>();
  let workload: string = report?.workloads[0]?.id ?? "extract";
  let source: DatasetSource = report ? "private" : "public";
  let selected: string = report?.workloads[0]?.rows[1]?.id ?? "kimi";
  let qualityFloor = report ? 95 : 99;
  let activeMetric = "quality";
  let volume = 200000;
  let runDialog: HTMLDialogElement;
  let methodDialog: HTMLDialogElement;
  $: workloadIds = report
    ? report.workloads.map((w) => w.id)
    : ["extract", "code", "support", "search"];
  $: measured = report?.workloads.find((w) => w.id === workload);
  $: config = measured
    ? {
        ...measured,
        floor: 95,
        volume: Math.round((measured.population * 30) / report!.periodDays),
      }
    : demoWorkloads[workload as WorkloadId] ?? demoWorkloads.extract;
  $: if (report && measured)
    volume = Math.round((measured.population * 30) / report.periodDays);
  const workloadName = (id: string) =>
    report?.workloads.find((w) => w.id === id)?.name ??
    demoWorkloads[id as WorkloadId]?.name;
  const logo = (provider: string) =>
    report ? reportIcon : getProviderLogo(provider);
  const display = (v: number, format: (v: number) => string) =>
    Number.isFinite(v) ? format(v) : "Not measured";
  const usd = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  const decimalCost = (value: number) =>
    "$" + value.toFixed(value < 0.1 ? 3 : 2);
  $: rows = measured
    ? measured.rows.map((row) => ({
        ...row,
        provider: "litellm_proxy",
        providerName: "Gateway model",
        quality: row.quality ?? NaN,
        speed: row.speed ?? NaN,
        cost: row.cost ?? NaN,
        successCost: row.successCost ?? NaN,
      }))
    : demoModels.map((model, index) => {
        const [quality, speed, cost] =
          demoWorkloads[workload as WorkloadId]?.[source][index] ??
          demoWorkloads.extract[source][index];
        return {
          ...model,
          quality,
          speed,
          cost,
          successCost: cost / (quality / 100),
        };
      });
  $: candidate = rows.find((row) => row.id === selected) ?? rows[0];
  $: baseline = rows.find((row) => row.id === config.baseline) ?? rows[0];
  $: spend = estimateSpend(
    baseline.cost,
    candidate.cost,
    candidate.quality,
    qualityFloor,
    volume,
  );
  $: maxSpend = Math.max(spend.current, spend.candidate, 1);
  $: speedMax = Math.ceil(
    Math.max(
      1,
      ...rows.map((row) => (Number.isFinite(row.speed) ? row.speed : 0)),
    ),
  );
  $: costMax =
    Math.ceil(
      Math.max(
        0.01,
        ...rows.map((row) =>
          Number.isFinite(row.successCost) ? row.successCost : 0,
        ),
      ) * 100,
    ) / 100;
  $: charts = [
    {
      id: "quality",
      name: "Quality",
      subtitle: report ? "Requests passing checks · %" : "Tasks passed · %",
      direction: "HIGHER IS BETTER",
      max: 100,
      format: (v: number) => v.toFixed(1) + "%",
      get: (r: (typeof rows)[number]) => r.quality,
    },
    {
      id: "speed",
      name: report ? "Response time" : "Task time",
      subtitle: report
        ? "Request latency · p95 seconds"
        : "End-to-end · p95 seconds",
      direction: "LOWER IS BETTER",
      max: speedMax,
      format: (v: number) => v.toFixed(1) + "s",
      get: (r: (typeof rows)[number]) => r.speed,
    },
    {
      id: "cost",
      name: "Cost",
      subtitle: report ? "USD / passing request" : "USD / successful task",
      direction: "LOWER IS BETTER",
      max: costMax,
      format: decimalCost,
      get: (r: (typeof rows)[number]) => r.successCost,
    },
  ];
  function setWorkload(next: string) {
    workload = next;
    qualityFloor = report ? 95 : demoWorkloads[next as WorkloadId].floor;
    volume = report ? volume : demoWorkloads[next as WorkloadId].volume;
  }
</script>

<div class="discover-page">
  <slot name="hero">
    {#if report}
      <header class="report-heading">
        <div>
          <h1 id="evaluate-title">
            {report.synthetic ? "Sample report" : "Evaluation report"}
          </h1>
          <p>
            {report.synthetic
              ? "All models, traffic, costs, and scores here are fictional."
              : `${report.heldout.toLocaleString()} held-out requests · ${report.periodDays} days · ${report.status}`}
          </p>
        </div>
        {#if showRunLink}<a href="/evaluate">Run on your traffic ↗</a>{/if}
      </header>
    {:else}
      <PageHero
        id="evaluate"
        title="EVALUATE"
        eyebrow="YOUR GATEWAY · LOCAL REPORT"
        description="Quality, speed, and cost on your gateway traffic."
      />
    {/if}
  </slot>
  {#if report && report.workloads.length}<ReportSummary
      {report}
      {qualityFloor}
    />{/if}
  <section class="benchmarks ruled" aria-label="Evaluation report">
    <div class="section-heading">
      <div class="heading-pair">
        <h2 id="benchmarks-title">
          {report ? "Compare models" : "Benchmarks"}
        </h2>
        {#if !report}<span class="eyebrow version">DEMO DATA</span>{/if}
      </div>
      {#if !report}<div
          class="source-toggle"
          aria-label="Benchmark data source"
        >
          <button
            class:active={source === "public"}
            aria-pressed={source === "public"}
            on:click={() => (source = "public")}
            >Public benchmarks · demo</button
          >
          <button
            class:active={source === "private"}
            aria-pressed={source === "private"}
            on:click={() => (source = "private")}
            >Your data <span>· demo</span></button
          >
        </div>{/if}
    </div>
    {#if !report || report.workloads.length}
      <div class="toolbar">
        <div class="workloads" aria-label="Choose a workload">
          {#each workloadIds as id}<button
              class:active={id === workload}
              aria-pressed={id === workload}
              on:click={() => setWorkload(id)}>{workloadName(id)}</button
            >{/each}
        </div>
        <button class="method" on:click={() => methodDialog.showModal()}
          >Methodology ↗</button
        >
      </div>
      <div class="metric-tabs" aria-label="Comparison metric">
        {#each charts as chart}<button
            aria-pressed={activeMetric === chart.id}
            class:active={activeMetric === chart.id}
            on:click={() => (activeMetric = chart.id)}>{chart.name}</button
          >{/each}
      </div>
      <div class="charts">
        {#each charts as chart}
          <section
            class="chart-panel"
            class:active-metric={activeMetric === chart.id}
            aria-label={chart.name + " comparison"}
          >
            <div class="chart-heading">
              <h3>
                {chart.name}<span>{chart.id === "quality" ? "↑" : "↓"}</span>
              </h3>
              <span class="direction">{chart.direction}</span>
            </div>
            <p class="chart-unit">{chart.subtitle}</p>
            <div class="chart-rows">
              {#each rows as row}
                <button
                  class="chart-row"
                  class:selected={row.id === selected}
                  aria-pressed={row.id === selected}
                  aria-label={"Select " +
                    row.name +
                    ", " +
                    chart.name +
                    " " +
                    display(chart.get(row), chart.format)}
                  on:click={() => (selected = row.id)}
                >
                  <span class="row-label"
                    ><span class="model-name"
                      ><img
                        class="provider-logo"
                        src={logo(row.provider)}
                        alt={row.providerName}
                      />{row.name}</span
                    ><span class="value"
                      >{display(chart.get(row), chart.format)}</span
                    ></span
                  >
                  <span class="bar-track"
                    ><span
                      class="bar"
                      style={"width:" +
                        (Number.isFinite(chart.get(row))
                          ? Math.min(100, (chart.get(row) / chart.max) * 100)
                          : 0) +
                        "%"}
                    ></span></span
                  >
                </button>
              {/each}
            </div>
            <div class="axis" aria-hidden="true">
              <span>{chart.id === "cost" ? "$0" : "0"}</span><span
                >{chart.id === "quality"
                  ? "50"
                  : chart.format(chart.max / 2)}</span
              ><span
                >{chart.id === "quality"
                  ? "100%"
                  : chart.format(chart.max)}</span
              >
            </div>
          </section>
        {/each}
      </div>
      <div class="chart-footnote">
        <span class="illustrative"
          ><i></i>
          {report
            ? report.synthetic
              ? "Simulated measurements"
              : "Measured on held-out requests"
            : "Illustrative data"} · {config.sample.toLocaleString()}
          {report ? "requests" : "sample tasks"}</span
        ><span>Click a model to compare</span>
      </div>

      {#if source === "public"}
        <div class="replay-callout">
          <div>
            <h2>Same benchmark. Your data.</h2>
            <p>See what changes on the requests you actually run.</p>
          </div>
          <button class="primary" on:click={() => runDialog.showModal()}
            >Run on your data <span>↗</span></button
          >
        </div>
      {:else}
        <details class="calculator">
          <summary
            >Explore monthly costs <span>Adjust volume and quality</span
            ></summary
          >
          <section class="savings" aria-label="Monthly cost estimate">
            <div class="savings-heading">
              <div>
                <div class="eyebrow">
                  {report
                    ? "AT YOUR VOLUME · EXPLORATORY ESTIMATE"
                    : "AT YOUR VOLUME · ILLUSTRATIVE ESTIMATE"}
                </div>
                <h2 class="savings-number">
                  {!spend.valid
                    ? report
                      ? "Not enough comparable data"
                      : "Enter your volume"
                    : !spend.eligible
                      ? "Below your quality floor"
                      : spend.difference > 0
                        ? usd(spend.difference) + " less / month"
                        : spend.difference < 0
                          ? usd(-spend.difference) + " more / month"
                          : "Same monthly spend"}
                </h2>
                <p class:warning={!spend.eligible}>
                  {!spend.valid
                    ? report
                      ? "Complete quality and cost measurements are needed for this comparison."
                      : "Enter a positive volume and a quality floor from 0–100%."
                    : !spend.eligible
                      ? candidate.quality +
                        "% passed · " +
                        qualityFloor +
                        "% required. Savings not counted."
                      : spend.current === 0
                        ? "Baseline recorded cost is $0. Compare absolute spend."
                        : (
                            (Math.abs(spend.difference) / spend.current) *
                            100
                          ).toFixed(0) +
                          "% " +
                          (spend.difference >= 0 ? "lower" : "higher") +
                          " spend · Includes unsuccessful attempts."}
                </p>
              </div>
              <div class="savings-controls">
                <label
                  >Requests / month<input
                    aria-label="Requests per month"
                    type="number"
                    min="1"
                    step="1000"
                    bind:value={volume}
                  /></label
                ><label
                  >Minimum quality %<input
                    aria-label="Minimum quality percentage"
                    type="number"
                    min="0"
                    max="100"
                    step=".1"
                    bind:value={qualityFloor}
                  /></label
                >
              </div>
            </div>
            {#if spend.valid}<div class="spend-bars">
                {#each [{ model: baseline, cost: spend.current, current: true }, { model: candidate, cost: spend.candidate, current: false }] as item}
                  <div>
                    <div class="spend-label">
                      <span class="model-name"
                        ><img
                          class="provider-logo"
                          src={logo(item.model.provider)}
                          alt={item.model.providerName}
                        />{item.model.name}<small
                          >{item.current ? "CURRENT" : "SELECTED"}</small
                        ></span
                      ><strong>{usd(item.cost)}</strong>
                    </div>
                    <div class="spend-track">
                      <div
                        class="spend-bar"
                        class:current={item.current}
                        style={"width:" + (item.cost / maxSpend) * 100 + "%"}
                      ></div>
                    </div>
                  </div>
                {/each}
              </div>{/if}
          </section>
        </details>
      {/if}
    {:else}
      <p>
        No evaluable requests were available. Your coverage and next steps are
        below.
      </p>
    {/if}
    {#if report}<ReportDetails {report} workload={measured} />{/if}
  </section>

  {#if !report}<div class="explore-strip">
      <button class="explore-link" on:click={() => dispatch("browse", {})}
        ><svg viewBox="0 0 68 44" aria-hidden="true"
          ><path
            d="M4 12 32 0 60 12 32 25ZM4 12v9l28 13 28-13v-9M4 24v9l28 11 28-11v-9M32 25v19"
          /></svg
        ><span
          ><span class="eyebrow">THE COMPLETE CATALOG</span><strong
            >Search every model & provider</strong
          ></span
        ><span class="arrow">↗</span></button
      >
      <button class="explore-link" on:click={() => runDialog.showModal()}
        ><svg viewBox="0 0 68 44" aria-hidden="true"
          ><path
            d="M8 10 27 0 47 10 27 20ZM8 10v22l19 11 20-11V10M27 20v23M47 20h16M58 15l5 5-5 5"
            stroke-dasharray="2 2"
          /><path d="M18 17v13l9 5 10-5V17" /></svg
        ><span
          ><span class="eyebrow">EVALUATE YOUR GATEWAY</span><strong
            >Run on your data</strong
          ></span
        ><span class="arrow">↗</span></button
      >
    </div>{/if}
  <footer>
    <span>BUILT ON LITELLM</span><span
      >{report
        ? (report.synthetic ? "Sample report · " : "Local report · ") +
          report.createdAt.slice(0, 10)
        : "Evaluation demo uses illustrative data"}</span
    ><a
      href="https://github.com/BerriAI/models.litellm.ai"
      target="_blank"
      rel="noreferrer">OPEN SOURCE ↗</a
    >
  </footer>
</div>

<dialog bind:this={runDialog} aria-labelledby="run-title">
  <div class="dialog-top">
    <span class="eyebrow">RUN THE SAME RECIPE</span><button
      aria-label="Close run dialog"
      on:click={() => runDialog.close()}>×</button
    >
  </div>
  <h2 id="run-title">YOUR DATA.<br />YOUR ANSWER.</h2>
  <p>Compare the same models on a dataset from your LiteLLM gateway.</p>
  <p>
    Requires Node.js 22+ and Git. Run locally, select your gateway and models,
    then open your private HTML report.
  </p>
  <pre class="run-command"><code>{runCommand}</code></pre>
  <button class="primary full" on:click={copyCommand}>{copyLabel}</button>
  <p class="demo-note">
    Credentials are read locally from your environment or entered in the
    terminal. Evaluation requests go through your gateway to the models you
    select. No results are uploaded to this website.
  </p>
  <a class="method" href="/evaluate/sample">View sample report ↗</a>
</dialog>
<dialog bind:this={methodDialog} aria-labelledby="method-title">
  <div class="dialog-top">
    <span class="eyebrow">BENCHMARK RECIPE</span><button
      aria-label="Close methodology"
      on:click={() => methodDialog.close()}>×</button
    >
  </div>
  <h2 id="method-title">HOW IT'S MEASURED.</h2>
  {#if report}<p>
      Requests are sampled by session, with separate development and evaluation
      sessions. Checks are inferred from supplied instructions. Quality includes
      deterministic validation and a model judge. Tool turns are assessed
      against recorded history, not executed. Open Evaluation details for
      coverage and inferred criteria.
    </p>{:else}<p>
      All values in this design prototype are synthetic, including the public
      benchmark view. They are not claims about model performance.
    </p>
    <dl>
      <dt>Quality</dt>
      <dd>Tasks passing the workload rubric</dd>
      <dt>Task time</dt>
      <dd>p95 end-to-end duration</dd>
      <dt>Cost / success</dt>
      <dd>Total spend ÷ successful tasks</dd>
      <dt>Monthly estimate</dt>
      <dd>Cost per attempt × task volume</dd>
    </dl>
    <p>
      Real reports would pin the model, provider, settings, dataset, scorer, and
      run date. Quality thresholds here are exploratory, not deployment
      approval.
    </p>{/if}
</dialog>

<style>
  .run-command {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--hf-faint);
    padding: 16px;
    font-size: 12px;
  }
  .discover-page {
    max-width: 1400px;
    margin: auto;
    padding: 0 44px;
    color: var(--hf-ink);
  }
  .eyebrow {
    font:
      10px "IBM Plex Mono",
      monospace;
    letter-spacing: 1.3px;
    color: var(--hf-muted);
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .ruled {
    border-top: 1px solid var(--hf-line);
    position: relative;
  }
  .ruled:before,
  .ruled:after {
    content: "+";
    position: absolute;
    top: -12px;
    font:
      15px "IBM Plex Mono",
      monospace;
    left: -5px;
    color: var(--hf-muted);
  }
  .ruled:after {
    left: auto;
    right: -5px;
  }
  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 25px 0 22px;
  }
  .heading-pair {
    display: flex;
    align-items: center;
    gap: 20px;
  }
  h2 {
    font:
      500 23px/1.3 "DM Sans",
      sans-serif;
    letter-spacing: -0.5px;
    margin: 0;
  }
  .version {
    font-size: 8px;
    letter-spacing: 1.1px;
    border: 1px solid var(--hf-line);
    padding: 4px 6px;
  }
  button {
    font-family: "DM Sans", sans-serif;
    border: 0;
    border-radius: 0;
    background: none;
    color: inherit;
    cursor: pointer;
  }
  button:focus-visible,
  a:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--hf-ink);
    outline-offset: 4px;
  }
  .source-toggle {
    display: flex;
    gap: 3px;
    border: 1px solid var(--hf-line);
    padding: 3px;
  }
  .source-toggle button {
    padding: 8px 13px;
    font-size: 11px;
    color: var(--hf-muted);
  }
  .source-toggle button.active {
    background: var(--hf-accent);
    color: var(--hf-button-ink);
  }
  .source-toggle button span {
    opacity: 0.65;
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 24px;
  }
  .workloads {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }
  .workloads button {
    font-size: 11px;
    padding: 7px 12px;
    border: 1px solid transparent;
    color: var(--hf-muted);
  }
  .workloads button:first-child {
    margin-left: -1px;
  }
  .workloads button.active {
    border-color: var(--hf-line);
    color: var(--hf-ink);
    background: var(--hf-faint);
  }
  .workloads button:hover {
    color: var(--hf-ink);
  }
  .method {
    font:
      10px "IBM Plex Mono",
      monospace;
    color: var(--hf-muted);
    white-space: nowrap;
    padding: 5px 0;
  }
  .charts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border-top: 1px solid var(--hf-line);
    border-bottom: 1px solid var(--hf-line);
  }
  .chart-panel {
    padding: 24px 29px 18px;
    min-width: 0;
  }
  .chart-panel:first-child {
    padding-left: 0;
  }
  .chart-panel:last-child {
    padding-right: 0;
  }
  .chart-panel + .chart-panel {
    border-left: 1px solid var(--hf-line);
  }
  .chart-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .chart-heading h3 {
    font-size: 19px;
    font-weight: 500;
    letter-spacing: -0.4px;
    margin: 0;
  }
  .chart-heading h3 span {
    font-weight: 400;
    font-size: 16px;
    opacity: 0.65;
    margin-left: 10px;
  }
  .direction {
    font:
      8px "IBM Plex Mono",
      monospace;
    letter-spacing: 0.5px;
    color: var(--hf-muted);
  }
  .chart-unit {
    font:
      10px "IBM Plex Mono",
      monospace;
    color: var(--hf-muted);
    margin: 6px 0 23px;
  }
  .chart-row {
    display: block;
    width: 100%;
    padding: 0;
    text-align: left;
    margin: 0 0 18px;
  }
  .row-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 7px;
    margin-bottom: 8px;
    line-height: 18px;
    font-size: 11px;
  }
  .model-name {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .provider-logo {
    width: 17px;
    height: 17px;
    object-fit: contain;
    background: #fff;
    border-radius: 3px;
    box-shadow: 0 0 0 2px #fff;
    flex: none;
    opacity: 1;
  }
  .value {
    font:
      11px "IBM Plex Mono",
      monospace;
    white-space: nowrap;
    flex: none;
    font-variant-numeric: tabular-nums;
  }
  .bar-track {
    display: block;
    height: 17px;
    position: relative;
    background: repeating-linear-gradient(
      to right,
      var(--hf-line) 0,
      var(--hf-line) 1px,
      transparent 1px,
      transparent 25%
    );
    border-right: 1px solid var(--hf-line);
  }
  .bar {
    display: block;
    height: 100%;
    background: var(--hf-bar);
    opacity: 0.7;
    transition:
      width 0.4s,
      background 0.2s;
  }
  .selected .bar {
    background: var(--hf-solid);
    opacity: 1;
  }
  .selected .model-name {
    font-weight: 700;
  }
  .chart-row:hover .bar {
    opacity: 1;
  }
  .chart-row:hover .model-name {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    border-top: 1px solid var(--hf-line);
    padding-top: 8px;
    font:
      9px "IBM Plex Mono",
      monospace;
    color: var(--hf-muted);
  }
  .chart-footnote {
    display: flex;
    justify-content: space-between;
    gap: 15px;
    padding: 12px 0 0;
    font-size: 10px;
    color: var(--hf-muted);
  }
  .illustrative {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .illustrative i {
    height: 5px;
    width: 5px;
    border: 1px solid var(--hf-muted);
    transform: rotate(45deg);
  }
  .replay-callout {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 30px;
    padding: 28px 0 31px;
  }
  .replay-callout h2 {
    font-size: 24px;
  }
  .replay-callout p {
    font-size: 12px;
    margin: 4px 0 0;
    color: var(--hf-muted);
  }
  .primary {
    padding: 13px 18px;
    min-width: 203px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    background: var(--hf-accent);
    color: var(--hf-button-ink);
    font-size: 12px;
    font-weight: 500;
  }
  .primary span {
    font-size: 24px;
    line-height: 1;
    font-weight: 400;
  }
  .primary:hover {
    filter: brightness(0.94);
  }
  .savings {
    padding: 25px 0 28px;
  }
  .savings-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 22px;
  }
  .savings-number {
    font:
      600 48px/1.1 "Barlow Condensed",
      Impact,
      sans-serif;
    margin: 7px 0;
  }
  .savings-heading p {
    font-size: 11px;
    color: var(--hf-muted);
    margin: 0;
  }
  .savings-controls {
    display: flex;
    gap: 15px;
  }
  .savings-controls label {
    font:
      10px "IBM Plex Mono",
      monospace;
    color: var(--hf-muted);
  }
  .savings-controls input {
    display: block;
    width: 135px;
    border: 1px solid var(--hf-line);
    background: transparent;
    color: var(--hf-ink);
    padding: 8px 10px;
    font:
      12px "IBM Plex Mono",
      monospace;
    margin-top: 7px;
    border-radius: 0;
  }
  .spend-bars {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
  }
  .spend-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-size: 11px;
    margin-bottom: 9px;
  }
  .spend-label small {
    font:
      8px "IBM Plex Mono",
      monospace;
    opacity: 0.6;
  }
  .spend-label strong {
    font:
      12px "IBM Plex Mono",
      monospace;
  }
  .spend-track {
    height: 14px;
    background: var(--hf-faint);
  }
  .spend-bar {
    height: 100%;
    background: var(--hf-solid);
    transition: width 0.3s;
  }
  .spend-bar.current {
    background: var(--hf-bar);
    opacity: 0.7;
  }
  .warning {
    color: var(--hf-warning) !important;
  }
  .explore-strip {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-top: 1px solid var(--hf-line);
    border-bottom: 1px solid var(--hf-line);
  }
  .explore-link {
    display: flex;
    align-items: center;
    gap: 21px;
    padding: 24px 0;
    text-align: left;
  }
  .explore-link + .explore-link {
    padding-left: 32px;
    border-left: 1px solid var(--hf-line);
  }
  .explore-link:first-child {
    padding-right: 32px;
  }
  .explore-link svg {
    width: 52px;
    height: 39px;
    fill: none;
    stroke: var(--hf-ink);
    stroke-width: 0.8;
    opacity: 0.65;
    flex: none;
  }
  .explore-link .eyebrow {
    font-size: 8px;
    letter-spacing: 1px;
    margin-bottom: 5px;
  }
  .explore-link strong {
    font-size: 13px;
    font-weight: 500;
  }
  .explore-link .arrow {
    margin-left: auto;
    font-size: 24px;
    color: var(--hf-muted);
  }
  .explore-link:hover strong {
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    font:
      9px "IBM Plex Mono",
      monospace;
    color: var(--hf-muted);
    padding: 24px 0;
  }
  footer a {
    color: inherit;
    text-decoration: none;
  }
  dialog {
    margin: auto;
    width: 480px;
    max-width: calc(100vw - 36px);
    background: var(--hf-dialog);
    color: var(--hf-ink);
    border: 1px solid var(--hf-line);
    padding: 30px;
    box-sizing: border-box;
    box-shadow: 0 30px 100px #0005;
  }
  dialog::backdrop {
    background: #000b;
    backdrop-filter: blur(5px);
  }
  .dialog-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .dialog-top button {
    font-size: 24px;
    padding: 0 4px;
  }
  dialog h2 {
    font:
      600 45px/0.98 "Barlow Condensed",
      Impact,
      sans-serif;
    margin: 18px 0;
  }
  dialog p {
    font-size: 12px;
    line-height: 1.65;
    color: var(--hf-muted);
  }
  .full {
    width: 100%;
    margin-top: 24px;
  }
  dialog dl {
    font-size: 12px;
    display: grid;
    grid-template-columns: 1fr 1.6fr;
    gap: 14px;
    margin: 25px 0;
  }
  dialog dt {
    color: var(--hf-muted);
  }
  dialog dd {
    margin: 0;
  }
  @media (min-width: 1500px) {
    .chart-panel {
      padding-top: 28px;
      padding-bottom: 24px;
    }
    .chart-row {
      margin-bottom: 21px;
    }
  }
  @media (max-width: 1100px) {
    .discover-page {
      padding: 0 30px;
    }
    .chart-panel {
      padding-left: 20px;
      padding-right: 20px;
    }
    .direction {
      font-size: 7px;
      letter-spacing: 0;
    }
    .row-label {
      font-size: 10px;
    }
    .model-name {
      gap: 6px;
    }
    .provider-logo {
      height: 15px;
      width: 15px;
    }
    .value {
      font-size: 10px;
    }
    .savings-number {
      font-size: 40px;
    }
    .savings-controls input {
      width: 112px;
    }
  }
  @media (max-width: 800px) {
    .version {
      font-size: 8px;
      letter-spacing: 0.6px;
    }
    .chart-panel {
      padding-left: 15px;
      padding-right: 15px;
    }
    .chart-heading h3 {
      font-size: 17px;
    }
    .direction {
      display: none;
    }
    .chart-unit {
      font-size: 8px;
      min-height: 22px;
      margin-bottom: 16px;
    }
    .row-label {
      display: block;
    }
    .model-name {
      font-size: 10px;
      gap: 7px;
    }
    .value {
      display: block;
      margin-left: 22px;
      margin-top: 2px;
    }
    .bar-track {
      height: 14px;
    }
    .chart-row {
      margin-bottom: 16px;
    }
    .chart-footnote {
      font-size: 9px;
    }
    .replay-callout h2 {
      font-size: 20px;
    }
    .replay-callout p {
      font-size: 11px;
    }
    .savings-heading {
      display: block;
    }
    .savings-controls {
      margin-top: 16px;
    }
    .explore-link {
      gap: 15px;
    }
    .explore-link svg {
      width: 37px;
    }
    .explore-link strong {
      font-size: 12px;
    }
    .explore-link .eyebrow {
      font-size: 7px;
    }
    .explore-link + .explore-link {
      padding-left: 20px;
    }
    .explore-link:first-child {
      padding-right: 20px;
    }
    footer {
      font-size: 8px;
    }
  }
  @media (max-width: 560px) {
    .discover-page {
      padding: 0 20px;
    }
    .section-heading {
      display: block;
      padding: 23px 0 18px;
    }
    .source-toggle {
      width: max-content;
      margin-top: 17px;
    }
    .source-toggle button {
      font-size: 11px;
    }
    .toolbar {
      display: block;
      margin-bottom: 18px;
    }
    .workloads {
      gap: 3px;
    }
    .workloads button {
      font-size: 10px;
      padding: 7px 8px;
    }
    .method {
      margin-top: 10px;
      font-size: 9px;
    }
    .charts {
      grid-template-columns: 1fr;
    }
    .chart-panel,
    .chart-panel:first-child,
    .chart-panel:last-child {
      padding: 24px 0 20px;
    }
    .chart-panel + .chart-panel {
      border-left: 0;
      border-top: 1px solid var(--hf-line);
    }
    .chart-heading h3 {
      font-size: 21px;
    }
    .direction {
      display: block;
      font-size: 8px;
    }
    .chart-unit {
      font-size: 10px;
      min-height: 0;
      margin-bottom: 22px;
    }
    .row-label {
      display: flex;
      font-size: 12px;
    }
    .model-name {
      font-size: 12px;
      gap: 8px;
    }
    .provider-logo {
      width: 18px;
      height: 18px;
    }
    .value {
      margin: 0;
      font-size: 11px;
    }
    .bar-track {
      height: 17px;
    }
    .chart-row {
      margin-bottom: 19px;
    }
    .chart-footnote {
      flex-wrap: wrap;
      gap: 7px;
    }
    .replay-callout {
      display: block;
      padding: 24px 0;
    }
    .replay-callout h2 {
      font-size: 24px;
    }
    .replay-callout .primary {
      width: 100%;
      margin-top: 19px;
    }
    .savings-number {
      font-size: 40px;
    }
    .spend-bars {
      grid-template-columns: 1fr;
      gap: 18px;
    }
    .savings-controls {
      gap: 15px;
    }
    .savings-controls label,
    .savings-controls input {
      width: 100%;
      min-width: 0;
    }
    .savings-controls label {
      flex: 1;
    }
    .spend-label .model-name {
      font-size: 11px;
    }
    .explore-strip {
      grid-template-columns: 1fr;
    }
    .explore-link + .explore-link {
      border-left: 0;
      border-top: 1px solid var(--hf-line);
      padding-left: 0;
    }
    .explore-link:first-child {
      padding-right: 0;
    }
    .explore-link svg {
      width: 45px;
    }
    .explore-link strong {
      font-size: 13px;
    }
    .explore-link .eyebrow {
      font-size: 8px;
    }
    footer {
      font-size: 7px;
      gap: 12px;
      flex-wrap: wrap;
    }
    .savings .eyebrow {
      font-size: 8px;
    }
  }
  .report-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 36px 0 28px;
  }
  .report-heading h1 {
    font-size: 30px;
    line-height: 1.2;
    font-weight: 500;
    letter-spacing: -1px;
    margin: 0 0 8px;
  }
  .report-heading p {
    font-size: 13px;
    color: var(--hf-muted);
    margin: 0;
    line-height: 1.6;
  }
  .report-heading a {
    color: var(--hf-accent);
    font-size: 13px;
    white-space: nowrap;
    text-underline-offset: 4px;
  }
  .metric-tabs {
    display: none;
  }
  .model-name {
    overflow-wrap: anywhere;
  }
  .calculator {
    margin: 24px 0 0;
    border-top: 1px solid var(--hf-line);
  }
  .calculator summary {
    cursor: pointer;
    padding: 20px 0;
    font-size: 14px;
  }
  .calculator summary span {
    margin-left: 12px;
    color: var(--hf-muted);
    font-size: 12px;
  }
  .calculator .savings {
    padding-top: 0;
  }
  summary:focus-visible {
    outline: 2px solid var(--hf-accent);
    outline-offset: 4px;
  }
  @media (max-width: 1000px) {
    .metric-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 0;
    }
    .metric-tabs button {
      padding: 10px 14px;
      font-size: 13px;
      color: var(--hf-muted);
      border-bottom: 2px solid transparent;
    }
    .metric-tabs button.active {
      color: var(--hf-accent);
      border-bottom-color: var(--hf-accent);
    }
    .charts {
      grid-template-columns: minmax(0, 1fr);
    }
    .chart-panel {
      display: none;
    }
    .chart-panel.active-metric {
      display: block;
      border-left: 0;
      padding: 20px 0;
    }
    .row-label {
      display: flex;
      font-size: 13px;
    }
    .model-name {
      font-size: 13px;
    }
    .value {
      margin: 0;
      font-size: 12px;
    }
    .chart-unit {
      min-height: 0;
      font-size: 11px;
      margin-bottom: 20px;
    }
    .bar-track {
      height: 12px;
    }
    .chart-heading h3 {
      font-size: 18px;
    }
    .direction {
      display: none;
    }
  }
  @media (max-width: 600px) {
    .report-heading {
      display: block;
      padding-top: 28px;
    }
    .report-heading a {
      display: inline-block;
      margin-top: 16px;
    }
    .toolbar {
      flex-wrap: wrap;
      gap: 12px;
    }
    .calculator summary span {
      display: block;
      margin: 6px 0 0 16px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      transition: none !important;
      scroll-behavior: auto !important;
    }
  }
</style>
