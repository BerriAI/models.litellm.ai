// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";

it("creates one chat when repeated clicks overlap the initial import", async () => {
  document.body.innerHTML =
    '<header class="hf-header"><button data-ask-ai>Ask AI</button></header>';
  let finishImport!: () => void;
  const loading = new Promise<void>((resolve) => {
    finishImport = resolve;
  });
  const openPanel = vi.fn(async () => {});
  const construct = vi.fn();
  const importStarted = vi.fn();
  vi.doMock("./AskAI.svelte", async () => {
    importStarted();
    await loading;
    return {
      default: class {
        constructor() {
          construct();
        }
        $on() {}
        openPanel = openPanel;
      },
    };
  });
  const button = document.querySelector<HTMLButtonElement>("[data-ask-ai]")!;
  const listen = vi.spyOn(button, "addEventListener");
  await import("./ask-ai-entry");
  const click = listen.mock.calls.find(
    ([event]) => event === "click",
  )![1] as () => Promise<void>;
  const first = click();
  await vi.waitFor(() => expect(importStarted).toHaveBeenCalled());
  const pending = [first, click(), click()];
  finishImport();
  await Promise.all(pending);
  expect(construct).toHaveBeenCalledTimes(1);
  expect(openPanel).toHaveBeenCalledTimes(1);
  expect(button.disabled).toBe(false);
  await click();
  expect(openPanel).toHaveBeenCalledTimes(2);
  expect(construct).toHaveBeenCalledTimes(1);
});
