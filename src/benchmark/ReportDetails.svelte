<script lang="ts">
  import type { BenchmarkReport, BenchmarkWorkload } from "./types";
  import { allocation } from "./allocation";
  export let report: BenchmarkReport;
  export let qualityFloor = 95;
  $: opportunities = allocation(report, qualityFloor);
  export let workload: BenchmarkWorkload | undefined;
</script>

<section class="details" aria-label="Evaluation evidence">
  <h2>Your evaluation</h2>
  <div class="coverage">
    <div>
      <strong>{report.population.toLocaleString()}</strong><span
        >requests scanned</span
      >
    </div>
    <div>
      <strong>{report.sampled.toLocaleString()}</strong><span
        >requests sampled</span
      >
    </div>
    <div>
      <strong>{report.eligible.toLocaleString()}</strong><span
        >complete supported requests</span
      >
    </div>
    <div>
      <strong>{report.heldout.toLocaleString()}</strong><span
        >held-out requests</span
      >
    </div>
    <div>
      <strong>${report.evaluationSpend.toFixed(3)}</strong><span
        >evaluation spend{report.costEstimated ? " · estimated" : ""}</span
      >
    </div>
  </div>
  <h3>Explore a workload-based allocation</h3>
  <p>
    {opportunities.share.toFixed(1)}% of scanned traffic has a cheaper candidate
    meeting the {qualityFloor}% observed quality floor without a lower observed
    pass rate than the baseline. Estimated savings: ${opportunities.savings.toFixed(
      2,
    )} / month.
  </p>
  <p>
    This is an exploratory choice made after evaluating these candidates, not a
    validated routing policy. It excludes tool turns and incomplete comparisons;
    confirm the chosen rules on a fresh sample before deployment.
  </p>
  <div class="table-scroll">
    <table>
      <thead
        ><tr
          ><th>Workload</th><th>Candidate to investigate</th><th
            >Estimated traffic share</th
          ></tr
        ></thead
      >
      <tbody
        >{#each opportunities.choices as choice}<tr
            ><td>{choice.workload}</td><td>{choice.model}</td><td
              >{choice.share.toFixed(1)}%</td
            ></tr
          >{/each}</tbody
      >
    </table>
  </div>
  {#if workload}
    <h3>
      {workload.name} · {workload.trafficShare.toFixed(1)}% estimated traffic
      share
    </h3>
    <p>
      {workload.sampledSessions} sampled sessions. {workload.agentTurns
        ? "Recorded tool turns only; session completion was not measured."
        : "Request-level quality assessment."}
    </p>
    <h3>Inferred checks</h3>
    <p>
      Response validity and applicable JSON/tool schemas are checked in code.
      Semantic checks are selected from the development requests:
    </p>
    <ul>
      {#each workload.criteria as criterion}<li>{criterion}</li>{/each}
    </ul>
    <p>
      {workload.calibrated
        ? "The judge rejected a controlled incorrect response. This is a basic discrimination check, not human validation."
        : "No calibrated semantic rubric was available. Semantic quality remains unknown."}
    </p>
    <div class="table-scroll">
      <table>
        <thead
          ><tr
            ><th>Model</th><th>Passed</th><th>Failed</th><th
              >Unknown / pending</th
            ><th>95% descriptive interval</th></tr
          ></thead
        >
        <tbody
          >{#each workload.rows as row}<tr
              ><td>{row.name}</td><td>{row.passed}</td><td>{row.failed}</td><td
                >{row.unknown}</td
              ><td
                >{row.interval
                  ? row.interval.map((n) => n.toFixed(1) + "%").join(" – ")
                  : "Not measured"}</td
              ></tr
            >{/each}</tbody
        >
      </table>
    </div>
  {/if}
  {#if Object.keys(report.exclusions).length}<h3>Excluded from evaluation</h3>
    <ul>
      {#each Object.entries(report.exclusions) as [reason, count]}<li>
          {reason}: {count}
        </li>{/each}
    </ul>{/if}
  <h3>How to use this report</h3>
  <ul>
    {#each report.notices as notice}<li>{notice}</li>{/each}
  </ul>
  <p>
    Judge: {report.judge} · Period: {report.periodDays} days · Sampling seed: {report.seed}
    · {report.development}
    development requests · Report format v{report.version}
  </p>
</section>

<style>
  .details {
    border-top: 1px solid var(--hf-line);
    padding: 28px 0 36px;
    font-size: 13px;
    line-height: 1.65;
  }
  .details h2 {
    font-size: 23px;
    font-weight: 500;
    margin: 0 0 20px;
  }
  .details h3 {
    font-size: 15px;
    font-weight: 500;
    margin-top: 26px;
  }
  .coverage {
    display: flex;
    gap: 30px;
    flex-wrap: wrap;
  }
  .coverage strong {
    font-size: 28px;
    font-weight: 500;
    display: block;
  }
  .coverage span {
    color: var(--hf-muted);
    font-size: 11px;
  }
  p,
  li {
    color: var(--hf-muted);
  }
  li {
    margin: 8px 0;
  }
  .table-scroll {
    overflow: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }
  th,
  td {
    border-bottom: 1px solid var(--hf-line);
    padding: 12px 10px;
    font-weight: 400;
  }
  th {
    color: var(--hf-muted);
    font-size: 11px;
  }
</style>
