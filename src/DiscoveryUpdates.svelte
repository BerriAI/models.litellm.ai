<script lang="ts">
  import { onMount } from "svelte";
  import {
    loadDiscoveryCatalog,
    selectDiscoveryModels,
    type DiscoveryCatalog,
  } from "./discoveryCatalog";

  let catalog: DiscoveryCatalog | null = null;
  let loading = true;
  let failed = false;
  let selectedProvider = "all";

  $: matchingModels =
    catalog?.models.filter(
      (model) =>
        selectedProvider === "all" ||
        model.providers.some((provider) => provider.id === selectedProvider),
    ) ?? [];
  $: models = selectDiscoveryModels(matchingModels, 6);
  $: providerOptions = [...(catalog?.providers ?? [])]
    .filter((provider) => provider.latestModelDate)
    .sort((a, b) => a.name.localeCompare(b.name));
  $: recentProviders = (catalog?.providers ?? [])
    .filter((provider) => provider.recentModelCount > 0)
    .slice(0, 4);

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

  function contextSize(tokens: number): string {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(tokens);
  }

  onMount(() => {
    void loadUpdates();
  });
</script>

<section class="discovery-updates" aria-labelledby="new-models-title">
  <div class="section-heading">
    <div>
      <h2 id="new-models-title">New models <span class="new-dot"></span></h2>
      <p class="section-description">Fresh additions to the LiteLLM catalog.</p>
    </div>
    <a class="all-updates" href="/new-models"
      >See what's new <span aria-hidden="true">↗</span></a
    >
  </div>

  {#if loading}
    <div class="loading-state" role="status">Loading the latest models…</div>
    <div class="model-grid" aria-hidden="true">
      {#each Array(3) as _}<div class="skeleton-card">
          <span></span><span></span><span></span>
        </div>{/each}
    </div>
  {:else if failed}
    <div class="empty-state" role="status">
      <p>Recent additions couldn't be loaded.</p>
      <button on:click={loadUpdates}>Try again</button>
      <a href="/new-models">Browse all updates ↗</a>
    </div>
  {:else if catalog}
    <div class="catalog-toolbar">
      <label for="discovery-provider"
        >Provider
        <select
          id="discovery-provider"
          value={selectedProvider}
          on:change={(event) => (selectedProvider = event.currentTarget.value)}
        >
          <option value="all">All providers</option>
          {#each providerOptions as provider}<option value={provider.id}
              >{provider.name}</option
            >{/each}
        </select>
      </label>
      <span class="updated-date">Updated {addedDate(catalog.updatedAt)}</span>
    </div>

    {#if models.length}
      <div class="model-grid">
        {#each models as model (model.slug)}
          <a
            class="model-card"
            href={model.href}
            aria-label={`Explore ${model.name}`}
          >
            <div class="card-top">
              {#if model.logo}<img
                  class="brand-logo"
                  src={model.logo}
                  alt={model.lab ?? model.name}
                />
              {:else}<span class="brand-fallback" aria-hidden="true"
                  >{(model.lab ?? model.name).slice(0, 1)}</span
                >{/if}
              <span class="added-date">Added {addedDate(model.firstSeen)}</span>
            </div>
            <h3>{model.name}</h3>
            <span class="model-lab"
              >{model.lab ?? "Available through LiteLLM"}</span
            >
            <div class="model-details">
              {#if model.context}<span
                  >{contextSize(model.context)} context</span
                >{/if}
              {#if model.providers.length}<span
                  >{model.providers.length}
                  {model.providers.length === 1
                    ? "provider"
                    : "providers"}</span
                >{/if}
            </div>
            <p class="model-price">{model.price ?? "Pricing not listed"}</p>
            <div class="card-bottom">
              <span
                class="provider-logos"
                aria-label={model.providers
                  .map((provider) => provider.name)
                  .join(", ")}
              >
                {#each model.providers.slice(0, 3) as provider}
                  {#if provider.logo}<img
                      src={provider.logo}
                      alt={provider.name}
                    />
                  {:else}<span class="provider-initial" aria-hidden="true"
                      >{provider.name.slice(0, 1)}</span
                    >{/if}
                {/each}
                {#if model.providers.length > 3}<small
                    >+{model.providers.length - 3}</small
                  >{/if}
              </span>
              <span class="explore-model"
                >Explore <span aria-hidden="true">↗</span></span
              >
            </div>
          </a>
        {/each}
      </div>
    {:else}
      <p class="empty-state" role="status">
        No dated model additions are available for this provider yet. <a
          href="/search">Explore the catalog ↗</a
        >
      </p>
    {/if}

    {#if recentProviders.length}
      <section
        class="provider-updates"
        aria-labelledby="provider-updates-title"
      >
        <div class="section-heading">
          <div>
            <h2 id="provider-updates-title">Provider updates</h2>
            <p class="section-description">
              Providers with new models in the last 30 days.
            </p>
          </div>
          <a class="all-updates" href="/providers"
            >All providers <span aria-hidden="true">↗</span></a
          >
        </div>
        <div class="provider-grid">
          {#each recentProviders as provider (provider.id)}
            <a class="provider-card" href={provider.href}>
              {#if provider.logo}<img
                  class="brand-logo"
                  src={provider.logo}
                  alt=""
                />
              {:else}<span class="brand-fallback" aria-hidden="true"
                  >{provider.name.slice(0, 1)}</span
                >{/if}
              <span class="provider-info"
                ><strong>{provider.name}</strong><span
                  >{provider.recentModelCount} new {provider.recentModelCount ===
                  1
                    ? "model"
                    : "models"}</span
                ></span
              >
              <span class="provider-arrow" aria-hidden="true">↗</span>
            </a>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</section>

<style>
  .discovery-updates {
    border-top: 1px solid var(--hf-line);
    padding: 25px 0 34px;
  }
  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 14px;
    margin-bottom: 20px;
  }
  h2 {
    font-size: 23px;
    font-weight: 500;
    letter-spacing: -0.5px;
    line-height: 1.3;
    margin: 0;
  }
  .new-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--hf-accent);
    vertical-align: middle;
    margin-left: 7px;
  }
  .section-description {
    font-size: 13px;
    color: var(--hf-muted);
    margin: 6px 0 0;
  }
  .all-updates {
    display: flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
    font-size: 12px;
    color: var(--hf-accent);
  }
  .all-updates:hover {
    text-decoration: underline;
  }
  .catalog-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 14px;
    margin-bottom: 18px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: var(--hf-muted);
  }
  select {
    background: var(--hf-bg);
    color: var(--hf-ink);
    border: 1px solid var(--hf-line);
    border-radius: 0;
    font-size: 12px;
    padding: 8px 30px 8px 10px;
    max-width: 240px;
  }
  .updated-date,
  .added-date {
    color: var(--hf-muted);
    font:
      11px "IBM Plex Mono",
      monospace;
  }
  .model-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }
  .model-card {
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding: 20px;
    background: var(--hf-dialog);
    border: 1px solid var(--hf-line);
    text-decoration: none;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .model-card:hover {
    border-color: var(--hf-accent);
    background: var(--hover-bg);
  }
  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 18px;
  }
  .brand-logo,
  .brand-fallback {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    object-fit: contain;
  }
  .brand-logo {
    background: #fff;
    padding: 5px;
    border-radius: 4px;
  }
  .brand-fallback {
    display: grid;
    place-items: center;
    background: var(--hf-faint);
    color: var(--hf-accent);
    border: 1px solid var(--hf-line);
    font-size: 20px;
  }
  h3 {
    font-size: 18px;
    font-weight: 500;
    letter-spacing: -0.4px;
    line-height: 1.35;
    overflow-wrap: anywhere;
    margin: 0 0 5px;
  }
  .model-lab {
    font-size: 12px;
    color: var(--hf-muted);
  }
  .model-details {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin: 16px 0;
    min-height: 23px;
  }
  .model-details span {
    color: var(--hf-muted);
    border: 1px solid var(--hf-line);
    padding: 3px 6px;
    font-size: 11px;
    line-height: 1.4;
  }
  .model-price {
    margin: auto 0 18px;
    font:
      12px/1.6 "IBM Plex Mono",
      monospace;
  }
  .card-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 13px;
    border-top: 1px solid var(--hf-line);
  }
  .provider-logos {
    display: flex;
    align-items: center;
    gap: 5px;
    min-height: 20px;
  }
  .provider-logos img,
  .provider-initial {
    width: 20px;
    height: 20px;
    padding: 2px;
    object-fit: contain;
    background: #fff;
    border-radius: 3px;
  }
  .provider-initial {
    display: grid;
    place-items: center;
    background: var(--hf-faint);
    font-size: 11px;
    color: var(--hf-muted);
  }
  .provider-logos small {
    margin-left: 3px;
    color: var(--hf-muted);
    font-size: 11px;
  }
  .explore-model {
    color: var(--hf-accent);
    font-size: 12px;
    display: flex;
    gap: 16px;
  }
  .provider-updates {
    margin-top: 30px;
  }
  .provider-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
  .provider-card {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 16px;
    border: 1px solid var(--hf-line);
    text-decoration: none;
    min-width: 0;
  }
  .provider-card:hover {
    border-color: var(--hf-accent);
  }
  .provider-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .provider-info strong {
    font-weight: 500;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .provider-info > span {
    color: var(--hf-muted);
    font-size: 11px;
  }
  .provider-arrow {
    margin-left: auto;
    color: var(--hf-muted);
  }
  .loading-state {
    font-size: 13px;
    color: var(--hf-muted);
    margin: 0 0 16px;
  }
  .skeleton-card {
    border: 1px solid var(--hf-line);
    padding: 20px;
    height: 230px;
  }
  .skeleton-card span {
    display: block;
    height: 16px;
    background: var(--hf-faint);
    margin-bottom: 20px;
  }
  .skeleton-card span:first-child {
    height: 34px;
    width: 34px;
  }
  .skeleton-card span:last-child {
    width: 60%;
  }
  .empty-state {
    padding: 24px;
    border: 1px solid var(--hf-line);
    color: var(--hf-muted);
    font-size: 13px;
  }
  .empty-state p {
    margin-top: 0;
  }
  .empty-state a {
    color: var(--hf-accent);
    margin-left: 14px;
  }
  .empty-state button {
    border: 1px solid var(--hf-line);
    background: var(--hf-dialog);
    color: var(--hf-ink);
    padding: 8px 14px;
  }
  @media (max-width: 1100px) {
    .provider-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 850px) {
    .model-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 540px) {
    .model-grid,
    .provider-grid {
      grid-template-columns: 1fr;
    }
    h2 {
      font-size: 21px;
    }
    .model-card {
      padding: 18px;
    }
    .catalog-toolbar {
      align-items: flex-start;
    }
    select {
      max-width: 205px;
    }
    .updated-date {
      width: 100%;
    }
  }
  @media (pointer: coarse) {
    select,
    .empty-state button {
      min-height: 44px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .model-card {
      transition: none;
    }
  }
</style>
