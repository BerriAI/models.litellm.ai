import { gatewayConfig, runAgent, type Turn } from "../server/agent.js";
import { loadSnapshot } from "../server/catalog.js";

let active = 0,
  attempts = 0,
  windowStart = Date.now();
const json = (status: number, error: string) =>
  Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
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
  if (Date.now() - windowStart >= 60_000) {
    windowStart = Date.now();
    attempts = 0;
  }
  if (attempts >= 60 || active >= 10)
    return json(429, "Too many questions. Please try again shortly.");
  attempts++;
  active++;
  const invalid = (status: number, message: string) => {
    active--;
    return json(status, message);
  };
  let body: { question: string; history?: Turn[] };
  try {
    body = await request.json();
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
      Object.keys(body).some((key) => !["question", "history"].includes(key)) ||
      (body.history !== undefined &&
        (!Array.isArray(body.history) || !body.history.every(valid)))
    )
      return invalid(400, "Send a question and optional conversation history.");
  } catch {
    return invalid(400, "Invalid JSON.");
  }
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
        active--;
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
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
