const reply = (status: number, ok = false) =>
  Response.json({ ok }, { status, headers: { "Cache-Control": "no-store" } });

export function createFeedbackHandler(now = Date.now) {
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const clients = new Map<string, number[]>();
  let global: number[] = [];

  return async (request: Request): Promise<Response> => {
    const origin = new URL(request.url).origin;
    if (request.headers.get("origin") !== origin) return reply(403);
    if (
      request.headers.get("content-type")?.split(";")[0] !== "application/json"
    )
      return reply(415);

    const time = now();
    for (const [ip, times] of clients) {
      const active = times.filter((at) => at > time - day);
      if (active.length) clients.set(ip, active);
      else clients.delete(ip);
    }
    global = global.filter((at) => at > time - hour);
    const ip =
      ["x-vercel-forwarded-for", "x-forwarded-for", "x-real-ip"]
        .map((header) => request.headers.get(header)?.split(",")[0].trim())
        .find(Boolean) || "unknown";
    const daily = clients.get(ip) || [];
    const recent = daily.filter((at) => at > time - 10 * minute);
    const waits = [
      recent.length >= 3 ? recent[0] + 10 * minute - time : 0,
      daily.length >= 10 ? daily[0] + day - time : 0,
      global.length >= 30 ? global[0] + hour - time : 0,
    ];
    const retryAfter = Math.ceil(Math.max(...waits) / 1000);
    if (retryAfter > 0)
      return Response.json(
        { ok: false },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(retryAfter),
          },
        },
      );
    clients.set(ip, [...daily, time]);
    global.push(time);
    return submit(request);
  };
}

export const POST = createFeedbackHandler();

async function submit(request: Request): Promise<Response> {
  const raw = await request.text();
  if (raw.length > 24000) return reply(413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400);
  }
  if (!body || typeof body !== "object") return reply(400);
  const { message, page, contact, purpose } = body as Record<string, unknown>;
  if (typeof message !== "string" || !message.trim() || message.length > 5000)
    return reply(400);
  if (
    purpose !== undefined &&
    (typeof purpose !== "string" || purpose.length > 1000)
  )
    return reply(400);
  if (
    contact !== undefined &&
    (typeof contact !== "string" || contact.length > 500)
  )
    return reply(400);
  if (
    typeof page !== "string" ||
    page.length > 500 ||
    !/^\/[a-zA-Z0-9/_.,~%+-]*$/.test(page)
  )
    return reply(400);

  // Keep the destination server-side: never expose an ingest URL to the browser.
  const destination = process.env.FEEDBACK_WEBHOOK_URL;
  if (!destination) return reply(503);
  try {
    const url = new URL(destination);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "hooks.zapier.com" ||
      url.username ||
      url.password
    )
      return reply(503);
    const result = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "models_feedback",
        message: message.trim(),
        purpose: typeof purpose === "string" ? purpose.trim() : "",
        contact: typeof contact === "string" ? contact.trim() : "",
        page,
        timestamp: new Date().toISOString(),
      }),
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    return result.ok ? reply(200, true) : reply(502);
  } catch {
    // Do not log the webhook URL or visitor's feedback/contact details.
    return reply(502);
  }
}
