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
  return {
    MessageId: id,
    ReceiptHandle: `rh-${id}`,
    Body: body,
    Attributes: { SentTimestamp: "1793000000000" },
  };
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
  vi.clearAllMocks();
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

  it("an accepted invoke whose delete fails is its own outcome, not a failure, and the advice does not say to re-run", async () => {
    sqs.on(DeleteMessageCommand).rejects(new Error("delete throttled"));
    sqs
      .on(ReceiveMessageCommand)
      .resolvesOnce({ Messages: [msg("m1", sesBody("abc"))] })
      .resolves({});
    await inboundReprocess({ yes: true });

    expect(lambda.commandCalls(InvokeCommand)).toHaveLength(1);
    const warned = vi
      .mocked(clack.log.warn)
      .mock.calls.map((c) => String(c[0]))
      .join("\n");
    expect(warned).toContain("already took it");
    expect(warned).toContain("m1");
    expect(warned).toContain("2026-10-26T07:33:20.000Z");
    expect(warned).toContain(
      "would take it from the queue and replay it again"
    );
    expect(warned).toContain("14 days");
    expect(warned).toContain("SQS console");
    expect(warned).not.toContain("aws sqs delete-message");
    expect(warned).not.toContain("could not be handed to the processor");
    expect(String(vi.mocked(clack.log.info).mock.calls[0][0])).toContain(
      "1 replayed but not deleted, 0 failed"
    );
  });

  it("an sqs:DeleteMessage denial stops the run at the first one and says what was handed off", async () => {
    sqs
      .on(DeleteMessageCommand)
      .rejects(Object.assign(new Error("denied"), { name: "AccessDenied" }));
    sqs.on(ReceiveMessageCommand).resolves({
      Messages: [msg("m1", sesBody("a")), msg("m2", sesBody("b"))],
    });

    const err = await inboundReprocess({ yes: true }).then(
      () => null,
      (e) => e
    );

    expect(err).toMatchObject({ code: "SQS_PERMISSION_DENIED" });
    expect(err.message).toContain("sqs:DeleteMessage");
    expect(err.message).toContain("Stopped after 1 message handed off");
    expect(err.message).toContain("still queued");
    expect(err.message).toContain("id: m1");
    expect(err.message).toContain(
      "would take it from the queue and replay it again"
    );
    expect(err.message).toContain("SQS console");
    expect(err.message).toContain("any run before then replays it");
    expect(err.message).not.toContain("do not replay");
    expect(err.suggestion).toContain(
      "Re-apply the Wraps IAM policy, which now includes the InboundReprocess statement: run wraps permissions --service email --policy-dir ./wraps-policy and update each wraps-deployer-<n> policy in IAM from its file"
    );
    expect(err.suggestion).toContain("before you run reprocess again");
    expect(err.suggestion).toContain("delivers them twice");
    expect(err.data).toEqual({
      handedOff: ["m1"],
      handedOffNotDeleted: ["m1"],
    });
    // m2 was never invoked: one invoke, one delete attempt.
    expect(lambda.commandCalls(InvokeCommand)).toHaveLength(1);
    expect(sqs.commandCalls(DeleteMessageCommand)).toHaveLength(1);
  });

  it("a stopped run keeps the earlier hand-offs in the error data (processor denied mid-run)", async () => {
    let n = 0;
    lambda.on(InvokeCommand).callsFake(async () => {
      if (++n === 2) {
        throw Object.assign(new Error("denied"), {
          name: "AccessDeniedException",
        });
      }
      return { StatusCode: 202 };
    });
    sqs.on(ReceiveMessageCommand).resolves({
      Messages: [
        msg("m1", sesBody("a")),
        msg("m2", sesBody("b")),
        msg("m3", sesBody("c")),
      ],
    });
    const err = await inboundReprocess({ yes: true }).then(
      () => null,
      (e) => e
    );
    expect(err.code).toBe("LAMBDA_PERMISSION_DENIED");
    expect(err.data).toEqual({ handedOff: ["m1"], handedOffNotDeleted: [] });
    expect(sqs.commandCalls(DeleteMessageCommand)).toHaveLength(1);
  });

  it("reports replayed-not-deleted separately in --json", async () => {
    sqs.on(DeleteMessageCommand).rejects(new Error("delete throttled"));
    sqs
      .on(ReceiveMessageCommand)
      .resolvesOnce({ Messages: [msg("m1", sesBody("abc"))] })
      .resolves({});
    setJsonMode(true);
    await inboundReprocess({ yes: true });
    const data = jsonOut();
    expect(data).toMatchObject({
      found: 1,
      replayed: 0,
      replayedNotDeleted: 1,
      failed: 0,
    });
    expect(data.messages[0]).toMatchObject({
      outcome: "replayed-not-deleted",
      error: "delete throttled",
    });
    expect(lambda.commandCalls(InvokeCommand)).toHaveLength(1);
  });

  it("stops at the first missing-processor error instead of failing every message", async () => {
    lambda.on(InvokeCommand).rejects(
      Object.assign(new Error("not found"), {
        name: "ResourceNotFoundException",
      })
    );
    sqs.on(ReceiveMessageCommand).resolves({
      Messages: [
        msg("m1", sesBody("a")),
        msg("m2", sesBody("b")),
        msg("m3", sesBody("c")),
      ],
    });
    await expect(inboundReprocess({ yes: true })).rejects.toMatchObject({
      code: "INBOUND_NOT_DEPLOYED",
      message: expect.stringContaining("wraps-inbound-email-processor"),
    });
    expect(lambda.commandCalls(InvokeCommand)).toHaveLength(1);
    expect(sqs.commandCalls(DeleteMessageCommand)).toHaveLength(0);
  });

  it("stops at the first lambda:InvokeFunction denial with one message naming the action", async () => {
    lambda
      .on(InvokeCommand)
      .rejects(
        Object.assign(new Error("denied"), { name: "AccessDeniedException" })
      );
    sqs.on(ReceiveMessageCommand).resolves({
      Messages: [msg("m1", sesBody("a")), msg("m2", sesBody("b"))],
    });
    await expect(inboundReprocess({ yes: true })).rejects.toMatchObject({
      code: "LAMBDA_PERMISSION_DENIED",
      message: expect.stringContaining("lambda:InvokeFunction"),
      suggestion:
        "Re-apply the Wraps IAM policy, which now includes the InboundReprocess statement: run wraps permissions --service email --policy-dir ./wraps-policy and update each wraps-deployer-<n> policy in IAM from its file",
    });
    expect(lambda.commandCalls(InvokeCommand)).toHaveLength(1);
    expect(sqs.commandCalls(DeleteMessageCommand)).toHaveLength(0);
  });

  it("an SQS access denial on receive stops the run with SQS_PERMISSION_DENIED", async () => {
    sqs
      .on(ReceiveMessageCommand)
      .rejects(Object.assign(new Error("denied"), { name: "AccessDenied" }));
    await expect(inboundReprocess({ yes: true })).rejects.toMatchObject({
      code: "SQS_PERMISSION_DENIED",
      suggestion:
        "Re-apply the Wraps IAM policy, which now includes the InboundReprocess statement: run wraps permissions --service email --policy-dir ./wraps-policy and update each wraps-deployer-<n> policy in IAM from its file",
    });
    expect(lambda.commandCalls(InvokeCommand)).toHaveLength(0);
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
      code: "CONFIRMATION_REQUIRED",
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
      code: "INBOUND_NOT_DEPLOYED",
      message: expect.stringContaining("us-east-1"),
    });
  });
});
