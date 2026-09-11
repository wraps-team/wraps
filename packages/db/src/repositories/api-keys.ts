import { and, desc } from "drizzle-orm";
import { db, eq } from "../index";
import { apiKey } from "../schema/app";

type DrizzleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbClient = typeof db | DrizzleTransaction;

export type ApiKeyRecord = typeof apiKey.$inferSelect;
export type ApiKeyInsert = typeof apiKey.$inferInsert;

// ── List ─────────────────────────────────────────────────────────────────────

export async function listApiKeysForOrg(
  organizationId: string,
  dbClient: DbClient = db
) {
  return dbClient.query.apiKey.findMany({
    where: (k, { eq: eqOp }) => eqOp(k.organizationId, organizationId),
    with: {
      createdByUser: {
        columns: { id: true, name: true, email: true },
      },
    },
    orderBy: [desc(apiKey.createdAt)],
  });
}

// ── Find ─────────────────────────────────────────────────────────────────────

export async function findApiKeyForOrg(
  apiKeyId: string,
  organizationId: string,
  dbClient: DbClient = db
) {
  return dbClient.query.apiKey.findFirst({
    where: (k, { and: andOp, eq: eqOp }) =>
      andOp(eqOp(k.id, apiKeyId), eqOp(k.organizationId, organizationId)),
    with: {
      createdByUser: {
        columns: { id: true, name: true, email: true },
      },
    },
  });
}

// ── Hash-based lookup (unscoped auth path) ────────────────────────────────────

// Resolves which org owns a key for authentication, so it cannot be org-scoped
// — modelled after contacts.ts's findContactByEmailHash / findContactByPhoneHash.
export async function findApiKeyByHash(
  keyHash: string,
  dbClient: DbClient = db
) {
  return dbClient.query.apiKey.findFirst({
    where: (k, { eq: eqOp }) => eqOp(k.keyHash, keyHash),
  });
}

// ── Touch last used (unscoped — follows findApiKeyByHash on the auth path) ────

export async function touchApiKeyLastUsed(
  apiKeyId: string,
  dbClient: DbClient = db
): Promise<void> {
  // biome-ignore lint/plugin: auth-bootstrap path (verifyApiKey in apps/web/src/actions/api-keys.ts) — apiKeyId comes from findApiKeyByHash above, which is how organizationId gets discovered in the first place, so it cannot be pre-scoped here. apiKeyId is a UUID PK identifying exactly one row regardless of org.
  await dbClient
    .update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, apiKeyId));
}

// ── Insert ────────────────────────────────────────────────────────────────────

export async function insertApiKey(
  values: ApiKeyInsert,
  dbClient: DbClient = db
): Promise<ApiKeyRecord | null> {
  const [inserted] = await dbClient.insert(apiKey).values(values).returning();
  return inserted ?? null;
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateApiKeyForOrg(
  apiKeyId: string,
  organizationId: string,
  updateData: Partial<ApiKeyInsert>,
  dbClient: DbClient = db
): Promise<ApiKeyRecord | null> {
  const [updated] = await dbClient
    .update(apiKey)
    .set(updateData)
    .where(
      and(eq(apiKey.id, apiKeyId), eq(apiKey.organizationId, organizationId))
    )
    .returning();
  return updated ?? null;
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteApiKeyForOrg(
  apiKeyId: string,
  organizationId: string,
  dbClient: DbClient = db
): Promise<void> {
  await dbClient
    .delete(apiKey)
    .where(
      and(eq(apiKey.id, apiKeyId), eq(apiKey.organizationId, organizationId))
    );
}
