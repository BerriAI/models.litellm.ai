import { gatewayConfig, runAgent, type Turn } from "../server/agent.js";
import { loadSnapshot } from "../server/catalog.js";
import { TRACE_CONTEXT_PATTERN } from "../server/tracing.js";
import {
  admitVisitor,
  readBody,
  RequestError,
  visitorIdentity,
} from "../server/admission.js";
import {
  ASK_ERRORS,
  ASK_MAX_HISTORY_ANSWER,
  ASK_MAX_QUESTION,
  ASK_MAX_TURNS,
} from "../src/askLimits.js";

const json = (
  status: number,
  error: string,
  headers: Record<string, string> = {},
  code?: string,
) =>
  Response.json(
    { error, ...(code ? { code } : {}) },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return json(403, "Origin not allowed.");
  if (
    !/^application\/json(?:;|$)/i.test(
      request.headers.get("content-type") || "",
    )
  )
    return json(415, "Use application/json.");
  let gateway;
  try {
    gateway = gatewayConfig(process.env);
  } catch {
    return json(503, "Ask AI is not configured.");
  }
  if (!gateway) return json(503, "Ask AI is not configured.");
  let body: { question: string; history?: Turn[]; traceContext?: string };
  try {
    body = (await readBody(request)) as typeof body;
    const valid = (turn: any) =>
      turn &&
      typeof turn.question === "string" &&
      turn.question.trim() &&
      (turn.answer === undefined || typeof turn.answer === "string") &&
      Object.keys(turn).every((key) => ["question", "answer"].includes(key));
    if (
      !body ||
      typeof body.question !== "string" ||
      !body.question.trim() ||
      Object.keys(body).some(
        (key) => !["question", "history", "traceContext"].includes(key),
      ) ||
      (body.traceContext !== undefined &&
        (typeof body.traceContext !== "string" ||
          !TRACE_CONTEXT_PATTERN.test(body.traceContext))) ||
      (body.history !== undefined &&
        (!Array.isArray(body.history) || !body.history.every(valid)))
    )
      return json(400, "Send a question and optional conversation history.");
    if (body.question.length > ASK_MAX_QUESTION)
      throw new RequestError(413, "question_too_long");
    if (
      (body.history?.length || 0) > ASK_MAX_TURNS ||
      body.history?.some(
        (turn) =>
          turn.question.length > ASK_MAX_QUESTION ||
          (turn.answer?.length || 0) > ASK_MAX_HISTORY_ANSWER,
      )
    )
      throw new RequestError(413, "history_too_long");
  } catch (error) {
    if (error instanceof RequestError)
      return json(
        error.status,
        ASK_ERRORS[error.code as keyof typeof ASK_ERRORS] || "Invalid JSON.",
        {},
        error.code,
      );
    return json(400, "Invalid JSON.");
  }
  if (request.signal.aborted) return json(408, ASK_ERRORS.body_timeout);
  const visitor = visitorIdentity(request, gateway.key);
  const headers: Record<string, string> = visitor.cookie
    ? { "Set-Cookie": visitor.cookie }
    : {};
  const admission = await admitVisitor(visitor.id);
  if ("status" in admission)
    return json(
      admission.status,
      admission.status === 429
        ? "You're asking quickly. Please wait briefly."
        : "The assistant is busy. Please try again shortly.",
      { ...headers, "Retry-After": String(admission.retryAfter) },
    );
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) controller.abort();
  const timeout = setTimeout(abort, 110_000);
  const signal = controller.signal;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(stream) {
      const emit = (event: unknown) => {
        signal.throwIfAborted();
        stream.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        emit({ type: "status", text: "Reading the catalog…" });
        const snapshot = await loadSnapshot();
        await runAgent({
          question: body.question,
          history: body.history || [],
          traceContext: body.traceContext,
          snapshot,
          gateway,
          signal,
          emit,
        });
      } catch {
        if (!signal.aborted)
          emit({
            type: "error",
            text: "The answer could not finish. Please try again.",
          });
      } finally {
        clearTimeout(timeout);
        request.signal.removeEventListener("abort", abort);
        admission.release();
        try {
          stream.close();
        } catch {
          /* Client disconnected. */
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });
  return new Response(stream, {
    headers: {
      ...headers,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
