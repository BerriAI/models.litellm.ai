/**
 * Vercel Routing Middleware. Serves the markdown copy of a model, comparison,
 * ranking or new-models page to clients that ask for `Accept: text/markdown`
 * (AI agents), so each page keeps one URL, sends /compare/<b>-vs-<a> to the one URL each pair has (alphabetical),
 * and makes /404 itself answer 404. Static files win over vercel.json
 * rewrites, which is why neither can be a rewrite rule.
 * It also reports feed, markdown and llms.txt fetches to Mixpanel, since
 * feed readers and agents never run the page script.
 */
export const config = {
  matcher: ["/models/:path*", "/compare/:path*", "/rankings/:path*", "/new-models/:path*", "/deprecated-models/:path*", "/404", "/new-models.xml", "/deprecated-models.xml", "/changelog.xml", "/llms.txt", "/llms-full.txt"],
};

const INDEXES_WITHOUT_MARKDOWN = new Set(["/models", "/rankings", "/new-models"]);

/** A path with no file behind it: Vercel answers it with 404.html and a real 404 status. */
export const NOT_FOUND_PATH = "/__not-found";

interface Context {
  waitUntil(promise: Promise<unknown>): void;
}

/** The Mixpanel event for a fetch no browser script will see, if it is one. */
export function machineFetchEvent(path: string): string | undefined {
  if (path.endsWith(".xml")) return "Feed Fetched";
  if (path.endsWith(".md")) return "Markdown Fetched";
  if (/^\/llms(-full)?\.txt$/.test(path)) return "llms.txt Fetched";
  return undefined;
}

/** One anonymous id per client (hash of IP and user agent), so repeat fetches by one reader or agent line up. */
async function trackFetch(request: Request, event: string, path: string, via: string): Promise<void> {
  const token = process.env.VITE_MIXPANEL_TOKEN;
  if (!token) return;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
  const userAgent = request.headers.get("user-agent") ?? "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${userAgent}`));
  const id = [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
  await fetch("https://api.mixpanel.com/track", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/plain" },
    body: JSON.stringify([
      {
        event,
        properties: {
          token,
          distinct_id: `fetch:${id}`,
          time: Date.now(),
          $insert_id: crypto.randomUUID(),
          ip,
          path,
          via,
          user_agent: userAgent,
          referrer: request.headers.get("referer") ?? "",
          surface: "server",
        },
      },
    ]),
  });
}

function report(request: Request, context: Context | undefined, event: string, path: string, via: string): void {
  context?.waitUntil(trackFetch(request, event, path, via).catch(() => undefined));
}

export default function middleware(request: Request, context?: Context): Response | undefined {
  const page = new URL(request.url);
  const fetched = machineFetchEvent(page.pathname);
  if (fetched) report(request, context, fetched, page.pathname, "url");
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
  if (INDEXES_WITHOUT_MARKDOWN.has(page.pathname.replace(/\/$/, "")) || (page.pathname.startsWith("/compare") && !pair) || /\.(md|json|xml|txt)$/.test(page.pathname)) return undefined;
  page.pathname = `${page.pathname.replace(/\/$/, "")}.md`;
  report(request, context, "Markdown Fetched", page.pathname, "accept_header");
  return new Response(null, { headers: { "x-middleware-rewrite": page.toString() } });
}
