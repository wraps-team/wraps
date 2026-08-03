import type { NextRequest, NextResponse } from "next/server";

/**
 * First-touch marketing attribution.
 *
 * UTM-tagged links land here, on wraps.dev, but signup happens on
 * app.wraps.dev — so the cookie is written against the registrable domain and
 * read back by the dashboard's auth hooks. Both writers and the reader must
 * agree on this name and shape:
 *   - apps/web/src/proxy.ts        (direct app.wraps.dev hits)
 *   - packages/auth/src/index.ts   (reader, on signup)
 */
export const ATTRIBUTION_COOKIE = "wraps_attribution";

const ATTRIBUTION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export const UTM_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

/**
 * Cookie domain for a given request host.
 *
 * `.wraps.dev` in production so app.wraps.dev can read what wraps.dev wrote.
 * Undefined everywhere else — a domain attribute naming a host you are not on
 * is rejected outright, which would silently drop the cookie on localhost and
 * on Vercel preview deployments.
 */
export function attributionCookieDomain(hostname: string): string | undefined {
  return hostname === "wraps.dev" || hostname.endsWith(".wraps.dev")
    ? ".wraps.dev"
    : undefined;
}

/** Build the attribution payload, or null when there is nothing to attribute. */
export function buildAttribution(
  request: NextRequest
): Record<string, string> | null {
  const { searchParams, pathname, hostname } = request.nextUrl;

  const attribution: Record<string, string> = {};

  for (const param of UTM_PARAMS) {
    const value = searchParams.get(param);
    if (value) {
      attribution[param] = value;
    }
  }

  const ref = searchParams.get("ref");
  if (ref) {
    attribution.ref = ref;
  }

  if (Object.keys(attribution).length === 0) {
    return null;
  }

  // Only an off-site referrer is worth recording. Our own pages are navigation,
  // not a source, and writing one here would misreport the visit's origin.
  const referrer = request.headers.get("referer");
  if (referrer && !isSameSite(referrer, hostname)) {
    attribution.referrer = referrer;
  }

  attribution.landing_page = pathname;
  attribution.timestamp = new Date().toISOString();

  return attribution;
}

function isSameSite(referrer: string, hostname: string): boolean {
  try {
    const host = new URL(referrer).hostname;
    return (
      host === hostname || host.endsWith(".wraps.dev") || host === "wraps.dev"
    );
  } catch {
    return false;
  }
}

/**
 * Write the attribution cookie when this request carries campaign params and
 * no cookie exists yet. First touch wins: a visitor who arrives from Reddit and
 * comes back a week later via Google stays attributed to Reddit.
 */
export function setAttributionCookie(
  request: NextRequest,
  response: NextResponse
): void {
  if (request.cookies.has(ATTRIBUTION_COOKIE)) {
    return;
  }

  const attribution = buildAttribution(request);
  if (!attribution) {
    return;
  }

  const domain = attributionCookieDomain(request.nextUrl.hostname);

  response.cookies.set(ATTRIBUTION_COOKIE, JSON.stringify(attribution), {
    maxAge: ATTRIBUTION_MAX_AGE,
    secure: true,
    sameSite: "lax",
    path: "/",
    ...(domain ? { domain } : {}),
    // NOT httpOnly — client-side PostHog and the CTA decorator read it.
  });
}
