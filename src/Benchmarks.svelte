<script lang="ts">
  import PageHero from "./PageHero.svelte";
  import DiscoveryUpdates from "./DiscoveryUpdates.svelte";
  import CodingBenchmarks from "./CodingBenchmarks.svelte";
  let pilotOpen = false;
</script>

<main class="benchmarks-page">
  <PageHero
    id="benchmarks"
    title="BENCHMARKS"
    description="Compare quality, coding, and cost. Then find a provider for your model."
  />
  <DiscoveryUpdates rankingsOnly />
  <details class="pilot" bind:open={pilotOpen}>
    <summary
      ><strong>LiteLLM coding pilot</strong><span
        >Small-sample runs across coding agents · Separate from the published
        benchmarks above</span
      ></summary
    >
    {#if pilotOpen}<CodingBenchmarks embedded showStandaloneLink={false} />{/if}
  </details>
</main>

<style>
  .benchmarks-page {
    max-width: var(--page-width);
    margin: auto;
    padding: 0 var(--page-gutter) 40px;
    color: var(--hf-ink);
  }
  .pilot {
    border-top: 1px solid var(--hf-line);
    margin-top: 12px;
  }
  summary {
    cursor: pointer;
    padding: 22px 0;
  }
  summary strong {
    font-size: 17px;
    font-weight: 600;
  }
  summary span {
    display: block;
    margin: 8px 0 0 18px;
    color: var(--hf-muted);
    font-size: 13px;
    line-height: 1.5;
  }
  summary:focus-visible {
    outline: 2px solid var(--hf-accent);
    outline-offset: 4px;
  }
</style>
