/**
 * sms-voice - the AWS account lookup is scoped by organization.
 *
 * Every helper here loads the AWS account row before assuming its role. A
 * lookup by id alone would let a caller holding another org's account id read
 * that org's SMS data, so each one must match on id AND organizationId.
 *
 * The mocked `findFirst` never evaluates its `where`, and returning `null`
 * alone proves nothing, so these tests capture the `where` callback and
 * evaluate it with stub columns and recording operators.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindFirst = vi.fn();
vi.mock("@wraps/db", () => ({
  db: {
    query: {
      awsAccount: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
  },
}));

const mockGetOrAssumeRole = vi.fn();
vi.mock("../credential-cache", () => ({
  getOrAssumeRole: (...args: unknown[]) => mockGetOrAssumeRole(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import {
  getRecentSMSActivity,
  getSMSAccountAttributes,
  getSMSCloudWatchMetrics,
  getSMSConfigurationSets,
  getSMSMetricsSummary,
  getSMSPhoneNumbers,
  getSMSRegistrations,
  getSMSSpendLimits,
  querySMSEvents,
  SMS_METRICS,
} from "../sms-voice";

type WhereCallback = (
  columns: { id: string; organizationId: string },
  operators: {
    eq: (column: string, value: string) => unknown;
    and: (...conditions: unknown[]) => unknown;
  }
) => unknown;

/**
 * Evaluate the `where` callback of the nth `findFirst` call with stub columns
 * and recording operators, so the test sees which columns the real query
 * compares.
 */
function evaluateAccountWhere(callIndex = 0): unknown {
  const { where } = mockFindFirst.mock.calls[callIndex][0] as {
    where: WhereCallback;
  };
  return where(
    { id: "col:id", organizationId: "col:org" },
    {
      eq: (column, value) => ["eq", column, value],
      and: (...conditions) => ["and", ...conditions],
    }
  );
}

const SCOPED_WHERE = [
  "and",
  ["eq", "col:id", "acc-1"],
  ["eq", "col:org", "org-1"],
];

const ids = { awsAccountId: "acc-1", organizationId: "org-1" };
const timeWindow = {
  startTime: new Date("2026-11-01T00:00:00.000Z"),
  endTime: new Date("2026-11-02T00:00:00.000Z"),
};

const lookups: Array<[string, () => Promise<unknown>]> = [
  [
    "getSMSCloudWatchMetrics",
    () =>
      getSMSCloudWatchMetrics({
        ...ids,
        ...timeWindow,
        metric: SMS_METRICS.TEXT_MESSAGE_PARTS_DELIVERED,
        period: 3600,
      }),
  ],
  ["getSMSAccountAttributes", () => getSMSAccountAttributes(ids)],
  ["getSMSSpendLimits", () => getSMSSpendLimits(ids)],
  ["getSMSPhoneNumbers", () => getSMSPhoneNumbers(ids)],
  ["getSMSConfigurationSets", () => getSMSConfigurationSets(ids)],
  ["getSMSRegistrations", () => getSMSRegistrations(ids)],
  ["querySMSEvents", () => querySMSEvents({ ...ids, ...timeWindow })],
  ["getRecentSMSActivity", () => getRecentSMSActivity(ids)],
];

describe("sms-voice account lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockResolvedValue(null);
  });

  it.each(lookups)(
    "%s scopes the account lookup by id and organization",
    async (_name, call) => {
      await expect(call()).rejects.toThrow("AWS account not found");

      expect(mockFindFirst).toHaveBeenCalledTimes(1);
      expect(evaluateAccountWhere()).toEqual(SCOPED_WHERE);
      // Not found stops before any role is assumed.
      expect(mockGetOrAssumeRole).not.toHaveBeenCalled();
    }
  );

  it("getSMSMetricsSummary scopes every metric's account lookup", async () => {
    await expect(
      getSMSMetricsSummary({ ...ids, ...timeWindow })
    ).rejects.toThrow("AWS account not found");

    expect(mockFindFirst).toHaveBeenCalledTimes(4);
    for (let call = 0; call < 4; call++) {
      expect(evaluateAccountWhere(call)).toEqual(SCOPED_WHERE);
    }
    expect(mockGetOrAssumeRole).not.toHaveBeenCalled();
  });
});
