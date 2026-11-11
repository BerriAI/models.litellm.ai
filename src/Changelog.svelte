<script lang="ts">
  import { track } from "./analytics";
  import { onMount, tick } from "svelte";
  import PageHero from "./PageHero.svelte";
  import {
    fieldLabel,
    fieldValue,
    type CatalogUpdate,
    type UpdateKind,
  } from "./discoveryChangelog";
  import {
    DIGEST_OPTIONS,
    changelogItems,
    feedFilter,
    feedQuery,
    feedUrl,
    listingKeys,
    modelKey,
    modelMatcher,
    modelName,
  } from "./changelogPresentation";
  import { getProviderDisplayName } from "./providers";
  import { loadCatalogData } from "./catalogData";
  let updates: CatalogUpdate[] = [];
  let providerNames: Record<string, string> = {};
  let generatedAt = "";
  let loading = true;
  let error = false;
  let category: UpdateKind | "all" = "all";
  let provider = "all";
  let query = "";
  let visibleCount = 40;
  let expanded = new Set<string>();
  let builderOpen = false;
  const SHOWN_MODELS = 200;
  const SHOWN_CHIPS = 5;
  let listOpen = false;
  let active = -1;
  let modelInput: HTMLInputElement;
  let digest = "";
  let kinds: string[] = [];
  let feedProviders: string[] = [];
  let providerQuery = "";
  let modelQuery = "";
  let picked: string[] = [];
  let catalogModels: { name: string; provider: string }[] = [];
  let catalogState: "idle" | "loading" | "ready" | "failed" = "idle";
  let copied = "";
  let copyError = "";
  const filters: { id: UpdateKind | "all"; label: string }[] = [
    { id: "all", label: "Highlights" },
    { id: "price", label: "Prices" },
    { id: "model", label: "New models" },
    { id: "provider", label: "New providers" },
    { id: "capability", label: "Capabilities" },
    { id: "deprecation", label: "Deprecations" },
    { id: "metadata", label: "Other changes" },
  ];
  const labels = {
    price: "Price",
    model: "Added",
    provider: "Provider",
    capability: "Capability",
    deprecation: "Deprecation",
    metadata: "Updated",
  };
  const providerName = (id: string) =>
    providerNames[id] ?? getProviderDisplayName(id);
  const dayLabel = (date: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00Z`));
  async function load() {
    loading = true;
    error = false;
    try {
      const response = await fetch("/changelog.json");
      if (!response.ok) throw new Error("Cannot load changelog");
      const data = await response.json();
      updates = data.updates;
      providerNames = data.providerNames;
      generatedAt = data.generatedAt;
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  }
  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const preset = feedFilter(params);
    if (
      preset.kinds.length ||
      preset.providers.length ||
      preset.models.length ||
      preset.digest
    ) {
      kinds = preset.kinds;
      feedProviders = preset.providers;
      picked = [
        ...new Set(
          (params.get("models") ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ];
      digest = preset.digest;
      builderOpen = true;
      void loadCatalog();
    }
    void load();
  });
  async function loadCatalog() {
    if (catalogState !== "idle" && catalogState !== "failed") return;
    catalogState = "loading";
    try {
      const { items } = await loadCatalogData(false, "");
      catalogModels = items.map((item) => ({
        name: modelName(item.name),
        provider:
          typeof item.litellm_provider === "string"
            ? item.litellm_provider
            : "",
      }));
      catalogState = "ready";
    } catch {
      catalogState = "failed";
    }
  }
  function openBuilder() {
    if (!builderOpen) return;
    track("Changelog Feed Builder Opened");
    void loadCatalog();
  }
  $: items = changelogItems(updates, providerNames);
  $: providers = [...new Set(updates.map((u) => u.provider))].sort((a, b) =>
    providerName(a).localeCompare(providerName(b)),
  );
  $: search = query.trim().toLowerCase();
  $: filtered = items.filter(
    (item) =>
      (category === "all"
        ? item.kind !== "metadata"
        : item.kind === category) &&
      (provider === "all" || item.provider === provider) &&
      (!search ||
        [item.headline, ...item.lines, ...item.entries.map((e) => e.modelId)]
          .join(" ")
          .toLowerCase()
          .includes(search)),
  );
  $: visible = filtered.slice(0, visibleCount);
  $: days = [...new Set(visible.map((item) => item.date))];
  function toggle(id: string) {
    track(
      expanded.has(id) ? "Changelog Item Collapsed" : "Changelog Item Expanded",
      { item: id },
    );
    expanded.has(id) ? expanded.delete(id) : expanded.add(id);
    expanded = new Set(expanded);
  }
  $: providerMatches = providers.filter((id) => {
    const q = providerQuery.trim().toLowerCase();
    return !q || id.includes(q) || providerName(id).toLowerCase().includes(q);
  });
  $: modelProviders = (() => {
    const map = new Map<string, Set<string>>();
    const add = (name: string, provider: string) => {
      if (!name) return;
      if (!map.has(name)) map.set(name, new Set());
      if (provider) map.get(name)!.add(provider);
    };
    for (const update of updates)
      for (const entry of update.entries)
        add(modelName(entry.modelId), update.provider);
    for (const model of catalogModels) add(model.name, model.provider);
    return map;
  })();
  $: pattern = modelQuery.includes("*") ? modelQuery.trim() : "";
  $: modelMatches = (() => {
    const q = modelQuery.trim().toLowerCase();
    const wildcard = pattern ? modelMatcher([pattern]) : null;
    const onProviders = (name: string) =>
      !feedProviders.length ||
      [...(modelProviders.get(name) ?? [])].some((p) =>
        feedProviders.includes(p),
      );
    const names =
      !q && !feedProviders.length
        ? []
        : [...modelProviders.keys()]
            .filter(
              (name) =>
                onProviders(name) &&
                (!q ||
                  (wildcard
                    ? wildcard([modelKey(name)])
                    : name.toLowerCase().includes(q))),
            )
            .sort((a, b) => a.localeCompare(b));
    return {
      options: [...(pattern ? [pattern] : []), ...names.slice(0, SHOWN_MODELS)],
      matched: names.length,
      hidden: Math.max(0, names.length - SHOWN_MODELS),
    };
  })();
  $: if (active >= modelMatches.options.length) active = -1;
  $: if (listOpen && active >= 0)
    tick().then(() =>
      document
        .getElementById(optionId(modelMatches.options[active]))
        ?.scrollIntoView({ block: "nearest" }),
    );
  const rowLabel = (name: string) =>
    name.includes("*") ? `All matching ${name}` : name;
  const optionId = (name: string) =>
    `model-option-${modelKey(name).replace(/[^a-z0-9]/g, "-")}`;
  function togglePick(name: string) {
    picked = picked.includes(name)
      ? picked.filter((n) => n !== name)
      : [...picked, name];
    modelQuery = "";
    pickedChanged();
  }
  function unpick(name: string) {
    picked = picked.filter((n) => n !== name);
    pickedChanged();
  }
  function closeList(event: FocusEvent) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget instanceof Node) {
      if (event.currentTarget.contains(next)) return;
    }
    listOpen = false;
    active = -1;
  }
  function modelKeydown(event: KeyboardEvent) {
    const n = modelMatches.options.length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      listOpen = true;
      if (!n) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      active = (active + step + n) % n;
    } else if (event.key === "Enter") {
      if (!listOpen || active < 0 || active >= n) return;
      event.preventDefault();
      togglePick(modelMatches.options[active]);
    } else if (event.key === "Escape") {
      if (listOpen) event.preventDefault();
      listOpen = false;
      active = -1;
    } else if (event.key === "Backspace" && !modelQuery && picked.length) {
      unpick(picked[picked.length - 1]);
    } else listOpen = true;
  }
  $: followed = picked;
  $: url = feedUrl({
    kinds,
    providers: feedProviders,
    models: followed,
    digest,
  });
  $: slackCommand = `/feed subscribe ${url}`;
  $: wanted = modelMatcher(followed);
  $: seen = wanted
    ? new Set(
        items.flatMap((item) =>
          item.entries
            .filter((e) => wanted(listingKeys(e)))
            .map((e) => modelName(e.modelId)),
        ),
      ).size
    : 0;
  $: shownNames =
    followed.slice(0, 6).join(", ") +
    (followed.length > 6 ? ` +${followed.length - 6} more` : "");
  function selectProviders(ids: string[]) {
    feedProviders = [...new Set([...feedProviders, ...ids])];
    track("Changelog Feed Builder Changed", {
      field: "providers",
      value: feedProviders.length,
    });
  }
  function clearProviders() {
    feedProviders = [];
    track("Changelog Feed Builder Changed", { field: "providers", value: 0 });
  }
  function pickedChanged() {
    track("Changelog Feed Builder Changed", {
      field: "models",
      value: picked.length,
    });
  }
  function clearPicked() {
    picked = [];
    pickedChanged();
  }
  async function copy(what: "url" | "slack") {
    copyError = "";
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(what === "url" ? url : slackCommand);
      copied = what;
      setTimeout(() => (copied = ""), 1500);
    } catch {
      copyError = "Couldn't copy. Select and copy the text instead.";
    }
    track("Changelog Feed Copied", {
      what,
      digest,
      kind: kinds,
      providers: feedProviders,
      models: followed.length,
    });
  }
  function reset() {
    track("Filters Reset", { page: "changelog", query });
    category = "all";
    provider = "all";
    query = "";
    visibleCount = 40;
  }
</script>

<main class="changelog">
  <PageHero
    id="changelog"
    title="CHANGELOG"
    description="Model pricing, new models, and provider updates."
    variant="changelog"
  >
    <a
      class="rss-link"
      href={`/changelog.xml${feedQuery(category, provider)}`}
      on:click={() =>
        track("Changelog Feed Link Clicked", { kind: category, provider })}
      >{category !== "all" || provider !== "all"
        ? "RSS feed for this view"
        : "RSS feed"}</a
    >
  </PageHero>
  <details class="subscribe" bind:open={builderOpen} on:toggle={openBuilder}>
    <summary>Build a feed for the models you run</summary>
    <div class="builder">
      <label
        >Post
        <select
          bind:value={digest}
          on:change={() =>
            track("Changelog Feed Builder Changed", {
              field: "digest",
              value: digest,
            })}
          >{#each DIGEST_OPTIONS as option}<option value={option.value}
              >{option.label}</option
            >{/each}</select
        ></label
      >
      <fieldset>
        <legend>Change types <span>(none means highlights)</span></legend>
        {#each filters.slice(1) as filter}<label class="check"
            ><input type="checkbox" bind:group={kinds} value={filter.id} />
            {filter.label}</label
          >{/each}
      </fieldset>
      <fieldset class="providers">
        <legend>Providers <span>(none means all)</span></legend>
        <div class="provider-tools">
          <input
            type="search"
            bind:value={providerQuery}
            placeholder="Filter providers"
            aria-label="Filter providers"
          />
          <button
            type="button"
            on:click={() => selectProviders(providerMatches)}
            >Select {providerQuery.trim() ? "shown" : "all"}</button
          >
          <button
            type="button"
            disabled={!feedProviders.length}
            on:click={clearProviders}>Clear</button
          >
          <span class="hint"
            >{feedProviders.length} of {providers.length} selected</span
          >
        </div>
        <div class="provider-grid">
          {#each providerMatches as id}<label class="check"
              ><input type="checkbox" bind:group={feedProviders} value={id} />
              {providerName(id)}</label
            >{/each}
          {#if !providerMatches.length}<span class="hint"
              >No provider matches "{providerQuery}"</span
            >{/if}
        </div>
      </fieldset>
      <fieldset class="models">
        <legend>Models <span>(none means all)</span></legend>
        <div class="combo" on:focusout={closeList}>
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="chips"
            class:open={listOpen}
            on:mousedown|self|preventDefault={() => modelInput.focus()}
          >
            {#each picked.slice(0, SHOWN_CHIPS) as name (name)}
              <span class="chip"
                >{rowLabel(name)}<button
                  type="button"
                  aria-label="Remove {rowLabel(name)}"
                  on:click={() => unpick(name)}>×</button
                ></span
              >
            {/each}
            {#if picked.length > SHOWN_CHIPS}<span
                class="hint"
                title={picked.slice(SHOWN_CHIPS).map(rowLabel).join(", ")}
                >+{picked.length - SHOWN_CHIPS} more</span
              >{/if}
            <input
              type="text"
              role="combobox"
              aria-label="Select models"
              aria-expanded={listOpen}
              aria-controls="model-options"
              aria-autocomplete="list"
              aria-activedescendant={active >= 0
                ? optionId(modelMatches.options[active])
                : undefined}
              placeholder={picked.length ? "" : "Select models"}
              autocomplete="off"
              bind:value={modelQuery}
              bind:this={modelInput}
              on:focus={() => (listOpen = true)}
              on:keydown={modelKeydown}
            />
          </div>
          {#if listOpen}
            <ul
              class="model-options"
              id="model-options"
              role="listbox"
              aria-multiselectable="true"
              aria-label="Models"
            >
              {#if pattern}
                <li class="group" role="presentation">Wildcards</li>
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
                <li
                  id={optionId(pattern)}
                  role="option"
                  data-value={pattern}
                  aria-selected={picked.includes(pattern)}
                  class:active={active === 0}
                  on:mousedown|preventDefault
                  on:click={() => togglePick(pattern)}
                >
                  {rowLabel(pattern)}
                </li>
              {/if}
              {#if modelMatches.matched}
                <li class="group" role="presentation">Models</li>
                {#each modelMatches.options.slice(pattern ? 1 : 0) as name, i (name)}
                  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
                  <li
                    id={optionId(name)}
                    role="option"
                    data-value={name}
                    aria-selected={picked.includes(name)}
                    class:active={active === i + (pattern ? 1 : 0)}
                    on:mousedown|preventDefault
                    on:click={() => togglePick(name)}
                  >
                    {name}
                  </li>
                {/each}
                {#if modelMatches.hidden}<li class="hint" role="presentation">
                    +{modelMatches.hidden} more, type to narrow
                  </li>{/if}
              {:else if !pattern}
                <li class="hint" role="presentation">
                  {modelQuery.trim()
                    ? `No model matches "${modelQuery}"`
                    : "Tick a provider above to list its models, or type a name. gpt-5* follows every GPT-5 model."}
                </li>
              {/if}
            </ul>
          {/if}
        </div>
        <div class="provider-tools">
          <span class="hint"
            >{picked.length
              ? `Following ${shownNames}, ${seen} changed in the last 30 days.`
              : "A name follows the model on every provider that lists it."}{catalogState ===
            "loading"
              ? " Loading the catalog…"
              : ""}</span
          >
          <button type="button" disabled={!picked.length} on:click={clearPicked}
            >Clear</button
          >
        </div>
      </fieldset>
      <div class="output">
        <code>{url}</code><button type="button" on:click={() => copy("url")}
          >{copied === "url" ? "Copied" : "Copy URL"}</button
        >
      </div>
      <div class="output">
        <code>{slackCommand}</code><button
          type="button"
          on:click={() => copy("slack")}
          >{copied === "slack" ? "Copied" : "Copy Slack command"}</button
        >
      </div>
      {#if copyError}<p class="hint" role="alert">{copyError}</p>{/if}
      <p class="hint">
        A time window posts once it closes and the catalog has rebuilt, up to 15
        minutes later.
      </p>
    </div>
  </details>
  <div class="tools">
    <input
      type="search"
      bind:value={query}
      on:input={() => (visibleCount = 40)}
      aria-label="Search updates"
      placeholder="Search models or providers…"
    />
    <select
      bind:value={provider}
      on:change={() => {
        visibleCount = 40;
        track("Changelog Filter Changed", {
          filter: "provider",
          value: provider,
        });
      }}
      aria-label="Filter by provider"
      ><option value="all">All providers</option>{#each providers as id}<option
          value={id}>{providerName(id)}</option
        >{/each}</select
    >
  </div>
  <nav class="segmented-tabs wrap" aria-label="Filter updates by type">
    {#each filters as filter}<button
        aria-pressed={category === filter.id}
        on:click={() => {
          category = filter.id;
          visibleCount = 40;
          track("Changelog Filter Changed", {
            filter: "category",
            value: filter.id,
          });
        }}>{filter.label}</button
      >{/each}
  </nav>
  {#if loading}<p class="state" role="status">Loading updates…</p>
  {:else if error}<p class="state" role="alert">
      Couldn't load updates. <button on:click={load}>Try again</button>
    </p>
  {:else}
    <p class="count" role="status">
      {filtered.length} updates <span>Past 30 days · Newest first</span>
    </p>
    {#each days as day}<section class="day" aria-labelledby={`day-${day}`}>
        <h2 id={`day-${day}`}><time datetime={day}>{dayLabel(day)}</time></h2>
        <div class="entries">
          {#each visible.filter((item) => item.date === day) as item (item.id)}
            <article data-kind={item.kind}>
              <span
                class="kind"
                class:price={item.kind === "price"}
                class:added={item.kind === "model" || item.kind === "provider"}
                >{labels[item.kind]}</span
              >
              <div class="body">
                <h3>{item.headline}</h3>
                {#each item.lines.slice(0, 3) as line}<p
                    class="value"
                    class:decrease={line.includes("decreased")}
                    class:increase={line.includes("increased")}
                  >
                    {line}
                  </p>{/each}
                <div class="links">
                  <button
                    aria-expanded={expanded.has(item.id)}
                    on:click={() => toggle(item.id)}
                    >{expanded.has(item.id)
                      ? "Hide details"
                      : item.lines.length > 3
                        ? `Details · ${item.lines.length} changes`
                        : item.entries.length > 1
                          ? `View ${item.entries.length} ${item.kind === "model" || item.kind === "provider" ? "models" : "listings"}`
                          : "Details"}</button
                  ><a
                    class="source-link"
                    href={item.source}
                    target="_blank"
                    rel="noreferrer">Source ↗</a
                  >
                </div>
                {#if expanded.has(item.id)}<div class="details">
                    {#each item.entries as entry}<div class="listing">
                        <a
                          href={`/search?q=${encodeURIComponent(entry.modelId)}`}
                          >{entry.modelId} ↗</a
                        >{#each entry.changes as change}<div class="field">
                            <span>{fieldLabel(change.field)}</span><span
                              >{fieldValue(change.field, change.before)} →
                              <strong
                                >{fieldValue(
                                  change.field,
                                  change.after,
                                )}</strong
                              ></span
                            >
                          </div>{/each}
                      </div>{/each}
                  </div>{/if}
              </div>
            </article>
          {/each}
        </div>
      </section>{/each}
    {#if filtered.length === 0}<div class="state">
        No matching updates. <button on:click={reset}>Clear filters</button>
      </div>{/if}
    {#if visible.length < filtered.length}<button
        class="more"
        on:click={() => {
          visibleCount += 40;
          track("Changelog Load More", { visible: visibleCount });
        }}>Load older updates <span>↓</span></button
      >{/if}
  {/if}
  <footer>
    From the <a
      href="https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json"
      >LiteLLM catalog</a
    >
    · Dates in Pacific time{#if generatedAt}
      · Updated {new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "America/Los_Angeles",
      }).format(new Date(generatedAt))}{/if}<a href="/benchmarks"
      >Coding benchmarks ↗</a
    >
  </footer>
</main>

<style>
  .changelog {
    max-width: var(--page-width);
    margin: 0 auto;
    padding: 0 var(--page-gutter) 64px;
    color: var(--hf-ink);
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  a:hover {
    color: var(--hf-accent);
    text-decoration: underline;
  }
  input,
  select {
    font: inherit;
    color: inherit;
  }
  button {
    font-family: inherit;
    cursor: pointer;
  }
  .rss-link {
    font-size: 13px;
    color: var(--hf-accent);
  }
  .subscribe {
    margin-top: 20px;
    border: 1px solid var(--hf-line);
    border-radius: 6px;
    font-size: 13px;
  }
  .subscribe summary {
    cursor: pointer;
    padding: 12px 14px;
    font-weight: 600;
  }
  .builder {
    display: grid;
    gap: 12px;
    padding: 0 14px 14px;
  }
  .builder label,
  .builder legend {
    display: grid;
    gap: 6px;
    font-size: 12px;
    color: var(--hf-muted);
  }
  .builder fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
  }
  .builder legend span {
    font-weight: 400;
  }
  .builder legend {
    display: block;
    width: 100%;
    margin-bottom: 4px;
  }
  .builder .check {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    color: var(--hf-ink);
    font-size: 13px;
  }
  .builder .check input {
    min-height: 0;
    padding: 0;
    width: auto;
  }
  .builder .providers,
  .builder .models {
    display: grid;
    gap: 8px;
  }
  .provider-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .provider-tools input {
    flex: 1;
    min-width: 160px;
    font-size: 12px;
    padding: 6px 10px;
    min-height: 0;
  }
  .provider-tools button {
    border: 1px solid var(--hf-line);
    border-radius: var(--control-radius);
    background: var(--hf-bg);
    font-size: 12px;
    padding: 6px 10px;
  }
  .provider-tools button:disabled {
    opacity: 0.5;
  }
  .combo {
    position: relative;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    min-height: 36px;
    padding: 4px 6px;
    border: 1px solid var(--hf-line);
    border-radius: var(--control-radius);
    background: var(--hf-bg);
    cursor: text;
  }
  .chips.open {
    border-color: var(--hf-ink);
  }
  .chips input {
    flex: 1;
    min-width: 120px;
    border: 0;
    padding: 4px;
    min-height: 0;
    width: auto;
    font-size: 13px;
    outline: none;
    background: transparent;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 4px 2px 8px;
    border-radius: 999px;
    background: var(--hf-faint);
    color: var(--hf-ink);
    font-size: 12px;
    line-height: 1.4;
  }
  .chip button {
    border: 0;
    background: transparent;
    padding: 0 4px;
    font-size: 14px;
    line-height: 1;
    color: var(--hf-muted);
    cursor: pointer;
  }
  .chip button:hover {
    color: var(--hf-ink);
  }
  .model-options {
    position: absolute;
    z-index: 5;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    margin: 0;
    padding: 4px;
    list-style: none;
    max-height: 260px;
    overflow-y: auto;
    border: 1px solid var(--hf-line);
    border-radius: var(--control-radius);
    background: var(--hf-bg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  }
  .model-options li {
    font-size: 13px;
    padding: 6px 8px 6px 26px;
    border-radius: 4px;
    position: relative;
    color: var(--hf-ink);
  }
  .model-options li[role="option"] {
    cursor: pointer;
  }
  .model-options li[role="option"]:hover,
  .model-options li.active {
    background: var(--hf-faint);
  }
  .model-options li[aria-selected="true"]::before {
    content: "✓";
    position: absolute;
    left: 9px;
    color: var(--hf-ink);
  }
  .model-options li.group {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--hf-muted);
    padding: 8px 8px 2px;
  }
  .model-options li.hint {
    padding-left: 8px;
  }
  .provider-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 4px 12px;
    max-height: 190px;
    overflow-y: auto;
    padding: 8px 10px;
    border: 1px solid var(--hf-line);
    border-radius: var(--control-radius);
    background: var(--hf-bg);
  }
  .output {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .output code {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 12px;
    padding: 8px 10px;
    background: var(--hf-faint);
    border-radius: 4px;
  }
  .output button {
    border: 1px solid var(--hf-line);
    border-radius: var(--control-radius);
    background: var(--hf-bg);
    font-size: 12px;
    padding: 8px 12px;
    white-space: nowrap;
  }
  .hint {
    font-size: 11px;
    color: var(--hf-muted);
    margin: 0;
  }
  .tools {
    display: flex;
    gap: 10px;
    margin: 24px 0 14px;
  }
  input,
  select {
    border: 1px solid var(--hf-line);
    border-radius: var(--control-radius);
    min-height: 44px;
    padding: 10px 14px;
    background: var(--hf-bg);
    font-size: 13px;
    min-width: 0;
  }
  input {
    width: 320px;
  }
  select {
    max-width: 210px;
  }
  .count {
    display: flex;
    justify-content: space-between;
    color: var(--hf-muted);
    font-size: 11px;
    margin: 13px 0 4px;
  }
  .day {
    display: grid;
    grid-template-columns: 140px minmax(0, 1fr);
    gap: 20px;
    border-bottom: 1px solid var(--hf-line);
  }
  h2 {
    font-size: 13px;
    font-weight: 600;
    padding: 21px 0;
    line-height: 1.6;
    margin: 0;
  }
  article {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 12px;
    padding: 17px 0;
    border-bottom: 1px solid var(--hf-line);
  }
  article:last-child {
    border-bottom: none;
  }
  .kind {
    font-size: 10px;
    color: var(--hf-muted);
    padding: 2px 6px;
    align-self: start;
    justify-self: start;
    background: var(--hf-faint);
    border-radius: 4px;
    margin-top: 1px;
    line-height: 1.6;
  }
  .kind.price {
    color: var(--hf-accent);
  }
  .kind.added {
    color: var(--hf-success, #19845a);
  }
  h3 {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.5;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .value {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 13px;
    color: var(--hf-muted);
    margin: 3px 0 0;
    line-height: 1.6;
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
  }
  .value.decrease {
    color: var(--hf-success, #19845a);
  }
  .value.increase {
    color: var(--hf-warning, #b57516);
  }
  .links {
    display: flex;
    gap: 13px;
    margin-top: 5px;
    font-size: 11px;
    color: var(--hf-muted);
  }
  .links button,
  .state button {
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    font-size: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .details {
    margin-top: 12px;
    border-left: 2px solid var(--hf-line);
    padding-left: 12px;
    font-size: 12px;
  }
  .listing {
    padding: 8px 0;
    overflow-wrap: anywhere;
  }
  .listing > a {
    font-family: monospace;
    color: var(--hf-accent);
  }
  .field {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: 10px;
    margin-top: 5px;
    color: var(--hf-muted);
  }
  .field strong {
    font-weight: 500;
    color: var(--hf-ink);
  }
  .more {
    display: flex;
    justify-content: space-between;
    border: 1px solid var(--hf-line);
    border-radius: 6px;
    background: none;
    font-size: 13px;
    padding: 10px 14px;
    margin: 24px 0 0 auto;
    width: calc(100% - 160px);
  }
  .state {
    padding: 30px 0;
    font-size: 14px;
    color: var(--hf-muted);
  }
  footer {
    font-size: 11px;
    color: var(--hf-muted);
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-top: 28px;
  }
  footer > a:last-child {
    margin-left: auto;
  }
  @media (max-width: 650px) {
    .changelog {
      padding: 0 var(--page-gutter) 40px;
    }
    .tools {
      gap: 8px;
    }
    input {
      flex: 1;
      width: 100px;
    }
    select {
      max-width: 145px;
    }
    .day {
      display: block;
    }
    h2 {
      padding: 18px 0 3px;
    }
    article {
      grid-template-columns: 60px minmax(0, 1fr);
      gap: 10px;
      padding: 13px 0;
    }
    .kind {
      font-size: 9px;
      padding: 2px 4px;
    }
    .field {
      display: block;
    }
    .field > span {
      display: block;
    }
    .more {
      width: 100%;
    }
    footer > a:last-child {
      width: 100%;
      margin: 6px 0 0;
    }
  }
</style>
