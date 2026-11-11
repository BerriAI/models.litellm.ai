// Keep the retired endpoint explicit for cached pages and direct callers.
export async function POST(_request: Request): Promise<Response> {
  return Response.json(
    { ok: false },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
