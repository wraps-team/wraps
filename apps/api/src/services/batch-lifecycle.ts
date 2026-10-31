/**
 * Audit writes for the broadcast lifecycle routes (batch-lifecycle.ts).
 *
 * Copied from `audited()` in services/topics.ts, which mirrors the dashboard's
 * `ctx.audited` (apps/web/src/actions/shared/org-action.ts:92-106): the
 * mutation and its audit_log row commit or roll back together, so a failed
 * mutation leaves no audit row. Action names, resource and metadata match
 * apps/web/src/actions/batch.ts (`broadcast.duplicated`, `broadcast.draft_updated`).
 */

import { auditLog, db, eq, user } from "@wraps/db";

export type BatchAuditAction =
  | "broadcast.duplicated"
  | "broadcast.draft_updated";

export type BatchAuditActor = {
  /** The person behind the request; for an API key, its creator (null once gone). */
  userId: string | null;
  request: Request;
};

export type BatchAuditEntry = {
  action: BatchAuditAction;
  resourceId: string;
  metadata: Record<string, unknown>;
};

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Same derivation as getAuditContext() in apps/web/src/lib/audit.ts. */
function auditRequestContext(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return {
    ipAddress: forwarded ? forwarded.split(",")[0].trim() : null,
    userAgent: request.headers.get("user-agent"),
  };
}

async function actorEmail(userId: string | null): Promise<string | null> {
  if (!userId) {
    return null;
  }
  const row = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { email: true },
  });
  return row?.email ?? null;
}

/**
 * Runs `fn` and the audit insert in one transaction. `fn` receives the
 * transaction handle so the repository helpers write on it too.
 */
export async function withBatchAudit<T>(
  organizationId: string,
  actor: BatchAuditActor,
  fn: (tx: DbTransaction) => Promise<T>,
  entry: (result: T) => BatchAuditEntry
): Promise<T> {
  const email = await actorEmail(actor.userId);
  const { ipAddress, userAgent } = auditRequestContext(actor.request);
  return db.transaction(async (tx) => {
    const result = await fn(tx);
    const row = entry(result);
    await tx.insert(auditLog).values({
      organizationId,
      userId: actor.userId,
      actorEmail: email,
      action: row.action,
      resource: "broadcast",
      resourceId: row.resourceId,
      metadata: row.metadata,
      ipAddress,
      userAgent,
    });
    return result;
  });
}
