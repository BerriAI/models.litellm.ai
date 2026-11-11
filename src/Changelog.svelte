<script lang="ts">
  import { track } from "./analytics";
  import { onMount } from "svelte";
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
    modelName,
    parseModelList,
  } from "./changelogPresentation";
  import { getProviderDisplayName } from "./providers";
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
  const EXAMPLES = {
    json: `{"data": [
  {"model_name": "gpt-5", "litellm_params": {"model": "azure/gpt-5"}},
  {"model_name": "claude", "litellm_params": {"model": "bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0"}},
  {"model_name": "gemini", "litellm_params": {"model": "vertex_ai/gemini-2.5-pro"}}
]}`,
    yaml: `model_list:
  - model_name: gpt-5
    litellm_params:
      model: azure/gpt-5
  - model_name: claude
    litellm_params:
      model: bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0
  - model_name: gemini
    litellm_params:
      model: vertex_ai/gemini-2.5-pro`,
  };
  let digest = "";
  let kinds: string[] = [];
  let feedProviders: string[] = [];
  let providerQuery = "";
  let everyProvider = true;
  let pasted = "";
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
      pasted = (params.get("models") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .join("\n");
      digest = preset.digest;
      everyProvider = parseModelList(pasted).every((m) => modelName(m) === m);
      builderOpen = true;
    }
    void load();
  });
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
  $: models = parseModelList(pasted);
  $: providerMatches = providers.filter((id) => {
    const q = providerQuery.trim().toLowerCase();
    return !q || id.includes(q) || providerName(id).toLowerCase().includes(q);
  });
  $: followed = everyProvider ? [...new Set(models.map(modelName))] : models;
  $: url = feedUrl({
    kinds,
    providers: feedProviders,
    models: followed,
    digest,
  });
  $: slackCommand = `/feed subscribe ${url}`;
  $: changedKeys = new Set(
    items.flatMap((item) => item.entries.flatMap((e) => [...listingKeys(e)])),
  );
  $: seen = followed.filter((id) => changedKeys.has(modelKey(id))).length;
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
  function showExample(format: keyof typeof EXAMPLES) {
    pasted = EXAMPLES[format];
    track("Changelog Feed Example Shown", { format });
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
  <details
    class="subscribe"
    bind:open={builderOpen}
    on:toggle={() => builderOpen && track("Changelog Feed Builder Opened")}
  >
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
      <div class="paste">
        <div class="paste-head">
          <label for="feed-models">Models</label>
          <span class="examples"
            >Example: <button type="button" on:click={() => showExample("json")}
              >/model/info JSON</button
            >
            <button type="button" on:click={() => showExample("yaml")}
              >config.yaml</button
            ></span
          >
        </div>
        <textarea
          id="feed-models"
          bind:value={pasted}
          rows="4"
          placeholder="Paste your proxy's /model/info or /v1/models JSON, its config.yaml, or model ids and names one per line"
        ></textarea>
        <label class="check"
          ><input
            type="checkbox"
            bind:checked={everyProvider}
            on:change={() =>
              track("Changelog Feed Builder Changed", {
                field: "everyProvider",
                value: everyProvider,
              })}
          /> Follow these models on every provider</label
        >
        <span class="hint"
          >{#if models.length}{`Following ${shownNames}${everyProvider ? " on every provider" : " as pasted"}, ${seen} changed in the last 30 days.`}{:else}Run
            <code>curl $PROXY/model/info -H "Authorization: Bearer $KEY"</code>
            and paste the response, or paste the model_list from your config.yaml.{/if}</span
        >
      </div>
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
        With the switch on, each pasted id becomes its catalog name, so a
        Bedrock <code>anthropic.claude-sonnet-4-5-20250929-v1:0</code> follows
        Claude Sonnet 4.5 on Azure and Vertex too. Off, ids match on their last
        path segment, so <code>azure/gpt-5</code> follows <code>gpt-5</code>. A
        time window posts once it closes and the catalog has rebuilt, up to 15
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
  .builder textarea {
    font: inherit;
    font-size: 12px;
    color: inherit;
    border: 1px solid var(--hf-line);
    border-radius: var(--control-radius);
    padding: 10px 14px;
    background: var(--hf-bg);
    resize: vertical;
  }
  .builder .providers {
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
  .builder .paste {
    display: grid;
    gap: 6px;
    font-size: 12px;
    color: var(--hf-muted);
  }
  .paste-head {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .examples button {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    font-size: 12px;
    color: var(--hf-accent);
    text-decoration: underline;
    cursor: pointer;
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
  .hint code {
    font-size: 11px;
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
