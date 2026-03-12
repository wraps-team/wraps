import { describe, expect, it } from "vitest";
import { aggregateEmailEngagementMetrics } from "../dynamodb";

type EmailEvent = Parameters<typeof aggregateEmailEngagementMetrics>[0][number];

function createEvent(overrides: Partial<EmailEvent> = {}): EmailEvent {
  return {
    messageId: "msg-1",
    sentAt: 1_000,
    accountId: "acc-1",
    from: "sender@example.com",
    to: ["recipient@example.com"],
    subject: "Test subject",
    eventType: "Send",
    eventData: "{}",
    createdAt: 1_000,
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
        createdAt: 1_100,
        sentAt: 1_100,
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
        createdAt: 1_100,
        sentAt: 1_100,
        additionalData: JSON.stringify({
          userAgent: "GoogleImageProxy",
          ipAddress: "1.2.3.4",
        }),
      }),
      createEvent({
        eventType: "Open",
        createdAt: 1_200,
        sentAt: 1_200,
        additionalData: JSON.stringify({
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
          ipAddress: "203.0.113.42",
        }),
      }),
      createEvent({
        eventType: "Click",
        createdAt: 1_300,
        sentAt: 1_300,
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
});
