/**
 * AWS connection routes — write RBAC.
 *
 * The three POSTs below create/update `awsAccount` rows (roleArn, externalId,
 * webhookSecret, isVerified). An `awsAccount` row is a live sending identity:
 * apps/api resolves it to a roleArn/externalId and assume-roles into it to
 * send mail. So a role that cannot write must not be able to attach one.
 *
 * `read-only` is described in the members UI as "View everything, export
 * contacts. No write operations." — it must get 403 here, as must `marketing`,
 * `billing` and `member`. That is the same boundary `connectAwsAccount`
 * (apps/web/src/actions/aws-accounts.ts) already enforces with
 * `awsAccounts:["write"]`; only `owner`/`admin` may attach an AWS account.
 */

import { awsAccount, db } from "@wraps/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testMemberOwner, testOrganization, testUser } from "./setup";

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

// Role returned by the membership lookup — reassigned per test.
let currentRole: string = testMemberOwner.role;

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
        userRole: currentRole,
      };
    }
    return null;
  }),
}));

// A role the attacker controls assumes successfully — the gate, not AWS, is
// what has to stop the write.
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

const ATTACKER_ACCOUNT_ID = "999988887777";
const ATTACKER_ROLE_ARN = `arn:aws:iam::${ATTACKER_ACCOUNT_ID}:role/wraps-console-access-role`;
const ATTACKER_EXTERNAL_ID = "wraps_deadbeefdeadbeefdeadbeefdeadbeef";

const ROUTES = [
  {
    name: "aws/validate-infrastructure",
    load: () =>
      import("../[orgSlug]/aws/validate-infrastructure/route").then(
        (m) => m.POST
      ),
    body: {
      roleArn: ATTACKER_ROLE_ARN,
      externalId: ATTACKER_EXTERNAL_ID,
      region: "us-east-1",
      webhookSecret: "attacker-controlled-secret",
    },
  },
  {
    name: "aws/validate",
    load: () => import("../[orgSlug]/aws/validate/route").then((m) => m.POST),
    body: {
      roleArn: ATTACKER_ROLE_ARN,
      externalId: ATTACKER_EXTERNAL_ID,
      region: "us-east-1",
    },
  },
  {
    name: "onboarding/aws/validate",
    load: () =>
      import("../[orgSlug]/onboarding/aws/validate/route").then((m) => m.POST),
    body: {
      roleArn: ATTACKER_ROLE_ARN,
      externalId: ATTACKER_EXTERNAL_ID,
      region: "us-east-1",
    },
  },
] as const;

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

describe("AWS connection routes require awsAccounts:write", () => {
  beforeEach(async () => {
    await db
      .delete(awsAccount)
      .where(eq(awsAccount.organizationId, testOrganization.id));
    currentRole = testMemberOwner.role;
    mockAssumeRole.mockClear();
  });

  for (const role of ["read-only", "marketing", "billing", "member"] as const) {
    describe.each(ROUTES)("$name", ({ load, body }) => {
      it(`denies ${role} and writes no awsAccount row`, async () => {
        currentRole = role;
        const POST = await load();

        const response = await POST(buildRequest(body), {
          params: Promise.resolve({ orgSlug: testOrganization.slug }),
        });

        expect(response.status).toBe(403);

        const rows = await db
          .select()
          .from(awsAccount)
          .where(eq(awsAccount.organizationId, testOrganization.id));
        expect(rows).toHaveLength(0);
      });
    });
  }

  it("still allows owner on aws/validate-infrastructure (onboarding connect)", async () => {
    currentRole = "owner";
    const { POST } = await import(
      "../[orgSlug]/aws/validate-infrastructure/route"
    );

    const response = await POST(buildRequest(ROUTES[0].body), context);

    expect(response.status).toBe(200);
    const rows = await db
      .select()
      .from(awsAccount)
      .where(eq(awsAccount.organizationId, testOrganization.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].accountId).toBe(ATTACKER_ACCOUNT_ID);
  });
});
