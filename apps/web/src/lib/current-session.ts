import { auth } from "@wraps/auth";
import { headers } from "next/headers";
import { cache } from "react";

/**
 * Resolve the current better-auth session once per request.
 *
 * Do not call `auth.api.getSession` directly from a render path. A single
 * page view resolves the session from the `(dashboard)` layout, the
 * `[orgSlug]` layout, the page itself and each `generateMetadata`; without a
 * request-scoped cache every site pays its own round trip, and the cookie
 * cache in `@wraps/auth` only avoids the database while its 5-minute entry is
 * still fresh. React's `cache()` collapses those calls into one resolution,
 * matching how `@/lib/organization` already memoizes its helpers.
 *
 * Route handlers that call the session once per request can keep calling
 * `auth.api.getSession` directly; caching changes nothing there.
 */
export const getCurrentSession = cache(async () =>
  auth.api.getSession({ headers: await headers() })
);
