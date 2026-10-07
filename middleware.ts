/**
 * Vercel Routing Middleware: serves the markdown copy of a model page to
 * clients that ask for `Accept: text/markdown` (AI agents), so each model keeps
 * one URL. Static files win over vercel.json rewrites, which is why this can't
 * be a rewrite rule.
 */
export const config = { matcher: "/models/:path*" };

export default function middleware(request: Request): Response | undefined {
  if (!(request.headers.get("accept") ?? "").includes("text/markdown")) return undefined;
  const url = new URL(request.url);
  if (url.pathname === "/models" || /\.(md|json|xml|txt)$/.test(url.pathname)) return undefined;
  url.pathname = `${url.pathname.replace(/\/$/, "")}.md`;
  return new Response(null, { headers: { "x-middleware-rewrite": url.toString() } });
}
