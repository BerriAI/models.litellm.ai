/**
 * Vercel Routing Middleware. Serves the markdown copy of a model page to
 * clients that ask for `Accept: text/markdown` (AI agents), so each model keeps
 * one URL, sends /compare/<b>-vs-<a> to the one URL each pair has (alphabetical),
 * and makes /404 itself answer 404. Static files win over vercel.json
 * rewrites, which is why neither can be a rewrite rule.
 */
export const config = { matcher: ["/models/:path*", "/compare/:path*", "/404"] };

/** A path with no file behind it: Vercel answers it with 404.html and a real 404 status. */
export const NOT_FOUND_PATH = "/__not-found";

export default function middleware(request: Request): Response | undefined {
  const page = new URL(request.url);
  // /404 is a real file (the not-found page), so without this it would answer 200.
  if (page.pathname === "/404") {
    page.pathname = NOT_FOUND_PATH;
    return new Response(null, { headers: { "x-middleware-rewrite": page.toString() } });
  }
  // One URL per comparison: the two model slugs in alphabetical order.
  const pair = /^\/compare\/(.+)-vs-(.+?)(\.md)?$/.exec(page.pathname);
  if (pair && !pair[1].includes("-vs-") && pair[1] > pair[2]) {
    page.pathname = `/compare/${pair[2]}-vs-${pair[1]}${pair[3] ?? ""}`;
    return Response.redirect(page.toString(), 301);
  }
  if (!(request.headers.get("accept") ?? "").includes("text/markdown")) return undefined;
  if (page.pathname === "/models" || page.pathname === "/compare" || /\.(md|json|xml|txt)$/.test(page.pathname)) return undefined;
  page.pathname = `${page.pathname.replace(/\/$/, "")}.md`;
  return new Response(null, { headers: { "x-middleware-rewrite": page.toString() } });
}
