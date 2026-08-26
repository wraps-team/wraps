import { type NextRequest, NextResponse } from "next/server";
import {
  hasMarkdown,
  markdownUrlFor,
  pageForMarkdownUrl,
  prefersMarkdown,
} from "@/lib/agent-content-paths";
import { setAttributionCookie } from "@/lib/attribution";

export async function middleware(request: NextRequest) {
  const accept = request.headers.get("accept") ?? "";

  // /mcp is two things at one URL: the product page for people, and the
  // Streamable HTTP MCP endpoint for agents. Method and Accept separate them —
  // anything that is not a document request goes to the JSON-RPC handler.
  if (isMcpTransportRequest(request, accept)) {
    return NextResponse.rewrite(new URL("/api/mcp", request.nextUrl.origin));
  }

  const { pathname } = request.nextUrl;

  // A `.md` URL is a request for markdown however it was typed — no header
  // needed. This is the form agents guess first, and the one the Link header
  // below points at.
  const markdownUrlTarget = pageForMarkdownUrl(pathname);
  if (markdownUrlTarget !== undefined) {
    return withAttribution(
      request,
      markdownRewrite(request, markdownUrlTarget)
    );
  }

  // AI crawlers do not send Accept: text/markdown, and they are exactly who
  // the markdown is for.
  const wantsMarkdown =
    accept.includes("text/markdown") ||
    prefersMarkdown(request.headers.get("user-agent") ?? "");
  const isCovered = hasMarkdown(pathname);

  const response = routeResponse(request, { wantsMarkdown, isCovered });

  if (!wantsMarkdown && isCovered) {
    // Tell agents a markdown representation exists — pointing at the `.md`
    // URL, which serves markdown to anyone. Advertising this path instead sent
    // them back to the HTML they already had.
    response.headers.set(
      "Link",
      `<${markdownUrlFor(pathname)}>; rel="alternate"; type="text/markdown"`
    );
  }

  // Campaign traffic lands on wraps.dev, not app.wraps.dev, so this is the only
  // place first touch can be recorded. The cookie is domain-scoped so the
  // dashboard reads it back at signup.
  setAttributionCookie(request, response);

  return response;
}

const PRICING_PATH = "/pricing";

function routeResponse(
  request: NextRequest,
  { wantsMarkdown, isCovered }: { wantsMarkdown: boolean; isCovered: boolean }
): NextResponse {
  // /pricing is the #pricing section of the homepage, not a page of its own,
  // so a plain GET used to 404 on the most-guessed URL on the site. The
  // redirect lives here rather than in next.config because config redirects
  // resolve before middleware, which would swallow markdown negotiation.
  if (request.nextUrl.pathname === PRICING_PATH && !wantsMarkdown) {
    return NextResponse.redirect(new URL("/#pricing", request.nextUrl.origin));
  }
  if (wantsMarkdown && isCovered) {
    return markdownRewrite(request, request.nextUrl.pathname);
  }
  return NextResponse.next();
}

const MCP_PATHS = new Set(["/mcp", "/mcp/"]);

function isMcpTransportRequest(request: NextRequest, accept: string): boolean {
  if (!MCP_PATHS.has(request.nextUrl.pathname)) {
    return false;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return true;
  }
  // A browser always asks for text/html. An MCP client asking for a stream or
  // for JSON is not after the marketing page.
  if (accept.includes("text/html")) {
    return false;
  }
  return (
    accept.includes("text/event-stream") || accept.includes("application/json")
  );
}

function markdownRewrite(request: NextRequest, page: string): NextResponse {
  // Route the request to /api/md/<path> so dynamic route params carry the page
  // path. An uncovered page still goes here on purpose: the route answers with
  // a markdown 404 that names where to look instead.
  const mdPath = page === "/" ? "/api/md/root" : `/api/md${page}`;

  return NextResponse.rewrite(new URL(mdPath, request.nextUrl.origin));
}

/**
 * Attribution has to be recorded on whichever response is returned, including
 * the early ones — campaign traffic lands on wraps.dev, not app.wraps.dev, so
 * this is the only place first touch can be seen.
 */
function withAttribution(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  setAttributionCookie(request, response);
  return response;
}

export const config = {
  // Match all pages; exclude static assets, API routes, and Next.js internals.
  // `.well-known` and `.txt` are excluded because agents — the clients most
  // likely to send `Accept: text/markdown` — are exactly who reads the
  // discovery documents served there, and rewriting those to markdown returned
  // llms.txt instead of the OAuth metadata, api-catalog, or robots.txt.
  matcher: [
    "/((?!_next|api|ingest|\\.well-known|.*\\.(?:txt|js|css|png|jpg|jpeg|gif|webp|avif|svg|ico|woff|woff2|ttf|mp4|pdf|zip)).*)",
  ],
};
