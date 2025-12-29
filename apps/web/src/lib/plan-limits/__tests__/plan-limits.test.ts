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
    it("should return null when no subscription exists", async () => {
      const plan = await getOrganizationPlan(testOrgId);
      expect(plan).toBeNull();
    });

    it("should return plan from active subscription", async () => {
      await db.insert(subscription).values({
        id: `sub_test_${Date.now()}`,
        plan: "pro",
        referenceId: testOrgId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const plan = await getOrganizationPlan(testOrgId);
      expect(plan).toBe("pro");
    });

    it("should return plan from trialing subscription", async () => {
      await db.insert(subscription).values({
        id: `sub_test_${Date.now()}`,
        plan: "growth",
        referenceId: testOrgId,
        status: "trialing",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const plan = await getOrganizationPlan(testOrgId);
      expect(plan).toBe("growth");
    });

    it("should return null for canceled subscription", async () => {
      await db.insert(subscription).values({
        id: `sub_test_${Date.now()}`,
        plan: "pro",
        referenceId: testOrgId,
        status: "canceled",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const plan = await getOrganizationPlan(testOrgId);
      expect(plan).toBeNull();
    });

    it("should return null for past_due subscription", async () => {
      await db.insert(subscription).values({
        id: `sub_test_${Date.now()}`,
        plan: "pro",
        referenceId: testOrgId,
        status: "past_due",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const plan = await getOrganizationPlan(testOrgId);
      expect(plan).toBeNull();
    });
  });

  describe("checkContactLimit", () => {
    it("should return not allowed when no subscription", async () => {
      const result = await checkContactLimit(testOrgId);

      expect(result.allowed).toBe(false);
      expect(result.message).toContain("No active subscription");
      expect(result.requiredPlan).toBe("starter");
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
      expect(result.limit).toBeGreaterThan(0);
    });
  });

  describe("checkAwsAccountLimit", () => {
    it("should return not allowed when no subscription", async () => {
      const result = await checkAwsAccountLimit(testOrgId);

      expect(result.allowed).toBe(false);
      expect(result.message).toContain("No active subscription");
      expect(result.requiredPlan).toBe("starter");
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
    it("should return not allowed when no subscription", async () => {
      const result = await checkFeatureAccess(testOrgId, "topics");

      expect(result.allowed).toBe(false);
      expect(result.message).toContain("No active subscription");
      expect(result.requiredPlan).toBe("starter");
    });

    it("should return not allowed for starter plan accessing pro feature", async () => {
      await db.insert(subscription).values({
        id: `sub_test_${Date.now()}`,
        plan: "starter",
        referenceId: testOrgId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await checkFeatureAccess(testOrgId, "topics");

      expect(result.allowed).toBe(false);
      expect(result.requiredPlan).toBe("pro");
    });

    it("should return allowed for pro plan accessing pro feature", async () => {
      await db.insert(subscription).values({
        id: `sub_test_${Date.now()}`,
        plan: "pro",
        referenceId: testOrgId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await checkFeatureAccess(testOrgId, "topics");

      expect(result.allowed).toBe(true);
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

    it("should return not allowed for starter plan accessing workflows", async () => {
      await db.insert(subscription).values({
        id: `sub_test_${Date.now()}`,
        plan: "starter",
        referenceId: testOrgId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await checkFeatureAccess(testOrgId, "workflows");

      expect(result.allowed).toBe(false);
      expect(result.requiredPlan).toBe("growth");
    });
  });
});
