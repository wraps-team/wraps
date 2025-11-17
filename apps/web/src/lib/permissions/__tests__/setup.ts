import {
  awsAccount,
  awsAccountPermission,
  db,
  member,
  organization,
  user,
} from "@wraps/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll } from "vitest";

// Test data - we'll insert these into the real database
export const testUser = {
  id: "test-user-123",
  email: "test@example.com",
  name: "Test User",
  emailVerified: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
};

export const testUser2 = {
  id: "test-user-456",
  email: "test2@example.com",
  name: "Test User 2",
  emailVerified: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
};

export const testOrganization = {
  id: "test-org-123",
  name: "Test Org",
  slug: "test-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

export const testAWSAccount = {
  id: "test-aws-123",
  organizationId: "test-org-123",
  name: "Production",
  accountId: "123456789012",
  region: "us-east-1",
  roleArn: "arn:aws:iam::123456789012:role/test",
  externalId: "external-123",
  isVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  status: "active" as const,
  verificationMethod: null,
};

export const testMemberOwner = {
  id: "test-member-owner",
  organizationId: "test-org-123",
  userId: "test-user-123",
  role: "owner" as const,
  createdAt: new Date(),
};

export const testMemberRegular = {
  id: "test-member-regular",
  organizationId: "test-org-123",
  userId: "test-user-456",
  role: "member" as const,
  createdAt: new Date(),
};

// Set up test database with initial data
beforeAll(async () => {
  // Use onConflictDoUpdate to handle existing records
  await db
    .insert(user)
    .values([testUser, testUser2])
    .onConflictDoUpdate({
      target: user.id,
      set: { updatedAt: new Date() },
    });

  await db
    .insert(organization)
    .values(testOrganization)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrganization.name },
    });

  await db
    .insert(awsAccount)
    .values(testAWSAccount)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { updatedAt: new Date() },
    });

  await db
    .insert(member)
    .values([testMemberOwner, testMemberRegular])
    .onConflictDoUpdate({
      target: member.id,
      set: { role: member.role },
    });

  // Clean up any existing permissions for our test users from previous runs
  await db
    .delete(awsAccountPermission)
    .where(eq(awsAccountPermission.awsAccountId, testAWSAccount.id));
});

// Clean up after all tests in the suite complete
afterAll(async () => {
  await db
    .delete(awsAccountPermission)
    .where(eq(awsAccountPermission.awsAccountId, testAWSAccount.id));
});
