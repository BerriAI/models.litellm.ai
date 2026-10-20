/**
 * Vercel Routing Middleware. Serves the markdown copy of a model page to
 * clients that ask for `Accept: text/markdown` (AI agents), so each model keeps
 * one URL, and makes /404 itself answer 404. Static files win over vercel.json
 * rewrites, which is why neither can be a rewrite rule.
 */
export const config = { matcher: ["/models/:path*", "/404"] };

/** A path with no file behind it: Vercel answers it with 404.html and a real 404 status. */
export const NOT_FOUND_PATH = "/__not-found";

export default function middleware(request: Request): Response | undefined {
  const page = new URL(request.url);
  // /404 is a real file (the not-found page), so without this it would answer 200.
  if (page.pathname === "/404") {
    page.pathname = NOT_FOUND_PATH;
    return new Response(null, { headers: { "x-middleware-rewrite": page.toString() } });
  }
  if (!(request.headers.get("accept") ?? "").includes("text/markdown")) return undefined;
  const url = new URL(request.url);
  if (url.pathname === "/models" || /\.(md|json|xml|txt)$/.test(url.pathname)) return undefined;
  url.pathname = `${url.pathname.replace(/\/$/, "")}.md`;
  return new Response(null, { headers: { "x-middleware-rewrite": url.toString() } });
}
