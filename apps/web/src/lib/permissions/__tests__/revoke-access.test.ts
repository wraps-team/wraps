import { db } from "@wraps/db";
import { describe, expect, it } from "vitest";
import { grantAWSAccountAccess } from "../grant-access";
import { revokeAWSAccountAccess } from "../revoke-access";
import { testAWSAccount, testUser, testUser2 } from "./setup";

describe("revokeAWSAccountAccess", () => {
  it("should delete permission grant", async () => {
    // Create a permission first
    await grantAWSAccountAccess({
      userId: testUser2.id,
      awsAccountId: testAWSAccount.id,
      permissions: "READ_ONLY",
      grantedBy: testUser.id,
    });

    // Verify it exists
    let permission = await db.query.awsAccountPermission.findFirst({
      where: (p, { and, eq }) =>
        and(eq(p.userId, testUser2.id), eq(p.awsAccountId, testAWSAccount.id)),
    });
    expect(permission).toBeDefined();

    // Revoke it
    await revokeAWSAccountAccess({
      userId: testUser2.id,
      awsAccountId: testAWSAccount.id,
    });

    // Verify it's gone
    permission = await db.query.awsAccountPermission.findFirst({
      where: (p, { and, eq }) =>
        and(eq(p.userId, testUser2.id), eq(p.awsAccountId, testAWSAccount.id)),
    });
    expect(permission).toBeUndefined();
  });

  it("should not throw error if permission doesn't exist", async () => {
    await expect(
      revokeAWSAccountAccess({
        userId: testUser2.id,
        awsAccountId: testAWSAccount.id,
      })
    ).resolves.not.toThrow();
  });
});
