import { awsAccountPermission, db } from "@wraps/db";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { checkAWSAccountAccess } from "../check-access";
import { grantAWSAccountAccess } from "../grant-access";
import { testAWSAccount, testOrganization, testUser, testUser2 } from "./setup";

describe("checkAWSAccountAccess", () => {
  // Clean up after each test within this suite
  afterEach(async () => {
    await db
      .delete(awsAccountPermission)
      .where(eq(awsAccountPermission.userId, testUser2.id));
  });

  it("should deny access if user is not org member", async () => {
    const result = await checkAWSAccountAccess({
      userId: "non-member-user",
      organizationId: testOrganization.id,
      awsAccountId: testAWSAccount.id,
      permission: "view",
    });

    expect(result).toEqual({
      authorized: false,
      reason: "Not a member of this organization",
    });
  });

  it("should grant access if user is org owner", async () => {
    const result = await checkAWSAccountAccess({
      userId: testUser.id, // testUser is the owner
      organizationId: testOrganization.id,
      awsAccountId: testAWSAccount.id,
      permission: "view",
    });

    expect(result).toEqual({
      authorized: true,
      reason: "Organization owner",
    });
  });

  it("should deny access if non-owner has no permission grant", async () => {
    const result = await checkAWSAccountAccess({
      userId: testUser2.id, // testUser2 is a regular member
      organizationId: testOrganization.id,
      awsAccountId: testAWSAccount.id,
      permission: "view",
    });

    expect(result).toEqual({
      authorized: false,
      reason: "No permission grant",
    });
  });

  it("should grant access if non-owner has valid permission", async () => {
    // Grant permission first
    await grantAWSAccountAccess({
      userId: testUser2.id,
      awsAccountId: testAWSAccount.id,
      permissions: "FULL_ACCESS",
      grantedBy: testUser.id,
    });

    const result = await checkAWSAccountAccess({
      userId: testUser2.id,
      organizationId: testOrganization.id,
      awsAccountId: testAWSAccount.id,
      permission: "send",
    });

    expect(result).toEqual({
      authorized: true,
      reason: "Explicit grant",
    });
  });

  it("should deny access if permission is expired", async () => {
    // Grant permission with past expiration date
    await grantAWSAccountAccess({
      userId: testUser2.id,
      awsAccountId: testAWSAccount.id,
      permissions: "READ_ONLY",
      grantedBy: testUser.id,
      expiresAt: new Date("2020-01-01"),
    });

    const result = await checkAWSAccountAccess({
      userId: testUser2.id,
      organizationId: testOrganization.id,
      awsAccountId: testAWSAccount.id,
      permission: "view",
    });

    expect(result).toEqual({
      authorized: false,
      reason: "Permission expired",
    });
  });

  it("should deny access if user lacks required permission", async () => {
    // Grant only view permission
    await grantAWSAccountAccess({
      userId: testUser2.id,
      awsAccountId: testAWSAccount.id,
      permissions: "READ_ONLY",
      grantedBy: testUser.id,
    });

    const result = await checkAWSAccountAccess({
      userId: testUser2.id,
      organizationId: testOrganization.id,
      awsAccountId: testAWSAccount.id,
      permission: "manage",
    });

    expect(result).toEqual({
      authorized: false,
      reason: "Insufficient permissions",
    });
  });
});
