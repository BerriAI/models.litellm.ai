<script lang="ts">
  import CodingBenchmarks from "./CodingBenchmarks.svelte";
  import DiscoveryUpdates from "./DiscoveryUpdates.svelte";
</script>

<main class="discover-page">
  <DiscoveryUpdates />
  <CodingBenchmarks embedded />
  <footer>
    <a href="/search">Explore all models <span aria-hidden="true">→</span></a>
    <a
      href="https://github.com/BerriAI/models.litellm.ai"
      target="_blank"
      rel="noreferrer">Source on GitHub ↗</a
    >
  </footer>
</main>

<style>
  .discover-page {
    max-width: var(--page-width);
    margin: auto;
    padding: 0 var(--page-gutter);
    color: var(--hf-ink);
  }
  footer {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    padding: 24px 0 40px;
    border-top: 1px solid var(--hf-line);
  }
  footer a {
    font-size: 13px;
    color: var(--hf-muted);
    text-decoration: none;
  }
  footer a:hover {
    color: var(--hf-accent);
  }
</style>
