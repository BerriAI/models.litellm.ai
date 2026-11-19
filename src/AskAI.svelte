<script lang="ts">
  import { onDestroy, tick, createEventDispatcher } from "svelte";
  import { marked } from "marked";
  import DOMPurify from "dompurify";
  import { track } from "./analytics";
  import { streamData } from "./aiStream";

  export let trackEvent = track;
  type Source = { id: number; title: string; url: string };
  type Turn = {
    question: string;
    answer: string;
    sources: Source[];
    complete: boolean;
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
  let input: HTMLTextAreaElement,
    panel: HTMLElement,
    conversation: HTMLDivElement;
  let controller: AbortController | undefined;
  let returnFocus: HTMLElement | null = null;
  let stickToBottom = true;
  export async function openPanel() {
    returnFocus = document.activeElement as HTMLElement;
    open = true;
    dispatch("change", true);
    trackEvent("AI Chat Opened");
    await tick();
    input?.focus();
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
    copyError = "";
    trackEvent("AI Conversation Cleared");
    input?.focus();
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
    const text = turn.answer.replace(/\[(\d+)\](?!\()/g, (match, id) => {
      const source = turn.sources.find((source) => source.id === Number(id));
      return source ? `[${match}](${source.url})` : match;
    });
    return DOMPurify.sanitize(marked.parse(text, { async: false }), {
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
      const sources = turn.sources
        .map((source) => `[${source.id}] ${source.title}: ${source.url}`)
        .join("\n");
      await navigator.clipboard.writeText(
        turn.answer + (sources ? `\n\n${sources}` : ""),
      );
      copied = index;
      trackEvent("AI Answer Copied", { source_count: turn.sources.length });
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
  async function send() {
    if (!question.trim() || busy) return;
    const text = question.trim();
    question = "";
    const history = turns
      .filter((turn) => turn.complete)
      .map(({ question, answer }) => ({ question, answer }));
    const turn: Turn = {
      question: text,
      answer: "",
      sources: [],
      complete: false,
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
        body: JSON.stringify({ question: text, history }),
      });
      if (!response.ok || !response.body)
        throw new Error(
          response.status === 429
            ? "Too many questions. Please try again shortly."
            : response.status === 503
              ? "Ask AI is unavailable right now. Please try again later."
              : "The answer could not load. Please try again.",
        );
      for await (const data of streamData(response.body, controller.signal)) {
        const event = JSON.parse(data);
        if (event.type === "status") status = event.text;
        if (event.type === "delta") {
          turn.answer += event.text;
          status = "";
        }
        if (event.type === "reset") turn.answer = "";
        if (event.type === "done") {
          turn.sources = event.sources;
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
      trackEvent("AI Answer Completed", { source_count: turn.sources.length });
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
    question = turn.question;
    turns = turns.filter((item) => item !== turn);
    trackEvent("AI Question Retried");
    void send();
  }
  onDestroy(() => controller?.abort());
</script>

<svelte:window on:keydown={keyboard} />
{#if open}
  <aside
    id="models-ai-chat"
    bind:this={panel}
    class="ai-panel ph-no-capture"
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
          <h3>Find the right model.</h3>
          <p>Ask about prices, capabilities, new releases, or deprecations.</p>
        </div>
      {/if}
      {#each turns as turn, index}
        <article class="ai-turn">
          <p class="ai-question">{turn.question}</p>
          <div class="ai-answer" on:click={answerClick} role="presentation">
            {@html render(turn)}
          </div>
          {#if turn.answer}
            <div class="ai-answer-footer">
              {#if turn.sources.length}
                <details
                  on:toggle={(event) => {
                    if (event.currentTarget.open)
                      trackEvent("AI Sources Opened", {
                        source_count: turn.sources.length,
                      });
                  }}
                >
                  <summary
                    >{turn.sources.length}
                    {turn.sources.length === 1 ? "source" : "sources"}</summary
                  >
                  <ul>
                    {#each turn.sources as source}<li>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          on:click={() =>
                            trackEvent("AI Source Opened", {
                              source_id: source.id,
                            })}>{source.title}</a
                        >
                      </li>{/each}
                  </ul>
                </details>
              {:else}<span></span>{/if}
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
              {#if !busy}<button type="button" on:click={() => retry(turn)}
                  >Retry</button
                >{/if}
            </p>{/if}
        </article>
      {/each}
      {#if status}<p class="ai-status" role="status">{status}</p>{/if}
      {#if copyError}<p class="ai-error" role="status">{copyError}</p>{/if}
    </div>
    <form class="ai-composer" on:submit|preventDefault={send}>
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
            disabled={!question.trim()}
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
    width: 410px;
    z-index: 35;
    background: var(--hf-dialog);
    border-left: 1px solid var(--hf-line);
    display: flex;
    flex-direction: column;
    color: var(--hf-ink);
    font-size: 13px;
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
  button:focus-visible,
  textarea:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--hf-accent);
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
    font-size: 18px;
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
  .ai-answer :global(a),
  details a {
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
    justify-content: space-between;
    gap: 14px;
    margin-top: 10px;
  }
  details {
    font-size: 11px;
    color: var(--hf-muted);
    padding-top: 6px;
  }
  summary {
    cursor: pointer;
  }
  details ul {
    padding-left: 17px;
    line-height: 1.8;
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
    border-color: var(--hf-accent);
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
    .ai-panel {
      width: 100%;
      border: 0;
    }
    .ai-conversation {
      padding: 20px;
    }
  }
</style>
