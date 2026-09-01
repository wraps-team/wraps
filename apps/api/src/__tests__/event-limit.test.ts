/**
 * Event Limit Middleware — Integration Tests
 *
 * Tests real enforcement behavior against a real DB.
 * eventLimitMiddleware is NOT mocked — this file exists specifically to
 * verify the blocking logic that all other event test files skip.
 */

import {
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
const FREE_GRACE = Math.floor(FREE_LIMIT * 1.25); // 6250

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

  // Volume is no longer capped on a paid plan — these cases were written to
  // guard the (now-removed) 429 block, so they run on a paid auth context to
  // keep exercising that behavior. A free-plan org never reaches the volume
  // logic at all — see "the free plan is gated" below.
  describe("volume is not capped on a paid plan", () => {
    it("allows the event and sets usage headers to unlimited (plans/208)", async () => {
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

    it("does not block a paid plan at the former grace limit", async () => {
      await seedUsage(FREE_GRACE); // 6250 — used to be the free-plan 429 threshold
      const res = await postEvent(createTestApp(starterAuth));
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Event-Exceeded")).toBeNull();
      expect(res.headers.get("Retry-After")).toBeNull();
    });

    it("does not block a paid plan well over the former limit (8259 scenario)", async () => {
      await seedUsage(8259);
      const res = await postEvent(createTestApp(starterAuth));
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Event-Limit")).toBe("-1");
      expect(res.headers.get("X-Event-Current")).toBe("8259");
      expect(res.headers.get("X-Event-Percent")).toBe("0");
      expect(res.headers.get("X-Event-Exceeded")).toBeNull();
      expect(res.headers.get("Retry-After")).toBeNull();
    });

    it("does not block starter plan at free-tier counts", async () => {
      await seedUsage(FREE_GRACE); // 6250 — would have blocked free but not starter
      const res = await postEvent(createTestApp(starterAuth));
      // 6250 is only 12.5% of starter's 50k limit — well under the former grace threshold
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Event-Limit")).toBe("-1");
    });
  });

  // The numeric limit no longer blocks anything, but the events feature itself
  // is pro+ (FEATURE_PLANS.events in plan-gate.ts — plans/208 renamed the
  // required plan from "starter" to "pro"). A free org is gated out
  // regardless of usage — this is what FSI's $19/mo actually pays for.
  describe("the free plan is gated", () => {
    it("returns 403 with zero seeded usage", async () => {
      const res = await postEvent(createTestApp(freeAuth));
      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toMatch(/requires pro plan/i);
    });

    it("returns 403 with usage well over the former limit (8259 scenario)", async () => {
      await seedUsage(8259);
      const res = await postEvent(createTestApp(freeAuth));
      // Gated on plan, not volume — same 403 whether usage is 0 or 8259.
      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toMatch(/requires pro plan/i);
    });
  });
});
