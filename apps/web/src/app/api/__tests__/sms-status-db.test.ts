/**
 * SMS status API - which AWS accounts get their sms-voice resources described.
 *
 * The route described phone numbers, registrations and spend limits on every
 * AWS account in the org. Both role-provisioning paths omit sms-voice
 * permissions when the customer never asked for SMS, so on an email-only
 * account every one of those reads fails with AccessDeniedException, and
 * `getSMSRegistrations` / `getSMSSpendLimits` report each failure to Sentry.
 * Opening the SMS analytics page on an email-only org therefore filed
 * errors for a designed steady state. The products route had the same gap
 * and gates on `awsAccount.smsEnabled`; this route now does too.
 *
 * Real DB because the fix is a property of which seeded accounts get probed.
 */

import { awsAccount, db, organization } from "@wraps/db";
import { inArray } from "drizzle-orm";
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

const TEST_PREFIX = "sms-status-db";

const EMAIL_ORG_ID = `${TEST_PREFIX}-email-org`;
const EMAIL_ORG_SLUG = `${TEST_PREFIX}-email-org-slug`;
const BOTH_ORG_ID = `${TEST_PREFIX}-both-org`;
const BOTH_ORG_SLUG = `${TEST_PREFIX}-both-org-slug`;

const EMAIL_ONLY_ACCOUNT = `${TEST_PREFIX}-acct-email-only`;
const BOTH_EMAIL_ONLY_ACCOUNT = `${TEST_PREFIX}-acct-both-email-only`;
const BOTH_SMS_ACCOUNT = `${TEST_PREFIX}-acct-both-sms`;

const ORGS: Record<string, string> = {
  [EMAIL_ORG_SLUG]: EMAIL_ORG_ID,
  [BOTH_ORG_SLUG]: BOTH_ORG_ID,
};

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
  getOrganizationWithMembership: vi.fn(async (slug: string) =>
    ORGS[slug] ? { id: ORGS[slug], name: slug, slug } : null
  ),
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
const mockGetSMSRegistrations = vi.fn();
const mockGetSMSSpendLimits = vi.fn();
vi.mock("@/lib/aws/sms-voice", () => ({
  getSMSPhoneNumbers: (...args: unknown[]) => mockGetSMSPhoneNumbers(...args),
  getSMSRegistrations: (...args: unknown[]) => mockGetSMSRegistrations(...args),
  getSMSSpendLimits: (...args: unknown[]) => mockGetSMSSpendLimits(...args),
}));

async function callStatus(orgSlug: string) {
  const { GET } = await import("../[orgSlug]/analytics/sms/status/route");
  const response = await GET(
    new Request(`http://localhost/api/${orgSlug}/analytics/sms/status`),
    { params: Promise.resolve({ orgSlug }) }
  );
  return { response, body: await response.json() };
}

function account(
  id: string,
  organizationId: string,
  accountId: string,
  smsEnabled: boolean
) {
  return {
    id,
    organizationId,
    name: id,
    accountId,
    region: "eu-central-1",
    roleArn: `arn:aws:iam::${accountId}:role/wraps-console-access-role`,
    externalId: `${id}-ext`,
    emailEnabled: true,
    smsEnabled,
  };
}

beforeAll(async () => {
  await db
    .insert(organization)
    .values(
      Object.entries(ORGS).map(([slug, id]) => ({
        id,
        name: slug,
        slug,
        createdAt: new Date(),
        logo: null,
        metadata: null,
      }))
    )
    .onConflictDoNothing();

  await db
    .insert(awsAccount)
    .values([
      account(EMAIL_ONLY_ACCOUNT, EMAIL_ORG_ID, "111122223333", false),
      account(BOTH_EMAIL_ONLY_ACCOUNT, BOTH_ORG_ID, "222233334444", false),
      account(BOTH_SMS_ACCOUNT, BOTH_ORG_ID, "333344445555", true),
    ])
    .onConflictDoNothing();
});

afterAll(async () => {
  await db
    .delete(awsAccount)
    .where(inArray(awsAccount.organizationId, Object.values(ORGS)));
  await db
    .delete(organization)
    .where(inArray(organization.id, Object.values(ORGS)));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSMSPhoneNumbers.mockResolvedValue([]);
  mockGetSMSRegistrations.mockResolvedValue([]);
  mockGetSMSSpendLimits.mockResolvedValue([]);
});

describe("SMS status API - SMS probe gating", () => {
  it("does not describe sms-voice resources on an account that never enabled SMS", async () => {
    const { response, body } = await callStatus(EMAIL_ORG_SLUG);

    expect(response.status).toBe(200);
    expect(mockGetSMSPhoneNumbers).not.toHaveBeenCalled();
    expect(mockGetSMSRegistrations).not.toHaveBeenCalled();
    expect(mockGetSMSSpendLimits).not.toHaveBeenCalled();
    expect(body).toEqual({
      phoneNumbers: [],
      registrations: [],
      spendLimits: [],
      hasSMSInfrastructure: false,
    });
  });

  it("describes only the SMS-enabled account when an org has both, scoped by the session org", async () => {
    mockGetSMSPhoneNumbers.mockResolvedValue([
      { PhoneNumber: "+15555550100", PhoneNumberArn: "arn:phone" },
    ]);

    const { response, body } = await callStatus(BOTH_ORG_SLUG);

    expect(response.status).toBe(200);
    for (const probe of [
      mockGetSMSPhoneNumbers,
      mockGetSMSRegistrations,
      mockGetSMSSpendLimits,
    ]) {
      expect(probe).toHaveBeenCalledTimes(1);
      // BOTH_ORG_ID is what the membership mock resolves BOTH_ORG_SLUG to, and
      // the org the route filtered the seeded accounts by.
      expect(probe).toHaveBeenCalledWith({
        awsAccountId: BOTH_SMS_ACCOUNT,
        organizationId: BOTH_ORG_ID,
      });
    }
    expect(body.hasSMSInfrastructure).toBe(true);
    expect(body.phoneNumbers).toHaveLength(1);
    expect(body.phoneNumbers[0].phoneNumber).toBe("+15555550100");
  });
});
