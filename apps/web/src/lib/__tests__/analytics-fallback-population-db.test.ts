/**
 * Which rows the analytics readers count (real DB).
 *
 * The chart, the emails list, top performers and recent activity are all
 * supposed to describe one population: this organization's email sends with a
 * `sent_at`, and `sent` means "not failed". Two readers had drifted:
 *
 *   - `getTopPerformersFromPostgres` filtered on `delivered_at IS NOT NULL`
 *     and reported the group size as `sent`, so a field the UI prints as
 *     "N sent" was a delivered count and every rate was per delivery;
 *   - `getRecentActivityFromPostgres` had no `sent_at` predicate and stamped
 *     rows that had none with `Date.now()`, presenting a queued message as
 *     something that happened seconds ago.
 *
 * Real rows, because both defects are properties of the WHERE clause. A mocked
 * builder can assert an `and(...)` shape and still count the wrong set.
 */

import { awsAccount, db, messageSend, organization } from "@wraps/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getRecentActivityFromPostgres,
  getTopPerformersFromPostgres,
} from "../analytics-fallback";

const TEST_PREFIX = "analytics-population-db";
const ORG_ID = `${TEST_PREFIX}-org`;
const ACCOUNT_ID = `${TEST_PREFIX}-acct`;

const MINUTE_MS = 60_000;
const NOW = Date.now();
const WINDOW_START = new Date(NOW - 24 * 60 * MINUTE_MS);
const WINDOW_END = new Date(NOW + MINUTE_MS);

const SUBJECT_MIXED = `${TEST_PREFIX} mixed outcomes`;
const SUBJECT_ALL_FAILED = `${TEST_PREFIX} never left SES`;

type RowSpec = {
  key: string;
  subject: string;
  status: "delivered" | "sent" | "bounced" | "failed" | "queued";
  minutesAgo: number | null;
  deliveredAt?: number;
  openedAt?: number;
};

/**
 * `mixed` is the case the old top-performers query got wrong: four sends, only
 * two of them delivered. `sent` must be 3 (everything but the failed row), not
 * 2 (the delivered ones).
 */
const ROWS: RowSpec[] = [
  {
    key: "m-delivered-opened",
    subject: SUBJECT_MIXED,
    status: "delivered",
    minutesAgo: 10,
    deliveredAt: 9,
    openedAt: 8,
  },
  {
    key: "m-delivered",
    subject: SUBJECT_MIXED,
    status: "delivered",
    minutesAgo: 11,
    deliveredAt: 10,
  },
  {
    key: "m-sent-undelivered",
    subject: SUBJECT_MIXED,
    status: "sent",
    minutesAgo: 12,
  },
  {
    key: "m-failed",
    subject: SUBJECT_MIXED,
    status: "failed",
    minutesAgo: 13,
  },
  {
    key: "f-failed-only",
    subject: SUBJECT_ALL_FAILED,
    status: "failed",
    minutesAgo: 14,
  },
  // Created but never sent. Belongs to no window, and has no honest timestamp.
  {
    key: "unsent",
    subject: `${TEST_PREFIX} still queued`,
    status: "queued",
    minutesAgo: null,
  },
];

function rowId(key: string) {
  return `${TEST_PREFIX}-${key}`;
}

beforeAll(async () => {
  await db
    .insert(organization)
    .values({
      id: ORG_ID,
      name: "Analytics Population Org",
      slug: `${TEST_PREFIX}-slug`,
      createdAt: new Date(),
      logo: null,
      metadata: null,
    })
    .onConflictDoNothing();

  await db
    .insert(awsAccount)
    .values({
      id: ACCOUNT_ID,
      organizationId: ORG_ID,
      name: "Population",
      accountId: "111122223333",
      region: "us-east-1",
      roleArn: "arn:aws:iam::111122223333:role/wraps",
      externalId: `${TEST_PREFIX}-ext`,
    })
    .onConflictDoNothing();

  await db
    .insert(messageSend)
    .values(
      ROWS.map((row) => ({
        id: rowId(row.key),
        organizationId: ORG_ID,
        awsAccountId: ACCOUNT_ID,
        channel: "email" as const,
        sourceType: "transactional" as const,
        recipient: "ada@example.com",
        subject: row.subject,
        from: "billing@wraps.dev",
        messageId: rowId(row.key),
        status: row.status,
        sentAt:
          row.minutesAgo === null
            ? null
            : new Date(NOW - row.minutesAgo * MINUTE_MS),
        deliveredAt:
          row.deliveredAt === undefined
            ? null
            : new Date(NOW - row.deliveredAt * MINUTE_MS),
        openedAt:
          row.openedAt === undefined
            ? null
            : new Date(NOW - row.openedAt * MINUTE_MS),
        // A real UA, so the bot filter keeps the open.
        openUserAgent:
          row.openedAt === undefined
            ? null
            : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      }))
    )
    .onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(messageSend).where(eq(messageSend.organizationId, ORG_ID));
  await db.delete(awsAccount).where(eq(awsAccount.organizationId, ORG_ID));
  await db.delete(organization).where(eq(organization.id, ORG_ID));
});

describe("getTopPerformersFromPostgres", () => {
  it("counts sends, not deliveries, in the field the UI prints as sent", async () => {
    const performers = await getTopPerformersFromPostgres(
      ORG_ID,
      WINDOW_START,
      WINDOW_END,
      10
    );
    const mixed = performers.find((p) => p.subject === SUBJECT_MIXED);

    // Four rows share this subject: two delivered, one sent-but-undelivered,
    // one failed. Sent excludes only the failure.
    expect(mixed?.sent).toBe(3);
  });

  it("divides the open rate by sends", async () => {
    const performers = await getTopPerformersFromPostgres(
      ORG_ID,
      WINDOW_START,
      WINDOW_END,
      10
    );
    const mixed = performers.find((p) => p.subject === SUBJECT_MIXED);

    // 1 open over 3 sends. Over deliveries it would have read 50%.
    expect(mixed?.opens).toBe(1);
    expect(mixed?.openRate).toBeCloseTo(33.3, 1);
  });

  it("returns the earliest send as epoch millis, not an unparsed string", async () => {
    const performers = await getTopPerformersFromPostgres(
      ORG_ID,
      WINDOW_START,
      WINDOW_END,
      10
    );
    const mixed = performers.find((p) => p.subject === SUBJECT_MIXED);

    // drizzle's node-postgres driver hands raw `sql` timestamps back as
    // strings, so the old `min(sent_at)` -> `.getTime()` threw and 500'd the
    // route the moment it had any rows to rank.
    expect(mixed?.sentAt).toBe(NOW - 13 * MINUTE_MS);
  });

  it("drops a subject where nothing actually left SES", async () => {
    const performers = await getTopPerformersFromPostgres(
      ORG_ID,
      WINDOW_START,
      WINDOW_END,
      10
    );

    expect(performers.map((p) => p.subject)).not.toContain(SUBJECT_ALL_FAILED);
  });

  it("excludes rows with no sent_at from the window entirely", async () => {
    const performers = await getTopPerformersFromPostgres(
      ORG_ID,
      WINDOW_START,
      WINDOW_END,
      10
    );

    expect(performers.map((p) => p.subject)).not.toContain(
      `${TEST_PREFIX} still queued`
    );
  });
});

describe("getRecentActivityFromPostgres", () => {
  it("omits rows that were never sent instead of dating them now", async () => {
    const activity = await getRecentActivityFromPostgres(ORG_ID, 50);

    expect(activity.map((a) => a.id)).not.toContain(rowId("unsent"));
  });

  it("reports the row's real sent_at, never the current time", async () => {
    const activity = await getRecentActivityFromPostgres(ORG_ID, 50);
    const row = activity.find((a) => a.id === rowId("m-delivered"));

    expect(row?.sentAt).toBe(NOW - 11 * MINUTE_MS);
  });

  it("still returns the sends it should", async () => {
    const activity = await getRecentActivityFromPostgres(ORG_ID, 50);
    const ids = activity.map((a) => a.id);

    expect(ids).toContain(rowId("m-delivered-opened"));
    expect(ids).toContain(rowId("m-sent-undelivered"));
    expect(ids).toContain(rowId("m-failed"));
  });
});
