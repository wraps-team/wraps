import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AGENT_CONTENT } from "@/lib/agent-content";
import { fetchDerivedMarkdown } from "@/lib/derive-markdown";
import { renderNotFoundMarkdown } from "@/lib/not-found-content";

// Vary on User-Agent as well as Accept: middleware routes AI crawlers here on
// the strength of their UA alone, and without this a CDN could hand a cached
// markdown response to the next browser that asks for the same page.
const MD_HEADERS = {
  "Content-Type": "text/markdown; charset=utf-8",
  Vary: "Accept, User-Agent",
  "Cache-Control": "public, max-age=3600",
} as const;

// A path can gain coverage at any time (AGENT_CONTENT grows). Don't let a CDN
// serve a stale 404 for up to an hour after that happens.
const NOT_FOUND_HEADERS = {
  "Content-Type": "text/markdown; charset=utf-8",
  Vary: "Accept, User-Agent",
  "Cache-Control": "no-store",
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  // "root" is a sentinel for "/" since Next.js dynamic routes can't match empty segments
  const pagePath =
    path[0] === "root" && path.length === 1 ? "/" : `/${path.join("/")}`;

  // Hand-authored markdown wins: it can carry things the HTML does not, like
  // the pricing tables generated from config.
  const authored = AGENT_CONTENT[pagePath];
  if (authored !== undefined) {
    return new NextResponse(authored, { headers: MD_HEADERS });
  }

  // Everything else is derived from the page's own render, so the ~110 routes
  // with no hand-authored entry answer with their content rather than a 404.
  const derived = await fetchDerivedMarkdown(pagePath, request.nextUrl.origin);
  if (derived !== undefined) {
    return new NextResponse(derived, { headers: MD_HEADERS });
  }

  // Reached only when the page genuinely does not exist, or rendered to nothing
  // worth serving.
  return new NextResponse(renderNotFoundMarkdown(pagePath), {
    status: 404,
    headers: NOT_FOUND_HEADERS,
  });
}
