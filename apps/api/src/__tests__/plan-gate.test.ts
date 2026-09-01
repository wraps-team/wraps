/**
 * Plan Gate Middleware Tests
 *
 * FEATURE_PLANS / PLAN_HIERARCHY assertions plus integration tests against
 * the real planGateMiddleware — the check that would have caught a paid
 * customer silently getting Free-tier behavior. See plans/208.
 */

import { Elysia } from "elysia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../middleware/auth";
import { FEATURE_PLANS, planGateMiddleware } from "../middleware/plan-gate";

describe("FEATURE_PLANS", () => {
  it("maps sso to business", () => {
    expect(FEATURE_PLANS.sso).toBe("business");
  });

  it("maps batch to pro", () => {
    expect(FEATURE_PLANS.batch).toBe("pro");
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

  it("a business org passes the sso gate", async () => {
    expect(await gateStatus("sso", "business")).toBe(200);
  });

  it("a pro org is refused the sso gate but passes batch", async () => {
    expect(await gateStatus("sso", "pro")).toBe(403);
    expect(await gateStatus("batch", "pro")).toBe(200);
  });

  it("a legacy growth org passes sso — it inherits the Business feature set", async () => {
    expect(await gateStatus("sso", "growth")).toBe(200);
  });

  it("a legacy starter org is refused sso but passes batch — it inherits the Pro feature set", async () => {
    expect(await gateStatus("sso", "starter")).toBe(403);
    expect(await gateStatus("batch", "starter")).toBe(200);
  });

  it("an unknown plan name falls back to Free and is refused a Pro+ gate", async () => {
    expect(await gateStatus("batch", "some-unknown-plan")).toBe(403);
  });

  it("every plan passes the free-tier workflows gate", async () => {
    expect(await gateStatus("workflows", null)).toBe(200);
  });
});
