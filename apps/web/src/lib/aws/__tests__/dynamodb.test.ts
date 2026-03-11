import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindFirst = vi.fn();
const mockGetOrAssumeRole = vi.fn();
const mockDocumentFrom = vi.fn();
const mockDocumentSend = vi.fn();

vi.mock("@wraps/db", () => ({
  db: {
    query: {
      awsAccount: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
  },
}));

vi.mock("../credential-cache", () => ({
  getOrAssumeRole: (...args: unknown[]) => mockGetOrAssumeRole(...args),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(function (
    this: { config: unknown },
    config: unknown
  ) {
    this.config = config;
  }),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: (...args: unknown[]) => mockDocumentFrom(...args),
  },
  QueryCommand: vi.fn(function (this: { input: unknown }, input: unknown) {
    this.input = input;
  }),
}));

import { getEmailEngagementMetrics, queryEmailEvents } from "../dynamodb";

type MockEmailEvent = {
  messageId: string;
  sentAt: number;
  accountId: string;
  from: string;
  to: string[] | Set<string>;
  subject: string;
  eventType: string;
  eventData: string;
  additionalData?: string;
  createdAt: number;
  expiresAt: number;
};

function createEvent(overrides: Partial<MockEmailEvent> = {}): MockEmailEvent {
  return {
    messageId: "msg-1",
    sentAt: 1_000,
    accountId: "123456789012",
    from: "sender@example.com",
    to: ["recipient@example.com"],
    subject: "Test email",
    eventType: "Send",
    eventData: "{}",
    createdAt: 1_000,
    expiresAt: 9_999_999,
    ...overrides,
  };
}

describe("dynamodb email history helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockFindFirst.mockResolvedValue({
      id: "aws-account-1",
      accountId: "123456789012",
      roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
      externalId: "external-id",
      region: "us-east-1",
    });

    mockGetOrAssumeRole.mockResolvedValue({
      accessKeyId: "AKIA_TEST",
      secretAccessKey: "secret",
      sessionToken: "token",
    });

    mockDocumentFrom.mockReturnValue({
      send: mockDocumentSend,
    });
  });

  it("normalizes DynamoDB string sets into recipient arrays", async () => {
    mockDocumentSend.mockResolvedValue({
      Items: [
        createEvent({
          to: new Set(["first@example.com", "second@example.com"]),
        }),
      ],
    });

    const events = await queryEmailEvents({
      awsAccountId: "aws-account-1",
      startTime: new Date("2026-03-09T00:00:00Z"),
      endTime: new Date("2026-03-10T00:00:00Z"),
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.to).toEqual(["first@example.com", "second@example.com"]);
  });

  it("filters bot opens out of engagement metrics while keeping real opens", async () => {
    mockDocumentSend.mockResolvedValue({
      Items: [
        createEvent({
          messageId: "msg-bot",
          eventType: "Delivery",
          sentAt: 1_000,
          createdAt: 1_001,
        }),
        createEvent({
          messageId: "msg-bot",
          eventType: "Open",
          sentAt: 1_000,
          createdAt: 1_002,
          additionalData: JSON.stringify({
            ipAddress: "1.2.3.4",
          }),
        }),
        createEvent({
          messageId: "msg-real",
          eventType: "Delivery",
          sentAt: 2_000,
          createdAt: 2_001,
        }),
        createEvent({
          messageId: "msg-real",
          eventType: "Open",
          sentAt: 2_000,
          createdAt: 2_002,
          additionalData: JSON.stringify({
            userAgent:
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
            ipAddress: "203.0.113.42",
          }),
        }),
      ],
    });

    const metrics = await getEmailEngagementMetrics({
      awsAccountId: "aws-account-1",
      startTime: new Date("2026-03-09T00:00:00Z"),
      endTime: new Date("2026-03-10T00:00:00Z"),
    });

    expect(metrics).toHaveLength(2);
    expect(metrics.map((entry) => entry.messageId)).toEqual([
      "msg-real",
      "msg-bot",
    ]);
    expect(metrics[0]?.opens).toBe(1);
    expect(metrics[0]?.hasDelivered).toBe(true);
    expect(metrics[1]?.opens).toBe(0);
    expect(metrics[1]?.hasDelivered).toBe(true);
    expect(metrics[1]?.eventTypes).toContain("Open");
  });
});
