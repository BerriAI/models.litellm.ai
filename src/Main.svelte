<script lang="ts">
  import { onMount } from "svelte";
  import App from "./App.svelte";
  import Discover from "./Discover.svelte";
  import Changelog from "./Changelog.svelte";
  import CodingBenchmarks from "./CodingBenchmarks.svelte";
  import Providers from "./Providers.svelte";
  import Cookbook from "./Cookbook.svelte";
  import Guardrails from "./Guardrails.svelte";
  import RequestForm from "./RequestForm.svelte";
  import { initAnalytics, trackPageView, trackTabChange } from "./analytics";
  import { PAGE_TITLES } from "./pageTitles";
  import { sanitizeSearchQuery } from "./searchQuery";

  type Tab =
    | "benchmarks"
    | "discover"
    | "changelog"
    | "models"
    | "providers"
    | "cookbook"
    | "guardrails";
  type Theme = "light" | "dark";
  let activeTab: Tab = getTabFromLocation();
  let searchQuery = sanitizeSearchQuery(
    new URLSearchParams(window.location.search).get("q"),
  );
  let modelSearchQuery = searchQuery;
  let pageRevision = 0;
  let pageKey = `${activeTab}:${window.location.search}:0`;
  let theme: Theme = "light";
  let moreMenuOpen = false;
  let searchInput: HTMLInputElement;
  let requestForm: RequestForm;

  const tabPaths: Record<Tab, string> = {
    discover: "/",
    changelog: "/changelog",
    benchmarks: "/benchmarks",
    models: "/search",
    providers: "/providers",
    cookbook: "/cookbook",
    guardrails: "/guardrails",
  };

  function getTabFromLocation(): Tab {
    const path = window.location.pathname.replace(/\/$/, "") || "/";
    if (path === "/changelog") return "changelog";
    if (path === "/benchmarks") return "benchmarks";
    if (path === "/search") return "models";
    if (path === "/providers") return "providers";
    if (path === "/cookbook") return "cookbook";
    if (path === "/guardrails") return "guardrails";
    if (
      (path === "/" || path === "/discover") &&
      new URLSearchParams(window.location.search).has("q")
    )
      return "models";
    return "discover";
  }

  function updatePage(tab: Tab) {
    activeTab = tab;
    pageRevision += 1;
    pageKey = `${tab}:${window.location.search}:${pageRevision}`;
    searchQuery = sanitizeSearchQuery(
      new URLSearchParams(window.location.search).get("q"),
    );
    modelSearchQuery = searchQuery;
    document.title =
      tab === "discover" ? "Discover AI Models | LiteLLM" : PAGE_TITLES[tab];
    moreMenuOpen = false;
  }

  function selectTab(tab: Tab, query = "") {
    const params = new URLSearchParams();
    const cleanQuery = sanitizeSearchQuery(query);
    if (tab === "models" && cleanQuery) params.set("q", cleanQuery);
    const suffix = params.size ? `?${params}` : "";
    const destination = `${tabPaths[tab]}${suffix}`;
    if (
      `${window.location.pathname}${window.location.search}` !== destination
    ) {
      window.history.pushState({ tab }, "", destination);
    }
    updatePage(tab);
    if (tab === "models" || tab === "providers") trackTabChange(tab);
    trackPageView(tab);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function navigate(event: MouseEvent, tab: Tab) {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    selectTab(tab);
  }

  function setTheme(nextTheme: Theme) {
    theme = nextTheme;
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem("litellm-handoff-theme", theme);
    } catch {
      // The theme toggle also works when browser storage is unavailable.
    }
  }

  function handleKeyboard(event: KeyboardEvent) {
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "k" &&
      activeTab !== "models"
    ) {
      event.preventDefault();
      searchInput?.focus();
    }
    if (event.key === "Escape") moreMenuOpen = false;
  }

  function openRequest() {
    moreMenuOpen = false;
    requestForm?.openModal(activeTab === "models" ? modelSearchQuery : "");
  }

  function handleQueryChange(event: CustomEvent<{ query: string }>) {
    modelSearchQuery = sanitizeSearchQuery(event.detail.query);
  }

  function handleModelRequest(event: Event) {
    const modelName = (event as CustomEvent<{ modelName?: string }>).detail
      ?.modelName;
    requestForm?.openModal(sanitizeSearchQuery(modelName));
  }

  onMount(() => {
    try {
      const savedTheme = window.localStorage.getItem("litellm-handoff-theme");
      setTheme(savedTheme === "dark" ? "dark" : "light");
    } catch {
      setTheme("light");
    }
    initAnalytics();
    document.title = PAGE_TITLES[activeTab];
    trackPageView(activeTab);
    const onPopState = () => updatePage(getTabFromLocation());
    window.addEventListener("popstate", onPopState);
    window.addEventListener("request-support", handleModelRequest);
    if (new URLSearchParams(window.location.search).get("request") === "true")
      requestForm?.openModal();
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("request-support", handleModelRequest);
    };
  });
</script>

<svelte:window on:keydown={handleKeyboard} />

<div class="app-container handoff-app">
  <header class="hf-header">
    <div class="hf-header-inner">
      <a
        class="hf-brand"
        href="/"
        on:click={(event) => navigate(event, "discover")}
        aria-label="LiteLLM Discover home"
      >
        <img
          src={theme === "light"
            ? "/brand/litellm-primary-blue.svg"
            : "/brand/litellm-primary-white.svg"}
          alt="LiteLLM"
          width="132"
          height="32"
        />
        <span>/ MODELS</span>
      </a>

      <nav class="hf-nav" aria-label="Main navigation">
        <a
          href="/"
          aria-current={activeTab === "discover" ? "page" : undefined}
          on:click={(event) => navigate(event, "discover")}>Discover</a
        >
        <a
          href="/search"
          aria-current={activeTab === "models" ? "page" : undefined}
          on:click={(event) => navigate(event, "models")}>Models</a
        >
        <a
          href="/providers"
          aria-current={activeTab === "providers" ? "page" : undefined}
          on:click={(event) => navigate(event, "providers")}>Providers</a
        >
        <a
          href="/changelog"
          aria-current={activeTab === "changelog" ? "page" : undefined}
          on:click={(event) => navigate(event, "changelog")}>Changelog</a
        >
        <a
          href="/benchmarks"
          aria-current={activeTab === "benchmarks" ? "page" : undefined}
          on:click={(event) => navigate(event, "benchmarks")}
          >Coding benchmarks</a
        >
      </nav>

      {#if activeTab !== "models"}
        <form
          class="hf-header-search"
          action="/search"
          role="search"
          on:submit|preventDefault={() => selectTab("models", searchQuery)}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
            ><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg
          >
          <input
            bind:this={searchInput}
            bind:value={searchQuery}
            name="q"
            type="search"
            placeholder="Search models"
            aria-label="Search models"
            autocomplete="off"
          />
          <kbd aria-hidden="true">⌘ K</kbd>
        </form>
      {/if}

      <div class="hf-header-actions">
        <button
          class="hf-feedback"
          type="button"
          data-feedback-open
          aria-haspopup="dialog"
        >Help us improve</button>
        <a
          class="hf-docs"
          href="https://docs.litellm.ai"
          target="_blank"
          rel="noopener noreferrer">Docs ↗</a
        >
        <button
          class="hf-theme-toggle"
          type="button"
          on:click={() => setTheme(theme === "light" ? "dark" : "light")}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          {#if theme === "light"}
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              aria-hidden="true"
              ><path
                d="M20.8 13.1A9 9 0 0 1 10.9 3.2 9 9 0 1 0 20.8 13.1Z"
              /></svg
            >
          {:else}
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              aria-hidden="true"
              ><circle cx="12" cy="12" r="4" /><path
                d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"
              /></svg
            >
          {/if}
        </button>
        <div class="hf-more">
          <button
            class="hf-more-toggle"
            type="button"
            aria-label="More navigation"
            aria-expanded={moreMenuOpen}
            aria-controls="hf-more-menu"
            on:click={() => (moreMenuOpen = !moreMenuOpen)}>···</button
          >
          {#if moreMenuOpen}
            <nav
              class="hf-more-menu"
              id="hf-more-menu"
              aria-label="More navigation"
            >
              <a
                href="/cookbook"
                aria-current={activeTab === "cookbook" ? "page" : undefined}
                on:click={(event) => navigate(event, "cookbook")}>Cookbook</a
              >
              <a
                href="/guardrails"
                aria-current={activeTab === "guardrails" ? "page" : undefined}
                on:click={(event) => navigate(event, "guardrails")}
                >Guardrails</a
              >
              <a href="/models">All models index</a>
              <a href="/compare/custom">Compare models</a>
              <a href="/calculator">Pricing calculator</a>
              <a href="/new-models">New models</a>
              <a href="/deprecated-models">Recently deprecated</a>
              <a
                href="https://github.com/BerriAI/litellm"
                target="_blank"
                rel="noopener noreferrer">GitHub ↗</a
              >
              <button type="button" on:click={openRequest}
                >Request a model +</button
              >
            </nav>
          {/if}
        </div>
      </div>
    </div>
  </header>

  {#key pageKey}
    <div class="hf-route" class:hf-catalog-route={activeTab === "models"}>
      {#if activeTab === "discover"}
        <Discover />
      {:else if activeTab === "changelog"}
        <Changelog />
      {:else if activeTab === "benchmarks"}
        <CodingBenchmarks />
      {:else if activeTab === "models"}
        <App compact on:querychange={handleQueryChange} />
      {:else if activeTab === "providers"}
        <Providers />
      {:else if activeTab === "cookbook"}
        <Cookbook />
      {:else if activeTab === "guardrails"}
        <Guardrails />
      {/if}
    </div>
  {/key}
  <RequestForm bind:this={requestForm} />
</div>
