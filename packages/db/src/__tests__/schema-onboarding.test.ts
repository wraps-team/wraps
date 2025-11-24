import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import {
  organization,
  organizationExtension,
  subscription,
  user,
} from "../schema";

// Test data
const testUserId = "schema-test-user-1";
const testOrgId = "schema-test-org-1";

describe("Database Schema - Onboarding & Stripe Fields", () => {
  beforeAll(async () => {
    // Clean up any existing test data
    await db
      .delete(organizationExtension)
      .where(eq(organizationExtension.organizationId, testOrgId));
    await db
      .delete(subscription)
      .where(eq(subscription.referenceId, testOrgId));
    await db.delete(organization).where(eq(organization.id, testOrgId));
    await db.delete(user).where(eq(user.id, testUserId));
  });

  afterAll(async () => {
    // Clean up test data
    await db
      .delete(organizationExtension)
      .where(eq(organizationExtension.organizationId, testOrgId));
    await db
      .delete(subscription)
      .where(eq(subscription.referenceId, testOrgId));
    await db.delete(organization).where(eq(organization.id, testOrgId));
    await db.delete(user).where(eq(user.id, testUserId));
  });

  describe("User table - Stripe fields", () => {
    it("should have stripeCustomerId field", async () => {
      const testUser = await db
        .insert(user)
        .values({
          id: testUserId,
          name: "Schema Test User",
          email: "schema-test@example.com",
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          stripeCustomerId: "cus_test123",
        })
        .returning();

      expect(testUser[0].stripeCustomerId).toBe("cus_test123");
    });

    it("should allow null stripeCustomerId", async () => {
      await db
        .update(user)
        .set({ stripeCustomerId: null })
        .where(eq(user.id, testUserId));

      const updated = await db.query.user.findFirst({
        where: eq(user.id, testUserId),
      });

      expect(updated?.stripeCustomerId).toBeNull();
    });
  });

  describe("OrganizationExtension table - Onboarding fields", () => {
    beforeAll(async () => {
      // Create organization first
      await db
        .insert(organization)
        .values({
          id: testOrgId,
          name: "Schema Test Org",
          slug: "schema-test-org",
          createdAt: new Date(),
        })
        .onConflictDoNothing();
    });

    it("should create extension with onboarding fields", async () => {
      const ext = await db
        .insert(organizationExtension)
        .values({
          organizationId: testOrgId,
          plan: "free",
          onboardingCompleted: false,
          onboardingCompletedAt: null,
          awsAccountCount: 0,
          memberCount: 1,
          updatedAt: new Date(),
        })
        .returning();

      expect(ext[0].onboardingCompleted).toBe(false);
      expect(ext[0].onboardingCompletedAt).toBeNull();
    });

    it("should update onboarding completion status", async () => {
      const completedAt = new Date();

      await db
        .update(organizationExtension)
        .set({
          onboardingCompleted: true,
          onboardingCompletedAt: completedAt,
        })
        .where(eq(organizationExtension.organizationId, testOrgId));

      const updated = await db.query.organizationExtension.findFirst({
        where: eq(organizationExtension.organizationId, testOrgId),
      });

      expect(updated?.onboardingCompleted).toBe(true);
      expect(updated?.onboardingCompletedAt).toBeInstanceOf(Date);
    });

    it("should default onboardingCompleted to false", async () => {
      // Delete and recreate without specifying onboardingCompleted
      await db
        .delete(organizationExtension)
        .where(eq(organizationExtension.organizationId, testOrgId));

      const ext = await db
        .insert(organizationExtension)
        .values({
          organizationId: testOrgId,
          plan: "pro",
          awsAccountCount: 0,
          memberCount: 1,
          updatedAt: new Date(),
        })
        .returning();

      expect(ext[0].onboardingCompleted).toBe(false);
    });
  });

  describe("Subscription table - Stripe integration", () => {
    it("should create subscription with all required fields", async () => {
      const sub = await db
        .insert(subscription)
        .values({
          id: "sub_test123",
          plan: "pro",
          referenceId: testOrgId,
          stripeCustomerId: "cus_test123",
          stripeSubscriptionId: "sub_stripe123",
          status: "active",
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          cancelAtPeriodEnd: false,
          seats: 10,
          trialStart: null,
          trialEnd: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      expect(sub[0].plan).toBe("pro");
      expect(sub[0].referenceId).toBe(testOrgId);
      expect(sub[0].status).toBe("active");
      expect(sub[0].seats).toBe(10);
    });

    it("should handle trial period fields", async () => {
      const trialStart = new Date();
      const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

      await db
        .delete(subscription)
        .where(eq(subscription.referenceId, testOrgId));

      const sub = await db
        .insert(subscription)
        .values({
          id: "sub_test_trial",
          plan: "pro",
          referenceId: testOrgId,
          status: "trialing",
          periodStart: trialStart,
          periodEnd: trialEnd,
          cancelAtPeriodEnd: false,
          trialStart,
          trialEnd,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      expect(sub[0].status).toBe("trialing");
      expect(sub[0].trialStart).toBeInstanceOf(Date);
      expect(sub[0].trialEnd).toBeInstanceOf(Date);
    });

    it("should allow null Stripe fields for free plans", async () => {
      await db
        .delete(subscription)
        .where(eq(subscription.referenceId, testOrgId));

      const sub = await db
        .insert(subscription)
        .values({
          id: "sub_free",
          plan: "free",
          referenceId: testOrgId,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          status: "active",
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          cancelAtPeriodEnd: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      expect(sub[0].plan).toBe("free");
      expect(sub[0].stripeCustomerId).toBeNull();
      expect(sub[0].stripeSubscriptionId).toBeNull();
    });

    it("should handle subscription cancellation", async () => {
      await db
        .update(subscription)
        .set({
          cancelAtPeriodEnd: true,
          status: "canceled",
        })
        .where(eq(subscription.referenceId, testOrgId));

      const updated = await db.query.subscription.findFirst({
        where: eq(subscription.referenceId, testOrgId),
      });

      expect(updated?.cancelAtPeriodEnd).toBe(true);
      expect(updated?.status).toBe("canceled");
    });
  });

  describe("Data integrity and constraints", () => {
    it("should enforce organizationExtension primary key", async () => {
      // Trying to insert duplicate organizationId should fail
      await expect(
        db.insert(organizationExtension).values({
          organizationId: testOrgId,
          plan: "enterprise",
          awsAccountCount: 0,
          memberCount: 1,
          updatedAt: new Date(),
        })
      ).rejects.toThrow();
    });

    it("should cascade delete extension when organization is deleted", async () => {
      const tempOrgId = "temp-org-cascade-test";

      // Create org and extension
      await db.insert(organization).values({
        id: tempOrgId,
        name: "Temp Org",
        slug: "temp-org-cascade",
        createdAt: new Date(),
      });

      await db.insert(organizationExtension).values({
        organizationId: tempOrgId,
        plan: "free",
        awsAccountCount: 0,
        memberCount: 1,
        updatedAt: new Date(),
      });

      // Delete organization
      await db.delete(organization).where(eq(organization.id, tempOrgId));

      // Extension should be deleted too
      const ext = await db.query.organizationExtension.findFirst({
        where: eq(organizationExtension.organizationId, tempOrgId),
      });

      expect(ext).toBeUndefined();
    });
  });
});
