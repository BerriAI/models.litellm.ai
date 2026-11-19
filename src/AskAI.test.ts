// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { tick } from "svelte";
import AskAI from "./AskAI.svelte";

let chat: AskAI;
afterEach(() => {
  chat?.$destroy();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

it("streams an answer without a source footer and copies only the answer", async () => {
  const answer = "**Alpha** costs $1 per million input tokens.";
  const events = [
    { type: "delta", text: answer },
    {
      type: "done",
      sources: [
        { id: 1, title: "Catalog data", url: "https://example.com/data" },
      ],
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
        ),
    ),
  );
  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const track = vi.fn();
  chat = new AskAI({ target: document.body, props: { trackEvent: track } });
  await chat.openPanel();
  const input = document.querySelector("textarea")!;
  input.value = "What does Alpha cost?";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
  document
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { cancelable: true }));
  await vi.waitFor(() =>
    expect(track).toHaveBeenCalledWith("AI Answer Completed"),
  );
  expect(document.querySelector(".ai-answer strong")?.textContent).toBe(
    "Alpha",
  );
  expect(document.querySelector("details")).toBeNull();
  expect(document.body.textContent).not.toContain("Catalog data");
  document
    .querySelector<HTMLButtonElement>('[aria-label="Copy answer"]')!
    .click();
  await vi.waitFor(() => expect(copy).toHaveBeenCalledWith(answer));
  expect(track).toHaveBeenCalledWith("AI Answer Copied");
});
