"use server";

import crypto from "node:crypto";
import { auth } from "@wraps/auth";
import { notifyOrg } from "@wraps/auth/notify";
import {
  type apiKey,
  auditLog,
  db,
  deleteApiKeyForOrg,
  findApiKeyByHash,
  findApiKeyForOrg,
  insertApiKey,
  listApiKeysForOrg,
  touchApiKeyLastUsed,
  updateApiKeyForOrg,
} from "@wraps/db";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { trackApiKeyCreated } from "@/lib/activation-tracking";
import {
  API_KEY_PREFIXES,
  type ApiKeyPermission,
  type ApiKeyType,
  type CreateApiKeyResult,
  type DeleteApiKeyResult,
  FULL_ACCESS_PERMISSIONS,
  type ListApiKeysResult,
  READ_ONLY_PERMISSIONS,
  type UpdateApiKeyResult,
} from "@/lib/api-keys";
import { auditLogEntry, getAuditContext } from "@/lib/audit";
import { createActionLogger } from "@/lib/logger";
import { checkPermission } from "./shared/permissions";
import { verifyOrgAccess } from "./shared/verify-org-access";

// Re-export types for convenience (types can be re-exported from server files)
export type {
  ApiKeyPermission,
  ApiKeyWithMeta,
  CreateApiKeyResult,
  DeleteApiKeyResult,
  ListApiKeysResult,
  UpdateApiKeyResult,
} from "@/lib/api-keys";

/**
 * Generate a secure random API key
 */
function generateApiKey(type: ApiKeyType = "live"): {
  key: string;
  prefix: string;
  hash: string;
} {
  const prefix = API_KEY_PREFIXES[type];
  const randomPart = crypto.randomBytes(24).toString("base64url");
  const key = `${prefix}${randomPart}`;
  const hash = crypto.createHash("sha256").update(key).digest("hex");

  return { key, prefix, hash };
}

/**
 * Hash an API key for storage/lookup
 */
function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Extract prefix from API key for display
 */
function extractPrefix(key: string): string {
  // Get the prefix + first 8 chars of random part
  const match = key.match(/^(wraps_(?:live|test|rk)_)(.{8})/);
  if (match) {
    return `${match[1]}${match[2]}...`;
  }
  return `${key.slice(0, 20)}...`;
}

/**
 * List all API keys for an organization
 */
export async function listApiKeys(
  organizationId: string
): Promise<ListApiKeysResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const permError = checkPermission(access.role, "apiKeys", ["read"]);
    if (permError) return permError;

    // Fetch all API keys for this organization
    const keys = await listApiKeysForOrg(organizationId);

    return {
      success: true,
      apiKeys: keys.map((key) => ({
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        permissions: (key.permissions as ApiKeyPermission[]) || [],
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
        createdBy: key.createdByUser,
      })),
    };
  } catch (error) {
    const log = createActionLogger("listApiKeys", { orgSlug: organizationId });
    log.error({ err: error }, "Failed to list API keys");
    return { success: false, error: "Failed to fetch API keys" };
  }
}

/**
 * Create a new API key
 */
export async function createApiKey(
  organizationId: string,
  options: {
    name: string;
    type?: ApiKeyType;
    permissions?: ApiKeyPermission[] | "full" | "readonly";
    expiresInDays?: number;
  }
): Promise<CreateApiKeyResult> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Not authenticated" };
    }

    // Verify user is owner or admin
    const membership = await db.query.member.findFirst({
      where: (m, { and, eq }) =>
        and(
          eq(m.organizationId, organizationId),
          eq(m.userId, session.user.id)
        ),
      with: { organization: { columns: { slug: true } } },
    });

    if (!membership) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }
    const apiKeyWriteError = checkPermission(membership.role, "apiKeys", [
      "write",
    ]);
    if (apiKeyWriteError) return apiKeyWriteError;

    // Validate name
    if (!options.name || options.name.trim().length < 1) {
      return { success: false, error: "API key name is required" };
    }

    // Generate the key
    const keyType = options.type || "live";
    const { key, prefix, hash } = generateApiKey(keyType);

    // Determine permissions
    let permissions: ApiKeyPermission[];
    if (options.permissions === "full" || !options.permissions) {
      permissions = FULL_ACCESS_PERMISSIONS;
    } else if (options.permissions === "readonly") {
      permissions = READ_ONLY_PERMISSIONS;
    } else {
      permissions = options.permissions;
    }

    // Calculate expiration
    let expiresAt: Date | null = null;
    if (options.expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + options.expiresInDays);
    }

    // Store the display prefix (first part of key for identification)
    const displayPrefix = extractPrefix(key);

    const auditCtx = await getAuditContext();
    // Create in database + audit log atomically
    const newKey = await db.transaction(async (tx) => {
      const inserted = await insertApiKey(
        {
          organizationId,
          name: options.name.trim(),
          keyHash: hash,
          prefix: displayPrefix,
          permissions,
          expiresAt,
          createdBy: session.user.id,
        },
        tx
      );
      if (!inserted) return null;
      await tx.insert(auditLog).values(
        auditLogEntry(auditCtx, {
          organizationId,
          actorId: session.user.id,
          actorEmail: session.user.email,
          action: "api_key.created",
          resource: "api_key",
          resourceId: inserted.id,
          metadata: { name: options.name.trim(), type: keyType },
        })
      );
      return inserted;
    });

    if (!newKey) {
      return { success: false, error: "Failed to create API key" };
    }

    // Revalidate settings page
    revalidatePath(`/${membership.organization.slug}/settings`, "page");

    // Track activation event
    await trackApiKeyCreated(session.user.email, organizationId);

    try {
      await notifyOrg({
        organizationId,
        roles: ["owner", "admin"],
        excludeUserIds: [session.user.id],
        type: "api_key.created",
        title: `API key "${options.name.trim()}" created`,
        body: `${session.user.name || session.user.email} created a new ${keyType} API key (${displayPrefix}…).`,
        href: `/${membership.organization.slug}/settings/api-keys`,
        data: { apiKeyId: newKey.id, prefix: displayPrefix },
      });
    } catch (notifyError) {
      const log = createActionLogger("createApiKey", { organizationId });
      log.error(
        { err: notifyError },
        "Failed to write api-key-created notification"
      );
    }

    return {
      success: true,
      apiKey: {
        id: newKey.id,
        name: newKey.name,
        prefix: newKey.prefix,
        permissions,
        lastUsedAt: null,
        expiresAt: newKey.expiresAt,
        createdAt: newKey.createdAt,
        createdBy: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
        },
      },
      // Return the full secret key - this is the ONLY time it's available
      secretKey: key,
    };
  } catch (error) {
    const log = createActionLogger("createApiKey", { orgSlug: organizationId });
    log.error({ err: error }, "Failed to create API key");
    return { success: false, error: "Failed to create API key" };
  }
}

/**
 * Update an API key (name and permissions only)
 */
export async function updateApiKey(
  apiKeyId: string,
  organizationId: string,
  updates: {
    name?: string;
    permissions?: ApiKeyPermission[];
  }
): Promise<UpdateApiKeyResult> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Not authenticated" };
    }

    // Verify user is owner or admin
    const membership = await db.query.member.findFirst({
      where: (m, { and, eq }) =>
        and(
          eq(m.organizationId, organizationId),
          eq(m.userId, session.user.id)
        ),
      with: { organization: { columns: { slug: true } } },
    });

    if (!membership) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }
    const apiKeyWriteError = checkPermission(membership.role, "apiKeys", [
      "write",
    ]);
    if (apiKeyWriteError) return apiKeyWriteError;

    // Verify API key belongs to this organization
    const existingKey = await findApiKeyForOrg(apiKeyId, organizationId);

    if (!existingKey) {
      return { success: false, error: "API key not found" };
    }

    // Build update object
    const updateData: Partial<typeof apiKey.$inferInsert> = {};
    if (updates.name !== undefined) {
      updateData.name = updates.name.trim();
    }
    if (updates.permissions !== undefined) {
      updateData.permissions = updates.permissions;
    }

    if (Object.keys(updateData).length === 0) {
      return { success: false, error: "No updates provided" };
    }

    // Update in database
    const updatedKey = await updateApiKeyForOrg(
      apiKeyId,
      organizationId,
      updateData
    );

    if (!updatedKey) {
      return { success: false, error: "Failed to update API key" };
    }

    // Revalidate settings page
    revalidatePath(`/${membership.organization.slug}/settings`, "page");

    return {
      success: true,
      apiKey: {
        id: updatedKey.id,
        name: updatedKey.name,
        prefix: updatedKey.prefix,
        permissions: (updatedKey.permissions as ApiKeyPermission[]) || [],
        lastUsedAt: updatedKey.lastUsedAt,
        expiresAt: updatedKey.expiresAt,
        createdAt: updatedKey.createdAt,
        createdBy: existingKey.createdByUser,
      },
    };
  } catch (error) {
    const log = createActionLogger("updateApiKey", { orgSlug: organizationId });
    log.error({ err: error, apiKeyId }, "Failed to update API key");
    return { success: false, error: "Failed to update API key" };
  }
}

/**
 * Delete an API key
 */
export async function deleteApiKey(
  apiKeyId: string,
  organizationId: string
): Promise<DeleteApiKeyResult> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Not authenticated" };
    }

    // Verify user is owner or admin
    const membership = await db.query.member.findFirst({
      where: (m, { and, eq }) =>
        and(
          eq(m.organizationId, organizationId),
          eq(m.userId, session.user.id)
        ),
      with: { organization: { columns: { slug: true } } },
    });

    if (!membership) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }
    const apiKeyWriteError = checkPermission(membership.role, "apiKeys", [
      "write",
    ]);
    if (apiKeyWriteError) return apiKeyWriteError;

    // Verify API key belongs to this organization
    const existingKey = await findApiKeyForOrg(apiKeyId, organizationId);

    if (!existingKey) {
      return { success: false, error: "API key not found" };
    }

    const auditCtx = await getAuditContext();
    // Delete from database + audit log atomically
    await db.transaction(async (tx) => {
      await deleteApiKeyForOrg(apiKeyId, organizationId, tx);
      await tx.insert(auditLog).values(
        auditLogEntry(auditCtx, {
          organizationId,
          actorId: session.user.id,
          actorEmail: session.user.email,
          action: "api_key.revoked",
          resource: "api_key",
          resourceId: apiKeyId,
          metadata: { name: existingKey.name },
        })
      );
    });

    // Revalidate settings page
    revalidatePath(`/${membership.organization.slug}/settings`, "page");

    try {
      await notifyOrg({
        organizationId,
        roles: ["owner", "admin"],
        excludeUserIds: [session.user.id],
        type: "api_key.revoked",
        title: `API key "${existingKey.name}" revoked`,
        body: `${session.user.name || session.user.email} revoked this API key. Requests using it will now fail.`,
        href: `/${membership.organization.slug}/settings/api-keys`,
        data: { apiKeyId },
      });
    } catch (notifyError) {
      const log = createActionLogger("deleteApiKey", { organizationId });
      log.error(
        { err: notifyError },
        "Failed to write api-key-revoked notification"
      );
    }

    return { success: true };
  } catch (error) {
    const log = createActionLogger("deleteApiKey", { orgSlug: organizationId });
    log.error({ err: error, apiKeyId }, "Failed to delete API key");
    return { success: false, error: "Failed to delete API key" };
  }
}

/**
 * Verify an API key and return the associated organization
 * This is used by the API middleware to authenticate requests
 */
export async function verifyApiKey(key: string): Promise<{
  valid: boolean;
  organizationId?: string;
  permissions?: ApiKeyPermission[];
  error?: string;
}> {
  try {
    // Check key format
    if (!key.startsWith("wraps_")) {
      return { valid: false, error: "Invalid API key format" };
    }

    // Hash the key for lookup
    const keyHash = hashApiKey(key);

    // Find the key in database
    const foundKey = await findApiKeyByHash(keyHash);

    if (!foundKey) {
      return { valid: false, error: "Invalid API key" };
    }

    // Check expiration
    if (foundKey.expiresAt && foundKey.expiresAt < new Date()) {
      return { valid: false, error: "API key has expired" };
    }

    // Update last used timestamp
    await touchApiKeyLastUsed(foundKey.id).catch((err) => {
      const log = createActionLogger("verifyApiKey", {});
      log.error({ err, apiKeyId: foundKey.id }, "Failed to update lastUsedAt");
    });

    return {
      valid: true,
      organizationId: foundKey.organizationId,
      permissions: (foundKey.permissions as ApiKeyPermission[]) || [],
    };
  } catch (error) {
    const log = createActionLogger("verifyApiKey", {});
    log.error({ err: error }, "Failed to verify API key");
    return { valid: false, error: "Failed to verify API key" };
  }
}
