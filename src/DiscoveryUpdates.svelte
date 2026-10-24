<script lang="ts">
  import { onMount } from "svelte";
  import {
    discoveryModality,
    loadDiscoveryCatalog,
    selectDiscoveryModels,
    type DiscoveryCatalog,
  } from "./discoveryCatalog";
  import {
    EPOCH_URL,
    TERMINAL_BENCH_URL,
    loadDiscoveryBenchmarks,
    rankQuality,
    rankValue,
  } from "./discoveryBenchmarks";
  import { getProviderLogo } from "./providers";
  import ModelIdentifier from "./ModelIdentifier.svelte";
  import type { QualityRanking, ValueRanking } from "./discoveryBenchmarks";

  let catalog: DiscoveryCatalog | null = null;
  let benchmarks: Awaited<ReturnType<typeof loadDiscoveryBenchmarks>> | null =
    null;
  let loading = true;
  let failed = false;
  let benchmarkLoading = true;
  let benchmarkFailed = false;

  $: models = selectDiscoveryModels(catalog?.models ?? [], 8);
  $: lists = [
    {
      id: "overall",
      title: "Top quality",
      description: "Epoch Capabilities Index",
      metric: "ECI points",
      entries: rankQuality(benchmarks?.models ?? [], "overall").slice(0, 10),
      href: EPOCH_URL,
    },
    {
      id: "coding",
      title: "Top coding",
      description: `Terminal-Bench ${benchmarks?.terminalBenchVersion ?? "4.0"} · model + agent`,
      metric: "Tasks solved",
      entries: rankQuality(benchmarks?.models ?? [], "coding").slice(0, 10),
      href: TERMINAL_BENCH_URL,
    },
    {
      id: "value",
      title: "Best value",
      description: "Terminal-Bench · successful tasks per reported dollar",
      metric: "Tasks solved per dollar",
      entries: rankValue(benchmarks?.models ?? []).slice(0, 10),
      href: TERMINAL_BENCH_URL,
    },
  ];

  async function loadUpdates() {
    loading = true;
    failed = false;
    try {
      catalog = await loadDiscoveryCatalog();
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }
  async function loadScores() {
    benchmarkLoading = true;
    benchmarkFailed = false;
    try {
      benchmarks = await loadDiscoveryBenchmarks();
    } catch {
      benchmarkFailed = true;
    } finally {
      benchmarkLoading = false;
    }
  }
  function addedDate(date: string): string {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      ...(date.length === 7 ? { year: "numeric" } : { day: "numeric" }),
      ...(date.slice(0, 4) !== catalog?.updatedAt.slice(0, 4)
        ? { year: "numeric" }
        : {}),
      timeZone: "UTC",
    }).format(
      new Date(
        `${date.length === 7 ? `${date}-01` : date.slice(0, 10)}T00:00:00Z`,
      ),
    );
  }
  const number = (value: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
  const ratio = (value: number) =>
    new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 }).format(
      value,
    );
  const percent = (value: number) => `${number(value * 100)}%`;
  const dollars = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: value < 0.01 ? 4 : 2,
    }).format(value);

  function chartValue(entry: QualityRanking | ValueRanking): number {
    return "solvedPerDollar" in entry ? entry.solvedPerDollar : entry.score;
  }
  function chartMaximum(
    id: string,
    entries: (QualityRanking | ValueRanking)[],
  ): number {
    return id === "coding" ? 1 : Math.max(...entries.map(chartValue), 0);
  }
  function barWidth(
    id: string,
    entries: (QualityRanking | ValueRanking)[],
    entry: QualityRanking | ValueRanking,
  ): number {
    const maximum = chartMaximum(id, entries);
    return maximum > 0
      ? Math.min(100, Math.max(0, (chartValue(entry) / maximum) * 100))
      : 0;
  }
  function metricLabel(
    id: string,
    entry: QualityRanking | ValueRanking,
  ): string {
    return id === "value"
      ? ratio(chartValue(entry))
      : id === "coding"
        ? percent(entry.score)
        : number(entry.score);
  }

  onMount(() => {
    void loadUpdates();
    void loadScores();
  });
</script>

<section class="discovery-updates" aria-labelledby="discover-models-title">
  <header class="discover-heading">
    <div>
      <h1 id="discover-models-title">Discover models</h1>
      <p>New models to explore. Proven performers to compare.</p>
    </div>
    <a class="browse-button" href="/search"
      >Browse all models <span aria-hidden="true">↗</span></a
    >
  </header>

  <div class="discovery-grid">
    <section class="new-models panel" aria-labelledby="new-models-title">
      <header class="panel-heading">
        <div class="heading-line">
          <h2 id="new-models-title">
            What's new <span class="new-dot" aria-hidden="true"></span>
          </h2>
          <a href="/new-models">View all <span aria-hidden="true">↗</span></a>
        </div>
        <p>The latest additions to LiteLLM, across modalities.</p>
      </header>
      {#if loading}
        <div class="empty-state" role="status">Loading the latest models…</div>
      {:else if failed}
        <div class="empty-state" role="status">
          <p>Recent additions couldn't be loaded.</p>
          <button on:click={loadUpdates}>Try again</button>
        </div>
      {:else if models.length}
        <ol class="model-list" aria-label="New models">
          {#each models as model (model.slug)}
            {@const modality = discoveryModality(model)}
            <li>
              <div class="model-row">
                {#if model.logo}
                  <img
                    class="brand-logo"
                    src={model.logo}
                    alt={model.lab ?? ""}
                  />
                {:else}
                  <span class="brand-fallback" aria-hidden="true"
                    >{(model.lab ?? model.name).slice(0, 1)}</span
                  >
                {/if}
                <span class="model-copy">
                  <span class="model-title-line">
                    <a href={model.href} aria-label={`Explore ${model.name}`}
                      ><strong>{model.name}</strong></a
                    >
                    {#if model.modelId}<ModelIdentifier
                        modelId={model.modelId}
                      />{/if}
                  </span>
                  <span class="model-meta"
                    >{model.lab ?? "LiteLLM catalog"}<span aria-hidden="true"
                      >·</span
                    >Added {addedDate(model.firstSeen)}</span
                  >
                  <span class="modality-line"
                    ><span class="task-label">{modality.task}</span
                    >{#if modality.flow}<span class="modality-flow"
                        >{modality.flow}</span
                      >{/if}</span
                  >
                </span>
              </div>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="empty-state" role="status">
          No dated model additions are available yet. <a href="/search"
            >Explore the catalog ↗</a
          >
        </p>
      {/if}
      <footer class="list-footer">
        <span>From the LiteLLM model catalog</span>
        {#if catalog}<span>Updated {addedDate(catalog.updatedAt)}</span>{/if}
      </footer>
    </section>

    <div class="rankings">
      {#each lists as list (list.id)}
        <section
          class="ranking-panel panel"
          aria-labelledby={`ranking-${list.id}`}
        >
          <header class="panel-heading">
            <div class="heading-line">
              <div class="ranking-title">
                <h2 id={`ranking-${list.id}`}>{list.title}</h2>
                {#if list.entries.length}<span class="chart-count"
                    >Top {list.entries.length}</span
                  >{/if}
              </div>
              <a
                href={list.href}
                target="_blank"
                rel="noreferrer"
                aria-label={`View ${list.title.toLowerCase()} on ${list.id === "overall" ? "Epoch AI" : "Terminal-Bench"}`}
                >View all <span aria-hidden="true">↗</span></a
              >
            </div>
            <p>{list.description}</p>
          </header>
          {#if benchmarkLoading}
            <div class="ranking-empty" role="status">Loading rankings…</div>
          {:else if benchmarkFailed}
            <div class="ranking-empty">
              Rankings are temporarily unavailable.
            </div>
          {:else if list.entries.length}
            <div class="chart-scale" aria-hidden="true">
              <span>0</span>
              <span
                >{list.id === "coding"
                  ? "100% solved"
                  : `${list.id === "value" ? ratio(chartMaximum(list.id, list.entries)) : number(chartMaximum(list.id, list.entries))} ${list.id === "value" ? "solved / $" : "ECI points"}`}</span
              >
            </div>
            <ol
              class="ranking-list"
              class:quality-chart={list.id === "overall"}
              class:coding-chart={list.id === "coding"}
              class:value-chart={list.id === "value"}
              aria-label={list.title}
            >
              {#each list.entries as entry, index (entry.model.slug)}
                <li class="chart-row">
                  <div class="chart-heading">
                    <span class="rank">{index + 1}</span>
                    {#if getProviderLogo(entry.model.lab ?? "")}
                      <img
                        class="ranking-logo"
                        src={getProviderLogo(entry.model.lab ?? "") ?? ""}
                        alt=""
                      />
                    {:else}
                      <span class="ranking-fallback" aria-hidden="true"
                        >{(entry.model.lab ?? entry.model.name).slice(
                          0,
                          1,
                        )}</span
                      >
                    {/if}
                    <a
                      class="ranking-link"
                      href={entry.model.href}
                      target="_blank"
                      rel="noreferrer"><strong>{entry.model.name}</strong></a
                    >
                    {#if entry.model.modelId}<ModelIdentifier
                        modelId={entry.model.modelId}
                      />{/if}
                  </div>
                  <div class="chart-measure">
                    <span class="bar-track" aria-hidden="true"
                      ><span
                        class="bar-fill"
                        style:width={`${barWidth(list.id, list.entries, entry)}%`}
                      ></span></span
                    >
                    <span
                      class="rank-metric"
                      title={"costPerTask" in entry &&
                      typeof entry.costPerTask === "number"
                        ? `${dollars(entry.costPerTask)} reported per attempt`
                        : list.metric}
                    >
                      <strong>{metricLabel(list.id, entry)}</strong>
                      <small
                        >{list.id === "value"
                          ? "solved / $"
                          : list.id === "coding"
                            ? "solved"
                            : "ECI"}</small
                      >
                    </span>
                  </div>
                  <small class="chart-caption"
                    >{list.id === "overall"
                      ? entry.model.lab ?? ""
                      : entry.model.harness ??
                        "Agent not listed"}{#if list.id !== "overall" && entry.model.setting}
                      · {entry.model.setting}{/if}{#if list.id === "value"}
                      · <span class="success-rate"
                        >{percent(entry.score)} solved</span
                      >{/if}{#if !entry.model.modelId}
                      · LiteLLM ID not matched{/if}</small
                  >
                </li>
              {/each}
            </ol>
            {#if list.entries.length < 10}<p class="coverage-note">
                {list.entries.length} models with published {list.id === "value"
                  ? "success and cost"
                  : "benchmark"} data.
              </p>{/if}
          {:else}
            <div class="ranking-empty">
              No published results are available yet.
              <a href={list.href} target="_blank" rel="noreferrer"
                >Explore {list.id === "overall" ? "Epoch AI" : "Terminal-Bench"}
                ↗</a
              >
            </div>
          {/if}
        </section>
      {/each}
      {#if benchmarkFailed}<div class="benchmark-error" role="status">
          <span>Benchmark rankings couldn't be loaded.</span><button
            on:click={loadScores}>Retry rankings</button
          >
        </div>{/if}
    </div>
  </div>
  <footer class="source-note">
    <span
      >Benchmark data from <a href={EPOCH_URL} target="_blank" rel="noreferrer"
        >Epoch AI ↗</a
      >
      and
      <a href={TERMINAL_BENCH_URL} target="_blank" rel="noreferrer"
        >Terminal-Bench ↗</a
      >{#if benchmarks?.fetchedAt}
        · Synced {addedDate(benchmarks.fetchedAt)}{/if}</span
    >
    <details>
      <summary>How these lists work</summary>
      <p>
        Top quality uses the Epoch Capabilities Index for models in the LiteLLM
        catalog. Coding results use Terminal-Bench {benchmarks?.terminalBenchVersion ??
          "4.0"} and reflect each model's listed agent and reasoning setting.
      </p>
      <p>
        Best value ranks successful coding trials per dollar of reported total
        run cost. Success rates are shown alongside efficiency so low-cost runs
        with fewer successful attempts remain distinguishable. Success counts
        and costs come from the same run. Terminal-Bench does not confirm cost
        coverage for every trial; missing total costs are excluded. Hover over a
        value to see its average cost per attempt.
      </p>
      <p>
        Public results refresh daily. If a source is unavailable, the last
        successful download stays visible. New models appear after the benchmark
        publishes results.{#if benchmarks?.epochAsOf}
          Epoch source captured {addedDate(
            benchmarks.epochAsOf,
          )}.{/if}{#if benchmarks?.terminalBenchAsOf}
          Terminal-Bench source captured {addedDate(
            benchmarks.terminalBenchAsOf,
          )}.{/if}
      </p>
    </details>
  </footer>
</section>

<style>
  .discovery-updates {
    padding: 38px 0 30px;
  }
  .discover-heading {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    margin-bottom: 28px;
  }
  h1 {
    font-size: 30px;
    font-weight: 600;
    letter-spacing: -0.8px;
    margin: 0 0 8px;
    line-height: 1.2;
  }
  .discover-heading p {
    margin: 0;
    color: var(--hf-muted);
    font-size: 15px;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  .browse-button {
    border: 1px solid var(--hf-line);
    background: var(--hf-dialog);
    padding: 11px 14px;
    border-radius: 6px;
    font-size: 13px;
    flex-shrink: 0;
    display: flex;
    gap: 18px;
  }
  .browse-button:hover,
  .model-row:hover strong,
  .ranking-link:hover strong {
    color: var(--hf-accent);
  }
  .discovery-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.3fr);
    gap: 20px;
    align-items: start;
  }
  .panel {
    border: 1px solid var(--hf-line);
    background: var(--hf-dialog);
    border-radius: 10px;
    min-width: 0;
    overflow: hidden;
  }
  .new-models {
    display: flex;
    flex-direction: column;
  }
  .panel-heading {
    padding: 20px 22px 16px;
  }
  .heading-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  h2 {
    font-size: 18px;
    font-weight: 500;
    letter-spacing: -0.35px;
    margin: 0;
  }
  .heading-line > a {
    font-size: 11px;
    white-space: nowrap;
    color: var(--hf-muted);
  }
  .heading-line > a:hover {
    color: var(--hf-accent);
  }
  .panel-heading p {
    color: var(--hf-muted);
    font-size: 11px;
    margin: 7px 0 0;
    line-height: 1.5;
  }
  .new-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    background: var(--hf-accent);
    border-radius: 50%;
    vertical-align: middle;
    margin-left: 5px;
  }
  .model-list,
  .ranking-list {
    list-style: none;
    padding: 0 22px;
    margin: 0;
  }
  .model-list li,
  .ranking-list li {
    border-top: 1px solid var(--hf-line);
  }
  .model-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-width: 0;
    min-height: 0;
    padding: 16px 0;
  }
  .brand-logo,
  .brand-fallback {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    border-radius: 6px;
    margin-top: 1px;
  }
  .brand-logo,
  .ranking-logo {
    object-fit: contain;
    background: #fff;
    padding: 4px;
  }
  .brand-fallback,
  .ranking-fallback {
    display: grid;
    place-items: center;
    background: var(--hf-faint);
    color: var(--hf-accent);
    border: 1px solid var(--hf-line);
  }
  .model-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 6px;
    flex: 1;
  }
  .model-copy strong {
    font-size: 14px;
    font-weight: 500;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .model-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    color: var(--hf-muted);
    font-size: 10px;
  }
  .modality-line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 9px;
    margin-top: 1px;
  }
  .task-label {
    display: inline-block;
    border: 1px solid var(--hf-line);
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 10px;
    line-height: 1.1;
    background: var(--hf-faint);
  }
  .modality-flow {
    color: var(--hf-muted);
    font-size: 10px;
    line-height: 1.4;
  }
  .model-title-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 7px 10px;
    min-width: 0;
  }
  .list-footer {
    margin-top: auto;
    padding: 15px 22px;
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 10px;
    color: var(--hf-muted);
    border-top: 1px solid var(--hf-line);
  }
  .rankings {
    display: grid;
    gap: 14px;
    min-width: 0;
  }
  .ranking-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .chart-count {
    font-size: 10px;
    color: var(--hf-muted);
    padding: 3px 6px;
    border: 1px solid var(--hf-line);
    border-radius: 4px;
  }
  .ranking-panel .panel-heading {
    padding-bottom: 12px;
  }
  .ranking-list {
    padding-bottom: 8px;
    --bar-color: #7860de;
  }
  .coding-chart {
    --bar-color: #3888d6;
  }
  .value-chart {
    --bar-color: #219b85;
  }
  .chart-scale {
    display: flex;
    justify-content: space-between;
    margin: 0 22px 0 43px;
    padding: 0 92px 7px 0;
    color: var(--hf-muted);
    font-size: 9px;
    font-variant-numeric: tabular-nums;
  }
  .chart-row {
    padding: 8px 0;
  }
  .chart-heading {
    line-height: 1.3;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .rank {
    width: 13px;
    flex-shrink: 0;
    font-size: 10px;
    color: var(--hf-muted);
    font-variant-numeric: tabular-nums;
  }
  .ranking-logo,
  .ranking-fallback {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    border-radius: 4px;
  }
  .ranking-fallback {
    font-size: 11px;
  }
  .ranking-link {
    flex: 1;
    min-width: 80px;
  }
  .ranking-link strong {
    font-size: 12px;
    line-height: 1.35;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .chart-measure {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 4px 0 0 21px;
  }
  .bar-track {
    flex: 1;
    height: 10px;
    background: var(--hf-faint);
    border-radius: 3px;
    overflow: hidden;
  }
  .bar-fill {
    display: block;
    height: 100%;
    background: var(--bar-color);
    border-radius: 3px;
  }
  .rank-metric {
    line-height: 1.3;
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 4px;
    width: 80px;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .rank-metric strong {
    font-size: 12px;
    font-weight: 600;
  }
  .rank-metric small {
    color: var(--hf-muted);
    font-size: 9px;
  }
  .chart-caption {
    display: block;
    margin: 3px 0 0 21px;
    color: var(--hf-muted);
    font-size: 10px;
    line-height: 1.4;
  }
  .success-rate {
    color: var(--hf-ink);
    font-weight: 500;
  }
  .coverage-note {
    margin: 0;
    padding: 0 22px 14px;
    color: var(--hf-muted);
    font-size: 10px;
  }
  .empty-state,
  .ranking-empty {
    padding: 24px 22px;
    color: var(--hf-muted);
    font-size: 12px;
    line-height: 1.7;
  }
  .empty-state {
    min-height: 300px;
  }
  .empty-state a,
  .ranking-empty a {
    color: var(--hf-accent);
  }
  .ranking-empty a {
    display: block;
    margin-top: 8px;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .empty-state button {
    border: 1px solid var(--hf-line);
    background: var(--hf-dialog);
    color: var(--hf-accent);
    padding: 8px 12px;
    border-radius: 4px;
  }
  .benchmark-error {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 11px;
    color: var(--hf-muted);
  }
  .benchmark-error button {
    border: 0;
    padding: 0;
    background: none;
    color: var(--hf-accent);
  }
  .source-note {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    padding-top: 16px;
    font-size: 10px;
    color: var(--hf-muted);
    line-height: 1.5;
  }
  .source-note a:hover {
    text-decoration: underline;
  }
  .source-note details {
    max-width: 440px;
  }
  .source-note summary {
    cursor: pointer;
    text-align: right;
    white-space: nowrap;
  }
  .source-note details p {
    font-size: 12px;
    line-height: 1.65;
  }
  a:focus-visible,
  button:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--hf-accent);
    outline-offset: 4px;
  }
  @media (max-width: 800px) {
    .discovery-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .discover-heading {
      align-items: flex-start;
    }
    .source-note {
      flex-direction: column;
      gap: 12px;
    }
    .source-note summary {
      text-align: left;
    }
    .source-note details {
      max-width: none;
    }
  }
  @media (max-width: 500px) {
    .discovery-updates {
      padding-top: 24px;
    }
    .discover-heading {
      flex-direction: column;
      gap: 16px;
      margin-bottom: 22px;
    }
    h1 {
      font-size: 27px;
    }
    .discover-heading p {
      font-size: 13px;
      line-height: 1.5;
    }
    .browse-button {
      padding: 9px 12px;
      font-size: 12px;
    }
    .panel-heading {
      padding: 18px 16px 14px;
    }
    .model-list,
    .ranking-list {
      padding-left: 16px;
      padding-right: 16px;
    }
    .list-footer {
      padding-left: 16px;
      padding-right: 16px;
    }
    .model-row {
      gap: 10px;
    }
    .model-copy strong {
      font-size: 13px;
    }
    .chart-heading {
      gap: 6px;
    }
    .chart-scale {
      margin-left: 37px;
      margin-right: 16px;
    }
  }
</style>
