/**
 * Event Limit Middleware — Integration Tests
 *
 * Tests real enforcement behavior against a real DB.
 * eventLimitMiddleware is NOT mocked — this file exists specifically to
 * verify the blocking logic that all other event test files skip.
 */

import {
  and,
  contact,
  db,
  eq,
  eventUsageMonthly,
  member,
  organization,
  user,
} from "@wraps/db";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("../services/workflow-queue", () => ({
  enqueueWorkflowStep: vi.fn().mockResolvedValue(undefined),
  enqueueWorkflowStepBatch: vi.fn().mockResolvedValue(undefined),
  deleteScheduledStep: vi.fn().mockResolvedValue(undefined),
}));

import { Elysia } from "elysia";
import type { AuthContext } from "../middleware/auth";
import { EVENT_GRACE_MULTIPLIER } from "../middleware/event-limit";
import { eventsRoutes } from "../routes/events";

const TEST_PREFIX = "event-limit-test";

const testUser = {
  id: `${TEST_PREFIX}-user-1`,
  email: `${TEST_PREFIX}@example.com`,
  name: "Event Limit Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${TEST_PREFIX}-org-1`,
  name: "Event Limit Test Org",
  slug: `${TEST_PREFIX}-org`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: `${TEST_PREFIX}-member-1`,
  organizationId: testOrg.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testContact = {
  id: `${TEST_PREFIX}-contact-1`,
  organizationId: testOrg.id,
  email: `${TEST_PREFIX}-c1@example.com`,
  emailHash: `${TEST_PREFIX}-hash-1`,
  firstName: "Limit",
  lastName: "Tester",
  emailStatus: "active" as const,
  status: "active" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// planId: null = free tier (no active subscription)
const freeAuth: AuthContext = {
  apiKeyId: null,
  organizationId: testOrg.id,
  userId: testUser.id,
  planId: null,
};

const starterAuth: AuthContext = { ...freeAuth, planId: "starter" };

const PERIOD_KEY = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
const FREE_LIMIT = 5000;
// Derived from the middleware's own multiplier, not a copy of it. These were
// hardcoded at 1.25 and silently kept asserting the old ceiling when the
// constant moved to 1.1 — the boundary cases still passed against the wrong
// number until the block/allow boundary itself shifted.
const FREE_GRACE = Math.floor(FREE_LIMIT * EVENT_GRACE_MULTIPLIER);

async function seedUsage(count: number) {
  await db
    .insert(eventUsageMonthly)
    .values({
      organizationId: testOrg.id,
      periodKey: PERIOD_KEY,
      eventCount: count,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [eventUsageMonthly.organizationId, eventUsageMonthly.periodKey],
      set: { eventCount: count, updatedAt: new Date() },
    });
}

async function readUsage(): Promise<number> {
  const [row] = await db
    .select({ eventCount: eventUsageMonthly.eventCount })
    .from(eventUsageMonthly)
    .where(
      and(
        eq(eventUsageMonthly.organizationId, testOrg.id),
        eq(eventUsageMonthly.periodKey, PERIOD_KEY)
      )
    )
    .limit(1);
  return row?.eventCount ?? 0;
}

function createTestApp(auth = freeAuth) {
  return new Elysia().derive(() => ({ auth })).use(eventsRoutes);
}

function postEvent(app: ReturnType<typeof createTestApp>) {
  return app.handle(
    new Request("http://localhost/v1/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test.event", contactId: testContact.id }),
    })
  );
}

function postBatch(app: ReturnType<typeof createTestApp>, count: number) {
  return app.handle(
    new Request("http://localhost/v1/events/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: Array.from({ length: count }, (_, i) => ({
          name: `bulk.event.${i}`,
          contactId: testContact.id,
        })),
      }),
    })
  );
}

describe("event limit enforcement (real middleware, real DB)", () => {
  // WRAPS_LICENSE_KEY in the shell env makes isSelfHosted() return true, bypassing limit checks.
  // Stub it to empty so enforceEventLimit and planGateMiddleware actually run during these tests.
  beforeEach(() => vi.stubEnv("WRAPS_LICENSE_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  beforeAll(async () => {
    await db
      .insert(user)
      .values(testUser)
      .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
    await db
      .insert(organization)
      .values(testOrg)
      .onConflictDoUpdate({
        target: organization.id,
        set: { name: testOrg.name },
      });
    await db
      .insert(member)
      .values(testMember)
      .onConflictDoUpdate({
        target: member.id,
        set: { role: testMember.role },
      });
    await db
      .insert(contact)
      .values(testContact)
      .onConflictDoUpdate({
        target: contact.id,
        set: { updatedAt: new Date() },
      });
  });

  afterAll(async () => {
    // org cascade deletes: eventUsageMonthly, contact, member
    await db.delete(organization).where(eq(organization.id, testOrg.id));
    await db.delete(user).where(eq(user.id, testUser.id));
  });

  beforeEach(async () => {
    await db
      .delete(eventUsageMonthly)
      .where(eq(eventUsageMonthly.organizationId, testOrg.id));
  });

  // Paid plans are unlimited. The Wraps fee is flat, so a paid org that emits
  // ten million events pays the same $29 — metering it would be a billing
  // meter with nothing to bill.
  describe("volume is not capped on a paid plan", () => {
    it("allows the event and sets usage headers to unlimited", async () => {
      await seedUsage(2500);
      const res = await postEvent(createTestApp(starterAuth));
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Event-Limit")).toBe("-1");
      expect(res.headers.get("X-Event-Current")).toBe("2500");
      expect(res.headers.get("X-Event-Remaining")).toBe("-1");
      expect(res.headers.get("X-Event-Percent")).toBe("0");
    });

    it("allows the event with no prior usage (zero usage row)", async () => {
      const res = await postEvent(createTestApp(starterAuth));
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Event-Limit")).toBe("-1");
      expect(res.headers.get("X-Event-Current")).toBe("0");
    });

    it("does not block a paid plan at the free grace limit", async () => {
      await seedUsage(FREE_GRACE);
      const res = await postEvent(createTestApp(starterAuth));
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Event-Exceeded")).toBeNull();
      expect(res.headers.get("Retry-After")).toBeNull();
    });

    it("does not block a paid plan well over the free limit (8259 scenario)", async () => {
      await seedUsage(8259);
      const res = await postEvent(createTestApp(starterAuth));
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Event-Limit")).toBe("-1");
      expect(res.headers.get("X-Event-Current")).toBe("8259");
      expect(res.headers.get("X-Event-Percent")).toBe("0");
      expect(res.headers.get("X-Event-Exceeded")).toBeNull();
      expect(res.headers.get("Retry-After")).toBeNull();
    });
  });

  // Free is metered, not gated. planGateMiddleware lets every plan through
  // (FEATURE_PLANS.events is "free"); the 5,000/month allowance is what
  // prompts the upgrade, and it is the only trigger with an observed organic
  // conversion behind it.
  describe("a batch cannot vault over the grace ceiling", () => {
    // These cases seed high usage and the third one actually ingests, so reset
    // the counter afterwards. Later cases in this file ("ingests with no prior
    // usage") assume a clean counter rather than seeding one themselves.
    afterEach(async () => {
      await seedUsage(0);
    });

    // The gate runs before the handler and the counter increments after it, so
    // checking currentUsage alone let one batch land entirely on top of the
    // ceiling. At a 5,000 allowance and 1.1 grace the wall is 5,500; a
    // 1,000-event batch posted at 5,499 used to settle at 6,499. The gate now
    // charges the request its real cost up front.
    it("refuses a batch that would cross the ceiling, even from under it", async () => {
      await seedUsage(5499);

      const res = await postBatch(createTestApp(), 1000);
      const body = (await res.json()) as {
        error?: string;
        requested?: number;
      };

      expect(res.status).toBe(429);
      expect(body.error).toBe("event_limit_exceeded");
      expect(body.requested).toBe(1000);
    });

    it("leaves the counter untouched when it refuses the batch", async () => {
      // The real damage in the old behaviour was the stored rows, not the
      // status code — assert the overshoot never lands.
      await seedUsage(5499);

      await postBatch(createTestApp(), 1000);

      expect(await readUsage()).toBe(5499);
    });

    it("still accepts a batch that fits inside the remaining headroom", async () => {
      // Guards against over-correcting into "block every batch near the cap".
      await seedUsage(5000);

      const res = await postBatch(createTestApp(), 100);

      expect(res.status).not.toBe(429);
    });
  });

  describe("the meter fails open when its own lookup breaks", () => {
    it("ingests the event when the usage query throws", async () => {
      // Matches the posture of the rate limiter and the subscription gate: a
      // DB blip must not become an outage of event ingestion. The counter
      // lives in Postgres, so an error here says nothing about whether the
      // org is actually over its allowance — refusing on no evidence would
      // drop a paying customer's events. This catch (event-limit.ts:181) was
      // the last uncovered line in the newly-live enforcement path.
      const spy = vi.spyOn(db, "select").mockImplementationOnce(() => {
        throw new Error("connection terminated unexpectedly");
      });

      try {
        const res = await postEvent(createTestApp());
        expect(res.status).not.toBe(429);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("the free plan is metered, not gated", () => {
    it("ingests below the allowance and reports the real headers", async () => {
      await seedUsage(2500);
      const res = await postEvent(createTestApp(freeAuth));
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Event-Limit")).toBe(String(FREE_LIMIT));
      expect(res.headers.get("X-Event-Current")).toBe("2500");
      expect(res.headers.get("X-Event-Remaining")).toBe("2500");
      expect(res.headers.get("X-Event-Percent")).toBe("50");
    });

    it("ingests with no prior usage", async () => {
      const res = await postEvent(createTestApp(freeAuth));
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Event-Limit")).toBe(String(FREE_LIMIT));
      expect(res.headers.get("X-Event-Remaining")).toBe(String(FREE_LIMIT));
    });

    // The whole point of the grace margin: hitting 100% warns, it does not
    // cut the org off mid-month.
    it("keeps ingesting at 100% of the allowance, inside the grace margin", async () => {
      await seedUsage(FREE_LIMIT);
      const res = await postEvent(createTestApp(freeAuth));
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Event-Remaining")).toBe("0");
      expect(res.headers.get("X-Event-Percent")).toBe("100");
      expect(res.headers.get("X-Event-Exceeded")).toBeNull();
    });

    it("keeps ingesting one event below the grace limit", async () => {
      await seedUsage(FREE_GRACE - 1);
      const res = await postEvent(createTestApp(freeAuth));
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Event-Exceeded")).toBeNull();
    });

    it("blocks with 429 at the grace limit", async () => {
      await seedUsage(FREE_GRACE);
      const res = await postEvent(createTestApp(freeAuth));
      expect(res.status).toBe(429);
      expect(res.headers.get("X-Event-Exceeded")).toBe("true");
      expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);

      const body = await res.json();
      expect(body.error).toBe("event_limit_exceeded");
      expect(body.limit).toBe(FREE_LIMIT);
      expect(body.current).toBe(FREE_GRACE);
      expect(body.upgradeUrl).toContain("billing");
      expect(Date.parse(body.resetsAt)).toBeGreaterThan(Date.now());
    });

    // Darren's real number: he hit the cap and upgraded a few days later.
    it("blocks well over the allowance (8259 scenario)", async () => {
      await seedUsage(8259);
      const res = await postEvent(createTestApp(freeAuth));
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.percentUsed).toBe(165);
    });

    // A 429 must be the meter talking, never the plan gate: events are a
    // feature every tier has.
    it("never returns 403 — events are not gated off Free", async () => {
      for (const usage of [0, FREE_LIMIT, FREE_GRACE, 8259]) {
        await db
          .delete(eventUsageMonthly)
          .where(eq(eventUsageMonthly.organizationId, testOrg.id));
        await seedUsage(usage);
        const res = await postEvent(createTestApp(freeAuth));
        expect(res.status).not.toBe(403);
      }
    });
  });
});
