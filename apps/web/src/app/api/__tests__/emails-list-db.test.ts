/**
 * Emails list API - one Postgres query, keyset paged (audit F2 + F3, real DB).
 *
 * These run against a real Neon branch and seed real `message_send` rows,
 * because the two defects being fixed are both properties of the query itself:
 * that a cursor walks the whole set exactly once, and that a search term does
 * not change which store (or which filter semantics) answer the request. A
 * mocked query builder can assert the shape of an `and(...)` call and still
 * ship a keyset that skips rows at a page boundary.
 *
 * The old suite (`emails-status-filter.test.ts`) mocked DynamoDB and the query
 * builder to pin status filtering. Every one of its assertions is carried
 * below, now against real rows.
 */

import { awsAccount, db, messageSend, organization } from "@wraps/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PlanId } from "@/lib/plans";

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

const TEST_PREFIX = "emails-list-db";
const ORG_ID = `${TEST_PREFIX}-org`;
const OTHER_ORG_ID = `${TEST_PREFIX}-other-org`;
const ORG_SLUG = `${TEST_PREFIX}-org-slug`;

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: "user-1", email: "test@example.com", name: "Test" },
      })),
    },
  },
}));

vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: vi.fn(async (slug: string) =>
    slug === ORG_SLUG
      ? { id: ORG_ID, name: "Emails List Org", slug: ORG_SLUG }
      : null
  ),
}));

/**
 * The list window is clamped by two ceilings: EMAIL_LIST_MAX_DAYS, and the
 * plan's own retention — whichever is smaller. Which one binds depends on the
 * org's plan, so the plan lookup is stubbed rather than seeded, and defaults to
 * the Free tier every other test in this file already ran under.
 */
const mockPlanId = vi.fn(
  async (_organizationId: string): Promise<PlanId> => "free"
);

vi.mock("@/lib/plan-limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plan-limits")>()),
  getOrganizationPlan: (organizationId: string) => mockPlanId(organizationId),
}));

vi.mock("@/lib/logger", () => ({
  createRequestLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
  serializeError: (e: unknown) => e,
}));

const HEALTHY_ACCOUNT = `${TEST_PREFIX}-acct-healthy`;
const SILENT_ACCOUNT = `${TEST_PREFIX}-acct-silent`;

/** Newest first. Each row is a minute apart so ordering is unambiguous. */
const MESSAGES = [
  {
    key: "m1",
    minutesAgo: 1,
    status: "delivered" as const,
    subject: "Invoice 001",
    recipient: "ada@example.com",
  },
  {
    key: "m2",
    minutesAgo: 2,
    status: "bounced" as const,
    subject: "Invoice 002",
    recipient: "grace@example.com",
  },
  {
    key: "m3",
    minutesAgo: 3,
    status: "complained" as const,
    subject: "Weekly digest",
    recipient: "ada@example.com",
  },
  {
    key: "m4",
    minutesAgo: 4,
    status: "delivered" as const,
    subject: "Invoice 003",
    recipient: "linus@example.com",
  },
  {
    key: "m5",
    minutesAgo: 5,
    status: "sent" as const,
    subject: "Welcome",
    recipient: "ada@example.com",
  },
  {
    key: "m6",
    minutesAgo: 6,
    status: "bounced" as const,
    subject: "Invoice 004",
    recipient: "grace@example.com",
  },
  {
    key: "m7",
    minutesAgo: 7,
    status: "opened" as const,
    subject: "Welcome back",
    recipient: "linus@example.com",
  },
] as const;

/** Newest to oldest - the default order the API must return. */
const EXPECTED_DESC = MESSAGES.map((m) => `${TEST_PREFIX}-${m.key}`);

const now = Date.now();

function messageIdFor(key: string) {
  return `${TEST_PREFIX}-${key}`;
}

async function callList(query: string) {
  const { GET } = await import("../[orgSlug]/emails/route");
  const response = await GET(
    new Request(`http://localhost/api/${ORG_SLUG}/emails?${query}`),
    { params: Promise.resolve({ orgSlug: ORG_SLUG }) }
  );
  return { response, body: await response.json() };
}

/** Walks every page the cursor offers, returning the message ids in order. */
async function walkAllPages(query: string) {
  const ids: string[] = [];
  let cursor: string | null = null;
  let pages = 0;

  do {
    const { response, body } = await callList(
      cursor ? `${query}&cursor=${encodeURIComponent(cursor)}` : query
    );
    expect(response.status).toBe(200);
    ids.push(
      ...body.items.map((item: { messageId: string }) => item.messageId)
    );
    cursor = body.nextCursor;
    pages += 1;
    // Guard against a cursor that never terminates.
    expect(pages).toBeLessThan(20);
  } while (cursor);

  return { ids, pages };
}

beforeAll(async () => {
  await db
    .insert(organization)
    .values([
      {
        id: ORG_ID,
        name: "Emails List Org",
        slug: ORG_SLUG,
        createdAt: new Date(),
        logo: null,
        metadata: null,
      },
      {
        id: OTHER_ORG_ID,
        name: "Emails List Other Org",
        slug: `${ORG_SLUG}-other`,
        createdAt: new Date(),
        logo: null,
        metadata: null,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(awsAccount)
    .values([
      {
        id: HEALTHY_ACCOUNT,
        organizationId: ORG_ID,
        name: "Healthy",
        accountId: "111122223333",
        region: "us-east-1",
        roleArn: "arn:aws:iam::111122223333:role/wraps",
        externalId: `${TEST_PREFIX}-ext-healthy`,
        lastEventReceivedAt: new Date(now - 60_000),
        eventFeedStaleSince: new Date(now - 3_600_000),
      },
      {
        id: SILENT_ACCOUNT,
        organizationId: ORG_ID,
        name: "Silent",
        accountId: "444455556666",
        region: "us-east-1",
        roleArn: "arn:aws:iam::444455556666:role/wraps",
        externalId: `${TEST_PREFIX}-ext-silent`,
        lastEventReceivedAt: null,
        eventFeedStaleSince: null,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(messageSend)
    .values([
      ...MESSAGES.map((message) => ({
        id: messageIdFor(message.key),
        organizationId: ORG_ID,
        awsAccountId: HEALTHY_ACCOUNT,
        channel: "email" as const,
        sourceType: "transactional" as const,
        recipient: message.recipient,
        subject: message.subject,
        from: "billing@wraps.dev",
        messageId: messageIdFor(message.key),
        status: message.status,
        sentAt: new Date(now - message.minutesAgo * 60_000),
      })),
      // Outside every window the list serves.
      {
        id: messageIdFor("ancient"),
        organizationId: ORG_ID,
        awsAccountId: HEALTHY_ACCOUNT,
        channel: "email" as const,
        sourceType: "transactional" as const,
        recipient: "ada@example.com",
        subject: "Invoice from another era",
        from: "billing@wraps.dev",
        messageId: messageIdFor("ancient"),
        status: "delivered" as const,
        sentAt: new Date(now - 400 * 24 * 60 * 60 * 1000),
      },
      // Another organization's message, same recipient and subject.
      {
        id: messageIdFor("foreign"),
        organizationId: OTHER_ORG_ID,
        awsAccountId: HEALTHY_ACCOUNT,
        channel: "email" as const,
        sourceType: "transactional" as const,
        recipient: "ada@example.com",
        subject: "Invoice 001",
        from: "billing@wraps.dev",
        messageId: messageIdFor("foreign"),
        status: "delivered" as const,
        sentAt: new Date(now - 90_000),
      },
      // An SMS send in the same window - this list is email only.
      {
        id: messageIdFor("sms"),
        organizationId: ORG_ID,
        awsAccountId: HEALTHY_ACCOUNT,
        channel: "sms" as const,
        sourceType: "transactional" as const,
        recipient: "+15555550100",
        subject: "Invoice 005",
        from: "billing@wraps.dev",
        messageId: messageIdFor("sms"),
        status: "delivered" as const,
        sentAt: new Date(now - 30_000),
      },
    ])
    .onConflictDoNothing();
});

afterAll(async () => {
  await db
    .delete(messageSend)
    .where(inArray(messageSend.organizationId, [ORG_ID, OTHER_ORG_ID]));
  await db.delete(awsAccount).where(eq(awsAccount.organizationId, ORG_ID));
  await db
    .delete(organization)
    .where(inArray(organization.id, [ORG_ID, OTHER_ORG_ID]));
});

describe("Emails API - keyset pagination", () => {
  it("walks the whole set across pages with no gaps and no repeats", async () => {
    const { ids, pages } = await walkAllPages("days=7&limit=2");

    expect(ids).toEqual(EXPECTED_DESC);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pages).toBe(4); // 2 + 2 + 2 + 1
  });

  it("returns no cursor once the last page is served", async () => {
    const { body } = await callList("days=7&limit=100");

    expect(body.items).toHaveLength(EXPECTED_DESC.length);
    expect(body.nextCursor).toBeNull();
  });

  it("offers a cursor whenever more rows exist", async () => {
    const { body } = await callList("days=7&limit=3");

    expect(body.items).toHaveLength(3);
    expect(typeof body.nextCursor).toBe("string");
  });

  it("walks the same set in the other direction when sorted ascending", async () => {
    const { ids } = await walkAllPages("days=7&limit=3&sort=asc");

    expect(ids).toEqual([...EXPECTED_DESC].reverse());
  });

  it("refuses a cursor replayed against the other sort order", async () => {
    // A cursor is a position in ONE ordering. Applied to the opposite sort the
    // keyset seeks the wrong way and serves a page out of the middle of a set
    // nobody asked for, so this has to be refused rather than guessed at.
    const first = await callList("days=7&limit=2");
    expect(typeof first.body.nextCursor).toBe("string");

    const { response, body } = await callList(
      `days=7&limit=2&sort=asc&cursor=${encodeURIComponent(first.body.nextCursor)}`
    );

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/page link/i);
  });

  it("accepts the cursor under the sort it was minted with", async () => {
    const first = await callList("days=7&limit=2&sort=asc");

    const { response } = await callList(
      `days=7&limit=2&sort=asc&cursor=${encodeURIComponent(first.body.nextCursor)}`
    );

    expect(response.status).toBe(200);
  });

  it("rejects a malformed cursor as a bad request, not a 500", async () => {
    const { response, body } = await callList("days=7&cursor=not-a-cursor");

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/page link/i);
  });
});

describe("Emails API - scope", () => {
  it("returns only this organization's email sends inside the window", async () => {
    const { body } = await callList("days=7&limit=100");

    const ids = body.items.map((item: { messageId: string }) => item.messageId);
    expect(ids).not.toContain(messageIdFor("foreign"));
    expect(ids).not.toContain(messageIdFor("ancient"));
    expect(ids).not.toContain(messageIdFor("sms"));
  });

  it("reports the window it actually applied", async () => {
    const { body } = await callList("days=30&limit=1");

    expect(body.window.days).toBe(30);
    const from = new Date(body.window.from).getTime();
    const to = new Date(body.window.to).getTime();
    expect(to - from).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("clamps an absurd window to the plan's retention window", async () => {
    // Free retains 30 days, so the plan is the binding ceiling here — not
    // EMAIL_LIST_MAX_DAYS. Before the plan window was enforced on this list, a
    // Free org could ask for a year and get one.
    mockPlanId.mockResolvedValueOnce("free");

    const { body } = await callList("days=9000&limit=1");

    expect(body.window.days).toBe(30);
  });

  it("clamps an absurd window to the 365-day ceiling on a plan that retains longer", async () => {
    // Business retains 365, so EMAIL_LIST_MAX_DAYS is what stops days=9000.
    // Without this case nothing exercises that ceiling at all.
    mockPlanId.mockResolvedValueOnce("business");

    const { body } = await callList("days=9000&limit=1");

    expect(body.window.days).toBe(365);
  });

  it("does not shorten a request that already fits inside the plan window", async () => {
    // Asking for 7 days on a 30-day plan is not a clamp.
    mockPlanId.mockResolvedValueOnce("free");

    const { body } = await callList("days=7&limit=1");

    expect(body.window.days).toBe(7);
  });
});

describe("Emails API - status filter", () => {
  it("returns every status when no status param is provided", async () => {
    const { body } = await callList("days=7&limit=100");

    const statuses = body.items.map((item: { status: string }) => item.status);
    expect(statuses).toContain("bounced");
    expect(statuses).toContain("complained");
    expect(statuses).toContain("delivered");
  });

  it("returns only bounced messages when status=bounced", async () => {
    const { body } = await callList("days=7&limit=100&status=bounced");

    expect(body.items).toHaveLength(2);
    for (const item of body.items) {
      expect(item.status).toBe("bounced");
    }
  });

  it("returns only complained messages when status=complained", async () => {
    const { body } = await callList("days=7&limit=100&status=complained");

    expect(body.items).toHaveLength(1);
    expect(body.items[0].messageId).toBe(messageIdFor("m3"));
  });

  it("ignores a status value outside the vocabulary", async () => {
    const { body } = await callList("days=7&limit=100&status=invalid_status");

    expect(body.items).toHaveLength(EXPECTED_DESC.length);
  });
});

describe("Emails API - search rides the same query", () => {
  it("matches recipient, subject and sender", async () => {
    const bySubject = await callList("days=7&limit=100&search=Invoice");
    const byRecipient = await callList("days=7&limit=100&search=grace");
    const bySender = await callList(
      "days=7&limit=100&search=billing@wraps.dev"
    );

    expect(
      bySubject.body.items.map((i: { messageId: string }) => i.messageId)
    ).toEqual([
      messageIdFor("m1"),
      messageIdFor("m2"),
      messageIdFor("m4"),
      messageIdFor("m6"),
    ]);
    expect(byRecipient.body.items).toHaveLength(2);
    expect(bySender.body.items).toHaveLength(EXPECTED_DESC.length);
  });

  it("composes search, status and cursor in one query", async () => {
    const { ids, pages } = await walkAllPages(
      "days=7&limit=1&search=Invoice&status=bounced"
    );

    expect(ids).toEqual([messageIdFor("m2"), messageIdFor("m6")]);
    expect(pages).toBe(2);
  });

  it("filters by status identically with and without a search term", async () => {
    const withoutSearch = await callList("days=7&limit=100&status=bounced");
    const withSearch = await callList(
      "days=7&limit=100&status=bounced&search=example.com"
    );

    expect(
      withSearch.body.items.map((i: { messageId: string }) => i.messageId)
    ).toEqual(
      withoutSearch.body.items.map((i: { messageId: string }) => i.messageId)
    );
  });

  it("refuses a term shorter than three characters and says why", async () => {
    const { response, body } = await callList("days=7&search=in");

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/at least 3 characters/i);
  });

  it("treats a wildcard character as a literal", async () => {
    const { body } = await callList("days=7&limit=100&search=%25%25%25");

    expect(body.items).toHaveLength(0);
  });
});

describe("Emails API - event feed health", () => {
  it("reports staleness and never-received accounts, masked", async () => {
    const { body } = await callList("days=7&limit=1");

    expect(body.feed.hasEverSent).toBe(true);

    const healthy = body.feed.accounts.find(
      (a: { maskedAccountId: string }) => a.maskedAccountId === "1111...3333"
    );
    const silent = body.feed.accounts.find(
      (a: { maskedAccountId: string }) => a.maskedAccountId === "4444...6666"
    );

    expect(healthy.hasEverReceivedEvents).toBe(true);
    expect(healthy.eventFeedStaleSince).not.toBeNull();
    expect(healthy.lastEventReceivedAt).toBe(
      new Date(now - 60_000).toISOString()
    );
    expect(silent.hasEverReceivedEvents).toBe(false);
    expect(silent.eventFeedStaleSince).toBeNull();
    expect(silent.lastEventReceivedAt).toBeNull();
  });

  it("still reports the feed for a window with no rows in it", async () => {
    const { body } = await callList("days=7&limit=100&search=nothingmatches");

    expect(body.items).toHaveLength(0);
    expect(body.feed.hasEverSent).toBe(true);
    expect(body.feed.accounts).toHaveLength(2);
  });
});
