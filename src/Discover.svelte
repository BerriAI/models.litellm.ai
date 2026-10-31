<script lang="ts">
  import {
    fieldLabel,
    fieldValue,
    priceDelta,
    type CatalogUpdate,
    updateKinds,
    type UpdateKind,
  } from "./discoveryChangelog";
  import snapshot from "./discoveryChangelog.snapshot.json";
  const updates = snapshot.updates as CatalogUpdate[];
  const providerNames: Record<string, string> = snapshot.providerNames;
  const providerName = (id: string) =>
    providerNames[id] ?? getProviderDisplayName(id);
  let expanded = new Set<string>();
  const startDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: snapshot.timezone,
  }).format(new Date(snapshot.since));
  const snapshotDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: snapshot.timezone,
  }).format(new Date(snapshot.through));
  import { getProviderDisplayName, getProviderLogo } from "./providers";

  let category: UpdateKind | "all" = "all";
  let provider = "all";
  let query = "";
  let visibleCount = 20;
  const providers = [...new Set(updates.map((update) => update.provider))].sort(
    (a, b) => providerName(a).localeCompare(providerName(b)),
  );
  const labels = {
    price: "Price update",
    model: "New listing",
    provider: "New provider",
    capability: "Capability",
    deprecation: "Deprecation",
    metadata: "Catalog update",
  };
  const icons = {
    price: "↗",
    model: "+",
    provider: "◇",
    capability: "✳",
    deprecation: "−",
    metadata: "·",
  };
  const dayLabel = (date: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00Z`));
  $: search = query.trim().toLowerCase();
  $: filtered = updates.filter(
    (update) =>
      (category === "all" || update.kind === category) &&
      (provider === "all" || update.provider === provider) &&
      (!search ||
        [
          update.title,
          update.description,
          providerName(update.provider),
          ...update.entries.flatMap((entry) => [
            entry.name,
            entry.modelId,
            ...entry.changes.map((change) => change.field),
          ]),
        ]
          .join(" ")
          .toLowerCase()
          .includes(search)),
  );
  $: visible = filtered.slice(0, visibleCount);
  $: days = [...new Set(visible.map((update) => update.date))];
  $: groups = days.map((date) => ({
    date,
    updates: visible.filter((update) => update.date === date),
    total: filtered.filter((update) => update.date === date).length,
  }));
  $: shownCount = groups.reduce((sum, group) => sum + group.updates.length, 0);
  function reset() {
    category = "all";
    provider = "all";
    query = "";
    visibleCount = 20;
  }
</script>

<main class="discover-page">
  <section class="changelog-hero" aria-labelledby="changelog-title">
    <div>
      <div class="eyebrow">
        <span class="blue-dot"></span> THE MODEL CHANGELOG
      </div>
      <h1 id="changelog-title">What's changing.</h1>
      <p>
        Price drops. New models. New possibilities.<br class="desktop-break" /> A
        running log of what's changing across the LLM ecosystem.
      </p>
    </div>
    <div class="hero-ledger" aria-hidden="true">
      <div class="ledger-caption">CATALOG / CHANGE STREAM</div>
      <div class="ledger-line"><span>01</span><b>MODEL ADDED</b><i>+</i></div>
      <div class="ledger-line">
        <span>02</span><b>PRICE DECREASED</b><i>↘</i>
      </div>
      <div class="ledger-line">
        <span>03</span><b>PROVIDER ADDED</b><i>◇</i>
      </div>
      <div class="ledger-line faint">
        <span>04</span><b>CAPABILITY UPDATED</b><i>✳</i>
      </div>
      <div class="ledger-bottom">MODELS / PROVIDERS / PRICING</div>
    </div>
  </section>

  <div class="preview-note">
    <span class="preview-badge">CATALOG SNAPSHOT</span><span
      >Verified LiteLLM catalog history through {snapshotDate}. Dates are
      catalog commits (Pacific time), not model launch dates.</span
    >
  </div>

  <nav class="update-filters" aria-label="Filter updates by type">
    {#each updateKinds as kind}
      <button
        type="button"
        class:active={category === kind.id}
        aria-pressed={category === kind.id}
        on:click={() => {
          category = kind.id;
          visibleCount = 20;
        }}
      >
        <span class="filter-icon" aria-hidden="true">{kind.icon}</span
        >{kind.label}
      </button>
    {/each}
  </nav>

  <div class="feed-layout">
    <section class="feed" aria-label="Catalog changelog">
      <div class="feed-toolbar">
        <label class="search-field">
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
            ><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg
          >
          <input
            type="search"
            bind:value={query}
            on:input={() => (visibleCount = 20)}
            aria-label="Search updates"
            placeholder="Search updates…"
          />
        </label>
        <select
          bind:value={provider}
          on:change={() => (visibleCount = 20)}
          aria-label="Filter by provider"
        >
          <option value="all">All providers</option>
          {#each providers as id}<option value={id}>{providerName(id)}</option
            >{/each}
        </select>
      </div>
      <p class="result-count" role="status">
        {filtered.length}
        {filtered.length === 1 ? "update" : "updates"}<span>Newest first</span>
      </p>
      {#each groups as group}
        <section class="day-group" aria-labelledby={`date-${group.date}`}>
          <div class="date-column">
            <h2 id={`date-${group.date}`}>
              <time datetime={group.date}>{dayLabel(group.date)}</time>
            </h2>
            <span class="year">{group.date.slice(0, 4)}</span>
            <span class="day-count"
              >{group.updates.length < group.total
                ? `${group.updates.length} of ${group.total}`
                : group.total}
              {group.total === 1 ? "update" : "updates"}</span
            >
          </div>
          <div class="day-events">
            {#each group.updates as update (update.id)}
              <article class="update" data-kind={update.kind}>
                <div class="event-meta">
                  <span class="type-label"
                    ><span aria-hidden="true">{icons[update.kind]}</span
                    >{labels[update.kind]}</span
                  >
                  <span class="provider-label"
                    >{#if getProviderLogo(update.provider)}<img
                        src={getProviderLogo(update.provider)}
                        alt=""
                        width="16"
                        height="16"
                      />{/if}{providerName(update.provider)}</span
                  >
                </div>
                <h3>{update.title}</h3>
                <p class="description">{update.description}</p>
                {#if update.entries.length === 1 && update.kind === "price"}
                  <div
                    class="price-table"
                    role="group"
                    aria-label="Recorded catalog price changes"
                  >
                    <div class="price-heading">
                      CATALOG PRICING <span>BEFORE → AFTER</span>
                    </div>
                    {#each update.entries[0].changes.filter((change) => (typeof change.before === "number" || change.before == null) && (typeof change.after === "number" || change.after == null)) as price}
                      <div class="verified-price-row">
                        <span class="price-label"
                          >{fieldLabel(price.field)}</span
                        >
                        <span class="verified-values"
                          ><span class="old-price"
                            >{fieldValue(price.field, price.before)}</span
                          ><span aria-hidden="true"> → </span><strong
                            >{fieldValue(price.field, price.after)}</strong
                          ></span
                        >
                        <span
                          class="delta"
                          class:decrease={typeof price.before === "number" &&
                            typeof price.after === "number" &&
                            price.after < price.before}
                          class:increase={typeof price.before === "number" &&
                            typeof price.after === "number" &&
                            price.after > price.before}
                          >{priceDelta(price)}</span
                        >
                      </div>
                    {/each}
                  </div>
                {/if}
                {#if update.entries.length > 1}<ul class="facts">
                    {#each update.entries.slice(0, 3) as entry}<li>
                        {entry.name}
                      </li>{/each}{#if update.entries.length > 3}<li>
                        +{update.entries.length - 3} more
                      </li>{/if}
                  </ul>{/if}
                <div class="event-links">
                  <a
                    class="entry-link source-link"
                    href={update.source}
                    target="_blank"
                    rel="noreferrer"
                    >{update.sourceLabel}<span aria-hidden="true">↗</span></a
                  >
                  {#if update.entries.length === 1}<a
                      class="entry-link"
                      href={`/search?q=${encodeURIComponent(update.entries[0].modelId)}`}
                      >View listing<span aria-hidden="true">↗</span></a
                    >{/if}
                </div>
                <details
                  class="change-details"
                  on:toggle={(event) => {
                    if (event.currentTarget.open)
                      expanded = new Set([...expanded, update.id]);
                    else {
                      expanded = new Set(
                        [...expanded].filter((id) => id !== update.id),
                      );
                    }
                  }}
                >
                  <summary
                    >View {update.entries.length === 1
                      ? "exact changes"
                      : `all ${update.entries.length} listings`}</summary
                  >
                  {#if expanded.has(update.id)}
                    {#each update.entries as entry}
                      <section class="listing-changes">
                        <h4>
                          <a
                            href={`/search?q=${encodeURIComponent(entry.modelId)}`}
                            >{entry.name}</a
                          >
                        </h4>
                        <code>{entry.modelId}</code>
                        {#each entry.changes as change}
                          <div class="field-change">
                            <strong>{fieldLabel(change.field)}</strong><span
                              >{fieldValue(change.field, change.before)} → {fieldValue(
                                change.field,
                                change.after,
                              )}</span
                            >
                          </div>
                        {/each}
                      </section>
                    {/each}
                  {/if}
                </details>
              </article>
            {/each}
          </div>
        </section>
      {:else}
        <div class="empty-state">
          <span aria-hidden="true">∅</span>
          <h2>No matching updates</h2>
          <p>Try another model, provider, or update type.</p>
          <button type="button" on:click={reset}>Clear filters</button>
        </div>
      {/each}
      {#if filtered.length > visibleCount}
        <button
          class="load-more"
          type="button"
          on:click={() => (visibleCount += 20)}
          >Load older updates <span aria-hidden="true">↓</span></button
        >
      {:else if filtered.length}
        <p class="end-note">End of this catalog snapshot.</p>
      {/if}
      {#if filtered.length}<p class="shown-count">
          Showing {shownCount} of {filtered.length} updates
        </p>{/if}
    </section>

    <aside>
      <div class="aside-content">
        <div class="aside-heading">
          IN THIS SNAPSHOT<span>{snapshot.commitCount} COMMITS</span>
        </div>
        <h2>A lot can change<br />in a few days.</h2>
        <p>One place to follow the models and providers you build with.</p>
        <div class="summary-list">
          {#each updateKinds.filter((kind) => kind.id !== "all") as kind}
            <button
              type="button"
              aria-pressed={category === kind.id}
              on:click={() => {
                category = kind.id;
                visibleCount = 20;
              }}
              ><span>{kind.label}</span><b
                >{updates
                  .filter((update) => update.kind === kind.id)
                  .length.toString()
                  .padStart(2, "0")}</b
              ></button
            >
          {/each}
        </div>
        <div class="aside-links">
          <a href="/search"
            >Explore all models <span aria-hidden="true">↗</span></a
          ><a href="/providers"
            >Browse providers <span aria-hidden="true">↗</span></a
          ><a href="/benchmarks"
            >Coding benchmarks <span aria-hidden="true">↗</span></a
          >
        </div>
        <p class="aside-footnote">
          Snapshot of the price file from {startDate} through {snapshotDate}.
          Updates are grouped by commit, provider, and change type. Includes
          corrections, aliases, and restored listings. This draft does not
          refresh automatically.
        </p>
      </div>
    </aside>
  </div>
  <footer>
    <span>LiteLLM / Model changelog</span><span
      >Built for the people building with AI.</span
    >
  </footer>
</main>

<style>
  .discover-page {
    max-width: var(--page-width);
    margin: auto;
    padding: 0 var(--page-gutter);
    color: var(--hf-ink);
  }
  .changelog-hero {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 48px;
    padding: 32px 0 28px;
  }
  .eyebrow,
  .ledger-caption,
  .ledger-bottom,
  .aside-heading,
  .price-heading {
    font:
      11px "IBM Plex Mono",
      monospace;
    letter-spacing: 1px;
  }
  .eyebrow {
    display: flex;
    align-items: center;
    gap: 9px;
    color: var(--hf-accent);
    margin-bottom: 18px;
  }
  .blue-dot {
    width: 6px;
    height: 6px;
    background: currentColor;
  }
  h1 {
    font:
      600 clamp(64px, 7.5vw, 104px) / 0.89 "Barlow Condensed",
      Impact,
      sans-serif;
    letter-spacing: -2px;
    margin: 0 0 23px;
  }
  .changelog-hero p {
    font-size: 16px;
    line-height: 1.65;
    margin: 0;
    color: var(--hf-muted);
  }
  .hero-ledger {
    width: 340px;
    margin-right: 48px;
    color: var(--hf-accent);
    transform: rotate(-5deg);
  }
  .ledger-caption {
    margin-bottom: 16px;
    font-size: 10px;
  }
  .ledger-line {
    display: flex;
    align-items: center;
    gap: 19px;
    border-top: 1px solid color-mix(in srgb, var(--hf-accent) 30%, transparent);
    padding: 12px 0;
    font:
      11px "IBM Plex Mono",
      monospace;
    letter-spacing: 0.6px;
  }
  .ledger-line span {
    opacity: 0.5;
    font-size: 10px;
  }
  .ledger-line b {
    font-weight: 500;
  }
  .ledger-line i {
    margin-left: auto;
    font: normal 22px monospace;
  }
  .ledger-line.faint {
    opacity: 0.5;
  }
  .ledger-bottom {
    border-top: 1px solid color-mix(in srgb, var(--hf-accent) 20%, transparent);
    padding-top: 14px;
    opacity: 0.5;
    font-size: 9px;
  }
  .preview-note {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 16px;
    border: 1px solid var(--hf-line);
    background: var(--hf-faint);
    color: var(--hf-muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .preview-badge {
    color: var(--hf-accent);
    font:
      10px "IBM Plex Mono",
      monospace;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }
  .update-filters {
    display: flex;
    gap: 28px;
    margin-top: 28px;
    border-bottom: 1px solid var(--hf-line);
    overflow-x: auto;
  }
  button,
  input,
  select {
    font: inherit;
  }
  button,
  a,
  input,
  select {
    -webkit-tap-highlight-color: transparent;
  }
  button {
    cursor: pointer;
  }
  .update-filters button {
    display: flex;
    align-items: center;
    gap: 7px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    padding: 15px 0;
    margin: 0;
    color: var(--hf-muted);
    font-size: 13px;
    white-space: nowrap;
  }
  .update-filters button.active {
    color: var(--hf-accent);
    border-bottom-color: currentColor;
  }
  .filter-icon {
    font-size: 17px;
  }
  .feed-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 260px;
    gap: 64px;
    padding-top: 26px;
  }
  .feed {
    min-width: 0;
  }
  .feed-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .search-field {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
    color: var(--hf-muted);
  }
  .search-field input {
    border: 0;
    outline-offset: 3px;
    background: transparent;
    min-width: 0;
    width: 100%;
    color: var(--hf-ink);
    padding: 9px 0;
    font-size: 13px;
  }
  .search-field input::placeholder {
    color: var(--hf-muted);
  }
  select {
    color: var(--hf-ink);
    background: var(--hf-bg);
    border: 1px solid var(--hf-line);
    border-radius: 5px;
    padding: 9px 30px 9px 11px;
    max-width: 210px;
    font-size: 12px;
  }
  .result-count {
    display: flex;
    justify-content: space-between;
    color: var(--hf-muted);
    font:
      10px "IBM Plex Mono",
      monospace;
    padding: 15px 0 16px;
    margin: 0;
    border-bottom: 1px solid var(--hf-line);
  }
  .day-group {
    display: grid;
    grid-template-columns: 132px minmax(0, 1fr);
    border-bottom: 1px solid var(--hf-line);
  }
  .date-column {
    padding-top: 29px;
  }
  .date-column h2 {
    margin: 0 0 5px;
    font-size: 14px;
    font-weight: 600;
  }
  .year {
    font:
      11px "IBM Plex Mono",
      monospace;
    color: var(--hf-muted);
  }
  .day-count {
    display: block;
    color: var(--hf-muted);
    font-size: 11px;
    margin-top: 16px;
  }
  .day-events {
    min-width: 0;
    padding-left: 27px;
    border-left: 1px solid var(--hf-line);
  }
  .update {
    position: relative;
    padding: 28px 0 25px;
    border-bottom: 1px solid var(--hf-line);
  }
  .update:last-child {
    border: 0;
  }
  .update::before {
    content: "";
    position: absolute;
    left: -31px;
    top: 34px;
    width: 7px;
    height: 7px;
    background: var(--hf-bg);
    border: 1px solid var(--hf-bar);
    border-radius: 50%;
  }
  .event-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 13px;
    font-size: 11px;
  }
  .type-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--hf-accent);
  }
  [data-kind="price"] .type-label {
    color: var(--success-color);
  }
  [data-kind="deprecation"] .type-label {
    color: var(--hf-warning);
  }
  .type-label > span {
    font-size: 15px;
  }
  .provider-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--hf-muted);
    border-left: 1px solid var(--hf-line);
    padding-left: 12px;
  }
  .provider-label img {
    object-fit: contain;
    border-radius: 3px;
    background: #fff;
    padding: 2px;
    box-sizing: content-box;
  }
  h3 {
    font-size: 19px;
    font-weight: 600;
    line-height: 1.4;
    letter-spacing: -0.45px;
    margin: 0 0 7px;
  }
  .description {
    font-size: 13px;
    line-height: 1.65;
    color: var(--hf-muted);
    margin: 0;
  }
  .price-table {
    margin: 17px 0 0;
    padding: 13px 16px;
    border: 1px solid var(--hf-line);
    border-radius: 5px;
    max-width: 490px;
    background: var(--hf-faint);
  }
  .price-heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    color: var(--hf-muted);
    font-size: 9px;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }
  .price-heading > span {
    display: flex;
    gap: 12px;
  }
  .price-label {
    font-family: "DM Sans", sans-serif;
  }
  .old-price {
    color: var(--hf-muted);
  }
  .delta {
    font:
      10px "IBM Plex Mono",
      monospace;
    text-align: right;
    color: var(--hf-muted);
  }
  .delta.decrease {
    color: var(--success-color);
  }
  .delta.increase {
    color: var(--hf-warning);
  }
  .facts {
    display: flex;
    gap: 7px;
    flex-wrap: wrap;
    list-style: none;
    padding: 0;
    margin: 15px 0 0;
  }
  .facts li {
    font-size: 10px;
    color: var(--hf-muted);
    border: 1px solid var(--hf-line);
    border-radius: 4px;
    padding: 5px 8px;
  }
  .verified-price-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 7px 12px;
    padding: 9px 0;
    font-size: 11px;
  }
  .verified-price-row .price-label {
    grid-column: 1 / -1;
    color: var(--hf-muted);
  }
  .verified-values {
    overflow-wrap: anywhere;
    font:
      11px "IBM Plex Mono",
      monospace;
  }
  .event-links {
    display: flex;
    gap: 20px;
  }
  .source-link {
    color: var(--hf-accent);
  }
  .change-details {
    margin-top: 14px;
    font-size: 11px;
    color: var(--hf-muted);
  }
  .change-details summary {
    cursor: pointer;
    padding: 6px 0;
  }
  .listing-changes {
    padding: 14px 0;
    border-top: 1px solid var(--hf-line);
  }
  .listing-changes h4 {
    margin: 0 0 4px;
    font-size: 13px;
  }
  .listing-changes h4 a {
    color: var(--hf-accent);
  }
  .listing-changes code {
    overflow-wrap: anywhere;
    font-size: 10px;
  }
  .field-change {
    display: grid;
    gap: 4px;
    margin-top: 12px;
    overflow-wrap: anywhere;
  }
  .field-change span {
    white-space: pre-wrap;
  }
  .facts li {
    overflow-wrap: anywhere;
  }
  .entry-link {
    display: inline-flex;
    gap: 7px;
    margin-top: 16px;
    color: var(--hf-muted);
    font-size: 11px;
    text-decoration: none;
  }
  .entry-link:hover,
  .aside-links a:hover {
    color: var(--hf-accent);
  }
  aside {
    padding-top: 13px;
  }
  .aside-content {
    position: sticky;
    top: 100px;
  }
  .aside-heading {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: var(--hf-muted);
  }
  .aside-heading span {
    color: var(--hf-accent);
  }
  aside h2 {
    font:
      500 34px/1.05 "Barlow Condensed",
      Impact,
      sans-serif;
    margin: 23px 0 13px;
    letter-spacing: -0.4px;
  }
  aside p {
    font-size: 12px;
    line-height: 1.7;
    color: var(--hf-muted);
  }
  .summary-list {
    margin: 23px 0 27px;
  }
  .summary-list button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 12px 0;
    background: none;
    border: 0;
    border-bottom: 1px solid var(--hf-line);
    color: var(--hf-muted);
    font-size: 12px;
  }
  .summary-list button:hover,
  .summary-list button[aria-pressed="true"] {
    color: var(--hf-accent);
  }
  .summary-list b {
    font:
      12px "IBM Plex Mono",
      monospace;
    color: var(--hf-ink);
  }
  .aside-links {
    display: grid;
    gap: 15px;
  }
  .aside-links a {
    display: flex;
    justify-content: space-between;
    color: var(--hf-ink);
    text-decoration: none;
    font-size: 12px;
  }
  aside .aside-footnote {
    font-size: 10px;
    margin-top: 28px;
  }
  .load-more {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    padding: 16px;
    margin-top: 24px;
    border: 1px solid var(--hf-line);
    border-radius: 5px;
    background: transparent;
    color: var(--hf-ink);
    font-size: 12px;
  }
  .load-more:hover {
    background: var(--hf-faint);
  }
  .end-note,
  .shown-count {
    text-align: center;
    color: var(--hf-muted);
    font-size: 11px;
    margin: 24px 0 0;
  }
  .shown-count {
    margin: 12px 0 30px;
    font-size: 10px;
  }
  .empty-state {
    text-align: center;
    padding: 65px 10px;
  }
  .empty-state > span {
    font-size: 30px;
    color: var(--hf-muted);
  }
  .empty-state h2 {
    font-size: 20px;
  }
  .empty-state p {
    color: var(--hf-muted);
    font-size: 13px;
  }
  .empty-state button {
    border: 1px solid var(--hf-line);
    border-radius: 5px;
    background: var(--hf-dialog);
    color: var(--hf-ink);
    padding: 10px 15px;
  }
  footer {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 23px 0 32px;
    border-top: 1px solid var(--hf-line);
    color: var(--hf-muted);
    font-size: 11px;
    margin-top: 30px;
  }
  @media (min-width: 1450px) {
    .feed-layout {
      gap: 90px;
      grid-template-columns: minmax(0, 1fr) 285px;
    }
    .day-group {
      grid-template-columns: 170px minmax(0, 1fr);
    }
  }
  @media (max-width: 1100px) {
    .feed-layout {
      grid-template-columns: minmax(0, 1fr) 205px;
      gap: 32px;
    }
    .day-group {
      grid-template-columns: 105px minmax(0, 1fr);
    }
    .hero-ledger {
      margin-right: 0;
      width: 280px;
    }
    .update-filters {
      gap: 22px;
    }
  }
  @media (max-width: 850px) {
    aside {
      display: none;
    }
    .feed-layout {
      display: block;
    }
    .hero-ledger {
      width: 235px;
    }
    .ledger-line {
      gap: 12px;
      font-size: 9px;
    }
    .ledger-caption {
      font-size: 9px;
    }
  }
  @media (max-width: 600px) {
    .changelog-hero {
      padding: 32px 0 28px;
    }
    .hero-ledger {
      display: none;
    }
    h1 {
      font-size: clamp(48px, 12vw, 72px);
    }
    .changelog-hero p {
      font-size: 14px;
    }
    .desktop-break {
      display: none;
    }
    .preview-note {
      display: block;
      padding: 12px;
      font-size: 11px;
    }
    .preview-badge {
      display: block;
      margin-bottom: 6px;
    }
    .update-filters {
      gap: 23px;
      margin-top: 15px;
    }
    .update-filters button {
      font-size: 12px;
    }
    .feed-layout {
      padding-top: 17px;
    }
    select {
      max-width: 155px;
      padding-right: 20px;
    }
    .search-field {
      gap: 6px;
    }
    .day-group {
      display: block;
    }
    .date-column {
      display: flex;
      align-items: baseline;
      gap: 7px;
      padding-top: 23px;
    }
    .date-column h2 {
      font-size: 13px;
    }
    .day-count {
      margin: 0 0 0 auto;
      font-size: 10px;
    }
    .day-events {
      border: 0;
      padding: 0;
    }
    .update {
      padding: 23px 0;
    }
    .update::before {
      display: none;
    }
    h3 {
      font-size: 18px;
    }
    .description {
      font-size: 12px;
    }
    .price-table {
      padding: 12px;
    }
    .delta {
      font-size: 9px;
    }
    .price-heading {
      font-size: 8px;
      letter-spacing: 0;
    }
    footer {
      flex-direction: column;
      gap: 7px;
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    button,
    a {
      transition:
        color 120ms,
        background 120ms;
    }
  }
</style>
