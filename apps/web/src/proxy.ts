import { auth } from "@wraps/auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Define protected routes that require authentication
const protectedRoutes = [
  "/dashboard",
  "/settings",
  "/profile",
  // Add more protected routes here
];

// Define auth routes that should redirect to dashboard if already authenticated
const authRoutes = ["/auth"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the current path is protected
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Check if the current path is an auth page
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  // Get session using better-auth's recommended API
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  const isAuthenticated = !!session;

  // Redirect authenticated users away from auth pages to dashboard
  if (isAuthenticated && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Redirect unauthenticated users trying to access protected routes to auth
  if (!isAuthenticated && isProtectedRoute) {
    const redirectUrl = new URL("/auth", request.url);
    // Add the original URL as a redirect parameter for post-login redirect
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Allow the request to continue
  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  matcher: [
    // Match all request paths except for the ones starting with:
    // - api (API routes)
    // - _next/static (static files)
    // - _next/image (image optimization files)
    // - favicon.ico, sitemap.xml, robots.txt (meta files)
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
