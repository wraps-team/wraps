import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import type { Context } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { handler } from "./index.ts";

const ddbMock = mockClient(DynamoDBClient);

const MAIL = {
  messageId: "ses-msg-1",
  timestamp: "2026-09-01T00:00:00.000Z",
  source: "a@wraps.dev",
  destination: ["X@Example.com", "other@example.com"],
  commonHeaders: { subject: "hi" },
};

const BOUNCE_TS = "2026-09-01T00:00:05.000Z";

function bounceDetail(
  overrides: Record<string, unknown> = {},
  bounceOverrides: Record<string, unknown> = {}
) {
  return {
    eventType: "Bounce",
    mail: MAIL,
    bounce: {
      bounceType: "Permanent",
      bounceSubType: "General",
      timestamp: BOUNCE_TS,
      feedbackId: "fb-1",
      bouncedRecipients: [{ emailAddress: "X@Example.com " }],
      ...bounceOverrides,
    },
    ...overrides,
  };
}

function sqsEvent(...details: unknown[]) {
  return {
    Records: details.map((detail, i) => ({
      messageId: `sqs-${i + 1}`,
      body: JSON.stringify({ detail }),
    })),
  } as never;
}

const context = { awsRequestId: "req-1" } as Context;

const updates = () => ddbMock.commandCalls(UpdateItemCommand);
const puts = () => ddbMock.commandCalls(PutItemCommand);

beforeEach(() => {
  ddbMock.reset();
  process.env.TABLE_NAME = "wraps-email-history";
  process.env.AWS_ACCOUNT_ID = "123456789012";
});

describe("event-processor suppression ledger", () => {
  it("writes one ledger item for a permanent bounce, normalised and recipient-scoped", async () => {
    await handler(sqsEvent(bounceDetail()), context);

    expect(updates()).toHaveLength(1);
    const input = updates()[0].args[0].input;
    expect(input.Key).toEqual({
      messageId: { S: "SUPPRESSION#x@example.com" },
      sentAt: { N: "0" },
    });
    expect(input.ExpressionAttributeValues?.[":r"]).toEqual({ S: "bounce" });
    expect(input.ExpressionAttributeValues?.[":d"]).toEqual({ S: "General" });
    expect(input.ExpressionAttributeValues?.[":sa"]).toEqual({
      N: String(Date.parse(BOUNCE_TS)),
    });
    // other@example.com was in mail.destination but not in bouncedRecipients
    expect(JSON.stringify(input)).not.toContain("other@example.com");
  });

  it("keeps ledger items out of the GSI and TTL, and preserves first-seen", async () => {
    await handler(sqsEvent(bounceDetail()), context);

    const input = updates()[0].args[0].input;
    const serialised = JSON.stringify(input);
    expect(serialised).not.toContain("accountId");
    expect(serialised).not.toContain("expiresAt");
    expect(input.UpdateExpression).toContain("if_not_exists(#fsa, :sa)");
  });

  it("skips the ledger for a transient bounce but still stores the event", async () => {
    await handler(
      sqsEvent(bounceDetail({}, { bounceType: "Transient" })),
      context
    );

    expect(updates()).toHaveLength(0);
    expect(puts()).toHaveLength(1);
  });

  it("records OnAccountSuppressionList as a bounce and keeps the Suppressed event row", async () => {
    await handler(
      sqsEvent(
        bounceDetail(
          {},
          {
            bounceType: "Permanent",
            bounceSubType: "OnAccountSuppressionList",
          }
        )
      ),
      context
    );

    expect(updates()).toHaveLength(1);
    const values = updates()[0].args[0].input.ExpressionAttributeValues;
    expect(values?.[":r"]).toEqual({ S: "bounce" });
    expect(values?.[":d"]).toEqual({ S: "OnAccountSuppressionList" });
    expect(puts()[0].args[0].input.Item?.eventType).toEqual({
      S: "Suppressed",
    });
  });

  it("records EmailValidationSuppressed as validation", async () => {
    await handler(
      sqsEvent(
        bounceDetail(
          {},
          {
            bounceType: "Undetermined",
            bounceSubType: "EmailValidationSuppressed",
          }
        )
      ),
      context
    );

    expect(updates()).toHaveLength(1);
    expect(
      updates()[0].args[0].input.ExpressionAttributeValues?.[":r"]
    ).toEqual({ S: "validation" });
  });

  it("records a complaint with its feedback type", async () => {
    await handler(
      sqsEvent({
        eventType: "Complaint",
        mail: MAIL,
        complaint: {
          complainedRecipients: [{ emailAddress: "c@example.com" }],
          complaintFeedbackType: "abuse",
          timestamp: BOUNCE_TS,
          feedbackId: "fb-2",
        },
      }),
      context
    );

    expect(updates()).toHaveLength(1);
    const values = updates()[0].args[0].input.ExpressionAttributeValues;
    expect(values?.[":r"]).toEqual({ S: "complaint" });
    expect(values?.[":d"]).toEqual({ S: "abuse" });
  });

  it("writes nothing when the recipient list is missing, ignoring mail.destination", async () => {
    await handler(
      sqsEvent(bounceDetail({}, { bouncedRecipients: undefined })),
      context
    );

    expect(updates()).toHaveLength(0);
  });

  it("contains a ledger failure so the rest of the batch still stores", async () => {
    ddbMock.on(UpdateItemCommand).rejects(new Error("boom"));

    const result = await handler(
      sqsEvent(bounceDetail(), bounceDetail()),
      context
    );

    expect(result).toMatchObject({ statusCode: 200 });
    expect(puts()).toHaveLength(2);
  });

  it("still records later recipients when an earlier ledger write fails", async () => {
    ddbMock.on(UpdateItemCommand).rejectsOnce(new Error("boom")).resolves({});

    await handler(
      sqsEvent(
        bounceDetail(
          {},
          {
            bouncedRecipients: [
              { emailAddress: "first@example.com" },
              { emailAddress: "second@example.com" },
            ],
          }
        )
      ),
      context
    );

    expect(updates()).toHaveLength(2);
    expect(updates()[1].args[0].input.Key?.messageId).toEqual({
      S: "SUPPRESSION#second@example.com",
    });
  });

  it("does not write a ledger item for a delivery event", async () => {
    await handler(
      sqsEvent({
        eventType: "Delivery",
        mail: MAIL,
        delivery: { timestamp: BOUNCE_TS, recipients: ["x@example.com"] },
      }),
      context
    );

    expect(updates()).toHaveLength(0);
    expect(puts()).toHaveLength(1);
  });
});
