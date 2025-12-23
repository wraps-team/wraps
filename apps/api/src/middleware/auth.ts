/**
 * Authentication Middleware
 *
 * Supports two authentication methods:
 * 1. API Key - For SDK/external API access (Authorization header with wraps_* key)
 * 2. Session Token - For web app internal calls (better-auth session token)
 */

import { and, apiKey, db, eq, member, session, subscription } from "@wraps/db";
import { createHash } from "crypto";
import { Elysia } from "elysia";

export type AuthContext = {
  apiKeyId: string | null;
  organizationId: string;
  userId: string | null;
  planId: string | null; // null if no valid subscription
};

// Hash function for API key verification
function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Get plan for an organization
// Source of truth: subscription table (managed by Better-Auth Stripe plugin)
// Note: There is no free tier. Returns null if no valid subscription.
async function getPlanForOrg(organizationId: string): Promise<string | null> {
  const [sub] = await db
    .select({ plan: subscription.plan, status: subscription.status })
    .from(subscription)
    .where(eq(subscription.referenceId, organizationId))
    .limit(1);

  if (sub && (sub.status === "active" || sub.status === "trialing")) {
    return sub.plan;
  }

  // No valid subscription - user needs to subscribe
  return null;
}

// Validate API key and return auth context
async function validateApiKey(key: string): Promise<AuthContext | null> {
  if (!key.startsWith("wraps_")) {
    return null;
  }

  // Extract prefix (e.g., "wraps_live_abc123" -> "wraps_live_abc")
  const prefix = key.substring(0, 15);
  const keyHash = hashApiKey(key);

  // Look up API key by prefix
  const [keyRecord] = await db
    .select({
      id: apiKey.id,
      organizationId: apiKey.organizationId,
      createdBy: apiKey.createdBy,
      expiresAt: apiKey.expiresAt,
      keyHash: apiKey.keyHash,
    })
    .from(apiKey)
    .where(eq(apiKey.prefix, prefix))
    .limit(1);

  if (!keyRecord || keyRecord.keyHash !== keyHash) {
    return null;
  }

  if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
    return null;
  }

  // Update last used timestamp (fire and forget)
  db.update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, keyRecord.id))
    .catch(() => {});

  const planId = await getPlanForOrg(keyRecord.organizationId);

  return {
    apiKeyId: keyRecord.id,
    organizationId: keyRecord.organizationId,
    userId: keyRecord.createdBy,
    planId,
  };
}

// Validate session by direct database lookup
async function validateSessionWithReason(
  sessionToken: string,
  organizationId?: string
): Promise<{ auth: AuthContext | null; reason: string }> {
  try {
    // Look up session by token directly in database
    const [sessionRecord] = await db
      .select({
        id: session.id,
        userId: session.userId,
        expiresAt: session.expiresAt,
        activeOrganizationId: session.activeOrganizationId,
      })
      .from(session)
      .where(eq(session.token, sessionToken))
      .limit(1);

    if (!sessionRecord) {
      return { auth: null, reason: "session not found" };
    }

    // Check if session is expired
    if (sessionRecord.expiresAt < new Date()) {
      return { auth: null, reason: "session expired" };
    }

    // Use provided organizationId or fall back to active org from session
    const orgId = organizationId || sessionRecord.activeOrganizationId;

    if (!orgId) {
      return { auth: null, reason: "no org id" };
    }

    // Verify user is a member of this organization
    const [memberRecord] = await db
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.userId, sessionRecord.userId),
          eq(member.organizationId, orgId)
        )
      )
      .limit(1);

    if (!memberRecord) {
      return { auth: null, reason: "user not member of org" };
    }

    const planId = await getPlanForOrg(orgId);

    return {
      auth: {
        apiKeyId: null,
        organizationId: orgId,
        userId: sessionRecord.userId,
        planId,
      },
      reason: "ok",
    };
  } catch (error) {
    console.error("[AUTH] Error validating session:", error);
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

  console.log(
    "[AUTH] Authenticating, authHeader:",
    authHeader ? "yes" : "no",
    "orgId:",
    orgId
  );

  if (!authHeader) {
    return { error: "Unauthorized: no auth header" };
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
    return { error: "Unauthorized: invalid API key" };
  }

  // Try session token auth (from Better Auth)
  console.log("[AUTH] Trying session auth for token:", token.slice(0, 10));
  const result = await validateSessionWithReason(token, orgId);
  console.log("[AUTH] Session result:", result.reason);

  if (result.auth) {
    console.log("[AUTH] Session validated, returning auth context");
    return { auth: result.auth };
  }

  return { error: `Unauthorized: ${result.reason}` };
}

// Export authenticate function for direct use in routes
export { authenticate };

// Simple middleware that adds auth to context via derive
export const authMiddleware = new Elysia({ name: "auth" }).derive(
  async ({ request, set }) => {
    const result = await authenticate(request);
    if ("error" in result) {
      set.status = 401;
      throw new Error(result.error);
    }
    return { auth: result.auth };
  }
);
