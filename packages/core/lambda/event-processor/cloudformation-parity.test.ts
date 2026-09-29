import { readFileSync } from "node:fs";
import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import type { Context } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handler as coreHandler } from "./index.ts";

// The published CloudFormation template carries a hand-written copy of this
// Lambda. It drifted twice (mailSentAt, suppression ledger) because nothing
// compared them. This file runs both on the same SES events and requires
// identical DynamoDB commands.

const TEMPLATE = new URL(
  "../../../../cloudformation/wraps-email-infrastructure.yaml",
  import.meta.url
);

/** Body of the WrapsEmailProcessor ZipFile block scalar, dedented. */
function inlineProcessorSource(): string {
  const lines = readFileSync(TEMPLATE, "utf-8").split("\n");
  const fnLine = lines.findIndex((l) => l.trim() === "WrapsEmailProcessor:");
  const zipLine = lines.findIndex(
    (l, i) => i > fnLine && l.trim() === "ZipFile: |"
  );
  const indent =
    lines[zipLine + 1].length - lines[zipLine + 1].trimStart().length;
  const body: string[] = [];
  for (const line of lines.slice(zipLine + 1)) {
    if (line.trim() !== "" && line.length - line.trimStart().length < indent) {
      break;
    }
    body.push(line.slice(indent));
  }
  return body.join("\n");
}

const ddbMock = mockClient(DynamoDBClient);

function loadInlineHandler() {
  const required: string[] = [];
  const fakeRequire = (id: string) => {
    required.push(id);
    if (id !== "@aws-sdk/client-dynamodb") {
      throw new Error(`unexpected require: ${id}`);
    }
    return { DynamoDBClient, PutItemCommand, UpdateItemCommand };
  };
  const module = {
    exports: {} as { handler: (e: unknown) => Promise<unknown> },
  };
  new Function(
    "require",
    "module",
    "exports",
    "process",
    "console",
    inlineProcessorSource()
  )(fakeRequire, module, module.exports, process, console);
  return { handler: module.exports.handler, required };
}

function recorded() {
  return ddbMock.calls().map((c) => {
    const cmd = c.args[0];
    return { command: cmd.constructor.name, input: cmd.input };
  });
}

const MAIL = {
  messageId: "ses-msg-1",
  timestamp: "2026-09-01T00:00:00.000Z",
  source: "a@wraps.dev",
  destination: ["X@Example.com", "other@example.com"],
  commonHeaders: { subject: "hi" },
};
const EVENT_TS = "2026-09-01T00:00:05.000Z";

function sqsEvent(...details: unknown[]) {
  return {
    Records: details.map((detail, i) => ({
      messageId: `sqs-${i + 1}`,
      body: JSON.stringify({ detail }),
    })),
  } as never;
}

function bounce(bounceOverrides: Record<string, unknown> = {}) {
  return {
    eventType: "Bounce",
    mail: MAIL,
    bounce: {
      bounceType: "Permanent",
      bounceSubType: "General",
      timestamp: EVENT_TS,
      feedbackId: "fb-1",
      bouncedRecipients: [{ emailAddress: "X@Example.com " }],
      ...bounceOverrides,
    },
  };
}

async function runBoth(event: never, setupMock?: () => void) {
  setupMock?.();
  await coreHandler(event, { awsRequestId: "r" } as Context);
  const core = recorded();

  ddbMock.reset();
  setupMock?.();
  await loadInlineHandler().handler(event);
  const inline = recorded();

  return { core, inline };
}

beforeEach(() => {
  ddbMock.reset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-01T00:10:00.000Z"));
  process.env.TABLE_NAME = "wraps-email-history";
  process.env.AWS_ACCOUNT_ID = "123456789012";
  process.env.RETENTION_DAYS = "90";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CloudFormation inline event processor parity with @wraps/core", () => {
  const cases: [string, unknown, (() => void)?][] = [
    ["Send event", { eventType: "Send", mail: MAIL, send: {} }],
    [
      "Delivery event",
      {
        eventType: "Delivery",
        mail: MAIL,
        delivery: {
          timestamp: EVENT_TS,
          processingTimeMillis: 12,
          recipients: ["x@example.com"],
          smtpResponse: "250 OK",
          remoteMtaIp: "1.2.3.4",
        },
      },
    ],
    [
      "Open event",
      {
        eventType: "Open",
        mail: MAIL,
        open: { timestamp: EVENT_TS, userAgent: "ua", ipAddress: "1.2.3.4" },
      },
    ],
    ["permanent bounce", bounce()],
    [
      "transient bounce",
      bounce({ bounceType: "Transient", bounceSubType: "General" }),
    ],
    [
      "OnAccountSuppressionList bounce",
      bounce({
        bounceType: "Permanent",
        bounceSubType: "OnAccountSuppressionList",
      }),
    ],
    [
      "EmailValidationSuppressed bounce",
      bounce({
        bounceType: "Undetermined",
        bounceSubType: "EmailValidationSuppressed",
      }),
    ],
    [
      "complaint",
      {
        eventType: "Complaint",
        mail: MAIL,
        complaint: {
          timestamp: EVENT_TS,
          feedbackId: "fb-2",
          complaintFeedbackType: "abuse",
          complainedRecipients: [{ emailAddress: "X@Example.com " }],
        },
      },
    ],
    [
      "bounce with no bouncedRecipients",
      bounce({ bouncedRecipients: undefined }),
    ],
    [
      "two-recipient bounce with first ledger write failing",
      bounce({
        bouncedRecipients: [
          { emailAddress: "a@example.com" },
          { emailAddress: "b@example.com" },
        ],
      }),
      () => {
        ddbMock
          .on(UpdateItemCommand)
          .rejectsOnce(new Error("boom"))
          .resolves({});
      },
    ],
  ];

  for (const [name, detail, setup] of cases) {
    it(`sends identical commands for: ${name}`, async () => {
      const { core, inline } = await runBoth(sqsEvent(detail), setup);
      expect(core.length).toBeGreaterThan(0);
      expect(inline).toEqual(core);
    });
  }

  it("requires only the AWS SDK, which the Lambda runtime provides", () => {
    expect(loadInlineHandler().required).toEqual(["@aws-sdk/client-dynamodb"]);
  });

  it("mocks intercept the inline client", async () => {
    await loadInlineHandler().handler(sqsEvent(bounce()));
    const calls = recorded();
    expect(calls.map((c) => c.command)).toEqual([
      "PutItemCommand",
      "UpdateItemCommand",
    ]);
  });
});
