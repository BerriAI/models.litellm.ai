<script lang="ts">
  export let id: string;
  export let dense = false;
  export let title: string;
  export let description: string;
  export let diagramLabels: [string, string, string] = [
    "QUALITY",
    "SPEED",
    "COST",
  ];
  export let diagramCaption = "EVAL / COMPARE / ROUTE";
  export let variant:
    | "discover"
    | "models"
    | "providers"
    | "guides"
    | "guardrails"
    | undefined = undefined;
  $: artwork =
    variant ??
    (id === "models"
      ? "models"
      : id === "providers"
        ? "providers"
        : id === "cookbook"
          ? "guides"
          : id === "guardrails"
            ? "guardrails"
            : "discover");
</script>

<section class="page-hero" class:dense aria-labelledby={`${id}-title`}>
  <div class="hero-copy">
    <h1 id={`${id}-title`}>{title}</h1>
    <p>{description}</p>
    {#if $$slots.default}<div class="hero-actions"><slot /></div>{/if}
  </div>
  <svg
    class="blueprint"
    data-artwork={artwork}
    viewBox="0 0 410 240"
    fill="none"
    aria-hidden="true"
  >
    {#if artwork === "models"}
      <path
        class="guide"
        d="M35 177 199 232 382 166M43 49 224 5 385 92M44 49v128M385 92v74M224 5v28"
      />
      <path
        class="cross"
        d="M36 49h16M44 41v16M377 166h16M385 158v16M216 5h16"
      />
      <path
        class="wire bright"
        d="M66 78 225 25 354 94 195 147ZM66 78v12l129 69 159-53V94M195 147v12"
      />
      <path
        class="wire"
        d="M66 108v10l129 69 159-53v-10M66 108 195 177 354 124M195 177v10M66 137v10l129 69 159-53v-10M66 137 195 206 354 153M195 206v10"
      />
      <path
        class="grid-line"
        d="M92 87 251 34M113 98 272 45M135 110 294 57M157 122 316 69M180 135 339 82M119 60 248 129M172 43 301 112"
      />
      <path class="wire bright" d="m111 72 38-13 20 11-38 13Z" />
      <path class="wire" d="m153 95 38-13m-16 24 66-22m-44 34 66-22" />
      <path class="guide" d="M318 49V26h52M84 130H29M266 199v24h88" />
      <circle cx="318" cy="49" r="2.5" fill="currentColor" />
      <text x="300" y="21">CATALOG</text><text x="17" y="124">INDEX</text><text
        x="286"
        y="218">COMPARE</text
      >
      <text x="134" y="236" class="coordinate">MODELS / CONTEXT / PRICING</text>
    {:else if artwork === "providers"}
      <path
        class="guide"
        d="M48 72 197 16 362 89 300 208 88 204ZM48 72 300 208M197 16 88 204M362 89 88 204"
      />
      <path
        class="wire bright"
        d="M161 104 204 82 247 104 204 126ZM161 104v42l43 22 43-22v-42M204 126v42"
      />
      <path
        class="grid-line"
        d="M172 111v41M183 116v42M225 115v42M236 110v42M161 125l43 22 43-22"
      />
      <path
        class="wire bright"
        d="M161 115h-42L72 83M204 82V58l15-15M247 115h43l42-32M237 150l38 31M172 151l-50 34"
      />
      <path
        class="wire"
        d="M40 65 62 54 84 65v24L62 100 40 89ZM40 65 62 76 84 65M62 76v24M197 25 219 14 241 25v24l-22 11-22-11ZM197 25l22 11 22-11M219 36v24M319 64l22-11 22 11v24l-22 11-22-11ZM319 64l22 11 22-11M341 75v24M85 181l22-11 22 11v24l-22 11-22-11ZM85 181l22 11 22-11M107 192v24M264 180l22-11 22 11v24l-22 11-22-11ZM264 180l22 11 22-11M286 191v24"
      />
      <circle cx="119" cy="115" r="2.5" fill="currentColor" /><circle
        cx="290"
        cy="115"
        r="2.5"
        fill="currentColor"
      />
      <path class="guide" d="M204 168v26M247 104h49V31" />
      <text x="176" y="207">GATEWAY</text><text x="267" y="24">PROVIDERS</text
      ><text x="19" y="127">ONE API</text>
      <text x="135" y="235" class="coordinate">CONNECT / ROUTE / SCALE</text>
    {:else if artwork === "guides"}
      <path
        class="guide"
        d="M44 175 205 231 366 175M48 48 205 9 362 48M205 9v222"
      />
      <path
        class="wire bright"
        d="M205 70 103 25 65 44v137l102 45 38-19 38 19 102-45V44l-38-19ZM205 70v137M65 44l102 45 38-19 38 19 102-45M167 89v137M243 89v137"
      />
      <path
        class="wire"
        d="M205 70v119l-28 14V85M205 189l28 14V85M65 166l102 45 38-19 38 19 102-45"
      />
      <path
        class="grid-line"
        d="m85 77 62 28m-62-10 62 28m-62-10 62 28m-62-10 43 19m135-45 62-28m-62 46 62-28m-62 46 62-28m-62 46 43-19"
      />
      <path class="wire bright" d="m279 38 15 7v39l-8-7-7 1Z" />
      <text x="23" y="28">TOOLS</text><text x="335" y="28">GUIDES</text>
      <text x="138" y="238" class="coordinate">LEARN / CONNECT / SHIP</text>
    {:else if artwork === "guardrails"}
      <path
        class="guide"
        d="M204 8 300 47v95q0 60-96 96-96-36-96-96V47ZM55 116h300M204 8v230"
      />
      <path class="wire" d="M204 28 278 58v79q0 47-74 81-74-34-74-81V58Z" />
      <path
        class="wire bright"
        d="M204 44 264 68v67q0 37-60 66-60-29-60-66V68Z"
      />
      <path class="wire bright" d="m174 120 21 21 42-47" />
      <path
        class="grid-line"
        d="M144 86h120M144 103h29M144 120h22M144 137h30M154 154h37M215 154h39M243 103h21M235 120h29M222 137h42M163 61v114M245 61v114"
      />
      <path
        class="wire"
        d="M37 108h48v32H37ZM85 124h45M278 124h47M325 108h48v32h-48Z"
      />
      <path class="wire bright" d="m330 124 8 8 16-17M118 119l12 5-12 5" />
      <circle cx="204" cy="28" r="2.5" fill="currentColor" />
      <text x="29" y="97">REQUEST</text><text x="316" y="97">RESPONSE</text>
      <text x="125" y="236" class="coordinate">VALIDATE / FILTER / PROTECT</text
      >
    {:else}
      <defs
        ><pattern
          id={`${id}-hero-grid`}
          width="32"
          height="16"
          patternUnits="userSpaceOnUse"
          ><path
            d="M0 8 16 0 32 8 16 16Z"
            stroke="currentColor"
            stroke-width=".5"
            opacity=".3"
          /></pattern
        ></defs
      >
      <path
        class="guide"
        d="M25 150 204 56 382 150 204 238ZM204 56V238M25 150V69L204 0 382 69V150M25 69 204 162 382 69"
      />
      <path
        class="cross"
        d="M18 69h14M25 62v14M375 69h14M382 62v14M197 5h14M204 0v12M197 230h14M204 223v14"
      />
      <path
        d="M48 154 204 76 360 154 204 232Z"
        fill={`url(#${id}-hero-grid)`}
        stroke="currentColor"
        stroke-opacity=".45"
      />
      <path
        class="wire"
        d="M83 153V111L119 93 155 111V153L119 171Z M83 111 119 129 155 111 M119 129V171"
      />
      <path
        class="wire bright"
        d="M168 176V62L204 44 240 62V176L204 194Z M168 62 204 80 240 62 M204 80V194"
      />
      <path
        class="wire"
        d="M253 153V91L289 73 325 91V153L289 171Z M253 91 289 109 325 91 M289 109V171"
      />
      <path
        class="grid-line"
        d="M168 85 204 103 240 85M168 108 204 126 240 108M168 131 204 149 240 131M168 154 204 172 240 154M180 68V182M192 74V188M216 74V188M228 68V182M83 132 119 150 155 132M253 112 289 130 325 112M253 133 289 151 325 133"
      />
      <path class="guide" d="M204 44V20H272M119 93V66H60M325 124H372" />
      <circle cx="204" cy="44" r="3" fill="currentColor" class="glow" />
      <text x="279" y="23">{diagramLabels[0]}</text><text x="22" y="61"
        >{diagramLabels[1]}</text
      ><text x="348" y="116">{diagramLabels[2]}</text>
      <text x="159" y="224" class="coordinate">{diagramCaption}</text>
    {/if}
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
  .page-hero.dense {
    min-height: 0;
    padding: 28px 0 24px;
  }
  .dense .blueprint {
    height: 164px;
  }
  .dense h1 {
    font-size: clamp(52px, 6vw, 76px);
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
  .blueprint .guide {
    stroke: currentColor;
    stroke-width: 1;
    stroke-dasharray: 2 6;
    opacity: 0.35;
  }
  .blueprint .cross {
    stroke: currentColor;
    opacity: 0.45;
    stroke-width: 1;
  }
  .blueprint .wire {
    stroke: currentColor;
    stroke-width: 1;
    opacity: 0.55;
  }
  .blueprint .bright {
    opacity: 0.95;
  }
  .blueprint .grid-line {
    stroke: currentColor;
    stroke-width: 0.65;
    opacity: 0.35;
  }
  .blueprint text {
    fill: currentColor;
    font:
      8px "IBM Plex Mono",
      monospace;
    letter-spacing: 1px;
    opacity: 0.65;
  }
  .blueprint .coordinate {
    font-size: 6px;
    letter-spacing: 0.6px;
    opacity: 0.45;
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
