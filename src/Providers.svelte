<script lang="ts">
  import { onMount } from "svelte";
  import PageHero from "./PageHero.svelte";
  import { filterProviders, supportsEndpoint } from "./providerFilters";
  import { getProviderInitial, getProviderLogo } from "./providers";
  import { trackSearch } from "./analytics";

  type ProviderEndpoint = {
    provider: string;
    display_name: string;
    url: string;
    endpoints: {
      [key: string]: boolean;
    };
  };

  type EndpointMetadata = {
    display_name: string;
    leftnav_label: string;
    url: string;
    docs_label: string;
    bridges_to_chat_completion?: boolean;
  };

  let loading = true;
  let providers: ProviderEndpoint[] = [];
  let endpointsMetadata: { [key: string]: EndpointMetadata } = {};
  let searchQuery = "";
  let selectedEndpoint = "";
  let allEndpoints: string[] = [];
  let filteredEndpoints: string[] = [];
  let filteredProviders: ProviderEndpoint[] = [];
  let matchingProviders: ProviderEndpoint[] = [];
  let hiddenProviderMatches = 0;
  let providerCatalog: Record<string, string> = {};

  const PROVIDERS_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/provider_endpoints_support.json";
  const DOCS_URL = "https://docs.litellm.ai/docs/providers";

  onMount(async () => {
    fetch("/provider-catalog.json")
      .then((response) => response.ok ? response.json() : {})
      .then((catalog: unknown) => {
        if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) return;
        providerCatalog = Object.fromEntries(Object.entries(catalog).filter(
          ([, path]) => typeof path === "string" && /^\/providers\/[^/?#]+$/.test(path),
        ));
      })
      .catch(() => { /* Exact-provider search also works without generated pages. */ });

    try {
      const response = await fetch(PROVIDERS_URL);
      const data = await response.json();
      
      if (data.endpoints) {
        endpointsMetadata = data.endpoints;
      }
      
      if (data.providers) {
        providers = Object.entries(data.providers).map(([provider, info]: [string, any]) => ({
          provider,
          display_name: info.display_name || provider,
          url: info.url || DOCS_URL,
          endpoints: info.endpoints || {}
        }));
      }
      
      const endpointsSet = new Set<string>();
      providers.forEach(p => {
        Object.keys(p.endpoints).forEach(e => endpointsSet.add(e));
      });
      
      const priorityOrder = ['chat_completions', 'responses', 'messages'];
      const sorted = Array.from(endpointsSet).sort();
      allEndpoints = [
        ...priorityOrder.filter(e => sorted.includes(e)),
        ...sorted.filter(e => !priorityOrder.includes(e))
      ];
      
      filteredEndpoints = allEndpoints;
      
      if (allEndpoints.length > 0) {
        selectedEndpoint = allEndpoints[0];
      }
      
      loading = false;
    } catch (error) {
      console.error("Failed to load providers:", error);
      loading = false;
    }
  });

  const debounce = (callback: Function, wait = 500) => {
    let timeout: ReturnType<typeof setTimeout>;
    return (...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => callback(...args), wait);
    };
  };

  const trackSearchDebounced = debounce((query: string, resultsCount: number) => {
    if (query) {
      trackSearch(query, "endpoint", resultsCount);
    }
  }, 1000);

  function showProviderInitial(event: Event) {
    const image = event.currentTarget;
    if (!(image instanceof HTMLImageElement)) return;
    image.style.display = "none";
    const initial = image.nextElementSibling;
    if (initial instanceof HTMLElement) initial.style.display = "flex";
  }

  function formatEndpointName(endpoint: string): string {
    if (endpointsMetadata[endpoint]?.leftnav_label) {
      return endpointsMetadata[endpoint].leftnav_label;
    }
    const formatted = endpoint.replace(/_/g, "/");
    return `/${formatted}`;
  }

  function formatEndpointTitle(endpoint: string): string {
    if (endpointsMetadata[endpoint]?.display_name) {
      return endpointsMetadata[endpoint].display_name;
    }
    return endpoint
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  function getEndpointUrl(endpoint: string): string {
    return endpointsMetadata[endpoint]?.url || DOCS_URL;
  }

  $: {
    const result = filterProviders(
      providers,
      searchQuery,
      selectedEndpoint,
      endpointsMetadata[selectedEndpoint]?.bridges_to_chat_completion,
    );
    matchingProviders = result.matching;
    filteredProviders = result.visible;
    hiddenProviderMatches = result.hiddenCount;
    trackSearchDebounced(searchQuery, filteredProviders.length);
  }

  $: filteredEndpoints = searchQuery.trim()
    ? allEndpoints.filter((endpoint) => endpoint === selectedEndpoint ||
        matchingProviders.some((provider) => supportsEndpoint(
          provider, endpoint, endpointsMetadata[endpoint]?.bridges_to_chat_completion,
        )))
    : allEndpoints;

  function getProviderCount(endpoint: string): number {
    return matchingProviders.filter((provider) => supportsEndpoint(
      provider, endpoint, endpointsMetadata[endpoint]?.bridges_to_chat_completion,
    )).length;
  }

</script>

<main>
  <div class="hf-hero-wrap">
    <PageHero id="providers" title="PROVIDERS" eyebrow="ONE API. EVERY PROVIDER." description="Find the right provider for every endpoint." diagramLabels={["PROVIDERS", "MODELS", "ENDPOINTS"]} diagramCaption="CONNECT / ROUTE / SCALE">
      <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" class="docs-link">Provider docs ↗</a>
    </PageHero>
  </div>

  <div class="search-section">
    <div class="search-input-wrapper">
      <svg class="search-icon" width="18" height="18" viewBox="0 0 20 20" fill="none">
        <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" stroke-width="1.5"/>
        <path d="M12.5 12.5L16.5 16.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <input
        bind:value={searchQuery}
        type="text"
        autocomplete="off"
        aria-label="Search providers"
        placeholder="Search providers..."
        class="search-input"
      />
    </div>
  </div>

  {#if loading}
    <div class="loading">
      <div class="loading-spinner"></div>
      <span>Loading providers...</span>
    </div>
  {:else}
    <div class="container">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h2>Endpoints</h2>
        </div>
        <nav class="endpoints-list" aria-label="Filter by endpoint">
          <button class="endpoint-item" class:active={!selectedEndpoint} on:click={() => selectedEndpoint = ""} type="button">
            <span class="endpoint-label">All endpoints</span>
            <span class="provider-count">{matchingProviders.length}</span>
          </button>
          {#each filteredEndpoints as endpoint (endpoint)}
            <button
              class="endpoint-item"
              class:active={selectedEndpoint === endpoint}
              on:click={() => selectedEndpoint = endpoint}
              type="button"
            >
              <span class="endpoint-label">{formatEndpointName(endpoint)}</span>
              <span class="provider-count">{getProviderCount(endpoint)}</span>
            </button>
          {/each}
        </nav>
      </aside>

      <section class="content">
        <div class="content-header">
          <h2 class="endpoint-title">
            {selectedEndpoint ? formatEndpointTitle(selectedEndpoint) : "All providers"}
            {#if selectedEndpoint}
              <a href={getEndpointUrl(selectedEndpoint)} target="_blank" rel="noopener noreferrer" class="endpoint-docs-link" aria-label="View endpoint documentation">↗</a>
            {/if}
          </h2>
          <p class="endpoint-subtitle">
            {filteredProviders.length} {filteredProviders.length === 1 ? 'provider' : 'providers'}
            {#if selectedEndpoint} support {formatEndpointName(selectedEndpoint)}{:else} across all endpoints{/if}
          </p>
          <p class="catalog-note">Browse the current catalog for models and pricing. Setup docs cover authentication and usage examples.</p>
        </div>
        {#if searchQuery.trim() && hiddenProviderMatches > 0}
          <div class="filter-notice" role="status">
            <span>{hiddenProviderMatches} {hiddenProviderMatches === 1 ? 'match' : 'matches'} outside this endpoint filter.</span>
            <button type="button" on:click={() => selectedEndpoint = ""}>Clear endpoint filter ↗</button>
          </div>
        {/if}
        {#if filteredProviders.length > 0}
          <div class="providers-grid">
            {#each filteredProviders as { provider, display_name, url } (provider)}
              <article class="provider-card">
                <div class="provider-card-header">
                  <div class="provider-avatar">
                    {#if getProviderLogo(provider)}
                      <img 
                        src={getProviderLogo(provider)} 
                        alt={provider}
                        class="provider-logo-img"
                        on:error={showProviderInitial}
                      />
                      <div class="provider-initial" style="display: none;">
                        {getProviderInitial(provider)}
                      </div>
                    {:else}
                      <div class="provider-initial">
                        {getProviderInitial(provider)}
                      </div>
                    {/if}
                  </div>
                  <h3 class="provider-name">{display_name.replace(/\s*\(.*?\)\s*$/, '')}</h3>
                </div>
                <p class="provider-description">
                  {#if selectedEndpoint}
                    {display_name.replace(/\s*\(.*?\)\s*$/, '')} supports {formatEndpointName(selectedEndpoint)} through LiteLLM AI Gateway.
                  {:else}
                    Available through LiteLLM AI Gateway.
                  {/if}
                </p>
                <div class="provider-meta">
                  <span class="provider-key">{provider}</span>
                </div>
                <div class="provider-actions">
                  <a href={providerCatalog[provider] ?? `/search?provider=${encodeURIComponent(provider)}`} aria-label={`Models & pricing for ${display_name}`}>Models &amp; pricing <span aria-hidden="true">→</span></a>
                  <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Setup docs for ${display_name}`}>Setup docs <span aria-hidden="true">↗</span></a>
                </div>
              </article>
            {/each}
          </div>
        {:else}
          <div class="empty-state"><p>No providers match this search and endpoint.</p></div>
        {/if}
      </section>
    </div>
  {/if}
</main>

<style>
  main { min-height: 100vh; background: var(--bg-color); }

  .docs-link { display: inline-flex; color: var(--hf-accent); font-size: 12px; }
  .docs-link:hover { text-decoration: underline; }

  .filter-notice {
    display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
    gap: 12px; padding: 12px 14px; margin-bottom: 18px;
    border: 1px solid var(--hf-line); color: var(--hf-muted); font-size: 12px;
  }
  .filter-notice button { background: none; border: 0; color: var(--hf-accent); font-size: 12px; font-weight: 600; padding: 0; }

  .search-section { max-width: 700px; margin: 1.5rem auto; padding: 0 2rem; }

  .search-input-wrapper { position: relative; width: 100%; }

  .search-icon {
    position: absolute; left: 1rem; top: 50%; transform: translateY(-50%);
    color: var(--muted-color); pointer-events: none;
  }

  .search-input {
    width: 100%; padding: 0.75rem 1rem 0.75rem 2.75rem; font-size: 0.9375rem;
    border: 1px solid var(--border-color); border-radius: 10px;
    background-color: var(--bg-color); color: var(--text-color);
    transition: all 0.15s ease; height: 44px; box-sizing: border-box;
  }

  .search-input:hover { border-color: var(--border-color-strong); }
  .search-input:focus { outline: none; border-color: var(--litellm-primary); box-shadow: 0 0 0 3px var(--focus-ring); }
  .search-input::placeholder { color: var(--muted-color); }

  .loading {
    max-width: 1400px; margin: 4rem auto; padding: 0 2rem;
    text-align: center; color: var(--muted-color);
    display: flex; flex-direction: column; align-items: center; gap: 1rem;
  }

  .loading-spinner {
    width: 32px; height: 32px; border: 3px solid var(--border-color);
    border-top-color: var(--litellm-primary); border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .container {
    display: flex; max-width: 1400px; margin: 1.5rem auto;
    padding: 0 2rem; gap: 2rem; align-items: flex-start;
  }

  .sidebar {
    width: 300px; flex-shrink: 0; background: var(--card-bg);
    border: 1px solid var(--border-color); border-radius: 12px;
    overflow: hidden; position: sticky; top: 5rem;
    max-height: calc(100vh - 6rem); display: flex; flex-direction: column;
  }

  .sidebar-header {
    padding: 1rem 1.25rem; border-bottom: 1px solid var(--border-color);
  }

  .sidebar-header h2 {
    margin: 0; font-size: 0.6875rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-color);
  }

  .endpoints-list { overflow-y: auto; flex: 1; }

  .endpoint-item {
    width: 100%; display: flex; align-items: center; justify-content: space-between;
    padding: 0.75rem 1.25rem; background: none; border: none;
    border-bottom: 1px solid var(--border-color); cursor: pointer;
    transition: all 0.1s ease; text-align: left; color: var(--text-color);
  }

  .endpoint-item:last-child { border-bottom: none; }
  .endpoint-item:hover { background-color: var(--hover-bg); }

  .endpoint-item.active {
    background-color: var(--bg-tertiary); color: var(--litellm-primary);
    font-weight: 600; border-left: 3px solid var(--litellm-primary);
    padding-left: calc(1.25rem - 3px);
  }

  .endpoint-label {
    font-family: 'Geist Mono', monospace; font-size: 0.8125rem;
    flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .provider-count {
    font-size: 0.6875rem; background: var(--bg-tertiary); color: var(--muted-color);
    padding: 0.125rem 0.5rem; border-radius: 10px; font-weight: 600;
    margin-left: 0.5rem; min-width: 28px; text-align: center; flex-shrink: 0;
  }

  .endpoint-item.active .provider-count {
    background: var(--border-color); color: var(--litellm-primary);
  }

  .content { flex: 1; min-width: 0; }
  .content-header { margin-bottom: 1.5rem; }

  .endpoint-title {
    font-size: 1.75rem; font-weight: 800; color: var(--text-color);
    margin: 0 0 0.375rem 0; display: flex; align-items: center; gap: 0.625rem;
    letter-spacing: -0.02em;
  }

  .endpoint-docs-link {
    display: inline-flex; color: var(--muted-color); opacity: 0.5;
    transition: all 0.15s;
  }

  .endpoint-docs-link:hover { opacity: 1; color: var(--litellm-primary); }

  .endpoint-subtitle { font-size: 0.9375rem; color: var(--muted-color); margin: 0; }

  .catalog-note { font-size: 0.8125rem; color: var(--muted-color); margin: 0.75rem 0 0; line-height: 1.6; }

  .provider-actions { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; margin-top: auto; }
  .provider-actions a { color: var(--hf-accent); font-size: 0.8125rem; font-weight: 600; text-decoration: none; }
  .provider-actions a:hover { text-decoration: underline; }
  .provider-actions a:focus-visible { outline: 2px solid var(--hf-accent); outline-offset: 4px; }

  .empty-state { text-align: center; padding: 4rem 2rem; color: var(--muted-color); }

  .providers-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;
  }

  .provider-card {
    background: var(--card-bg); border: 1px solid var(--border-color);
    border-radius: 10px; padding: 1.25rem; text-decoration: none;
    color: var(--text-color); transition: all 0.15s ease;
    display: flex; flex-direction: column; gap: 0.75rem;
  }

  .provider-card:hover {
    border-color: var(--litellm-primary);
    box-shadow: 0 4px 12px var(--focus-ring);
    transform: translateY(-1px);
  }

  .provider-card-header { display: flex; align-items: center; gap: 0.75rem; }

  .provider-avatar {
    width: 40px; height: 40px; border-radius: 10px;
    background-color: #ffffff; display: flex; align-items: center;
    justify-content: center; flex-shrink: 0; overflow: hidden;
    position: relative; padding: 6px; border: 1px solid var(--border-color);
  }

  .provider-logo-img { width: 100%; height: 100%; object-fit: contain; }

  .provider-initial {
    width: 100%; height: 100%; display: flex; align-items: center;
    justify-content: center; background-color: var(--text-color);
    color: var(--bg-color); font-weight: 700; font-size: 0.875rem;
    border-radius: 6px; margin: -6px;
  }

  .provider-name {
    font-size: 1rem; font-weight: 700; color: var(--text-color);
    margin: 0; line-height: 1.3;
  }

  .provider-description {
    font-size: 0.8125rem; color: var(--muted-color);
    line-height: 1.5; margin: 0; flex: 1;
  }

  .provider-meta {
    display: flex; align-items: center; justify-content: space-between;
    padding-top: 0.625rem; border-top: 1px solid var(--border-color);
  }

  .provider-key {
    font-size: 0.75rem; color: var(--muted-color);
    font-family: 'Geist Mono', monospace;
  }


  @media (max-width: 1024px) {
    .container { flex-direction: column; }
    .sidebar { width: 100%; position: static; max-height: 300px; }
    .providers-grid { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  }

  @media (max-width: 768px) {
    .container { padding: 0 1rem; }
    .providers-grid { grid-template-columns: 1fr; }
    .endpoint-title { font-size: 1.375rem; }
  }
</style>
