<script lang="ts">
  import DiscoveryUpdates from "./DiscoveryUpdates.svelte";
  import CodingBenchmarks from "./CodingBenchmarks.svelte";
  import BenchmarkWorkspace from "./BenchmarkWorkspace.svelte";
</script>

<BenchmarkWorkspace on:browse>
  <svelte:fragment slot="hero">
    <DiscoveryUpdates />
    <CodingBenchmarks embedded />
  </svelte:fragment>
</BenchmarkWorkspace>
