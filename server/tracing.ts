import { AsyncLocalStorage } from "node:async_hooks";
import {
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type AttributeValue,
  type Span,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  NodeTracerProvider,
} from "@opentelemetry/sdk-trace-node";
import type { Gateway } from "./agent.js";

export const AGENT_NAME = "litellm-models-agent";
type TraceSpan = { setAttributes(values: Attributes): void };
export type Tracing = {
  span<T>(
    name: string,
    attributes: Attributes,
    work: (span: TraceSpan) => Promise<T>,
  ): Promise<T>;
  shutdown(): Promise<void>;
};
const disabled: Tracing = {
  span: (_name, _attributes, work) => work({ setAttributes() {} }),
  shutdown: async () => {},
};

export function createTracing(gateway: Gateway, env = process.env): Tracing {
  const endpoint = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  const key = env.LITELLM_TRACING_KEY;
  if (!endpoint || !key) return disabled;
  const secrets = [
    gateway.key,
    gateway.clientId,
    gateway.clientSecret,
    key,
  ].filter((value): value is string => Boolean(value));
  try {
    const url = new URL(endpoint);
    const protocol =
      env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL || env.OTEL_EXPORTER_OTLP_PROTOCOL;
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["127.0.0.1", "localhost"].includes(url.hostname)
        )) ||
      key === gateway.key ||
      key === gateway.clientId ||
      key === gateway.clientSecret ||
      (protocol && protocol !== "http/protobuf")
    )
      throw new Error("Invalid tracing configuration");
    const exporter = new OTLPTraceExporter({
      url: url.href,
      headers: { Authorization: `Bearer ${key}` },
      timeoutMillis: 2000,
    });
    const provider = new NodeTracerProvider({
      resource: resourceFromAttributes({ "service.name": AGENT_NAME }),
      spanProcessors: [
        new BatchSpanProcessor(
          {
            export(spans, callback) {
              exporter.export(spans, (result) => {
                if (result.code !== 0)
                  console.warn("Lens trace export failed.");
                callback(result);
              });
            },
            shutdown: () => exporter.shutdown(),
          },
          {
            maxQueueSize: 256,
            maxExportBatchSize: 64,
            scheduledDelayMillis: 5000,
            exportTimeoutMillis: 3000,
          },
        ),
      ],
      forceFlushTimeoutMillis: 3500,
    });
    const tracer = provider.getTracer(AGENT_NAME);
    const active = new AsyncLocalStorage<Span>();
    const clean = (text: string) =>
      secrets.reduce(
        (value, secret) => value.replaceAll(secret, "[REDACTED]"),
        text,
      );
    const attributes = (values: Attributes): Attributes =>
      Object.fromEntries(
        Object.entries(values)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(
            ([name, value]) =>
              [
                name,
                typeof value === "string"
                  ? clean(value)
                  : Array.isArray(value)
                    ? value.map((item) =>
                        typeof item === "string" ? clean(item) : item,
                      )
                    : value,
              ] as [string, AttributeValue | undefined],
          ),
      );
    return {
      async span(name, values, work) {
        const parent = active.getStore();
        const span = tracer.startSpan(
          name,
          {
            attributes: attributes(values),
            kind:
              values["openinference.span.kind"] === "LLM"
                ? SpanKind.CLIENT
                : SpanKind.INTERNAL,
          },
          parent ? trace.setSpan(ROOT_CONTEXT, parent) : ROOT_CONTEXT,
        );
        try {
          const result = await active.run(span, () =>
            work({
              setAttributes: (values) => span.setAttributes(attributes(values)),
            }),
          );
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: "Agent operation failed",
          });
          throw error;
        } finally {
          span.end();
        }
      },
      async shutdown() {
        try {
          await provider.shutdown();
        } catch {
          console.warn("Lens trace export did not complete.");
        }
      },
    };
  } catch {
    console.warn(
      "Lens tracing is disabled. Check the tracing endpoint, protocol, and dedicated key.",
    );
    return disabled;
  }
}
