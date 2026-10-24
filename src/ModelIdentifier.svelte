<script lang="ts">
  export let modelId: string;
  let copied = false;
  let failed = false;

  async function copy() {
    try {
      await navigator.clipboard.writeText(modelId);
      copied = true;
      failed = false;
    } catch {
      failed = true;
    }
  }
</script>

<span class="identifier" class:failed>
  <button
    type="button"
    on:click={copy}
    aria-label={`Copy model ID ${modelId}`}
    title={`Copy LiteLLM model ID: ${modelId}`}
  >
    <code>{modelId}</code>
    <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
  </button>
  <span class="copy-feedback" class:visually-hidden={!failed} role="status">
    {#if failed}Couldn't copy — select the ID.{:else if copied}Copied{/if}
  </span>
</span>

<style>
  .identifier {
    position: relative;
    justify-content: flex-end;
    width: 100%;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    line-height: 1.4;
    min-width: 0;
    max-width: 100%;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    max-width: 100%;
    padding: 3px 6px;
    border: 1px solid var(--hf-line);
    border-radius: 4px;
    background: transparent;
    color: var(--hf-ink);
    font-size: 11px;
    line-height: 1.4;
    cursor: pointer;
    text-align: left;
  }
  code {
    font-size: 11px;
    line-height: 1.4;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: text;
  }
  button:hover {
    color: var(--hf-accent);
    border-color: var(--hf-accent);
  }
  button:focus-visible {
    outline: 2px solid var(--hf-accent);
    outline-offset: 3px;
  }
  .failed code {
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .identifier.failed {
    flex-wrap: wrap;
  }
  .copy-feedback {
    font-size: 11px;
    color: var(--hf-ink);
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
</style>
