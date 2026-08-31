import { type NextRequest, NextResponse, userAgent } from "next/server";

// --- Marketing attribution cookie ---

const UTM_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

const ATTRIBUTION_COOKIE = "wraps_attribution";
const ATTRIBUTION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

/**
 * Cookie domain for a given request host.
 *
 * `.wraps.dev` in production so this cookie and the one apps/website writes are
 * the same cookie — campaign traffic lands on wraps.dev and signs up here.
 * Undefined elsewhere: a domain attribute naming a host you are not on is
 * rejected, which would drop the cookie on localhost and Vercel previews.
 *
 * Keep in sync with apps/website/src/lib/attribution.ts.
 */
function attributionCookieDomain(hostname: string): string | undefined {
  return hostname === "wraps.dev" || hostname.endsWith(".wraps.dev")
    ? ".wraps.dev"
    : undefined;
}

/**
 * Set a first-touch attribution cookie if UTM or ref params are present
 * and no attribution cookie exists yet.
 *
 * Most campaign traffic never reaches this function — it arrives on wraps.dev,
 * where apps/website's middleware writes the cookie. This covers links that
 * point straight at the app with params attached.
 */
function setAttributionCookie(
  request: NextRequest,
  response: NextResponse
): void {
  const { searchParams } = request.nextUrl;

  const hasUtm = UTM_PARAMS.some((p) => searchParams.has(p));
  const hasRef = searchParams.has("ref");

  if (!(hasUtm || hasRef)) {
    return;
  }
  if (request.cookies.has(ATTRIBUTION_COOKIE)) {
    return;
  }

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

  const referrer = request.headers.get("referer");
  if (referrer) {
    attribution.referrer = referrer;
  }

  attribution.landing_page = request.nextUrl.pathname;
  attribution.timestamp = new Date().toISOString();

  const domain = attributionCookieDomain(request.nextUrl.hostname);

  response.cookies.set(ATTRIBUTION_COOKIE, JSON.stringify(attribution), {
    maxAge: ATTRIBUTION_MAX_AGE,
    secure: true,
    sameSite: "lax",
    path: "/",
    ...(domain ? { domain } : {}),
    // NOT httpOnly — needs client-side read for PostHog
  });
}

// --- Device type cookie ---

const DEVICE_TYPE_COOKIE = "device-type";
const DEVICE_TYPE_MAX_AGE = 3600; // 1 hour

function setDeviceTypeCookie(
  request: NextRequest,
  response: NextResponse
): void {
  if (request.cookies.has(DEVICE_TYPE_COOKIE)) {
    return;
  }

  const { device } = userAgent(request);
  const isMobile = device.type === "mobile" || device.type === "tablet";

  response.cookies.set(DEVICE_TYPE_COOKIE, isMobile ? "mobile" : "desktop", {
    maxAge: DEVICE_TYPE_MAX_AGE,
    sameSite: "lax",
    path: "/",
    // NOT httpOnly — client JS reads this for bypass button
  });
}

/**
 * Add request ID header for log correlation
 */
function addRequestId(request: NextRequest, response: NextResponse): void {
  const requestId =
    request.headers.get("x-request-id") || crypto.randomUUID().slice(0, 8);
  response.headers.set("x-request-id", requestId);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Attach attribution cookie + request ID to every response
  function finalize(response: NextResponse): NextResponse {
    setAttributionCookie(request, response);
    setDeviceTypeCookie(request, response);
    addRequestId(request, response);
    return response;
  }

  // Allow the request to continue
  return finalize(NextResponse.next());
}

export const config = {
  matcher: [
    /*
     * Run only on document routes. Next runs the proxy *before* filesystem
     * routes (see proxy.mdx §Execution order), so without these exclusions it
     * runs on every file in `public/`, every API call and every optimized
     * image — none of which needs an attribution cookie.
     *
     * - api            — route handlers; nothing reads these cookies off them
     * - _next          — all Next internals, static chunks and image optimizer
     * - monitoring     — Sentry tunnelRoute (next.config.ts:90 `tunnelRoute`)
     * - __nextjs       — dev-only asset routes (e.g. /__nextjs_font/*)
     * - *.<ext>        — everything served straight out of `public/`
     *
     * The `(?:/|$)` after each name anchors the exclusion to a whole path
     * segment. Without it the lookahead matches on a bare prefix, so an
     * organization slugged `apidocs` or `monitoring-tools` would silently stop
     * getting the proxy — slugs are user-chosen and `generateSlug`
     * (src/lib/utils/slug.ts) does not reserve these words. Same reason the
     * extension group ends in `$`.
     *
     * Mirrors apps/website/src/middleware.ts, which already excludes this set.
     */
    "/((?!api(?:/|$)|_next(?:/|$)|monitoring(?:/|$)|__nextjs|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|txt|xml|json|map|woff2?|ttf|otf|pdf|mp4|zip)$).*)",
  ],
};
