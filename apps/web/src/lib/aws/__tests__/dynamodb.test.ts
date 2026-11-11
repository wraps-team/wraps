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

import {
  aggregateEmailEngagementMetrics,
  getEmailEngagementMetrics,
  getRecentEmailActivity,
  queryEmailEvents,
  queryEventsByMessageIds,
} from "../dynamodb";

type WhereCallback = (
  columns: { id: string; organizationId: string },
  operators: {
    eq: (column: string, value: string) => unknown;
    and: (...conditions: unknown[]) => unknown;
  }
) => unknown;

/**
 * Evaluate the `where` callback the helper passed to `findFirst` with stub
 * columns and recording operators, so the test sees which columns the real
 * query compares (the mocked `findFirst` never evaluates it).
 */
function evaluateAccountWhere(): unknown {
  const { where } = mockFindFirst.mock.calls[0][0] as { where: WhereCallback };
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

describe("dynamodb account lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockResolvedValue(null);
  });

  it.each([
    ["queryEmailEvents", () => queryEmailEvents({ ...ids, ...timeWindow })],
    [
      "getEmailEngagementMetrics",
      () => getEmailEngagementMetrics({ ...ids, ...timeWindow }),
    ],
    ["getRecentEmailActivity", () => getRecentEmailActivity(ids)],
  ])(
    "%s scopes the account lookup by id and organization",
    async (_name, call) => {
      await expect(call()).rejects.toThrow("AWS account not found");

      expect(mockFindFirst).toHaveBeenCalledTimes(1);
      expect(evaluateAccountWhere()).toEqual(SCOPED_WHERE);
      expect(mockGetOrAssumeRole).not.toHaveBeenCalled();
    }
  );

  it("queryEventsByMessageIds scopes the account lookup and returns no events when it misses", async () => {
    // An empty messageIds list returns before the lookup, so pass one id.
    await expect(
      queryEventsByMessageIds({ ...ids, messageIds: ["msg-1"] })
    ).resolves.toEqual([]);

    expect(mockFindFirst).toHaveBeenCalledTimes(1);
    expect(evaluateAccountWhere()).toEqual(SCOPED_WHERE);
    expect(mockGetOrAssumeRole).not.toHaveBeenCalled();
  });
});

type EmailEvent = Parameters<typeof aggregateEmailEngagementMetrics>[0][number];

function createEvent(overrides: Partial<EmailEvent> = {}): EmailEvent {
  return {
    messageId: "msg-1",
    sentAt: 1000,
    accountId: "acc-1",
    from: "sender@example.com",
    to: ["recipient@example.com"],
    subject: "Test subject",
    eventType: "Send",
    eventData: "{}",
    createdAt: 1000,
    expiresAt: 9_999_999,
    ...overrides,
  };
}

describe("aggregateEmailEngagementMetrics", () => {
  it("does not count a bot open when it is the first event for a message", () => {
    const metrics = aggregateEmailEngagementMetrics([
      createEvent({
        eventType: "Open",
        additionalData: JSON.stringify({
          userAgent: "Barracuda/5.0",
          ipAddress: "1.2.3.4",
        }),
      }),
      createEvent({
        eventType: "Delivery",
        createdAt: 1100,
        sentAt: 1100,
      }),
    ]);

    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      messageId: "msg-1",
      opens: 0,
      clicks: 0,
      hasDelivered: true,
      hasBounced: false,
      hasComplaint: false,
    });
    expect(metrics[0].eventTypes).toEqual(["Open", "Delivery"]);
  });

  it("ignores later bot opens while still counting real opens and clicks", () => {
    const metrics = aggregateEmailEngagementMetrics([
      createEvent({ eventType: "Delivery" }),
      createEvent({
        eventType: "Open",
        createdAt: 1100,
        sentAt: 1100,
        additionalData: JSON.stringify({
          userAgent: "Mozilla/5.0 Proofpoint URL Defense",
          ipAddress: "1.2.3.4",
        }),
      }),
      createEvent({
        eventType: "Open",
        createdAt: 1200,
        sentAt: 1200,
        additionalData: JSON.stringify({
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
          ipAddress: "203.0.113.42",
        }),
      }),
      createEvent({
        eventType: "Click",
        createdAt: 1300,
        sentAt: 1300,
      }),
    ]);

    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      opens: 1,
      clicks: 1,
      hasDelivered: true,
    });
    expect(metrics[0].eventTypes).toEqual(["Delivery", "Open", "Click"]);
  });

  it("counts Gmail and Yahoo image proxy opens as real opens", () => {
    const metrics = aggregateEmailEngagementMetrics([
      createEvent({ eventType: "Delivery" }),
      createEvent({
        eventType: "Open",
        createdAt: 1100,
        sentAt: 1100,
        additionalData: JSON.stringify({
          userAgent:
            "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)",
          ipAddress: "1.2.3.4",
        }),
      }),
      createEvent({
        eventType: "Open",
        createdAt: 1200,
        sentAt: 1200,
        additionalData: JSON.stringify({
          userAgent:
            "YahooMailProxy; https://help.yahoo.com/kb/yahoo-mail-proxy-SLN28749.html",
          ipAddress: "5.6.7.8",
        }),
      }),
    ]);

    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      opens: 2,
      hasDelivered: true,
    });
  });
});
