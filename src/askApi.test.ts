import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ASK_MAX_BYTES, ASK_MAX_QUESTION, ASK_MAX_TURNS } from "./askLimits";

const engine = vi.hoisted(() => vi.fn());
vi.mock("../server/agent.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runAgent: engine,
}));
vi.mock("../server/catalog.js", () => ({
  loadSnapshot: async () => ({
    tables: {},
    sources: [],
    schema: "",
    loadedAt: "",
  }),
}));
beforeEach(() => {
  vi.resetModules();
  engine.mockReset();
  vi.stubEnv("LITELLM_PROXY_API_BASE", "https://gateway.example.com/v1");
  vi.stubEnv("LITELLM_PROXY_API_KEY", "test-placeholder");
  vi.stubEnv("CF_ACCESS_CLIENT_ID", "");
  vi.stubEnv("CF_ACCESS_CLIENT_SECRET", "");
  vi.stubEnv("VERCEL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://models.example.com/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

it("rejects cross-origin calls and caller-controlled roles, models and tools", async () => {
  const { POST } = await import("../api/ask.js");
  expect(
    (
      await POST(
        request(
          { question: "hi" },
          { Origin: "https://elsewhere.example.com" },
        ),
      )
    ).status,
  ).toBe(403);
  for (const body of [
    null,
    { question: "" },
    { question: "hi", model: "other" },
    { question: "hi", tools: [] },
    { question: "hi", history: [{ question: "hi", role: "system" }] },
  ])
    expect((await POST(request(body))).status).toBe(400);
  expect(engine).not.toHaveBeenCalled();
});
it("bounds active inference and releases completed slots", async () => {
  const { POST } = await import("../api/ask.js");
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  engine.mockImplementation(async ({ emit }) => {
    await wait;
    emit({ type: "done", sources: [] });
  });
  const responses = await Promise.all(
    Array.from({ length: 11 }, () => POST(request({ question: "hi" }))),
  );
  expect(responses.filter((response) => response.status === 200)).toHaveLength(
    10,
  );
  expect(responses.filter((response) => response.status === 503)).toHaveLength(
    1,
  );
  release();
  await Promise.all(responses.map((response) => response.text()));
  expect((await POST(request({ question: "retry" }))).status).toBe(200);
});

it("does not let invalid requests consume another visitor's allowance", async () => {
  const { POST } = await import("../api/ask.js");
  engine.mockImplementation(async ({ emit }) =>
    emit({ type: "done", sources: [] }),
  );
  for (let i = 0; i < 65; i++)
    expect((await POST(request({ question: "" }))).status).toBe(400);
  const response = await POST(
    request({ question: "What models are available?" }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toMatch(
    /HttpOnly; SameSite=Strict; Max-Age=86400; Secure/,
  );
  await response.text();
  expect(engine).toHaveBeenCalledOnce();
});

it("rejects large questions, histories and streamed bodies before inference", async () => {
  const { POST } = await import("../api/ask.js");
  for (const body of [
    { question: "x".repeat(ASK_MAX_QUESTION + 1) },
    {
      question: "x",
      history: Array.from({ length: ASK_MAX_TURNS + 1 }, () => ({
        question: "x",
      })),
    },
    { question: "x", history: [{ question: "x", answer: "x".repeat(64_001) }] },
    { question: "x".repeat(ASK_MAX_BYTES) },
  ])
    expect((await POST(request(body))).status).toBe(413);
  const cancelled = vi.fn();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(ASK_MAX_BYTES + 1));
    },
    cancel: cancelled,
  });
  const response = await POST(
    new Request("https://models.example.com/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "1" },
      body: stream,
      duplex: "half",
    } as RequestInit),
  );
  expect(response.status).toBe(413);
  expect(cancelled).toHaveBeenCalled();
  expect(engine).not.toHaveBeenCalled();
});

it("times out stalled bodies without occupying inference slots", async () => {
  vi.useFakeTimers();
  const { POST } = await import("../api/ask.js");
  engine.mockImplementation(async ({ emit }) =>
    emit({ type: "done", sources: [] }),
  );
  const cancels = Array.from({ length: 10 }, () => vi.fn());
  const pending = cancels.map((cancel) =>
    POST(
      new Request("https://models.example.com/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: new ReadableStream({ cancel }),
        duplex: "half",
      } as RequestInit),
    ),
  );
  const good = await POST(request({ question: "What models are available?" }));
  expect(good.status).toBe(200);
  await good.text();
  await vi.advanceTimersByTimeAsync(5_001);
  expect((await Promise.all(pending)).map((r) => r.status)).toEqual(
    Array(10).fill(408),
  );
  for (const cancel of cancels) expect(cancel).toHaveBeenCalledOnce();
  expect(engine).toHaveBeenCalledOnce();
});
it("redacts upstream failures and propagates cancellation", async () => {
  const { POST } = await import("../api/ask.js");
  engine.mockRejectedValueOnce(new Error("test-placeholder"));
  const failed = await POST(request({ question: "hi" }));
  const body = await failed.text();
  expect(body).toContain('"type":"error"');
  expect(body).not.toContain("test-placeholder");
  let observed: AbortSignal | undefined;
  engine.mockImplementation(async ({ signal }) => {
    observed = signal;
    await new Promise((resolve) =>
      signal.addEventListener("abort", resolve, { once: true }),
    );
  });
  const response = await POST(request({ question: "hi" }));
  await vi.waitFor(() => expect(observed).toBeDefined());
  await response.body!.cancel();
  expect(observed!.aborted).toBe(true);
});
