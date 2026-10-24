<script lang="ts">
  import DiscoveryUpdates from "./DiscoveryUpdates.svelte";
  import BenchmarkWorkspace from "./BenchmarkWorkspace.svelte";
</script>

<BenchmarkWorkspace on:browse>
  <DiscoveryUpdates slot="hero" />
</BenchmarkWorkspace>
