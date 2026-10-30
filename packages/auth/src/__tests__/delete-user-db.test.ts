/**
 * Account deletion through the real drizzle adapter and schema.
 *
 * better-auth's deleteUser removes sessions, then accounts, then the user row,
 * with no transaction around them. `audit_log.user_id` and seven `created_by`
 * style columns referenced `user.id` with NO ACTION, and every user has an
 * `auth.login` audit row, so the final delete always failed with a 23503.
 * The user was left with no sessions or login methods, and every retry
 * returned "Unauthorized" (2026-10-29, clubpicks).
 */

import { auditLog, awsAccount, db, organization, user } from "@wraps/db";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@wraps/email", () => ({
  getWrapsClient: vi.fn(),
}));

vi.mock("posthog-node", () => ({ PostHog: vi.fn() }));

const PREFIX = "delete-user-test";
const stamp = Date.now();
const email = `${PREFIX}-${stamp}@example.com`;
const orgId = `${PREFIX}-org-${stamp}`;
const auditId = `${PREFIX}-audit-${stamp}`;
const awsId = `${PREFIX}-aws-${stamp}`;
const password = "a-long-unbreached-test-passphrase-7d1e";

describe("deleteUser vs rows the user is attributed on", () => {
  let auth: typeof import("../index").auth;

  beforeAll(async () => {
    ({ auth } = await import("../index"));
    await db.delete(organization).where(like(organization.id, `${PREFIX}-%`));
    await db.delete(user).where(like(user.email, `${PREFIX}-%`));
  }, 60_000);

  afterAll(async () => {
    await db.delete(organization).where(like(organization.id, `${PREFIX}-%`));
    await db.delete(user).where(like(user.email, `${PREFIX}-%`));
  });

  it("deletes the user and keeps the org's rows with the reference nulled", async () => {
    const { headers, response } = await auth.api.signUpEmail({
      body: { email, password, name: "Delete User Test" },
      returnHeaders: true,
    });
    const userId = response.user.id;
    const cookie = (headers as Headers)
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

    await db.insert(organization).values({
      id: orgId,
      name: "Delete User Test",
      slug: orgId,
      createdAt: new Date(),
    });
    await db.insert(auditLog).values({
      id: auditId,
      organizationId: orgId,
      userId,
      actorEmail: email,
      action: "auth.login",
      resource: "session",
    });
    await db.insert(awsAccount).values({
      id: awsId,
      organizationId: orgId,
      name: "test",
      accountId: "123456789012",
      region: "us-east-1",
      roleArn: "arn:aws:iam::123456789012:role/wraps-console-access-role",
      externalId: `${PREFIX}-ext-${stamp}`,
      createdBy: userId,
    });

    const result = await auth.api.deleteUser({
      body: {},
      headers: new Headers({ cookie }),
    });
    expect(result.success).toBe(true);

    const users = await db.select().from(user).where(eq(user.id, userId));
    expect(users).toHaveLength(0);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.id, auditId));
    expect(audits).toEqual([
      expect.objectContaining({ userId: null, actorEmail: email }),
    ]);

    const awsAccounts = await db
      .select()
      .from(awsAccount)
      .where(eq(awsAccount.id, awsId));
    expect(awsAccounts).toEqual([expect.objectContaining({ createdBy: null })]);
  });
});
