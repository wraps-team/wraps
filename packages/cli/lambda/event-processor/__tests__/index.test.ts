import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import type { SQSEvent, SQSRecord } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handler } from "../index.js";

const dynamoMock = mockClient(DynamoDBClient);

/**
 * AWS SES Mailbox Simulator addresses for testing different scenarios
 * https://docs.aws.amazon.com/ses/latest/dg/send-an-email-from-console.html
 */
export const SES_SIMULATOR_ADDRESSES = {
  /** Successful delivery scenario */
  SUCCESS: "success@simulator.amazonses.com",
  /** Bounce scenario - generates SMTP 550 5.1.1 "Unknown User" response */
  BOUNCE: "bounce@simulator.amazonses.com",
  /** Out-of-office auto-response scenario */
  OOTO: "ooto@simulator.amazonses.com",
  /** Complaint scenario - recipient marks email as spam */
  COMPLAINT: "complaint@simulator.amazonses.com",
  /** Suppression list scenario - generates hard bounce */
  SUPPRESSION_LIST: "suppressionlist@simulator.amazonses.com",
} as const;

describe("Lambda Event Processor", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    dynamoMock.reset();
    process.env = {
      ...originalEnv,
      TABLE_NAME: "test-email-events",
      AWS_ACCOUNT_ID: "123456789012",
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should throw error if TABLE_NAME is not set", async () => {
    delete process.env.TABLE_NAME;

    const event: SQSEvent = {
      Records: [],
    };

    await expect(handler(event)).rejects.toThrow(
      "TABLE_NAME environment variable not set"
    );
  });

  describe("Send Event", () => {
    it("should process Send event successfully", async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const event: SQSEvent = {
        Records: [
          createSQSRecord({
            eventType: "Send",
            messageId: "test-message-id-123",
            timestamp: "2024-01-15T10:30:00.000Z",
            source: "sender@example.com",
            destination: [SES_SIMULATOR_ADDRESSES.SUCCESS],
            subject: "Test Email",
            tags: { campaign: "test" },
          }),
        ],
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(dynamoMock.calls()).toHaveLength(1);

      const putItemCall = dynamoMock.call(0).args[0].input;
      expect(putItemCall.TableName).toBe("test-email-events");
      expect(putItemCall.Item?.messageId.S).toBe("test-message-id-123");
      expect(putItemCall.Item?.eventType.S).toBe("Send");
      expect(putItemCall.Item?.from.S).toBe("sender@example.com");
      expect(putItemCall.Item?.to.SS).toEqual([
        SES_SIMULATOR_ADDRESSES.SUCCESS,
      ]);
    });
  });

  describe("Delivery Event", () => {
    it("should process Delivery event successfully", async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const event: SQSEvent = {
        Records: [
          createSQSRecord({
            eventType: "Delivery",
            messageId: "delivery-test-123",
            timestamp: "2024-01-15T10:30:00.000Z",
            source: "sender@example.com",
            destination: [SES_SIMULATOR_ADDRESSES.SUCCESS],
            subject: "Delivery Test",
            delivery: {
              timestamp: "2024-01-15T10:30:05.000Z",
              processingTimeMillis: 5000,
              recipients: [SES_SIMULATOR_ADDRESSES.SUCCESS],
              smtpResponse: "250 2.0.0 OK",
              remoteMtaIp: "192.0.2.1",
            },
          }),
        ],
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(dynamoMock.calls()).toHaveLength(1);

      const putItemCall = dynamoMock.call(0).args[0].input;
      expect(putItemCall.Item?.eventType.S).toBe("Delivery");

      const additionalData = JSON.parse(
        putItemCall.Item?.additionalData.S || "{}"
      );
      expect(additionalData.processingTimeMillis).toBe(5000);
      expect(additionalData.smtpResponse).toBe("250 2.0.0 OK");
    });
  });

  describe("Bounce Event - AWS Simulator", () => {
    it("should process Bounce event from simulator successfully", async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const event: SQSEvent = {
        Records: [
          createSQSRecord({
            eventType: "Bounce",
            messageId: "bounce-test-123",
            timestamp: "2024-01-15T10:30:00.000Z",
            source: "sender@example.com",
            destination: [SES_SIMULATOR_ADDRESSES.BOUNCE],
            subject: "Bounce Test",
            bounce: {
              bounceType: "Permanent",
              bounceSubType: "General",
              bouncedRecipients: [
                {
                  emailAddress: SES_SIMULATOR_ADDRESSES.BOUNCE,
                  action: "failed",
                  status: "5.1.1",
                  diagnosticCode: "smtp; 550 5.1.1 user unknown",
                },
              ],
              timestamp: "2024-01-15T10:30:05.000Z",
              feedbackId: "00000000-0000-0000-0000-000000000000",
            },
          }),
        ],
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(dynamoMock.calls()).toHaveLength(1);

      const putItemCall = dynamoMock.call(0).args[0].input;
      expect(putItemCall.Item?.eventType.S).toBe("Bounce");
      expect(putItemCall.Item?.to.SS).toEqual([SES_SIMULATOR_ADDRESSES.BOUNCE]);

      const additionalData = JSON.parse(
        putItemCall.Item?.additionalData.S || "{}"
      );
      expect(additionalData.bounceType).toBe("Permanent");
      expect(additionalData.bounceSubType).toBe("General");
      expect(additionalData.bouncedRecipients).toHaveLength(1);
      expect(additionalData.bouncedRecipients[0].emailAddress).toBe(
        SES_SIMULATOR_ADDRESSES.BOUNCE
      );
    });

    it("should handle transient bounce correctly", async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const event: SQSEvent = {
        Records: [
          createSQSRecord({
            eventType: "Bounce",
            messageId: "transient-bounce-123",
            timestamp: "2024-01-15T10:30:00.000Z",
            source: "sender@example.com",
            destination: [SES_SIMULATOR_ADDRESSES.BOUNCE],
            subject: "Transient Bounce Test",
            bounce: {
              bounceType: "Transient",
              bounceSubType: "MailboxFull",
              bouncedRecipients: [
                {
                  emailAddress: SES_SIMULATOR_ADDRESSES.BOUNCE,
                  action: "failed",
                  status: "4.2.2",
                  diagnosticCode: "smtp; 452 4.2.2 mailbox full",
                },
              ],
              timestamp: "2024-01-15T10:30:05.000Z",
              feedbackId: "transient-bounce-feedback",
            },
          }),
        ],
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const putItemCall = dynamoMock.call(0).args[0].input;
      const additionalData = JSON.parse(
        putItemCall.Item?.additionalData.S || "{}"
      );
      expect(additionalData.bounceType).toBe("Transient");
      expect(additionalData.bounceSubType).toBe("MailboxFull");
    });
  });

  describe("Complaint Event - AWS Simulator", () => {
    it("should process Complaint event from simulator successfully", async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const event: SQSEvent = {
        Records: [
          createSQSRecord({
            eventType: "Complaint",
            messageId: "complaint-test-123",
            timestamp: "2024-01-15T10:30:00.000Z",
            source: "sender@example.com",
            destination: [SES_SIMULATOR_ADDRESSES.COMPLAINT],
            subject: "Complaint Test",
            complaint: {
              complainedRecipients: [
                {
                  emailAddress: SES_SIMULATOR_ADDRESSES.COMPLAINT,
                },
              ],
              timestamp: "2024-01-15T10:35:00.000Z",
              feedbackId: "complaint-feedback-123",
              complaintFeedbackType: "abuse",
              userAgent: "Mozilla/5.0",
            },
          }),
        ],
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(dynamoMock.calls()).toHaveLength(1);

      const putItemCall = dynamoMock.call(0).args[0].input;
      expect(putItemCall.Item?.eventType.S).toBe("Complaint");
      expect(putItemCall.Item?.to.SS).toEqual([
        SES_SIMULATOR_ADDRESSES.COMPLAINT,
      ]);

      const additionalData = JSON.parse(
        putItemCall.Item?.additionalData.S || "{}"
      );
      expect(additionalData.complaintFeedbackType).toBe("abuse");
      expect(additionalData.complainedRecipients).toHaveLength(1);
      expect(additionalData.complainedRecipients[0].emailAddress).toBe(
        SES_SIMULATOR_ADDRESSES.COMPLAINT
      );
    });
  });

  describe("Suppression List Event - AWS Simulator", () => {
    it("should process suppression list bounce event", async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const event: SQSEvent = {
        Records: [
          createSQSRecord({
            eventType: "Bounce",
            messageId: "suppression-test-123",
            timestamp: "2024-01-15T10:30:00.000Z",
            source: "sender@example.com",
            destination: [SES_SIMULATOR_ADDRESSES.SUPPRESSION_LIST],
            subject: "Suppression List Test",
            bounce: {
              bounceType: "Permanent",
              bounceSubType: "Suppressed",
              bouncedRecipients: [
                {
                  emailAddress: SES_SIMULATOR_ADDRESSES.SUPPRESSION_LIST,
                  action: "failed",
                  status: "5.1.1",
                  diagnosticCode:
                    "Amazon SES has suppressed sending to this address",
                },
              ],
              timestamp: "2024-01-15T10:30:01.000Z",
              feedbackId: "suppression-feedback-123",
            },
          }),
        ],
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const putItemCall = dynamoMock.call(0).args[0].input;
      const additionalData = JSON.parse(
        putItemCall.Item?.additionalData.S || "{}"
      );
      expect(additionalData.bounceType).toBe("Permanent");
      expect(additionalData.bounceSubType).toBe("Suppressed");
    });
  });

  describe("Open Event", () => {
    it("should process Open event successfully", async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const event: SQSEvent = {
        Records: [
          createSQSRecord({
            eventType: "Open",
            messageId: "open-test-123",
            timestamp: "2024-01-15T10:30:00.000Z",
            source: "sender@example.com",
            destination: [SES_SIMULATOR_ADDRESSES.SUCCESS],
            subject: "Open Test",
            open: {
              timestamp: "2024-01-15T10:35:00.000Z",
              userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)",
              ipAddress: "198.51.100.1",
            },
          }),
        ],
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const putItemCall = dynamoMock.call(0).args[0].input;
      expect(putItemCall.Item?.eventType.S).toBe("Open");

      const additionalData = JSON.parse(
        putItemCall.Item?.additionalData.S || "{}"
      );
      expect(additionalData.userAgent).toContain("iPhone");
      expect(additionalData.ipAddress).toBe("198.51.100.1");
    });
  });

  describe("Click Event", () => {
    it("should process Click event successfully", async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const event: SQSEvent = {
        Records: [
          createSQSRecord({
            eventType: "Click",
            messageId: "click-test-123",
            timestamp: "2024-01-15T10:30:00.000Z",
            source: "sender@example.com",
            destination: [SES_SIMULATOR_ADDRESSES.SUCCESS],
            subject: "Click Test",
            click: {
              timestamp: "2024-01-15T10:36:00.000Z",
              link: "https://example.com/signup",
              linkTags: { campaign: "test", source: "email" },
              userAgent: "Mozilla/5.0 (Windows NT 10.0)",
              ipAddress: "203.0.113.1",
            },
          }),
        ],
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const putItemCall = dynamoMock.call(0).args[0].input;
      expect(putItemCall.Item?.eventType.S).toBe("Click");

      const additionalData = JSON.parse(
        putItemCall.Item?.additionalData.S || "{}"
      );
      expect(additionalData.link).toBe("https://example.com/signup");
      expect(additionalData.linkTags).toEqual({
        campaign: "test",
        source: "email",
      });
    });
  });

  describe("Reject Event", () => {
    it("should process Reject event successfully", async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const event: SQSEvent = {
        Records: [
          createSQSRecord({
            eventType: "Reject",
            messageId: "reject-test-123",
            timestamp: "2024-01-15T10:30:00.000Z",
            source: "sender@example.com",
            destination: ["invalid@example.com"],
            subject: "Reject Test",
            reject: {
              reason: "Bad content",
            },
          }),
        ],
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const putItemCall = dynamoMock.call(0).args[0].input;
      expect(putItemCall.Item?.eventType.S).toBe("Reject");

      const additionalData = JSON.parse(
        putItemCall.Item?.additionalData.S || "{}"
      );
      expect(additionalData.reason).toBe("Bad content");
    });
  });

  describe("Rendering Failure Event", () => {
    it("should process Rendering Failure event successfully", async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const event: SQSEvent = {
        Records: [
          createSQSRecord({
            eventType: "Rendering Failure",
            messageId: "rendering-failure-123",
            timestamp: "2024-01-15T10:30:00.000Z",
            source: "sender@example.com",
            destination: [SES_SIMULATOR_ADDRESSES.SUCCESS],
            subject: "Rendering Failure Test",
            failure: {
              errorMessage: "Template variable not found",
              templateName: "welcome-email",
            },
          }),
        ],
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const putItemCall = dynamoMock.call(0).args[0].input;
      expect(putItemCall.Item?.eventType.S).toBe("Rendering Failure");

      const additionalData = JSON.parse(
        putItemCall.Item?.additionalData.S || "{}"
      );
      expect(additionalData.errorMessage).toBe("Template variable not found");
      expect(additionalData.templateName).toBe("welcome-email");
    });
  });

  describe("DeliveryDelay Event", () => {
    it("should process DeliveryDelay event successfully", async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const event: SQSEvent = {
        Records: [
          createSQSRecord({
            eventType: "DeliveryDelay",
            messageId: "delay-test-123",
            timestamp: "2024-01-15T10:30:00.000Z",
            source: "sender@example.com",
            destination: [SES_SIMULATOR_ADDRESSES.SUCCESS],
            subject: "Delay Test",
            deliveryDelay: {
              timestamp: "2024-01-15T10:35:00.000Z",
              delayType: "TransientCommunicationFailure",
              expirationTime: "2024-01-15T22:30:00.000Z",
              delayedRecipients: [
                {
                  emailAddress: SES_SIMULATOR_ADDRESSES.SUCCESS,
                  status: "4.4.1",
                  diagnosticCode: "smtp; 441 4.4.1 Unable to connect",
                },
              ],
            },
          }),
        ],
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const putItemCall = dynamoMock.call(0).args[0].input;
      expect(putItemCall.Item?.eventType.S).toBe("DeliveryDelay");

      const additionalData = JSON.parse(
        putItemCall.Item?.additionalData.S || "{}"
      );
      expect(additionalData.delayType).toBe("TransientCommunicationFailure");
      expect(additionalData.delayedRecipients).toHaveLength(1);
    });
  });

  describe("Subscription Event", () => {
    it("should process Subscription event successfully", async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const event: SQSEvent = {
        Records: [
          createSQSRecord({
            eventType: "Subscription",
            messageId: "subscription-test-123",
            timestamp: "2024-01-15T10:30:00.000Z",
            source: "sender@example.com",
            destination: [SES_SIMULATOR_ADDRESSES.SUCCESS],
            subject: "Subscription Test",
            subscription: {
              contactList: "newsletter-subscribers",
              timestamp: "2024-01-15T10:35:00.000Z",
              source: "UnsubscribeHeader",
              newTopicPreferences: {
                unsubscribeAll: true,
                topicSubscriptionStatus: [],
              },
              oldTopicPreferences: {
                unsubscribeAll: false,
                topicSubscriptionStatus: [
                  {
                    topicName: "weekly-digest",
                    subscriptionStatus: "OptIn",
                  },
                ],
              },
            },
          }),
        ],
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const putItemCall = dynamoMock.call(0).args[0].input;
      expect(putItemCall.Item?.eventType.S).toBe("Subscription");

      const additionalData = JSON.parse(
        putItemCall.Item?.additionalData.S || "{}"
      );
      expect(additionalData.contactList).toBe("newsletter-subscribers");
      expect(additionalData.newTopicPreferences.unsubscribeAll).toBe(true);
    });
  });

  describe("Multiple Events", () => {
    it("should process multiple events in a batch", async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const event: SQSEvent = {
        Records: [
          createSQSRecord({
            eventType: "Send",
            messageId: "batch-msg-1",
            timestamp: "2024-01-15T10:30:00.000Z",
            source: "sender@example.com",
            destination: [SES_SIMULATOR_ADDRESSES.SUCCESS],
            subject: "Batch Test 1",
          }),
          createSQSRecord({
            eventType: "Delivery",
            messageId: "batch-msg-2",
            timestamp: "2024-01-15T10:30:00.000Z",
            source: "sender@example.com",
            destination: [SES_SIMULATOR_ADDRESSES.BOUNCE],
            subject: "Batch Test 2",
            delivery: {
              timestamp: "2024-01-15T10:30:05.000Z",
              processingTimeMillis: 5000,
              recipients: [SES_SIMULATOR_ADDRESSES.BOUNCE],
              smtpResponse: "250 2.0.0 OK",
              remoteMtaIp: "192.0.2.1",
            },
          }),
          createSQSRecord({
            eventType: "Bounce",
            messageId: "batch-msg-3",
            timestamp: "2024-01-15T10:30:00.000Z",
            source: "sender@example.com",
            destination: [SES_SIMULATOR_ADDRESSES.BOUNCE],
            subject: "Batch Test 3",
            bounce: {
              bounceType: "Permanent",
              bounceSubType: "General",
              bouncedRecipients: [
                {
                  emailAddress: SES_SIMULATOR_ADDRESSES.BOUNCE,
                  action: "failed",
                  status: "5.1.1",
                  diagnosticCode: "smtp; 550 5.1.1 user unknown",
                },
              ],
              timestamp: "2024-01-15T10:30:10.000Z",
              feedbackId: "batch-bounce-feedback",
            },
          }),
        ],
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(dynamoMock.calls()).toHaveLength(3);
    });
  });

  describe("Error Handling", () => {
    it("should continue processing other records when one fails", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      dynamoMock.on(PutItemCommand).resolves({});

      const event: SQSEvent = {
        Records: [
          createSQSRecord({
            eventType: "Send",
            messageId: "success-msg",
            timestamp: "2024-01-15T10:30:00.000Z",
            source: "sender@example.com",
            destination: [SES_SIMULATOR_ADDRESSES.SUCCESS],
            subject: "Success",
          }),
          {
            messageId: "invalid-record",
            receiptHandle: "invalid",
            body: "invalid json",
            attributes: {
              ApproximateReceiveCount: "1",
              SentTimestamp: "1234567890",
              SenderId: "test",
              ApproximateFirstReceiveTimestamp: "1234567890",
            },
            messageAttributes: {},
            md5OfBody: "test",
            eventSource: "aws:sqs",
            eventSourceARN: "arn:aws:sqs:us-east-1:123456789012:test",
            awsRegion: "us-east-1",
          } as SQSRecord,
        ],
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(dynamoMock.calls()).toHaveLength(1); // Only one successful call
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("should handle DynamoDB errors gracefully", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      dynamoMock.on(PutItemCommand).rejects(new Error("DynamoDB error"));

      const event: SQSEvent = {
        Records: [
          createSQSRecord({
            eventType: "Send",
            messageId: "error-msg",
            timestamp: "2024-01-15T10:30:00.000Z",
            source: "sender@example.com",
            destination: [SES_SIMULATOR_ADDRESSES.SUCCESS],
            subject: "Error Test",
          }),
        ],
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error processing record:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("TTL and Timestamps", () => {
    it("should set correct TTL (90 days) on records", async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const event: SQSEvent = {
        Records: [
          createSQSRecord({
            eventType: "Send",
            messageId: "ttl-test",
            timestamp: "2024-01-15T10:30:00.000Z",
            source: "sender@example.com",
            destination: [SES_SIMULATOR_ADDRESSES.SUCCESS],
            subject: "TTL Test",
          }),
        ],
      };

      await handler(event);

      const putItemCall = dynamoMock.call(0).args[0].input;
      const expiresAt = Number.parseInt(putItemCall.Item?.expiresAt.N || "0");
      const createdAt = Number.parseInt(putItemCall.Item?.createdAt.N || "0");

      // TTL should be approximately 90 days (7776000000 ms) after createdAt
      const expectedTTL = 90 * 24 * 60 * 60 * 1000;
      const actualTTL = expiresAt - createdAt;

      expect(actualTTL).toBeGreaterThanOrEqual(expectedTTL - 1000);
      expect(actualTTL).toBeLessThanOrEqual(expectedTTL + 1000);
    });

    it("should use event-specific timestamps for sortKey", async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const mailTimestamp = "2024-01-15T10:30:00.000Z";
      const deliveryTimestamp = "2024-01-15T10:30:05.000Z";

      const event: SQSEvent = {
        Records: [
          createSQSRecord({
            eventType: "Delivery",
            messageId: "timestamp-test",
            timestamp: mailTimestamp,
            source: "sender@example.com",
            destination: [SES_SIMULATOR_ADDRESSES.SUCCESS],
            subject: "Timestamp Test",
            delivery: {
              timestamp: deliveryTimestamp,
              processingTimeMillis: 5000,
              recipients: [SES_SIMULATOR_ADDRESSES.SUCCESS],
              smtpResponse: "250 OK",
              remoteMtaIp: "192.0.2.1",
            },
          }),
        ],
      };

      await handler(event);

      const putItemCall = dynamoMock.call(0).args[0].input;
      const sentAt = Number.parseInt(putItemCall.Item?.sentAt.N || "0");
      const expectedTimestamp = new Date(deliveryTimestamp).getTime();

      expect(sentAt).toBe(expectedTimestamp);
    });
  });
});

/**
 * Helper function to create an SQS record with SES event data
 */
function createSQSRecord(params: {
  eventType: string;
  messageId: string;
  timestamp: string;
  source: string;
  destination: string[];
  subject: string;
  tags?: Record<string, string>;
  send?: Record<string, unknown>;
  delivery?: {
    timestamp: string;
    processingTimeMillis: number;
    recipients: string[];
    smtpResponse: string;
    remoteMtaIp: string;
  };
  bounce?: {
    bounceType: string;
    bounceSubType: string;
    bouncedRecipients: Array<{
      emailAddress: string;
      action: string;
      status: string;
      diagnosticCode: string;
    }>;
    timestamp: string;
    feedbackId: string;
  };
  complaint?: {
    complainedRecipients: Array<{ emailAddress: string }>;
    timestamp: string;
    feedbackId: string;
    complaintFeedbackType: string;
    userAgent: string;
  };
  open?: {
    timestamp: string;
    userAgent: string;
    ipAddress: string;
  };
  click?: {
    timestamp: string;
    link: string;
    linkTags?: Record<string, string>;
    userAgent: string;
    ipAddress: string;
  };
  reject?: {
    reason: string;
  };
  failure?: {
    errorMessage: string;
    templateName: string;
  };
  deliveryDelay?: {
    timestamp: string;
    delayType: string;
    expirationTime: string;
    delayedRecipients: Array<{
      emailAddress: string;
      status: string;
      diagnosticCode: string;
    }>;
  };
  subscription?: {
    contactList: string;
    timestamp: string;
    source: string;
    newTopicPreferences: {
      unsubscribeAll: boolean;
      topicSubscriptionStatus: Array<{
        topicName?: string;
        subscriptionStatus?: string;
      }>;
    };
    oldTopicPreferences: {
      unsubscribeAll: boolean;
      topicSubscriptionStatus: Array<{
        topicName?: string;
        subscriptionStatus?: string;
      }>;
    };
  };
}): SQSRecord {
  const mail = {
    timestamp: params.timestamp,
    source: params.source,
    messageId: params.messageId,
    destination: params.destination,
    commonHeaders: {
      subject: params.subject,
    },
    tags: params.tags || {},
  };

  const detail: Record<string, unknown> = {
    eventType: params.eventType,
    mail,
  };

  if (params.send) {
    detail.send = params.send;
  }
  if (params.delivery) {
    detail.delivery = params.delivery;
  }
  if (params.bounce) {
    detail.bounce = params.bounce;
  }
  if (params.complaint) {
    detail.complaint = params.complaint;
  }
  if (params.open) {
    detail.open = params.open;
  }
  if (params.click) {
    detail.click = params.click;
  }
  if (params.reject) {
    detail.reject = params.reject;
  }
  if (params.failure) {
    detail.failure = params.failure;
  }
  if (params.deliveryDelay) {
    detail.deliveryDelay = params.deliveryDelay;
  }
  if (params.subscription) {
    detail.subscription = params.subscription;
  }

  const eventBridgeEvent = {
    version: "0",
    id: `event-${params.messageId}`,
    "detail-type": "SES Email Event",
    source: "aws.ses",
    account: "123456789012",
    time: params.timestamp,
    region: "us-east-1",
    resources: [],
    detail,
  };

  return {
    messageId: params.messageId,
    receiptHandle: `receipt-${params.messageId}`,
    body: JSON.stringify(eventBridgeEvent),
    attributes: {
      ApproximateReceiveCount: "1",
      SentTimestamp: new Date(params.timestamp).getTime().toString(),
      SenderId: "AIDAI123456789",
      ApproximateFirstReceiveTimestamp: new Date(params.timestamp)
        .getTime()
        .toString(),
    },
    messageAttributes: {},
    md5OfBody: "test-md5",
    eventSource: "aws:sqs",
    eventSourceARN: "arn:aws:sqs:us-east-1:123456789012:wraps-email-events",
    awsRegion: "us-east-1",
  };
}
