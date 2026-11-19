import { afterEach, beforeEach, expect, it, vi } from "vitest";

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
});
afterEach(() => vi.unstubAllEnvs());
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
it("holds concurrency slots while requests are being read and releases failed slots", async () => {
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
  expect(responses.filter((response) => response.status === 429)).toHaveLength(
    1,
  );
  release();
  await Promise.all(responses.map((response) => response.text()));
  expect((await POST(request({ question: "retry" }))).status).toBe(200);
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
