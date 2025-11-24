import {
  db,
  member,
  organization,
  organizationExtension,
  user,
} from "@wraps/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll } from "vitest";

// Test users
export const testUser = {
  id: "test-onboarding-user-1",
  email: "onboarding-test@example.com",
  name: "Onboarding Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

export const testUserNoAccess = {
  id: "test-onboarding-user-2",
  email: "no-access@example.com",
  name: "No Access User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

// Test organization
export const testOrganization = {
  id: "test-onboarding-org-1",
  name: "Onboarding Test Org",
  slug: "onboarding-test-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

// Test organization extension
export const testOrganizationExtension = {
  organizationId: "test-onboarding-org-1",
  plan: "free",
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  awsAccountCount: 0,
  memberCount: 1,
  onboardingCompleted: false,
  onboardingCompletedAt: null,
  updatedAt: new Date(),
};

// Test member (owner)
export const testMemberOwner = {
  id: "test-onboarding-member-1",
  organizationId: "test-onboarding-org-1",
  userId: "test-onboarding-user-1",
  role: "owner" as const,
  createdAt: new Date(),
};

// Set up test database
beforeAll(async () => {
  // Insert test users
  await db
    .insert(user)
    .values([testUser, testUserNoAccess])
    .onConflictDoUpdate({
      target: user.id,
      set: { updatedAt: new Date() },
    });

  // Insert test organization
  await db
    .insert(organization)
    .values(testOrganization)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrganization.name },
    });

  // Insert organization extension
  await db
    .insert(organizationExtension)
    .values(testOrganizationExtension)
    .onConflictDoUpdate({
      target: organizationExtension.organizationId,
      set: {
        onboardingCompleted: false,
        onboardingCompletedAt: null,
        updatedAt: new Date(),
      },
    });

  // Insert member
  await db
    .insert(member)
    .values(testMemberOwner)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: testMemberOwner.role },
    });
});

// Clean up after all tests
afterAll(async () => {
  // Clean up in reverse order of dependencies
  await db.delete(member).where(eq(member.organizationId, testOrganization.id));
  await db
    .delete(organizationExtension)
    .where(eq(organizationExtension.organizationId, testOrganization.id));
  await db.delete(organization).where(eq(organization.id, testOrganization.id));
  await db.delete(user).where(eq(user.id, testUser.id));
  await db.delete(user).where(eq(user.id, testUserNoAccess.id));
});
