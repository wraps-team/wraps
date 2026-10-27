/**
 * Plan Gate Middleware Tests
 *
 * FEATURE_PLANS / PLAN_HIERARCHY assertions plus integration tests against
 * the real planGateMiddleware — the check that would have caught a paid
 * customer silently getting Free-tier behavior. See plans/208.
 */

import { Elysia } from "elysia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkBroadcastEntitlements } from "../lib/plan-features";
import type { AuthContext } from "../middleware/auth";
import { FEATURE_PLANS, planGateMiddleware } from "../middleware/plan-gate";

describe("FEATURE_PLANS", () => {
  it("maps sso to business", () => {
    expect(FEATURE_PLANS.sso).toBe("business");
  });

  it("maps batch (broadcasts to all contacts) to free", () => {
    expect(FEATURE_PLANS.batch).toBe("free");
  });

  it("maps topics and scheduling to pro, segments to business", () => {
    expect(FEATURE_PLANS.topics).toBe("pro");
    expect(FEATURE_PLANS.campaigns).toBe("pro");
    expect(FEATURE_PLANS.segments).toBe("business");
  });
});

describe("checkBroadcastEntitlements", () => {
  beforeEach(() => vi.stubEnv("WRAPS_LICENSE_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  const ok = (
    planId: string | null,
    audienceType: "all" | "topic" | "segment" | undefined,
    scheduled: boolean
  ) => checkBroadcastEntitlements(planId, { audienceType, scheduled }).ok;

  it("lets every plan send to all contacts, immediately", () => {
    for (const plan of [
      "free",
      "pro",
      "business",
      "starter",
      "growth",
      "scale",
    ]) {
      expect(ok(plan, "all", false)).toBe(true);
      expect(ok(plan, undefined, false)).toBe(true);
    }
  });

  it("requires pro for topics and scheduling, business for segments", () => {
    expect(ok("free", "topic", false)).toBe(false);
    expect(ok("pro", "topic", false)).toBe(true);
    expect(ok("free", "all", true)).toBe(false);
    expect(ok("pro", "all", true)).toBe(true);
    expect(ok("pro", "segment", false)).toBe(false);
    expect(ok("business", "segment", false)).toBe(true);
  });

  it("applies every requirement of a combined request", () => {
    expect(ok("pro", "segment", true)).toBe(false);
    expect(ok("business", "segment", true)).toBe(true);
    expect(ok("free", "topic", true)).toBe(false);
  });

  it("ranks legacy plans with their successors (starter=pro, growth/scale=business)", () => {
    expect(ok("starter", "topic", true)).toBe(true);
    expect(ok("starter", "segment", false)).toBe(false);
    expect(ok("growth", "segment", true)).toBe(true);
    expect(ok("scale", "segment", true)).toBe(true);
  });

  it("denies unknown or missing plans anything beyond all-contacts", () => {
    expect(ok(null, "all", false)).toBe(true);
    expect(ok("constructor", "topic", false)).toBe(false);
    expect(ok(null, "segment", false)).toBe(false);
  });

  it("names the first unmet feature and the plan that unlocks it", () => {
    const scheduled = checkBroadcastEntitlements("free", {
      audienceType: "all",
      scheduled: true,
    });
    expect(scheduled.ok).toBe(false);
    if (!scheduled.ok) {
      expect(scheduled.feature).toBe("campaigns");
      expect(scheduled.requiredPlan).toBe("pro");
      expect(scheduled.message).toMatch(/scheduling/i);
    }
    const seg = checkBroadcastEntitlements("pro", {
      audienceType: "segment",
      scheduled: false,
    });
    expect(seg.ok).toBe(false);
    if (!seg.ok) {
      expect(seg.feature).toBe("segments");
      expect(seg.requiredPlan).toBe("business");
      expect(seg.message).toMatch(/business/i);
    }
    const both = checkBroadcastEntitlements("free", {
      audienceType: "segment",
      scheduled: true,
    });
    expect(both.ok).toBe(false);
    if (!both.ok) {
      expect(both.feature).toBe("segments");
    }
  });
});

function authFor(planId: string | null): AuthContext {
  return {
    apiKeyId: null,
    organizationId: "plan-gate-test-org",
    userId: "plan-gate-test-user",
    planId,
  };
}

function createTestApp(
  feature: keyof typeof FEATURE_PLANS,
  planId: string | null
) {
  return new Elysia()
    .derive(() => ({ auth: authFor(planId) }))
    .use(planGateMiddleware(feature))
    .get("/", () => "ok");
}

async function gateStatus(
  feature: keyof typeof FEATURE_PLANS,
  planId: string | null
): Promise<number> {
  const app = createTestApp(feature, planId);
  const res = await app.handle(new Request("http://localhost/"));
  return res.status;
}

describe("planGateMiddleware (real middleware, no DB)", () => {
  // WRAPS_LICENSE_KEY in the shell env makes isSelfHosted() return true,
  // bypassing gating entirely. Stub it to empty so the gate actually runs.
  beforeEach(() => vi.stubEnv("WRAPS_LICENSE_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("a free org passes the batch gate: broadcasts to all contacts are open", async () => {
    expect(await gateStatus("batch", "free")).toBe(200);
  });

  it("a pro org is refused the segments gate; a business org passes it", async () => {
    expect(await gateStatus("segments", "pro")).toBe(403);
    expect(await gateStatus("segments", "business")).toBe(200);
  });

  it("a business org passes the sso gate", async () => {
    expect(await gateStatus("sso", "business")).toBe(200);
  });

  it("a pro org is refused the sso gate but passes topics", async () => {
    expect(await gateStatus("sso", "pro")).toBe(403);
    expect(await gateStatus("topics", "pro")).toBe(200);
  });

  it("a legacy growth org passes sso — it inherits the Business feature set", async () => {
    expect(await gateStatus("sso", "growth")).toBe(200);
  });

  // Regression guard: `PLAN_HIERARCHY[planId as PlanId] ?? 0` walks the
  // prototype chain. PLAN_HIERARCHY["constructor"] returns a Function rather
  // than undefined, so `?? 0` never fires and `Function < requiredLevel`
  // evaluates false — the gate GRANTED access on every feature. Same class as
  // 317855ad, which fixed the apps/web side; this is the enforcement side.
  it("rejects Object.prototype keys instead of granting every feature", async () => {
    for (const key of ["constructor", "__proto__", "toString", "valueOf"]) {
      expect(await gateStatus("sso", key)).toBe(403);
      expect(await gateStatus("topics", key)).toBe(403);
    }
  });

  it("a null plan is denied every paid feature", async () => {
    expect(await gateStatus("sso", null)).toBe(403);
    expect(await gateStatus("topics", null)).toBe(403);
  });

  it("401s when no auth context reached the gate", async () => {
    // The gate is mounted by createAuthenticatedRoutes, so in production auth
    // is always present — but the guard is the difference between a clean 401
    // and dereferencing null. Nothing else exercised this branch.
    const app = new Elysia()
      .use(planGateMiddleware("sso"))
      .get("/", () => "ok");

    const res = await app.handle(new Request("http://localhost/"));

    expect(res.status).toBe(401);
  });

  it("free-tier features stay reachable for an unknown plan", async () => {
    // workflows is the one gate at level 0 — a bogus plan must still clear it,
    // otherwise the narrowing would lock legitimate free users out.
    expect(await gateStatus("workflows", "constructor")).toBe(200);
    expect(await gateStatus("workflows", null)).toBe(200);
  });

  it("a legacy starter org is refused sso but passes topics — it inherits the Pro feature set", async () => {
    expect(await gateStatus("sso", "starter")).toBe(403);
    expect(await gateStatus("topics", "starter")).toBe(200);
  });

  it("an unknown plan name falls back to Free and is refused a Pro+ gate", async () => {
    expect(await gateStatus("topics", "some-unknown-plan")).toBe(403);
  });

  it("every plan passes the free-tier workflows gate", async () => {
    expect(await gateStatus("workflows", null)).toBe(200);
  });
});
