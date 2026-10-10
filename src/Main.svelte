<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import App from "./App.svelte";
  import Providers from "./Providers.svelte";
  import Cookbook from "./Cookbook.svelte";
  import Guardrails from "./Guardrails.svelte";
  import RequestForm from "./RequestForm.svelte";
  import { initAnalytics, trackPageView, trackTabChange } from "./analytics";

  let activeTab: "models" | "providers" | "cookbook" | "guardrails" = "models";
  let mobileMenuOpen = false;
  let requestForm: RequestForm;

  const GITHUB_URL = "https://github.com/BerriAI/litellm";
  const DOCS_URL = "https://docs.litellm.ai";

  function getTabFromPath(path: string): "models" | "providers" | "cookbook" | "guardrails" {
    if (path === "/providers" || path === "/providers/") {
      return "providers";
    } else if (path === "/cookbook" || path === "/cookbook/") {
      return "cookbook";
    } else if (path === "/guardrails" || path === "/guardrails/") {
      return "guardrails";
    }
    return "models";
  }

  function getPathFromTab(tab: "models" | "providers" | "cookbook" | "guardrails"): string {
    if (tab === "providers") return "/providers";
    if (tab === "cookbook") return "/cookbook";
    if (tab === "guardrails") return "/guardrails";
    return "/";
  }

  function toggleMobileMenu() {
    mobileMenuOpen = !mobileMenuOpen;
  }

  function closeMobileMenu() {
    mobileMenuOpen = false;
  }

  function selectTab(tab: "models" | "providers" | "cookbook" | "guardrails", updateUrl = true) {
    activeTab = tab;
    closeMobileMenu();
    trackTabChange(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
    
    if (updateUrl) {
      const path = getPathFromTab(tab);
      window.history.pushState({ tab }, "", path);
    }
  }

  function handlePopState(event: PopStateEvent) {
    const tab = event.state?.tab || getTabFromPath(window.location.pathname);
    selectTab(tab, false);
  }
  onMount(async () => {
    initAnalytics();
    trackPageView('Home');

    const initialTab = getTabFromPath(window.location.pathname);
    activeTab = initialTab;
    
    window.history.replaceState({ tab: initialTab }, "", window.location.pathname);
    
    window.addEventListener("popstate", handlePopState);

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('request') === 'true') {
      requestForm?.openModal();
    }

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  });
</script>

<div class="app-container">
  <!-- Header -->
  <header class="header">
    <div class="header-content">
      <a href="/" class="logo-section-header" on:click|preventDefault={() => selectTab("models")}>
        <picture>
          <source srcset="/brand/litellm-logo-white.png" media="(prefers-color-scheme: dark)" />
          <img class="brand-logo" src="/brand/litellm-logo-blue.png" alt="LiteLLM" width="132" height="25" />
        </picture>
      </a>

      <!-- Desktop Navigation -->
      <div class="desktop-nav">
        <div class="tabs">
          <button
            class="tab"
            class:active={activeTab === "models"}
            on:click={() => selectTab("models")}
          >
            Models
          </button>
          <button
            class="tab"
            class:active={activeTab === "providers"}
            on:click={() => selectTab("providers")}
          >
            Endpoints & Providers
          </button>
          <button
            class="tab"
            class:active={activeTab === "cookbook"}
            on:click={() => selectTab("cookbook")}
          >
            Cookbook
          </button>
          <button
            class="tab"
            class:active={activeTab === "guardrails"}
            on:click={() => selectTab("guardrails")}
          >
            Guardrails
          </button>
        </div>
        <nav class="nav-links">
          <button class="request-button" on:click={() => requestForm.openModal()}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="8" y1="3" x2="8" y2="13"></line>
              <line x1="3" y1="8" x2="13" y2="8"></line>
            </svg>
            Request
          </button>
          <a href="/models" class="nav-link">All models</a>
          <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" class="nav-link">Docs</a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" class="nav-link">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
          </a>
        </nav>
      </div>

      <!-- Mobile Menu Button -->
      <button
        class="mobile-menu-btn"
        on:click={toggleMobileMenu}
        aria-label="Toggle menu"
        aria-expanded={mobileMenuOpen}
      >
        <span class="hamburger" class:open={mobileMenuOpen}></span>
      </button>
    </div>

    <!-- Mobile Menu -->
    {#if mobileMenuOpen}
      <div class="mobile-menu">
        <button class="mobile-request-button" on:click={() => { requestForm.openModal(); closeMobileMenu(); }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="3" x2="8" y2="13"></line>
            <line x1="3" y1="8" x2="13" y2="8"></line>
          </svg>
          Request Model, Provider, Endpoint
        </button>
        <div class="mobile-tabs">
          <button
            class="mobile-tab"
            class:active={activeTab === "models"}
            on:click={() => selectTab("models")}
          >
            Models
          </button>
          <button
            class="mobile-tab"
            class:active={activeTab === "providers"}
            on:click={() => selectTab("providers")}
          >
            Endpoints & Providers
          </button>
          <button
            class="mobile-tab"
            class:active={activeTab === "cookbook"}
            on:click={() => selectTab("cookbook")}
          >
            Cookbook
          </button>
          <button
            class="mobile-tab"
            class:active={activeTab === "guardrails"}
            on:click={() => selectTab("guardrails")}
          >
            Guardrails
          </button>
        </div>
        <div class="mobile-links">
          <a href="/models" class="mobile-link">All models</a>
          <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" class="mobile-link" on:click={closeMobileMenu}>Docs</a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" class="mobile-link" on:click={closeMobileMenu}>GitHub</a>
        </div>
      </div>
    {/if}
  </header>

  <!-- Content -->
  {#key activeTab}
    <div in:fade={{ duration: 150, delay: 50 }}>
      {#if activeTab === "models"}
        <App />
      {:else if activeTab === "providers"}
        <Providers />
      {:else if activeTab === "cookbook"}
        <Cookbook />
      {:else if activeTab === "guardrails"}
        <Guardrails />
      {/if}
    </div>
  {/key}

  <!-- Request Form Modal -->
  <RequestForm bind:this={requestForm} />
</div>

<style>
  :global(html) {
    color-scheme: light dark;
  }

  :global(body) {
    background-color: var(--bg-color);
    color: var(--text-color);
    font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  :global(::selection) {
    background: var(--border-color-strong);
    color: inherit;
  }

  :global(*:focus-visible) {
    outline: 2px solid var(--litellm-primary);
    outline-offset: 2px;
  }

  :global(input:focus-visible),
  :global(textarea:focus-visible),
  :global(select:focus-visible) {
    outline: none;
  }

  :global(*::-webkit-scrollbar) {
    width: 8px;
    height: 8px;
  }

  :global(*::-webkit-scrollbar-track) {
    background: var(--bg-secondary);
  }

  :global(*::-webkit-scrollbar-thumb) {
    background: var(--border-color-strong);
    border-radius: 4px;
  }

  :global(*::-webkit-scrollbar-thumb:hover) {
    background: var(--muted-color);
  }

  /* Brand tokens, matching docs.litellm.ai: logo blue #0117be as the accent
     on light, a light blue from the same hue on the blue-black dark ground
     (#0117be is unreadable on dark). Surfaces stay neutral. */
  :root {
    --litellm-primary: #0117be;
    --litellm-dark: #0114ab;
    --litellm-on-primary: #ffffff;
    --focus-ring: rgba(1, 23, 190, 0.14);

    --bg-color: #ffffff;
    --bg-secondary: #f7f8fc;
    --bg-tertiary: #f2f4fd;
    --text-color: #272b37;
    --text-secondary: #3a3e4b;
    --muted-color: #646875;
    --border-color: #ececf0;
    --border-color-strong: #d3d8f3;
    --card-bg: #ffffff;
    --code-bg: #f7f8fc;
    --code-text: #272b37;
    --hover-bg: #f2f4fd;
    --link-color: #0117be;
    --link-hover: #0114ab;
    --nav-bg: rgba(255, 255, 255, 0.72);
    --success-color: #10b981;
    --shadow-sm: 0 1px 2px 0 rgba(39, 43, 55, 0.05);
    --shadow-md: 0 1px 2px rgba(39, 43, 55, 0.04), 0 6px 16px -8px rgba(1, 23, 190, 0.12);
    --shadow-lg: 0 1px 2px rgba(39, 43, 55, 0.04), 0 10px 28px -14px rgba(1, 23, 190, 0.18);
    --aurora-mesh:
      radial-gradient(48% 540px at 4% -6%, rgba(1, 23, 190, 0.07) 0%, rgba(1, 23, 190, 0) 64%),
      radial-gradient(42% 500px at 98% -4%, rgba(56, 170, 240, 0.12) 0%, rgba(56, 170, 240, 0) 66%),
      radial-gradient(38% 400px at 52% -18%, rgba(110, 130, 255, 0.07) 0%, rgba(110, 130, 255, 0) 72%);
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --bg-color: #080b26;
      --bg-secondary: #0f1335;
      --bg-tertiary: #151a44;
      --text-color: #ffffff;
      --text-secondary: #d6d4ea;
      --muted-color: #a6a4c6;
      --border-color: #1a1f45;
      --border-color-strong: #2b3170;
      --card-bg: #0f1335;
      --code-bg: #0f1335;
      --code-text: #d6d4ea;
      --hover-bg: #151a44;
      --litellm-primary: #9fabff;
      --litellm-dark: #b8c1ff;
      --litellm-on-primary: #080b26;
      --focus-ring: rgba(159, 171, 255, 0.2);
      --link-color: #9fabff;
      --link-hover: #c6ceff;
      --nav-bg: rgba(8, 11, 38, 0.72);
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.4);
      --aurora-mesh:
        radial-gradient(48% 560px at 2% -8%, rgba(20, 45, 220, 0.3) 0%, rgba(20, 45, 220, 0) 64%),
        radial-gradient(42% 500px at 100% -6%, rgba(56, 170, 240, 0.12) 0%, rgba(56, 170, 240, 0) 66%),
        radial-gradient(36% 380px at 52% -20%, rgba(110, 130, 255, 0.1) 0%, rgba(110, 130, 255, 0) 72%);
    }
  }

  .app-container {
    min-height: 100vh;
    background: var(--aurora-mesh) no-repeat, var(--bg-color);
  }

  /* Header */
  .header {
    background: var(--nav-bg);
    border-bottom: 1px solid var(--border-color);
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(12px);
    background: rgba(255,255,255,0.92);
  }

  @media (prefers-color-scheme: dark) {
    .header {
      background: rgba(12,15,26,0.92);
    }
  }

  .header-content {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 60px;
  }

  .desktop-nav {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .logo-section-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    color: inherit;
  }

  .brand-logo {
    display: block;
    height: 25px;
    width: auto;
  }


  .tabs {
    display: flex;
    gap: 0;
    align-items: center;
  }

  .tab {
    padding: 0.5rem 0.875rem;
    border: none;
    background: transparent;
    color: var(--muted-color);
    font-weight: 500;
    font-size: 0.875rem;
    cursor: pointer;
    transition: color 0.15s ease;
    position: relative;
    white-space: nowrap;
  }

  .tab:hover {
    color: var(--text-color);
  }

  .tab.active {
    color: var(--text-color);
    font-weight: 600;
  }

  .tab.active::after {
    content: "";
    position: absolute;
    bottom: -1px;
    left: 0.875rem;
    right: 0.875rem;
    height: 2px;
    background: var(--litellm-primary);
    border-radius: 1px;
  }

  .nav-links {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .request-button {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    background: var(--litellm-primary);
    color: var(--litellm-on-primary);
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.8125rem;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .request-button:hover {
    background: var(--litellm-dark);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    transform: translateY(-1px);
  }

  .request-button svg {
    width: 14px;
    height: 14px;
  }

  .nav-link {
    color: var(--muted-color);
    text-decoration: none;
    white-space: nowrap;
    font-weight: 500;
    font-size: 0.875rem;
    transition: color 0.15s ease;
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .nav-link:hover {
    color: var(--text-color);
  }

  /* Mobile Menu Button */
  .mobile-menu-btn {
    display: none;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.5rem;
    z-index: 101;
  }

  .hamburger {
    display: block;
    width: 20px;
    height: 2px;
    background-color: var(--text-color);
    position: relative;
    transition: background-color 0.2s ease;
  }

  .hamburger::before,
  .hamburger::after {
    content: "";
    position: absolute;
    width: 20px;
    height: 2px;
    background-color: var(--text-color);
    left: 0;
    transition: transform 0.3s ease;
  }

  .hamburger::before { top: -6px; }
  .hamburger::after { top: 6px; }
  .hamburger.open { background-color: transparent; }
  .hamburger.open::before { transform: rotate(45deg) translate(4px, 4px); }
  .hamburger.open::after { transform: rotate(-45deg) translate(4px, -4px); }

  /* Mobile Menu Panel */
  .mobile-menu {
    display: none;
    background: var(--bg-color);
    border-top: 1px solid var(--border-color);
    padding: 1rem;
  }

  .mobile-request-button {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--litellm-primary);
    color: var(--litellm-on-primary);
    border: none;
    border-radius: 10px;
    font-weight: 600;
    font-size: 0.9375rem;
    cursor: pointer;
    margin-bottom: 1rem;
  }

  .mobile-request-button svg { width: 16px; height: 16px; }

  .mobile-tabs {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border-color);
  }

  .mobile-tab {
    padding: 0.625rem 1rem;
    border: none;
    background: transparent;
    color: var(--muted-color);
    font-weight: 500;
    font-size: 0.9375rem;
    cursor: pointer;
    text-align: left;
    border-radius: 8px;
    transition: all 0.15s ease;
  }

  .mobile-tab:hover { background-color: var(--bg-tertiary); color: var(--text-color); }
  .mobile-tab.active { background-color: var(--bg-tertiary); color: var(--litellm-primary); font-weight: 600; }

  .mobile-links {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .mobile-link {
    padding: 0.625rem 1rem;
    color: var(--muted-color);
    text-decoration: none;
    font-weight: 500;
    font-size: 0.9375rem;
    border-radius: 8px;
    transition: all 0.15s ease;
  }

  .mobile-link:hover { background-color: var(--bg-tertiary); color: var(--text-color); }

  @media (max-width: 900px) {
    .header-content { padding: 0 1rem; }
    .desktop-nav { display: none; }
    .mobile-menu-btn { display: block; }
    .mobile-menu { display: block; }
  }

</style>
