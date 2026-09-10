/**
 * Products status API - the overview banner's SMS "Action required" probe.
 *
 * The route used to probe `getSMSPhoneNumbers` for every AWS account
 * regardless of whether the org ever enabled SMS. Both role-provisioning
 * paths (CLI `update-role.ts`, the CloudFormation template) omit sms-voice
 * permissions when the customer never asked for SMS, so on an email-only
 * account the resulting AccessDeniedException was the designed steady
 * state, not a role that needs updating — but the route read it as
 * `needsRoleUpdate: true`, which promoted the whole dashboard banner to
 * "Action required" with no way for the customer to clear it.
 *
 * These run against a real Neon branch and seed real `awsAccount` rows
 * because the fix is a property of which accounts get probed, not of the
 * response shape — a mocked query builder could not distinguish "probed and
 * the result was swallowed" from "never probed at all".
 */

import { awsAccount, db, organization } from "@wraps/db";
import { eq, inArray } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

const TEST_PREFIX = "products-status-db";

const ORG_ID = `${TEST_PREFIX}-org`;
const ORG_SLUG = `${TEST_PREFIX}-org-slug`;
const SMS_ORG_ID = `${TEST_PREFIX}-sms-org`;
const SMS_ORG_SLUG = `${TEST_PREFIX}-sms-org-slug`;
const BOTH_ORG_ID = `${TEST_PREFIX}-both-org`;
const BOTH_ORG_SLUG = `${TEST_PREFIX}-both-org-slug`;

const EMAIL_ONLY_ACCOUNT = `${TEST_PREFIX}-acct-email-only`;
const SMS_ACCOUNT = `${TEST_PREFIX}-acct-sms`;
const BOTH_EMAIL_ONLY_ACCOUNT = `${TEST_PREFIX}-acct-both-email-only`;
const BOTH_SMS_ACCOUNT = `${TEST_PREFIX}-acct-both-sms`;

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: "user-1", email: "test@example.com", name: "Test" },
      })),
    },
  },
}));

vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: vi.fn(async (slug: string) => {
    if (slug === ORG_SLUG) {
      return { id: ORG_ID, name: "Products Status Org", slug: ORG_SLUG };
    }
    if (slug === SMS_ORG_SLUG) {
      return {
        id: SMS_ORG_ID,
        name: "Products Status SMS Org",
        slug: SMS_ORG_SLUG,
      };
    }
    if (slug === BOTH_ORG_SLUG) {
      return {
        id: BOTH_ORG_ID,
        name: "Products Status Both Org",
        slug: BOTH_ORG_SLUG,
      };
    }
    return null;
  }),
}));

vi.mock("@/lib/logger", () => ({
  createRequestLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
  serializeError: (e: unknown) => e,
}));

const mockGetSMSPhoneNumbers = vi.fn();
vi.mock("@/lib/aws/sms-voice", () => ({
  getSMSPhoneNumbers: (id: string) => mockGetSMSPhoneNumbers(id),
}));

const mockQueryEmailEvents = vi.fn();
vi.mock("@/lib/aws/dynamodb", () => ({
  queryEmailEvents: (args: unknown) => mockQueryEmailEvents(args),
}));

async function callProducts(orgSlug: string) {
  const { GET } = await import("../[orgSlug]/products/route");
  const response = await GET(
    new Request(`http://localhost/api/${orgSlug}/products`),
    { params: Promise.resolve({ orgSlug }) }
  );
  return { response, body: await response.json() };
}

/** The exact production error that produced the false "Action required" banner. */
function accessDeniedError() {
  return Object.assign(
    new Error(
      "User: arn:aws:sts::111122223333:assumed-role/wraps-console-access-role/session is not authorized to perform: sms-voice:DescribePhoneNumbers"
    ),
    { name: "AccessDeniedException" }
  );
}

beforeAll(async () => {
  await db
    .insert(organization)
    .values([
      {
        id: ORG_ID,
        name: "Products Status Org",
        slug: ORG_SLUG,
        createdAt: new Date(),
        logo: null,
        metadata: null,
      },
      {
        id: SMS_ORG_ID,
        name: "Products Status SMS Org",
        slug: SMS_ORG_SLUG,
        createdAt: new Date(),
        logo: null,
        metadata: null,
      },
      {
        id: BOTH_ORG_ID,
        name: "Products Status Both Org",
        slug: BOTH_ORG_SLUG,
        createdAt: new Date(),
        logo: null,
        metadata: null,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(awsAccount)
    .values([
      {
        id: EMAIL_ONLY_ACCOUNT,
        organizationId: ORG_ID,
        name: "Email Only",
        accountId: "111122223333",
        region: "us-east-1",
        roleArn: "arn:aws:iam::111122223333:role/wraps",
        externalId: `${TEST_PREFIX}-ext-email-only`,
        emailEnabled: true,
        smsEnabled: false,
      },
      {
        id: SMS_ACCOUNT,
        organizationId: SMS_ORG_ID,
        name: "SMS Enabled",
        accountId: "222233334444",
        region: "us-east-1",
        roleArn: "arn:aws:iam::222233334444:role/wraps",
        externalId: `${TEST_PREFIX}-ext-sms`,
        emailEnabled: true,
        smsEnabled: true,
      },
      {
        id: BOTH_EMAIL_ONLY_ACCOUNT,
        organizationId: BOTH_ORG_ID,
        name: "Both Org - Email Only",
        accountId: "333344445555",
        region: "us-east-1",
        roleArn: "arn:aws:iam::333344445555:role/wraps",
        externalId: `${TEST_PREFIX}-ext-both-email-only`,
        emailEnabled: true,
        smsEnabled: false,
      },
      {
        id: BOTH_SMS_ACCOUNT,
        organizationId: BOTH_ORG_ID,
        name: "Both Org - SMS Enabled",
        accountId: "444455556666",
        region: "us-east-1",
        roleArn: "arn:aws:iam::444455556666:role/wraps",
        externalId: `${TEST_PREFIX}-ext-both-sms`,
        emailEnabled: true,
        smsEnabled: true,
      },
    ])
    .onConflictDoNothing();
});

afterAll(async () => {
  await db
    .delete(awsAccount)
    .where(
      inArray(awsAccount.organizationId, [ORG_ID, SMS_ORG_ID, BOTH_ORG_ID])
    );
  await db
    .delete(organization)
    .where(inArray(organization.id, [ORG_ID, SMS_ORG_ID, BOTH_ORG_ID]));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockQueryEmailEvents.mockResolvedValue([]);
});

describe("Products status API - SMS probe gating", () => {
  it("does not probe SMS on an account that never enabled SMS", async () => {
    const { response } = await callProducts(ORG_SLUG);

    expect(response.status).toBe(200);
    expect(mockGetSMSPhoneNumbers).not.toHaveBeenCalled();
  });

  it("reports no role update for an email-only org even when SMS reads are denied", async () => {
    // The exact production error: an account that never enabled SMS gets
    // AccessDeniedException from sms-voice because the role was never
    // granted those permissions. That is expected, not a fault.
    mockGetSMSPhoneNumbers.mockRejectedValue(accessDeniedError());

    const { response, body } = await callProducts(ORG_SLUG);

    expect(response.status).toBe(200);
    const smsProduct = body.products.find(
      (p: { id: string }) => p.id === "sms"
    );
    expect(smsProduct.needsRoleUpdate).toBe(false);
  });

  it("still reports a role update when SMS is enabled and the read is denied", async () => {
    mockGetSMSPhoneNumbers.mockRejectedValue(accessDeniedError());

    const { response, body } = await callProducts(SMS_ORG_SLUG);

    expect(response.status).toBe(200);
    const smsProduct = body.products.find(
      (p: { id: string }) => p.id === "sms"
    );
    expect(smsProduct.needsRoleUpdate).toBe(true);
    expect(mockGetSMSPhoneNumbers).toHaveBeenCalledWith(SMS_ACCOUNT);
  });

  it("probes only the SMS-enabled account when an org has both", async () => {
    mockGetSMSPhoneNumbers.mockRejectedValue(accessDeniedError());
    // checkEmailInfrastructure returns as soon as one account succeeds, so
    // force every account to fail with a non-matching ("no infrastructure
    // here") error - that is the only way to observe it walking every
    // account in `accountIds`, which is what proves the email probe stayed
    // unconditional while the SMS probe did not.
    mockQueryEmailEvents.mockRejectedValue(new Error("no table for account"));

    const { response } = await callProducts(BOTH_ORG_SLUG);

    expect(response.status).toBe(200);
    expect(mockGetSMSPhoneNumbers).toHaveBeenCalledTimes(1);
    expect(mockGetSMSPhoneNumbers).toHaveBeenCalledWith(BOTH_SMS_ACCOUNT);
    const emailProbedIds = mockQueryEmailEvents.mock.calls.map(
      (call) => (call[0] as { awsAccountId: string }).awsAccountId
    );
    expect(emailProbedIds).toContain(BOTH_EMAIL_ONLY_ACCOUNT);
    expect(emailProbedIds).toContain(BOTH_SMS_ACCOUNT);
  });
});
