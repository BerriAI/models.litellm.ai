import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { checkRateLimit } from "@vercel/firewall";
import { ASK_MAX_BYTES } from "../src/askLimits.js";

export class RequestError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/** Count streamed bytes, including when Content-Length is absent or misleading. */
export async function readBody(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length && Number(length) > ASK_MAX_BYTES)
    throw new RequestError(413, "body_too_large");
  if (!request.body) throw new RequestError(400, "invalid_json");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let timer: ReturnType<typeof setTimeout>;
  let rejectRead: (reason: unknown) => void;
  const interrupted = new Promise<never>((_, reject) => {
    rejectRead = reject;
  });
  const stop = (error: RequestError) => {
    rejectRead(error);
    // A stalled stream's cancel promise must not keep the request open.
    void reader.cancel().catch(() => {});
  };
  const abort = () => stop(new RequestError(408, "body_timeout"));
  request.signal.addEventListener("abort", abort, { once: true });
  timer = setTimeout(abort, 5_000);
  try {
    if (request.signal.aborted) throw new RequestError(408, "body_timeout");
    let bytes = 0,
      text = "";
    while (true) {
      const { done, value } = await Promise.race([reader.read(), interrupted]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > ASK_MAX_BYTES) throw new RequestError(413, "body_too_large");
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

const VISITOR_SECONDS = 86_400;
const WINDOW_MS = 60_000;
const VISITOR_REQUESTS = 10;
type Bucket = { started: number; count: number; active: number };
const visitors = new Map<string, Bucket>();
let active = 0;
let lastWarning = 0;

/** Signed, HttpOnly, one-day visitor cookie; no account, fingerprint or IP storage. */
export function visitorIdentity(
  request: Request,
  key: string,
  now = Date.now(),
) {
  const secure = new URL(request.url).protocol === "https:";
  const name = secure ? "__Host-models-ai" : "models-ai-local";
  const sign = (value: string) =>
    createHmac("sha256", key)
      .update(`models-ai/visitor/v1:${value}`)
      .digest("base64url");
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (token && /^[a-f0-9-]{36}\.\d{10}\.[A-Za-z0-9_-]{43}$/.test(token)) {
    const [id, expires, signature] = token.split(".");
    const expiry = Number(expires);
    if (
      expiry > now / 1000 &&
      expiry <= now / 1000 + VISITOR_SECONDS &&
      timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(sign(`${id}.${expires}`)),
      )
    ) {
      return { id, cookie: undefined };
    }
  }
  const id = randomUUID();
  const value = `${id}.${Math.floor(now / 1000) + VISITOR_SECONDS}`;
  return {
    id,
    cookie: `${name}=${value}.${sign(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${VISITOR_SECONDS}${secure ? "; Secure" : ""}`,
  };
}

type Admission =
  | { release: () => void }
  | { status: 429 | 503; retryAfter: number };

/** Local capacity/fallback guards complement Vercel's shared visitor counter. */
export async function admitVisitor(id: string): Promise<Admission> {
  const now = Date.now();
  for (const [key, bucket] of visitors)
    if (!bucket.active && now - bucket.started >= WINDOW_MS)
      visitors.delete(key);
  let bucket = visitors.get(id);
  if (!bucket) {
    // Bound bookkeeping under cookie churn. Never evict an active visitor.
    if (visitors.size >= 4096) {
      const oldest = [...visitors].find(([, b]) => !b.active);
      if (oldest) visitors.delete(oldest[0]);
    }
    bucket = { started: now, count: 0, active: 0 };
    visitors.set(id, bucket);
  }
  if (now - bucket.started >= WINDOW_MS) {
    bucket.started = now;
    bucket.count = 0;
  }
  if (bucket.count >= VISITOR_REQUESTS)
    return {
      status: 429,
      retryAfter: Math.max(
        1,
        Math.ceil((bucket.started + WINDOW_MS - now) / 1000),
      ),
    };
  if (bucket.active >= 2) return { status: 429, retryAfter: 3 };
  if (active >= 10) return { status: 503, retryAfter: 3 };
  bucket.count++;
  bucket.active++;
  active++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    bucket.active--;
    active--;
  };
  if (process.env.VERCEL === "1") {
    try {
      // Pin the destination to deployment configuration, never a caller's Host.
      // Forward no cookies, authorization headers, prompts or user-provided URLs.
      const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
      if (!host || !/^[a-zA-Z0-9.-]+$/.test(host))
        throw new Error("Missing firewall host");
      const result = await checkRateLimit("models-ai-visitor", {
        rateLimitKey: id,
        headers: new Headers({ host }),
        timeout: 1_000,
      });
      if (result.rateLimited) {
        release();
        return { status: 429, retryAfter: 60 };
      }
      if (result.error) throw new Error("Firewall rule unavailable");
    } catch {
      // Preserve public access during a firewall API outage. Local limits, the
      // edge IP rule, and the dedicated gateway budget remain independent.
      if (now - lastWarning >= WINDOW_MS) {
        lastWarning = now;
        console.warn(
          "Models AI shared visitor limit unavailable; local limits remain active.",
        );
      }
    }
  }
  return { release };
}
