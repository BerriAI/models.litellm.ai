<script lang="ts">
  import BenchmarkWorkspace from "../BenchmarkWorkspace.svelte";
  import PageHero from "../PageHero.svelte";
  import { sampleReport } from "./sampleReport";
</script>

<main>
  <BenchmarkWorkspace
    report={sampleReport}
    reportIcon="/brand/litellm-monogram-blue-192.png"
  >
    <PageHero
      slot="hero"
      id="sample-report"
      title="SAMPLE REPORT"
      eyebrow="SYNTHETIC EXAMPLE"
      description="Explore the report before running a benchmark. All models, traffic, costs, and scores here are fictional."
    >
      <a href="/evaluate">← Back to Evaluate</a>
    </PageHero>
  </BenchmarkWorkspace>
</main>

<style>
  a {
    color: var(--hf-accent);
    font-size: 13px;
    text-underline-offset: 4px;
  }
</style>
