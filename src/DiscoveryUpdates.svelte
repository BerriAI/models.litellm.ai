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
    qualityFloor,
    rankQuality,
    rankValue,
  } from "./discoveryBenchmarks";
  import { getProviderLogo } from "./providers";

  let catalog: DiscoveryCatalog | null = null;
  let benchmarks: Awaited<ReturnType<typeof loadDiscoveryBenchmarks>> | null =
    null;
  let loading = true;
  let failed = false;
  let benchmarkLoading = true;
  let benchmarkFailed = false;

  $: models = selectDiscoveryModels(catalog?.models ?? [], 8);
  $: minimumQuality = qualityFloor(benchmarks?.models ?? []);
  $: lists = [
    {
      id: "overall",
      title: "Top quality",
      description: "Epoch Capabilities Index",
      metric: "ECI points",
      entries: rankQuality(benchmarks?.models ?? [], "overall").slice(0, 3),
      href: EPOCH_URL,
    },
    {
      id: "coding",
      title: "Top coding",
      description: `Terminal-Bench ${benchmarks?.terminalBenchVersion ?? "4.0"} · model + agent`,
      metric: "Tasks solved",
      entries: rankQuality(benchmarks?.models ?? [], "coding").slice(0, 3),
      href: TERMINAL_BENCH_URL,
    },
    {
      id: "value",
      title: "Best value",
      description:
        minimumQuality === null
          ? "Terminal-Bench · coding value at reported costs"
          : `Terminal-Bench · reported costs · ≥${percent(minimumQuality)} solved`,
      metric: "Tasks solved per dollar",
      entries: rankValue(benchmarks?.models ?? []).slice(0, 3),
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
              <a
                class="model-row"
                href={model.href}
                aria-label={`Explore ${model.name}`}
              >
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
                  <strong>{model.name}</strong>
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
                <span class="model-arrow" aria-hidden="true">↗</span>
              </a>
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
              <h2 id={`ranking-${list.id}`}>{list.title}</h2>
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
            <ol class="ranking-list" aria-label={list.title}>
              {#each list.entries as entry, index (entry.model.slug)}
                <li>
                  <a
                    class="ranking-row"
                    href={entry.model.href}
                    target="_blank"
                    rel="noreferrer"
                  >
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
                    <span class="ranking-copy">
                      <strong>{entry.model.name}</strong>
                      <small
                        >{list.id === "overall"
                          ? entry.model.lab ?? ""
                          : entry.model.harness ??
                            "Agent not listed"}{#if list.id !== "overall" && entry.model.setting}
                          · {entry.model.setting}{/if}{#if list.id === "value"}
                          · {percent(entry.score)} solved{/if}</small
                      >
                    </span>
                    <span
                      class="rank-metric"
                      title={"costPerTask" in entry &&
                      typeof entry.costPerTask === "number"
                        ? `${dollars(entry.costPerTask)} reported per attempt`
                        : list.metric}
                    >
                      <strong
                        >{"solvedPerDollar" in entry &&
                        typeof entry.solvedPerDollar === "number"
                          ? ratio(entry.solvedPerDollar)
                          : list.id === "coding"
                            ? percent(entry.score)
                            : number(entry.score)}</strong
                      >
                      <small
                        >{list.id === "value"
                          ? "solved / $"
                          : list.id === "coding"
                            ? "solved"
                            : "ECI"}</small
                      >
                    </span>
                  </a>
                </li>
              {/each}
            </ol>
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
        run cost, keeping runs at or above 80% of the leading coding score.
        Success counts and costs come from the same run. Terminal-Bench does not
        confirm cost coverage for every trial; missing total costs are excluded.
        Hover over a value to see its average cost per attempt.
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
  .ranking-row:hover strong {
    color: var(--hf-accent);
  }
  .discovery-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
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
  .model-arrow {
    color: var(--hf-muted);
    font-size: 13px;
    margin-top: 4px;
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
  .ranking-panel .panel-heading {
    padding-bottom: 12px;
  }
  .ranking-list {
    padding-bottom: 8px;
  }
  .ranking-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 0;
    min-height: 0;
  }
  .rank {
    width: 10px;
    flex-shrink: 0;
    font-size: 11px;
    color: var(--hf-muted);
    font-variant-numeric: tabular-nums;
  }
  .ranking-logo,
  .ranking-fallback {
    width: 25px;
    height: 25px;
    flex-shrink: 0;
    border-radius: 5px;
  }
  .ranking-fallback {
    font-size: 12px;
  }
  .ranking-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }
  .ranking-copy strong {
    font-size: 12px;
    line-height: 1.35;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .ranking-copy small {
    color: var(--hf-muted);
    font-size: 10px;
  }
  .rank-metric {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .rank-metric strong {
    font-size: 15px;
    font-weight: 500;
  }
  .rank-metric small {
    color: var(--hf-muted);
    font-size: 9px;
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
    .ranking-row {
      gap: 8px;
    }
  }
</style>
