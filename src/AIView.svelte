<script lang="ts">
  import { viewLabel, type AnswerView } from "./aiViews";
  import { track } from "./analytics";
  export let view: AnswerView;
  export let trackEvent = track;
  let selected = 0;
  const number = (n: number) =>
    n.toLocaleString("en-US", { maximumSignificantDigits: 5 });
  const tokens = (n: number) =>
    n >= 1e6
      ? `${number(n / 1e6)}M`
      : n >= 1000
        ? `${number(n / 1000)}K`
        : number(n);
  $: series = view.type === "model_cards" ? [] : view.series;
  $: points = series[selected]?.points ?? [];
  $: showLabels = points.some((p) => p.label !== String(p.xValue));
  $: values = points.flatMap((p) => (p.y === null ? [] : [p.y]));
  $: low = Math.min(0, ...values);
  $: high = Math.max(0, ...values);
  $: span = high - low || 1;
  $: minX = Math.min(...points.map((p) => p.x));
  $: maxX = Math.max(...points.map((p) => p.x));
  $: spanX = maxX - minX || 1;
  $: path = points
    .map((p, i) =>
      p.y === null
        ? ""
        : `${i === 0 || points[i - 1].y === null ? "M" : "L"}${42 + ((p.x - minX) / spanX) * 300},${170 - ((p.y - low) / span) * 140}`,
    )
    .join(" ");
</script>

{#if view.type === "model_cards"}
  <div class="ai-model-cards" aria-label={view.title}>
    {#each view.models as model}
      <section class="ai-model-card">
        <div class="card-heading">
          <div>
            <h3>
              <a
                href={model.href}
                on:click={() =>
                  trackEvent("AI Model Opened", { model_id: model.id })}
                >{model.name}</a
              >
            </h3>
            <p>{model.provider}</p>
          </div>
          <span aria-hidden="true">↗</span>
        </div>
        <dl>
          <div>
            <dt>Input</dt>
            <dd>{model.input === "—" ? "Unknown" : model.input}</dd>
          </div>
          <div>
            <dt>Output</dt>
            <dd>{model.output === "—" ? "Unknown" : model.output}</dd>
          </div>
        </dl>
        <div class="card-meta">
          <span
            >{model.context === null
              ? "Input context unknown"
              : `${tokens(model.context)} input context`}</span
          >
        </div>
        {#if model.capabilities.length}
          <details
            class="capabilities"
            on:toggle={(event) => {
              if (event.currentTarget.open)
                trackEvent("AI Model Capabilities Opened", {
                  model_id: model.id,
                });
            }}
          >
            <summary>{model.capabilities.length} reported capabilities</summary>
            <dl>
              {#each model.capabilities as capability}<div>
                  <dt>{capability.label}</dt>
                  <dd>{capability.supported ? "Yes" : "No"}</dd>
                </div>{/each}
            </dl>
            <p class="view-note">Unlisted capabilities are unknown.</p>
          </details>
        {:else}<p class="view-note">No capabilities reported.</p>{/if}
      </section>
    {/each}
  </div>
  <p class="view-note">
    Listed base rates. Pricing tiers and other charges may apply.
  </p>
{:else}
  <figure class="ai-chart">
    <figcaption>{view.title}</figcaption>
    <div class="chart-head">
      <span>{view.yLabel}</span>{#if series.length > 1}<div
          class="series"
          aria-label="Chart measure"
        >
          {#each series as item, index}<button
              type="button"
              aria-pressed={selected === index}
              on:click={() => {
                selected = index;
                trackEvent("AI Chart Measure Changed", {
                  chart_type: view.type,
                  series_index: index,
                });
              }}>{viewLabel(item.name)}</button
            >{/each}
        </div>{/if}
    </div>
    {#if view.type === "bar"}
      <div
        class="bars"
        role="img"
        aria-label={`${view.title}. ${view.xLabel}; ${view.yLabel}. Values are available below.`}
      >
        {#each points as point}
          <div class="bar-row">
            <div class="bar-label">
              <span>{point.label}</span><span
                >{point.y === null ? "Unknown" : number(point.y)}</span
              >
            </div>
            <div class="bar-track">
              <i class="zero" style:left={`${(-low / span) * 100}%`}
              ></i>{#if point.y !== null}<i
                  class="bar"
                  style:left={`${((Math.min(point.y, 0) - low) / span) * 100}%`}
                  style:width={`${(Math.abs(point.y) / span) * 100}%`}
                ></i>{/if}
            </div>
          </div>
        {/each}
        <div class="axis">
          <span>{number(low)}</span><span>{number(high)}</span>
        </div>
      </div>
    {:else}
      <svg
        class="plot"
        viewBox="0 0 370 200"
        role="img"
        aria-label={`${view.title}. ${view.xLabel}; ${view.yLabel}. Values are available below.`}
      >
        <path class="grid" d="M42 30H342M42 100H342M42 170H342" />
        <text x="36" y="34" text-anchor="end">{number(high)}</text><text
          x="36"
          y="174"
          text-anchor="end">{number(low)}</text
        >
        {#if view.type === "line"}<path class="line" d={path} />{/if}
        {#each points as point}{#if point.y !== null}<circle
              cx={42 + ((point.x - minX) / spanX) * 300}
              cy={170 - ((point.y - low) / span) * 140}
              r="3"><title>{point.label}: {number(point.y)}</title></circle
            >{/if}{/each}
        <text x="42" y="190"
          >{view.type === "line" ? points[0]?.xValue : number(minX)}</text
        ><text x="342" y="190" text-anchor="end"
          >{view.type === "line" ? points.at(-1)?.xValue : number(maxX)}</text
        >
      </svg>
    {/if}
    <p class="x-label">{view.xLabel}</p>
    {#if points.some((p) => p.y === null)}<p class="view-note">
        Missing values are unknown; no value is plotted.
      </p>{/if}
    {#if view.hasMore}<p class="view-note">
        Showing this page of results. More results are available.
      </p>{/if}
    <details
      on:toggle={(event) => {
        if (event.currentTarget.open)
          trackEvent("AI Chart Data Opened", { chart_type: view.type });
      }}
    >
      <summary>View data</summary>
      <div class="data-scroll">
        <table>
          <thead
            ><tr
              >{#if showLabels}<th>Label</th>{/if}<th>{view.xLabel}</th
              >{#each series as item}<th>{viewLabel(item.name)}</th>{/each}</tr
            ></thead
          ><tbody
            >{#each points as point, index}<tr
                >{#if showLabels}<td>{point.label}</td>{/if}<td
                  >{point.xValue}</td
                >{#each series as item}<td
                    >{item.points[index].y === null
                      ? "Unknown"
                      : number(item.points[index].y ?? 0)}</td
                  >{/each}</tr
              >{/each}</tbody
          >
        </table>
      </div>
    </details>
  </figure>
{/if}

<style>
  .ai-model-cards {
    display: grid;
    align-items: start;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 270px), 1fr));
    gap: 12px;
    margin: 18px 0 12px;
  }
  .ai-model-card {
    border: 1px solid var(--hf-line);
    border-radius: 7px;
    padding: 17px;
    min-width: 0;
  }
  .card-heading {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  .card-heading > span {
    color: var(--hf-muted);
  }
  h3 {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.5;
    margin: 0;
    overflow-wrap: anywhere;
  }
  h3 a {
    color: inherit;
    text-decoration: none;
  }
  h3 a:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .card-heading p {
    font-size: 11px;
    color: var(--hf-muted);
    margin: 3px 0 0;
  }
  dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 18px 0 14px;
  }
  dt {
    font-size: 10px;
    color: var(--hf-muted);
    margin-bottom: 3px;
  }
  dd {
    font-size: 17px;
    font-variant-numeric: tabular-nums;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 13px;
    border-top: 1px solid var(--hf-line);
    padding-top: 11px;
    font-size: 11px;
    color: var(--hf-muted);
  }
  .view-note {
    font-size: 11px;
    color: var(--hf-muted);
    line-height: 1.6;
    margin: 12px 0;
  }
  .ai-chart {
    border: 1px solid var(--hf-line);
    border-radius: 7px;
    padding: 18px 17px;
    margin: 18px 0 12px;
  }
  figcaption {
    font-size: 13px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .chart-head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-size: 10px;
    color: var(--hf-muted);
    margin: 8px 0 24px;
  }
  .series {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    border: 1px solid var(--hf-line);
    padding: 2px;
    border-radius: 5px;
  }
  .series button {
    color: inherit;
    font: inherit;
    cursor: pointer;
    border: 0;
    background: none;
    border-radius: 3px;
    padding: 3px 7px;
  }
  .series button[aria-pressed="true"] {
    background: var(--hf-bg);
    color: var(--hf-ink);
  }
  button:focus-visible,
  a:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--hf-ink);
    outline-offset: 3px;
  }
  .bar-row {
    margin-bottom: 16px;
  }
  .bar-label {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 11px;
    margin-bottom: 7px;
    overflow-wrap: anywhere;
  }
  .bar-label span:last-child {
    font-variant-numeric: tabular-nums;
    color: var(--hf-muted);
    flex-shrink: 0;
  }
  .bar-track {
    position: relative;
    height: 13px;
    background: repeating-linear-gradient(
      to right,
      transparent 0,
      transparent calc(25% - 1px),
      var(--hf-line) 25%
    );
  }
  .bar {
    position: absolute;
    height: 13px;
    background: var(--hf-accent);
    opacity: 0.8;
    border-radius: 2px;
  }
  .zero {
    position: absolute;
    width: 1px;
    height: 13px;
    background: var(--hf-line);
  }
  .axis {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--hf-muted);
  }
  .x-label {
    font-size: 10px;
    color: var(--hf-muted);
    text-align: center;
    margin: 10px 0;
  }
  .plot {
    width: 100%;
    height: auto;
    overflow: visible;
  }
  .plot text {
    fill: var(--hf-muted);
    font-size: 9px;
  }
  .plot circle {
    fill: var(--hf-accent);
  }
  .grid {
    fill: none;
    stroke: var(--hf-line);
    stroke-width: 1;
  }
  .line {
    fill: none;
    stroke: var(--hf-accent);
    stroke-width: 2;
  }
  details {
    margin-top: 16px;
    font-size: 11px;
  }
  summary {
    cursor: pointer;
    color: var(--hf-muted);
    width: fit-content;
  }
  .data-scroll {
    overflow-x: auto;
  }
  table {
    font-size: 11px;
    line-height: 1.5;
    border-collapse: collapse;
    text-align: left;
    width: 100%;
    margin-top: 12px;
  }
  th,
  td {
    padding: 8px 7px;
    border-bottom: 1px solid var(--hf-line);
  }
  th {
    font-weight: 500;
    color: var(--hf-muted);
  }
  .capabilities {
    border-top: 1px solid var(--hf-line);
    padding-top: 11px;
    margin-top: 11px;
  }
  .capabilities dl {
    display: block;
    margin: 12px 0 0;
  }
  .capabilities dl div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 5px 0;
  }
  .capabilities dt,
  .capabilities dd {
    font-size: 11px;
    margin: 0;
  }
  .capabilities dd {
    color: var(--hf-ink);
  }
</style>
