<script lang="ts">
  import { tick } from "svelte";
  import {
    getProviderDisplayName,
    getProviderInitial,
    getProviderLogo,
  } from "./providers";

  export let providers: string[] = [];
  export let selectedProvider = "";

  let isOpen = false;
  let searchQuery = "";
  let activeIndex = 0;
  let container: HTMLDivElement;
  let trigger: HTMLButtonElement;
  let searchInput: HTMLInputElement;

  function normalizeSearch(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[_\s-]+/g, " ");
  }

  $: normalizedQuery = normalizeSearch(searchQuery);
  $: filteredProviders = providers.filter((provider) =>
    [provider, getProviderDisplayName(provider)].some((name) =>
      normalizeSearch(name).includes(normalizedQuery),
    ),
  );
  $: options = ["", ...filteredProviders];

  async function toggle() {
    isOpen = !isOpen;
    if (isOpen) {
      searchQuery = "";
      await tick();
      activeIndex = Math.max(0, options.indexOf(selectedProvider));
      searchInput.focus();
      container
        .querySelector(`#provider-option-${activeIndex}`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }

  function close() {
    isOpen = false;
    trigger.focus();
  }

  function select(provider: string) {
    selectedProvider = provider;
    searchQuery = "";
    close();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      activeIndex = (activeIndex + direction + options.length) % options.length;
      container
        .querySelector(`#provider-option-${activeIndex}`)
        ?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      const provider = options[activeIndex];
      if (provider !== undefined) select(provider);
    }
  }

  function handleTriggerKeydown(event: KeyboardEvent) {
    if (isOpen && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (
      !isOpen &&
      (event.key === "ArrowDown" || event.key === "ArrowUp")
    ) {
      event.preventDefault();
      toggle();
    }
  }

  function handleClickOutside(event: MouseEvent) {
    if (event.target instanceof Node && !container.contains(event.target)) {
      isOpen = false;
    }
  }

  function handleFocusOut(event: FocusEvent) {
    if (!container.contains(event.relatedTarget as Node)) isOpen = false;
  }

  function updateQuery(event: Event) {
    searchQuery = (event.currentTarget as HTMLInputElement).value;
    activeIndex = searchQuery.trim() ? 1 : 0;
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div
  class="provider-dropdown"
  bind:this={container}
  on:focusout={handleFocusOut}
>
  <button
    class="dropdown-trigger"
    class:open={isOpen}
    bind:this={trigger}
    on:click={toggle}
    on:keydown={handleTriggerKeydown}
    aria-haspopup="listbox"
    aria-expanded={isOpen}
    title={selectedProvider
      ? getProviderDisplayName(selectedProvider)
      : "All providers"}
    type="button"
  >
    {#if selectedProvider && getProviderLogo(selectedProvider)}
      <img
        src={getProviderLogo(selectedProvider)}
        alt=""
        class="provider-icon"
      />
    {:else}
      <svg
        class="all-providers-icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect
          x="14"
          y="3"
          width="7"
          height="7"
          rx="1.5"
        /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect
          x="14"
          y="14"
          width="7"
          height="7"
          rx="1.5"
        />
      </svg>
    {/if}
    <span class="provider-name"
      >{selectedProvider
        ? getProviderDisplayName(selectedProvider)
        : "All providers"}</span
    >
    <svg
      class="dropdown-chevron"
      width="12"
      height="12"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      aria-hidden="true"
    >
      <path d="m6 8 4 4 4-4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>

  {#if isOpen}
    <div class="dropdown-menu">
      <div class="provider-search">
        <svg
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <circle cx="8.5" cy="8.5" r="5.5" /><path
            d="m13 13 4 4"
            stroke-linecap="round"
          />
        </svg>
        <input
          class="provider-search-input"
          bind:this={searchInput}
          value={searchQuery}
          on:input={updateQuery}
          on:keydown={handleKeydown}
          role="combobox"
          aria-label="Search providers"
          aria-expanded="true"
          aria-controls="provider-options"
          aria-autocomplete="list"
          aria-activedescendant={options[activeIndex] !== undefined
            ? `provider-option-${activeIndex}`
            : undefined}
          placeholder="Find a provider…"
          autocomplete="off"
          spellcheck="false"
        />
        <kbd aria-hidden="true">esc</kbd>
      </div>
      <div
        class="dropdown-options"
        id="provider-options"
        role="listbox"
        aria-label="Providers"
      >
        {#each options as provider, index (provider)}
          <button
            id={`provider-option-${index}`}
            class="dropdown-option"
            class:all-providers={!provider}
            class:selected={selectedProvider === provider}
            class:active={activeIndex === index}
            role="option"
            aria-selected={selectedProvider === provider}
            tabindex="-1"
            on:click={() => select(provider)}
            on:mousemove={() => {
              activeIndex = index;
            }}
            type="button"
          >
            {#if !provider}
              <svg
                class="all-providers-icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect
                  x="14"
                  y="3"
                  width="7"
                  height="7"
                  rx="1.5"
                /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect
                  x="14"
                  y="14"
                  width="7"
                  height="7"
                  rx="1.5"
                />
              </svg>
            {:else if getProviderLogo(provider)}
              <img
                src={getProviderLogo(provider)}
                alt=""
                class="provider-icon"
              />
            {:else}
              <span class="provider-initial" aria-hidden="true"
                >{getProviderInitial(provider)}</span
              >
            {/if}
            <span class="provider-name"
              >{provider
                ? getProviderDisplayName(provider)
                : "All providers"}</span
            >
            {#if selectedProvider === provider}
              <svg
                class="selection-check"
                width="15"
                height="15"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                aria-hidden="true"
              >
                <path
                  d="m4 10 4 4 8-8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            {/if}
          </button>
        {/each}
      </div>
      {#if filteredProviders.length === 0}
        <p class="no-results" role="status">No matching providers</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .provider-dropdown {
    position: relative;
    width: 100%;
    min-width: 0;
    font-family: "DM Sans", sans-serif;
  }
  .dropdown-trigger {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
    height: 38px;
    padding: 0 8px;
    border: 1px solid var(--border-color);
    border-radius: 7px;
    background: var(--card-bg);
    color: var(--text-color);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    transition:
      border-color 120ms,
      box-shadow 120ms;
  }
  .dropdown-trigger:hover {
    border-color: var(--border-color-strong);
  }
  .dropdown-trigger:focus-visible,
  .dropdown-trigger.open {
    outline: none;
    border-color: var(--border-color-strong);
    box-shadow: 0 0 0 2px var(--focus-ring);
  }
  .provider-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .provider-icon {
    width: 18px;
    height: 18px;
    object-fit: contain;
    flex-shrink: 0;
    padding: 1px;
    background: #fff;
    border-radius: 3px;
    box-sizing: content-box;
  }
  .all-providers-icon,
  .dropdown-chevron {
    color: var(--muted-color);
    flex-shrink: 0;
  }
  .dropdown-chevron {
    transition: transform 120ms;
  }
  .open .dropdown-chevron {
    transform: rotate(180deg);
  }
  .dropdown-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 50;
    width: max(100%, 260px);
    max-width: calc(100vw - 40px);
    overflow: hidden;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: var(--card-bg);
    box-shadow:
      0 12px 32px -8px rgb(15 23 42 / 18%),
      0 2px 6px rgb(15 23 42 / 5%);
  }
  .provider-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    color: var(--muted-color);
    border-bottom: 1px solid var(--border-color);
  }
  .provider-search > svg {
    flex-shrink: 0;
  }
  .provider-search-input {
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    outline: 0;
    border-radius: 0;
    background: transparent;
    color: var(--text-color);
    font: inherit;
    font-size: 12px;
    line-height: 20px;
    box-shadow: none;
  }
  .provider-search-input::placeholder {
    color: var(--muted-color);
  }
  kbd {
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 0 4px;
    color: var(--muted-color);
    font: inherit;
    font-size: 10px;
    line-height: 17px;
  }
  .dropdown-options {
    max-height: 280px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    padding: 5px;
  }
  .dropdown-option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 36px;
    padding: 8px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text-color);
    font: inherit;
    font-size: 12px;
    line-height: 20px;
    text-align: left;
    cursor: pointer;
  }
  .dropdown-option.active {
    background: var(--hover-bg);
  }
  .dropdown-option.selected {
    color: var(--litellm-primary);
    background: color-mix(in srgb, var(--litellm-primary) 7%, transparent);
  }
  .dropdown-option:focus-visible {
    outline: 2px solid var(--litellm-primary);
    outline-offset: -2px;
  }
  .all-providers {
    margin-bottom: 4px;
  }
  .provider-initial {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: var(--bg-tertiary);
    color: var(--muted-color);
    font-size: 10px;
    font-weight: 600;
    flex-shrink: 0;
  }
  .selection-check {
    margin-left: auto;
    flex-shrink: 0;
  }
  .no-results {
    margin: 0;
    padding: 14px 12px 18px;
    color: var(--muted-color);
    font-size: 12px;
    text-align: center;
  }
  @media (max-width: 1099px) {
    .dropdown-menu {
      left: auto;
      right: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .dropdown-trigger,
    .dropdown-chevron {
      transition: none;
    }
  }
</style>
