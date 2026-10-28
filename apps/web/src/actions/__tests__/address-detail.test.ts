/**
 * Address detail actions without a database: auth and org scope, input
 * rejection, the AWS account scope check, the query-failure copy, and the
 * rule that no log line carries an address.
 *
 * The db module is replaced with fakes, so this runs with no DATABASE_URL.
 * The real-database cases live in address-detail-db.test.ts.
 */

import { DrizzleQueryError } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const log = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
  return {
    log,
    verifyOrgAccess: vi.fn(),
    selectQueue: [] as unknown[][],
    awsAccountFindFirst: vi.fn(),
    queryAddressSendTotals: vi.fn(),
    queryAddressProblemSends: vi.fn(),
    queryProblemAddresses: vi.fn(),
    queryProblemAddressTotals: vi.fn(),
    findContactByEmailHash: vi.fn(),
  };
});

vi.mock("@/actions/shared/verify-org-access", () => ({
  verifyOrgAccess: (...args: unknown[]) => mocks.verifyOrgAccess(...args),
}));

vi.mock("@/lib/logger", () => ({
  createActionLogger: () => mocks.log,
  logger: mocks.log,
  createRequestLogger: () => mocks.log,
  serializeError: (err: unknown) => ({ name: String(err) }),
}));

vi.mock("@/lib/audit", () => ({
  auditLogEntry: vi.fn(),
  getAuditContext: vi.fn(),
}));

vi.mock("@/lib/plan-limits", () => ({
  getOrganizationPlan: vi.fn(async () => "free"),
  checkFeatureAccess: vi.fn(async () => ({ allowed: true })),
}));

vi.mock("@wraps/db", () => {
  // A chainable select: every builder method returns the chain, and awaiting
  // it resolves the next queued result (or an empty list).
  const chain = () => {
    const builder: Record<string, unknown> = {};
    for (const method of ["from", "where", "limit", "orderBy"]) {
      builder[method] = () => builder;
    }
    builder.then = (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(mocks.selectQueue.shift() ?? []).then(resolve, reject);
    return builder;
  };
  return {
    db: {
      select: () => chain(),
      query: { awsAccount: { findFirst: mocks.awsAccountFindFirst } },
    },
    auditLog: { organizationId: "audit.organizationId" },
    awsAccount: { id: "aws.id", organizationId: "aws.organizationId" },
    contact: { id: "c.id", organizationId: "c.organizationId" },
    user: { id: "u.id" },
    and: (...args: unknown[]) => args,
    eq: (...args: unknown[]) => args,
    desc: (...args: unknown[]) => args,
    hashContactValue: (value: string) => `hash:${value}`,
    findContactByEmailHash: (...args: unknown[]) =>
      mocks.findContactByEmailHash(...args),
    queryAddressSendTotals: (...args: unknown[]) =>
      mocks.queryAddressSendTotals(...args),
    queryAddressProblemSends: (...args: unknown[]) =>
      mocks.queryAddressProblemSends(...args),
    queryProblemAddresses: (...args: unknown[]) =>
      mocks.queryProblemAddresses(...args),
    queryProblemAddressTotals: (...args: unknown[]) =>
      mocks.queryProblemAddressTotals(...args),
  };
});

import { getAddressDetail, listProblemAddresses } from "../address-detail";
import { UNAUTHORIZED } from "../shared/org-action";

const ORG = "address-s2-org-unit";
const MEMBER = {
  userId: "address-s2-user",
  userEmail: "member@example.com",
  userName: "Member",
  role: "member",
  orgSlug: "address-s2-org",
};

const ADDRESS = "Secret.Person@Example.com";

function allLogText(): string {
  return JSON.stringify(mocks.log.error.mock.calls);
}

function emptyProblemDefaults() {
  mocks.queryAddressSendTotals.mockResolvedValue({
    sends: 0,
    bounces: 0,
    complaints: 0,
    suppressed: 0,
  });
  mocks.queryAddressProblemSends.mockResolvedValue([]);
  mocks.findContactByEmailHash.mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectQueue.length = 0;
  mocks.verifyOrgAccess.mockResolvedValue(MEMBER);
  mocks.awsAccountFindFirst.mockResolvedValue(undefined);
  emptyProblemDefaults();
  mocks.queryProblemAddresses.mockResolvedValue([]);
  mocks.queryProblemAddressTotals.mockResolvedValue({
    bounces: 0,
    complaints: 0,
    suppressed: 0,
    uniqueAddresses: 0,
  });
});

describe("getAddressDetail", () => {
  it("returns UNAUTHORIZED for a caller with no membership in the org", async () => {
    mocks.verifyOrgAccess.mockResolvedValue(null);
    const result = await getAddressDetail(ORG, { address: ADDRESS });
    expect(result).toEqual({ success: false, error: UNAUTHORIZED });
    expect(mocks.queryAddressSendTotals).not.toHaveBeenCalled();
  });

  it("rejects an input with no @ before any query runs", async () => {
    const result = await getAddressDetail(ORG, { address: "   " });
    expect(result).toEqual({
      success: false,
      error: "Enter an email address.",
    });
    expect(mocks.queryAddressSendTotals).not.toHaveBeenCalled();
  });

  it("returns AWS account not found for an account outside the org", async () => {
    mocks.awsAccountFindFirst.mockResolvedValue(undefined);
    const result = await getAddressDetail(ORG, {
      address: ADDRESS,
      suppressedAwsAccountId: "aws-from-another-org",
    });
    expect(result).toEqual({
      success: false,
      error: "AWS account not found",
    });
    expect(mocks.queryAddressSendTotals).not.toHaveBeenCalled();
  });

  it("returns the error copy on query failure", async () => {
    mocks.queryAddressSendTotals.mockRejectedValue(new Error("boom"));
    const result = await getAddressDetail(ORG, { address: ADDRESS });
    expect(result).toEqual({
      success: false,
      error: "Could not load this address. Try again.",
    });
  });

  it("does not log the address when a query fails", async () => {
    const cause = Object.assign(new Error("duplicate key"), { code: "23505" });
    mocks.queryAddressProblemSends.mockRejectedValue(
      new DrizzleQueryError(
        'select "message_send"."id" from "message_send" where lower("message_send"."recipient") = lower($1)',
        [ADDRESS],
        cause
      )
    );
    await getAddressDetail(ORG, { address: ADDRESS });

    expect(mocks.log.error).toHaveBeenCalledTimes(1);
    const [fields] = mocks.log.error.mock.calls[0] ?? [];
    expect(fields).toEqual({
      errName: "DrizzleQueryError",
      code: "23505",
      action: "getAddressDetail",
    });
    expect(allLogText()).not.toContain("secret.person");
    expect(allLogText()).not.toContain("Secret.Person");
  });

  it("maps problem sends: ids, source name for a broadcast, and a complaint explanation", async () => {
    const sentAt = new Date("2026-10-20T10:00:00.000Z");
    mocks.queryAddressSendTotals.mockResolvedValue({
      sends: 2,
      bounces: 0,
      complaints: 1,
      suppressed: 0,
    });
    mocks.queryAddressProblemSends.mockResolvedValue([
      {
        id: "send-1",
        subject: "Hello",
        sourceType: "batch",
        sentAt,
        createdAt: sentAt,
        awsAccountId: null,
        bounceType: null,
        bounceSubType: null,
        bouncedAt: null,
        complainedAt: sentAt,
        suppressedAt: null,
        templateName: "Welcome",
        broadcastName: "October",
        workflowName: null,
      },
    ]);

    const result = await getAddressDetail(ORG, { address: ADDRESS });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.problemSends).toHaveLength(1);
    expect(result.problemSends[0]).toMatchObject({
      id: "send-1",
      sourceType: "batch",
      sourceName: "October",
      templateName: "Welcome",
      sentAt: sentAt.toISOString(),
      complainedAt: sentAt.toISOString(),
      problem: { kind: "complaint", headline: "Reported as spam" },
    });
    expect(result.lastProblemAt).toBe(sentAt.toISOString());
    expect(result.problemSendsHasMore).toBe(false);
  });

  it("shows at most 25 problem sends and sets problemSendsHasMore from the 26th row", async () => {
    const sentAt = new Date("2026-10-20T10:00:00.000Z");
    const row = {
      subject: null,
      sourceType: "transactional",
      sentAt,
      createdAt: sentAt,
      awsAccountId: null,
      bounceType: null,
      bounceSubType: null,
      bouncedAt: sentAt,
      complainedAt: null,
      suppressedAt: null,
      templateName: null,
      broadcastName: null,
      workflowName: null,
    };
    mocks.queryAddressProblemSends.mockResolvedValue(
      Array.from({ length: 26 }, (_, index) => ({
        ...row,
        id: `send-${index}`,
      }))
    );
    const result = await getAddressDetail(ORG, { address: ADDRESS });
    if (!result.success) {
      throw new Error("expected success");
    }
    expect(result.problemSends).toHaveLength(25);
    expect(result.problemSendsHasMore).toBe(true);
  });
});

describe("listProblemAddresses", () => {
  it("rejects a window over 90 days before any query runs", async () => {
    const result = await listProblemAddresses(ORG, {
      days: 91,
      day: null,
      tz: "UTC",
    });
    expect(result).toEqual({
      success: false,
      error: "days must be between 1 and 90",
    });
    expect(mocks.queryProblemAddresses).not.toHaveBeenCalled();
  });

  it("returns rows, totals and the exact distinct count", async () => {
    const last = new Date("2026-10-20T10:00:00.000Z");
    mocks.queryProblemAddresses.mockResolvedValue([
      {
        address: "a@example.com",
        complaints: 1,
        bounces: 0,
        suppressed: 0,
        lastProblemAt: last,
      },
    ]);
    mocks.queryProblemAddressTotals.mockResolvedValue({
      bounces: 3,
      complaints: 1,
      suppressed: 2,
      uniqueAddresses: 150,
    });
    const result = await listProblemAddresses(ORG, {
      days: 30,
      day: null,
      tz: "UTC",
    });
    expect(result).toEqual({
      success: true,
      rows: [
        {
          address: "a@example.com",
          complaints: 1,
          bounces: 0,
          suppressed: 0,
          lastProblemAt: last.toISOString(),
        },
      ],
      totals: { complaints: 1, bounces: 3, suppressed: 2 },
      uniqueAddresses: 150,
    });
  });

  it("returns the addresses error copy and logs no address on query failure", async () => {
    mocks.queryProblemAddresses.mockRejectedValue(
      new DrizzleQueryError(
        "select lower(recipient) ... where lower(recipient) = $1",
        [ADDRESS],
        Object.assign(new Error("timeout"), { code: "57014" })
      )
    );
    const result = await listProblemAddresses(ORG, {
      days: 30,
      day: null,
      tz: "UTC",
    });
    expect(result).toEqual({
      success: false,
      error: "Could not load addresses. Try again.",
    });
    expect(allLogText()).not.toContain("secret.person");
    expect(allLogText()).toContain("57014");
  });
});
