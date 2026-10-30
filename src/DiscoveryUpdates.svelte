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
  let selectedRanking = "overall";
  let selectedUpdate: "new" | "deprecated" = "new";
  const updateTabs = [
    { id: "new", label: "What's new" },
    { id: "deprecated", label: "Recently deprecated" },
  ] as const;
  $: updatesPath =
    selectedUpdate === "new" ? "/new-models" : "/deprecated-models";
  $: deprecations = (catalog?.deprecations ?? []).slice(0, 6);

  function handleUpdateKey(event: KeyboardEvent, index: number) {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft")
      next = 1 - index;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 1;
    else return;
    event.preventDefault();
    selectedUpdate = updateTabs[next].id;
    document.getElementById(`update-tab-${selectedUpdate}`)?.focus();
  }

  $: models = selectDiscoveryModels(catalog?.models ?? [], 6);
  $: lists = [
    {
      id: "overall",
      title: "Top quality",
      sourceName: "Epoch Capabilities Index",
      explanation:
        "Combined benchmark score, not a percentage. Higher is better.",
      metric: "ECI points",
      unit: "ECI points",
      entries: rankQuality(benchmarks?.models ?? [], "overall").slice(0, 10),
      href: EPOCH_URL,
      asOf: benchmarks?.epochAsOf,
    },
    {
      id: "coding",
      title: "Top coding",
      sourceName: `Terminal-Bench ${benchmarks?.terminalBenchVersion ?? "4.0"}`,
      explanation:
        "Share of attempts solved by the model + agent. Higher is better.",
      metric: "Tasks solved",
      unit: "solved",
      entries: rankQuality(benchmarks?.models ?? [], "coding").slice(0, 10),
      href: TERMINAL_BENCH_URL,
      asOf: benchmarks?.terminalBenchAsOf,
    },
    {
      id: "value",
      title: "Best Task per Dollar",
      sourceName: `Terminal-Bench ${benchmarks?.terminalBenchVersion ?? "4.0"}`,
      explanation:
        "Successful attempts per $100 of reported spend. Higher is better.",
      metric: "Successful benchmark attempts per $100 of reported spend",
      unit: "solved / $100",
      entries: rankValue(benchmarks?.models ?? []).slice(0, 10),
      href: TERMINAL_BENCH_URL,
      asOf: benchmarks?.terminalBenchAsOf,
    },
  ];

  function handleTabKey(event: KeyboardEvent, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % lists.length;
    else if (event.key === "ArrowLeft")
      next = (index + lists.length - 1) % lists.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = lists.length - 1;
    else return;
    event.preventDefault();
    selectedRanking = lists[next].id;
    document.getElementById(`ranking-tab-${selectedRanking}`)?.focus();
  }

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
      ? ratio(chartValue(entry) * 100)
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
      <h2 id="new-models-title" class="sr-only">Model updates</h2>
      <div class="update-tabs" role="tablist" aria-label="Model updates">
        {#each updateTabs as tab, index}
          <button
            type="button"
            role="tab"
            id={`update-tab-${tab.id}`}
            aria-selected={selectedUpdate === tab.id}
            aria-controls={`update-panel-${tab.id}`}
            tabindex={selectedUpdate === tab.id ? 0 : -1}
            on:click={() => (selectedUpdate = tab.id)}
            on:keydown={(event) => handleUpdateKey(event, index)}
            >{tab.label}</button
          >
        {/each}
      </div>
      <header class="panel-heading update-heading">
        <p class="update-summary">
          <span
            >{selectedUpdate === "new"
              ? "The latest additions to LiteLLM, across modalities."
              : "Recently deprecated listings, by provider."}</span
          >
          <a href={updatesPath}>View all <span aria-hidden="true">↗</span></a>
        </p>
      </header>
      <div
        role="tabpanel"
        id={`update-panel-${selectedUpdate}`}
        aria-labelledby={`update-tab-${selectedUpdate}`}
        tabindex="0"
        class="update-panel"
      >
        {#if loading}
          <div class="empty-state" role="status">
            Loading the latest models…
          </div>
        {:else if failed}
          <div class="empty-state" role="status">
            <p>
              {selectedUpdate === "new"
                ? "Recent additions couldn't be loaded."
                : "Recent deprecations couldn't be loaded."}
            </p>
            <button on:click={loadUpdates}>Try again</button>
          </div>
        {:else if selectedUpdate === "deprecated"}
          {#if deprecations.length}
            <ol class="model-list" aria-label="Recently deprecated models">
              {#each deprecations as entry (entry.id)}
                {@const logo = getProviderLogo(entry.provider)}
                <li>
                  <div class="model-row">
                    {#if logo}<img
                        class="brand-logo"
                        src={logo}
                        alt={entry.providerName}
                      />
                    {:else}<span class="brand-fallback" aria-hidden="true"
                        >{entry.providerName.slice(0, 1)}</span
                      >{/if}
                    <span class="model-copy">
                      <span class="model-title-line"
                        ><a
                          href={`/deprecated-models/${entry.date.slice(0, 7)}#${entry.id}`}
                          ><strong>{entry.name}</strong></a
                        >
                        {#if entry.listings.length === 1}<ModelIdentifier
                            modelId={entry.listings[0].modelId}
                          />{/if}
                      </span>
                      <span class="model-meta"
                        >{entry.providerName}<span aria-hidden="true">·</span
                        >Deprecated {addedDate(entry.date)}</span
                      >
                      <span class="modality-line"
                        ><span class="task-label"
                          >{entry.listings.length === 1
                            ? "1 affected listing"
                            : `${entry.listings.length} affected listings`}</span
                        ></span
                      >
                    </span>
                  </div>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="empty-state" role="status">
              No dated deprecations are available yet.
            </p>
          {/if}
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
      </div>
      <footer class="list-footer">
        <a href={`${updatesPath}.xml`}
          >RSS feed <span aria-hidden="true">↗</span></a
        >
        {#if catalog}<span>Updated {addedDate(catalog.updatedAt)}</span>{/if}
      </footer>
    </section>

    <div class="rankings panel">
      <div class="ranking-tabs" role="tablist" aria-label="Model rankings">
        {#each lists as list, index}
          <button
            id={`ranking-tab-${list.id}`}
            type="button"
            role="tab"
            aria-selected={selectedRanking === list.id}
            aria-controls={`ranking-panel-${list.id}`}
            tabindex={selectedRanking === list.id ? 0 : -1}
            on:click={() => (selectedRanking = list.id)}
            on:keydown={(event) => handleTabKey(event, index)}
            >{list.title}</button
          >
        {/each}
      </div>
      {#each lists as list (list.id)}
        {#if selectedRanking === list.id}
          <div
            class="ranking-panel"
            id={`ranking-panel-${list.id}`}
            role="tabpanel"
            tabindex="0"
            aria-labelledby={`ranking-tab-${list.id}`}
          >
            <header class="panel-heading">
              <div class="heading-line">
                <div class="ranking-title">
                  <h2 class="visually-hidden" id={`ranking-${list.id}`}>
                    {list.title}
                  </h2>
                  {#if list.entries.length}<span class="chart-count"
                      >Top {list.entries.length}</span
                    >{/if}
                  <a
                    class="benchmark-source"
                    href={list.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${list.sourceName}`}
                    >{list.sourceName} <span aria-hidden="true">↗</span></a
                  >
                </div>
              </div>
              <p class="metric-explanation">{list.explanation}</p>
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
                        />{:else}<span class="id-unmatched">ID not matched</span
                        >{/if}
                    </div>
                    <div class="chart-measure">
                      <small
                        class="chart-caption"
                        title={list.id === "overall"
                          ? entry.model.lab ?? ""
                          : `${entry.model.harness ?? "Agent not listed"}${entry.model.setting ? ` · ${entry.model.setting}` : ""}`}
                        >{#if list.id === "value"}<span class="success-rate"
                            >{percent(entry.score)} solved</span
                          >
                        {:else}{list.id === "overall"
                            ? entry.model.lab ?? ""
                            : entry.model.harness ??
                              "Agent not listed"}{#if list.id !== "overall" && entry.model.setting}
                            · {entry.model.setting}{/if}{/if}</small
                      >
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
                        <small class="metric-unit">{list.unit}</small>
                      </span>
                    </div>
                  </li>
                {/each}
              </ol>
              {#if list.entries.length < 10}<p class="coverage-note">
                  {list.entries.length} models with published {list.id ===
                  "value"
                    ? "success and cost"
                    : "benchmark"} data.
                </p>{/if}
            {:else}
              <div class="ranking-empty">
                No published results are available yet.
                <a href={list.href} target="_blank" rel="noreferrer"
                  >Explore {list.id === "overall"
                    ? "Epoch AI"
                    : "Terminal-Bench"}
                  ↗</a
                >
              </div>
            {/if}
            <footer class="list-footer">
              <span
                >From {list.id === "overall"
                  ? "Epoch AI"
                  : "Terminal-Bench"}</span
              >
              {#if list.asOf}
                <span>Updated {addedDate(list.asOf)}</span>
              {/if}
            </footer>
          </div>
        {/if}
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
        Best Task per Dollar ranks successful coding trials per dollar of
        reported total run cost. Success rates are shown alongside efficiency so
        low-cost runs with fewer successful attempts remain distinguishable.
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
    --discovery-muted: color-mix(in srgb, var(--hf-ink) 74%, var(--hf-dialog));
    padding: 26px 0 22px;
  }
  .discover-heading {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    margin-bottom: 16px;
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
    color: var(--discovery-muted);
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
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
    gap: 20px;
    align-items: stretch;
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
    padding: 18px 20px 14px;
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
  .panel-heading p {
    color: var(--discovery-muted);
    font-size: 11px;
    margin: 7px 0 0;
    line-height: 1.5;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .update-panel {
    flex: 1;
    min-width: 0;
  }
  .update-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .update-heading {
    padding: 14px 20px 10px;
  }
  .update-heading .update-summary {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 6px 12px;
    margin: 0;
  }
  .update-summary a {
    color: var(--discovery-muted);
    white-space: nowrap;
  }
  .update-summary a:hover {
    color: var(--hf-accent);
  }
  .update-tabs button:focus-visible,
  .update-panel:focus-visible {
    outline: 2px solid var(--hf-accent);
    outline-offset: 3px;
  }
  .list-footer a {
    color: inherit;
  }
  .model-list,
  .ranking-list {
    list-style: none;
    padding: 0 20px;
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
    padding: 9px 0;
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
    gap: 4px;
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
    color: var(--discovery-muted);
    font-size: 12px;
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
    font-size: 11px;
    line-height: 1.2;
    background: var(--hf-faint);
  }
  .modality-flow {
    color: var(--discovery-muted);
    font-size: 12px;
    line-height: 1.4;
  }
  .model-title-line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(90px, 45%);
    align-items: baseline;
    justify-content: space-between;
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
    font-size: 11px;
    color: var(--discovery-muted);
    border-top: 1px solid var(--hf-line);
  }
  .rankings {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .ranking-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .ranking-panel:focus-visible {
    outline: 2px solid var(--hf-accent);
    outline-offset: -3px;
  }
  .ranking-tabs {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.5fr);
  }
  .ranking-tabs,
  .update-tabs {
    display: grid;
    gap: 4px;
    margin: 12px 12px 0;
    padding: 4px;
    border-radius: 7px;
    background: var(--hf-faint);
  }
  .ranking-tabs button,
  .update-tabs button {
    min-width: 0;
    border: 1px solid transparent;
    border-radius: 5px;
    padding: 8px 4px;
    background: transparent;
    color: var(--discovery-muted);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.3;
  }
  .ranking-tabs button[aria-selected="true"],
  .update-tabs button[aria-selected="true"] {
    background: var(--hf-dialog);
    border-color: var(--hf-line);
    color: var(--hf-accent);
    box-shadow: 0 1px 3px #00000008;
  }
  .ranking-tabs button:hover:not([aria-selected="true"]),
  .update-tabs button:hover:not([aria-selected="true"]) {
    color: var(--hf-ink);
    background: var(--hf-dialog);
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
  .benchmark-source {
    font-size: 13px;
    line-height: 1.35;
    font-weight: 500;
    color: var(--hf-accent);
  }
  .benchmark-source:hover {
    text-decoration: underline;
  }
  .ranking-panel .metric-explanation {
    font-size: 12px;
    line-height: 1.5;
    margin-top: 7px;
  }
  .ranking-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .chart-count {
    flex-shrink: 0;
    white-space: nowrap;
    font-size: 11px;
    color: var(--discovery-muted);
    padding: 3px 6px;
    border: 1px solid var(--hf-line);
    border-radius: 4px;
  }
  .ranking-panel .panel-heading {
    padding: 14px 20px 10px;
  }
  .ranking-list {
    padding-bottom: 4px;
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .chart-row {
    padding: 4px 0;
    flex: 1;
  }
  .chart-heading {
    line-height: 1.3;
    display: grid;
    grid-template-columns: 15px 22px minmax(0, 1fr) minmax(90px, 38%);
    align-items: center;
    gap: 7px;
  }
  .rank {
    font-size: 11px;
    color: var(--discovery-muted);
    font-variant-numeric: tabular-nums;
  }
  .ranking-logo,
  .ranking-fallback {
    width: 22px;
    height: 22px;
    border-radius: 4px;
  }
  .ranking-fallback {
    font-size: 11px;
  }
  .ranking-link {
    min-width: 0;
  }
  .id-unmatched {
    justify-self: end;
    font-size: 11px;
    color: var(--discovery-muted);
  }
  .ranking-link strong {
    font-size: 13px;
    line-height: 1.35;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .chart-measure {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr) 112px;
    align-items: center;
    gap: 9px;
    margin: 3px 0 0 22px;
  }
  .bar-track {
    min-width: 0;
    height: 7px;
    background: var(--hf-faint);
    border-radius: 2px;
    overflow: hidden;
  }
  .bar-fill {
    display: block;
    height: 100%;
    background: var(--hf-accent);
    opacity: 0.8;
    border-radius: 2px;
  }
  .rank-metric {
    line-height: 1.25;
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 4px;
    font-variant-numeric: tabular-nums;
  }
  .rank-metric strong {
    font-size: 13px;
    font-weight: 600;
  }
  .metric-unit {
    font-size: 11px;
    line-height: 1.2;
    color: var(--discovery-muted);
    white-space: nowrap;
  }
  .chart-caption {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--discovery-muted);
    font-size: 11px;
    line-height: 1.4;
  }
  .success-rate {
    color: var(--hf-ink);
    font-weight: 600;
  }
  .coverage-note {
    margin: 0;
    padding: 0 20px 14px;
    color: var(--discovery-muted);
    font-size: 11px;
  }
  .empty-state,
  .ranking-empty {
    padding: 24px 22px;
    color: var(--discovery-muted);
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
    color: var(--discovery-muted);
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
    padding-top: 12px;
    font-size: 11px;
    color: var(--discovery-muted);
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
  @media (max-width: 1000px) {
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
      grid-template-columns: 13px 20px minmax(0, 1fr) minmax(80px, 35%);
      gap: 5px;
    }
    .chart-measure {
      grid-template-columns: 80px minmax(0, 1fr) 100px;
      gap: 7px;
      margin-left: 18px;
    }
  }
</style>
