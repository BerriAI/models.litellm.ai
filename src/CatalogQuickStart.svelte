<script lang="ts">
  import QuickStartBox from "./QuickStartBox.svelte";
  let open = false;
</script>

<details class="catalog-quickstart" bind:open>
  <summary>Quick start with LiteLLM</summary>
  {#if open}<QuickStartBox />{/if}
</details>

<style>
  details {
    max-width: 640px;
  }
  summary {
    cursor: pointer;
    width: fit-content;
    font-size: 13px;
    font-weight: 500;
    color: var(--hf-accent);
    padding: 8px 0;
  }
  summary:focus-visible {
    outline: 2px solid var(--hf-accent);
    outline-offset: 4px;
  }
</style>
