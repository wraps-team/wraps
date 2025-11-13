import { db } from "@wraps/db";
import { describe, expect, it } from "vitest";
import { grantAWSAccountAccess } from "../grant-access";
import { testAWSAccount, testUser, testUser2 } from "./setup";

describe("grantAWSAccountAccess", () => {
  it("should create new permission when none exists", async () => {
    await grantAWSAccountAccess({
      userId: testUser2.id,
      awsAccountId: testAWSAccount.id,
      permissions: "READ_ONLY",
      grantedBy: testUser.id,
    });

    const permission = await db.query.awsAccountPermission.findFirst({
      where: (p, { and, eq }) =>
        and(eq(p.userId, testUser2.id), eq(p.awsAccountId, testAWSAccount.id)),
    });

    expect(permission).toBeDefined();
    expect(permission?.permissions).toEqual(["view"]);
    expect(permission?.grantedBy).toBe(testUser.id);
    expect(permission?.expiresAt).toBeNull();
  });

  it("should update existing permission", async () => {
    // Create initial permission
    await grantAWSAccountAccess({
      userId: testUser2.id,
      awsAccountId: testAWSAccount.id,
      permissions: "READ_ONLY",
      grantedBy: testUser.id,
    });

    // Update to FULL_ACCESS
    await grantAWSAccountAccess({
      userId: testUser2.id,
      awsAccountId: testAWSAccount.id,
      permissions: "FULL_ACCESS",
      grantedBy: testUser.id,
    });

    const permission = await db.query.awsAccountPermission.findFirst({
      where: (p, { and, eq }) =>
        and(eq(p.userId, testUser2.id), eq(p.awsAccountId, testAWSAccount.id)),
    });

    expect(permission).toBeDefined();
    expect(permission?.permissions).toEqual(["view", "send"]);
  });

  it("should set expiration date when provided", async () => {
    const expiresAt = new Date("2025-12-31");

    await grantAWSAccountAccess({
      userId: testUser2.id,
      awsAccountId: testAWSAccount.id,
      permissions: "ADMIN",
      grantedBy: testUser.id,
      expiresAt,
    });

    const permission = await db.query.awsAccountPermission.findFirst({
      where: (p, { and, eq }) =>
        and(eq(p.userId, testUser2.id), eq(p.awsAccountId, testAWSAccount.id)),
    });

    expect(permission).toBeDefined();
    expect(permission?.permissions).toEqual(["view", "send", "manage"]);
    expect(permission?.expiresAt).toEqual(expiresAt);
  });
});
