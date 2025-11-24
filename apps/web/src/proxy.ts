import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { member, organization } from "@wraps/db/schema/auth";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
        return NextResponse.redirect(
          new URL(`/${activeOrg.slug}/emails`, request.url)
        );
      }
    }

    // 2. If no active org, check how many orgs the user is a member of
    const userMemberships = await db.query.member.findMany({
      where: eq(member.userId, session.user.id),
    });

    if (userMemberships.length === 0) {
      // No orgs → redirect to onboarding
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }

    if (userMemberships.length === 1) {
      // Exactly 1 org → redirect to that org
      const userOrg = await db.query.organization.findFirst({
        where: eq(organization.id, userMemberships[0].organizationId),
      });

      if (userOrg?.slug) {
        return NextResponse.redirect(
          new URL(`/${userOrg.slug}/emails`, request.url)
        );
      }
    }

    // Multiple orgs or couldn't find org → redirect to dashboard (org selector)
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Redirect unauthenticated users trying to access protected routes to auth
  // (All routes are protected unless explicitly listed as public)
  if (!(isAuthenticated || isPublicRoute)) {
    const redirectUrl = new URL("/auth", request.url);
    // Add the original URL as a redirect parameter for post-login redirect
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Allow the request to continue
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all request paths except for the ones starting with:
    // - api (API routes)
    // - _next/static (static files)
    // - _next/image (image optimization files)
    // - favicon.ico, sitemap.xml, robots.txt (meta files)
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
