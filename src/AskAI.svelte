<script lang="ts">
  import { onDestroy, tick, createEventDispatcher } from "svelte";
  import { marked } from "marked";
  import DOMPurify from "dompurify";
  import { track } from "./analytics";
  import { streamData } from "./aiStream";
  import AIView from "./AIView.svelte";
  import { viewText, type AnswerView } from "./aiViews";
  import { ASK_ERRORS } from "./askLimits";

  export let trackEvent = track;
  type Turn = {
    question: string;
    answer: string;
    complete: boolean;
    views: AnswerView[];
    error?: string;
  };
  const dispatch = createEventDispatcher<{ change: boolean }>();
  let open = false,
    question = "",
    busy = false,
    status = "",
    copied = -1,
    copyError = "";
  let turns: Turn[] = [];
  let traceContext: string | undefined;
  let input: HTMLTextAreaElement,
    panel: HTMLElement,
    conversation: HTMLDivElement;
  let controller: AbortController | undefined;
  let returnFocus: HTMLElement | null = null;
  let stickToBottom = true;
  let expanded = false;
  let retrySeconds = 0;
  let cooldownTimer: ReturnType<typeof setInterval> | undefined;
  function cooldown(value: string | null) {
    const seconds =
      value && /^\d+$/.test(value)
        ? Number(value)
        : value
          ? Math.ceil((Date.parse(value) - Date.now()) / 1000)
          : 60;
    retrySeconds = Number.isFinite(seconds)
      ? Math.max(1, Math.min(300, seconds))
      : 60;
    const until = Date.now() + retrySeconds * 1000;
    clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
      retrySeconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      if (!retrySeconds) clearInterval(cooldownTimer);
    }, 250);
  }
  const starters = [
    { label: "Show me models on…", prefix: "Show me models on " },
    { label: "Find models with…", prefix: "Find models with " },
    { label: "Compare…", prefix: "Compare " },
  ];
  function draft(prefix: string, index: number) {
    question = prefix;
    trackEvent("AI Starter Selected", { starter_index: index });
    input?.focus({ preventScroll: true });
  }
  async function help() {
    if (busy || retrySeconds) return;
    trackEvent("AI Capabilities Asked");
    const response = send("What can I ask?");
    await tick();
    input?.focus({ preventScroll: true });
    await response;
  }
  const answerText = (turn: Turn) =>
    [turn.answer, ...turn.views.map(viewText)].filter(Boolean).join("\n\n");
  export async function openPanel(prefix?: string) {
    if (prefix !== undefined) question = prefix;
    returnFocus = document.activeElement as HTMLElement;
    open = true;
    dispatch("change", true);
    trackEvent("AI Chat Opened");
    await tick();
    input?.focus({ preventScroll: true });
  }
  function close() {
    open = false;
    dispatch("change", false);
    trackEvent("AI Chat Closed");
    returnFocus?.focus();
  }
  function clear() {
    if (busy) return;
    turns = [];
    traceContext = undefined;
    copyError = "";
    trackEvent("AI Conversation Cleared");
    input?.focus({ preventScroll: true });
  }
  function keyboard(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (event.key === "Tab" && matchMedia("(max-width: 640px)").matches) {
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(
          "button:not([disabled]), textarea, a[href], summary",
        ),
      );
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }
  function render(turn: Turn) {
    return DOMPurify.sanitize(marked.parse(turn.answer, { async: false }), {
      ALLOWED_TAGS: [
        "p",
        "br",
        "strong",
        "em",
        "del",
        "code",
        "pre",
        "blockquote",
        "ul",
        "ol",
        "li",
        "h2",
        "h3",
        "h4",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
        "a",
        "hr",
      ],
      ALLOWED_ATTR: ["href", "title"],
      ALLOW_DATA_ATTR: false,
    });
  }
  function answerClick(event: MouseEvent) {
    if ((event.target as Element)?.closest("a"))
      trackEvent("AI Answer Link Opened");
  }
  async function copy(turn: Turn, index: number) {
    copyError = "";
    try {
      await navigator.clipboard.writeText(answerText(turn));
      copied = index;
      trackEvent("AI Answer Copied");
      setTimeout(() => {
        copied = -1;
      }, 1800);
    } catch {
      copyError = "Copy failed. You can select the answer and copy it.";
    }
  }
  async function scroll() {
    await tick();
    if (stickToBottom)
      conversation?.scrollTo({ top: conversation.scrollHeight });
  }
  async function send(message?: string) {
    if (!(message ?? question).trim() || busy || retrySeconds) return;
    const text = (message ?? question).trim();
    if (message === undefined) question = "";
    const history = turns
      .filter((turn) => turn.complete)
      .map((turn) => ({ question: turn.question, answer: answerText(turn) }));
    const turn: Turn = {
      question: text,
      answer: "",
      complete: false,
      views: [],
    };
    turns = [...turns, turn];
    busy = true;
    stickToBottom = true;
    status = "Reading the catalog…";
    controller = new AbortController();
    trackEvent("AI Question Submitted", { turn_count: turns.length });
    void scroll();
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history, traceContext }),
      });
      if (!response.ok || !response.body) {
        if (
          response.status === 429 ||
          (response.status === 503 && response.headers.has("Retry-After"))
        ) {
          cooldown(response.headers.get("Retry-After"));
          trackEvent("AI Question Throttled", {
            retry_after_seconds: retrySeconds,
          });
        }
        const detail = await response.json().catch(() => ({}));
        const known = Object.prototype.hasOwnProperty.call(
          ASK_ERRORS,
          detail?.code,
        )
          ? ASK_ERRORS[detail.code as keyof typeof ASK_ERRORS]
          : undefined;
        throw new Error(
          known ||
            (response.status === 429
              ? "You're asking quickly. Please wait briefly."
              : response.status === 503
                ? "The assistant is busy. Please try again shortly."
                : "The answer could not load. Please try again."),
        );
      }
      for await (const data of streamData(response.body, controller.signal)) {
        const event = JSON.parse(data);
        if (event.type === "trace") traceContext = event.context;
        if (event.type === "status") status = event.text;
        if (event.type === "delta") {
          turn.answer += event.text;
          status = "";
        }
        if (event.type === "reset") turn.answer = "";
        if (event.type === "view") turn.views = [...turn.views, event.view];
        if (event.type === "done") {
          turn.complete = true;
        }
        if (event.type === "error") throw new Error(event.text);
        turns = [...turns];
        void scroll();
      }
      if (!turn.complete)
        throw new Error(
          "The connection ended before the answer finished. Please retry.",
        );
      trackEvent("AI Answer Completed");
    } catch (error) {
      turn.error = controller.signal.aborted
        ? "Stopped."
        : error instanceof Error
          ? error.message
          : "The answer could not finish.";
      trackEvent("AI Answer Interrupted", {
        cancelled: controller.signal.aborted,
      });
    } finally {
      busy = false;
      status = "";
      turns = [...turns];
    }
  }
  function retry(turn: Turn) {
    if (busy || retrySeconds) return;
    question = turn.question;
    turns = turns.filter((item) => item !== turn);
    trackEvent("AI Question Retried");
    void send();
  }
  onDestroy(() => {
    controller?.abort();
    clearInterval(cooldownTimer);
  });
</script>

<svelte:window on:keydown={keyboard} />
{#if open}
  <aside
    id="models-ai-chat"
    bind:this={panel}
    class="ai-panel ph-no-capture"
    class:expanded
    data-mp-no-capture
    data-ai-chat
    aria-label="Ask AI"
  >
    <div class="ai-head">
      <h2>Ask AI</h2>
      <div class="ai-head-actions">
        <button
          type="button"
          class="ai-icon"
          title="What can I ask?"
          aria-label="What can I ask?"
          disabled={busy || retrySeconds > 0}
          on:click={help}
          ><svg viewBox="0 0 20 20" aria-hidden="true"
            ><circle cx="10" cy="10" r="7" /><path
              d="M8 7.5a2 2 0 1 1 3 1.7c-1 .5-1 1-1 1.8M10 14h.01"
            /></svg
          ></button
        >
        <button
          type="button"
          class="ai-icon ai-expand"
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          aria-pressed={expanded}
          on:click={() => {
            expanded = !expanded;
            trackEvent("AI Sidebar Resized", { expanded });
          }}
          ><svg viewBox="0 0 20 20" aria-hidden="true"
            >{#if expanded}<path
                d="M3 8h5V3m0 5L3 3m14 9h-5v5m0-5 5 5"
              />{:else}<path d="M7 3H3v4m0-4 5 5m5 9h4v-4m0 4-5-5" />{/if}</svg
          ></button
        >
        <button
          type="button"
          class="ai-icon"
          title="New conversation"
          aria-label="New conversation"
          disabled={busy || !turns.length}
          on:click={clear}
          ><svg viewBox="0 0 20 20" aria-hidden="true"
            ><path d="M10 4v12M4 10h12" /></svg
          ></button
        >
        <button
          type="button"
          class="ai-icon"
          title="Close chat"
          aria-label="Close chat"
          on:click={close}
          ><svg viewBox="0 0 20 20" aria-hidden="true"
            ><path d="m5 5 10 10M15 5 5 15" /></svg
          ></button
        >
      </div>
    </div>
    <div
      class="ai-conversation"
      bind:this={conversation}
      on:scroll={() => {
        stickToBottom =
          conversation.scrollHeight -
            conversation.scrollTop -
            conversation.clientHeight <
          70;
      }}
    >
      {#if !turns.length}
        <div class="ai-empty">
          <h3>Ask the catalog.</h3>
          <p>
            Find a model, compare prices, or make sense of what’s changed. Just
            ask.
          </p>
          <button
            class="ai-help"
            type="button"
            disabled={retrySeconds > 0}
            on:click={help}
            >What can I ask? <span aria-hidden="true">→</span></button
          >
          <div class="ai-starters">
            {#each starters as starter, index}<button
                type="button"
                on:click={() => draft(starter.prefix, index)}
                >{starter.label}<span aria-hidden="true">→</span></button
              >{/each}
          </div>
        </div>
      {/if}
      {#each turns as turn, index}
        <article class="ai-turn">
          <p class="ai-question">{turn.question}</p>
          <div class="ai-answer" on:click={answerClick} role="presentation">
            {@html render(turn)}
          </div>
          {#each turn.views as view}<AIView {view} {trackEvent} />{/each}
          {#if turn.answer || turn.views.length}
            <div class="ai-answer-footer">
              <button
                type="button"
                class="ai-icon"
                aria-label={copied === index ? "Answer copied" : "Copy answer"}
                title={copied === index ? "Copied" : "Copy answer"}
                on:click={() => copy(turn, index)}
                ><svg viewBox="0 0 20 20" aria-hidden="true"
                  >{#if copied === index}<path d="m4 10 4 4 8-8" />{:else}<rect
                      x="7"
                      y="7"
                      width="10"
                      height="10"
                      rx="2"
                    /><path d="M12 4V3H3v9h1" />{/if}</svg
                ></button
              >
            </div>
          {/if}
          {#if turn.error}<p class="ai-error" role="alert">
              {turn.error}
              {#if !busy}<button
                  type="button"
                  disabled={retrySeconds > 0}
                  on:click={() => retry(turn)}
                  >{retrySeconds
                    ? `Retry in ${retrySeconds}s`
                    : "Retry"}</button
                >{/if}
            </p>{/if}
        </article>
      {/each}
      {#if status}<p class="ai-status" role="status">{status}</p>{/if}
      {#if copyError}<p class="ai-error" role="status">{copyError}</p>{/if}
    </div>
    <form class="ai-composer" on:submit|preventDefault={() => send()}>
      <div class="ai-input-wrap">
        <textarea
          bind:this={input}
          bind:value={question}
          rows="2"
          aria-label="Ask about models"
          placeholder={turns.length ? "Ask a follow-up…" : "Ask about models…"}
          on:keydown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.isComposing
            ) {
              event.preventDefault();
              void send();
            }
          }}
        />
        {#if busy}<button
            type="button"
            class="ai-send"
            aria-label="Stop answer"
            title="Stop answer"
            on:click={() => controller?.abort()}
            ><svg viewBox="0 0 20 20" aria-hidden="true"
              ><rect x="6" y="6" width="8" height="8" /></svg
            ></button
          >{:else}<button
            type="submit"
            class="ai-send"
            disabled={!question.trim() || retrySeconds > 0}
            aria-label="Send question"
            title="Send question"
            ><svg viewBox="0 0 20 20" aria-hidden="true"
              ><path d="M10 16V4m-5 5 5-5 5 5" /></svg
            ></button
          >{/if}
      </div>
    </form>
  </aside>
{/if}

<style>
  .ai-panel {
    position: fixed;
    inset: var(--ai-header-height, 85px) 0 0 auto;
    width: 440px;
    z-index: 35;
    background: var(--hf-dialog);
    border-left: 1px solid var(--hf-line);
    display: flex;
    flex-direction: column;
    color: var(--hf-ink);
    font-size: 13px;
  }
  .ai-panel.expanded {
    width: min(780px, calc(100vw - 64px));
  }
  .expanded .ai-conversation {
    padding-inline: 34px;
  }
  .ai-help {
    display: inline-flex;
    gap: 8px;
    border: 0;
    background: none;
    color: var(--hf-accent);
    padding: 0;
    margin-top: 20px;
    font-size: 12px;
  }
  .ai-starters {
    display: grid;
    margin-top: 34px;
  }
  .ai-starters button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    text-align: left;
    padding: 15px 0;
    border: 0;
    border-top: 1px solid var(--hf-line);
    background: none;
  }
  .ai-starters button:last-child {
    border-bottom: 1px solid var(--hf-line);
  }
  .ai-starters button:hover {
    color: var(--hf-accent);
  }
  .ai-head {
    min-height: 60px;
    padding: 0 22px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--hf-line);
  }
  .ai-head h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .ai-head-actions {
    display: flex;
    gap: 8px;
  }
  button {
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  button:focus-visible {
    outline: 2px solid var(--hf-ink);
    outline-offset: 3px;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .ai-icon {
    display: grid;
    place-items: center;
    background: none;
    color: var(--hf-muted);
    border: 0;
    padding: 5px;
    width: 28px;
    height: 28px;
    border-radius: 4px;
  }
  .ai-icon:hover {
    background: var(--hf-faint);
  }
  svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .ai-conversation {
    overflow-y: auto;
    scrollbar-gutter: stable;
    overscroll-behavior: contain;
    flex: 1;
    min-height: 0;
    padding: 24px 22px;
    scrollbar-width: thin;
  }
  .ai-empty {
    padding-top: 32px;
  }
  .ai-empty h3 {
    font-size: 23px;
    font-weight: 500;
    margin: 0 0 8px;
  }
  .ai-empty p {
    color: var(--hf-muted);
    line-height: 1.7;
    margin: 0;
  }
  .ai-turn + .ai-turn {
    margin-top: 28px;
    padding-top: 24px;
    border-top: 1px solid var(--hf-line);
  }
  .ai-question {
    background: var(--hf-bg);
    padding: 12px 14px;
    border-radius: 6px;
    line-height: 1.6;
    margin: 0 0 22px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .ai-answer {
    line-height: 1.7;
    overflow-wrap: anywhere;
    overflow-x: auto;
  }
  .ai-answer :global(p) {
    margin: 0 0 12px;
  }
  .ai-answer :global(h2),
  .ai-answer :global(h3),
  .ai-answer :global(h4) {
    font-size: 14px;
    margin: 18px 0 8px;
  }
  .ai-answer :global(ul),
  .ai-answer :global(ol) {
    padding-left: 20px;
  }
  .ai-answer :global(a) {
    color: var(--hf-accent);
  }
  .ai-answer :global(pre) {
    overflow-x: auto;
    padding: 12px;
    background: var(--hf-bg);
    border-radius: 6px;
    font-size: 12px;
  }
  .ai-answer :global(table) {
    border-collapse: collapse;
    font-size: 12px;
    margin: 14px 0;
    min-width: 100%;
  }
  .ai-answer :global(th),
  .ai-answer :global(td) {
    border-bottom: 1px solid var(--hf-line);
    text-align: left;
    padding: 9px 10px;
    vertical-align: top;
    min-width: 85px;
  }
  .ai-answer :global(th) {
    font-weight: 500;
    color: var(--hf-muted);
  }
  .ai-answer-footer {
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    margin-top: 10px;
  }
  .ai-status {
    color: var(--hf-muted);
    font-size: 12px;
    margin-top: 20px;
  }
  .ai-error {
    color: var(--hf-muted);
    line-height: 1.6;
  }
  .ai-error button {
    border: 0;
    background: none;
    color: var(--hf-accent);
    padding: 0 4px;
    text-decoration: underline;
  }
  .ai-composer {
    padding: 16px 18px max(16px, env(safe-area-inset-bottom));
    border-top: 1px solid var(--hf-line);
  }
  .ai-input-wrap {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    border: 1px solid var(--hf-line);
    border-radius: 6px;
    padding: 10px;
  }
  .ai-input-wrap:focus-within {
    border-color: var(--hf-ink);
  }
  textarea:focus-visible {
    outline: none;
  }
  textarea {
    flex: 1;
    width: 0;
    resize: none;
    outline: none;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    line-height: 1.6;
    padding: 0;
  }
  textarea::placeholder {
    color: var(--hf-muted);
  }
  .ai-send {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 4px;
    background: var(--hf-accent);
    color: var(--hf-button-ink);
  }
  @media (max-width: 640px) {
    .ai-panel,
    .ai-panel.expanded {
      width: 100%;
      border: 0;
    }
    .ai-expand {
      display: none;
    }
    .ai-conversation,
    .expanded .ai-conversation {
      padding: 20px;
    }
  }
</style>
