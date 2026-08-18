/**
 * Emails list API - the window a cursor was minted with (real DB).
 *
 * The route used to recompute `to = new Date()` on every request, so the
 * window slid forward while a reader paged through it. Two consequences, one
 * of them silent data loss:
 *
 *   - a row sitting near the `from` edge when page 1 was served aged out of
 *     the window before the reader got to it, and vanished from the walk with
 *     nothing in the response to say so;
 *   - sends arriving mid-pagination changed the set being walked underneath
 *     the keyset.
 *
 * These need a real DB and a controlled clock: the defect is a property of
 * which rows the query's WHERE admits on the second request, which a mocked
 * builder cannot show.
 *
 * Own organization and TEST_PREFIX so the boundary rows here cannot disturb
 * the exact-set assertions in `emails-list-db.test.ts`.
 */

import { awsAccount, db, messageSend, organization } from "@wraps/db";
import { eq, inArray } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

const TEST_PREFIX = "emails-window-db";
const ORG_ID = `${TEST_PREFIX}-org`;
const ORG_SLUG = `${TEST_PREFIX}-org-slug`;
const ACCOUNT_ID = `${TEST_PREFIX}-acct`;

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
      ? { id: ORG_ID, name: "Emails Window Org", slug: ORG_SLUG }
      : null
  ),
}));

vi.mock("@/lib/logger", () => ({
  createRequestLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
  serializeError: (e: unknown) => e,
}));

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;

/** The instant page 1 is served. Every row below is placed relative to it. */
const T0 = Date.now();

/**
 * A term only this file's rows match, so the walk is not diluted by anything
 * else seeded into the same organization.
 */
const SEARCH = "windowpinned";

function rowId(key: string) {
  return `${TEST_PREFIX}-${key}`;
}

function baseRow(key: string, sentAt: Date) {
  return {
    id: rowId(key),
    organizationId: ORG_ID,
    awsAccountId: ACCOUNT_ID,
    channel: "email" as const,
    sourceType: "transactional" as const,
    recipient: "ada@example.com",
    subject: `WindowPinned ${key}`,
    from: "billing@wraps.dev",
    messageId: rowId(key),
    status: "delivered" as const,
    sentAt,
  };
}

/**
 * `boundary` sits one minute inside the `days=1` lower edge as of T0. Advance
 * the clock five minutes and a recomputed window no longer contains it.
 */
const SEEDED = [
  baseRow("newest", new Date(T0 - MINUTE_MS)),
  baseRow("middle", new Date(T0 - 2 * MINUTE_MS)),
  baseRow("boundary", new Date(T0 - DAY_MS + MINUTE_MS)),
];

/** Not seeded up front - inserted while the reader sits on page 1. */
const ARRIVAL = baseRow("arrival", new Date(T0 + MINUTE_MS));

async function callList(query: string) {
  const { GET } = await import("../[orgSlug]/emails/route");
  const response = await GET(
    new Request(`http://localhost/api/${ORG_SLUG}/emails?${query}`),
    { params: Promise.resolve({ orgSlug: ORG_SLUG }) }
  );
  return { response, body: await response.json() };
}

const idsOf = (body: { items: { messageId: string }[] }) =>
  body.items.map((item) => item.messageId);

beforeAll(async () => {
  await db
    .insert(organization)
    .values({
      id: ORG_ID,
      name: "Emails Window Org",
      slug: ORG_SLUG,
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
      name: "Window",
      accountId: "111122223333",
      region: "us-east-1",
      roleArn: "arn:aws:iam::111122223333:role/wraps",
      externalId: `${TEST_PREFIX}-ext`,
      lastEventReceivedAt: new Date(T0 - MINUTE_MS),
      eventFeedStaleSince: null,
    })
    .onConflictDoNothing();

  await db.insert(messageSend).values(SEEDED).onConflictDoNothing();
});

afterEach(async () => {
  vi.useRealTimers();
  await db.delete(messageSend).where(eq(messageSend.id, rowId("arrival")));
});

afterAll(async () => {
  await db.delete(messageSend).where(eq(messageSend.organizationId, ORG_ID));
  await db.delete(awsAccount).where(eq(awsAccount.organizationId, ORG_ID));
  await db.delete(organization).where(inArray(organization.id, [ORG_ID]));
});

describe("Emails API - the cursor pins its window", () => {
  it("still serves a row near the from edge after the clock moves on", async () => {
    // Only Date is faked; the pg driver's timers stay real.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(T0));

    const page1 = await callList(`days=1&limit=2&search=${SEARCH}`);
    expect(page1.response.status).toBe(200);
    expect(idsOf(page1.body)).toEqual([rowId("newest"), rowId("middle")]);
    expect(typeof page1.body.nextCursor).toBe("string");

    // Five minutes pass while the reader looks at page 1. `boundary` was one
    // minute inside the window at T0, so a window recomputed now would start
    // four minutes after it and drop it.
    vi.setSystemTime(new Date(T0 + 5 * MINUTE_MS));

    const page2 = await callList(
      `days=1&limit=2&search=${SEARCH}&cursor=${encodeURIComponent(page1.body.nextCursor)}`
    );

    expect(page2.response.status).toBe(200);
    expect(idsOf(page2.body)).toEqual([rowId("boundary")]);
    expect(page2.body.nextCursor).toBeNull();
  });

  it("does not let a send arriving mid-pagination shift page 2", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(T0));

    const page1 = await callList(`days=1&limit=2&search=${SEARCH}`);
    expect(idsOf(page1.body)).toEqual([rowId("newest"), rowId("middle")]);

    await db.insert(messageSend).values(ARRIVAL).onConflictDoNothing();
    vi.setSystemTime(new Date(T0 + 5 * MINUTE_MS));

    const page2 = await callList(
      `days=1&limit=2&search=${SEARCH}&cursor=${encodeURIComponent(page1.body.nextCursor)}`
    );

    // The new row is newer than everything page 1 showed. It belongs to the
    // next page-1 read, not to the middle of this walk.
    expect(idsOf(page2.body)).not.toContain(rowId("arrival"));
    expect(idsOf(page2.body)).toEqual([rowId("boundary")]);
  });

  it("walks every seeded row exactly once across a moving clock", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(T0));

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const { response, body } = await callList(
        `days=1&limit=1&search=${SEARCH}${
          cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
        }`
      );
      expect(response.status).toBe(200);
      seen.push(...idsOf(body));
      cursor = body.nextCursor;
      pages += 1;
      expect(pages).toBeLessThan(10);
      // A minute of real reading time between every page.
      vi.setSystemTime(new Date(T0 + pages * MINUTE_MS));
    } while (cursor);

    expect(seen).toEqual([rowId("newest"), rowId("middle"), rowId("boundary")]);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("reports page 1's window on page 2, not a recomputed one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(T0));

    const page1 = await callList(`days=1&limit=2&search=${SEARCH}`);
    vi.setSystemTime(new Date(T0 + 5 * MINUTE_MS));
    const page2 = await callList(
      `days=1&limit=2&search=${SEARCH}&cursor=${encodeURIComponent(page1.body.nextCursor)}`
    );

    expect(page2.body.window.from).toBe(page1.body.window.from);
    expect(page2.body.window.to).toBe(page1.body.window.to);
  });

  it("picks a fresh window when there is no cursor", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(T0));
    const first = await callList(`days=1&limit=2&search=${SEARCH}`);

    vi.setSystemTime(new Date(T0 + 5 * MINUTE_MS));
    const reload = await callList(`days=1&limit=2&search=${SEARCH}`);

    // Reloading the list is meant to see new mail, so page 1 must NOT be
    // pinned to anything.
    expect(new Date(reload.body.window.to).getTime()).toBeGreaterThan(
      new Date(first.body.window.to).getTime()
    );
  });
});
