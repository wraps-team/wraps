/**
 * getSesValidationAccounts — real DB.
 *
 * Only AWS accounts whose last-measured SES pricing plan (from the account-
 * health sweep's healthDetail.sesPricingPlan) is PRO or ENTERPRISE are
 * eligible for SES email validation (plan 373 Phase C, requirement 2).
 */

import {
  awsAccount,
  db,
  member,
  organization,
  subscription,
  user,
} from "@wraps/db";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getSesValidationAccounts } from "../validate-emails";

const PREFIX = "ses-validation-accts";

const testUser = {
  id: `${PREFIX}-user-1`,
  email: `${PREFIX}@example.com`,
  name: "SES Validation User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${PREFIX}-org-1`,
  name: "SES Validation Org",
  slug: `${PREFIX}-org`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const foreignOrg = {
  id: `${PREFIX}-foreign-org-1`,
  name: "Foreign Org",
  slug: `${PREFIX}-foreign-org`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: `${PREFIX}-member-1`,
  organizationId: testOrg.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testSubscription = {
  id: `${PREFIX}-sub-1`,
  plan: "scale",
  referenceId: testOrg.id,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: testUser.id, email: testUser.email, name: testUser.name },
      })),
    },
  },
}));

function makeAccount(overrides: {
  id: string;
  organizationId: string;
  currentPlan: string | null | undefined;
}) {
  return {
    id: overrides.id,
    organizationId: overrides.organizationId,
    name: `Account ${overrides.id}`,
    accountId: "472506473063",
    region: "us-east-1",
    roleArn: `arn:aws:iam::472506473063:role/wraps-console-access-role-${overrides.id}`,
    externalId: `ext-${overrides.id}`,
    healthDetail:
      overrides.currentPlan === undefined
        ? null
        : {
            bounceRate: null,
            complaintRate: null,
            quotaUsedRatio: null,
            sendingEnabled: true,
            enforcementStatus: null,
            productionAccessEnabled: true,
            reviewStatus: null,
            reviewCaseId: null,
            max24HourSend: null,
            sentLast24Hours: null,
            maxSendRate: null,
            sesPricingPlan: { current: overrides.currentPlan, next: null },
            reasons: [],
          },
  };
}

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
  await db
    .insert(organization)
    .values([testOrg, foreignOrg])
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: organization.name },
    });
  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({ target: member.id, set: { role: testMember.role } });
  await db.delete(subscription).where(eq(subscription.referenceId, testOrg.id));
  await db.insert(subscription).values(testSubscription);
});

beforeEach(async () => {
  await db.delete(awsAccount).where(eq(awsAccount.organizationId, testOrg.id));
  await db
    .delete(awsAccount)
    .where(eq(awsAccount.organizationId, foreignOrg.id));
});

afterAll(async () => {
  await db.delete(awsAccount).where(eq(awsAccount.organizationId, testOrg.id));
  await db
    .delete(awsAccount)
    .where(eq(awsAccount.organizationId, foreignOrg.id));
  await db.delete(subscription).where(eq(subscription.referenceId, testOrg.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(organization).where(eq(organization.id, foreignOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

describe("getSesValidationAccounts", () => {
  it("includes a PRO account with its validationApi entitlement", async () => {
    await db.insert(awsAccount).values(
      makeAccount({
        id: `${PREFIX}-pro`,
        organizationId: testOrg.id,
        currentPlan: "PRO",
      })
    );

    const result = await getSesValidationAccounts(testOrg.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].plan).toBe("PRO");
    expect(result.accounts[0].entitlement.status).toBe("included");
  });

  it("includes an ENTERPRISE account", async () => {
    await db.insert(awsAccount).values(
      makeAccount({
        id: `${PREFIX}-ent`,
        organizationId: testOrg.id,
        currentPlan: "ENTERPRISE",
      })
    );

    const result = await getSesValidationAccounts(testOrg.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.accounts.map((a) => a.plan)).toEqual(["ENTERPRISE"]);
  });

  it("excludes ESSENTIALS, NONE, unrecognized, and never-measured accounts", async () => {
    await db.insert(awsAccount).values([
      makeAccount({
        id: `${PREFIX}-essentials`,
        organizationId: testOrg.id,
        currentPlan: "ESSENTIALS",
      }),
      makeAccount({
        id: `${PREFIX}-none`,
        organizationId: testOrg.id,
        currentPlan: "NONE",
      }),
      makeAccount({
        id: `${PREFIX}-unrecognized`,
        organizationId: testOrg.id,
        currentPlan: "SOMETHING_NEW",
      }),
      makeAccount({
        id: `${PREFIX}-never-measured`,
        organizationId: testOrg.id,
        currentPlan: undefined,
      }),
    ]);

    const result = await getSesValidationAccounts(testOrg.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.accounts).toEqual([]);
  });

  it("never returns another org's accounts (cross-org IDOR guard)", async () => {
    await db.insert(awsAccount).values(
      makeAccount({
        id: `${PREFIX}-foreign-pro`,
        organizationId: foreignOrg.id,
        currentPlan: "PRO",
      })
    );

    const result = await getSesValidationAccounts(testOrg.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.accounts).toEqual([]);
  });
});
