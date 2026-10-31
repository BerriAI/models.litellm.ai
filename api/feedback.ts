const reply = (status: number, ok = false) =>
  Response.json({ ok }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  // Accept browser submissions only from the deployment serving the form.
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin) return reply(403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return reply(415);
  const raw = await request.text();
  if (raw.length > 24000) return reply(413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400);
  }
  if (!body || typeof body !== "object") return reply(400);
  const { message, page } = body as Record<string, unknown>;
  if (typeof message !== "string" || !message.trim() || message.length > 5000)
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
        page,
        timestamp: new Date().toISOString(),
      }),
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    return result.ok ? reply(200, true) : reply(502);
  } catch {
    // Do not log the webhook URL or visitor's message.
    return reply(502);
  }
}
