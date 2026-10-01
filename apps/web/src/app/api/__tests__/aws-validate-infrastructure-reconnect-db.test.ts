/**
 * Reconnecting a known AWS account through validate-infrastructure (real DB).
 *
 * The update branch must overlay only what the stack reports onto
 * `features.email`; scanned keys (sms, sandbox, identities, ...) and
 * `emailEnabled` must survive. Seeds its own org with a random suffix, so it
 * does not use the fixed-id fixtures from `./setup`.
 */

import { awsAccount, db, organization } from "@wraps/db";
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

const suffix = crypto.randomUUID().slice(0, 8);
const ORG_ID = `reconnect-org-${suffix}`;
const ORG_SLUG = `reconnect-${suffix}`;
const USER_ID = `reconnect-user-${suffix}`;

const { findInfrastructureStack, detectFeaturesFromOutputs } = vi.hoisted(
  () => ({
    findInfrastructureStack: vi.fn(),
    detectFeaturesFromOutputs: vi.fn(),
  })
);

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
      getSession: vi.fn(async () => mockSession(USER_ID)),
    },
  },
}));

vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: vi.fn(async (slug: string) => {
    if (slug === ORG_SLUG) {
      return {
        id: ORG_ID,
        name: "Reconnect Org",
        slug: ORG_SLUG,
        userRole: "owner",
      };
    }
    return null;
  }),
}));

vi.mock("@/lib/aws/assume-role", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/aws/assume-role")>();
  return {
    ...actual,
    assumeRole: vi.fn(async () => ({
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      sessionToken: "token",
      expiration: new Date(),
    })),
  };
});

vi.mock("@/lib/aws/detect-features", () => ({
  findInfrastructureStack,
  detectFeaturesFromOutputs,
}));

vi.mock("@/lib/activation-tracking", () => ({
  trackAwsConnected: vi.fn(async () => undefined),
}));

vi.mock("@wraps/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@wraps/email")>()),
  scanWrapsIdentities: vi.fn(async () => {
    throw new Error("identity scan disabled in this test");
  }),
}));

const ACCOUNT_ID = "444455556001";
const ROLE_ARN = `arn:aws:iam::${ACCOUNT_ID}:role/wraps-console-access-role`;
// aws_account.external_id is globally unique, so it cannot be the literal the
// other connect tests use.
const EXTERNAL_ID = `wraps_${crypto.randomUUID().replaceAll("-", "")}`;
const ARCHIVE_ARN =
  "arn:aws:ses:us-east-1:444455556001:mailmanager-archive/a-1";

const seededFeatures = {
  email: {
    configSetName: "wraps-email-old",
    sandbox: true,
    archivingEnabled: true,
    archiveArn: ARCHIVE_ARN,
    identities: [
      {
        identity: "a.example.com",
        type: "DOMAIN" as const,
        configSetName: "wraps-email-old",
      },
    ],
    trackingBySet: [
      {
        configSetName: "wraps-email-old",
        customRedirectDomain: "t.example.com",
      },
    ],
    productionAccessRequest: { status: "PENDING", caseId: "case-1" },
  },
  sms: { enabled: true, phoneNumbers: [] },
} as unknown as (typeof awsAccount.$inferInsert)["features"];

function buildRequest() {
  return new Request(
    `http://localhost/api/${ORG_SLUG}/aws/validate-infrastructure`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roleArn: ROLE_ARN,
        externalId: EXTERNAL_ID,
        region: "us-east-1",
        webhookSecret: "test-webhook-secret",
      }),
    }
  );
}

const context = { params: Promise.resolve({ orgSlug: ORG_SLUG }) };

async function readRow() {
  const [row] = await db
    .select()
    .from(awsAccount)
    .where(eq(awsAccount.organizationId, ORG_ID));
  if (!row) {
    throw new Error("row missing");
  }
  return row;
}

describe("aws/validate-infrastructure reconnect — real DB", () => {
  beforeAll(async () => {
    await db
      .insert(organization)
      .values({
        id: ORG_ID,
        name: "Reconnect Org",
        slug: ORG_SLUG,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  });

  beforeEach(async () => {
    await db.delete(awsAccount).where(eq(awsAccount.organizationId, ORG_ID));
    await db.insert(awsAccount).values({
      id: `reconnect-acct-${suffix}`,
      organizationId: ORG_ID,
      name: "Reconnect Account",
      accountId: ACCOUNT_ID,
      roleArn: ROLE_ARN,
      externalId: EXTERNAL_ID,
      region: "us-east-1",
      isVerified: true,
      emailEnabled: true,
      smsEnabled: true,
      features: seededFeatures,
    });
    findInfrastructureStack.mockReset();
    detectFeaturesFromOutputs.mockReset();
  });

  afterAll(async () => {
    await db.delete(awsAccount).where(eq(awsAccount.organizationId, ORG_ID));
    await db.delete(organization).where(eq(organization.id, ORG_ID));
  });

  it("keeps scanned features when the stack is detected", async () => {
    findInfrastructureStack.mockResolvedValue({
      stackName: "wraps-email",
      outputs: {},
    });
    detectFeaturesFromOutputs.mockReturnValue({
      configSetName: "wraps-email-new",
      eventTracking: true,
      historyStorage: false,
      archiving: false,
      smtp: false,
      tlsRequired: false,
      reputationMetrics: false,
    });
    const { POST } = await import(
      "../[orgSlug]/aws/validate-infrastructure/route"
    );

    const response = await POST(buildRequest(), context);
    expect(response.status).toBe(200);

    const row = await readRow();
    const seededEmail = seededFeatures?.email;
    expect(row.features?.sms).toEqual(seededFeatures?.sms);
    expect(row.features?.email?.sandbox).toBe(true);
    expect(row.features?.email?.identities).toEqual(seededEmail?.identities);
    expect(row.features?.email?.trackingBySet).toEqual(
      seededEmail?.trackingBySet
    );
    expect(row.features?.email?.productionAccessRequest).toEqual(
      seededEmail?.productionAccessRequest
    );
    expect(row.features?.email?.configSetName).toBe("wraps-email-new");
    expect(row.features?.email?.archivingEnabled).toBe(false);
    expect(row.features?.email?.archiveArn).toBe(ARCHIVE_ARN);
    expect(row.emailEnabled).toBe(true);
    expect(row.smsEnabled).toBe(true);
  });

  it("keeps features and emailEnabled when no stack is found", async () => {
    findInfrastructureStack.mockResolvedValue(null);
    const { POST } = await import(
      "../[orgSlug]/aws/validate-infrastructure/route"
    );

    const response = await POST(buildRequest(), context);
    expect(response.status).toBe(200);

    const row = await readRow();
    expect(row.features).toEqual(seededFeatures);
    expect(row.emailEnabled).toBe(true);
  });
});
