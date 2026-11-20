import * as pageStaticInfo from "next/dist/build/analysis/get-page-static-info";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config } from "@/middleware";

// Next's own compiler for `config.matcher`; its .d.ts doesn't export it.
const { getMiddlewareMatchers } = pageStaticInfo as unknown as {
  getMiddlewareMatchers: (
    matcher: string[],
    nextConfig: Record<string, unknown>
  ) => { regexp: string }[];
};

// Compile the matcher the way Next does when it builds the middleware manifest.
const [matcher] = getMiddlewareMatchers(config.matcher, {});
const runsMiddleware = (pathname: string) =>
  new RegExp(matcher.regexp).test(pathname);

describe("middleware matcher and the /og card route", () => {
  it("skips /og, which serves an immutable signed image", () => {
    expect(runsMiddleware("/og")).toBe(false);
    expect(runsMiddleware("/og/")).toBe(false);
  });

  it("still runs for pages, including ones that start with 'og'", () => {
    for (const path of [
      "/",
      "/docs",
      "/docs/og",
      "/og-image-guide",
      "/ogre",
      "/blog/og",
    ]) {
      expect(runsMiddleware(path), path).toBe(true);
    }
  });

  it("is not changed for the paths it already skipped", () => {
    for (const path of [
      "/api/md/docs",
      "/_next/static/x.js",
      "/ingest/e",
      "/og-image.png",
    ]) {
      expect(runsMiddleware(path), path).toBe(false);
    }
  });

  it("would otherwise rewrite an AI crawler's /og request to markdown", async () => {
    // Why the exclusion matters: if /og ever reaches the middleware again, a
    // crawler or a markdown-Accept client gets /api/md/og, not the PNG.
    const { middleware } = await import("@/middleware");
    const response = await middleware(
      new NextRequest("https://wraps.dev/og?title=x", {
        headers: { accept: "text/markdown" },
      })
    );
    expect(response.headers.get("x-middleware-rewrite")).toContain(
      "/api/md/og"
    );
  });
});
