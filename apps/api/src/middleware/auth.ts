/**
 * Authentication Middleware
 *
 * Supports two authentication methods:
 * 1. API Key - For SDK/external API access (Authorization header with wraps_* key)
 * 2. Session Token - For web app internal calls (better-auth session token)
 */

import { createHash } from "node:crypto";
import { and, apiKey, db, eq, member, session, subscription } from "@wraps/db";
import { inArray, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { validateLicenseKey } from "../(ee)/lib/license";
import { log } from "../lib/logger";

export type AuthContext = {
  apiKeyId: string | null;
  organizationId: string;
  userId: string | null;
  planId: string | null; // null if no valid subscription
};

/**
 * Read the authenticated context off an Elysia handler context.
 *
 * Routes built with {@link createAuthenticatedRoutes} guarantee `auth` is set —
 * `onBeforeHandle` returns 401 before any handler runs without it — but Elysia's
 * derive typing doesn't surface `auth` on the handler `ctx`. This centralizes
 * the one unavoidable cast and returns a non-null `AuthContext`.
 *
 * Throws if called from a context where auth was never derived, which is a
 * programming error (e.g. a route not built via createAuthenticatedRoutes).
 * For hooks that legitimately run before auth, use {@link getAuthOptional}.
 */
export function getAuth(ctx: unknown): AuthContext {
  const auth = (ctx as { auth?: AuthContext | null }).auth;
  if (!auth) {
    throw new Error(
      "getAuth() called on an unauthenticated context — use createAuthenticatedRoutes() or getAuthOptional()"
    );
  }
  return auth;
}

/**
 * Read auth that may be absent — for global hooks (onError, onAfterResponse)
 * that run before authentication is guaranteed, or middleware that intentionally
 * no-ops for unauthenticated requests. Returns null when auth isn't present.
 */
export function getAuthOptional(ctx: unknown): AuthContext | null {
  return (ctx as { auth?: AuthContext | null }).auth ?? null;
}

// Hash function for API key verification
function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Extract plan from a subscription join result
function extractPlan(sub: {
  plan: string | null;
  subStatus: string | null;
}): string | null {
  if (
    sub.subStatus &&
    (sub.subStatus === "active" || sub.subStatus === "trialing")
  ) {
    return sub.plan;
  }
  return null;
}

// Validate API key and return auth context (1 SELECT + 1 UPDATE)
async function validateApiKey(key: string): Promise<AuthContext | null> {
  if (!key.startsWith("wraps_")) {
    return null;
  }

  const keyHash = hashApiKey(key);

  // JOIN api_key + subscription in one query
  const [result] = await db
    .select({
      id: apiKey.id,
      organizationId: apiKey.organizationId,
      createdBy: apiKey.createdBy,
      expiresAt: apiKey.expiresAt,
      plan: subscription.plan,
      subStatus: subscription.status,
    })
    .from(apiKey)
    .leftJoin(
      subscription,
      and(
        eq(subscription.referenceId, apiKey.organizationId),
        inArray(subscription.status, ["active", "trialing"])
      )
    )
    .where(eq(apiKey.keyHash, keyHash))
    .limit(1);

  if (!result) {
    return null;
  }

  if (result.expiresAt && result.expiresAt < new Date()) {
    return null;
  }

  // Update last used timestamp
  // biome-ignore lint/plugin: result.id is the row just resolved by its unique keyHash above — that lookup IS how the org gets identified for this API key.
  await db
    .update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, result.id));

  const licenseOverride = validateLicenseKey(process.env.WRAPS_LICENSE_KEY);

  return {
    apiKeyId: result.id,
    organizationId: result.organizationId,
    userId: result.createdBy,
    planId: licenseOverride.valid ? licenseOverride.tier : extractPlan(result),
  };
}

// Validate session by direct database lookup (1 SELECT with JOINs)
async function validateSessionWithReason(
  sessionToken: string,
  organizationId?: string
): Promise<{ auth: AuthContext | null; reason: string }> {
  try {
    // JOIN session + member + subscription in one query
    // When organizationId is provided via header, use it; otherwise use the session's activeOrganizationId
    const [result] = await db
      .select({
        sessionId: session.id,
        userId: session.userId,
        expiresAt: session.expiresAt,
        activeOrganizationId: session.activeOrganizationId,
        memberRole: member.role,
        plan: subscription.plan,
        subStatus: subscription.status,
      })
      .from(session)
      .leftJoin(
        member,
        and(
          eq(member.userId, session.userId),
          organizationId
            ? eq(member.organizationId, sql`${organizationId}`)
            : eq(member.organizationId, session.activeOrganizationId)
        )
      )
      .leftJoin(
        subscription,
        and(
          eq(
            subscription.referenceId,
            organizationId
              ? sql`${organizationId}`
              : session.activeOrganizationId
          ),
          inArray(subscription.status, ["active", "trialing"])
        )
      )
      .where(eq(session.token, sessionToken))
      .limit(1);

    if (!result) {
      return { auth: null, reason: "session not found" };
    }

    if (result.expiresAt < new Date()) {
      return { auth: null, reason: "session expired" };
    }

    const orgId = organizationId || result.activeOrganizationId;

    if (!orgId) {
      return { auth: null, reason: "no org id" };
    }

    if (!result.memberRole) {
      return { auth: null, reason: "user not member of org" };
    }

    const licenseOverride = validateLicenseKey(process.env.WRAPS_LICENSE_KEY);

    return {
      auth: {
        apiKeyId: null,
        organizationId: orgId,
        userId: result.userId,
        planId: licenseOverride.valid
          ? licenseOverride.tier
          : extractPlan(result),
      },
      reason: "ok",
    };
  } catch (error) {
    log.error("Session validation failed", error);
    return {
      auth: null,
      reason: `error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Authenticate request and return auth context or error message
async function authenticate(
  request: Request
): Promise<{ auth: AuthContext } | { error: string }> {
  const authHeader = request.headers.get("authorization");
  const orgId = request.headers.get("x-organization-id") ?? undefined;

  if (!authHeader) {
    return { error: "Unauthorized" };
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  // Try API key auth (wraps_* prefix)
  if (token.startsWith("wraps_")) {
    const authContext = await validateApiKey(token);
    if (authContext) {
      return { auth: authContext };
    }
    return { error: "Unauthorized" };
  }

  // Try session token auth (from Better Auth)
  const result = await validateSessionWithReason(token, orgId);

  if (result.auth) {
    return { auth: result.auth };
  }

  // Log specific reason server-side but return uniform error to prevent
  // session state probing and org membership enumeration
  log.warn("Session auth failed", { reason: result.reason });
  return { error: "Unauthorized" };
}

// Export authenticate function for direct use in routes
export { authenticate };

/**
 * Factory function to create authenticated route handlers.
 *
 * This is the recommended way to create routes that require authentication.
 * It sets up derive + onBeforeHandle to authenticate requests before handlers run.
 *
 * Usage:
 * ```typescript
 * export const myRoutes = createAuthenticatedRoutes("/v1/my-resource")
 *   .get("/", async ({ auth }) => {
 *     // auth is guaranteed to be set here
 *     return { organizationId: auth.organizationId };
 *   })
 *   .post("/", async ({ auth, body }) => {
 *     // ...
 *   });
 * ```
 */
export function createAuthenticatedRoutes(prefix: string) {
  return new Elysia({ prefix })
    .derive(async (ctx) => {
      // Allow tests to inject mock auth by setting auth before .use()
      const existingAuth = getAuthOptional(ctx);
      if (existingAuth) {
        return { auth: existingAuth, authError: null as string | null };
      }

      const result = await authenticate(ctx.request);
      if ("error" in result) {
        return { auth: null as AuthContext | null, authError: result.error };
      }
      return { auth: result.auth, authError: null as string | null };
    })
    .onBeforeHandle(({ auth, authError, set }) => {
      if (authError || !auth) {
        set.status = 401;
        return { error: authError || "Unauthorized" };
      }
    });
}

// Legacy auth middleware - prefer createAuthenticatedRoutes for new routes
export const authMiddleware = new Elysia({ name: "auth" })
  .derive(async ({ request }) => {
    try {
      const result = await authenticate(request);
      if ("error" in result) {
        return { auth: null as AuthContext | null, authError: result.error };
      }
      return {
        auth: result.auth as AuthContext | null,
        authError: null as string | null,
      };
    } catch (error) {
      log.error("Auth middleware exception", error);
      return {
        auth: null as AuthContext | null,
        authError: "Internal auth error",
      };
    }
  })
  .onBeforeHandle(({ auth, authError, set }) => {
    if (authError || !auth) {
      set.status = 401;
      return { error: authError || "Unauthorized" };
    }
  });
