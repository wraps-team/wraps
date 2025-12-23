/**
 * API Key Authentication Middleware
 *
 * Validates API keys from the Authorization header.
 * API keys are stored with hash and prefix for lookup.
 */

import { apiKey, db, eq, organizationExtension, subscription } from "@wraps/db";
import { createHash } from "crypto";
import { Elysia } from "elysia";

export interface AuthContext {
  apiKeyId: string;
  organizationId: string;
  userId: string | null;
  planId: string;
}

// Hash function for API key verification
function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export const authMiddleware = new Elysia({ name: "auth" }).derive(
  async ({ request, set }): Promise<{ auth: AuthContext }> => {
    const authHeader = request.headers.get("authorization");

    if (!authHeader) {
      set.status = 401;
      throw new Error("Missing Authorization header");
    }

    // Support both "Bearer <key>" and just "<key>"
    const key = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    if (!(key && key.startsWith("wraps_"))) {
      set.status = 401;
      throw new Error("Invalid API key format");
    }

    // Extract prefix (e.g., "wraps_live_abc123" -> "wraps_live_abc")
    const prefix = key.substring(0, 15); // First 15 chars as prefix
    const keyHash = hashApiKey(key);

    // Look up API key by prefix and hash
    const [keyRecord] = await db
      .select({
        id: apiKey.id,
        organizationId: apiKey.organizationId,
        createdBy: apiKey.createdBy,
        expiresAt: apiKey.expiresAt,
      })
      .from(apiKey)
      .where(eq(apiKey.prefix, prefix))
      .limit(1);

    if (!keyRecord) {
      set.status = 401;
      throw new Error("Invalid API key");
    }

    // Verify hash matches
    const [fullKeyRecord] = await db
      .select({ keyHash: apiKey.keyHash })
      .from(apiKey)
      .where(eq(apiKey.id, keyRecord.id))
      .limit(1);

    if (fullKeyRecord?.keyHash !== keyHash) {
      set.status = 401;
      throw new Error("Invalid API key");
    }

    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      set.status = 401;
      throw new Error("API key has expired");
    }

    // Get plan from organizationExtension or subscription
    let planId = "starter";

    // Try organizationExtension first
    const [ext] = await db
      .select({ plan: organizationExtension.plan })
      .from(organizationExtension)
      .where(eq(organizationExtension.organizationId, keyRecord.organizationId))
      .limit(1);

    if (ext?.plan) {
      planId = ext.plan;
    } else {
      // Fall back to subscription table
      const [sub] = await db
        .select({ plan: subscription.plan, status: subscription.status })
        .from(subscription)
        .where(eq(subscription.referenceId, keyRecord.organizationId))
        .limit(1);

      if (sub && (sub.status === "active" || sub.status === "trialing")) {
        planId = sub.plan;
      }
    }

    // Update last used timestamp (fire and forget)
    db.update(apiKey)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKey.id, keyRecord.id))
      .catch(() => {
        // Ignore errors updating last used
      });

    return {
      auth: {
        apiKeyId: keyRecord.id,
        organizationId: keyRecord.organizationId,
        userId: keyRecord.createdBy,
        planId,
      },
    };
  }
);
