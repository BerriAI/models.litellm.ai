// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { tick } from "svelte";

it("creates one chat during overlapping opens and returns focus to its trigger on Escape", async () => {
  document.body.innerHTML =
    '<header class="hf-header"><button data-ask-ai>Ask AI</button></header>';
  let finishImport!: () => void;
  const loading = new Promise<void>((resolve) => {
    finishImport = resolve;
  });
  const construct = vi.fn();
  const importStarted = vi.fn();
  const track = vi.fn();
  window.litellmTrack = track;
  let chat: import("./AskAI.svelte").default | undefined;
  vi.doMock("./AskAI.svelte", async () => {
    const { default: AskAI } =
      await vi.importActual<typeof import("./AskAI.svelte")>("./AskAI.svelte");
    importStarted();
    await loading;
    return {
      default: class extends AskAI {
        constructor(options: ConstructorParameters<typeof AskAI>[0]) {
          super(options);
          construct();
          chat = this;
        }
      },
    };
  });
  const button = document.querySelector<HTMLButtonElement>("[data-ask-ai]")!;
  const listen = vi.spyOn(button, "addEventListener");
  await import("./ask-ai-entry");
  const click = listen.mock.calls.find(
    ([event]) => event === "click",
  )![1] as () => Promise<void>;
  try {
    button.focus();
    const first = click();
    await vi.waitFor(() => expect(importStarted).toHaveBeenCalled());
    expect.soft(button.disabled).toBe(false);
    expect.soft(document.activeElement).toBe(button);
    const pending = [first, click(), click()];
    finishImport();
    await Promise.all(pending);
    expect(construct).toHaveBeenCalledTimes(1);
    expect(
      track.mock.calls.filter(([event]) => event === "AI Chat Opened"),
    ).toHaveLength(1);
    for (let cycle = 0; cycle < 2; cycle++) {
      expect(document.querySelectorAll("[data-ai-chat]")).toHaveLength(1);
      expect(document.activeElement).toBe(document.querySelector("textarea"));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await tick();
      expect(document.querySelector("[data-ai-chat]")).toBeNull();
      expect(document.activeElement).toBe(button);
      expect(button.getAttribute("aria-expanded")).toBe("false");
      if (cycle === 0) await click();
    }
    expect(construct).toHaveBeenCalledTimes(1);
  } finally {
    finishImport();
    chat?.$destroy();
    vi.doUnmock("./AskAI.svelte");
    vi.restoreAllMocks();
    delete window.litellmTrack;
    document.body.innerHTML = "";
  }
});
