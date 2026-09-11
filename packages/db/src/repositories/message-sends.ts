import type { SQL } from "drizzle-orm";
import { and, count, desc, eq, lt, or } from "drizzle-orm";
import { db } from "../index";
import type { MessageSend, MessageSendStatus } from "../schema/batch";
import { messageSend } from "../schema/batch";
import type { DbClient } from "./events";

export type EmailLogFilters = {
  status?: MessageSendStatus;
  cursor?: string;
  limit?: number;
};

// Opaque keyset cursor: `${createdAt ISO}|${id}` base64url-encoded.
// The id tiebreaker is essential — createdAt defaults to now() which is the
// transaction timestamp, so a single batch insert stamps every row with an
// identical createdAt. A createdAt-only cursor with strict `<` would skip the
// rest of that batch on the next page.
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

export function decodeCursor(
  cursor: string
): { createdAt: Date; id: string } | null {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const sep = decoded.indexOf("|");
  if (sep === -1) {
    return null;
  }
  const createdAt = new Date(decoded.slice(0, sep));
  const id = decoded.slice(sep + 1);
  if (Number.isNaN(createdAt.getTime()) || !id) {
    return null;
  }
  return { createdAt, id };
}

const EMAIL_LOG_LIST_FIELDS = {
  id: messageSend.id,
  messageId: messageSend.messageId,
  status: messageSend.status,
  recipient: messageSend.recipient,
  subject: messageSend.subject,
  from: messageSend.from,
  sourceType: messageSend.sourceType,
  sentAt: messageSend.sentAt,
  deliveredAt: messageSend.deliveredAt,
  bouncedAt: messageSend.bouncedAt,
  bouncedSubType: messageSend.bounceSubType,
  createdAt: messageSend.createdAt,
};

export type EmailLogListItem = {
  id: string;
  messageId: string | null;
  status: MessageSendStatus;
  recipient: string;
  subject: string | null;
  from: string | null;
  sourceType: string;
  sentAt: Date | null;
  deliveredAt: Date | null;
  bouncedAt: Date | null;
  bouncedSubType: string | null;
  createdAt: Date;
};

function buildConditions(
  organizationId: string,
  filters: EmailLogFilters
): SQL[] {
  const conditions: SQL[] = [eq(messageSend.organizationId, organizationId)];
  if (filters.status) {
    conditions.push(eq(messageSend.status, filters.status));
  }
  return conditions;
}

export async function listEmailLogs(
  organizationId: string,
  filters: EmailLogFilters,
  dbClient: DbClient = db
): Promise<{
  logs: EmailLogListItem[];
  total: number | null;
  nextCursor: string | null;
}> {
  const limit = Math.min(filters.limit ?? 20, 100);
  const conditions = buildConditions(organizationId, filters);

  // Skip the count on cursor pages — it's already known from the first page
  // and avoids an extra full-table scan for large orgs.
  let total: number | null = null;
  if (!filters.cursor) {
    // biome-ignore lint/plugin: buildConditions above always returns eq(messageSend.organizationId, organizationId) as its first entry — the plugin can't trace `organizationId` through the `...conditions` spread.
    const [totalRow] = await dbClient
      .select({ count: count() })
      .from(messageSend)
      .where(and(...conditions));
    total = totalRow?.count ?? 0;
  }

  const cursorConditions = [...conditions];
  const cursor = filters.cursor ? decodeCursor(filters.cursor) : null;
  if (cursor) {
    // Tuple comparison: rows strictly before the cursor by (createdAt, id).
    const keyset = or(
      lt(messageSend.createdAt, cursor.createdAt),
      and(
        eq(messageSend.createdAt, cursor.createdAt),
        lt(messageSend.id, cursor.id)
      )
    );
    if (keyset) {
      cursorConditions.push(keyset);
    }
  }

  // biome-ignore lint/plugin: `cursorConditions` spreads `conditions` from buildConditions above, whose first entry is always eq(messageSend.organizationId, organizationId) — the plugin can't trace it through the spread.
  const rows = await dbClient
    .select(EMAIL_LOG_LIST_FIELDS)
    .from(messageSend)
    .where(and(...cursorConditions))
    .orderBy(desc(messageSend.createdAt), desc(messageSend.id))
    .limit(limit + 1);

  const hasNextPage = rows.length > limit;
  const logs = (
    hasNextPage ? rows.slice(0, limit) : rows
  ) as EmailLogListItem[];
  const lastLog = logs.at(-1);
  const nextCursor =
    hasNextPage && lastLog ? encodeCursor(lastLog.createdAt, lastLog.id) : null;

  return { logs, total, nextCursor };
}

export async function getEmailLogByMessageId(
  messageId: string,
  organizationId: string,
  dbClient: DbClient = db
): Promise<MessageSend | null> {
  const [row] = await dbClient
    .select()
    .from(messageSend)
    .where(
      and(
        eq(messageSend.messageId, messageId),
        eq(messageSend.organizationId, organizationId)
      )
    )
    .limit(1);

  return row ?? null;
}
