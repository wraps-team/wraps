import {
  contact,
  db,
  organization,
  organizationExtension,
  subscription,
} from "@wraps/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  checkAwsAccountLimit,
  checkContactLimit,
  checkFeatureAccess,
  getOrganizationPlan,
} from "../index";

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
      expect(result.limit).toBe(1); // Starter plan has 1 AWS account
    });
  });

  describe("checkFeatureAccess", () => {
    it("should return not allowed for free plan accessing starter feature", async () => {
      // Free tier doesn't have topics - requires Starter plan
      const result = await checkFeatureAccess(testOrgId, "topics");

      expect(result.allowed).toBe(false);
      expect(result.message).toContain("requires a Starter plan");
      expect(result.requiredPlan).toBe("starter");
    });

    it("should return allowed for starter plan accessing starter feature", async () => {
      await db.insert(subscription).values({
        id: `sub_test_${Date.now()}`,
        plan: "starter",
        referenceId: testOrgId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await checkFeatureAccess(testOrgId, "topics");

      expect(result.allowed).toBe(true);
      expect(result.requiredPlan).toBe("starter");
    });

    it("should return not allowed for starter plan accessing scale feature", async () => {
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
      expect(result.requiredPlan).toBe("scale");
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

      const result = await checkFeatureAccess(testOrgId, "automations");

      expect(result.allowed).toBe(true);
      expect(result.requiredPlan).toBe("free"); // Automations available on free tier
    });
  });
});
