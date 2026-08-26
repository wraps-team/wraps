import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AGENT_CONTENT } from "@/lib/agent-content";
import { renderNotFoundMarkdown } from "@/lib/not-found-content";

const MD_HEADERS = {
  "Content-Type": "text/markdown; charset=utf-8",
  Vary: "Accept",
  "Cache-Control": "public, max-age=3600",
} as const;

// A path can gain coverage at any time (AGENT_CONTENT grows). Don't let a CDN
// serve a stale 404 for up to an hour after that happens.
const NOT_FOUND_HEADERS = {
  "Content-Type": "text/markdown; charset=utf-8",
  Vary: "Accept",
  "Cache-Control": "no-store",
} as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  // "root" is a sentinel for "/" since Next.js dynamic routes can't match empty segments
  const pagePath =
    path[0] === "root" && path.length === 1 ? "/" : `/${path.join("/")}`;
  const content = AGENT_CONTENT[pagePath];

  if (content === undefined) {
    return new NextResponse(renderNotFoundMarkdown(pagePath), {
      status: 404,
      headers: NOT_FOUND_HEADERS,
    });
  }

  return new NextResponse(content, { headers: MD_HEADERS });
}
