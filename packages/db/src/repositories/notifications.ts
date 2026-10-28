import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../index";
import { notification } from "../schema/auth";

type DrizzleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbClient = typeof db | DrizzleTransaction;

export type NotificationRecord = typeof notification.$inferSelect;

// Writers live in @wraps/auth/notify (packages/auth/src/notify.ts): rows are
// created through `auth.api.notify` so routed types get delivery rows and email.
// This repository only reads (dedupe) and deletes.

// ── Dedupe guard for recurring detectors (crons, event pipelines) ────────────

export async function hasRecentNotification(
  params: {
    organizationId: string;
    type: string;
    since: Date;
    dataEquals?: { key: string; value: string };
  },
  dbClient: DbClient = db
) {
  const conditions = [
    eq(notification.organizationId, params.organizationId),
    eq(notification.type, params.type),
    gte(notification.createdAt, params.since),
  ];
  if (params.dataEquals) {
    conditions.push(
      sql`${notification.data}->>${params.dataEquals.key} = ${params.dataEquals.value}`
    );
  }
  const rows = await dbClient
    .select({ id: notification.id })
    .from(notification)
    .where(and(...conditions))
    .limit(1);
  return rows.length > 0;
}

// ── Test/cleanup helper ──────────────────────────────────────────────────────

export async function deleteNotificationsForOrg(
  organizationId: string,
  types?: string[],
  dbClient: DbClient = db
) {
  const conditions = [eq(notification.organizationId, organizationId)];
  if (types?.length) {
    conditions.push(inArray(notification.type, types));
  }
  await dbClient.delete(notification).where(and(...conditions));
}
