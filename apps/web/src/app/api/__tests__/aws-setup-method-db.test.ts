/**
 * `setupMethod` persistence on the three route insert sites (real DB).
 *
 * Plan 284: each of the account-creation flows records how the account was
 * connected, so the installed base becomes queryable. This file is the
 * happy-path counterpart to `aws-connect-rbac-db.test.ts` (which asserts
 * 403 for every case) — every case here is an authorised owner, an
 * assumable role, and a row actually written.
 */

import { awsAccount, db } from "@wraps/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testMemberOwner, testOrganization, testUser } from "./setup";

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

const mockSession = (userId: string): any => ({
  user: { id: userId, email: "test@example.com", name: "Test" },
  session: {
    id: "session-123",
    createdAt: new Date(),
    updatedAt: new Date(),
    userId,
    expiresAt: new Date(Date.now() + 86_400_000),
    token: "test-token",
  },
});

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => mockSession(testUser.id)),
    },
  },
}));

vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: vi.fn(async (slug: string, userId: string) => {
    if (slug === testOrganization.slug && userId === testUser.id) {
      return {
        id: testOrganization.id,
        name: testOrganization.name,
        slug: testOrganization.slug,
        userRole: testMemberOwner.role,
      };
    }
    return null;
  }),
}));

const mockAssumeRole = vi.fn(async () => ({
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  sessionToken: "token",
  expiration: new Date(),
}));

vi.mock("@/lib/aws/assume-role", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/aws/assume-role")>();
  return { ...actual, assumeRole: mockAssumeRole };
});

vi.mock("@/lib/aws/detect-features", () => ({
  findInfrastructureStack: vi.fn(async () => null),
  detectFeaturesFromOutputs: vi.fn(() => null),
}));

vi.mock("@/lib/activation-tracking", () => ({
  trackAwsConnected: vi.fn(async () => undefined),
}));

vi.mock("@aws-sdk/client-sesv2", () => ({
  // biome-ignore lint/complexity/useArrowFunction: vi.fn requires function expression for constructors
  SESv2Client: vi.fn(function () {
    return { send: vi.fn(async () => ({ ConfigurationSets: [] })) };
  }),
  // biome-ignore lint/complexity/useArrowFunction: vi.fn requires function expression for constructors
  ListConfigurationSetsCommand: vi.fn(function (params: unknown) {
    return params;
  }),
}));

const INFRA_ACCOUNT_ID = "555566667001";
const VALIDATE_ACCOUNT_ID = "555566667002";
const ONBOARDING_ACCOUNT_ID = "555566667003";

function roleArnFor(accountId: string) {
  return `arn:aws:iam::${accountId}:role/wraps-console-access-role`;
}

const EXTERNAL_ID = "wraps_deadbeefdeadbeefdeadbeefdeadbeef";

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/onboarding-test-org/aws/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const context = {
  params: Promise.resolve({ orgSlug: testOrganization.slug }),
};

describe("setupMethod persistence — real DB", () => {
  beforeEach(async () => {
    await db
      .delete(awsAccount)
      .where(eq(awsAccount.organizationId, testOrganization.id));
    mockAssumeRole.mockClear();
  });

  it("aws/validate-infrastructure persists setupMethod: cfn_infrastructure", async () => {
    const { POST } = await import(
      "../[orgSlug]/aws/validate-infrastructure/route"
    );

    const response = await POST(
      buildRequest({
        roleArn: roleArnFor(INFRA_ACCOUNT_ID),
        externalId: EXTERNAL_ID,
        region: "us-east-1",
        webhookSecret: "test-webhook-secret",
      }),
      context
    );

    expect(response.status).toBe(200);

    const [row] = await db
      .select({ setupMethod: awsAccount.setupMethod })
      .from(awsAccount)
      .where(eq(awsAccount.accountId, INFRA_ACCOUNT_ID));

    expect(row?.setupMethod).toBe("cfn_infrastructure");
  });

  it("aws/validate persists setupMethod: cfn_console_role", async () => {
    const { POST } = await import("../[orgSlug]/aws/validate/route");

    const response = await POST(
      buildRequest({
        roleArn: roleArnFor(VALIDATE_ACCOUNT_ID),
        externalId: EXTERNAL_ID,
        region: "us-east-1",
      }),
      context
    );

    expect(response.status).toBe(200);

    const [row] = await db
      .select({ setupMethod: awsAccount.setupMethod })
      .from(awsAccount)
      .where(eq(awsAccount.accountId, VALIDATE_ACCOUNT_ID));

    expect(row?.setupMethod).toBe("cfn_console_role");
  });

  it("onboarding/aws/validate persists setupMethod: onboarding_wizard", async () => {
    const { POST } = await import("../[orgSlug]/onboarding/aws/validate/route");

    const response = await POST(
      buildRequest({
        roleArn: roleArnFor(ONBOARDING_ACCOUNT_ID),
        externalId: EXTERNAL_ID,
        region: "us-east-1",
      }),
      context
    );

    expect(response.status).toBe(200);

    const [row] = await db
      .select({ setupMethod: awsAccount.setupMethod })
      .from(awsAccount)
      .where(eq(awsAccount.accountId, ONBOARDING_ACCOUNT_ID));

    expect(row?.setupMethod).toBe("onboarding_wizard");
  });
});
