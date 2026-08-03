import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { member, organization } from "@wraps/db/schema/auth";
import { eq } from "drizzle-orm";
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

// Define public routes that don't require authentication
// All other routes are protected by default
const publicRoutes = [
  "/", // Landing page / org selector
  "/auth", // Authentication pages
  "/docs", // Documentation (if public)
  "/pricing", // Pricing page (if exists)
  "/about", // About page (if exists)
];

// Auth routes that should redirect authenticated users to dashboard
const authRoutes = ["/auth"];

/**
 * Add request ID header for log correlation
 */
function addRequestId(request: NextRequest, response: NextResponse): void {
  const requestId =
    request.headers.get("x-request-id") || crypto.randomUUID().slice(0, 8);
  response.headers.set("x-request-id", requestId);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Attach attribution cookie + request ID to every response
  function finalize(response: NextResponse): NextResponse {
    setAttributionCookie(request, response);
    setDeviceTypeCookie(request, response);
    addRequestId(request, response);
    return response;
  }

  // API routes: only add request ID, skip auth checks
  if (pathname.startsWith("/api")) {
    return finalize(NextResponse.next());
  }

  // Check if the current path is public (unprotected)
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Check if the current path is an auth page
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  // Get session using better-auth's recommended API
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  const isAuthenticated = !!session;

  // Redirect authenticated users away from auth pages to their organization
  if (isAuthenticated && isAuthRoute && session?.user) {
    // 1. Check if user has an active organization
    const activeOrgId = (session.session as { activeOrganizationId?: string })
      ?.activeOrganizationId;

    if (activeOrgId) {
      const activeOrg = await db.query.organization.findFirst({
        where: eq(organization.id, activeOrgId),
      });

      if (activeOrg?.slug) {
        return finalize(
          NextResponse.redirect(
            new URL(`/${activeOrg.slug}/emails`, request.url)
          )
        );
      }
    }

    // 2. If no active org, check how many orgs the user is a member of
    const userMemberships = await db.query.member.findMany({
      where: eq(member.userId, session.user.id),
    });

    if (userMemberships.length === 0) {
      // No orgs → redirect to onboarding
      return finalize(
        NextResponse.redirect(new URL("/onboarding", request.url))
      );
    }

    if (userMemberships.length === 1) {
      // Exactly 1 org → redirect to that org
      const userOrg = await db.query.organization.findFirst({
        where: eq(organization.id, userMemberships[0].organizationId),
      });

      if (userOrg?.slug) {
        return finalize(
          NextResponse.redirect(new URL(`/${userOrg.slug}/emails`, request.url))
        );
      }
    }

    // Multiple orgs or couldn't find org → redirect to dashboard (org selector)
    return finalize(NextResponse.redirect(new URL("/", request.url)));
  }

  // Redirect unauthenticated users trying to access protected routes to auth
  // (All routes are protected unless explicitly listed as public)
  if (!(isAuthenticated || isPublicRoute)) {
    const redirectUrl = new URL("/auth", request.url);
    // Add the original URL as a redirect parameter for post-login redirect
    redirectUrl.searchParams.set("redirect", pathname);
    return finalize(NextResponse.redirect(redirectUrl));
  }

  // Allow the request to continue
  return finalize(NextResponse.next());
}

export const config = {
  matcher: [
    // Match all request paths except for the ones starting with:
    // - _next/static (static files)
    // - _next/image (image optimization files)
    // - favicon.ico, sitemap.xml, robots.txt (meta files)
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
