<script lang="ts">
  export let id: string;
  export let title: string;
  export let description: string;
  export let variant:
    | "models"
    | "providers"
    | "benchmarks"
    | "changelog"
    | "guides"
    | "guardrails"
    | undefined = undefined;
  $: artwork =
    variant ??
    (id === "cookbook" ? "guides" : id === "discover" ? "benchmarks" : id);
</script>

<section class="page-hero" aria-labelledby={`${id}-title`}>
  <div class="hero-copy">
    <h1 id={`${id}-title`}>{title}</h1>
    <p>{description}</p>
    {#if $$slots.default}<div class="hero-actions"><slot /></div>{/if}
  </div>
  <svg
    class="blueprint"
    data-artwork={artwork}
    viewBox="0 0 360 220"
    fill="none"
    aria-hidden="true"
  >
    <defs
      ><pattern
        id={`${id}-grid`}
        width="32"
        height="32"
        patternUnits="userSpaceOnUse"
        ><path d="M32 0H0V32" class="grid" /></pattern
      ></defs
    >
    <rect x="20" y="14" width="320" height="192" fill={`url(#${id}-grid)`} />
    <g class="drawing">
      {#if artwork === "models"}
        <rect class="surface" x="66" y="35" width="228" height="150" rx="8" />
        <path
          d="M66 70h228M66 108h228M66 146h228M208 70v115"
          class="secondary"
        />
        <path
          d="M88 52h72M88 89h92M88 127h66M88 165h80M230 89h40M230 127h40M230 165h40"
        />
        <circle cx="268" cy="52" r="3" class="point" />
      {:else if artwork === "providers"}
        <path
          class="secondary"
          d="M114 57h30v106h-30M246 57h-30v106h30M144 110h72"
        />
        <rect class="surface" x="44" y="34" width="70" height="46" rx="7" />
        <rect class="surface" x="44" y="140" width="70" height="46" rx="7" />
        <rect class="surface" x="246" y="34" width="70" height="46" rx="7" />
        <rect class="surface" x="246" y="140" width="70" height="46" rx="7" />
        <rect class="surface" x="151" y="81" width="58" height="58" rx="10" />
        <path
          d="m170 101-9 9 9 9m20-18 9 9-9 9M68 57h22M68 163h22M270 57h22M270 163h22"
        />
      {:else if artwork === "changelog"}
        <path class="secondary" d="M80 42v136M88 52h30M88 110h30M88 168h30" />
        <circle class="surface" cx="80" cy="52" r="7" />
        <circle class="surface" cx="80" cy="110" r="7" />
        <circle class="surface" cx="80" cy="168" r="7" />
        <rect class="surface" x="118" y="32" width="168" height="40" rx="6" />
        <rect class="surface" x="118" y="90" width="168" height="40" rx="6" />
        <rect class="surface" x="118" y="148" width="168" height="40" rx="6" />
        <path
          d="M139 52h14m-7-7v14M139 106l7 8 7-8M139 168h14M174 52h88M174 110h62M174 168h76"
        />
      {:else if artwork === "guides"}
        <path
          class="surface"
          d="M58 47h84q22 0 38 16 16-16 38-16h84v126h-84q-22 0-38 16-16-16-38-16H58Z"
        />
        <path d="M180 63v126" />
        <path
          class="secondary"
          d="M82 79h63M82 103h63M82 127h42M215 79h63M215 103h63M215 127h42"
        />
      {:else if artwork === "guardrails"}
        <path class="secondary" d="M44 110h70m132 0h70m-9-7 9 7-9 7" />
        <path class="surface" d="m180 28 66 26v57q0 50-66 83-66-33-66-83V54Z" />
        <path d="m151 109 20 20 39-43" />
      {:else}
        <path class="secondary" d="M64 41v143h238M64 88h238M64 136h238" />
        <rect class="surface" x="92" y="120" width="44" height="64" rx="3" />
        <rect class="surface" x="166" y="82" width="44" height="102" rx="3" />
        <rect class="surface" x="240" y="44" width="44" height="140" rx="3" />
        <path d="M92 120h44M166 82h44M240 44h44" />
      {/if}
    </g>
  </svg>
</section>

<style>
  .page-hero {
    min-height: 280px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 390px;
    gap: 30px;
    align-items: start;
    padding: 40px 0 32px;
    color: var(--hf-ink);
  }
  .hero-copy {
    min-width: 0;
  }
  h1 {
    font:
      600 96px/0.9 "Barlow Condensed",
      Impact,
      sans-serif;
    letter-spacing: -2px;
    margin: 0 0 20px;
  }
  p {
    font-size: 17px;
    margin: 0;
    letter-spacing: -0.3px;
    max-width: 520px;
  }
  .hero-actions {
    margin-top: 22px;
  }
  .blueprint {
    width: 100%;
    height: 208px;
    color: var(--hf-accent);
  }
  .grid {
    stroke: currentColor;
    stroke-width: 0.7;
    opacity: 0.09;
  }
  .drawing {
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .surface {
    fill: var(--hf-bg);
  }
  .secondary {
    opacity: 0.3;
  }
  .point {
    fill: currentColor;
    stroke: none;
  }
  @media (max-width: 1100px) {
    .page-hero {
      grid-template-columns: minmax(0, 1fr) 300px;
    }
    h1 {
      font-size: 81px;
    }
  }
  @media (max-width: 800px) {
    .page-hero {
      grid-template-columns: minmax(0, 1fr) 230px;
      gap: 10px;
    }
    h1 {
      font-size: 68px;
    }
    p {
      font-size: 14px;
    }
  }
  @media (max-width: 640px) {
    .page-hero {
      display: block;
      position: relative;
      overflow: hidden;
      min-height: 208px;
      padding: 32px 0;
    }
    .hero-copy {
      position: relative;
      z-index: 1;
    }
    h1 {
      font-size: clamp(52px, 10.6vw, 68px);
      letter-spacing: -1px;
    }
    p {
      font-size: 14px;
      max-width: 320px;
    }
    .blueprint {
      position: absolute;
      right: -70px;
      top: 23px;
      width: 235px;
      opacity: 0.14;
      z-index: 0;
    }
  }
</style>
