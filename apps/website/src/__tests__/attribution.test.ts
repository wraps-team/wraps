import type { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import {
  ATTRIBUTION_COOKIE,
  attributionCookieDomain,
  buildAttribution,
  setAttributionCookie,
} from "@/lib/attribution";

function request(
  url: string,
  { referer, cookie }: { referer?: string; cookie?: boolean } = {}
): NextRequest {
  return {
    nextUrl: new URL(url),
    headers: new Headers(referer ? { referer } : {}),
    cookies: { has: () => cookie === true },
  } as unknown as NextRequest;
}

function response() {
  const set = vi.fn();
  return { response: { cookies: { set } } as unknown as NextResponse, set };
}

describe("attributionCookieDomain", () => {
  it("scopes to the registrable domain in production", () => {
    // The whole point: wraps.dev writes it, app.wraps.dev reads it.
    expect(attributionCookieDomain("wraps.dev")).toBe(".wraps.dev");
    expect(attributionCookieDomain("app.wraps.dev")).toBe(".wraps.dev");
  });

  it("is unset where a .wraps.dev domain would be rejected", () => {
    // A domain attribute naming a host you are not on drops the cookie
    // silently — which would break local dev and every preview deploy.
    expect(attributionCookieDomain("localhost")).toBeUndefined();
    expect(attributionCookieDomain("web.wraps.localhost")).toBeUndefined();
    expect(
      attributionCookieDomain("wraps-git-main.vercel.app")
    ).toBeUndefined();
  });

  it("does not match a lookalike domain", () => {
    expect(attributionCookieDomain("notwraps.dev")).toBeUndefined();
  });
});

describe("buildAttribution", () => {
  it("captures utm params, landing page, and a timestamp", () => {
    const attribution = buildAttribution(
      request("https://wraps.dev/pricing?utm_source=reddit&utm_medium=social")
    );

    expect(attribution).toMatchObject({
      utm_source: "reddit",
      utm_medium: "social",
      landing_page: "/pricing",
    });
    expect(attribution?.timestamp).toBeTruthy();
  });

  it("captures a bare ref param", () => {
    expect(
      buildAttribution(request("https://wraps.dev/?ref=partner"))
    ).toMatchObject({
      ref: "partner",
    });
  });

  it("returns null when there is nothing to attribute", () => {
    expect(buildAttribution(request("https://wraps.dev/pricing"))).toBeNull();
  });

  it("records an off-site referrer", () => {
    const attribution = buildAttribution(
      request("https://wraps.dev/?utm_source=reddit", {
        referer: "https://www.reddit.com/r/aws/comments/abc",
      })
    );

    expect(attribution?.referrer).toBe(
      "https://www.reddit.com/r/aws/comments/abc"
    );
  });

  it("ignores our own pages as a referrer", () => {
    // Internal navigation is not a source. Recording it would report the
    // visitor as having come from us.
    const attribution = buildAttribution(
      request("https://wraps.dev/pricing?utm_source=reddit", {
        referer: "https://wraps.dev/",
      })
    );

    expect(attribution).not.toHaveProperty("referrer");
  });
});

describe("setAttributionCookie", () => {
  it("writes a domain-scoped cookie the dashboard can read", () => {
    const { response: res, set } = response();

    setAttributionCookie(request("https://wraps.dev/?utm_source=reddit"), res);

    expect(set).toHaveBeenCalledWith(
      ATTRIBUTION_COOKIE,
      expect.stringContaining('"utm_source":"reddit"'),
      expect.objectContaining({ domain: ".wraps.dev", path: "/", secure: true })
    );
  });

  it("omits the domain outside production", () => {
    const { response: res, set } = response();

    setAttributionCookie(
      request("http://localhost:3001/?utm_source=reddit"),
      res
    );

    expect(set.mock.calls[0]?.[2]).not.toHaveProperty("domain");
  });

  it("does not overwrite an existing cookie — first touch wins", () => {
    const { response: res, set } = response();

    setAttributionCookie(
      request("https://wraps.dev/?utm_source=google", { cookie: true }),
      res
    );

    expect(set).not.toHaveBeenCalled();
  });

  it("writes nothing for untagged traffic", () => {
    const { response: res, set } = response();

    setAttributionCookie(request("https://wraps.dev/pricing"), res);

    expect(set).not.toHaveBeenCalled();
  });
});
