/**
 * API key management behind the /v1/api-keys routes.
 *
 * Lifted from apps/web/src/actions/api-keys.ts: `listApiKeys`, `createApiKey`
 * and `deleteApiKey`. Key generation, the display prefix, the stored hash and
 * the `api_key.created` / `api_key.revoked` audit rows are the same as the
 * dashboard's, so a key minted here authenticates through `validateApiKey`
 * (apps/api/src/middleware/auth.ts) exactly like one minted in the dashboard.
 *
 * The permission and constant tables are copied from apps/web/src/lib/api-keys.ts
 * because that file is not importable from the API. Keep the two in step.
 *
 * Nothing in this module logs the secret. The secret leaves only as the return
 * value of `createApiKeyForApi`, which the route sends once.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  auditLog,
  db,
  deleteApiKeyForOrg,
  findApiKeyForOrg,
  insertApiKey,
  listApiKeysForOrg,
} from "@wraps/db";

export const API_KEY_PREFIXES = {
  live: "wraps_live_",
  test: "wraps_test_",
  restricted: "wraps_rk_",
} as const;

export type ApiKeyType = keyof typeof API_KEY_PREFIXES;

export const API_KEY_PERMISSIONS = [
  "contacts:read",
  "contacts:write",
  "topics:read",
  "topics:write",
  "segments:read",
  "segments:write",
  "campaigns:read",
  "campaigns:write",
  "workflows:read",
  "workflows:write",
  "analytics:read",
  "send:email",
] as const;

export type ApiKeyPermission = (typeof API_KEY_PERMISSIONS)[number];

export const FULL_ACCESS_PERMISSIONS: ApiKeyPermission[] = [
  "contacts:read",
  "contacts:write",
  "topics:read",
  "topics:write",
  "segments:read",
  "segments:write",
  "campaigns:read",
  "campaigns:write",
  "workflows:read",
  "workflows:write",
  "analytics:read",
  "send:email",
];

export const READ_ONLY_PERMISSIONS: ApiKeyPermission[] = [
  "contacts:read",
  "topics:read",
  "segments:read",
  "campaigns:read",
  "workflows:read",
  "analytics:read",
];

export type ApiKeyActor = { id: string; name: string; email: string };

export type AuditRequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

/** Same derivation as getAuditContext() in apps/web/src/lib/audit.ts. */
export function auditContextFromRequest(request: Request): AuditRequestContext {
  const forwarded = request.headers.get("x-forwarded-for");
  return {
    ipAddress: forwarded ? forwarded.split(",")[0].trim() : null,
    userAgent: request.headers.get("user-agent"),
  };
}

/** Lifted from generateApiKey() in apps/web/src/actions/api-keys.ts. */
export function generateApiKey(type: ApiKeyType = "live"): {
  key: string;
  hash: string;
} {
  const prefix = API_KEY_PREFIXES[type];
  const randomPart = randomBytes(24).toString("base64url");
  const key = `${prefix}${randomPart}`;
  const hash = createHash("sha256").update(key).digest("hex");

  return { key, hash };
}

/** Lifted from extractPrefix() in apps/web/src/actions/api-keys.ts. */
const DISPLAY_PREFIX_PATTERN = /^(wraps_(?:live|test|rk)_)(.{8})/;

export function extractPrefix(key: string): string {
  // Get the prefix + first 8 chars of random part
  const match = key.match(DISPLAY_PREFIX_PATTERN);
  if (match) {
    return `${match[1]}${match[2]}...`;
  }
  return `${key.slice(0, 20)}...`;
}

function resolvePermissions(
  requested: ApiKeyPermission[] | "full" | "readonly" | undefined
): ApiKeyPermission[] {
  if (requested === "full" || !requested) {
    return FULL_ACCESS_PERMISSIONS;
  }
  if (requested === "readonly") {
    return READ_ONLY_PERMISSIONS;
  }
  return requested;
}

type ApiKeyRow = Awaited<ReturnType<typeof listApiKeysForOrg>>[number];

/** Response shape. Never includes keyHash or the secret. */
export function toApiKeyView(row: ApiKeyRow) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    permissions: (row.permissions as ApiKeyPermission[]) || [],
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdByUser
      ? {
          id: row.createdByUser.id,
          name: row.createdByUser.name,
          email: row.createdByUser.email,
        }
      : null,
  };
}

/** Lifted from listApiKeys(): every key in the org, newest first. */
export async function listApiKeysForApi(organizationId: string) {
  const keys = await listApiKeysForOrg(organizationId);
  return keys.map(toApiKeyView);
}

/**
 * Lifted from createApiKey(): insert the key and its `api_key.created` audit
 * row in one transaction. Returns the one-time secret alongside the view.
 */
export async function createApiKeyForApi(input: {
  organizationId: string;
  actor: ApiKeyActor;
  name: string;
  type: ApiKeyType;
  permissions: ApiKeyPermission[] | "full" | "readonly" | undefined;
  expiresInDays: number | undefined;
  request: AuditRequestContext;
}): Promise<{
  apiKey: ReturnType<typeof toApiKeyView>;
  secretKey: string;
}> {
  const { key, hash } = generateApiKey(input.type);
  const permissions = resolvePermissions(input.permissions);

  let expiresAt: Date | null = null;
  if (input.expiresInDays) {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);
  }

  const displayPrefix = extractPrefix(key);

  const inserted = await db.transaction(async (tx) => {
    const row = await insertApiKey(
      {
        organizationId: input.organizationId,
        name: input.name,
        keyHash: hash,
        prefix: displayPrefix,
        permissions,
        expiresAt,
        createdBy: input.actor.id,
      },
      tx
    );
    if (!row) {
      return null;
    }
    await tx.insert(auditLog).values({
      organizationId: input.organizationId,
      userId: input.actor.id,
      actorEmail: input.actor.email,
      action: "api_key.created",
      resource: "api_key",
      resourceId: row.id,
      metadata: { name: input.name, type: input.type },
      ipAddress: input.request.ipAddress,
      userAgent: input.request.userAgent,
    });
    return row;
  });

  if (!inserted) {
    throw new Error("Failed to create API key");
  }

  return {
    apiKey: {
      id: inserted.id,
      name: inserted.name,
      prefix: inserted.prefix,
      permissions,
      lastUsedAt: null,
      expiresAt: inserted.expiresAt?.toISOString() ?? null,
      createdAt: inserted.createdAt.toISOString(),
      createdBy: {
        id: input.actor.id,
        name: input.actor.name,
        email: input.actor.email,
      },
    },
    // The only place the secret leaves this module. Returned once; not stored.
    secretKey: key,
  };
}

/**
 * Lifted from deleteApiKey(): delete the key and write its `api_key.revoked`
 * audit row in one transaction. Both lookups are scoped to the org, so an id
 * from another org is "not found" and its row is never touched.
 */
export async function revokeApiKeyForApi(input: {
  organizationId: string;
  actor: ApiKeyActor;
  apiKeyId: string;
  request: AuditRequestContext;
}): Promise<{ name: string } | null> {
  const existing = await findApiKeyForOrg(input.apiKeyId, input.organizationId);
  if (!existing) {
    return null;
  }

  await db.transaction(async (tx) => {
    await deleteApiKeyForOrg(input.apiKeyId, input.organizationId, tx);
    await tx.insert(auditLog).values({
      organizationId: input.organizationId,
      userId: input.actor.id,
      actorEmail: input.actor.email,
      action: "api_key.revoked",
      resource: "api_key",
      resourceId: input.apiKeyId,
      metadata: { name: existing.name },
      ipAddress: input.request.ipAddress,
      userAgent: input.request.userAgent,
    });
  });

  return { name: existing.name };
}

/** The signed-in user's name and email, for audit rows and notifications. */
export async function findApiKeyActor(
  userId: string
): Promise<ApiKeyActor | null> {
  const row = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.id, userId),
    columns: { id: true, name: true, email: true },
  });
  return row ?? null;
}

/** The org's slug, for the settings link in notifications. */
export async function findOrgSlug(
  organizationId: string
): Promise<string | null> {
  const row = await db.query.organization.findFirst({
    where: (o, { eq }) => eq(o.id, organizationId),
    columns: { slug: true },
  });
  return row?.slug ?? null;
}
