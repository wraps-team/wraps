import { generateKeyPairSync, sign } from "node:crypto";
import {
  awsAccount,
  contact,
  db,
  member,
  organization,
  organizationExtension,
  subscription,
  user,
  workflow,
} from "@wraps/db";
import { eq } from "drizzle-orm";
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
import {
  getDisplayPlans,
  getNextPlan,
  getPaidPlans,
  getRequiredPlan,
  isPlanId,
  isTopPlan,
  PLANS,
  type PlanFeature,
  PUBLIC_PLAN_IDS,
  toPublicPlanId,
} from "../../plans";
import {
  checkAwsAccountLimit,
  checkContactLimit,
  checkFeatureAccess,
  checkTeamMemberLimit,
  checkWorkflowLimit,
  getLicensedPlan,
  getOrganizationPlan,
} from "../index";

const { privateKey: TEST_PRIV_PEM, publicKey: TEST_PUB_PEM } =
  generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  }) as { privateKey: string; publicKey: string };

function makeWebLicenseKey(tier: string, expires: string): string {
  const payload = `v1.${tier}.${expires}`;
  const sig = sign(null, Buffer.from(payload), TEST_PRIV_PEM).toString("hex");
  return `${payload}.${sig}`;
}

// Test data
const testOrgId = "plan-limits-test-org";
const testOrg = {
  id: testOrgId,
  name: "Plan Limits Test Org",
  slug: "plan-limits-test-org",
  createdAt: new Date(),
};

describe("Plan Limits", () => {
  beforeAll(async () => {
    // A real license key in the developer's environment would override every
    // plan lookup with the licensed tier — remove it so tests are hermetic.
    // License-override tests stub their own values via vi.stubEnv.
    delete process.env.WRAPS_LICENSE_KEY;
    delete process.env.WRAPS_LICENSE_PUBLIC_KEY_PEM;

    // Clean up any existing test data
    await db
      .delete(subscription)
      .where(eq(subscription.referenceId, testOrgId));
    await db
      .delete(organizationExtension)
      .where(eq(organizationExtension.organizationId, testOrgId));
    await db.delete(organization).where(eq(organization.id, testOrgId));

    // Create test organization
    await db.insert(organization).values(testOrg);

    // Create organization extension
    await db.insert(organizationExtension).values({
      organizationId: testOrgId,
      awsAccountCount: 0,
      memberCount: 1,
      onboardingCompleted: true,
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    // Clean up
    await db
      .delete(subscription)
      .where(eq(subscription.referenceId, testOrgId));
    await db.delete(contact).where(eq(contact.organizationId, testOrgId));
    await db
      .delete(organizationExtension)
      .where(eq(organizationExtension.organizationId, testOrgId));
    await db.delete(organization).where(eq(organization.id, testOrgId));
  });

  beforeEach(async () => {
    // Clean up subscriptions before each test
    await db
      .delete(subscription)
      .where(eq(subscription.referenceId, testOrgId));
  });

  describe("getOrganizationPlan", () => {
    it("should return free when no subscription exists", async () => {
      // With 2026 pricing model, orgs without subscription get free tier
      const plan = await getOrganizationPlan(testOrgId);
      expect(plan).toBe("free");
    });

    it("should return plan from active subscription", async () => {
      await db.insert(subscription).values({
        id: `sub_test_${Date.now()}`,
        plan: "growth",
        referenceId: testOrgId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const plan = await getOrganizationPlan(testOrgId);
      expect(plan).toBe("growth");
    });

    it("should return plan from trialing subscription", async () => {
      await db.insert(subscription).values({
        id: `sub_test_${Date.now()}`,
        plan: "scale",
        referenceId: testOrgId,
        status: "trialing",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const plan = await getOrganizationPlan(testOrgId);
      expect(plan).toBe("scale");
    });

    it("should return free for canceled subscription", async () => {
      await db.insert(subscription).values({
        id: `sub_test_${Date.now()}`,
        plan: "growth",
        referenceId: testOrgId,
        status: "canceled",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const plan = await getOrganizationPlan(testOrgId);
      expect(plan).toBe("free"); // Canceled subscriptions fall back to free tier
    });

    it("should return free for past_due subscription", async () => {
      await db.insert(subscription).values({
        id: `sub_test_${Date.now()}`,
        plan: "growth",
        referenceId: testOrgId,
        status: "past_due",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const plan = await getOrganizationPlan(testOrgId);
      expect(plan).toBe("free"); // Past due subscriptions fall back to free tier
    });

    describe("license key override", () => {
      afterEach(() => {
        vi.unstubAllEnvs();
      });

      it("returns licensed tier without querying DB when WRAPS_LICENSE_KEY is valid Ed25519 scale key", async () => {
        // Use an org ID that has no DB record — if DB is queried it would return "free"
        const nonExistentOrgId = "license-override-test-no-db-record";
        vi.stubEnv(
          "WRAPS_LICENSE_KEY",
          makeWebLicenseKey("scale", "2099-12-31")
        );
        vi.stubEnv("WRAPS_LICENSE_PUBLIC_KEY_PEM", TEST_PUB_PEM);

        const plan = await getOrganizationPlan(nonExistentOrgId);

        // Only possible if license key is applied — no DB record exists for this org
        expect(plan).toBe("scale");
      });

      it("falls back to Stripe plan when WRAPS_LICENSE_KEY signature is tampered", async () => {
        await db.insert(subscription).values({
          id: `sub_test_${Date.now()}`,
          plan: "growth",
          referenceId: testOrgId,
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const validKey = makeWebLicenseKey("scale", "2099-12-31");
        // Tamper the last 4 hex chars of the signature
        const tamperedKey = `${validKey.slice(0, -4)}0000`;
        vi.stubEnv("WRAPS_LICENSE_KEY", tamperedKey);
        vi.stubEnv("WRAPS_LICENSE_PUBLIC_KEY_PEM", TEST_PUB_PEM);

        const plan = await getOrganizationPlan(testOrgId);

        expect(plan).toBe("growth"); // Falls back to Stripe subscription
      });

      it("rejects license key signed with a different private key", async () => {
        const { publicKey: wrongPub } = generateKeyPairSync("ed25519", {
          publicKeyEncoding: { type: "spki", format: "pem" },
          privateKeyEncoding: { type: "pkcs8", format: "pem" },
        }) as { publicKey: string };
        vi.stubEnv(
          "WRAPS_LICENSE_KEY",
          makeWebLicenseKey("scale", "2099-12-31")
        );
        vi.stubEnv("WRAPS_LICENSE_PUBLIC_KEY_PEM", wrongPub);
        // Non-existent org — if verify() is skipped and tier extracted, plan would be "scale"
        const plan = await getOrganizationPlan(
          "license-wrong-key-no-db-record"
        );
        expect(plan).toBe("free"); // wrong pubkey → verify() fails → no override → no DB record → free
      });

      it("falls back to DB subscription when WRAPS_LICENSE_KEY is not set", async () => {
        await db.insert(subscription).values({
          id: `sub_test_${Date.now()}`,
          plan: "growth",
          referenceId: testOrgId,
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const plan = await getOrganizationPlan(testOrgId);

        expect(plan).toBe("growth"); // From DB, not license key
      });
    });
  });

  describe("checkContactLimit", () => {
    it("should return allowed for free plan (unlimited contacts)", async () => {
      // Free tier has unlimited contacts
      const result = await checkContactLimit(testOrgId);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(-1); // Unlimited
    });

    it("should return allowed for starter plan within limit", async () => {
      await db.insert(subscription).values({
        id: `sub_test_${Date.now()}`,
        plan: "starter",
        referenceId: testOrgId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await checkContactLimit(testOrgId);

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
      // Starter plan has unlimited contacts (-1) in the 2026 pricing model
      expect(result.limit).toBe(-1);
    });

    it("should return accurate count when contacts exist", async () => {
      // Insert 5 contacts for the test org
      const contacts = Array.from({ length: 5 }, (_, i) => ({
        organizationId: testOrgId,
        email: `count-test-${i}@example.com`,
      }));
      await db.insert(contact).values(contacts);

      try {
        const result = await checkContactLimit(testOrgId);
        expect(result.current).toBe(5);
      } finally {
        // Clean up contacts
        await db.delete(contact).where(eq(contact.organizationId, testOrgId));
      }
    });
  });

  describe("checkAwsAccountLimit", () => {
    it("should return allowed for free plan (no subscription) within limit", async () => {
      // Free tier allows 1 AWS account
      const result = await checkAwsAccountLimit(testOrgId);

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
      expect(result.limit).toBe(1); // Free plan has 1 AWS account
    });

    it("should return allowed for starter plan within limit", async () => {
      await db.insert(subscription).values({
        id: `sub_test_${Date.now()}`,
        plan: "starter",
        referenceId: testOrgId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await checkAwsAccountLimit(testOrgId);

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
      // Legacy Starter now carries Pro's limits (plans/208) — 3 AWS accounts
      expect(result.limit).toBe(3);
    });

    it("should return accurate count when AWS accounts exist", async () => {
      await db.insert(awsAccount).values({
        organizationId: testOrgId,
        name: "count-test-account",
        accountId: "123456789012",
        region: "us-east-1",
        roleArn: "arn:aws:iam::123456789012:role/test",
        externalId: `count-test-ext-${Date.now()}`,
      });

      try {
        const result = await checkAwsAccountLimit(testOrgId);
        expect(result.current).toBe(1);
      } finally {
        await db
          .delete(awsAccount)
          .where(eq(awsAccount.organizationId, testOrgId));
      }
    });
  });

  describe("checkWorkflowLimit", () => {
    it("should return accurate count when workflows exist", async () => {
      const workflows = Array.from({ length: 3 }, (_, i) => ({
        organizationId: testOrgId,
        name: `count-test-workflow-${i}`,
      }));
      await db.insert(workflow).values(workflows);

      try {
        const result = await checkWorkflowLimit(testOrgId);
        expect(result.current).toBe(3);
      } finally {
        await db.delete(workflow).where(eq(workflow.organizationId, testOrgId));
      }
    });
  });

  describe("checkTeamMemberLimit", () => {
    const testUserId = "plan-limits-test-user";

    it("should return accurate count when members exist", async () => {
      // Clean up any leftover test data
      await db.delete(member).where(eq(member.organizationId, testOrgId));
      await db.delete(user).where(eq(user.id, testUserId));

      // Create test user for FK constraint
      await db.insert(user).values({
        id: testUserId,
        name: "Test User",
        email: `plan-limits-test-${Date.now()}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(member).values({
        id: `plan-limits-member-${Date.now()}`,
        organizationId: testOrgId,
        userId: testUserId,
        role: "member",
        createdAt: new Date(),
      });

      try {
        const result = await checkTeamMemberLimit(testOrgId);
        expect(result.current).toBe(1);
      } finally {
        await db.delete(member).where(eq(member.organizationId, testOrgId));
        await db.delete(user).where(eq(user.id, testUserId));
      }
    });
  });

  describe("checkFeatureAccess", () => {
    it("should return not allowed for free plan accessing a Pro feature", async () => {
      // Free tier doesn't have topics - requires Pro plan. getRequiredPlan()
      // never names a legacy plan (plans/208 step 3), even though the
      // grandfathered "starter" plan also grants this feature.
      const result = await checkFeatureAccess(testOrgId, "topics");

      expect(result.allowed).toBe(false);
      expect(result.message).toContain("requires a Pro plan");
      expect(result.requiredPlan).toBe("pro");
    });

    it("should return allowed for legacy starter plan accessing a Pro feature", async () => {
      await db.insert(subscription).values({
        id: `sub_test_${Date.now()}`,
        plan: "starter",
        referenceId: testOrgId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await checkFeatureAccess(testOrgId, "topics");

      // Legacy Starter is preserved: it still has topics access. The
      // required-plan name is always the purchasable "pro", never "starter".
      expect(result.allowed).toBe(true);
      expect(result.requiredPlan).toBe("pro");
    });

    it("should return not allowed for legacy starter plan accessing a Business feature", async () => {
      await db.insert(subscription).values({
        id: `sub_test_${Date.now()}`,
        plan: "starter",
        referenceId: testOrgId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await checkFeatureAccess(testOrgId, "advancedSegments");

      expect(result.allowed).toBe(false);
      expect(result.requiredPlan).toBe("business");
    });

    it("should return allowed for starter plan accessing batch feature", async () => {
      await db.insert(subscription).values({
        id: `sub_test_${Date.now()}`,
        plan: "starter",
        referenceId: testOrgId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await checkFeatureAccess(testOrgId, "batch");

      expect(result.allowed).toBe(true);
    });

    it("should return allowed for starter plan accessing workflows", async () => {
      // Workflows are available for all tiers (free+) with different limits
      await db.insert(subscription).values({
        id: `sub_test_${Date.now()}`,
        plan: "starter",
        referenceId: testOrgId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await checkFeatureAccess(testOrgId, "workflows");

      expect(result.allowed).toBe(true);
      expect(result.requiredPlan).toBe("free"); // Workflows available on free tier
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PLAN CONFIGURATION (plans.ts) — pure, no DB required. See plans/208.
// ═══════════════════════════════════════════════════════════════════════════

describe("Plan configuration", () => {
  it("getDisplayPlans returns exactly the public plans, in ladder order", () => {
    expect(getDisplayPlans().map(({ id }) => id)).toEqual([
      "free",
      "pro",
      "business",
    ]);
  });

  it("getPaidPlans returns exactly the paid public plans", () => {
    expect(getPaidPlans().map(({ id }) => id)).toEqual(["pro", "business"]);
  });

  it("legacy plans are marked legacy and absent from the public plan lists", () => {
    const legacyIds = ["starter", "growth", "scale"] as const;
    for (const id of legacyIds) {
      expect(PLANS[id].legacy).toBe(true);
    }

    const displayIds = getDisplayPlans().map(({ id }) => id);
    const paidIds = getPaidPlans().map(({ id }) => id);
    for (const id of legacyIds) {
      expect(displayIds).not.toContain(id);
      expect(paidIds).not.toContain(id);
    }
  });

  // Regression guard on the pricing promise: PRICING_COPY.foundingMemberPerks
  // publicly commits to "Locked-in pricing for life." These three prices must
  // never change.
  it("grandfathered legacy plans keep their original live prices forever", () => {
    expect(PLANS.starter.price).toBe(19);
    expect(PLANS.growth.price).toBe(79);
    expect(PLANS.scale.price).toBe(199);
  });

  it("legacy plans have the same feature set as their new-tier equivalent", () => {
    expect(PLANS.starter.features).toEqual(PLANS.pro.features);
    expect(PLANS.growth.features).toEqual(PLANS.business.features);
    expect(PLANS.scale.features).toEqual(PLANS.business.features);
  });

  it("no plan has a finite tracked-event allowance or overage pricing", () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.maxMessages).toBe(-1);
      expect(plan.overagePriceCentsPerK).toBeNull();
    }
  });

  it("events are gated off Free and on for Pro", () => {
    expect(PLANS.free.features.events).toBe(false);
    expect(PLANS.pro.features.events).toBe(true);
  });

  it("getRequiredPlan never returns a legacy plan ID", () => {
    const features = Object.keys(
      PLANS.business.features
    ) as readonly PlanFeature[];

    for (const feature of features) {
      const required = getRequiredPlan(feature);
      if (required !== null) {
        expect(PUBLIC_PLAN_IDS as readonly string[]).toContain(required);
      }
    }
  });

  it("getNextPlan walks the public ladder and maps legacy plans to their successor", () => {
    expect(getNextPlan("free")).toBe("pro");
    expect(getNextPlan("pro")).toBe("business");
    expect(getNextPlan("business")).toBeNull();

    expect(getNextPlan("starter")).toBe("business");
    expect(getNextPlan("growth")).toBeNull();
    expect(getNextPlan("scale")).toBeNull();

    expect(isTopPlan("scale")).toBe(true);
  });

  // Regression guard: `id in PLANS` walks the prototype chain, so
  // isPlanId("constructor") used to return true. isPlanId feeds a URL param
  // and a localStorage value in the onboarding billing step, so a crafted
  // ?plan=constructor could crash it. Object.hasOwn fixes this.
  it("isPlanId rejects Object.prototype keys instead of walking the prototype chain", () => {
    for (const key of ["constructor", "__proto__", "toString", "valueOf"]) {
      expect(isPlanId(key)).toBe(false);
    }
  });

  it("isPlanId accepts every real plan id, including the legacy ones", () => {
    for (const id of Object.keys(PLANS)) {
      expect(isPlanId(id)).toBe(true);
    }
  });

  it("toPublicPlanId maps every legacy plan to its successor", () => {
    expect(toPublicPlanId("starter")).toBe("pro");
    expect(toPublicPlanId("growth")).toBe("business");
    expect(toPublicPlanId("scale")).toBe("business");
    // Identity for already-public plans
    expect(toPublicPlanId("free")).toBe("free");
    expect(toPublicPlanId("pro")).toBe("pro");
    expect(toPublicPlanId("business")).toBe("business");
  });

  describe("self-hosted licence tiers", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    // LICENSE_VALID_TIERS must accept every legacy tier forever — these
    // strings appear in licences already issued to self-hosted customers.
    for (const tier of ["starter", "growth", "scale"] as const) {
      it(`accepts a licence key for the legacy "${tier}" tier`, () => {
        vi.stubEnv("WRAPS_LICENSE_KEY", makeWebLicenseKey(tier, "2099-12-31"));
        vi.stubEnv("WRAPS_LICENSE_PUBLIC_KEY_PEM", TEST_PUB_PEM);

        expect(getLicensedPlan()).toBe(tier);
      });
    }

    for (const tier of ["pro", "business"] as const) {
      it(`accepts a licence key for the new "${tier}" tier`, () => {
        vi.stubEnv("WRAPS_LICENSE_KEY", makeWebLicenseKey(tier, "2099-12-31"));
        vi.stubEnv("WRAPS_LICENSE_PUBLIC_KEY_PEM", TEST_PUB_PEM);

        expect(getLicensedPlan()).toBe(tier);
      });
    }
  });
});
