<script lang="ts">
  /**
   * The docs site's Quick Start box (litellm-docs src/components/QuickStartBox):
   * Gateway or SDK on the left, "Quick Start" in the middle, the operating
   * system on the right, a Copy button that is always on screen, and an agent
   * prompt below.
   */
  import { onMount } from "svelte";
  import { trackQuickStartCopy } from "./analytics";
  import { AGENT_PROMPTS, QUICKSTART } from "./quickstart";

  let product: "gateway" | "sdk" = "gateway";
  let os: "mac" | "windows" = "mac";
  let copied = false;
  let promptCopied = false;
  let pre: HTMLPreElement;
  let clipped = false;
  let copyError = "";
  let manualCopy = "";

  $: command = product === "sdk" ? QUICKSTART.sdk : QUICKSTART.gateway[os];

  onMount(() => {
    // Windows visitors see the PowerShell command first.
    const nav = navigator as Navigator & {
      userAgentData?: { platform?: string };
    };
    if (/win/i.test(nav.userAgentData?.platform || navigator.platform || ""))
      os = "windows";
    // Fade the right edge only when the command is wider than the box.
    const ro = new ResizeObserver(measure);
    ro.observe(pre);
    return () => ro.disconnect();
  });

  function measure() {
    if (pre) clipped = pre.scrollWidth > pre.clientWidth + 1;
  }

  $: command, setTimeout(measure);

  function flash(set: (v: boolean) => void) {
    set(true);
    setTimeout(() => set(false), 1500);
  }

  async function copy(what: "command" | "prompt") {
    copyError = "";
    manualCopy = "";
    const text = what === "command" ? command : AGENT_PROMPTS[product];
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      flash((value) =>
        what === "command" ? (copied = value) : (promptCopied = value),
      );
      trackQuickStartCopy(
        product,
        what,
        what === "command" && product === "gateway" ? os : undefined,
      );
    } catch {
      copyError = "Couldn't copy. Select and copy the text below.";
      manualCopy = text;
    }
  }
  const copyCommand = () => copy("command");
  const copyPrompt = () => copy("prompt");
</script>

<div class="qs">
  <p class="setup-description">
    {product === "gateway"
      ? "Run a local API gateway for any language. Requires Docker."
      : "Add LiteLLM to a Python project."}
  </p>
  <div class="box">
    <div class="head">
      <div class="group" role="group" aria-label="What to start">
        <button
          type="button"
          class="tab"
          class:on={product === "gateway"}
          aria-pressed={product === "gateway"}
          on:click={() => (product = "gateway")}>Gateway</button
        >
        <button
          type="button"
          class="tab"
          class:on={product === "sdk"}
          aria-pressed={product === "sdk"}
          on:click={() => (product = "sdk")}>SDK</button
        >
      </div>
      <span class="title">Quick Start</span>
      {#if product === "gateway"}
        <div class="group right" role="group" aria-label="Operating system">
          <button
            type="button"
            class="tab"
            class:on={os === "mac"}
            aria-pressed={os === "mac"}
            on:click={() => (os = "mac")}
          >
            <span class="long">macOS &amp; Linux</span><span class="short"
              >macOS/Linux</span
            >
          </button>
          <button
            type="button"
            class="tab"
            class:on={os === "windows"}
            aria-pressed={os === "windows"}
            on:click={() => (os = "windows")}>Windows</button
          >
        </div>
      {/if}
    </div>
    <div class="run">
      <pre bind:this={pre} class="cmd" class:clipped><code>{command}</code
        ></pre>
      <button
        type="button"
        class="copy"
        class:done={copied}
        aria-label={copied ? "Command copied" : "Copy command"}
        on:click={copyCommand}
      >
        {#if copied}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"><path d="M20 6L9 17l-5-5" /></svg
          >
        {:else}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><rect x="9" y="9" width="12" height="12" rx="2" /><path
              d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
            /></svg
          >
        {/if}
        <span class="copy-label">{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  </div>
  <div class="below">
    <span>Or let your coding agent set it up:</span>
    <button type="button" class="prompt" on:click={copyPrompt}>
      {#if promptCopied}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"><path d="M20 6L9 17l-5-5" /></svg
        >
      {:else}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><rect x="2.5" y="4" width="19" height="16" rx="2" /><path
            d="M6 10l3 2.5L6 15M11 15h3"
          /></svg
        >
      {/if}
      {promptCopied ? "Copied" : "Copy agent prompt"}
    </button>
  </div>
  {#if copyError}<p role="status">{copyError}</p>
    <textarea
      aria-label="Text to copy manually"
      readonly
      value={manualCopy}
      rows="6"
    ></textarea>{/if}
</div>

<style>
  button:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--hf-accent);
    outline-offset: 3px;
  }
  .setup-description {
    font-size: 13px;
    color: var(--hf-muted);
    line-height: 1.5;
    margin: 0 0 12px;
  }
  .below > span {
    font-size: 12px;
    color: var(--hf-muted);
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    font:
      12px/1.5 "IBM Plex Mono",
      monospace;
    background: var(--hf-dialog);
    color: var(--hf-ink);
    border: 1px solid var(--hf-line);
    padding: 12px;
  }

  .qs {
    width: 100%;
    max-width: 640px;
    margin: 12px 0 0;
    text-align: left;
  }

  .box {
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: var(--card-bg);
    box-shadow: var(--shadow-md);
    overflow: hidden;
  }

  .head {
    position: relative;
    display: flex;
    align-items: stretch;
    flex-wrap: wrap;
    gap: 0 1.1rem;
    padding: 0 0.9rem;
    border-bottom: 1px solid var(--border-color);
    container-type: inline-size;
  }

  .group {
    display: flex;
    align-items: stretch;
    gap: 1.1rem;
  }

  .right {
    margin-left: auto;
  }

  .tab {
    display: flex;
    align-items: center;
    margin-bottom: -1px;
    padding: 0.55rem 0 0.5rem;
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--muted-color);
    font-family: inherit;
    font-size: 0.8rem;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }

  .tab:hover {
    color: var(--text-color);
  }

  .tab.on {
    border-bottom-color: var(--litellm-primary);
    color: var(--text-color);
    font-weight: 650;
  }

  .short {
    display: none;
  }

  /* Centered on the box, not between the tab groups */
  .title {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font:
      650 0.7rem "Geist Mono",
      ui-monospace,
      Menlo,
      monospace;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-color);
    white-space: nowrap;
    pointer-events: none;
  }

  .run {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-right: 0.55rem;
  }

  .cmd {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    padding: 0.8rem 0.9rem;
    overflow-x: auto;
    background: transparent;
  }

  .cmd code {
    font-family: "Geist Mono", ui-monospace, Menlo, monospace;
    font-size: 12.5px;
    color: var(--code-text);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .clipped {
    mask-image: linear-gradient(
      to right,
      #000 calc(100% - 2.5rem),
      transparent
    );
  }

  .copy {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    height: 28px;
    padding: 0 0.55rem;
    border: 1px solid var(--border-color-strong);
    border-radius: 6px;
    background: var(--bg-color);
    color: var(--text-color);
    font-family: inherit;
    font-size: 0.76rem;
    font-weight: 600;
    cursor: pointer;
  }

  .copy:hover {
    border-color: var(--muted-color);
  }

  .copy.done,
  .copy.done:hover {
    border-color: var(--success-color);
    color: var(--success-color);
  }

  .below {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .prompt {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.55rem;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: transparent;
    color: var(--muted-color);
    font-family: inherit;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
  }

  .prompt:hover {
    border-color: var(--border-color-strong);
    color: var(--text-color);
  }

  /* Narrow boxes: the title would collide with the tabs, so it steps out, and
     the longer labels shorten. */
  @container (max-width: 520px) {
    .title {
      display: none;
    }
    .long {
      display: none;
    }
    .short {
      display: inline;
    }
  }

  @media (max-width: 480px) {
    .right { width: 100%; margin-left: 0; border-top: 1px solid var(--border-color); }
    .title { display: none; }
    .copy {
      width: 28px;
      padding: 0;
      justify-content: center;
    }
    .copy-label {
      display: none;
    }
  }
</style>
