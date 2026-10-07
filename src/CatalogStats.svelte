<script lang="ts">
  /** Catalog stats from build-info.json, shown under the hero. Hidden on the dev server. */
  import { buildInfo, timeAgo } from "./buildInfo";

  const PRICE_FILE_HISTORY = "https://github.com/BerriAI/litellm/commits/main/model_prices_and_context_window.json";

  let displayModelCount = 0;
  let displayListingCount = 0;
  let displayProviderCount = 0;
  let animated = false;

  function animateValue(start: number, end: number, duration: number, setter: (v: number) => void) {
    const startTime = performance.now();
    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setter(Math.round(start + (end - start) * eased));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  $: if ($buildInfo && !animated) {
    animated = true;
    animateValue(0, $buildInfo.models, 800, (v) => (displayModelCount = v));
    animateValue(0, $buildInfo.listings, 800, (v) => (displayListingCount = v));
    animateValue(0, $buildInfo.providers, 600, (v) => (displayProviderCount = v));
  }
</script>

{#if $buildInfo === undefined}
  <div class="stats-section">
    <div class="stats-container">
      {#each [1, 2, 3, 4] as _}
        <div class="stat-card skeleton">
          <div class="skeleton-value"></div>
          <div class="skeleton-label"></div>
        </div>
      {/each}
    </div>
  </div>
{:else if $buildInfo}
  <div class="stats-section">
    <div class="stats-container">
      <a class="stat-card" href="/models">
        <div class="stat-value">{displayModelCount.toLocaleString()}</div>
        <div class="stat-label">Models</div>
      </a>
      <a class="stat-card" href="#query">
        <div class="stat-value">{displayListingCount.toLocaleString()}</div>
        <div class="stat-label">Price listings</div>
      </a>
      <a class="stat-card" href="/models">
        <div class="stat-value">{displayProviderCount.toLocaleString()}</div>
        <div class="stat-label">Providers with pricing</div>
      </a>
      <a class="stat-card" href={PRICE_FILE_HISTORY} target="_blank" rel="noopener noreferrer">
        <div class="stat-value">{timeAgo($buildInfo.priceFileUpdatedAt ?? $buildInfo.builtAt)}</div>
        <div class="stat-label">Prices updated</div>
      </a>
    </div>
  </div>
{/if}

<style>
  /* Statistics Section */
  .stats-section {
    max-width: 1400px;
    margin: 0 auto;
    padding: 1.25rem 2rem;
  }

  .stats-container {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.75rem;
  }

  .stat-card {
    display: block;
    color: inherit;
    text-decoration: none;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    padding: 1rem 0.75rem;
    text-align: center;
    transition: all 0.2s ease;
    cursor: pointer;
    font-family: inherit;
    width: 100%;
  }

  .stat-card:hover {
    border-color: var(--litellm-primary);
    box-shadow: 0 0 0 1px var(--litellm-primary);
    background: var(--bg-color);
  }

  .stat-value {
    font-size: 1.75rem;
    font-weight: 800;
    color: var(--text-color);
    line-height: 1;
    margin-bottom: 0.375rem;
    letter-spacing: -0.03em;
  }

  .stat-label {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--muted-color);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  /* Skeleton loading */
  .stat-card.skeleton {
    cursor: default;
  }

  .skeleton-value {
    width: 60%;
    height: 1.75rem;
    background: var(--border-color);
    border-radius: 6px;
    margin: 0 auto 0.375rem;
    animation: shimmer 1.5s ease-in-out infinite;
  }

  .skeleton-label {
    width: 80%;
    height: 0.6875rem;
    background: var(--border-color);
    border-radius: 4px;
    margin: 0 auto;
    animation: shimmer 1.5s ease-in-out infinite;
    animation-delay: 0.15s;
  }

  @keyframes shimmer {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  /* Responsive */
  @media (max-width: 1024px) {
    .stats-container {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 640px) {
    .stats-section { padding: 1rem; }
    .stats-container {
      grid-template-columns: repeat(2, 1fr);
      gap: 0.5rem;
    }
    .stat-card { padding: 0.75rem 0.5rem; }
    .stat-value { font-size: 1.375rem; }
  }
</style>
