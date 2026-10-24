<script lang="ts">
  import BenchmarkWorkspace from "../BenchmarkWorkspace.svelte";
  import { sampleReport } from "./sampleReport";
</script>

<main>
  <BenchmarkWorkspace
    report={sampleReport}
    showRunLink
    reportIcon="/brand/litellm-monogram-blue-192.png"
  />
</main>
