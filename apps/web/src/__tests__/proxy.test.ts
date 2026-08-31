/**
 * apps/web/src/proxy.ts — the repo's first proxy tests.
 *
 * Plan 224 took better-auth and Drizzle out of the proxy's module graph and
 * narrowed its matcher so it stops running on every asset, API call and RSC
 * prefetch. These tests pin three things:
 *
 * 1. The matcher — which paths the proxy runs on at all — including the
 *    segment-anchoring regression tests for org slugs that merely *start
 *    with* an excluded word (`/apidocs/emails`, `/monitoring-tools/emails`).
 * 2. The module graph — the proxy imports nothing but `next/server`, so it
 *    carries no auth or db module graph.
 * 3. Behavior — the cookies, the request-id header, and the regression this
 *    plan is about: visiting `/auth` no longer gets redirected by the proxy
 *    (that redirect now happens in `/auth`'s own page component and in `/`).
 *
 * Every negative assertion below is paired with a positive control that
 * proves the selector or matcher still works.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "../proxy";

const require_ = createRequire(import.meta.url);
const nextDir = path.dirname(require_.resolve("next/package.json"));
// Import by the deep dist path, not the `next/experimental/testing/server`
// barrel — that barrel pulls in `NextResponse`, which throws
// `Invariant: AsyncLocalStorage accessed in runtime where it is not
// available` outside a Next runtime.
//
// The function is named `unstable_doesMiddlewareMatch` in Next 16.2.12 (this
// repo's installed version) — the vendored getting-started doc calls it
// `unstable_doesProxyMatch`, which does not exist here. Verified against
// node_modules/next/dist/experimental/testing/server/middleware-testing-utils.d.ts.
const { unstable_doesMiddlewareMatch } = require_(
  path.join(
    nextDir,
    "dist/experimental/testing/server/middleware-testing-utils.js"
  )
) as {
  unstable_doesMiddlewareMatch: (args: {
    config: { matcher?: unknown };
    url: string;
  }) => boolean;
};

describe("proxy matcher", () => {
  const mustMatch = [
    "/",
    "/auth",
    "/acme",
    "/acme/emails",
    "/acme/settings",
    "/acme/emails/templates/abc",
    "/onboarding",
    "/invitations/abc/accept",
    "/preferences/tok",
    "/confirm/tok",
    "/settings/security",
    // Segment-anchoring regressions: these org slugs merely *start with* an
    // excluded word. They must still get the proxy.
    "/apidocs/emails",
    "/monitoring-tools/emails",
  ];

  it.each(mustMatch)("runs the proxy on document route %s", (pathname) => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: `https://example.com${pathname}`,
      })
    ).toBe(true);
  });

  const mustNotMatch = [
    "/wraps-light-logo.png",
    "/favicon.ico",
    "/favicon-dark.png",
    "/robots.txt",
    "/file.svg",
    "/api/auth/get-session",
    "/api/acme/emails",
    "/_next/static/chunks/x.js",
    "/_next/image",
    "/monitoring",
    "/__nextjs_font/geist-latin.woff2",
  ];

  it.each(mustNotMatch)(
    "does not run the proxy on asset/API path %s",
    (pathname) => {
      expect(
        unstable_doesMiddlewareMatch({
          config,
          url: `https://example.com${pathname}`,
        })
      ).toBe(false);
    }
  );
});

describe("proxy module graph", () => {
  it("imports nothing but next/server, so the proxy carries no auth or db graph", () => {
    const source = readFileSync(
      new URL("../proxy.ts", import.meta.url),
      "utf8"
    );
    const imports = source.match(/^import .*/gm) ?? [];
    expect(imports).toHaveLength(1);
    expect(imports[0]).toContain("next/server");

    // Teeth: the pattern really does find imports in a file that has them.
    const withImports = readFileSync(
      new URL("../app/page.tsx", import.meta.url),
      "utf8"
    );
    expect((withImports.match(/^import .*/gm) ?? []).length).toBeGreaterThan(1);
  });
});

describe("proxy behavior", () => {
  it("sets a wraps_attribution cookie when UTM params are present and no cookie exists yet", () => {
    const request = new NextRequest("https://example.com/?utm_source=reddit");
    const response = proxy(request);
    expect(response.cookies.get("wraps_attribution")?.value).toBeDefined();
  });

  it("does not re-set wraps_attribution when the cookie already exists (first-touch is preserved)", () => {
    const request = new NextRequest("https://example.com/?utm_source=reddit", {
      headers: { cookie: "wraps_attribution=existing-value" },
    });
    const response = proxy(request);
    // Teeth: the same request shape without an existing cookie does get one
    // (proven in the test above), so this is a real distinction.
    expect(response.cookies.get("wraps_attribution")).toBeUndefined();
  });

  it("sets no wraps_attribution cookie when there is no UTM or ref param", () => {
    const request = new NextRequest("https://example.com/");
    const response = proxy(request);
    expect(response.cookies.get("wraps_attribution")).toBeUndefined();
  });

  it("sets an x-request-id header on every response, generating one if absent", () => {
    const request = new NextRequest("https://example.com/");
    const response = proxy(request);
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("echoes an inbound x-request-id rather than replacing it", () => {
    const request = new NextRequest("https://example.com/", {
      headers: { "x-request-id": "inbound-id-123" },
    });
    const response = proxy(request);
    expect(response.headers.get("x-request-id")).toBe("inbound-id-123");
  });

  it("sets device-type=desktop for a desktop user agent", () => {
    const request = new NextRequest("https://example.com/", {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    const response = proxy(request);
    expect(response.cookies.get("device-type")?.value).toBe("desktop");
  });

  it("sets device-type=mobile for a mobile user agent", () => {
    const request = new NextRequest("https://example.com/", {
      headers: {
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      },
    });
    const response = proxy(request);
    expect(response.cookies.get("device-type")?.value).toBe("mobile");
  });

  it("regression: visiting /auth returns NextResponse.next(), not a redirect", () => {
    // Teeth: this test would have failed before this plan — the proxy used
    // to run a session + org lookup on /auth and redirect a signed-in
    // visitor straight to their org. That logic now lives in /auth's own
    // page component and in /.
    const request = new NextRequest("https://example.com/auth");
    const response = proxy(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
