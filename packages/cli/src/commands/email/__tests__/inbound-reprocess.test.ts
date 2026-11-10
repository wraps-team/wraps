import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import {
  DeleteMessageCommand,
  GetQueueUrlCommand,
  type Message,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../../utils/shared/json-output.js";

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  log: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    step: vi.fn(),
  },
  confirm: vi.fn().mockResolvedValue(true),
  isCancel: vi.fn().mockReturnValue(false),
}));

vi.mock("../../../utils/shared/aws.js", () => ({
  getAWSRegion: vi.fn().mockResolvedValue("us-east-1"),
  validateAWSCredentials: vi.fn().mockResolvedValue({
    accountId: "123456789012",
    userId: "AIDATEST",
    arn: "arn:aws:iam::123456789012:user/test",
  }),
}));

vi.mock("../../../utils/shared/prompts.js", () => ({
  ensureInteractive: vi.fn(),
}));

import * as clack from "@clack/prompts";
import { ensureInteractive } from "../../../utils/shared/prompts.js";
import { inboundReprocess } from "../inbound-reprocess.js";

const sqs = mockClient(SQSClient);
const lambda = mockClient(LambdaClient);

const QUEUE_URL =
  "https://sqs.us-east-1.amazonaws.com/123456789012/wraps-inbound-events-dlq";

function sesBody(messageId: string, recipients = ["a@in.example.com"]) {
  return JSON.stringify({
    Records: [
      {
        eventSource: "aws:ses",
        eventVersion: "1.0",
        ses: {
          mail: { messageId },
          receipt: {
            timestamp: "2026-11-01T10:00:00.000Z",
            recipients,
          },
        },
      },
    ],
  });
}

function s3Body(key: string) {
  return JSON.stringify({
    Records: [
      {
        eventSource: "aws:s3",
        eventTime: "2026-10-01T10:00:00.000Z",
        s3: { bucket: { name: "b" }, object: { key } },
      },
    ],
  });
}

function msg(id: string, body: string): Message {
  return { MessageId: id, ReceiptHandle: `rh-${id}`, Body: body };
}

function jsonOut(): any {
  const calls = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
  const line = calls.find((c) => c.startsWith('{"success"'));
  return line ? JSON.parse(line).data : undefined;
}

function printed(): string {
  return vi
    .mocked(console.log)
    .mock.calls.map((c) => String(c[0]))
    .join("\n");
}

beforeEach(() => {
  sqs.reset();
  lambda.reset();
  sqs.on(GetQueueUrlCommand).resolves({ QueueUrl: QUEUE_URL });
  sqs.on(DeleteMessageCommand).resolves({});
  lambda.on(InvokeCommand).resolves({ StatusCode: 202 });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(clack.confirm).mockResolvedValue(true);
  vi.mocked(clack.isCancel).mockReturnValue(false);
  vi.mocked(ensureInteractive).mockReset();
});

afterEach(() => {
  setJsonMode(false);
  vi.restoreAllMocks();
});

describe("inbound reprocess --dry-run", () => {
  it("receives with VisibilityTimeout 0, stops, prints each message once, and changes nothing", async () => {
    // The mock returns both messages on every receive, like a queue that
    // never hides what a zero visibility timeout peeked at.
    sqs.on(ReceiveMessageCommand).resolves({
      Messages: [msg("m1", sesBody("abc")), msg("m2", s3Body("raw/def"))],
    });

    await inboundReprocess({ dryRun: true });

    const receives = sqs.commandCalls(ReceiveMessageCommand);
    // One receive finds both, the next two show nothing new, then it stops.
    expect(receives).toHaveLength(3);
    for (const call of receives) {
      expect(call.args[0].input.VisibilityTimeout).toBe(0);
      expect(call.args[0].input.WaitTimeSeconds).toBeGreaterThan(0);
    }
    expect(sqs.commandCalls(DeleteMessageCommand)).toHaveLength(0);
    expect(lambda.commandCalls(InvokeCommand)).toHaveLength(0);

    const out = printed();
    expect(out.match(/mail\/abc/g)).toHaveLength(1);
    expect(out.match(/raw\/def/g)).toHaveLength(1);
    expect(out).toContain("1 envelope recipient");
    expect(out).toContain("2026-11-01T10:00:00.000Z");
  });

  it("an empty queue stops after two receives and says so", async () => {
    sqs.on(ReceiveMessageCommand).resolves({});
    await inboundReprocess({ dryRun: true });
    expect(sqs.commandCalls(ReceiveMessageCommand)).toHaveLength(2);
    expect(vi.mocked(clack.log.success)).toHaveBeenCalledWith(
      expect.stringContaining("empty")
    );
  });

  it("--max stops early", async () => {
    sqs.on(ReceiveMessageCommand).resolves({
      Messages: [
        msg("m1", sesBody("a")),
        msg("m2", sesBody("b")),
        msg("m3", sesBody("c")),
      ],
    });
    setJsonMode(true);
    await inboundReprocess({ dryRun: true, max: "2" });
    const data = jsonOut();
    expect(data.found).toBe(2);
    expect(data.messages.map((m: any) => m.messageId)).toEqual(["m1", "m2"]);
    expect(sqs.commandCalls(ReceiveMessageCommand)).toHaveLength(1);
  });

  it("--json --dry-run needs no --yes and reports the shape and envelope count", async () => {
    sqs.on(ReceiveMessageCommand).resolves({
      Messages: [
        msg("m1", sesBody("abc", ["a@x.com", "b@x.com"])),
        msg("m2", s3Body("raw/my+file%40x")),
      ],
    });
    setJsonMode(true);
    await inboundReprocess({ dryRun: true });
    const data = jsonOut();
    expect(data.dryRun).toBe(true);
    expect(data.messages[0]).toMatchObject({
      shape: "ses",
      keys: ["mail/abc"],
      envelopeCount: 2,
    });
    expect(data.messages[1]).toMatchObject({
      shape: "s3",
      keys: ["raw/my file@x"],
      envelopeCount: null,
    });
  });
});

describe("inbound reprocess (replay)", () => {
  it("invokes the processor with the body (Event), then deletes", async () => {
    const body = sesBody("abc");
    sqs
      .on(ReceiveMessageCommand)
      .resolvesOnce({ Messages: [msg("m1", body)] })
      .resolves({});

    await inboundReprocess({ yes: true });

    const invokes = lambda.commandCalls(InvokeCommand);
    expect(invokes).toHaveLength(1);
    expect(invokes[0].args[0].input.FunctionName).toBe(
      "wraps-inbound-email-processor"
    );
    expect(invokes[0].args[0].input.InvocationType).toBe("Event");
    expect(
      new TextDecoder().decode(invokes[0].args[0].input.Payload as Uint8Array)
    ).toBe(body);
    const deletes = sqs.commandCalls(DeleteMessageCommand);
    expect(deletes).toHaveLength(1);
    expect(deletes[0].args[0].input).toEqual({
      QueueUrl: QUEUE_URL,
      ReceiptHandle: "rh-m1",
    });
    expect(vi.mocked(clack.confirm)).not.toHaveBeenCalled();
  });

  it("deletes only after the invoke returned, in order", async () => {
    const order: string[] = [];
    lambda.on(InvokeCommand).callsFake(async () => {
      order.push("invoke");
      return { StatusCode: 202 };
    });
    sqs.on(DeleteMessageCommand).callsFake(async () => {
      order.push("delete");
      return {};
    });
    sqs
      .on(ReceiveMessageCommand)
      .resolvesOnce({ Messages: [msg("m1", sesBody("abc"))] })
      .resolves({});
    await inboundReprocess({ yes: true });
    expect(order).toEqual(["invoke", "delete"]);
  });

  it("a failed invoke keeps the message and counts it failed", async () => {
    lambda.on(InvokeCommand).rejects(new Error("throttled"));
    sqs
      .on(ReceiveMessageCommand)
      .resolvesOnce({ Messages: [msg("m1", sesBody("abc"))] })
      .resolves({});
    setJsonMode(true);
    await inboundReprocess({ yes: true });
    expect(sqs.commandCalls(DeleteMessageCommand)).toHaveLength(0);
    const data = jsonOut();
    expect(data).toMatchObject({ found: 1, replayed: 0, failed: 1 });
    expect(data.messages[0]).toMatchObject({
      outcome: "failed",
      error: "throttled",
    });
  });

  it("a non-202 invoke keeps the message", async () => {
    lambda.on(InvokeCommand).resolves({ StatusCode: 200 });
    sqs
      .on(ReceiveMessageCommand)
      .resolvesOnce({ Messages: [msg("m1", sesBody("abc"))] })
      .resolves({});
    setJsonMode(true);
    await inboundReprocess({ yes: true });
    expect(sqs.commandCalls(DeleteMessageCommand)).toHaveLength(0);
    expect(jsonOut().failed).toBe(1);
  });

  it("replays S3-shaped and SES-shaped bodies unchanged", async () => {
    const ses = sesBody("abc");
    const s3 = s3Body("raw/xyz");
    sqs
      .on(ReceiveMessageCommand)
      .resolvesOnce({ Messages: [msg("m1", ses), msg("m2", s3)] })
      .resolves({});
    await inboundReprocess({ yes: true });
    const payloads = lambda
      .commandCalls(InvokeCommand)
      .map((c) =>
        new TextDecoder().decode(c.args[0].input.Payload as Uint8Array)
      );
    expect(payloads).toEqual([ses, s3]);
    expect(sqs.commandCalls(DeleteMessageCommand)).toHaveLength(2);
  });

  it("handles each MessageId at most once per run, even if the queue keeps returning it", async () => {
    // A queue that returns the same message every time (the delete didn't
    // take, or a failed replay is visible again): one invoke, then stop.
    sqs.on(ReceiveMessageCommand).resolves({
      Messages: [msg("m1", sesBody("abc"))],
    });
    await inboundReprocess({ yes: true });
    expect(lambda.commandCalls(InvokeCommand)).toHaveLength(1);
  });

  it("stops at the first empty receive", async () => {
    sqs.on(ReceiveMessageCommand).resolves({});
    await inboundReprocess({ yes: true });
    expect(sqs.commandCalls(ReceiveMessageCommand)).toHaveLength(1);
    expect(lambda.commandCalls(InvokeCommand)).toHaveLength(0);
  });

  it("--max stops early and asks for no more than the remainder", async () => {
    let n = 0;
    sqs.on(ReceiveMessageCommand).callsFake(async () => ({
      Messages: [msg(`m${++n}`, sesBody(`k${n}`))],
    }));
    setJsonMode(true);
    await inboundReprocess({ yes: true, max: "3" });
    expect(lambda.commandCalls(InvokeCommand)).toHaveLength(3);
    const data = jsonOut();
    expect(data.stoppedAtMax).toBe(true);
    expect(data.replayed).toBe(3);
    const asked = sqs
      .commandCalls(ReceiveMessageCommand)
      .map((c) => c.args[0].input.MaxNumberOfMessages);
    expect(Math.max(...(asked as number[]))).toBeLessThanOrEqual(3);
  });

  it("confirms without --yes and does nothing when declined", async () => {
    vi.mocked(clack.confirm).mockResolvedValue(false);
    sqs.on(ReceiveMessageCommand).resolves({
      Messages: [msg("m1", sesBody("abc"))],
    });
    await inboundReprocess({});
    expect(vi.mocked(clack.confirm)).toHaveBeenCalledOnce();
    expect(sqs.commandCalls(ReceiveMessageCommand)).toHaveLength(0);
    expect(lambda.commandCalls(InvokeCommand)).toHaveLength(0);
  });
});

describe("inbound reprocess flags", () => {
  it("--json without --yes errors before touching AWS", async () => {
    setJsonMode(true);
    await expect(inboundReprocess({})).rejects.toMatchObject({
      code: "INVALID_FLAG_USAGE",
      message: expect.stringContaining("--yes"),
    });
    expect(sqs.calls()).toHaveLength(0);
    expect(lambda.calls()).toHaveLength(0);
  });

  it.each(["0", "-1", "abc", "1.5"])("rejects --max %s", async (max) => {
    await expect(inboundReprocess({ yes: true, max })).rejects.toMatchObject({
      code: "INVALID_FLAG_USAGE",
    });
    expect(sqs.calls()).toHaveLength(0);
  });

  it("a missing DLQ names the region and the init command", async () => {
    const err = Object.assign(new Error("gone"), { name: "QueueDoesNotExist" });
    sqs.on(GetQueueUrlCommand).rejects(err);
    await expect(inboundReprocess({ yes: true })).rejects.toMatchObject({
      code: "INVALID_FLAG_USAGE",
      message: expect.stringContaining("wraps-inbound-events-dlq"),
    });
  });
});
