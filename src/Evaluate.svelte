<script lang="ts">
  import PageHero from "./PageHero.svelte";
  import EvaluationFlow from "./benchmark/EvaluationFlow.svelte";
  let runDialog: HTMLDialogElement;
  let copyLabel = "Copy command";
  const runCommand =
    "git clone https://github.com/BerriAI/models.litellm.ai.git && cd models.litellm.ai && npm ci && npm run benchmark";
  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(runCommand);
      copyLabel = "Copied";
    } catch {
      copyLabel = "Select and copy the command above";
    }
  }
</script>

<main class="hf-hero-wrap evaluate-page">
  <PageHero
    id="evaluate"
    title="EVALUATE"
    eyebrow="YOUR GATEWAY. YOUR TRAFFIC."
    description="Find the right model for your traffic. Compare quality, speed, and cost using requests from your LiteLLM gateway."
    diagramCaption="SAMPLE / COMPARE / REPORT"
  >
    <div class="actions">
      <button class="primary" on:click={() => runDialog.showModal()}
        >Run on your gateway traffic <span aria-hidden="true">↗</span></button
      >
      <a href="/evaluate/sample">View sample report ↗</a>
    </div>
  </PageHero>
  <section class="workflow" aria-labelledby="workflow-title">
    <div class="section-heading">
      <div>
        <span class="eyebrow">FROM COMMAND TO REPORT</span>
        <h2 id="workflow-title">What happens when you run it</h2>
      </div>
      <code>npm run benchmark</code>
    </div>
    <EvaluationFlow />
    <div class="scope">
      <p>
        <strong>Compare recorded requests.</strong> The runner checks responses against
        the available instructions and context. It does not execute your tools or
        replay an entire agent session.
      </p>
      <p>
        <strong>Keep the report on your device.</strong> Requests and judging go
        through your gateway to the selected models. Keys and raw traffic are excluded
        from the report. Nothing is uploaded to this website.
      </p>
    </div>
  </section>
</main>

<dialog
  bind:this={runDialog}
  aria-labelledby="run-title"
  aria-describedby="run-description"
>
  <div class="dialog-top">
    <span class="eyebrow">LOCAL BENCHMARK</span><button
      class="close"
      aria-label="Close run dialog"
      on:click={() => runDialog.close()}>×</button
    >
  </div>
  <h2 id="run-title">Run on your gateway traffic</h2>
  <p id="run-description">
    Copy this command into your terminal. Requires Git and Node.js 22 or later.
  </p>
  <pre><code>{runCommand}</code></pre>
  <button class="primary copy" on:click={copyCommand}>{copyLabel}</button>
  <span class="copy-status" role="status"
    >{copyLabel === "Copy command" ? "" : copyLabel}</span
  >
  <p>Already in this repository? Run <code>npm run benchmark</code>.</p>
  <p>
    The terminal lets you select or edit your gateway and masked API key from
    your environment, then choose models, sessions, a judge, and a spending
    target.
  </p>
  <p>
    Evaluation calls use your gateway and may incur model charges. The spending
    target stops new calls; one in-flight call can exceed it.
  </p>
  <a href="/evaluate/sample">View sample report ↗</a>
</dialog>

<style>
  .evaluate-page {
    color: var(--hf-ink);
    padding-bottom: 48px;
  }
  .actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 22px;
  }
  a {
    color: var(--hf-accent);
    font-size: 13px;
    text-underline-offset: 4px;
  }
  .actions a {
    text-decoration: none;
  }
  .primary {
    border: 1px solid var(--hf-accent);
    background: var(--hf-accent);
    color: var(--hf-bg);
    padding: 12px 18px;
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border-radius: 6px;
  }
  .primary span {
    margin-left: 12px;
  }
  .primary:hover {
    opacity: 0.88;
  }
  .workflow {
    border-top: 1px solid var(--hf-line);
    padding-top: 28px;
  }
  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 24px;
  }
  .eyebrow {
    font:
      10px "IBM Plex Mono",
      monospace;
    letter-spacing: 1.2px;
    color: var(--hf-muted);
  }
  h2 {
    font-size: 24px;
    font-weight: 500;
    letter-spacing: -0.6px;
    margin: 9px 0 0;
  }
  code {
    font:
      12px "IBM Plex Mono",
      monospace;
  }
  .section-heading > code {
    padding: 9px 12px;
    border: 1px solid var(--hf-line);
    border-radius: 6px;
    white-space: nowrap;
  }
  .scope {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    border-top: 1px solid var(--hf-line);
    margin-top: 28px;
    padding-top: 8px;
  }
  p {
    font-size: 13px;
    line-height: 1.7;
    color: var(--hf-muted);
  }
  strong {
    color: var(--hf-ink);
    font-weight: 500;
  }
  dialog {
    width: 560px;
    max-width: calc(100vw - 32px);
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
    margin: auto;
    box-sizing: border-box;
    padding: 28px;
    background: var(--hf-dialog);
    color: var(--hf-ink);
    border: 1px solid var(--hf-line);
    border-radius: 12px;
  }
  dialog p {
    margin: 14px 0;
  }
  dialog::backdrop {
    background: #0008;
    backdrop-filter: blur(4px);
  }
  .dialog-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .close {
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 26px;
    cursor: pointer;
    padding: 0 6px;
  }
  pre {
    padding: 16px;
    background: var(--hf-faint);
    border: 1px solid var(--hf-line);
    border-radius: 6px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.8;
  }
  .copy {
    width: 100%;
  }
  .copy-status {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  @media (max-width: 640px) {
    .section-heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 12px;
    }
    .scope {
      grid-template-columns: 1fr;
      gap: 0;
    }
    h2 {
      font-size: 21px;
    }
    .actions {
      gap: 16px;
    }
  }
</style>
