<script lang="ts">
  import { onMount } from "svelte";
  import {
    loadDiscoveryCatalog,
    selectDiscoveryModels,
    type DiscoveryCatalog,
  } from "./discoveryCatalog";
  import {
    loadDiscoveryBenchmarks,
    rankQuality,
    rankValue,
    QUALITY_BENCHMARKS,
    VALUE_BENCHMARKS,
    type QualityBenchmarkId,
    type ValueBenchmarkId,
  } from "./discoveryBenchmarks";
  import { getProviderLogo } from "./providers";

  type View = "new" | "quality" | "value";
  let catalog: DiscoveryCatalog | null = null;
  let benchmarks: Awaited<ReturnType<typeof loadDiscoveryBenchmarks>> | null =
    null;
  let loading = true;
  let failed = false;
  let benchmarkLoading = true;
  let benchmarkFailed = false;
  let selectedProvider = "all";
  let view: View = "new";
  let qualityBenchmark: QualityBenchmarkId = "overall";
  let valueBenchmark: ValueBenchmarkId = "coding";
  let minSuccess = 0.5;

  $: models = selectDiscoveryModels(
    catalog?.models.filter(
      (model) =>
        selectedProvider === "all" ||
        model.providers.some((p) => p.id === selectedProvider),
    ) ?? [],
    6,
  );
  $: providerOptions = [...(catalog?.providers ?? [])]
    .filter((p) => p.latestModelDate)
    .sort((a, b) => a.name.localeCompare(b.name));
  $: recentProviders = (catalog?.providers ?? [])
    .filter((p) => p.recentModelCount > 0)
    .slice(0, 4);
  $: quality = rankQuality(benchmarks?.models ?? [], qualityBenchmark);
  $: value = rankValue(benchmarks?.models ?? [], valueBenchmark, minSuccess);
  $: qualityOption = QUALITY_BENCHMARKS.find(
    (option) => option.id === qualityBenchmark,
  )!;
  $: valueOption = VALUE_BENCHMARKS.find(
    (option) => option.id === valueBenchmark,
  )!;
  $: highlights = [
    {
      label: "Top quality",
      id: "overall" as const,
      result: rankQuality(benchmarks?.models ?? [], "overall")[0],
      metric: "Epoch Capabilities Index",
      percent: false,
    },
    {
      label: "Top coding",
      id: "coding" as const,
      result: rankQuality(benchmarks?.models ?? [], "coding")[0],
      metric: "DeepSWE · tasks solved",
      percent: true,
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
    }).format(new Date(`${date.length === 7 ? `${date}-01` : date}T00:00:00Z`));
  }
  function logo(slug: string, lab: string | null): string | null {
    return (
      catalog?.models.find((model) => model.slug === slug)?.logo ??
      getProviderLogo(lab ?? "")
    );
  }
  const number = (value: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const dollars = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: value < 0.01 ? 4 : 2,
    }).format(value);
  function showQuality(id: QualityBenchmarkId) {
    qualityBenchmark = id;
    view = "quality";
  }
  function selectQuality(event: Event) {
    qualityBenchmark = (event.currentTarget as HTMLSelectElement)
      .value as QualityBenchmarkId;
  }
  function selectValue(event: Event) {
    valueBenchmark = (event.currentTarget as HTMLSelectElement)
      .value as ValueBenchmarkId;
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
      <p>
        What's new, what performs well, and what gets more done for your dollar.
      </p>
    </div>
    <a class="browse-button" href="/search"
      >Browse all models <span aria-hidden="true">↗</span></a
    >
  </header>
  <div class="discovery-grid">
    <section class="list-panel panel" aria-label="Explore model lists">
      <div class="list-tabs" aria-label="Model discovery lists">
        <button
          class:active={view === "new"}
          aria-pressed={view === "new"}
          on:click={() => (view = "new")}
          >New models <span class="new-dot"></span></button
        >
        <button
          class:active={view === "quality"}
          aria-pressed={view === "quality"}
          on:click={() => (view = "quality")}>Top quality</button
        >
        <button
          class:active={view === "value"}
          aria-pressed={view === "value"}
          on:click={() => (view = "value")}>Best value</button
        >
      </div>
      <div class="list-intro">
        <h2>
          {view === "new"
            ? "Fresh in the catalog"
            : view === "quality"
              ? "Leading on the benchmarks"
              : "More tasks solved per dollar"}
        </h2>
        <p>
          {view === "new"
            ? "Recent additions, with a mix of models and providers."
            : view === "quality"
              ? "Published results for models available through LiteLLM."
              : "Measured success and cost from the same benchmark run."}
        </p>
      </div>
      <div class="list-controls">
        {#if view === "new"}
          <label for="discovery-provider">Provider</label>
          <select
            id="discovery-provider"
            value={selectedProvider}
            on:change={(event) =>
              (selectedProvider = event.currentTarget.value)}
          >
            <option value="all">All providers</option
            >{#each providerOptions as provider}<option value={provider.id}
                >{provider.name}</option
              >{/each}
          </select>
          {#if catalog}<span class="updated-date"
              >Updated {addedDate(catalog.updatedAt)}</span
            >{/if}
        {:else if view === "quality"}
          <label for="quality-benchmark">Benchmark</label>
          <select
            id="quality-benchmark"
            value={qualityBenchmark}
            on:change={selectQuality}
          >
            {#each QUALITY_BENCHMARKS as option}<option value={option.id}
                >{option.label}</option
              >{/each}
          </select>
        {:else}
          <label for="value-benchmark">Task</label>
          <select
            id="value-benchmark"
            value={valueBenchmark}
            on:change={selectValue}
          >
            {#each VALUE_BENCHMARKS as option}<option value={option.id}
                >{option.label}</option
              >{/each}
          </select>
          <label class="sr-only" for="minimum-success"
            >Minimum success rate</label
          >
          <select
            id="minimum-success"
            value={minSuccess}
            on:change={(event) =>
              (minSuccess = Number(event.currentTarget.value))}
          >
            <option value={0}>Any success rate</option><option value={0.5}
              >At least 50% success</option
            ><option value={0.7}>At least 70% success</option><option
              value={0.9}>At least 90% success</option
            >
          </select>
        {/if}
      </div>
      {#if view === "new"}
        {#if loading}<div class="empty-state" role="status">
            Loading the latest models…
          </div>
        {:else if failed}<div class="empty-state" role="status">
            <p>Recent additions couldn't be loaded.</p>
            <button on:click={loadUpdates}>Try again</button>
          </div>
        {:else if models.length}
          <ol class="model-list">
            {#each models as model (model.slug)}
              <li>
                <a
                  class="model-row"
                  href={model.href}
                  aria-label={`Explore ${model.name}`}
                >
                  {#if model.logo}<img
                      class="brand-logo"
                      src={model.logo}
                      alt={model.lab ?? model.name}
                    />{:else}<span class="brand-fallback" aria-hidden="true"
                      >{(model.lab ?? model.name).slice(0, 1)}</span
                    >{/if}
                  <span class="model-copy"
                    ><strong>{model.name}</strong><span
                      >{model.lab ?? "Available through LiteLLM"}</span
                    ><small>{model.price ?? "Pricing not listed"}</small></span
                  >
                  <span class="row-end"
                    ><span class="added-date"
                      >Added {addedDate(model.firstSeen)}</span
                    ><span
                      class="provider-logos"
                      aria-label={model.providers
                        .map((provider) => provider.name)
                        .join(", ")}
                    >
                      {#each model.providers.slice(0, 3) as provider}{#if provider.logo}<img
                            src={provider.logo}
                            alt={provider.name}
                          />{/if}{/each}
                      {#if model.providers.length > 3}<small
                          >+{model.providers.length - 3}</small
                        >{/if}
                    </span></span
                  >
                </a>
              </li>
            {/each}
          </ol>
        {:else}<p class="empty-state" role="status">
            No dated model additions are available for this provider yet. <a
              href="/search">Explore the catalog ↗</a
            >
          </p>{/if}
      {:else if benchmarkLoading}<div class="empty-state" role="status">
          Loading published benchmarks…
        </div>
      {:else if benchmarkFailed}<div class="empty-state" role="status">
          <p>Benchmark results couldn't be loaded.</p>
          <button on:click={loadScores}>Retry benchmarks</button>
        </div>
      {:else if view === "quality"}
        {#if quality.length}
          <div class="column-labels">
            <span>Model</span><span>{qualityOption.benchmark}</span>
          </div>
          <ol class="model-list ranking-list">
            {#each quality.slice(0, 6) as entry, index (entry.model.slug)}
              <li>
                <a
                  class="model-row"
                  href={entry.model.href}
                  aria-label={`Explore ${entry.model.name}`}
                >
                  <span class="rank">{index + 1}</span>
                  {#if logo(entry.model.slug, entry.model.lab)}<img
                      class="brand-logo"
                      src={logo(entry.model.slug, entry.model.lab) ?? ""}
                      alt=""
                    />{:else}<span class="brand-fallback" aria-hidden="true"
                      >{(entry.model.lab ?? entry.model.name).slice(0, 1)}</span
                    >{/if}
                  <span class="model-copy"
                    ><strong>{entry.model.name}</strong><span
                      >{entry.model.lab ?? "LiteLLM catalog"}{entry.setting
                        ? ` · ${entry.setting}`
                        : ""}</span
                    ></span
                  >
                  <span class="rank-metric"
                    ><span class="score-track" aria-hidden="true"
                      ><span
                        style:width={`${quality[0].score > 0 ? Math.min(100, Math.max(0, (entry.score / quality[0].score) * 100)) : 0}%`}
                      ></span></span
                    ><strong
                      >{qualityBenchmark === "overall"
                        ? number(entry.score)
                        : percent(entry.score)}</strong
                    ></span
                  >
                </a>
              </li>
            {/each}
          </ol>
        {:else}<p class="empty-state">
            No matched results for this benchmark yet.
          </p>{/if}
      {:else if value.length}
        <div class="column-labels">
          <span>Model · benchmark success</span><span>Solved / $</span>
        </div>
        <ol class="model-list ranking-list">
          {#each value.slice(0, 6) as entry, index (entry.model.slug)}
            <li>
              <a
                class="model-row"
                href={entry.model.href}
                aria-label={`Explore ${entry.model.name}`}
              >
                <span class="rank">{index + 1}</span>
                {#if logo(entry.model.slug, entry.model.lab)}<img
                    class="brand-logo"
                    src={logo(entry.model.slug, entry.model.lab) ?? ""}
                    alt=""
                  />{:else}<span class="brand-fallback" aria-hidden="true"
                    >{(entry.model.lab ?? entry.model.name).slice(0, 1)}</span
                  >{/if}
                <span class="model-copy"
                  ><strong>{entry.model.name}</strong><span
                    >{percent(entry.score)} solved · {dollars(
                      entry.costPerTask,
                    )} / attempt</span
                  ><small
                    >{entry.setting ?? "Setting not reported"}{entry.date
                      ? ` · ${entry.date}`
                      : ""}</small
                  ></span
                >
                <span class="value-metric"
                  ><strong>{number(entry.solvedPerDollar)}</strong><small
                    >solved / $</small
                  ></span
                >
              </a>
            </li>
          {/each}
        </ol>
      {:else}<p class="empty-state">
          No measured runs meet this success rate yet. Try a lower threshold or
          another task.
        </p>{/if}
      <div class="list-footer">
        {#if view === "new"}<span>Dates reflect catalog additions.</span><a
            href="/new-models">See what's new ↗</a
          >
        {:else if view === "quality"}<span>{quality.length} matched models</span
          ><a href={qualityOption.url} target="_blank" rel="noreferrer"
            >{qualityOption.benchmark} ↗</a
          >
        {:else}<span
            >{value.length}
            {value.length === 1 ? "model" : "models"} · ≥{percent(minSuccess)} success</span
          ><a href={valueOption.url} target="_blank" rel="noreferrer"
            >{valueOption.benchmark} ↗</a
          >{/if}
      </div>
    </section>
    <aside class="highlights" aria-label="Model highlights">
      {#if benchmarkFailed}
        <div class="benchmark-error" role="status">
          <span>Benchmark results couldn't be loaded.</span>
          <button on:click={loadScores}>Retry results</button>
        </div>
      {/if}
      {#each highlights as highlight}
        <article class="highlight panel">
          <button
            class="highlight-heading"
            on:click={() => showQuality(highlight.id)}
            >{highlight.label}<span aria-hidden="true">↗</span></button
          >
          {#if highlight.result}
            <a class="highlight-model" href={highlight.result.model.href}>
              {#if logo(highlight.result.model.slug, highlight.result.model.lab)}<img
                  class="brand-logo"
                  src={logo(
                    highlight.result.model.slug,
                    highlight.result.model.lab,
                  ) ?? ""}
                  alt=""
                />{/if}<strong>{highlight.result.model.name}</strong>
            </a>
            <div class="headline-metric">
              {highlight.percent
                ? percent(highlight.result.score)
                : number(highlight.result.score)}
            </div>
            <a
              class="metric-source"
              href={highlight.result.sourceUrl}
              target="_blank"
              rel="noreferrer">{highlight.metric} ↗</a
            >
            <small
              >{highlight.result.setting
                ? `${highlight.result.setting} · `
                : ""}{highlight.result.date ?? "Date not reported"}</small
            >
          {:else}<p class="highlight-empty">
              {benchmarkLoading
                ? "Loading results…"
                : benchmarkFailed
                  ? "Results unavailable."
                  : "No published result available."}
            </p>{/if}
        </article>
      {/each}
      <article class="highlight value-highlight panel">
        <div class="value-heading">
          <button class="highlight-heading" on:click={() => (view = "value")}
            >Best value for a task <span aria-hidden="true">↗</span></button
          >
          <label class="sr-only" for="highlight-task"
            >Value highlight task</label
          ><select
            id="highlight-task"
            value={valueBenchmark}
            on:change={selectValue}
          >
            {#each VALUE_BENCHMARKS as option}<option value={option.id}
                >{option.label}</option
              >{/each}
          </select>
        </div>
        {#if value[0]}
          <a class="highlight-model" href={value[0].model.href}>
            {#if logo(value[0].model.slug, value[0].model.lab)}<img
                class="brand-logo"
                src={logo(value[0].model.slug, value[0].model.lab) ?? ""}
                alt=""
              />{/if}<strong>{value[0].model.name}</strong>
          </a>
          <div class="value-stat">
            <span class="headline-metric"
              >{number(value[0].solvedPerDollar)}</span
            ><span>benchmark tasks<br />solved per dollar</span>
          </div>
          <p class="value-detail">
            {percent(value[0].score)} solved · {dollars(value[0].costPerTask)} per
            attempt{value[0].setting ? ` · ${value[0].setting}` : ""}
          </p>
          <div class="value-source">
            <a
              class="metric-source"
              href={value[0].sourceUrl}
              target="_blank"
              rel="noreferrer">{valueOption.benchmark} ↗</a
            ><small
              >Among runs with ≥{percent(minSuccess)} success{value[0].date
                ? ` · ${value[0].date}`
                : ""}</small
            >
          </div>
        {:else}<p class="highlight-empty">
            {benchmarkLoading
              ? "Loading measured task costs…"
              : benchmarkFailed
                ? "Results unavailable."
                : "No measured runs meet this selection yet."}
          </p>{/if}
      </article>
    </aside>
  </div>
  <div class="source-note">
    <span
      >Quality and value: <a
        href="https://epoch.ai/benchmarks"
        target="_blank"
        rel="noreferrer">Epoch AI Benchmarking Hub</a
      >
      ·
      <a
        href="https://creativecommons.org/licenses/by/4.0/"
        target="_blank"
        rel="noreferrer">CC BY 4.0</a
      >{benchmarks?.asOf
        ? ` · Latest dated result: ${benchmarks.asOf}`
        : ""}</span
    >
    <details>
      <summary>How picks are made</summary>
      <p>
        Quality ranks matched models on the selected benchmark; the general view
        uses the Epoch Capabilities Index. Value is the benchmark success
        fraction divided by measured dollars per attempt, including unsuccessful
        attempts, from the same run and setting. Each model appears once at its
        most efficient eligible setting. These results describe the benchmark,
        not performance on your own tasks. Missing scores or costs are left out.
        Rankings do not measure popularity.
      </p>
    </details>
  </div>
  {#if recentProviders.length}
    <section class="provider-updates" aria-labelledby="provider-updates-title">
      <div class="provider-heading">
        <h2 id="provider-updates-title">
          Provider updates <span>New models in the last 30 days</span>
        </h2>
        <a href="/providers">All providers ↗</a>
      </div>
      <div class="provider-grid">
        {#each recentProviders as provider (provider.id)}<a
            class="provider-card"
            href={provider.href}
          >
            {#if provider.logo}<img
                class="brand-logo"
                src={provider.logo}
                alt=""
              />{:else}<span class="brand-fallback" aria-hidden="true"
                >{provider.name.slice(0, 1)}</span
              >{/if}
            <span
              ><strong>{provider.name}</strong><small
                >{provider.recentModelCount} new {provider.recentModelCount ===
                1
                  ? "model"
                  : "models"}</small
              ></span
            ><span class="provider-arrow" aria-hidden="true">↗</span>
          </a>{/each}
      </div>
    </section>
  {/if}
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
    margin-bottom: 30px;
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
  .discovery-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    gap: 18px;
    align-items: stretch;
  }
  .panel {
    border: 1px solid var(--hf-line);
    background: var(--hf-dialog);
    border-radius: 10px;
    min-width: 0;
  }
  .list-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .list-tabs {
    display: flex;
    gap: 22px;
    padding: 0 23px;
    border-bottom: 1px solid var(--hf-line);
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .list-tabs button {
    background: none;
    border: 0;
    border-bottom: 2px solid transparent;
    padding: 14px 0 12px;
    color: var(--hf-muted);
    font-size: 13px;
    font-weight: 500;
  }
  .list-tabs button.active {
    color: var(--hf-accent);
    border-bottom-color: var(--hf-accent);
  }
  .new-dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    background: var(--hf-accent);
    border-radius: 50%;
    vertical-align: middle;
    margin-left: 5px;
  }
  .list-intro {
    padding: 18px 23px 12px;
  }
  h2 {
    font-size: 21px;
    font-weight: 500;
    letter-spacing: -0.5px;
    margin: 0;
  }
  .list-intro p {
    color: var(--hf-muted);
    font-size: 12px;
    margin: 7px 0 0;
    line-height: 1.5;
  }
  .list-controls {
    padding: 0 23px 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .list-controls label {
    color: var(--hf-muted);
    font-size: 11px;
  }
  select {
    border: 1px solid var(--hf-line);
    border-radius: 5px;
    background: var(--hf-dialog);
    color: var(--hf-ink);
    font: inherit;
    font-size: 11px;
    padding: 7px 24px 7px 8px;
    max-width: 100%;
  }
  .updated-date {
    margin-left: auto;
    font-size: 10px;
    color: var(--hf-muted);
  }
  .model-list {
    list-style: none;
    padding: 0 23px;
    margin: 0;
    flex: 1;
  }
  .model-list li {
    border-top: 1px solid var(--hf-line);
  }
  .model-row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    min-height: 64px;
    padding: 10px 0;
  }
  .model-row:hover strong,
  .highlight-model:hover strong,
  .browse-button:hover {
    color: var(--hf-accent);
  }
  .brand-logo,
  .brand-fallback {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    border-radius: 6px;
  }
  .brand-logo {
    object-fit: contain;
    background: #fff;
    padding: 4px;
  }
  .brand-fallback {
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
    gap: 3px;
    flex: 1;
  }
  .model-copy strong {
    font-size: 14px;
    font-weight: 500;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .model-copy > span {
    color: var(--hf-muted);
    font-size: 11px;
  }
  .model-copy small {
    font-size: 10px;
    color: var(--hf-muted);
    line-height: 1.4;
  }
  .row-end {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex-shrink: 0;
    gap: 10px;
  }
  .added-date {
    font-size: 10px;
    color: var(--hf-muted);
    white-space: nowrap;
  }
  .provider-logos {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .provider-logos img {
    width: 17px;
    height: 17px;
    object-fit: contain;
    padding: 2px;
    background: #fff;
    border-radius: 3px;
  }
  .provider-logos small {
    font-size: 10px;
    color: var(--hf-muted);
  }
  .column-labels {
    padding: 0 23px 11px;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    color: var(--hf-muted);
    font-size: 10px;
  }
  .rank {
    font-size: 12px;
    width: 12px;
    flex-shrink: 0;
    color: var(--hf-muted);
  }
  .ranking-list .model-row {
    min-height: 69px;
  }
  .rank-metric {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  .rank-metric > strong {
    min-width: 42px;
    text-align: right;
  }
  .score-track {
    width: 58px;
    height: 5px;
    border-radius: 5px;
    background: var(--hf-faint);
    overflow: hidden;
  }
  .score-track > span {
    height: 100%;
    display: block;
    border-radius: 5px;
    background: var(--hf-accent);
  }
  .value-metric {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex-shrink: 0;
    gap: 3px;
  }
  .value-metric strong {
    font-size: 17px;
    font-weight: 500;
  }
  .value-metric small {
    font-size: 10px;
    color: var(--hf-muted);
  }
  .list-footer {
    margin-top: auto;
    padding: 15px 23px;
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 10px;
    color: var(--hf-muted);
    border-top: 1px solid var(--hf-line);
  }
  .list-footer a {
    color: var(--hf-accent);
  }
  .highlights {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    grid-template-rows: 1fr 1fr;
  }
  .highlight {
    padding: 22px;
    display: flex;
    flex-direction: column;
  }
  .highlight-heading {
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
    padding: 0;
    background: none;
    border: 0;
    color: var(--hf-muted);
    font-size: 14px;
    text-align: left;
  }
  .highlight-heading:hover {
    color: var(--hf-accent);
  }
  .highlight-heading > span {
    font-size: 17px;
  }
  .highlight-model {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 18px 0 24px;
  }
  .highlight-model strong {
    font-size: 17px;
    font-weight: 500;
    overflow-wrap: anywhere;
    line-height: 1.4;
  }
  .highlight-model .brand-logo {
    width: 28px;
    height: 28px;
  }
  .headline-metric {
    font-size: clamp(30px, 3.3vw, 44px);
    font-weight: 500;
    letter-spacing: -1.5px;
    line-height: 1.1;
    margin-top: auto;
  }
  .metric-source {
    font-size: 11px;
    color: var(--hf-muted);
    margin-top: 12px;
    line-height: 1.5;
  }
  .metric-source:hover,
  .source-note a:hover {
    text-decoration: underline;
  }
  .highlight > small {
    font-size: 10px;
    color: var(--hf-muted);
    margin-top: 5px;
  }
  .value-highlight {
    grid-column: 1 / -1;
  }
  .value-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .value-heading select {
    max-width: 48%;
  }
  .value-stat {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: auto;
  }
  .value-stat > span:last-child {
    font-size: 13px;
    line-height: 1.5;
    color: var(--hf-muted);
  }
  .value-detail {
    font-size: 12px;
    margin: 12px 0 0;
    color: var(--hf-muted);
  }
  .value-source {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: baseline;
    flex-wrap: wrap;
  }
  .value-source small {
    font-size: 10px;
    color: var(--hf-muted);
  }
  .highlight-empty {
    color: var(--hf-muted);
    font-size: 13px;
    margin: auto 0;
    padding: 30px 0;
    line-height: 1.6;
  }
  .benchmark-error {
    grid-column: 1 / -1;
    display: flex;
    gap: 12px;
    align-items: center;
    font-size: 12px;
    color: var(--hf-muted);
  }
  .benchmark-error button {
    border: 0;
    padding: 0;
    background: none;
    color: var(--hf-accent);
  }
  .empty-state {
    padding: 36px 23px;
    color: var(--hf-muted);
    font-size: 13px;
    flex: 1;
    line-height: 1.6;
  }
  .empty-state button {
    border: 1px solid var(--hf-line);
    background: var(--hf-dialog);
    color: var(--hf-accent);
    padding: 8px 12px;
    border-radius: 4px;
  }
  .source-note {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    padding: 14px 0 0;
    font-size: 10px;
    color: var(--hf-muted);
    line-height: 1.5;
  }
  .source-note details {
    max-width: 440px;
  }
  .source-note summary {
    cursor: pointer;
    white-space: nowrap;
    text-align: right;
  }
  .source-note details p {
    font-size: 12px;
    line-height: 1.65;
  }
  .provider-updates {
    margin-top: 28px;
  }
  .provider-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }
  .provider-heading h2 {
    font-size: 17px;
    letter-spacing: -0.3px;
  }
  .provider-heading h2 span {
    font-size: 11px;
    color: var(--hf-muted);
    font-weight: 400;
    margin-left: 10px;
    letter-spacing: 0;
  }
  .provider-heading > a {
    color: var(--hf-accent);
    font-size: 11px;
  }
  .provider-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
  .provider-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px;
    border: 1px solid var(--hf-line);
    border-radius: 7px;
    min-width: 0;
  }
  .provider-card:hover {
    border-color: var(--hf-accent);
  }
  .provider-card > span:not(.brand-fallback):not(.provider-arrow) {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 5px;
  }
  .provider-card strong {
    font-size: 12px;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .provider-card small {
    font-size: 10px;
    color: var(--hf-muted);
  }
  .provider-arrow {
    margin-left: auto;
    color: var(--hf-muted);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  a:focus-visible,
  button:focus-visible,
  select:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--hf-accent);
    outline-offset: 4px;
  }
  @media (max-width: 1050px) {
    .discovery-grid {
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
      gap: 14px;
    }
    .highlight {
      padding: 18px;
    }
    .highlight-model strong {
      font-size: 15px;
    }
    .highlight-model {
      gap: 7px;
    }
    .score-track {
      display: none;
    }
    .provider-card {
      padding: 11px;
      gap: 7px;
    }
    .provider-arrow {
      display: none;
    }
  }
  @media (max-width: 850px) {
    .discovery-grid {
      grid-template-columns: 1fr;
    }
    .highlights {
      grid-template-rows: auto auto;
    }
    .headline-metric {
      font-size: 38px;
    }
    .provider-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 540px) {
    .discovery-updates {
      padding-top: 28px;
    }
    .discover-heading {
      flex-direction: column;
      gap: 16px;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 27px;
    }
    .discover-heading p {
      font-size: 13px;
      line-height: 1.6;
    }
    .browse-button {
      font-size: 12px;
      padding: 9px 12px;
    }
    .list-tabs {
      padding: 0 16px;
      gap: 20px;
    }
    .list-tabs button {
      font-size: 12px;
    }
    .list-intro {
      padding: 20px 16px 14px;
    }
    h2 {
      font-size: 19px;
    }
    .list-controls {
      padding-left: 16px;
      padding-right: 16px;
    }
    .updated-date {
      width: 100%;
      margin-left: 0;
      margin-top: 3px;
    }
    .model-list {
      padding: 0 16px;
    }
    .model-row {
      gap: 9px;
    }
    .model-copy strong {
      font-size: 13px;
    }
    .model-copy small {
      font-size: 9px;
    }
    .brand-logo,
    .brand-fallback {
      width: 29px;
      height: 29px;
    }
    .row-end {
      max-width: 82px;
    }
    .added-date {
      font-size: 9px;
    }
    .rank-metric {
      font-size: 12px;
    }
    .list-footer,
    .column-labels {
      padding-left: 16px;
      padding-right: 16px;
    }
    .highlight {
      padding: 18px 15px;
    }
    .highlight-heading {
      font-size: 12px;
    }
    .highlight-model {
      gap: 8px;
      flex-wrap: wrap;
    }
    .value-heading {
      flex-wrap: wrap;
    }
    .value-heading select {
      max-width: 100%;
    }
    .source-note {
      flex-direction: column;
      gap: 8px;
    }
    .source-note summary {
      text-align: left;
    }
    .provider-heading h2 span {
      display: block;
      margin: 5px 0 0;
    }
    .provider-grid {
      gap: 9px;
    }
    .provider-card {
      gap: 7px;
    }
  }
</style>
