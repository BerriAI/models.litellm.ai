<script lang="ts">
  import { afterUpdate, createEventDispatcher, onDestroy, onMount } from "svelte";
  import { fly } from "svelte/transition";

  import { getProviderDisplayName, getProviderInitial, getProviderLogo } from "./providers";
  import ProviderDropdown from "./ProviderDropdown.svelte";
  import { trackSearch } from "./analytics";
  import { buildInfo, formatStars } from "./buildInfo";
  import CatalogStats from "./CatalogStats.svelte";
  import QuickStartBox from "./QuickStartBox.svelte";
  import CatalogQuickStart from "./CatalogQuickStart.svelte";
  import PageHero from "./PageHero.svelte";
  import { searchIntent } from "./searchIntent";
  import { sanitizeSearchQuery } from "./searchQuery";
  import { createSettledSearch } from "./settledSearch";
  import { loadCatalogData, type CatalogItem } from "./catalogData";
  import {
    isImagePricingMode,
    isAudioPricingMode,
    tableImageInputCost,
    tableImageOutputCost,
    imageModeInputSortValue,
    imageModeOutputSortValue,
    getImagePricingExtraRows,
    getLiteLLmSdkSnippet,
    getLiteLLmSdkSnippetHtml,
    getLiteLLmProxyCurlSnippet,
    getLiteLLmProxyCurlSnippetHtml,
    displayChatInputCost,
    displayChatOutputCost,
    displayChatCacheRead,
    displayChatCacheWrite,
    chatSortInput,
    chatSortOutput,
    chatSortCacheRead,
    chatSortCacheWrite,
  } from "./modelPresentation";
  import {
    EMPTY_MODELS_DEV_INDEX,
    compareReleaseDates,
    deriveModelMeta,
    formatReleaseDate,
    formatReleaseMonth,
    type ModelsDevIndex,
  } from "./modelMeta";
  import { tokenLimitValue, type CatalogMatches, type ModelFilters } from "./modelSearch";
  import { createModelSearcher, type ModelSearcher, type SearchReply } from "./backgroundSearch";
  import SearchWorker from "./searchWorker?worker";
  import { longestPerColumn, rowOffsets, rowsInView } from "./rowWindow";

  export let compact = false;
  const dispatch = createEventDispatcher<{ querychange: { query: string } }>();
  $: dispatch("querychange", { query });

  type Item = {
    name: string;
    display_name: string;
    release_date: string | null;
    [key: string]: any;
  };

  type ResultItem = {
    refIndex: number;
    item: any;
  };

  const REPO_FULL_NAME = "BerriAI/litellm";
  const DEFAULT_BRANCH = "main";
  const RESOURCE_NAME = "model_prices_and_context_window.json";
  const RESOURCE_BACKUP_NAME = "model_prices_and_context_window_backup.json";
  const RESOURCE_PATH = `${RESOURCE_NAME}`;
  const RESOURCE_BACKUP_PATH = `litellm/${RESOURCE_BACKUP_NAME}`;

  /** When true, load from litellm-model-catalog-api (see .env.example). */
  const useLocalCatalogApi =
    import.meta.env.VITE_USE_LOCAL_CATALOG_API === "true" ||
    import.meta.env.VITE_USE_LOCAL_CATALOG_API === "1";
  /** Optional absolute API origin, e.g. http://127.0.0.1:8000. Empty = same-origin /model_catalog (Vite proxy). */
  const catalogApiBase = (import.meta.env.VITE_CATALOG_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";
  let providers: string[] = [];
  let selectedProvider: string = "";
  let maxInputTokens: number | null = null;
  let maxOutputTokens: number | null = null;
  let freeOnly = false;
  let output: NonNullable<ModelFilters["output"]> = "";
  let inputs: NonNullable<ModelFilters["inputs"]> = [];
  let toolsOnly = false;
  const outputTabs: { value: NonNullable<ModelFilters["output"]>; label: string }[] = [{ value: "", label: "All" }, { value: "text", label: "Text" }, { value: "image", label: "Image" }, { value: "video", label: "Video" }, { value: "audio", label: "Speech" }, { value: "embedding", label: "Embeddings" }];
  const inputOptions: NonNullable<ModelFilters["inputs"]> = ["text", "image", "file", "audio", "video"];
  let hiddenCount = 0;
  let catalogFetchedAt: number | null = null;
  let refreshing = false;
  let refreshError = "";
  let refreshCatalog: (forceRefresh?: boolean) => void = () => {};
  $: intent = searchIntent(query);

  // Sorting state
  let sortColumn: string = "released";
  let sortDirection: "asc" | "desc" = "desc";
  let userSorted = false;
  $: sortApplied = userSorted || !query;

  // Copy toast
  let copiedModel = "";

  // Search input ref and focus tracking
  let searchInput: HTMLInputElement;
  let searchFocused = false;

  function focusSiteSearch() {
    searchInput?.focus({ preventScroll: true });
    searchInput?.scrollIntoView({ block: "center" });
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      focusSiteSearch();
    }
    if (e.key === "Escape" && document.activeElement === searchInput) {
      searchInput?.blur();
    }
  }

  // Quick start tab state per model
  let codeTabStates: Record<string, "sdk" | "proxy"> = {};

  onMount(() => {
    const urlParams = new URLSearchParams(window.location.search);
    query = sanitizeSearchQuery(urlParams.get("q"));

    fetch("/models/slugs.json")
      .then((res) => (res.ok ? res.json() : {}))
      .then((map: Record<string, string>) => {
        modelPages = map;
      })
      .catch(() => {
        // No generated pages in dev builds; rows stay plain text.
      });

    fetch(
      `https://api.github.com/repos/${REPO_FULL_NAME}/commits/${DEFAULT_BRANCH}`,
      {
        headers: {
          Accept: "application/vnd.github.VERSION.sha",
        },
      },
    )
      .then((res) => res.text())
      .then((text) => {
        sha = text;
      })
      .catch(() => { /* Issue links can fall back to the main branch. */ });

    const showCatalog = (rawItems: CatalogItem[], metadata: ModelsDevIndex) => {
      if (destroyed) return;
      restartSearchWorker();
      const items: Item[] = rawItems.map((item) => ({
        ...item,
        ...deriveModelMeta(item.name, metadata),
      }));
      providers = [...new Set(items.map((item) => item.litellm_provider).filter((provider): provider is string => typeof provider === "string" && !!provider))].sort();
      searcher = createModelSearcher(
        items,
        (message) => searchWorker?.postMessage(message),
        acceptMatches,
      );
      if (searchWorkerFailed) searcher.workerFailed();
    };

    let catalogRevision = 0;
    refreshCatalog = (forceRefresh = false) => {
      const revision = ++catalogRevision;
      refreshing = true;
      refreshError = "";
      loadCatalogData(useLocalCatalogApi, catalogApiBase, { forceRefresh })
        .then(({ items, lines: sourceLines, metadata, fetchedAt }) => {
          if (destroyed || revision !== catalogRevision) return;
          lines = sourceLines;
          catalogFetchedAt = fetchedAt;
          loadError = null;
          showCatalog(items, EMPTY_MODELS_DEV_INDEX);
          metadata.then((index) => {
            if (index.size && revision === catalogRevision) showCatalog(items, index);
          });
        })
        .catch((error) => {
          if (destroyed || revision !== catalogRevision) return;
          console.error(error);
          const message = useLocalCatalogApi
            ? "Could not refresh the local catalog. Check the catalog API connection."
            : "Could not refresh the catalog. Please try again.";
          if (matches) refreshError = message;
          else loadError = message;
          loading = false;
        })
        .finally(() => { if (!destroyed && revision === catalogRevision) refreshing = false; });
    };
    refreshCatalog();
  });

  const queryAnalytics = createSettledSearch((search) => {
    trackSearch(search.query, search.filters.provider, search.resultsCount, { ...search.filters, hiddenCount: search.hiddenCount });
  });
  let analyticsRevision = 0;
  let activeSearch: { query: string; filters: ModelFilters };

  function acceptMatches(found: CatalogMatches<Item>) {
    if (destroyed) return;
    matches = found.items;
    hiddenCount = found.hiddenCount;
    searching = false;
    queryAnalytics.settle(analyticsRevision, { ...activeSearch, resultsCount: found.items.length, hiddenCount: found.hiddenCount });
  }

  function clearFilters() {
    selectedProvider = "";
    maxInputTokens = null;
    maxOutputTokens = null;
    freeOnly = false;
    output = "";
    inputs = [];
    toolsOnly = false;
  }

  function requestModel() {
    window.dispatchEvent(new CustomEvent("request-support", { detail: { modelName: query.trim() } }));
  }

  const getIssueUrlForFix = (name: string) => {
    const repo = `https://github.com/${REPO_FULL_NAME}`;
    const issue = `${repo}/issues/new?labels=bug,fastrepl`;

    const from = lines.findIndex((line) => line.includes(`"${name}":`)) + 1;

    const to =
      lines.findIndex((line, i) => line.includes("}") && i > from - 1) + 1;

    if (from > 0 && to > 0) {
      const body = encodeURIComponent(
        `${repo}/blob/${sha ?? DEFAULT_BRANCH}/${RESOURCE_PATH}#L${from}-L${to}

We also need to update [${RESOURCE_BACKUP_NAME}](https://github.com/${REPO_FULL_NAME}/blob/${sha ?? DEFAULT_BRANCH}/${RESOURCE_BACKUP_PATH}).
`,
      );

      return `${issue}&title=Fix+%22${name}%22+entry+in+%22${RESOURCE_NAME}%22&body=${body}`;
    } else {
      return `${issue}&title=Fix+%22${name}%22+entry+in+%22${RESOURCE_NAME}%22`;
    }
  };

  let sha: string | null = null;
  let query = "";
  let lines: string[] = [];
  let searcher: ModelSearcher<Item> | null = null;
  let matches: Item[] | null = null;
  let searching = false;
  let searchWorkerFailed = false;
  let destroyed = false;
  let searchWorker: Worker | null = null;
  function restartSearchWorker() {
    searchWorker?.terminate();
    searchWorker = null;
    searchWorkerFailed = false;
    try {
      searchWorker = new SearchWorker();
      searchWorker.onmessage = (event: MessageEvent<SearchReply>) => searcher?.receive(event.data);
      searchWorker.onerror = searchWorker.onmessageerror = () => {
        searchWorkerFailed = true;
        searcher?.workerFailed();
      };
    } catch {
      searchWorkerFailed = true;
    }
  }
  onDestroy(() => {
    destroyed = true;
    queryAnalytics.cancel();
    searchWorker?.terminate();
    rowHeightObserver.disconnect();
    cancelAnimationFrame(viewFrame);
  });
  let results: ResultItem[] = [];
  let loading = true;
  let loadError: string | null = null;
  let expandedRows = new Set<string>();

  /** Cost-map key -> static model page slug, written by scripts/seo/generate.ts at build time. */
  let modelPages: Record<string, string> = {};

  const CELL_COLUMN_COUNT = 6;
  let rowHeights = new Map<string, number>();
  let detailHeights = new Map<string, number>();
  let typicalRowHeight = 64;
  let rowsTop: HTMLElement | null = null;
  let viewTop = 0;
  let viewBottom = window.innerHeight;
  let measuredWidth = window.innerWidth;
  let renderAllRows = false;
  let viewFrame = 0;

  $: offsets = rowOffsets(
    results.map(
      ({ item }) =>
        (rowHeights.get(item.name) ?? typicalRowHeight) +
        (expandedRows.has(item.name) ? (detailHeights.get(item.name) ?? 0) : 0),
    ),
  );
  $: rowNumbers = rowOffsets(
    results.map(({ item }) => (expandedRows.has(item.name) ? 2 : 1)),
  );
  $: shownRange = renderAllRows
    ? { start: 0, end: results.length }
    : rowsInView(offsets, viewTop, viewBottom);
  $: shownStart = shownRange.start;
  $: shownEnd = shownRange.end;
  $: shownResults = results.slice(shownStart, shownEnd);
  $: rowsAbovePx = offsets[shownStart];
  $: rowsBelowPx = offsets[results.length] - offsets[shownEnd];
  $: sizerCells = longestPerColumn(
    results.map(({ item }) => cellTexts(item)),
    CELL_COLUMN_COUNT,
  );

  const cellTextCache = new WeakMap<Item, string[]>();

  function cellTexts(item: Item): string[] {
    const cached = cellTextCache.get(item);
    if (cached) return cached;
    const cells = [
      formatReleaseMonth(item.release_date),
      formatContext(item.max_input_tokens),
      tableInputCell(item),
      tableOutputCell(item),
      tableCacheReadCell(item),
      tableCacheWriteCell(item),
    ];
    cellTextCache.set(item, cells);
    return cells;
  }

  function scheduleViewUpdate() {
    if (destroyed || viewFrame) return;
    viewFrame = requestAnimationFrame(updateView);
  }

  function updateView() {
    viewFrame = 0;
    if (window.innerWidth !== measuredWidth) {
      measuredWidth = window.innerWidth;
      rowHeights = new Map();
      detailHeights = new Map();
    }
    if (!rowsTop) return;
    const top = rowsTop.getBoundingClientRect().top;
    viewTop = -top - window.innerHeight;
    viewBottom = 2 * window.innerHeight - top;
  }

  const rowHeightObserver = new ResizeObserver((entries) => {
    let changed = false;
    for (const entry of entries) {
      const { name, detailOf } = (entry.target as HTMLElement).dataset;
      const height =
        entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      const heights = name ? rowHeights : detailHeights;
      const key = name ?? detailOf;
      if (!key || !height || heights.get(key) === height) continue;
      heights.set(key, height);
      if (name) typicalRowHeight = height;
      changed = true;
    }
    if (changed) {
      rowHeights = rowHeights;
      detailHeights = detailHeights;
    }
  });

  function measureRowHeight(node: HTMLElement) {
    rowHeightObserver.observe(node);
    return { destroy: () => rowHeightObserver.unobserve(node) };
  }

  afterUpdate(scheduleViewUpdate);

  $: if (searcher) {
    activeSearch = {
      query: sanitizeSearchQuery(query),
      filters: {
        provider: selectedProvider,
        minInputTokens: maxInputTokens ?? null,
        minOutputTokens: maxOutputTokens ?? null,
        freeOnly: freeOnly || intent.freeOnly,
        output,
        inputs,
        toolsOnly,
      },
    };
    analyticsRevision = queryAnalytics.begin();
    const ready = searcher.search(activeSearch.query, activeSearch.filters);
    searching = ready === null;
    if (ready) {
      matches = ready.items;
      hiddenCount = ready.hiddenCount;
      queryAnalytics.settle(analyticsRevision, { ...activeSearch, resultsCount: ready.items.length, hiddenCount: ready.hiddenCount });
    }
  }

  $: if (matches) {
    results = sortResults(matches.map((item, refIndex) => ({ item, refIndex })));
    loading = false;
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      copiedModel = text;
      setTimeout(() => { copiedModel = ""; }, 1500);
    });
  }

  function getDisplayModelName(name: string, litellm_provider: string): string {
    if (name.includes('/')) {
      return name;
    }
    if (litellm_provider && litellm_provider.startsWith('vertex_ai')) {
      return `vertex_ai/${name}`;
    }
    return name;
  }

  function toggleRow(name: string) {
    if (expandedRows.has(name)) {
      expandedRows.delete(name);
    } else {
      expandedRows.add(name);
    }
    expandedRows = expandedRows;
  }

  function handleSort(column: string) {
    if (sortApplied && sortColumn === column) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      sortColumn = column;
      sortDirection = column === "released" ? "desc" : "asc";
    }
    userSorted = true;
    applySorting();
  }

  function getSortValue(item: any, column: string): number {
    if (isImagePricingMode(item.mode)) {
      switch (column) {
        case "context":
          return item.max_input_tokens || 0;
        case "input":
          return imageModeInputSortValue(item);
        case "output":
          return imageModeOutputSortValue(item);
        case "cache_read":
        case "cache_write":
          return 0;
        default:
          return 0;
      }
    }
    switch (column) {
      case "context":
        return item.max_input_tokens || 0;
      case "input":
        return chatSortInput(item);
      case "output":
        return chatSortOutput(item);
      case "cache_read":
        return chatSortCacheRead(item);
      case "cache_write":
        return chatSortCacheWrite(item);
      default:
        return 0;
    }
  }

  function sortResults(list: ResultItem[]): ResultItem[] {
    if (!sortColumn || (query && !userSorted)) return list;
    return [...list].sort((a, b) => {
      if (sortColumn === "released") {
        return compareReleaseDates(a.item.release_date, b.item.release_date, sortDirection);
      }
      const aVal = getSortValue(a.item, sortColumn);
      const bVal = getSortValue(b.item, sortColumn);
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
  }

  function applySorting() {
    results = sortResults(results);
  }

  function formatDetailTokenField(v: unknown): string {
    const n = tokenLimitValue(v);
    if (n == null) return "—";
    return n.toLocaleString() + " tokens";
  }

  function tableInputCell(item: any): string {
    return isImagePricingMode(item.mode) ? tableImageInputCost(item) : displayChatInputCost(item);
  }

  function tableOutputCell(item: any): string {
    return isImagePricingMode(item.mode) ? tableImageOutputCost(item) : displayChatOutputCost(item);
  }

  function tableCacheReadCell(item: any): string {
    if (isImagePricingMode(item.mode)) return "—";
    return displayChatCacheRead(item);
  }

  function tableCacheWriteCell(item: any): string {
    if (isImagePricingMode(item.mode)) return "—";
    return displayChatCacheWrite(item);
  }

  function formatContext(tokens: number | undefined): string {
    if (!tokens || tokens <= 0) return "—";
    if (tokens >= 1000000) return (tokens / 1000000).toFixed(0) + "M";
    if (tokens >= 1000) return (tokens / 1000).toFixed(0) + "K";
    return tokens.toString();
  }

  function getModeLabel(mode: string | undefined): string {
    if (!mode) return "";
    const labels: Record<string, string> = {
      "chat": "Chat",
      "completion": "Completion",
      "embedding": "Embedding",
      "image_generation": "Image Gen",
      "image_edit": "Image edit",
      "audio_transcription": "Transcription",
      "audio_speech": "TTS",
      "moderation": "Moderation",
      "rerank": "Rerank",
    };
    return labels[mode] || mode;
  }

</script>

<svelte:window
  on:keydown={handleKeydown}
  on:scroll={scheduleViewUpdate}
  on:resize={scheduleViewUpdate}
  on:beforeprint={() => (renderAllRows = true)}
  on:afterprint={() => (renderAllRows = false)}
/>

<main class="container" class:compact>
  {#if compact}
    <PageHero id="models" title="MODELS" description="Find pricing, context, and capabilities." diagramLabels={["MODELS", "CONTEXT", "PRICING"]} diagramCaption="FIND / COMPARE / BUILD" dense>
      <CatalogQuickStart />
    </PageHero>
    <nav class="catalog-views" aria-label="Model views">
      <a href="/" aria-current="page">All models</a>
      <a href="/new-models">What's new</a>
      <a href="/deprecated-models">Deprecated</a>
    </nav>
  {:else}
  <!-- Hero Section -->
  <div class="hero">
    <div class="hero-badge">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
      {#if $buildInfo?.stars}
        Open-source AI Gateway · {formatStars($buildInfo.stars)} GitHub stars
      {:else}
        Open-source AI Gateway on GitHub
      {/if}
    </div>
    <h1 class="hero-title">The Most Comprehensive<br/>AI Model Catalog</h1>
    <p class="hero-subtitle">
      {#if $buildInfo}
        Compare pricing, context windows, and features for <strong>{$buildInfo.models.toLocaleString()} models</strong> across <strong>{$buildInfo.providers} providers</strong>. Powered by LiteLLM's open-source price file, updated several times a day.
      {:else}
        Compare pricing, context windows, and features across every model and provider LiteLLM supports. Powered by LiteLLM's open-source price file.
      {/if}
    </p>
    
    <div class="cta-buttons">
      <a 
        href="https://github.com/BerriAI/litellm" 
        target="_blank"
        rel="noopener noreferrer"
        class="btn btn-primary"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 6px;">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        View on GitHub
      </a>
      <a 
        href="https://docs.litellm.ai/docs/" 
        target="_blank"
        rel="noopener noreferrer"
        class="btn btn-secondary"
      >
        Read the Docs
      </a>
    </div>

    <QuickStartBox />
  </div>

  <!-- Trust Logos -->
  <div class="trust-section">
    <p class="trust-label">Trusted by leading teams</p>
    <div class="trust-logos">
      <img class="trust-logo-img" src="/logos/netflix.svg" alt="Netflix" height="28" />
      <img class="trust-logo-img" src="/logos/nvidia.svg" alt="NVIDIA" height="28" />
      <img class="trust-logo-img" src="/logos/ibm.svg" alt="IBM" height="28" />
      <img class="trust-logo-img" src="/logos/sap.svg" alt="SAP" height="28" />
      <img class="trust-logo-img" src="/logos/att.png" alt="AT&amp;T" height="28" />
      <img class="trust-logo-img" src="/logos/cloudera.svg" alt="Cloudera" height="28" />
      <img class="trust-logo-img" src="/logos/twilio.svg" alt="Twilio" height="28" />
      <img class="trust-logo-img" src="/logos/okta.svg" alt="Okta" height="28" />
      <img class="trust-logo-img" src="/logos/zurich.svg" alt="Zurich" height="28" />
      <img class="trust-logo-img" src="/logos/lemonade.svg" alt="Lemonade" height="28" />
    </div>
  </div>

  <CatalogStats />
  {/if}

  <div class="catalog-layout">
    <aside class="catalog-sidebar" aria-label="Model filters">
      <details class="filter-panel" open={typeof window !== "undefined" && window.innerWidth >= 1100}>
        <summary>Filters <span>⌄</span></summary>
        <div class="sidebar-filter-content">
          <section class="filter-block"><h2>Input modalities</h2><span class="filter-help">Must support all selected</span>
            {#each inputOptions as input}<label class="sidebar-check"><input type="checkbox" bind:group={inputs} value={input} /><span>{input === "file" ? "File / PDF" : input[0].toUpperCase() + input.slice(1)}</span></label>{/each}
          </section>
          <section class="filter-block"><h2>Provider</h2><ProviderDropdown bind:selectedProvider {providers} /></section>
          <section class="filter-block"><h2>Context</h2>    <div class="filters-row">
      <div class="filter-group">
        <label for="maxInputTokens">Min Input Tokens</label>
        <input
          id="maxInputTokens"
          bind:value={maxInputTokens}
          type="number"
          min="0"
          placeholder="e.g., 100000"
          class="filter-input"
        />
      </div>
      <div class="filter-group">
        <label for="maxOutputTokens">Min Output Tokens</label>
        <input
          id="maxOutputTokens"
          bind:value={maxOutputTokens}
          type="number"
          min="0"
          placeholder="e.g., 4096"
          class="filter-input"
        />
      </div>
    </div></section>
          <section class="filter-block"><h2>Pricing</h2><label class="sidebar-check"><input type="checkbox" bind:checked={freeOnly} /><span>Zero listed price</span></label></section>
          <section class="filter-block"><h2>Capabilities</h2><label class="sidebar-check"><input type="checkbox" bind:checked={toolsOnly} /><span>Tool calling</span></label></section>
          <p class="filter-help">Filters use reported capabilities. Unreported capabilities are not matched.</p>
          <button class="sidebar-clear" on:click={clearFilters}>Reset filters</button>
        </div>
      </details>
    </aside>
    <div class="catalog-results">
  <!-- Search and Filters -->
  <div class="search-section">
    <div class="search-bar-container">
      <div class="search-input-wrapper">
        <svg class="search-icon" width="18" height="18" viewBox="0 0 20 20" fill="none">
          <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" stroke-width="1.5"/>
          <path d="M12.5 12.5L16.5 16.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <input
          id="query"
          bind:this={searchInput}
          bind:value={query}
          on:focus={() => { searchFocused = true; }}
          on:blur={() => { searchFocused = false; }}
          on:keydown={(event) => { if (event.key === "Enter") queryAnalytics.enter(); }}
          type="text"
          autocomplete="off"
          name="query"
          aria-label="Search models"
          placeholder="Search models, providers, or free pricing"
          class="search-input"
        />
        {#if query}
          <button class="search-clear" on:click={() => { query = ""; }} type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        {/if}
        {#if !query && !searchFocused}
          <kbd class="search-shortcut">⌘K</kbd>
        {/if}
      </div>
      

    </div>

    {#if intent.title}
      <div class="search-intent">
        <div><strong>{intent.title}</strong><p>{intent.description}</p></div>
        {#if intent.href}<a href={intent.href}>{intent.linkLabel} ↗</a>{/if}
      </div>
    {/if}

    <div class="output-tabs" aria-label="Output modality">
      <span>Output</span>
      {#each outputTabs as tab}<button class:active={output === tab.value} aria-pressed={output === tab.value} on:click={() => output = tab.value}>{tab.label}</button>{/each}
    </div>

    {#if !loading}
      <div class="results-meta">
        <span class="results-count" aria-live="polite">{searching ? "Searching…" : results.length.toLocaleString() + (results.length === 1 ? " model" : " models")}</span>
        <div class="results-meta-right">
          {#if query || selectedProvider || maxInputTokens != null || maxOutputTokens != null || freeOnly || output || inputs.length || toolsOnly}
            <button class="clear-filters" on:click={() => { query = ""; clearFilters(); }}>
              Clear all filters
            </button>
          {/if}
          <button class="clear-filters" disabled={refreshing} on:click={() => refreshCatalog(true)}>{refreshing ? "Refreshing…" : "Refresh catalog"}</button>
          <a class="results-credit" href="https://models.dev" target="_blank" rel="noopener noreferrer">Names and release dates via models.dev</a>
        </div>
      </div>
      {#if query.trim() && !searching && hiddenCount > 0}
        <div class="hidden-matches" role="status"><span>{hiddenCount.toLocaleString()} more matching models are hidden by your filters.</span><button on:click={clearFilters}>Clear filters</button></div>
      {/if}
      {#if freeOnly && !intent.freeOnly}<p class="search-note">Explicit zero prices only. Unknown prices are excluded; hosting and other charges may still apply.</p>{/if}
      {#if catalogFetchedAt}<p class="search-note">Catalog fetched at {new Date(catalogFetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</p>{/if}
      {#if refreshError}<p class="search-note" role="alert">{refreshError}</p>{/if}
    {/if}
  </div>

  {#if loading}
    <div class="table-container">
      <div class="skeleton-table">
        {#each [1,2,3,4,5,6,7,8] as _}
          <div class="skeleton-row">
            <div class="skeleton-cell wide"></div>
            <div class="skeleton-cell"></div>
            <div class="skeleton-cell"></div>
            <div class="skeleton-cell"></div>
          </div>
        {/each}
      </div>
    </div>
  {:else if loadError}
    <div class="table-container">
      <div class="load-error" role="alert">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        <span>{loadError}</span>
      </div>
    </div>
  {:else}
    {#if query.trim() && !searching && results.length === 0 && intent.modelSearch !== false && hiddenCount === 0}
      <div class="add-model-section">
        <span>No models are listed for “{query.trim()}”.</span>
        <button on:click={requestModel}>Request this model ↗</button>
      </div>
    {/if}

    <div class="table-container">
      <table aria-rowcount={rowNumbers[results.length] + 1} aria-busy={searching}>
        <thead>
          <tr aria-rowindex="1">
            <th class="th-model">Model</th>
            <th class="th-sortable" on:click={() => handleSort("released")}>
              Released
              <span class="sort-icon" class:active={sortApplied && sortColumn === "released"} class:desc={sortApplied && sortColumn === "released" && sortDirection === "desc"}>↑</span>
            </th>
            <th class="th-sortable" on:click={() => handleSort("context")}>
              Context
              <span class="sort-icon" class:active={sortColumn === "context"} class:desc={sortColumn === "context" && sortDirection === "desc"}>↑</span>
            </th>
            <th class="th-sortable" on:click={() => handleSort("input")}>
              Input cost
              <span class="sort-icon" class:active={sortColumn === "input"} class:desc={sortColumn === "input" && sortDirection === "desc"}>↑</span>
            </th>
            <th class="th-sortable" on:click={() => handleSort("output")}>
              Output cost
              <span class="sort-icon" class:active={sortColumn === "output"} class:desc={sortColumn === "output" && sortDirection === "desc"}>↑</span>
            </th>
            <th class="th-sortable th-hide-mobile" on:click={() => handleSort("cache_read")} title="Prompt cache read (chat models)">
              Cache read
              <span class="sort-icon" class:active={sortColumn === "cache_read"} class:desc={sortColumn === "cache_read" && sortDirection === "desc"}>↑</span>
            </th>
            <th class="th-sortable th-hide-mobile" on:click={() => handleSort("cache_write")} title="Prompt cache write (chat models)">
              Cache write
              <span class="sort-icon" class:active={sortColumn === "cache_write"} class:desc={sortColumn === "cache_write" && sortDirection === "desc"}>↑</span>
            </th>
          </tr>
        </thead>
        <tbody class="column-sizer" aria-hidden="true" bind:this={rowsTop}>
          <tr>
            <td class="model-name"></td>
            <td class="released-cell">{sizerCells[0]}</td>
            <td class="context-cell">{sizerCells[1]}</td>
            <td class="cost-cell">{sizerCells[2]}</td>
            <td class="cost-cell">{sizerCells[3]}</td>
            <td class="cost-cell td-hide-mobile">{sizerCells[4]}</td>
            <td class="cost-cell td-hide-mobile">{sizerCells[5]}</td>
          </tr>
        </tbody>
        <tbody>
          {#if rowsAbovePx > 0}
            <tr class="row-spacer rows-above" aria-hidden="true">
              <td colspan="7" style:height="{rowsAbovePx}px"></td>
            </tr>
          {/if}
          {#each shownResults as { item }, shownIndex (item.name)}
            {@const name = item.name}
            {@const mode = item.mode}
            {@const litellm_provider = item.litellm_provider}
            {@const max_input_tokens = item.max_input_tokens}
            {@const max_output_tokens = item.max_output_tokens}
            {@const rowNumber = rowNumbers[shownStart + shownIndex] + 2}
            <tr
              class="model-row"
              class:expanded={expandedRows.has(name)}
              aria-rowindex={rowNumber}
              data-name={name}
              use:measureRowHeight
              on:click={() => toggleRow(name)}
            >
              <td class="model-name">
                <div class="model-info">
                  <svg class="expand-icon" class:expanded={expandedRows.has(name)} width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <div class="provider-avatar">
                    {#if getProviderLogo(litellm_provider)}
                      <img 
                        src={getProviderLogo(litellm_provider)} 
                        alt={getProviderDisplayName(litellm_provider)}
                        class="provider-logo-img"
                        on:error={(e) => {
                          const image = e.currentTarget;
                          if (!(image instanceof HTMLImageElement)) return;
                          image.style.display = 'none';
                          const fallback = image.nextElementSibling;
                          if (fallback instanceof HTMLElement) fallback.style.display = 'flex';
                        }}
                      />
                      <div class="provider-initial" style="display: none;">
                        {getProviderInitial(litellm_provider)}
                      </div>
                    {:else}
                      <div class="provider-initial">
                        {getProviderInitial(litellm_provider)}
                      </div>
                    {/if}
                  </div>
                  <div class="model-name-group">
                    <div class="model-title-row">
                      {#if modelPages[name]}
                        <a
                          class="model-title model-page-link"
                          href={`/models/${modelPages[name]}`}
                          title={`${item.display_name} pricing and providers`}
                          on:click|stopPropagation
                        >{item.display_name}</a>
                      {:else}
                        <span class="model-title" title={item.display_name}>{item.display_name}</span>
                      {/if}
                    </div>
                    <span class="model-provider">{getProviderDisplayName(litellm_provider)}</span>
                  </div>
                  <button
                    class="copy-button"
                    on:click|stopPropagation={() => copyToClipboard(getDisplayModelName(name, litellm_provider))}
                    title="Copy model name"
                    type="button"
                  >
                    {#if copiedModel === getDisplayModelName(name, litellm_provider)}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success-color)" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    {:else}
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
                        <path d="M2 6V2.5C2 1.67157 2.67157 1 3.5 1H7" stroke="currentColor" stroke-width="1.2"/>
                      </svg>
                    {/if}
                  </button>
                </div>
              </td>
              <td class="released-cell">{formatReleaseMonth(item.release_date)}</td>
              <td class="context-cell">{formatContext(max_input_tokens)}</td>
              <td class="cost-cell">{tableInputCell(item)}</td>
              <td class="cost-cell">{tableOutputCell(item)}</td>
              <td class="cost-cell td-hide-mobile">{tableCacheReadCell(item)}</td>
              <td class="cost-cell td-hide-mobile">{tableCacheWriteCell(item)}</td>
            </tr>
            {#if expandedRows.has(name)}
              <tr
                class="expanded-content"
                aria-rowindex={rowNumber + 1}
                data-detail-of={name}
                use:measureRowHeight
                transition:fly={{ y: -10, duration: 200 }}
              >
                <td colspan="7">
                  <div class="detail-panel">
                    <div class="detail-grid">
                      <div class="detail-section">
                        <h4 class="detail-heading">
                          {#if isImagePricingMode(mode)}
                            Image pricing <span class="detail-unit">per image where applicable</span>
                          {:else if mode === "audio_speech"}
                            Audio pricing <span class="detail-unit">per character where applicable</span>
                          {:else if mode === "audio_transcription"}
                            Audio pricing <span class="detail-unit">per second where applicable</span>
                          {:else}
                            Token pricing <span class="detail-unit">per 1M tokens where applicable</span>
                          {/if}
                        </h4>
                        <div class="pricing-cards">
                          <div class="pricing-card">
                            <span class="pricing-label">Input</span>
                            <span class="pricing-value">{tableInputCell(item)}</span>
                          </div>
                          <div class="pricing-card">
                            <span class="pricing-label">Output</span>
                            <span class="pricing-value">{tableOutputCell(item)}</span>
                          </div>
                          <div class="pricing-card">
                            <span class="pricing-label">Cache read</span>
                            <span class="pricing-value">{tableCacheReadCell(item)}</span>
                          </div>
                          <div class="pricing-card">
                            <span class="pricing-label">Cache write</span>
                            <span class="pricing-value">{tableCacheWriteCell(item)}</span>
                          </div>
                        </div>
                        {#if isImagePricingMode(mode)}
                          {@const imageExtras = getImagePricingExtraRows(item)}
                          {#if imageExtras.length > 0}
                            <ul class="pricing-extras">
                              {#each imageExtras as row}
                                <li><span class="pricing-extras-label">{row.label}</span> {row.value}</li>
                              {/each}
                            </ul>
                          {/if}
                        {/if}
                      </div>

                      <!-- Model Info -->
                      <div class="detail-section">
                        <h4 class="detail-heading">Model Info</h4>
                        <div class="info-rows">
                          <div class="info-row">
                            <span class="info-label">Model ID</span>
                            <code class="info-value model-api-id">{getDisplayModelName(name, litellm_provider)}</code>
                          </div>
                          <div class="info-row">
                            <span class="info-label">Provider</span>
                            <span class="info-value">{getProviderDisplayName(litellm_provider)}</span>
                          </div>
                          <div class="info-row">
                            <span class="info-label">Mode</span>
                            <span class="info-value">{mode ? getModeLabel(mode) : "—"}</span>
                          </div>
                          <div class="info-row">
                            <span class="info-label">Max Input</span>
                            <span class="info-value">{formatDetailTokenField(max_input_tokens)}</span>
                          </div>
                          <div class="info-row">
                            <span class="info-label">Max Output</span>
                            <span class="info-value">{formatDetailTokenField(max_output_tokens)}</span>
                          </div>
                          <div class="info-row">
                            <span class="info-label">Released</span>
                            <span class="info-value">{formatReleaseDate(item.release_date)}</span>
                          </div>
                        </div>
                      </div>

                      <!-- Features (chat / completion models) -->
                      {#if !isImagePricingMode(mode) && !isAudioPricingMode(mode)}
                      <div class="detail-section">
                        <h4 class="detail-heading">Features</h4>
                        <div class="feature-list">
                          {#each [
                            { key: item.supports_function_calling, label: "Function Calling" },
                            { key: item.supports_vision, label: "Vision" },
                            { key: item.supports_response_schema, label: "JSON Mode" },
                            { key: item.supports_tool_choice, label: "Tool Choice" },
                            { key: item.supports_parallel_function_calling, label: "Parallel Calls" },
                            { key: item.supports_audio_input, label: "Audio Input" },
                            { key: item.supports_prompt_caching, label: "Prompt Caching" },
                          ] as feature}
                            <div class="feature-item" class:supported={feature.key}>
                              {#if feature.key}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success-color)" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                              {:else}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted-color)" stroke-width="2" stroke-linecap="round" opacity="0.4"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                              {/if}
                              <span>{feature.label}</span>
                            </div>
                          {/each}
                        </div>
                      </div>
                      {/if}
                    </div>

                    <!-- Code snippet with tabs -->
                    <div class="detail-code-section">
                      <div class="code-header-row">
                        <div class="code-tabs">
                          <button
                            class="code-tab"
                            class:active={!codeTabStates[name] || codeTabStates[name] === "sdk"}
                            on:click|stopPropagation={() => { codeTabStates[name] = "sdk"; codeTabStates = codeTabStates; }}
                          >Python SDK</button>
                          <button
                            class="code-tab"
                            class:active={codeTabStates[name] === "proxy"}
                            on:click|stopPropagation={() => { codeTabStates[name] = "proxy"; codeTabStates = codeTabStates; }}
                          >AI Gateway (Proxy)</button>
                        </div>
                        {#if !codeTabStates[name] || codeTabStates[name] === "sdk"}
                          <button class="copy-code-btn" on:click|stopPropagation={() => copyToClipboard(getLiteLLmSdkSnippet(mode, getDisplayModelName(name, litellm_provider)))}>
                            {copiedModel.includes("from litellm") ? "Copied!" : "Copy"}
                          </button>
                        {:else}
                          <button class="copy-code-btn" on:click|stopPropagation={() => copyToClipboard(getLiteLLmProxyCurlSnippet(mode, getDisplayModelName(name, litellm_provider)))}>
                            {copiedModel.includes("curl") ? "Copied!" : "Copy"}
                          </button>
                        {/if}
                      </div>
                      {#if !codeTabStates[name] || codeTabStates[name] === "sdk"}
                        <pre class="code-snippet"><code>{@html getLiteLLmSdkSnippetHtml(mode, getDisplayModelName(name, litellm_provider))}</code></pre>
                      {:else}
                        <pre class="code-snippet"><code>{@html getLiteLLmProxyCurlSnippetHtml(mode, getDisplayModelName(name, litellm_provider))}</code></pre>
                      {/if}
                    </div>

                    <!-- Actions -->
                    <div class="detail-actions">
                      <a href={getIssueUrlForFix(name)} target="_blank" rel="noopener noreferrer" class="detail-action-link" on:click|stopPropagation>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        Report incorrect data
                      </a>
                    </div>
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
          {#if rowsBelowPx > 0}
            <tr class="row-spacer" aria-hidden="true">
              <td colspan="7" style:height="{rowsBelowPx}px"></td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  {/if}
    </div>
  </div>
</main>

<style>
  .container {
    color: var(--text-color);
  }

  .compact {
    max-width: var(--page-width);
    margin: 0 auto;
    padding: 0 var(--page-gutter) 48px;
  }

  .compact .search-section, .compact .table-container { max-width: none; padding: 0; }
  .compact .search-bar-container { margin-bottom: 16px; }
  .compact .search-input, .compact .filter-input, .compact table,
  .compact .search-shortcut { border-radius: var(--control-radius); }
  .compact .filter-group label, .compact th, .compact .results-count {
    font-family: "DM Sans", sans-serif;
    text-transform: none;
    letter-spacing: 0;
  }
  .compact .filter-group label { font-size: 11px; font-weight: 500; }
  .compact .filters-row { max-width: 640px; }
  .compact .filter-input { padding: 8px 12px; font-size: 12px; }
  .compact .search-input { padding-top: 12px; padding-bottom: 12px; font-size: 14px; }
  .compact .table-container { margin-top: 16px; }
  .compact th { padding: 14px 16px; font-weight: 500; font-size: 11px; background: transparent; }
  .compact thead { background: transparent; }
  .compact .model-row { height: 66px; }
  .compact .model-name, .compact .th-model { width: 38%; min-width: 300px; }
  .compact .context-cell, .compact .cost-cell, .compact .released-cell { font-family: "DM Sans", sans-serif; font-size: 13px; font-weight: 400; letter-spacing: 0; font-variant-numeric: tabular-nums; }
  .compact .results-count { font-size: 12px; font-weight: 400; }
  .compact .model-info { gap: 12px; }
  .compact .model-name-group { gap: 3px; flex: 1; }
  .compact td { padding: 12px 16px; }
  .compact .provider-avatar { width: 30px; height: 30px; padding: 2px; background: #fff; border: 0; border-radius: 4px; }
  .compact .model-title-row { gap: 0; }
  .compact .model-title { font-family: "DM Sans", sans-serif; font-size: 14px; font-weight: 500; white-space: nowrap; line-height: 1.4; letter-spacing: 0; }
  .model-provider { font-family: "DM Sans", sans-serif; font-size: 11px; font-weight: 400; color: var(--muted-color); line-height: 1.3; letter-spacing: 0; }
  .model-api-id { overflow-wrap: anywhere; word-break: break-word; font-size: 11px; }
  .search-intent, .hidden-matches { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 0; border-top: 1px solid var(--border-color); }
  .search-intent { margin-bottom: 16px; }
  .search-intent strong { font-size: 14px; }
  .search-intent p, .search-note { font-size: 12px; color: var(--muted-color); margin: 5px 0 0; }
  .search-intent a, .hidden-matches button, .add-model-section button { white-space: nowrap; background: transparent; border: 0; color: var(--text-color); font-size: 12px; text-decoration: underline; text-underline-offset: 3px; }
  .hidden-matches { font-size: 12px; }
  .compact .filters-row { grid-template-columns: 1fr 1fr auto; }
  @media (max-width: 560px) { .search-intent, .hidden-matches { align-items: flex-start; flex-direction: column; gap: 8px; } .compact .filters-row { grid-template-columns: 1fr 1fr; } }
  .compact .provider-logo-img { filter: none; }

  @media (min-width: 1600px) {
    .compact { padding-inline: var(--page-gutter); }
  }
  @media (max-width: 1180px) {
    .compact { padding-inline: var(--page-gutter); }
  }
  @media (max-width: 760px) {
    .compact { padding: 0 var(--page-gutter) 28px; }
    .compact .search-input-wrapper { width: 100%; }
    .compact .search-bar-container { align-items: stretch; }
    .compact .filters-row { grid-template-columns: 1fr 1fr; }
    .compact td, .compact th { padding: 10px; }
    .compact .model-name, .compact .th-model { min-width: 260px; }
  }


  .catalog-layout { display: grid; grid-template-columns: 218px minmax(0, 1fr); gap: 34px; align-items: start; padding-top: 24px; }
  .catalog-results { min-width: 0; }
  .catalog-sidebar { padding-right: 26px; border-right: 1px solid var(--border-color); }
  .filter-panel summary { display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 600; list-style: none; padding-bottom: 20px; }
  .filter-panel summary::-webkit-details-marker { display: none; }
  .filter-panel summary span { display: none; }
  .filter-block { padding: 0 0 22px; margin-bottom: 22px; border-bottom: 1px solid var(--border-color); }
  .filter-block h2 { font-family: "DM Sans", sans-serif; font-size: 12px; font-weight: 600; margin: 0 0 12px; }
  .filter-help { display: block; color: var(--muted-color); font-size: 11px; line-height: 1.5; margin-bottom: 10px; }
  .sidebar-check { display: flex; align-items: center; gap: 10px; margin: 11px 0; font-size: 12px; cursor: pointer; }
  .sidebar-check input { accent-color: var(--text-color); width: 14px; height: 14px; }
  .sidebar-clear { background: transparent; border: 0; padding: 0; font-size: 12px; text-decoration: underline; text-underline-offset: 3px; color: var(--muted-color); }
  .compact .catalog-sidebar .filters-row { display: flex; flex-direction: column; gap: 14px; }
  .compact .catalog-sidebar :global(.provider-dropdown) { width: 100%; min-width: 0; }
  .compact .catalog-sidebar .filter-input { width: 100%; }
  .output-tabs { display: flex; gap: 7px; align-items: center; flex-wrap: wrap; padding: 6px 0 18px; border-bottom: 1px solid var(--border-color); }
  .output-tabs > span { font-family: "DM Sans", sans-serif; font-size: 11px; letter-spacing: 0; color: var(--muted-color); margin-right: 9px; }
  .output-tabs button { background: transparent; border: 1px solid transparent; color: var(--muted-color); padding: 7px 12px; font-size: 12px; }
  .output-tabs button.active { border-color: var(--border-color-strong); color: var(--text-color); background: var(--bg-secondary); }
  .output-tabs button:hover { color: var(--text-color); border-color: var(--border-color); }
  .compact .search-input-wrapper { flex: 1; }
  @media (max-width: 1099px) {
    .catalog-layout { grid-template-columns: 1fr; gap: 20px; padding-top: 22px; }
    .catalog-sidebar { padding: 0; border: 1px solid var(--border-color); }
    .filter-panel summary { padding: 12px 16px; cursor: pointer; }
    .filter-panel summary span { display: inline; }
    .sidebar-filter-content { padding: 4px 16px 18px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
    .filter-block { margin-bottom: 0; }
  }
  @media (max-width: 560px) { .output-tabs { gap: 4px; } .output-tabs button { padding: 7px 9px; } .results-meta { gap: 8px; flex-wrap: wrap; } .results-meta-right { flex-wrap: wrap; gap: 12px; } }

  /* Hero Section */
  .hero {
    text-align: center;
    padding: 4rem 2rem 2.5rem;
    max-width: 800px;
    margin: 0 auto;
  }

  .hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 100px;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--muted-color);
    margin-bottom: 1.5rem;
  }

  .hero-badge svg {
    color: #f59e0b;
    fill: #f59e0b;
  }

  .hero-title {
    font-size: 3.25rem;
    font-weight: 700;
    line-height: 1.1;
    margin: 0 0 1.25rem 0;
    color: var(--text-color);
    letter-spacing: -0.035em;
  }

  .hero-subtitle {
    font-size: 1.125rem;
    line-height: 1.6;
    color: var(--text-secondary);
    margin: 0 0 2rem 0;
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
  }

  .hero-subtitle strong {
    color: var(--text-color);
    font-weight: 600;
  }

  .cta-buttons {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    align-items: center;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1.5rem;
    font-size: 0.9375rem;
    font-weight: 600;
    border-radius: var(--surface-radius);
    text-decoration: none;
    transition: all 0.15s ease;
    border: 1px solid transparent;
  }

  .btn-primary {
    background-color: var(--litellm-primary);
    color: var(--litellm-on-primary);
    border-color: var(--litellm-primary);
  }

  .btn-primary:hover {
    opacity: 0.85;
    transform: translateY(-1px);
    box-shadow: var(--shadow-lg);
  }

  .btn-secondary {
    background-color: var(--bg-color);
    color: var(--text-color);
    border-color: var(--border-color-strong);
  }

  .btn-secondary:hover {
    border-color: var(--text-color);
    background-color: var(--bg-secondary);
  }

  /* Trust Section */
  .trust-section {
    text-align: center;
    padding: 1.5rem 2rem 2.5rem;
    max-width: 800px;
    margin: 0 auto;
  }

  .trust-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted-color);
    margin-bottom: 1rem;
  }

  .trust-logos {
    display: flex;
    gap: 2rem;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
  }

  .trust-logo-img {
    height: 28px;
    object-fit: contain;
    opacity: 0.55;
    filter: grayscale(100%);
    transition: all 0.2s ease;
  }

  .trust-logo-img:hover {
    opacity: 0.9;
    filter: grayscale(0%);
  }

  :global([data-theme="dark"]) .trust-logo-img {
    filter: grayscale(100%) invert(1);
    opacity: 0.5;
  }
  :global([data-theme="dark"]) .trust-logo-img:hover {
    filter: none;
    opacity: 0.9;
  }

  /* Search Section */
  .search-section {
    max-width: var(--page-width);
    margin: 0 auto;
    padding: 0 2rem;
  }

  .search-bar-container {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
    align-items: center;
  }

  .search-input-wrapper {
    position: relative;
    flex: 1;
  }

  .search-icon {
    position: absolute;
    left: 1rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted-color);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 0.75rem 2.5rem 0.75rem 2.75rem;
    font-size: 0.9375rem;
    border: 1px solid var(--border-color);
    border-radius: var(--surface-radius);
    background-color: var(--bg-color);
    color: var(--text-color);
    transition: all 0.15s ease;
    height: 44px;
    box-sizing: border-box;
  }

  .search-input:hover { border-color: var(--border-color-strong); }

  .search-input:focus {
    outline: none;
    border-color: var(--litellm-primary);
    box-shadow: 0 0 0 3px var(--focus-ring);
  }

  .search-input::placeholder { color: var(--muted-color); }

  .search-clear {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--muted-color);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    display: flex;
    align-items: center;
  }

  .search-clear:hover { color: var(--text-color); background: var(--bg-tertiary); }

  .search-shortcut {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.125rem 0.4375rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--muted-color);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 5px;
    pointer-events: none;
    line-height: 1.4;
  }

  /* Filters */
  .filters-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .filter-group label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted-color);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .filter-input {
    padding: 0.625rem 0.875rem;
    font-size: 0.9375rem;
    border: 1px solid var(--border-color);
    border-radius: var(--surface-radius);
    background-color: var(--bg-color);
    color: var(--text-color);
    transition: all 0.15s ease;
    height: 40px;
    box-sizing: border-box;
  }

  .filter-input:hover { border-color: var(--border-color-strong); }

  .filter-input:focus {
    outline: none;
    border-color: var(--litellm-primary);
    box-shadow: 0 0 0 3px var(--focus-ring);
  }

  .filter-input::placeholder { color: var(--muted-color); }

  /* Results meta */
  .results-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 1rem;
    padding-bottom: 0.5rem;
  }

  .results-count {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--muted-color);
  }

  .clear-filters {
    font-size: 0.8125rem;
    color: var(--litellm-primary);
    background: none;
    border: none;
    cursor: pointer;
    font-weight: 500;
  }

  .clear-filters:hover { text-decoration: underline; }

  /* Add Model Section */
  .add-model-section {
    max-width: var(--page-width);
    margin: 0.75rem auto;
    padding: 0.75rem 1.25rem;
    margin-left: 2rem;
    margin-right: 2rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--surface-radius);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }




  /* Table */
  .table-container {
    margin: 1rem auto 4rem;
    max-width: var(--page-width);
    padding: 0 2rem;
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--card-bg);
    border-radius: var(--surface-radius);
    border: 1px solid var(--border-color);
    overflow: hidden;
  }

  thead {
    background-color: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
  }

  /* The previous build used `position: sticky; top: 63px` on the header
   * cells so the column titles stayed visible while scrolling under the
   * site nav. Because `position: sticky` behaves as `position: relative`
   * before its threshold is crossed (and `top: 63px` on a relative-
   * positioned element pushes it 63px down from its natural slot), the
   * header was rendered 63px below the thead's actual position — directly
   * on top of the first body row. Removing sticky restores the natural
   * stacking: header above body, no overlap. */
  th {
    padding: 0.625rem 1rem;
    text-align: left;
    font-weight: 600;
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted-color);
    background-color: var(--bg-secondary);
    white-space: nowrap;
    user-select: none;
    border-bottom: 1px solid var(--border-color);
  }

  .th-model { padding-left: 1rem; }

  .th-sortable {
    cursor: pointer;
    transition: color 0.15s;
  }

  .th-sortable:hover { color: var(--text-color); }

  .sort-icon {
    display: inline-block;
    margin-left: 0.25rem;
    opacity: 0;
    transition: all 0.15s;
    font-size: 0.625rem;
  }

  .th-sortable:hover .sort-icon { opacity: 0.3; }
  .sort-icon.active { opacity: 1; color: var(--litellm-primary); }
  .sort-icon.desc { transform: rotate(180deg); }

  tbody tr.model-row {
    border-bottom: 1px solid var(--border-color);
    transition: background-color 0.1s ease;
    cursor: pointer;
    position: relative;
    z-index: 0;
  }

  tbody tr.model-row:hover {
    background-color: var(--hover-bg);
    box-shadow: inset 3px 0 0 var(--litellm-primary);
  }
  tbody tr.model-row.expanded { background-color: var(--bg-secondary); }
  tbody tr.model-row:last-child { border-bottom: none; }
  .column-sizer tr { visibility: collapse; border: none; }
  .column-sizer td { padding-top: 0; padding-bottom: 0; line-height: 0; }
  .row-spacer td { padding: 0; border: none; }
  tr.rows-above { border-bottom: 1px solid var(--border-color); }

  tbody tr.expanded-content { border-bottom: 1px solid var(--border-color); }
  tbody tr.expanded-content td { padding: 0; }

  td {
    padding: 0.625rem 1rem;
    vertical-align: middle;
    font-size: 0.875rem;
    color: var(--text-color);
  }

  /* A fixed share keeps long ids (bedrock_mantle/us-gov-west-1/...) from
     stretching the column; they truncate, with the full id in the tooltip.
     max-width: 0 lets the cell shrink below its longest unbroken text. */
  .model-name {
    font-weight: 500;
    min-width: 280px;
    width: 35%;
    max-width: 0;
  }

  .th-model {
    width: 35%;
  }

  .model-info {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }

  .expand-icon {
    color: var(--muted-color);
    transition: transform 0.2s ease;
    flex-shrink: 0;
  }

  .expand-icon.expanded { transform: rotate(90deg); }

  .copy-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: var(--muted-color);
    transition: all 0.1s ease;
    opacity: 0;
    margin-left: 0.25rem;
    flex-shrink: 0;
  }

  .model-row:hover .copy-button { opacity: 1; }
  .copy-button:hover { background-color: var(--bg-tertiary); color: var(--text-secondary); }

  .provider-avatar {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background-color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.625rem;
    flex-shrink: 0;
    overflow: hidden;
    position: relative;
    padding: 3px;
    border: 1px solid var(--border-color);
  }

  .provider-logo-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .provider-initial {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--text-color);
    color: var(--bg-color);
    font-weight: 600;
    font-size: 0.625rem;
    border-radius: 4px;
    margin: -3px;
  }

  .model-name-group {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  .model-title-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .model-page-link {
    color: inherit;
  }

  .model-page-link:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .model-title {
    font-size: 0.875rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }


  .released-cell {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .results-meta-right {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .results-credit {
    font-size: 0.75rem;
    color: var(--muted-color);
    text-decoration: none;
  }

  .results-credit:hover {
    color: var(--text-secondary);
    text-decoration: underline;
  }


  .context-cell {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-size: 0.8125rem;
  }

  .cost-cell {
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
    font-size: 0.8125rem;
  }

  /* Detail Panel */
  .detail-panel {
    padding: 1.5rem;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border-color);
  }

  .detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .detail-section { }

  .detail-heading {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted-color);
    margin: 0 0 0.75rem 0;
  }

  .detail-unit {
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
  }

  .pricing-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .pricing-card {
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 0.625rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .pricing-label {
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--muted-color);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .pricing-value {
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text-color);
    font-variant-numeric: tabular-nums;
  }

  .pricing-empty {
    margin: 0;
    font-size: 0.875rem;
    color: var(--muted-color);
  }

  .pricing-extras {
    margin: 0.625rem 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.8125rem;
    color: var(--muted-color);
  }

  .pricing-extras-label {
    font-weight: 600;
    color: var(--text-color);
    opacity: 0.85;
  }

  .info-rows {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.375rem 0;
    border-bottom: 1px solid var(--border-color);
  }

  .info-row:last-child { border-bottom: none; }

  .info-label {
    font-size: 0.8125rem;
    color: var(--muted-color);
  }

  .info-value {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-color);
    font-family: 'IBM Plex Mono', monospace;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .feature-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .feature-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--muted-color);
  }

  .feature-item.supported { color: var(--text-color); }

  /* Code snippet */
  .detail-code-section {
    background: var(--code-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 1rem;
  }

  .code-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-secondary);
  }

  .code-header-row .detail-heading { margin: 0; }

  .code-tabs {
    display: flex;
    gap: 0;
  }

  .code-tab {
    padding: 0.375rem 0.875rem;
    font-size: 0.75rem;
    font-weight: 600;
    border: 1px solid var(--border-color);
    background: var(--bg-secondary);
    color: var(--muted-color);
    cursor: pointer;
    transition: all 0.15s;
  }

  .code-tab:first-child {
    border-radius: 6px 0 0 6px;
  }

  .code-tab:last-child {
    border-radius: 0 6px 6px 0;
    border-left: none;
  }

  .code-tab.active {
    background: var(--litellm-primary);
    border-color: var(--litellm-primary);
    color: var(--litellm-on-primary);
  }

  .code-tab:hover:not(.active) {
    background: var(--hover-bg);
    color: var(--text-color);
  }

  .code-comment {
    color: var(--muted-color);
    font-style: italic;
  }

  .copy-code-btn {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.625rem;
    background: var(--litellm-primary);
    color: var(--litellm-on-primary);
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .copy-code-btn:hover { opacity: 0.85; }

  .code-snippet {
    margin: 0;
    padding: 1rem;
    font-family: 'IBM Plex Mono', 'Menlo', monospace;
    font-size: 0.8125rem;
    line-height: 1.6;
    overflow-x: auto;
    background: var(--code-bg);
    color: var(--code-text);
  }

  .code-snippet code { display: block; white-space: pre; }

  /* {@html} snippets are not scoped — use :global so .code-kw / .code-str apply */
  .code-snippet :global(.code-kw) {
    color: var(--code-keyword);
  }
  .code-snippet :global(.code-str) {
    color: var(--code-string);
  }
  .code-snippet :global(.code-comment) {
    color: var(--muted-color);
  }

  .detail-actions {
    display: flex;
    gap: 1rem;
  }

  .detail-action-link {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--muted-color);
    text-decoration: none;
    transition: color 0.15s;
  }

  .detail-action-link:hover { color: var(--litellm-primary); }

  .load-error {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 1rem 1.25rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--surface-radius);
    color: var(--text-color);
    font-size: 0.875rem;
  }

  .load-error svg {
    color: #ef4444;
    flex-shrink: 0;
  }

  /* Skeleton */
  .skeleton-table {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--border-color);
    border: 1px solid var(--border-color);
    border-radius: var(--surface-radius);
    overflow: hidden;
  }

  .skeleton-row {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: var(--card-bg);
    animation: shimmer 1.5s ease-in-out infinite;
  }

  .skeleton-cell {
    height: 1rem;
    background: var(--bg-tertiary);
    border-radius: 4px;
    flex: 1;
  }

  .skeleton-cell.wide { flex: 3; }

  @keyframes shimmer {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* Responsive */
  .th-hide-mobile, .td-hide-mobile { }

  @media (max-width: 900px) {
    .th-hide-mobile, .td-hide-mobile { display: none; }
  }

  @media (max-width: 768px) {
    .hero { padding: 2.5rem 1rem 1.5rem; }
    .hero-title { font-size: 2rem; }
    .hero-subtitle { font-size: 1rem; }
    .cta-buttons { flex-direction: column; width: 100%; max-width: 320px; margin: 0 auto; }
    .btn { width: 100%; }
    .search-section { padding: 0 1rem; }
    .search-bar-container { flex-direction: column; }
    .filters-row { grid-template-columns: 1fr; }
    .table-container { padding: 0 1rem; }
    th, td { padding: 0.5rem 0.625rem; font-size: 0.8125rem; }
    .model-name { min-width: 180px; }
    .trust-logos { gap: 1.25rem; }
    .trust-logo-img { height: 22px; }
    .detail-grid { grid-template-columns: 1fr; }
  }
</style>
