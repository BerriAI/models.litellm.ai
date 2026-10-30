<script lang="ts">
  import {
    CONTEXTGEM_FILES,
    CONTEXTGEM_ROOT,
    contextGemRows,
    contextGemSources,
    contextGemLiteLLMRun,
    type ContextGemInput,
    type ContextGemMode,
  } from "./contextgemBenchmarks";
  import { getProviderLogo, getProviderDisplayName } from "./providers";

  let input: ContextGemInput = "pdf";
  let document = "complex_mcu";
  let mode: ContextGemMode = "default";
  $: source = contextGemSources[input];
  $: rows = contextGemRows(input, document, mode);
  $: hasLiteLLMRuns = rows.some((row) => row.publisher === "LiteLLM");
  $: selectedDocument = source.cases.find((item) => item.id === document)?.name;
  $: resultsUrl = `${CONTEXTGEM_FILES}/dev/evals/results/${source.experiment}/summary.md`;
  const number = (value: number | null, digits = 1) =>
    value === null ? "Not provided" : value.toFixed(digits);
  function selectInput(next: ContextGemInput) {
    input = next;
    document = contextGemSources[next].cases[0].id;
  }
</script>

<section class="extraction-results" aria-labelledby="extraction-title">
  <header class="feature-hero">
    <div class="hero-copy">
      <div class="eyebrow">
        <span class="status-dot"></span> THE EXTRACTION SPOTLIGHT
        <span class="edition">01 / CONTEXTGEM</span>
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
      <h2 id="extraction-title">
        Documents in.<br /><span>Structured data out.</span>
      </h2>
      <p>
        Compare how models find the facts,<br class="desktop-break" /> extract the
        values, and cite the source.
      </p>
      <a
        class="framework-link"
        href="https://contextgem.shcherbak.ai/"
        target="_blank"
        rel="noreferrer"
        >Explore ContextGem <span aria-hidden="true">↗</span></a
      >
    </div>
    <div class="workflow" aria-hidden="true">
      <div class="workflow-grid"></div>
      <div class="document-art">
        <span class="file-type">PDF / TXT</span>
        <div class="paper-lines">
          <i></i><i></i><i class="highlight"></i><i class="highlight short"
          ></i><i></i><i class="short"></i>
        </div>
        <span class="paper-caption">UNSTRUCTURED</span>
      </div>
      <span class="connector">······</span>
      <div class="output-art">
        <div class="output-heading">
          <span class="braces">&#123; &#125;</span><span>STRUCTURED OUTPUT</span
          >
        </div>
        <div>
          <span class="output-check">✓</span> Typed values
          <span class="output-kind">extract</span>
        </div>
        <div>
          <span class="output-check">✓</span> Source references
          <span class="output-kind">trace</span>
        </div>
        <div>
          <span class="output-check">✓</span> Justifications
          <span class="output-kind">explain</span>
        </div>
      </div>
      <span class="workflow-caption">THE DOCUMENT IS THE SOURCE OF TRUTH</span>
    </div>
  </header>

  <div class="results-body">
    <div class="results-heading">
      <div>
        <span class="section-label">PUBLIC EXTRACTION EVALS</span>
        <h3>Same document. Different models.</h3>
      </div>
      <a
        class="source-button"
        href={resultsUrl}
        target="_blank"
        rel="noreferrer"
        >View published results <span aria-hidden="true">↗</span></a
      >
    </div>
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
        <select autocomplete="off" bind:value={document}
          >{#each source.cases as item}<option value={item.id}
              >{item.name}</option
            >{/each}</select
        >
      </label>
      <label
        >Model type
        <select autocomplete="off" bind:value={mode}>
          <option value="default">LLMs · full extraction</option>
          <option value="decision_default"
            >Decision models · closed questions</option
          >
        </select>
      </label>
    </div>
    <div class="experiment-line">
      <p class="document-title">{selectedDocument}</p>
      <span
        >{source.label} <span class="separator">/</span>
        ContextGem {source.date}{#if hasLiteLLMRuns}
          + LiteLLM {contextGemLiteLLMRun.date}{/if}</span
      >
    </div>
    <div
      class="model-grid"
      class:expanded={rows.length > 3}
      aria-label="ContextGem extraction results"
    >
      {#each rows as row}
        {@const provider = row.model.split("/")[0]}
        {@const logo = getProviderLogo(provider)}
        <article class="model-card" aria-label={row.model}>
          <div class="model-heading">
            <span class="provider-mark"
              >{#if logo}<img
                  src={logo}
                  width="22"
                  height="22"
                  alt={getProviderDisplayName(provider)}
                />{:else}<span aria-hidden="true"
                  >{provider.slice(0, 1).toUpperCase()}</span
                >{/if}</span
            >
            <div>
              <h4>{row.model.split("/").slice(1).join("/")}</h4>
              <span class="provider-name"
                >{getProviderDisplayName(provider)}</span
              >
            </div>
            <span class="trial-count"
              >{row.runs} {row.runs === 1 ? "run" : "runs"}</span
            >
          </div>
          <div class="result-source">
            <span
              class="source-badge"
              class:independent={row.publisher === "LiteLLM"}
            >
              {row.publisher === "LiteLLM"
                ? "LiteLLM-run"
                : "ContextGem-published"}
            </span>
            <time datetime={row.date}>{row.date}</time>
          </div>
          <div class="primary-metric">
            <span>Aspect F1 <span class="metric-direction">/ 1.000</span></span
            ><strong>{number(row.aspectF1, 3)}</strong>
          </div>
          <div class="score-track" aria-hidden="true">
            <span style:width={`${(row.aspectF1 ?? 0) * 100}%`}></span>
          </div>
          <dl class="supporting-metrics">
            <div>
              <dt>
                {mode === "default"
                  ? "Typed concepts correct"
                  : "Closed concepts correct"}
              </dt>
              <dd>
                {number(mode === "default" ? row.concepts : row.closedConcepts)}
                <span
                  >/ {mode === "default"
                    ? row.totalConcepts
                    : row.totalClosedConcepts}</span
                >
              </dd>
            </div>
            {#if mode === "default"}<div>
                <dt>Reference F1</dt>
                <dd>{number(row.referenceF1, 3)}</dd>
              </div>{/if}
          </dl>
          <div class="run-metrics">
            <div>
              <span>Extraction time</span><strong
                >{number(row.seconds)}<small>s</small></strong
              >
            </div>
            <div>
              <span>API cost / run</span><strong>${number(row.cost, 4)}</strong>
            </div>
          </div>
          <div class="run-status" class:failed={row.failures > 0}>
            <span class="status-dot"></span><span class="failure-count"
              >{row.failures} / {row.runs}</span
            >
            failed runs <span class="mean-label">Means include failures</span>
          </div>
          <div class="card-evidence">
            <a href={row.evidenceUrl} target="_blank" rel="noreferrer">
              {row.publisher === "LiteLLM"
                ? "View raw runs"
                : "View upstream runs"} ↗
            </a>
          </div>
        </article>
      {/each}
    </div>
    <div class="result-context">
      <p>
        {#if input === "pdf"}Born-digital PDFs via Docling, not scanned OCR.
          Conversion time and cost excluded{:else}Prepared document text. This
          does not measure PDF parsing or OCR{/if}
      </p>
      <div class="evidence">
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
    </div>
    <footer>
      <p>
        <strong
          >{hasLiteLLMRuns
            ? "Published snapshots + independent LiteLLM runs."
            : "ContextGem-reported results."}</strong
        > Small synthetic evals, not a model ranking. AI-reviewed reference answers,
        not human-verified
      </p>
      {#if hasLiteLLMRuns}
        <p class="comparison-note">
          Same PDF cases and scorer, different run dates and prompt revisions.
          These are not a controlled head-to-head comparison
        </p>
      {/if}
      <details>
        <summary>Methodology and attribution</summary>
        <div class="methodology">
          <p>
            Scores describe ContextGem + model, averaged across the reported
            runs, including failures. Aspect F1 scores selected paragraphs;
            reference F1 scores source grounding. Typed concepts use exact
            matching of values or object identities. String values,
            justifications and object text fields are judged separately upstream
            and are not part of the typed-concept count shown here. F1 ranges
            from 0 to 1
          </p>
          <p>
            Decision models answer Boolean, label and rating questions only,
            without open-ended values or concept references. They are shown
            separately because their work and concept denominators differ from
            LLMs. Aspect questions can favor models that read the whole document
          </p>
          <p>
            Costs include retries and observed cache behavior, exclude judge and
            conversion costs, and are historical estimates, not current API
            prices. A single run does not establish a reliable model comparison.
            PDF and text experiments use different ContextGem revisions and must
            not be treated as a controlled input-only comparison
          </p>
          <p>
            ContextGem-published cards are from Shcherbak AI / Sergii Shcherbak;
            republished as attributed snapshots, not independently rerun by
            LiteLLM. LiteLLM-run cards are separate live runs on the dates
            shown, using the pinned ContextGem harness and committed
            PDF-to-Docling artifacts. Their raw outputs, versions, file hashes
            and reproduction commands are linked below. No LLM judge was run for
            the LiteLLM results; the displayed metrics use the offline scorer.
            ContextGem branding identifies the framework, not an endorsement.
            The header diagram illustrates the framework, not a particular
            extraction result
          </p>
          <div class="evidence">
            <a
              href={`${contextGemLiteLLMRun.root}/manifest.json`}
              target="_blank"
              rel="noreferrer">LiteLLM run provenance ↗</a
            >
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
            <a href="/contextgem/LICENSE">Apache 2.0 license</a><a
              href="/contextgem/NOTICE">Copyright and notices</a
            >
          </div>
        </div>
      </details>
    </footer>
  </div>
</section>

<style>
  .extraction-results {
    margin: 30px 0 44px;
    border: 1px solid var(--hf-line);
    border-radius: 18px;
    overflow: hidden;
    background: var(--hf-dialog);
  }
  .feature-hero {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: 28px;
    padding: 36px 40px;
    background: radial-gradient(ellipse at 90% 80%, #0e4146 0%, transparent 58%),
      #0a1c24;
    color: #f0fcfc;
  }
  .eyebrow {
    display: flex;
    align-items: center;
    gap: 8px;
    font:
      9px "IBM Plex Mono",
      monospace;
    letter-spacing: 0.12em;
    color: #97bec3;
  }
  .status-dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }
  .eyebrow .status-dot {
    color: #72e8d4;
  }
  .edition {
    margin-left: auto;
    opacity: 0.6;
  }
  .brand {
    display: inline-block;
    margin: 26px 0 20px;
  }
  .brand img {
    display: block;
    width: 240px;
    height: auto;
    max-width: 100%;
  }
  h2 {
    font:
      600 clamp(30px, 3.3vw, 46px) / 1.12 "DM Sans",
      sans-serif;
    letter-spacing: -0.045em;
    margin: 0;
    color: #f0fcfc;
  }
  h2 span {
    color: #91cec8;
  }
  .hero-copy > p {
    font-size: 13px;
    line-height: 1.7;
    color: #a9c3c9;
    margin: 16px 0 20px;
  }
  .framework-link {
    display: inline-flex;
    gap: 32px;
    align-items: center;
    border: 1px solid #487075;
    background: #ffffff06;
    color: #ddf9f6;
    border-radius: 6px;
    padding: 9px 12px;
    font-size: 11px;
    text-decoration: none;
  }
  .framework-link:hover {
    background: #ffffff10;
    border-color: #8ccec6;
  }
  .workflow {
    position: relative;
    min-height: 260px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
  .workflow-grid {
    position: absolute;
    inset: -20px;
    background-image: radial-gradient(#65b5b13b 0.7px, transparent 0.7px);
    background-size: 16px 16px;
    mask-image: radial-gradient(ellipse, black, transparent 72%);
    pointer-events: none;
  }
  .document-art {
    z-index: 1;
    width: 120px;
    padding: 18px 14px;
    border: 1px solid #597878;
    border-radius: 6px 20px 6px 6px;
    background: #122c35;
    transform: rotate(-7deg);
    box-shadow: 8px 14px 24px #0003;
    flex-shrink: 0;
  }
  .file-type {
    font:
      9px "IBM Plex Mono",
      monospace;
    letter-spacing: 0.1em;
    color: #b8dbdc;
  }
  .paper-lines {
    margin: 22px 0 24px;
  }
  .paper-lines i {
    display: block;
    height: 4px;
    margin: 9px 0;
    background: #39535a;
    border-radius: 1px;
  }
  .paper-lines .highlight {
    background: #6fc6bc;
  }
  .paper-lines .short {
    width: 65%;
  }
  .paper-caption {
    font:
      7px "IBM Plex Mono",
      monospace;
    letter-spacing: 0.08em;
    color: #85a5ad;
  }
  .connector {
    color: #80dacc;
    letter-spacing: 2px;
    font-size: 16px;
  }
  .output-art {
    z-index: 1;
    min-width: 188px;
    border: 1px solid #4a827d;
    padding: 16px;
    background: #14343af2;
    border-radius: 8px;
    box-shadow: 0 12px 40px #0002;
    transform: translateY(16px);
  }
  .output-heading {
    display: flex;
    gap: 12px;
    align-items: center;
    font:
      8px "IBM Plex Mono",
      monospace;
    letter-spacing: 0.08em;
    color: #a2c8c7;
    border-bottom: 1px solid #48716d;
    padding-bottom: 14px;
    margin-bottom: 6px;
  }
  .braces {
    font:
      20px "IBM Plex Mono",
      monospace;
    color: #a6f2db;
  }
  .output-art > div:not(.output-heading) {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 14px;
    font-size: 10px;
    color: #e3f5ef;
  }
  .output-check {
    color: #8cddc7;
  }
  .output-kind {
    margin-left: auto;
    padding-left: 12px;
    font:
      8px "IBM Plex Mono",
      monospace;
    color: #7da4a5;
  }
  .workflow-caption {
    position: absolute;
    bottom: 0;
    width: 100%;
    text-align: center;
    font:
      7px "IBM Plex Mono",
      monospace;
    letter-spacing: 0.16em;
    color: #699c9e;
  }
  .results-body {
    padding: 28px 32px 0;
  }
  .results-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .section-label {
    font:
      9px "IBM Plex Mono",
      monospace;
    letter-spacing: 0.1em;
    color: var(--hf-muted);
  }
  h3 {
    font:
      600 21px "DM Sans",
      sans-serif;
    letter-spacing: -0.03em;
    margin: 8px 0 0;
  }
  .source-button {
    display: inline-flex;
    align-items: center;
    gap: 20px;
    flex-shrink: 0;
    color: var(--hf-ink);
    border: 1px solid var(--hf-line);
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 11px;
    text-decoration: none;
  }
  .source-button:hover {
    background: var(--hf-bg);
  }
  .controls {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    margin: 26px 0 24px;
  }
  .input-options {
    display: flex;
    padding: 3px;
    border: 1px solid var(--hf-line);
    background: var(--hf-bg);
    border-radius: 7px;
    flex-shrink: 0;
  }
  button {
    padding: 9px 12px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--hf-muted);
    font-size: 11px;
    white-space: nowrap;
  }
  button.active {
    background: var(--hf-dialog);
    border-color: var(--hf-line);
    color: var(--hf-ink);
    box-shadow: 0 1px 3px #00000008;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 7px;
    flex: 1;
    min-width: 0;
    color: var(--hf-muted);
    font-size: 10px;
  }
  select {
    background: var(--hf-dialog);
    color: var(--hf-ink);
    border: 1px solid var(--hf-line);
    border-radius: 6px;
    padding: 10px 28px 10px 10px;
    font-size: 11px;
    width: 100%;
    min-width: 0;
  }
  .experiment-line {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 14px;
  }
  .document-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--hf-ink);
  }
  .experiment-line > span {
    font:
      9px "IBM Plex Mono",
      monospace;
    color: var(--hf-muted);
  }
  .separator {
    padding: 0 6px;
    opacity: 0.4;
  }
  .model-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
    gap: 14px;
  }
  .model-card {
    border: 1px solid var(--hf-line);
    border-radius: 10px;
    overflow: hidden;
    padding: 20px 20px 0;
  }
  .model-grid.expanded {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .model-heading {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .provider-mark {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border: 1px solid var(--hf-line);
    background: var(--hf-bg);
    border-radius: 8px;
  }
  .provider-mark img {
    object-fit: contain;
  }
  .model-heading > div {
    min-width: 0;
  }
  h4 {
    margin: 0 0 4px;
    font-size: 13px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .provider-name {
    font-size: 10px;
    color: var(--hf-muted);
  }
  .trial-count {
    flex-shrink: 0;
    margin-left: auto;
    align-self: flex-start;
    font:
      8px "IBM Plex Mono",
      monospace;
    padding: 4px 6px;
    border: 1px solid var(--hf-line);
    border-radius: 4px;
    color: var(--hf-muted);
  }
  .primary-metric {
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .primary-metric > span {
    font-size: 10px;
    color: var(--hf-muted);
  }
  .metric-direction {
    float: right;
    font:
      9px "IBM Plex Mono",
      monospace;
    opacity: 0.7;
  }
  .primary-metric strong {
    font:
      500 42px/1.05 "DM Sans",
      sans-serif;
    letter-spacing: -0.06em;
    font-variant-numeric: tabular-nums;
  }
  .score-track {
    height: 4px;
    background: var(--hf-line);
    border-radius: 2px;
    margin: 12px 0 22px;
    overflow: hidden;
  }
  .score-track > span {
    display: block;
    height: 100%;
    background: #3ca99b;
    border-radius: inherit;
  }
  .supporting-metrics {
    margin: 0 0 18px;
  }
  .supporting-metrics > div {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: baseline;
    margin-top: 10px;
  }
  dt {
    font-size: 11px;
    color: var(--hf-muted);
  }
  dd {
    font-size: 13px;
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  dd span {
    color: var(--hf-muted);
  }
  .run-metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-top: 1px solid var(--hf-line);
    padding: 16px 0;
    gap: 12px;
  }
  .run-metrics > div {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .run-metrics span {
    font-size: 10px;
    color: var(--hf-muted);
  }
  .run-metrics strong {
    font-size: 16px;
    font-weight: 500;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
  }
  .run-metrics small {
    font-size: 11px;
    color: var(--hf-muted);
    margin-left: 2px;
  }
  .run-status {
    margin: 0 -20px;
    padding: 10px 20px;
    background: var(--hf-bg);
    border-top: 1px solid var(--hf-line);
    color: var(--hf-muted);
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 9px;
    flex-wrap: wrap;
  }
  .run-status.failed {
    color: var(--hf-warning);
  }
  .result-source {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
    font-size: 9px;
    color: var(--hf-muted);
  }
  .source-badge {
    padding: 4px 6px;
    border: 1px solid var(--hf-line);
    border-radius: 4px;
  }
  .source-badge.independent {
    border-color: #3ca99b;
    color: var(--hf-ink);
  }
  .card-evidence {
    margin: 0 -20px;
    padding: 10px 20px;
    border-top: 1px solid var(--hf-line);
  }
  .card-evidence a {
    display: inline-block;
    padding: 6px 8px;
    border: 1px solid var(--hf-line);
    border-radius: 4px;
    font-size: 10px;
    color: var(--hf-ink);
    text-decoration: none;
  }
  .card-evidence a:hover {
    background: var(--hf-bg);
  }
  footer .comparison-note {
    margin-top: 8px;
  }
  .mean-label {
    margin-left: auto;
    color: var(--hf-muted);
    font-size: 8px;
  }
  .result-context {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 16px 0 22px;
  }
  .result-context p {
    font-size: 10px;
    color: var(--hf-muted);
    margin: 0;
    line-height: 1.6;
    max-width: 360px;
  }
  .evidence {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .evidence a {
    font-size: 10px;
    color: var(--hf-ink);
    border: 1px solid var(--hf-line);
    border-radius: 5px;
    padding: 7px 9px;
    text-decoration: none;
  }
  .evidence a:hover {
    background: var(--hf-bg);
    border-color: var(--hf-muted);
  }
  footer {
    border-top: 1px solid var(--hf-line);
    padding: 16px 0;
  }
  footer > p {
    margin: 0 0 12px;
    color: var(--hf-muted);
    font-size: 10px;
    line-height: 1.7;
  }
  footer strong {
    font-weight: 500;
    color: var(--hf-ink);
  }
  summary {
    cursor: pointer;
    font-size: 10px;
    color: var(--hf-muted);
    width: fit-content;
  }
  .methodology {
    max-width: 820px;
  }
  .methodology p {
    color: var(--hf-muted);
    font-size: 11px;
    line-height: 1.8;
  }
  a:focus-visible,
  button:focus-visible,
  select:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--hf-accent);
    outline-offset: 3px;
  }
  @media (max-width: 1100px) {
    .feature-hero {
      padding: 32px;
      grid-template-columns: 1fr 0.9fr;
      gap: 16px;
    }
    .document-art {
      width: 90px;
    }
    .output-art {
      min-width: 156px;
      padding: 12px;
    }
    .output-kind {
      display: none;
    }
    .edition {
      display: none;
    }
  }
  @media (max-width: 800px) {
    .feature-hero {
      grid-template-columns: 1fr;
      padding: 30px 24px;
    }
    .workflow {
      display: none;
    }
    .hero-copy > p {
      max-width: 320px;
    }
    .desktop-break {
      display: none;
    }
    .controls {
      flex-wrap: wrap;
    }
    .input-options {
      width: 100%;
      box-sizing: border-box;
    }
    .input-options button {
      flex: 1;
    }
    .results-body {
      padding: 24px 22px 0;
    }
    .results-heading {
      align-items: flex-start;
    }
    .source-button {
      font-size: 10px;
      padding: 8px;
      gap: 8px;
    }
    h3 {
      font-size: 19px;
    }
  }
  @media (max-width: 520px) {
    .extraction-results {
      margin: 20px 0 30px;
      border-radius: 12px;
    }
    h2 {
      font-size: 34px;
    }
    .brand {
      margin: 24px 0 20px;
    }
    .brand img {
      width: 216px;
    }
    .results-heading {
      flex-direction: column;
      gap: 16px;
    }
    .results-body {
      padding: 22px 16px 0;
    }
    .controls {
      gap: 14px;
      margin: 22px 0;
    }
    label {
      flex: 1 1 100%;
    }
    select {
      font-size: 12px;
      padding: 12px;
    }
    .model-grid,
    .model-grid.expanded {
      grid-template-columns: 1fr;
    }
    .model-heading h4 {
      font-size: 13px;
    }
    .model-card {
      padding-top: 18px;
    }
    .experiment-line {
      flex-direction: column;
    }
    .result-context {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
