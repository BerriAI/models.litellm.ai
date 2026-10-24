<script lang="ts">
  import BenchmarkWorkspace from "../BenchmarkWorkspace.svelte";
  import "../handoff.css";
  import type { BenchmarkReport } from "./types";
  export let report: BenchmarkReport;
  export let reportIcon: string;
  let dark = false;
  function toggle() {
    dark = !dark;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }
</script>

<div class="handoff-app">
  <header class="hf-header">
    <div class="hf-header-inner">
      <span class="hf-brand"
        ><strong>LiteLLM</strong><span class="hf-brand-divider"></span><span
          class="hf-brand-label">MODELS</span
        ></span
      >
      <nav class="hf-primary-nav" aria-label="Report navigation">
        <a href="#discover-title" aria-current="page">Discover</a>
      </nav>
      <div class="hf-header-actions">
        <span class="private">YOUR DATA · LOCAL REPORT</span><button
          class="hf-theme-toggle"
          aria-label="Toggle color theme"
          on:click={toggle}>{dark ? "☀" : "☾"}</button
        >
      </div>
    </div>
  </header>
  <main><BenchmarkWorkspace {report} {reportIcon} /></main>
</div>

<style>
  .private {
    font:
      10px "IBM Plex Mono",
      monospace;
    color: var(--hf-muted);
    letter-spacing: 1px;
  }
  .hf-header-actions {
    margin-left: auto;
  }
  .hf-brand {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  @media (max-width: 640px) {
    .private {
      display: none;
    }
  }
</style>
