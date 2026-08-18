import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { messageSend } from "@wraps/db/schema/batch";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  decodeEmailCursor,
  EMAIL_LIST_MAX_DAYS,
  EMAIL_LIST_MAX_PAGE_SIZE,
  EMAIL_LIST_PAGE_SIZE,
  EMAIL_SEARCH_MIN_LENGTH,
  EMAIL_SEARCH_TOO_SHORT_MESSAGE,
  encodeEmailCursor,
  escapeLikeTerm,
  isEmailListSort,
  isEmailListStatus,
  maskAwsAccountId,
  toPgTimestamp,
} from "@/app/(dashboard)/[orgSlug]/emails/lib/list-query";
import type {
  EmailListItem,
  EmailListResponse,
  EmailStatus,
} from "@/app/(dashboard)/[orgSlug]/emails/types";
import { createRequestLogger, serializeError } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The emails list.
 *
 * One Postgres query serves browse AND search (audit F2 + F3). It used to be
 * two code paths reading two stores: browsing merged DynamoDB event history
 * with `message_send`, searching read `message_send` alone, so a message
 * visible while browsing could vanish the moment you searched for it - a
 * customer reported exactly that. DynamoDB is event-keyed (one row per event,
 * unbounded per message), which is why "the next 50 messages" was not
 * expressible against it and why this list was capped at 100 rows with no way
 * past them. `message_send` is a superset by construction: the same EventBridge
 * rule that feeds DynamoDB feeds the webhook that writes here, and the webhook
 * materializes a row for any message id it has never seen.
 *
 * Reading DynamoDB from here is gone, and with it the per-account read failure
 * that used to be swallowed into a silently partial list (F11 at the list
 * level). DynamoDB keeps exactly one job: the per-message timeline on the
 * detail page.
 *
 * Pagination is keyset on `(sent_at DESC, id DESC)` with an opaque cursor, and
 * never counts: our largest organization has 1.95M rows and a `count(*)` on
 * every page load is not a thing this page can afford.
 */

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

/**
 * Postgres/driver codes that mean "the database was unreachable", as opposed
 * to "the query was wrong". They are worth telling apart: one is retryable and
 * transient, the other is ours to fix.
 */
const DB_UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "08000",
  "08001",
  "08003",
  "08006",
  "57P01",
  "57P02",
  "57P03",
]);

function isDbUnreachable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && DB_UNREACHABLE_CODES.has(code);
}

/** Every column the list needs. No joins - one index scan, one page. */
const LIST_COLUMNS = {
  id: messageSend.id,
  messageId: messageSend.messageId,
  from: messageSend.from,
  recipient: messageSend.recipient,
  subject: messageSend.subject,
  status: messageSend.status,
  sentAt: messageSend.sentAt,
  deliveredAt: messageSend.deliveredAt,
  openedAt: messageSend.openedAt,
  clickedAt: messageSend.clickedAt,
  bouncedAt: messageSend.bouncedAt,
  complainedAt: messageSend.complainedAt,
  suppressedAt: messageSend.suppressedAt,
} as const;

type ListRow = {
  id: string;
  messageId: string | null;
  from: string | null;
  recipient: string;
  subject: string | null;
  status: string;
  sentAt: Date;
  deliveredAt: Date | null;
  openedAt: Date | null;
  clickedAt: Date | null;
  bouncedAt: Date | null;
  complainedAt: Date | null;
  suppressedAt: Date | null;
};

function toListItem(row: ListRow): EmailListItem {
  const sentAt = row.sentAt;
  const lastActivityAt = Math.max(
    row.clickedAt?.getTime() ?? 0,
    row.openedAt?.getTime() ?? 0,
    row.bouncedAt?.getTime() ?? 0,
    row.complainedAt?.getTime() ?? 0,
    row.suppressedAt?.getTime() ?? 0,
    row.deliveredAt?.getTime() ?? 0,
    sentAt.getTime()
  );

  // Derived from the timestamp columns, not counted. The column is labelled
  // "Activity" for that reason; the detail page is the only place that reports
  // a real event count.
  const eventCount = [
    true,
    Boolean(row.deliveredAt),
    Boolean(row.openedAt),
    Boolean(row.clickedAt),
    Boolean(row.bouncedAt),
    Boolean(row.complainedAt),
    Boolean(row.suppressedAt),
  ].filter(Boolean).length;

  return {
    id: row.messageId ?? row.id,
    messageId: row.messageId ?? row.id,
    from: row.from ?? "",
    to: [row.recipient],
    subject: row.subject ?? "(no subject)",
    status: (row.status as EmailStatus) ?? "sent",
    sentAt: sentAt.getTime(),
    lastActivityAt,
    eventCount,
    hasOpened: Boolean(row.openedAt),
    hasClicked: Boolean(row.clickedAt),
  };
}

export async function GET(request: Request, context: RouteContext) {
  const { orgSlug } = await context.params;
  const log = createRequestLogger({
    path: "/api/[orgSlug]/emails",
    method: "GET",
    orgSlug,
  });

  try {
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgWithMembership = await getOrganizationWithMembership(
      orgSlug,
      session.user.id
    );

    if (!orgWithMembership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Every predicate below is ANDed with this organization id, which comes
    // from the membership check above and never from the request.
    const organizationId = orgWithMembership.id;

    const { searchParams } = new URL(request.url);
    const days = Math.min(
      EMAIL_LIST_MAX_DAYS,
      Math.max(1, Number.parseInt(searchParams.get("days") || "7", 10) || 7)
    );
    const limit = Math.min(
      EMAIL_LIST_MAX_PAGE_SIZE,
      Math.max(
        1,
        Number.parseInt(
          searchParams.get("limit") || String(EMAIL_LIST_PAGE_SIZE),
          10
        ) || EMAIL_LIST_PAGE_SIZE
      )
    );

    const rawStatus = searchParams.get("status");
    const status = isEmailListStatus(rawStatus) ? rawStatus : null;

    const rawSort = searchParams.get("sort");
    const sort = isEmailListSort(rawSort) ? rawSort : "desc";

    const rawSearch = searchParams.get("search")?.trim() || null;
    if (rawSearch && rawSearch.length < EMAIL_SEARCH_MIN_LENGTH) {
      return NextResponse.json(
        { error: EMAIL_SEARCH_TOO_SHORT_MESSAGE },
        { status: 400 }
      );
    }

    const rawCursor = searchParams.get("cursor");
    const cursor = rawCursor ? decodeEmailCursor(rawCursor) : null;
    if (rawCursor && !cursor) {
      return NextResponse.json(
        { error: "That page link is no longer valid. Reload the list." },
        { status: 400 }
      );
    }

    // A cursor is a position in ONE ordering. Applied to the opposite sort the
    // keyset seeks the wrong way and serves a page out of the middle of a set
    // nobody asked for - so a mismatch is refused rather than guessed at. A
    // legacy cursor carries no sort and is taken at face value, as before.
    if (cursor?.sort && cursor.sort !== sort) {
      return NextResponse.json(
        { error: "That page link is no longer valid. Reload the list." },
        { status: 400 }
      );
    }

    // A cursor pins the window its first page was served with. Recomputing
    // `to = new Date()` on every request slides the window forward mid-walk:
    // sends arriving between pages join the set behind the keyset (harmless
    // but invisible), and - the real defect - rows sitting near the `from`
    // edge age out of the window before the reader pages down to them, so
    // they are dropped from the result set with nothing to indicate it. Only
    // an uncursored request (page 1) picks a fresh window.
    //
    // The token is opaque but unsigned, so clamp what it carries to the bounds
    // a fresh request would get: never into the future, never wider than
    // EMAIL_LIST_MAX_DAYS. Nothing here crosses an organization - that is the
    // `organizationId` predicate below - this only stops a hand-edited cursor
    // from asking for a scan the `days` cap exists to refuse.
    const now = new Date();
    const pinned = cursor?.window ?? null;
    const to = pinned
      ? new Date(Math.min(pinned.to.getTime(), now.getTime()))
      : now;
    const earliest = to.getTime() - EMAIL_LIST_MAX_DAYS * DAY_MS;
    const from = pinned
      ? new Date(Math.max(pinned.from.getTime(), earliest))
      : new Date(to.getTime() - days * DAY_MS);

    const filters: (SQL | undefined)[] = [
      eq(messageSend.channel, "email"),
      isNotNull(messageSend.sentAt),
      gte(messageSend.sentAt, from),
      lte(messageSend.sentAt, to),
    ];

    if (status) {
      filters.push(
        eq(
          messageSend.status,
          status as (typeof messageSend.status)["_"]["data"]
        )
      );
    }

    if (rawSearch) {
      const pattern = `%${escapeLikeTerm(rawSearch)}%`;
      filters.push(
        or(
          ilike(messageSend.recipient, pattern),
          ilike(messageSend.subject, pattern),
          ilike(messageSend.from, pattern)
        )
      );
    }

    // Row-value comparison, so the composite index can seek straight to the
    // page rather than filtering after the fact.
    if (cursor) {
      const cursorSentAt = toPgTimestamp(cursor.sentAt);
      filters.push(
        sort === "desc"
          ? sql`(${messageSend.sentAt}, ${messageSend.id}) < (${cursorSentAt}::timestamp, ${cursor.id})`
          : sql`(${messageSend.sentAt}, ${messageSend.id}) > (${cursorSentAt}::timestamp, ${cursor.id})`
      );
    }

    const orderBy =
      sort === "desc"
        ? [desc(messageSend.sentAt), desc(messageSend.id)]
        : [asc(messageSend.sentAt), asc(messageSend.id)];

    // limit + 1 is the whole of the "has more" logic. Never count(*).
    const [rows, accounts, everSent] = await Promise.all([
      db
        .select(LIST_COLUMNS)
        .from(messageSend)
        .where(and(eq(messageSend.organizationId, organizationId), ...filters))
        .orderBy(...orderBy)
        .limit(limit + 1),
      db
        .select({
          accountId: awsAccount.accountId,
          lastEventReceivedAt: awsAccount.lastEventReceivedAt,
          eventFeedStaleSince: awsAccount.eventFeedStaleSince,
        })
        .from(awsAccount)
        .where(eq(awsAccount.organizationId, organizationId)),
      // Deliberately wider than the chart's `sent`, which counts only
      // `status != 'failed'`. This drives the zero-state - the difference
      // between "you have never sent anything" and "nothing matched these
      // filters" - and an org whose only send failed has still sent. Showing
      // it the never-sent onboarding copy would be wrong and would hide the
      // failure it needs to see. So: any email row with a `sent_at`, in any
      // status, in any window, counts. Do not narrow this to match the chart.
      db
        .select({ id: messageSend.id })
        .from(messageSend)
        .where(
          and(
            eq(messageSend.organizationId, organizationId),
            eq(messageSend.channel, "email"),
            isNotNull(messageSend.sentAt)
          )
        )
        .limit(1),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);
    const nextCursor =
      hasMore && last?.sentAt && last.id
        ? encodeEmailCursor({
            sentAt: last.sentAt,
            id: last.id,
            sort,
            // Carried, not recomputed, so page 3 sees page 1's window.
            window: { from, to },
          })
        : null;

    const body: EmailListResponse = {
      // `sent_at IS NOT NULL` is in the WHERE clause; the narrowing here is
      // only so the mapper can take a non-null Date.
      items: page.flatMap((row) =>
        row.sentAt ? [toListItem({ ...row, sentAt: row.sentAt })] : []
      ),
      nextCursor,
      window: { days, from: from.toISOString(), to: to.toISOString() },
      feed: {
        hasEverSent: everSent.length > 0,
        accounts: accounts.map((account) => ({
          maskedAccountId: maskAwsAccountId(account.accountId),
          eventFeedStaleSince:
            account.eventFeedStaleSince?.toISOString() ?? null,
          hasEverReceivedEvents: account.lastEventReceivedAt !== null,
        })),
      },
    };

    log.info(
      {
        days,
        hasMore,
        hasSearch: Boolean(rawSearch),
        paged: Boolean(cursor),
        rowCount: body.items.length,
        sort,
        status,
      },
      "Emails list served"
    );

    return NextResponse.json(body);
  } catch (error) {
    if (isDbUnreachable(error)) {
      log.error(
        { err: serializeError(error) },
        "Emails list unavailable: message store unreachable"
      );
      return NextResponse.json(
        {
          error:
            "Wraps could not reach the message store. Your history is intact - retry in a moment.",
        },
        { status: 503 }
      );
    }

    log.error({ err: serializeError(error) }, "Emails list query failed");
    return NextResponse.json(
      { error: "Failed to load messages." },
      { status: 500 }
    );
  }
}
