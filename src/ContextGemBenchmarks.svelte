<script lang="ts">
  import {
    CONTEXTGEM_FILES,
    CONTEXTGEM_ROOT,
    contextGemRows,
    contextGemSources,
    type ContextGemInput,
    type ContextGemMode,
  } from "./contextgemBenchmarks";

  let input: ContextGemInput = "pdf";
  let document = "complex_mcu";
  let mode: ContextGemMode = "default";
  $: source = contextGemSources[input];
  $: rows = contextGemRows(input, document, mode);
  $: resultsUrl = `${CONTEXTGEM_FILES}/dev/evals/results/${source.experiment}/summary.md`;
  const number = (value: number | null, digits = 1) =>
    value === null ? "Not provided" : value.toFixed(digits);

  function selectInput(next: ContextGemInput) {
    input = next;
    document = contextGemSources[next].cases[0].id;
  }
</script>

<section class="extraction-results" aria-labelledby="extraction-title">
  <header>
    <div>
      <span class="eyebrow">DOCUMENT EXTRACTION / PUBLIC EVALS</span>
      <h2 id="extraction-title">Document extraction with ContextGem</h2>
      <p>Extract structured values and trace them back to the document</p>
    </div>
    <a
      class="brand"
      href="https://contextgem.shcherbak.ai/"
      target="_blank"
      rel="noreferrer"
    >
      <img
        src="/contextgem/wordmark.svg"
        width="288"
        height="36"
        alt="ContextGem"
        loading="lazy"
      />
    </a>
  </header>

  <div class="controls">
    <div class="input-options" aria-label="Extraction input">
      <button
        class:active={input === "pdf"}
        aria-pressed={input === "pdf"}
        on:click={() => selectInput("pdf")}>PDF extraction</button
      >
      <button
        class:active={input === "text"}
        aria-pressed={input === "text"}
        on:click={() => selectInput("text")}>Text extraction</button
      >
    </div>
    <label
      >Document
      <select bind:value={document}>
        {#each source.cases as item}<option value={item.id}>{item.name}</option
          >{/each}
      </select>
    </label>
    <label
      >Model type
      <select bind:value={mode}>
        <option value="default">LLMs · full extraction</option>
        <option value="decision_default"
          >Decision models · closed questions</option
        >
      </select>
    </label>
  </div>

  <p class="scope">
    <span class="snapshot">PUBLISHED SNAPSHOT</span>
    {source.date} · ContextGem + model · Means across the reported runs, not a leaderboard
  </p>
  {#if input === "pdf"}
    <p class="input-note">
      Born-digital PDFs converted with Docling before ContextGem extraction. No
      scanned-document OCR test. Conversion time and compute are not included
    </p>
  {:else}
    <p class="input-note">
      Extraction from prepared document text. This does not measure PDF parsing
      or OCR
    </p>
  {/if}

  <!-- svelte-ignore a11y-no-noninteractive-tabindex (keyboard scrolling for the results table) -->
  <div
    class="table-scroll"
    role="region"
    aria-label="ContextGem extraction results"
    tabindex="0"
  >
    <table>
      <caption
        >{source.label} · {source.cases.find((item) => item.id === document)
          ?.name}</caption
      >
      <thead
        ><tr>
          <th scope="col">Model / upstream ID</th>
          <th scope="col">Runs</th>
          <th scope="col">Aspect F1</th>
          <th scope="col"
            >{mode === "default"
              ? "Typed concepts correct"
              : "Closed concepts correct"}</th
          >
          {#if mode === "default"}<th scope="col">Reference F1</th>{/if}
          <th scope="col">Extraction time</th>
          <th scope="col">API cost / run</th>
          <th scope="col">Failed runs</th>
        </tr></thead
      >
      <tbody>
        {#each rows as row}
          <tr>
            <th scope="row"><code>{row.model}</code></th>
            <td>{row.runs}</td>
            <td
              ><strong>{number(row.aspectF1, 3)}</strong><span
                class="track"
                aria-hidden="true"
                ><span style:width={`${(row.aspectF1 ?? 0) * 100}%`}
                ></span></span
              ></td
            >
            <td
              >{number(mode === "default" ? row.concepts : row.closedConcepts)} /
              {mode === "default"
                ? row.totalConcepts
                : row.totalClosedConcepts}</td
            >
            {#if mode === "default"}<td>{number(row.referenceF1, 3)}</td>{/if}
            <td>{number(row.seconds)}s</td>
            <td>${number(row.cost, 4)}</td>
            <td class:failed={row.failures > 0}>{row.failures} / {row.runs}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="limitations">
    Small development eval, not a general model ranking. Reference answers were
    generated and reviewed by AI agents, not human-verified. Failed runs remain
    in the averages
  </p>
  <div class="evidence">
    <a href={resultsUrl} target="_blank" rel="noreferrer"
      >Published results ↗</a
    >
    <a
      href={`${CONTEXTGEM_FILES}/dev/evals/cases/${document}.${input === "pdf" ? "pdf" : "txt"}`}
      target="_blank"
      rel="noreferrer">Source document ↗</a
    >
    <a
      href={`${CONTEXTGEM_FILES}/dev/evals/cases/${document}.gold.json`}
      target="_blank"
      rel="noreferrer">Reference answers ↗</a
    >
    <a
      href={`${CONTEXTGEM_ROOT}/dev/evals/results/${source.experiment}/runs`}
      target="_blank"
      rel="noreferrer">Per-run evidence ↗</a
    >
  </div>
  <details>
    <summary>Methodology and attribution</summary>
    <p>
      Aspect F1 scores selected paragraphs; reference F1 scores source
      grounding. Typed concepts use exact matching of values or object
      identities; string values, justifications and object text fields are
      judged separately upstream and are not part of the typed-concept count
      shown here. F1 ranges from 0 to 1
    </p>
    <p>
      Decision models answer Boolean, label and rating questions only, without
      open-ended values or concept references. They are shown separately because
      their work and concept denominators differ from LLMs. Aspect questions can
      favor models that read the whole document
    </p>
    <p>
      Dates, run counts, failures, timings and API costs come from the selected
      upstream experiment. Costs include its retries and observed cache
      behavior, exclude judge and conversion costs, and are historical
      estimates, not current API prices. A single run does not establish a
      reliable model comparison. PDF and text experiments use different
      ContextGem revisions and must not be treated as a controlled input-only
      comparison
    </p>
    <p>
      Published by Shcherbak AI / Sergii Shcherbak; republished as an attributed
      snapshot, not independently rerun by LiteLLM. ContextGem branding
      identifies the framework, not an endorsement
    </p>
    <div class="evidence">
      <a
        href={`${CONTEXTGEM_FILES}/dev/evals/AGENTS.md`}
        target="_blank"
        rel="noreferrer">Upstream methodology ↗</a
      >
      <a
        href={`${CONTEXTGEM_FILES}/dev/evals/cases/reference_review.md`}
        target="_blank"
        rel="noreferrer">Reference review ↗</a
      >
      <a href="/contextgem/LICENSE">Apache 2.0 license</a>
      <a href="/contextgem/NOTICE">Copyright and notices</a>
    </div>
  </details>
</section>

<style>
  .extraction-results {
    padding: 32px 0;
    border-top: 1px solid var(--hf-line);
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    align-items: center;
    margin-bottom: 24px;
  }
  .eyebrow,
  .snapshot {
    font:
      10px "IBM Plex Mono",
      monospace;
    letter-spacing: 0.08em;
  }
  .eyebrow {
    color: var(--hf-muted);
  }
  h2 {
    font:
      600 30px "Barlow Condensed",
      sans-serif;
    margin: 8px 0;
    color: var(--hf-ink);
  }
  p {
    color: var(--hf-muted);
    font-size: 12px;
    line-height: 1.7;
    margin: 8px 0;
  }
  .brand {
    flex-shrink: 0;
    padding: 18px;
    background: #101824;
    border-radius: 8px;
  }
  .brand img {
    display: block;
    max-width: 100%;
    height: auto;
  }
  .controls {
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 16px;
  }
  .input-options {
    display: flex;
    gap: 4px;
  }
  button,
  select {
    border: 1px solid var(--hf-line);
    border-radius: 4px;
    background: var(--hf-dialog);
    color: var(--hf-ink);
    font-size: 12px;
    padding: 9px 12px;
  }
  button.active {
    background: var(--hf-ink);
    color: var(--hf-bg);
    border-color: var(--hf-ink);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
    color: var(--hf-muted);
  }
  .scope {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-top: 20px;
  }
  .snapshot {
    padding: 2px 5px;
    border: 1px solid var(--hf-line);
    color: var(--hf-ink);
  }
  .input-note {
    margin-bottom: 16px;
  }
  .table-scroll {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 12px;
    text-align: left;
  }
  caption {
    text-align: left;
    color: var(--hf-muted);
    padding: 0 0 10px;
    font-size: 11px;
  }
  th,
  td {
    padding: 14px 12px;
    border-bottom: 1px solid var(--hf-line);
    white-space: nowrap;
  }
  thead th {
    font-weight: 500;
    color: var(--hf-muted);
    font-size: 10px;
  }
  tbody th {
    text-align: left;
    font-weight: 500;
  }
  code {
    font:
      11px "IBM Plex Mono",
      monospace;
  }
  strong {
    font-weight: 600;
  }
  .track {
    display: block;
    height: 3px;
    background: var(--hf-faint);
    margin-top: 6px;
    width: 64px;
  }
  .track span {
    display: block;
    height: 100%;
    background: var(--hf-accent);
  }
  .failed {
    color: var(--hf-warning);
  }
  .limitations {
    margin: 16px 0;
  }
  .evidence {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .evidence a {
    font-size: 11px;
    border: 1px solid var(--hf-line);
    border-radius: 4px;
    padding: 7px 10px;
    color: var(--hf-ink);
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  details {
    margin-top: 20px;
  }
  summary {
    cursor: pointer;
    font-size: 12px;
    color: var(--hf-muted);
  }
  @media (max-width: 760px) {
    header {
      flex-direction: column;
      align-items: flex-start;
      gap: 16px;
    }
    h2 {
      font-size: 26px;
    }
    .brand {
      max-width: 100%;
      box-sizing: border-box;
    }
    .controls {
      align-items: stretch;
    }
    label,
    .input-options {
      width: 100%;
    }
    .input-options button {
      flex: 1;
    }
    select {
      width: 100%;
    }
  }
</style>
