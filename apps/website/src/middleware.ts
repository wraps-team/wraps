import { type NextRequest, NextResponse } from "next/server";
import { setAttributionCookie } from "@/lib/attribution";

export async function middleware(request: NextRequest) {
  const accept = request.headers.get("accept") ?? "";
  const response = accept.includes("text/markdown")
    ? markdownRewrite(request)
    : NextResponse.next();

  // Campaign traffic lands on wraps.dev, not app.wraps.dev, so this is the only
  // place first touch can be recorded. The cookie is domain-scoped so the
  // dashboard reads it back at signup.
  setAttributionCookie(request, response);

  return response;
}

function markdownRewrite(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  // Route the request to /api/md/<path> so dynamic route params carry the page path
  const mdPath = pathname === "/" ? "/api/md/root" : `/api/md${pathname}`;
  const mdUrl = new URL(mdPath, request.nextUrl.origin);

  return NextResponse.rewrite(mdUrl);
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
