<script lang="ts">
  import type { BenchmarkReport } from "./types";
  import { allocation } from "./allocation";
  export let report: BenchmarkReport;
  export let qualityFloor = 95;
  $: opportunities = allocation(report, qualityFloor);
  const money = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
</script>

<section class="summary" aria-label="Savings opportunity">
  <div class="summary-heading">
    <h2>
      {opportunities.share > 0
        ? "Where you could save"
        : "Keep your current models for now"}
    </h2>
    <span
      >{report.synthetic ? "FICTIONAL EXAMPLE" : "ESTIMATED OPPORTUNITY"}</span
    >
  </div>
  <div class="summary-body">
    {#if opportunities.share > 0}
      <div class="metrics">
        <div>
          <strong>{opportunities.share.toFixed(0)}%</strong><span
            >of traffic could use a cheaper model</span
          >
        </div>
        <div>
          <strong>{money(opportunities.savings)}<small> / month</small></strong
          ><span>potential savings at your current volume</span>
        </div>
      </div>
    {:else}
      <p>
        No cheaper candidate met the quality requirements with complete
        evidence.
      </p>
    {/if}
    <div class="choices">
      {#each opportunities.choices as choice}
        <div class="choice">
          <span class="workload">{choice.workload}</span>
          <span class="model"
            >{choice.share > 0 ? choice.model : "Keep current model"}</span
          >
          <span class="share"
            >{choice.share > 0
              ? `${choice.share.toFixed(0)}% of traffic`
              : "No qualified alternative"}</span
          >
        </div>
      {/each}
    </div>
  </div>
  <p class="note">
    Candidates must pass at least {qualityFloor}% of checks and match current
    quality. Validate on fresh traffic before switching.
  </p>
</section>

<style>
  .summary {
    margin-bottom: 32px;
    padding: 24px 28px;
    border: 1px solid var(--hf-line);
    background: var(--hf-faint);
  }
  .summary-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  h2 {
    font-size: 18px;
    font-weight: 500;
    margin: 0;
    letter-spacing: -0.3px;
  }
  .summary-heading > span {
    color: var(--hf-muted);
    font:
      9px "IBM Plex Mono",
      monospace;
    letter-spacing: 0.7px;
  }
  .summary-body {
    display: grid;
    grid-template-columns: 1fr 1.1fr;
    gap: 36px;
    align-items: center;
    margin: 20px 0;
  }
  .metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    margin: 0;
  }
  .metrics strong {
    display: block;
    font-size: 42px;
    font-weight: 500;
    line-height: 1.2;
    letter-spacing: -1.5px;
  }
  .metrics small {
    font-size: 17px;
    letter-spacing: -0.3px;
    font-weight: 400;
  }
  .metrics span {
    display: block;
    color: var(--hf-muted);
    font-size: 13px;
    margin-top: 5px;
    line-height: 1.5;
  }
  .choice {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 16px;
    padding: 12px 0;
    border-top: 1px solid var(--hf-line);
    align-items: baseline;
    font-size: 13px;
  }
  .model {
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .share {
    font-size: 12px;
    color: var(--hf-muted);
    text-align: right;
  }
  p {
    color: var(--hf-muted);
    font-size: 13px;
    line-height: 1.6;
  }
  .note {
    margin: 12px 0 0;
    font-size: 12px;
  }
  @media (max-width: 1000px) {
    .summary-body {
      grid-template-columns: 1fr;
      gap: 20px;
    }
  }
  @media (max-width: 600px) {
    .summary {
      padding: 20px;
      margin-bottom: 24px;
    }
    .summary-heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
    }
    .metrics {
      gap: 18px;
    }
    .metrics strong {
      font-size: 34px;
    }
    .metrics small {
      display: block;
      font-size: 13px;
      letter-spacing: 0;
    }
    .metrics span {
      font-size: 12px;
    }
    .choice {
      grid-template-columns: 1fr auto;
      gap: 5px 12px;
    }
    .workload {
      grid-column: 1 / -1;
      font-weight: 500;
    }
    .share {
      font-size: 11px;
    }
  }
</style>
