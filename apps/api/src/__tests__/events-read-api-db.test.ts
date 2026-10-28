/**
 * GET /v1/events, /v1/events/analytics, /v1/events/names, /v1/events/:id
 * (routes/events-read.ts) on a real DB, plus a mount test with the existing
 * POST routes in routes/events.ts.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mocks).
 * The plan gate and event-limit in events.ts stay real. WRAPS_LICENSE_KEY is
 * stubbed empty per test so isSelfHosted() cannot turn them into no-ops.
 */

import { swagger } from "@elysiajs/swagger";
import { contactEvent, db, eventUsageMonthly, member, user } from "@wraps/db";
import { eq, inArray } from "drizzle-orm";
import { Elysia } from "elysia";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanupBaseOrg,
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";
import { eventsRoutes } from "../routes/events";
import { eventsReadRoutes } from "../routes/events-read";
import { createErrorHarness } from "./error-handler-harness";

// PREFIX is also a route-param fragment; 16 chars keeps event ids well under 36.
const PREFIX = `t2x-t23-${crypto.randomUUID().slice(0, 8)}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const PERMISSION_DENIED = "You don't have permission to perform this action";

const ids = {
  user: `${PREFIX}-user`,
  org: `${PREFIX}-org`,
  otherOrg: `${PREFIX}-org-2`,
  contact: `${PREFIX}-contact`,
  otherContact: `${PREFIX}-contact-2`,
  email: `${PREFIX}-c1@example.com`,
  otherEmail: `${PREFIX}-c2@example.com`,
  stranger: `${PREFIX}-stranger`,
  roUser: `${PREFIX}-ro-user`,
  roMember: `${PREFIX}-ro-member`,
  bUser: `${PREFIX}-b-user`,
  bMember: `${PREFIX}-b-member`,
};

// Org A events. Timestamps are noon UTC plus whole minutes so the newest-first
// order is unambiguous. The 40-day-old event is outside the 30-day period.
const A_EVENTS = {
  a1: { name: "signup", daysAgo: 0, minute: 0, data: { plan: "pro" } },
  a2: { name: "signup", daysAgo: 0, minute: 1, data: null },
  a3: { name: "purchase", daysAgo: 0, minute: 2, data: { sku: "ZZ-SKU-7" } },
  a4: { name: "purchase", daysAgo: 1, minute: 0, data: null },
  a5: { name: "purchase", daysAgo: 1, minute: 1, data: { sku: "YY-1" } },
  a6: { name: "signup", daysAgo: 40, minute: 0, data: {} },
} as const;
const B_EVENT_COUNT = 7;

const DAY_BASE = (() => {
  const now = new Date();
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    12
  );
})();

function at(daysAgo: number, minute: number): Date {
  return new Date(DAY_BASE - daysAgo * DAY_MS + minute * 60_000);
}

const todayStr = new Date().toISOString().slice(0, 10);
const yesterdayStr = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);

function aId(key: keyof typeof A_EVENTS) {
  return `${PREFIX}-ev-${key}`;
}
function bId(i: number) {
  return `${PREFIX}-ev-b${i}`;
}
const A_ALL_IDS = Object.keys(A_EVENTS).map((k) =>
  aId(k as keyof typeof A_EVENTS)
);
const B_ALL_IDS = Array.from({ length: B_EVENT_COUNT }, (_, i) => bId(i));

function usagePeriodKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function clearEvents() {
  await db
    .delete(contactEvent)
    .where(inArray(contactEvent.organizationId, [ids.org, ids.otherOrg]));
  await db
    .delete(eventUsageMonthly)
    .where(inArray(eventUsageMonthly.organizationId, [ids.org, ids.otherOrg]));
}

async function seedEvents() {
  await clearEvents();
  const rows: Array<typeof contactEvent.$inferInsert> = [];
  for (const [key, e] of Object.entries(A_EVENTS)) {
    rows.push({
      id: aId(key as keyof typeof A_EVENTS),
      organizationId: ids.org,
      contactId: ids.contact,
      eventName: e.name,
      eventData: e.data,
      createdAt: at(e.daysAgo, e.minute),
    });
  }
  for (let i = 0; i < B_EVENT_COUNT; i++) {
    rows.push({
      id: bId(i),
      organizationId: ids.otherOrg,
      contactId: ids.otherContact,
      eventName: "b-only-event",
      eventData: { note: "B-ONLY-PAYLOAD" },
      createdAt: at(0, 10 + i),
    });
  }
  await db.insert(contactEvent).values(rows);
}

type Auth = {
  apiKeyId: string | null;
  organizationId: string;
  userId: string | null;
  planId: string | null;
};

const OWNER_A: Auth = {
  apiKeyId: null,
  organizationId: ids.org,
  userId: ids.user,
  planId: "free",
};

function readApp(auth: Auth) {
  const { app } = createErrorHarness();
  return app.derive(() => ({ auth })).use(eventsReadRoutes);
}

function mountedApp(auth: Auth, order: "events-first" | "read-first") {
  const { app } = createErrorHarness();
  const base = app.derive(() => ({ auth }));
  return order === "events-first"
    ? base.use(eventsRoutes).use(eventsReadRoutes)
    : base.use(eventsReadRoutes).use(eventsRoutes);
}

function unauthedApp() {
  const { app } = createErrorHarness();
  return app.use(eventsReadRoutes);
}

type AnyApp = { handle: (req: Request) => Promise<Response> };

async function getJson<T>(app: AnyApp, path: string) {
  const res = await app.handle(new Request(`http://localhost${path}`));
  return { status: res.status, body: (await res.json()) as T };
}

async function postJson<T>(app: AnyApp, path: string, body: unknown) {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, body: (await res.json()) as T };
}

type ListBody = {
  events: Array<{
    id: string;
    eventName: string;
    eventData: Record<string, unknown> | null;
    createdAt: string;
    contactId: string;
    contactEmail: string | null;
    contactFirstName: string | null;
    contactLastName: string | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
};
type AnalyticsBody = {
  totalEvents: number;
  eventsThisPeriod: number;
  activeContacts: number;
  avgEventsPerContact: number;
  dailyEvents: Array<{ date: string; count: number }>;
  topEventNames: Array<{ name: string; count: number }>;
};
type NamesBody = { eventNames: string[] };
type ErrorBody = { error: string };

beforeAll(async () => {
  await seedBaseOrg(PREFIX);
  const now = new Date();
  await db
    .insert(user)
    .values({
      id: ids.roUser,
      email: `${PREFIX}-ro@example.com`,
      name: "Read Only Member",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      image: null,
    } as typeof user.$inferInsert)
    .onConflictDoNothing();
  await db
    .insert(member)
    .values({
      id: ids.roMember,
      organizationId: ids.org,
      userId: ids.roUser,
      role: "read-only",
      createdAt: now,
    } as typeof member.$inferInsert)
    .onConflictDoNothing();
  // Owner of org B only, so B-side reads pass the permission gate for B.
  await db
    .insert(user)
    .values({
      id: ids.bUser,
      email: `${PREFIX}-b@example.com`,
      name: "Org B Owner",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      image: null,
    } as typeof user.$inferInsert)
    .onConflictDoNothing();
  await db
    .insert(member)
    .values({
      id: ids.bMember,
      organizationId: ids.otherOrg,
      userId: ids.bUser,
      role: "owner",
      createdAt: now,
    } as typeof member.$inferInsert)
    .onConflictDoNothing();
});

beforeEach(async () => {
  await seedEvents();
  // Real gate: the plan gate and event limit in events.ts must evaluate plan
  // rank, not short-circuit as "licensed, everything unlocked".
  vi.stubEnv("WRAPS_LICENSE_KEY", "");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await clearEvents();
  await db
    .delete(member)
    .where(inArray(member.id, [ids.roMember, ids.bMember]));
  await db.delete(user).where(inArray(user.id, [ids.roUser, ids.bUser]));
  await cleanupBaseOrg(PREFIX);
});

// ─── Auth ────────────────────────────────────────────────────────────────────

describe("auth", () => {
  it("returns 401 with no auth header on every read route", async () => {
    const app = unauthedApp();
    for (const path of [
      "/v1/events",
      "/v1/events/analytics",
      "/v1/events/names",
      `/v1/events/${aId("a1")}`,
    ]) {
      const { status, body } = await getJson<ErrorBody>(app, path);
      expect(status).toBe(401);
      expect(body.error).toBe("Unauthorized");
    }
  });
});

// ─── Success paths (org A, pinned values) ────────────────────────────────────

describe("GET /v1/events (list)", () => {
  it("returns all 6 of org A's events newest first with the pinned envelope", async () => {
    const { status, body } = await getJson<ListBody>(
      readApp(OWNER_A),
      "/v1/events"
    );
    expect(status).toBe(200);
    expect(body.total).toBe(6);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(50);
    expect(body.events.map((e) => e.id)).toEqual([
      aId("a3"),
      aId("a2"),
      aId("a1"),
      aId("a5"),
      aId("a4"),
      aId("a6"),
    ]);
    const a3 = body.events[0];
    expect(a3.eventName).toBe("purchase");
    expect(a3.eventData).toEqual({ sku: "ZZ-SKU-7" });
    expect(a3.contactId).toBe(ids.contact);
    expect(a3.contactEmail).toBe(ids.email);
    expect(a3.contactFirstName).toBe("Alice");
    expect(a3.createdAt).toBe(at(0, 2).toISOString());
    expect(body.events[1].eventData).toBeNull();
  });

  it("pages with page and pageSize, pinned to the second page's ids", async () => {
    const { status, body } = await getJson<ListBody>(
      readApp(OWNER_A),
      "/v1/events?page=2&pageSize=3"
    );
    expect(status).toBe(200);
    expect(body.total).toBe(6);
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(3);
    expect(body.events.map((e) => e.id)).toEqual([
      aId("a5"),
      aId("a4"),
      aId("a6"),
    ]);
  });

  it("filters by eventName", async () => {
    const { body } = await getJson<ListBody>(
      readApp(OWNER_A),
      "/v1/events?eventName=purchase"
    );
    expect(body.total).toBe(3);
    expect(body.events.map((e) => e.id).sort()).toEqual(
      [aId("a3"), aId("a4"), aId("a5")].sort()
    );
  });

  it("filters by search over event data", async () => {
    const { body } = await getJson<ListBody>(
      readApp(OWNER_A),
      "/v1/events?search=ZZ-SKU"
    );
    expect(body.total).toBe(1);
    expect(body.events.map((e) => e.id)).toEqual([aId("a3")]);
  });

  it("filters by contactEmail", async () => {
    const { body } = await getJson<ListBody>(
      readApp(OWNER_A),
      `/v1/events?contactEmail=${encodeURIComponent(ids.email)}`
    );
    expect(body.total).toBe(6);
  });

  it("filters by dateFrom and dateTo with pinned counts", async () => {
    const from = encodeURIComponent(at(1, 0).toISOString());
    const fromBody = await getJson<ListBody>(
      readApp(OWNER_A),
      `/v1/events?dateFrom=${from}`
    );
    // a1..a5 (today and yesterday from 12:00); a6 is 40 days old.
    expect(fromBody.body.total).toBe(5);

    const to = encodeURIComponent(at(1, 1).toISOString());
    const toBody = await getJson<ListBody>(
      readApp(OWNER_A),
      `/v1/events?dateTo=${to}`
    );
    // a4, a5 (yesterday) and a6 (40 days ago).
    expect(toBody.body.total).toBe(3);
  });
});

describe("GET /v1/events/analytics", () => {
  it("pins org A's totals, period count, active contacts and top names (30 days)", async () => {
    const { status, body } = await getJson<AnalyticsBody>(
      readApp(OWNER_A),
      "/v1/events/analytics"
    );
    expect(status).toBe(200);
    expect(body.totalEvents).toBe(6);
    expect(body.eventsThisPeriod).toBe(5);
    expect(body.activeContacts).toBe(1);
    expect(body.avgEventsPerContact).toBe(5);
    expect(body.topEventNames).toEqual([
      { name: "purchase", count: 3 },
      { name: "signup", count: 2 },
    ]);
    expect(body.dailyEvents).toHaveLength(31);
    expect(body.dailyEvents.reduce((s, d) => s + d.count, 0)).toBe(5);
    expect(body.dailyEvents.at(-2)).toEqual({ date: yesterdayStr, count: 2 });
    expect(body.dailyEvents.at(-1)).toEqual({ date: todayStr, count: 3 });
  });

  it("uses a 7-day window when days=7", async () => {
    const { body } = await getJson<AnalyticsBody>(
      readApp(OWNER_A),
      "/v1/events/analytics?days=7"
    );
    expect(body.dailyEvents).toHaveLength(8);
    expect(body.eventsThisPeriod).toBe(5);
    expect(body.totalEvents).toBe(6);
  });

  it("falls back to UTC for an unknown timezone and for an injection attempt", async () => {
    const unknown = await getJson<AnalyticsBody>(
      readApp(OWNER_A),
      "/v1/events/analytics?timezone=Not/AZone"
    );
    expect(unknown.status).toBe(200);
    expect(unknown.body.eventsThisPeriod).toBe(5);
    expect(unknown.body.dailyEvents.at(-1)).toEqual({
      date: todayStr,
      count: 3,
    });

    const injected = await getJson<AnalyticsBody>(
      readApp(OWNER_A),
      `/v1/events/analytics?timezone=${encodeURIComponent("UTC';--")}`
    );
    expect(injected.status).toBe(200);
    expect(injected.body.totalEvents).toBe(6);
    expect(injected.body.eventsThisPeriod).toBe(5);
    expect(injected.body.topEventNames).toEqual([
      { name: "purchase", count: 3 },
      { name: "signup", count: 2 },
    ]);
  });
});

describe("GET /v1/events/names", () => {
  it("returns exactly org A's distinct names, sorted", async () => {
    const { status, body } = await getJson<NamesBody>(
      readApp(OWNER_A),
      "/v1/events/names"
    );
    expect(status).toBe(200);
    expect(body).toEqual({ eventNames: ["purchase", "signup"] });
  });
});

describe("GET /v1/events/:id", () => {
  it("returns one of org A's events by id", async () => {
    const { status, body } = await getJson<ListBody["events"][number]>(
      readApp(OWNER_A),
      `/v1/events/${aId("a3")}`
    );
    expect(status).toBe(200);
    expect(body.id).toBe(aId("a3"));
    expect(body.eventName).toBe("purchase");
    expect(body.contactEmail).toBe(ids.email);
  });

  it("returns 404 'Event not found' for an id that does not exist", async () => {
    const { status, body } = await getJson<ErrorBody>(
      readApp(OWNER_A),
      `/v1/events/${PREFIX}-ev-missing`
    );
    expect(status).toBe(404);
    expect(body.error).toBe("Event not found");
  });
});

// ─── Input validation (400 with the text named) ──────────────────────────────

describe("bad input", () => {
  const cases: Array<[string, string, string]> = [
    [
      "/v1/events?page=0",
      "page",
      "page must be an integer between 1 and 1000000",
    ],
    [
      "/v1/events?pageSize=101",
      "pageSize",
      "pageSize must be an integer between 1 and 100",
    ],
    [
      "/v1/events?pageSize=abc",
      "pageSize",
      "pageSize must be an integer between 1 and 100",
    ],
    [
      "/v1/events?dateFrom=not-a-date",
      "dateFrom",
      "dateFrom must be an ISO 8601 date-time, for example 2026-01-31T00:00:00Z",
    ],
    [
      `/v1/events?search=${"x".repeat(256)}`,
      "search",
      "search must be at most 255 characters",
    ],
    ["/v1/events/analytics?days=14", "days", "days must be 7 or 30"],
  ];

  for (const [path, , message] of cases) {
    it(`400 with "${message.slice(0, 40)}..." for ${path.slice(0, 40)}`, async () => {
      const { status, body } = await getJson<ErrorBody>(readApp(OWNER_A), path);
      expect(status).toBe(400);
      expect(body.error).toBe(message);
    });
  }

  it("422 'Validation failed' for an over-long timezone (schema maxLength)", async () => {
    const { status, body } = await getJson<ErrorBody>(
      readApp(OWNER_A),
      `/v1/events/analytics?timezone=${"A".repeat(65)}`
    );
    expect(status).toBe(422);
    expect(body.error).toBe("Validation failed");
  });
});

// ─── Org isolation (read-only: no write assertions) ──────────────────────────

describe("org isolation", () => {
  const readerB = () =>
    readApp({
      apiKeyId: null,
      organizationId: ids.otherOrg,
      userId: ids.bUser,
      planId: "free",
    });

  it("org A's list holds only A's ids; org B's events never appear", async () => {
    const { body } = await getJson<ListBody>(
      readApp(OWNER_A),
      "/v1/events?pageSize=100"
    );
    expect(body.total).toBe(6);
    expect(body.events.map((e) => e.id).sort()).toEqual([...A_ALL_IDS].sort());
    for (const id of B_ALL_IDS) {
      expect(body.events.map((e) => e.id)).not.toContain(id);
    }
  });

  it("org B's list holds only B's ids (7 of them)", async () => {
    const { body } = await getJson<ListBody>(
      readerB(),
      "/v1/events?pageSize=100"
    );
    expect(body.total).toBe(B_EVENT_COUNT);
    expect(body.events.map((e) => e.id).sort()).toEqual([...B_ALL_IDS].sort());
  });

  it("A cannot filter into B's events by B's name, payload or contact email", async () => {
    const byName = await getJson<ListBody>(
      readApp(OWNER_A),
      "/v1/events?eventName=b-only-event"
    );
    expect(byName.body.total).toBe(0);
    const byPayload = await getJson<ListBody>(
      readApp(OWNER_A),
      "/v1/events?search=B-ONLY-PAYLOAD"
    );
    expect(byPayload.body.total).toBe(0);
    const byEmail = await getJson<ListBody>(
      readApp(OWNER_A),
      `/v1/events?contactEmail=${encodeURIComponent(`${PREFIX}-c2@example.com`)}`
    );
    expect(byEmail.body.total).toBe(0);
  });

  it("A's analytics count only A (6 total); B's count only B (7 total)", async () => {
    const a = await getJson<AnalyticsBody>(
      readApp(OWNER_A),
      "/v1/events/analytics"
    );
    expect(a.body.totalEvents).toBe(6);
    expect(a.body.eventsThisPeriod).toBe(5);
    expect(a.body.topEventNames.map((n) => n.name)).not.toContain(
      "b-only-event"
    );

    const b = await getJson<AnalyticsBody>(readerB(), "/v1/events/analytics");
    expect(b.body.totalEvents).toBe(B_EVENT_COUNT);
    expect(b.body.eventsThisPeriod).toBe(B_EVENT_COUNT);
    expect(b.body.topEventNames).toEqual([{ name: "b-only-event", count: 7 }]);
  });

  it("A's names exclude B's name; B's names are only B's", async () => {
    const a = await getJson<NamesBody>(readApp(OWNER_A), "/v1/events/names");
    expect(a.body.eventNames).toEqual(["purchase", "signup"]);
    const b = await getJson<NamesBody>(readerB(), "/v1/events/names");
    expect(b.body.eventNames).toEqual(["b-only-event"]);
  });

  it("GET by id of a B event returns 404 for A, and 200 for B", async () => {
    const asA = await getJson<ErrorBody>(
      readApp(OWNER_A),
      `/v1/events/${bId(0)}`
    );
    expect(asA.status).toBe(404);
    expect(asA.body.error).toBe("Event not found");

    const asB = await getJson<ListBody["events"][number]>(
      readerB(),
      `/v1/events/${bId(0)}`
    );
    expect(asB.status).toBe(200);
    expect(asB.body.id).toBe(bId(0));
  });
});

// ─── Permissions ─────────────────────────────────────────────────────────────

const READ_PATHS = [
  "/v1/events",
  "/v1/events/analytics",
  "/v1/events/names",
  `/v1/events/${aId("a1")}`,
];

describe("permissions", () => {
  it("a user with no membership in org A gets 403 on every read route", async () => {
    const app = readApp({ ...OWNER_A, userId: ids.stranger });
    for (const path of READ_PATHS) {
      const { status, body } = await getJson<ErrorBody>(app, path);
      expect(status).toBe(403);
      expect(body.error).toBe(PERMISSION_DENIED);
    }
  });

  it("an auth context with no user (userId null) gets 403 on every read route", async () => {
    const app = readApp({
      ...OWNER_A,
      apiKeyId: "key-without-user",
      userId: null,
    });
    for (const path of READ_PATHS) {
      const { status, body } = await getJson<ErrorBody>(app, path);
      expect(status).toBe(403);
      expect(body.error).toBe(PERMISSION_DENIED);
    }
  });

  it("a read-only member gets 200 on every read route (read is the gate, not write)", async () => {
    const app = readApp({ ...OWNER_A, userId: ids.roUser });
    const list = await getJson<ListBody>(app, "/v1/events");
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(6);
    const analytics = await getJson<AnalyticsBody>(app, "/v1/events/analytics");
    expect(analytics.status).toBe(200);
    const names = await getJson<NamesBody>(app, "/v1/events/names");
    expect(names.status).toBe(200);
    const one = await getJson<ListBody["events"][number]>(
      app,
      `/v1/events/${aId("a1")}`
    );
    expect(one.status).toBe(200);
  });
});

// ─── Mounted with the POST routes in events.ts ───────────────────────────────

describe("mounted together with events.ts (POST /v1/events/)", () => {
  // Mount order C1 will use: eventsRoutes first, then eventsReadRoutes.
  // The reverse order is also checked so the answer does not depend on it.
  it("GET /names resolves to the static handler in both mount orders", async () => {
    for (const order of ["events-first", "read-first"] as const) {
      const app = mountedApp(OWNER_A, order);
      const { status, body } = await getJson<NamesBody>(
        app,
        "/v1/events/names"
      );
      expect(status).toBe(200);
      expect(body.eventNames).toEqual(["purchase", "signup"]);
    }
  });

  it("GET /analytics resolves to the static handler, not /:id", async () => {
    const app = mountedApp(OWNER_A, "events-first");
    const { status, body } = await getJson<AnalyticsBody>(
      app,
      "/v1/events/analytics"
    );
    expect(status).toBe(200);
    expect(body.totalEvents).toBe(6);
  });

  it("GET /v1/events is a list and GET /v1/events/:id still resolves", async () => {
    const app = mountedApp(OWNER_A, "events-first");
    const list = await getJson<ListBody>(app, "/v1/events");
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(6);
    const one = await getJson<ListBody["events"][number]>(
      app,
      `/v1/events/${aId("a6")}`
    );
    expect(one.status).toBe(200);
    expect(one.body.eventName).toBe("signup");
  });

  it("with org A over its free event allowance, POST gets 429 and GETs stay 200 and unmetered", async () => {
    // free limit 5000, grace to 5500. Seed 5600 so the POST is refused.
    await db.insert(eventUsageMonthly).values({
      organizationId: ids.org,
      periodKey: usagePeriodKey(),
      eventCount: 5600,
      updatedAt: new Date(),
    });
    const app = mountedApp(OWNER_A, "events-first");

    const post = await postJson<{ error: string }>(app, "/v1/events/", {
      name: "over-limit-event",
      contactId: ids.contact,
      properties: {},
    });
    expect(post.status).toBe(429);
    expect(post.body.error).toBe("event_limit_exceeded");

    for (const path of [
      "/v1/events",
      "/v1/events/analytics",
      "/v1/events/names",
      `/v1/events/${aId("a1")}`,
    ]) {
      const res = await getJson<unknown>(app, path);
      expect(res.status).toBe(200);
    }

    const [usage] = await db
      .select({ eventCount: eventUsageMonthly.eventCount })
      .from(eventUsageMonthly)
      .where(eq(eventUsageMonthly.organizationId, ids.org));
    expect(usage.eventCount).toBe(5600);
  });

  it("under the limit, POST stores an event that GET list shows, and GETs do not increment usage", async () => {
    const app = mountedApp(OWNER_A, "events-first");

    const post = await postJson<{ success: boolean }>(app, "/v1/events/", {
      name: "post-created-event",
      contactId: ids.contact,
      properties: { source: "events-read-test" },
    });
    expect(post.status).toBe(200);
    expect(post.body.success).toBe(true);

    const [afterPost] = await db
      .select({ eventCount: eventUsageMonthly.eventCount })
      .from(eventUsageMonthly)
      .where(eq(eventUsageMonthly.organizationId, ids.org));
    expect(afterPost.eventCount).toBe(1);

    const list = await getJson<ListBody>(
      app,
      "/v1/events?eventName=post-created-event"
    );
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.events[0].contactId).toBe(ids.contact);
    expect(list.body.events[0].eventData).toEqual({
      source: "events-read-test",
    });

    await getJson<unknown>(app, "/v1/events");
    await getJson<unknown>(app, "/v1/events/analytics");
    await getJson<unknown>(app, "/v1/events/names");

    const [afterReads] = await db
      .select({ eventCount: eventUsageMonthly.eventCount })
      .from(eventUsageMonthly)
      .where(eq(eventUsageMonthly.organizationId, ids.org));
    expect(afterReads.eventCount).toBe(1);
  });
});

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

describe("OpenAPI", () => {
  it("every read route appears in the spec with its method", async () => {
    const app = new Elysia()
      .use(
        swagger({
          path: "/swagger",
          documentation: {},
          exclude: ["/swagger", "/swagger/json"],
        })
      )
      .use(eventsReadRoutes);
    const res = await app.handle(new Request("http://localhost/swagger/json"));
    expect(res.status).toBe(200);
    const spec = (await res.json()) as {
      paths: Record<
        string,
        Record<string, { responses: Record<string, unknown> }>
      >;
    };

    const eventPaths = Object.keys(spec.paths).filter((p) =>
      p.startsWith("/v1/events")
    );
    // The list route is keyed with a trailing slash, as the existing POST is.
    // Requests to /v1/events without the slash also resolve (see list tests).
    expect(eventPaths.sort()).toEqual([
      "/v1/events/",
      "/v1/events/analytics",
      "/v1/events/names",
      "/v1/events/{id}",
    ]);
    expect(spec.paths["/v1/events/analytics"].get).toBeDefined();
    expect(spec.paths["/v1/events/names"].get).toBeDefined();
    expect(spec.paths["/v1/events/{id}"].get.responses["404"]).toBeDefined();
    expect(
      spec.paths["/v1/events/analytics"].get.responses["400"]
    ).toBeDefined();
  });
});
