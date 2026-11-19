// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { tick } from "svelte";
import AskAI from "./AskAI.svelte";

let chat: AskAI;
afterEach(() => {
  chat?.$destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

it("shows a cooldown without retrying automatically, then lets the visitor retry", async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response("edge rate limit", {
        status: 429,
        headers: { "Retry-After": "3" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        'data: {"type":"delta","text":"An actual answer."}\n\ndata: {"type":"done","sources":[]}\n\n',
      ),
    );
  vi.stubGlobal("fetch", fetchMock);
  const trackEvent = vi.fn();
  chat = new AskAI({ target: document.body, props: { trackEvent } });
  await chat.openPanel();
  const input = document.querySelector("textarea")!;
  input.value = "Which models are available?";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
  document
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { cancelable: true }));
  await vi.advanceTimersByTimeAsync(1);
  await tick();
  const retry = document.querySelector<HTMLButtonElement>(".ai-error button")!;
  expect(retry.textContent).toBe("Retry in 3s");
  expect(retry.disabled).toBe(true);
  retry.click();
  await vi.advanceTimersByTimeAsync(3_000);
  await tick();
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(retry.textContent).toBe("Retry");
  expect(retry.disabled).toBe(false);
  retry.click();
  await vi.advanceTimersByTimeAsync(1);
  await tick();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(document.querySelector(".ai-answer")?.textContent).toContain(
    "An actual answer.",
  );
  expect(trackEvent).toHaveBeenCalledWith("AI Question Throttled", {
    retry_after_seconds: 3,
  });
});

it("shows actionable input errors without displaying arbitrary server text", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "question_too_long",
          error: "dummy-private-diagnostic",
        }),
        { status: 413, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
  chat = new AskAI({ target: document.body, props: { trackEvent: vi.fn() } });
  await chat.openPanel();
  const input = document.querySelector("textarea")!;
  input.value = "A long question";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
  document
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { cancelable: true }));
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain(
      "Keep your question under 8,000 characters.",
    ),
  );
  expect(document.body.textContent).not.toContain("dummy-private-diagnostic");
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

it("drafts an incomplete starter without sending, and sends capability help as a real question", async () => {
  const fetchMock = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        'data: {"type":"delta","text":"I can compare models."}\n\ndata: {"type":"done","sources":[]}\n\n',
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  chat = new AskAI({ target: document.body, props: { trackEvent: vi.fn() } });
  await chat.openPanel();
  const buttons = () => [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ];
  buttons()
    .find((b) => b.textContent?.includes("Show me models on…"))!
    .click();
  await tick();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(document.querySelector("textarea")!.value).toBe("Show me models on ");
  expect(document.activeElement).toBe(document.querySelector("textarea"));
  buttons()
    .find((b) => b.textContent?.includes("What can I ask?"))!
    .click();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
    question: "What can I ask?",
    history: [],
  });
  await vi.waitFor(() =>
    expect(document.querySelector(".ai-answer")?.textContent).toContain(
      "I can compare models.",
    ),
  );
  expect(document.querySelector(".ai-question")?.textContent).toBe(
    "What can I ask?",
  );
});

it("renders reported capabilities and includes visual facts in copying and follow-up history", async () => {
  const model = {
    id: "seller/alpha",
    name: "Alpha",
    provider: "Seller",
    href: "/models/alpha",
    input: "$0/M",
    output: "—",
    context: 1000,
    capabilities: [
      { key: "supports_new_feature", label: "New feature", supported: true },
      { key: "supports_vision", label: "Vision", supported: false },
    ],
  };
  const events = [
    {
      type: "view",
      view: { type: "model_cards", title: "Alpha", models: [model] },
    },
    { type: "delta", text: "Here is Alpha." },
    { type: "done", sources: [] },
  ];
  const fetchMock = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  chat = new AskAI({ target: document.body, props: { trackEvent: vi.fn() } });
  await chat.openPanel();
  const send = async (question: string) => {
    const input = document.querySelector("textarea")!;
    input.value = question;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { cancelable: true }));
  };
  await send("Show Alpha");
  await vi.waitFor(() =>
    expect(document.querySelector(".capabilities")?.textContent).toContain(
      "New feature",
    ),
  );
  expect(document.querySelector(".capabilities")?.textContent).toContain("No");
  document
    .querySelector<HTMLButtonElement>('[aria-label="Copy answer"]')!
    .click();
  await vi.waitFor(() => expect(copy).toHaveBeenCalled());
  expect(copy.mock.calls[0][0]).toContain("New feature: Yes");
  await send("Compare its prices");
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(
    JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).history[0].answer,
  ).toContain("Vision: No");
});
