import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSnapshot } from "../server/catalog.js";
import { runAgent, type Event } from "../server/agent.js";
import { AGENT_NAME, createTracing } from "../server/tracing.js";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-node";

const exported = vi.hoisted(() => ({
  spans: [] as ReadableSpan[],
  options: [] as { headers: Record<string, string> }[],
  fail: false,
}));
vi.mock("@opentelemetry/exporter-trace-otlp-proto", () => ({
  OTLPTraceExporter: class {
    constructor(options: { headers: Record<string, string> }) {
      exported.options.push(options);
    }
    export(
      spans: ReadableSpan[],
      callback: (result: { code: number }) => void,
    ) {
      exported.spans.push(...spans);
      callback({ code: exported.fail ? 1 : 0 });
    }
    async shutdown() {}
  },
}));

const gateway = {
  base: "https://gateway.example.com/v1",
  key: "example-inference-credential",
  clientId: "example-access-id",
  clientSecret: "example-access-secret",
};
const tracingKey = "example-tracing-credential";
const snapshot = buildSnapshot(
  { "seller/model": { mode: "chat" } },
  {},
  {},
  {},
  {},
);
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
function response(tool: boolean, text = "One model.") {
  const delta = tool
    ? {
        tool_calls: [
          {
            index: 0,
            id: "query-1",
            type: "function",
            function: {
              name: "query_catalog",
              arguments: JSON.stringify({
                sql: "SELECT count(*) AS total FROM models",
              }),
            },
          },
        ],
      }
    : { content: text };
  return new Response(
    frame({
      id: tool ? "research-1" : "answer-1",
      model: "example-model",
      choices: [{ delta }],
    }) +
      frame({
        choices: [{ delta: {}, finish_reason: tool ? "tool_calls" : "stop" }],
      }) +
      frame({
        choices: [],
        usage: {
          prompt_tokens: 17,
          completion_tokens: 5,
          prompt_tokens_details: { cached_tokens: 3 },
        },
      }) +
      "data: [DONE]\n\n",
  );
}

beforeEach(() => {
  exported.spans.length = 0;
  exported.options.length = 0;
  exported.fail = false;
  vi.stubEnv("LITELLM_TRACING_KEY", tracingKey);
  vi.stubEnv(
    "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
    "https://lens.example.com/v1/traces",
  );
  vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_PROTOCOL", "http/protobuf");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("agent tracing", () => {
  it("exports a complete agent run with model usage and real catalog tool spans before returning", async () => {
    let calls = 0;
    const events: Event[] = [];
    await runAgent({
      question: "How many models?",
      history: [{ question: "Earlier", answer: "Context" }],
      snapshot,
      gateway,
      signal: new AbortController().signal,
      emit: (event) => events.push(event),
      fetchImpl: async (_url, init) => {
        expect(JSON.parse(String(init?.body)).stream_options).toEqual({
          include_usage: true,
        });
        return response(calls++ === 0);
      },
    });
    expect(calls).toBe(2);
    expect(events.at(-1)).toEqual({ type: "done", sources: [] });
    expect(exported.spans).toHaveLength(6);
    const root = exported.spans.find((span) => span.name === AGENT_NAME)!;
    const turn = exported.spans.find((span) => span.name === "answer")!;
    const user = exported.spans.find((span) => span.name === "user message")!;
    expect(root.resource.attributes["service.name"]).toBe(AGENT_NAME);
    expect(turn.parentSpanContext?.spanId).toBe(root.spanContext().spanId);
    for (const span of [root, turn, user]) {
      expect(span.attributes["input.value"]).toBe("How many models?");
      expect(span.attributes["input.mime_type"]).toBe("text/plain");
    }
    expect(user.attributes["lens.capture.source"]).toBe("session_transcript");
    expect(turn.attributes["output.value"]).toBe("One model.");
    for (const child of exported.spans.filter(
      (span) => span !== root && span !== turn,
    )) {
      expect(child.spanContext().traceId).toBe(root.spanContext().traceId);
      expect(child.parentSpanContext?.spanId).toBe(turn.spanContext().spanId);
    }
    const tool = exported.spans.find((span) => span.name === "query_catalog")!;
    expect(JSON.parse(String(tool.attributes["output.value"])).rows).toEqual([
      { total: 1 },
    ]);
    const model = exported.spans.find(
      (span) => span.attributes["gen_ai.response.id"] === "answer-1",
    )!;
    const messages = JSON.parse(String(model.attributes["input.value"]));
    expect(JSON.parse(messages[1].content)).toEqual({
      question: "How many models?",
      history: [{ question: "Earlier", answer: "Context" }],
    });
    expect(model.attributes).toMatchObject({
      "lens.capture.messages_separate": true,
      "gen_ai.usage.input_tokens": 17,
      "gen_ai.usage.output_tokens": 5,
      "gen_ai.usage.cache_read.input_tokens": 3,
      "gen_ai.response.model": "example-model",
    });
  });

  it("redacts configured credentials and uses only the dedicated tracing credential for export", async () => {
    const content = [
      gateway.key,
      gateway.clientId,
      gateway.clientSecret,
      tracingKey,
    ].join(" ");
    await runAgent({
      question: content,
      history: [],
      snapshot,
      gateway,
      signal: new AbortController().signal,
      emit() {},
      fetchImpl: async () => response(false, content),
    });
    const attributes = JSON.stringify(
      exported.spans.map((span) => span.attributes),
    );
    for (const secret of content.split(" "))
      expect(attributes).not.toContain(secret);
    expect(attributes).toContain("[REDACTED]");
    expect(exported.options[0].headers).toEqual({
      Authorization: `Bearer ${tracingKey}`,
    });
  });

  it("keeps concurrent runs separate and preserves answers when the exporter fails", async () => {
    exported.fail = true;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const answers = await Promise.all(
      ["first", "second"].map(async (question) => {
        const events: Event[] = [];
        await runAgent({
          question,
          history: [],
          snapshot,
          gateway,
          signal: new AbortController().signal,
          emit: (event) => events.push(event),
          fetchImpl: async () => response(false, question),
        });
        expect(events.at(-1)?.type).toBe("done");
        return events
          .flatMap((event) => (event.type === "delta" ? [event.text] : []))
          .join("");
      }),
    );
    expect(answers).toEqual(["first", "second"]);
    const roots = exported.spans.filter((span) => span.name === AGENT_NAME);
    expect(new Set(roots.map((span) => span.spanContext().traceId)).size).toBe(
      2,
    );
    for (const root of roots) {
      const children = exported.spans.filter(
        (span) => span.parentSpanContext?.spanId === root.spanContext().spanId,
      );
      expect(children).toHaveLength(1);
      expect(children[0].attributes["output.value"]).toBe(
        root.attributes["input.value"],
      );
    }
    expect(warning).toHaveBeenCalledWith("Lens trace export failed.");
  });

  it("exports failure status and flushes when inference fails", async () => {
    await expect(
      runAgent({
        question: "Question",
        history: [],
        snapshot,
        gateway,
        signal: new AbortController().signal,
        emit() {},
        fetchImpl: async () => new Response(null, { status: 503 }),
      }),
    ).rejects.toThrow("The model is unavailable");
    expect(exported.spans).toHaveLength(4);
    expect(
      exported.spans
        .filter((span) => span.name !== "user message")
        .every((span) => span.status.code === 2),
    ).toBe(true);
    expect(
      exported.spans.find((span) => span.name === "user message")!.status.code,
    ).toBe(1);
  });

  it("joins follow-ups across request lifetimes while keeping fresh conversations separate", async () => {
    const bodies: string[] = [];
    const run = async (question: string, traceContext?: string) => {
      let nextContext: string | undefined;
      await runAgent({
        question,
        history: traceContext
          ? [{ question: "First", answer: "First answer" }]
          : [],
        traceContext,
        snapshot,
        gateway,
        signal: new AbortController().signal,
        emit(event) {
          if (event.type === "trace") nextContext = event.context;
        },
        fetchImpl: async (_url, init) => {
          bodies.push(String(init?.body));
          return response(false, question);
        },
      });
      return nextContext!;
    };
    const context = await run("First");
    expect(context).toMatch(/^[a-f0-9]{32}\.[a-f0-9]{16}\.[A-Za-z0-9_-]{43}$/);
    expect(await run("Follow-up", context)).toBe(context);
    const freshContext = await run("First");
    expect(freshContext).not.toBe(context);
    const [traceId, parentId] = context.split(".");
    const conversation = exported.spans.filter(
      (span) => span.spanContext().traceId === traceId,
    );
    expect(
      conversation.filter((span) => span.name === AGENT_NAME),
    ).toHaveLength(1);
    const turns = conversation.filter((span) => span.name === "answer");
    expect(turns).toHaveLength(2);
    expect(
      turns.every((span) => span.parentSpanContext?.spanId === parentId),
    ).toBe(true);
    expect(turns.map((span) => span.attributes["output.value"])).toEqual([
      "First",
      "Follow-up",
    ]);
    expect(
      conversation
        .filter((span) => span.name === "user message")
        .map((span) => span.attributes["input.value"]),
    ).toEqual(["First", "Follow-up"]);
    expect(
      new Set(conversation.map((span) => span.spanContext().spanId)).size,
    ).toBe(conversation.length);
    expect(bodies.join("")).not.toContain(context);
    expect(
      JSON.stringify(exported.spans.map((span) => span.attributes)),
    ).not.toContain(context);
  });

  it("starts a separate trace for forged parents and references signed with a different key", async () => {
    let context = "";
    const first = createTracing(gateway);
    await first.conversation(
      {
        question: "First",
        onContext: (value) => {
          context = value;
        },
      },
      async () => {},
    );
    await first.shutdown();
    const [traceId, spanId, mac] = context.split(".");
    const forged = [
      `${traceId}.${spanId}.${mac[0] === "A" ? "B" : "A"}${mac.slice(1)}`,
      `${"0".repeat(32)}.${spanId}.${mac}`,
      `${traceId}.${"0".repeat(16)}.${mac}`,
    ];
    for (const value of forged) {
      const tracing = createTracing(gateway);
      await tracing.conversation(
        {
          context: value,
          question: "Other",
          onContext: (next) => {
            expect(next.split(".")[0]).not.toBe(traceId);
          },
        },
        async () => {},
      );
      await tracing.shutdown();
    }
    vi.stubEnv("LITELLM_TRACING_KEY", "example-rotated-tracing-credential");
    const rotated = createTracing(gateway);
    await rotated.conversation(
      {
        context,
        question: "After rotation",
        onContext: (next) => {
          expect(next.split(".")[0]).not.toBe(traceId);
        },
      },
      async () => {},
    );
    await rotated.shutdown();
  });

  it("does not export with incomplete, invalid, or shared inference credentials", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const env of [
      {},
      { LITELLM_TRACING_KEY: tracingKey },
      {
        LITELLM_TRACING_KEY: gateway.key,
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:
          "https://lens.example.com/v1/traces",
      },
      {
        LITELLM_TRACING_KEY: tracingKey,
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:
          "http://untrusted.example/v1/traces",
      },
      {
        LITELLM_TRACING_KEY: tracingKey,
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:
          "https://lens.example.com/v1/traces?secret=value",
      },
    ]) {
      const tracing = createTracing(gateway, env);
      expect(await tracing.span("run", {}, async () => "still works")).toBe(
        "still works",
      );
      await tracing.shutdown();
    }
    expect(exported.options).toHaveLength(0);
  });
});
