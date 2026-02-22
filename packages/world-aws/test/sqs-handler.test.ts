import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { Context, SQSEvent } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSQSHandler } from "../src/lambda/sqs-handler.js";

const sqsMock = mockClient(SQSClient);

function makeSQSRecord(
  messageId: string,
  body: Record<string, unknown>,
  receiveCount = 1
) {
  return {
    messageId,
    receiptHandle: `handle-${messageId}`,
    body: JSON.stringify(body),
    attributes: {
      ApproximateReceiveCount: String(receiveCount),
      ApproximateFirstReceiveTimestamp: "0",
      SenderId: "sender",
      SentTimestamp: "0",
    },
    messageAttributes: {},
    md5OfBody: "abc",
    eventSource: "aws:sqs" as const,
    eventSourceARN: "arn:aws:sqs:us-east-1:123:test-queue",
    awsRegion: "us-east-1",
  };
}

function makeEvent(records: ReturnType<typeof makeSQSRecord>[]): SQSEvent {
  return { Records: records };
}

const mockContext = {} as Context;

beforeEach(() => {
  sqsMock.reset();
  sqsMock.on(SendMessageCommand).resolves({ MessageId: "re-queued-1" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSQSHandler", () => {
  it("processes all records successfully", async () => {
    const handlerFn = vi
      .fn()
      .mockImplementation(() => new Response("ok", { status: 200 }));
    const handler = createSQSHandler(handlerFn);

    const event = makeEvent([
      makeSQSRecord("msg-1", {
        queueName: "__wkf_workflow_test",
        message: {},
        messageId: "m1",
      }),
      makeSQSRecord("msg-2", {
        queueName: "__wkf_workflow_test",
        message: {},
        messageId: "m2",
      }),
    ]);

    const result = await handler(event, mockContext);

    expect(result.batchItemFailures).toHaveLength(0);
    expect(handlerFn).toHaveBeenCalledTimes(2);
  });

  it("reports partial batch failures", async () => {
    let callCount = 0;
    const handlerFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        return new Response("error", { status: 500 });
      }
      return new Response("ok", { status: 200 });
    });

    const handler = createSQSHandler(handlerFn);

    const event = makeEvent([
      makeSQSRecord("msg-1", {
        queueName: "__wkf_step_a",
        message: {},
        messageId: "m1",
      }),
      makeSQSRecord("msg-2", {
        queueName: "__wkf_step_b",
        message: {},
        messageId: "m2",
      }),
      makeSQSRecord("msg-3", {
        queueName: "__wkf_step_c",
        message: {},
        messageId: "m3",
      }),
    ]);

    const result = await handler(event, mockContext);

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe("msg-2");
  });

  it("catches handler exceptions as failures", async () => {
    const handlerFn = vi.fn().mockRejectedValue(new Error("Handler crashed"));
    const handler = createSQSHandler(handlerFn);

    const event = makeEvent([
      makeSQSRecord("msg-1", {
        queueName: "__wkf_workflow_test",
        message: {},
        messageId: "m1",
      }),
    ]);

    const result = await handler(event, mockContext);

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe("msg-1");
  });

  it("increments attempt from ApproximateReceiveCount", async () => {
    let receivedBody: Record<string, unknown> | null = null;
    const handlerFn = vi.fn().mockImplementation(async (req: Request) => {
      receivedBody = await req.json();
      return new Response("ok", { status: 200 });
    });

    const handler = createSQSHandler(handlerFn);

    const event = makeEvent([
      makeSQSRecord(
        "msg-1",
        {
          queueName: "__wkf_step_test",
          message: { runId: "r1" },
          messageId: "m1",
          attempt: 1,
        },
        3
      ),
    ]);

    await handler(event, mockContext);

    expect(receivedBody).not.toBeNull();
    expect(receivedBody!.attempt).toBe(3);
  });

  it("returns empty failures when all succeed", async () => {
    const handlerFn = vi
      .fn()
      .mockImplementation(() => new Response("ok", { status: 200 }));
    const handler = createSQSHandler(handlerFn);

    const event = makeEvent([
      makeSQSRecord("msg-1", {
        queueName: "__wkf_workflow_a",
        message: {},
        messageId: "m1",
      }),
    ]);

    const result = await handler(event, mockContext);

    expect(result.batchItemFailures).toEqual([]);
  });

  it("reports all records as failed when handler always throws", async () => {
    const handlerFn = vi.fn().mockRejectedValue(new Error("boom"));
    const handler = createSQSHandler(handlerFn);

    const event = makeEvent([
      makeSQSRecord("msg-1", { message: {}, messageId: "m1" }),
      makeSQSRecord("msg-2", { message: {}, messageId: "m2" }),
    ]);

    const result = await handler(event, mockContext);

    expect(result.batchItemFailures).toHaveLength(2);
    expect(
      result.batchItemFailures.map(
        (f: { itemIdentifier: string }) => f.itemIdentifier
      )
    ).toEqual(["msg-1", "msg-2"]);
  });

  it("constructs a POST request to /queue", async () => {
    let receivedReq: Request | null = null;
    const handlerFn = vi.fn().mockImplementation(async (req: Request) => {
      receivedReq = req;
      return new Response("ok", { status: 200 });
    });

    const handler = createSQSHandler(handlerFn);

    const event = makeEvent([
      makeSQSRecord("msg-1", {
        queueName: "__wkf_workflow_test",
        message: { data: 1 },
        messageId: "m1",
      }),
    ]);

    await handler(event, mockContext);

    expect(receivedReq).not.toBeNull();
    expect(receivedReq!.method).toBe("POST");
    expect(new URL(receivedReq!.url).pathname).toBe("/queue");
    expect(receivedReq!.headers.get("Content-Type")).toBe("application/json");
  });

  it("calls onTimeout when handler returns timeoutSeconds", async () => {
    const onTimeout = vi.fn().mockResolvedValue(undefined);
    const handlerFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ timeoutSeconds: 60 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const handler = createSQSHandler(handlerFn, { onTimeout });
    const record = makeSQSRecord("msg-1", {
      queueName: "__wkf_step_test",
      message: {},
      messageId: "m1",
    });
    const event = makeEvent([record]);

    const result = await handler(event, mockContext);

    expect(result.batchItemFailures).toHaveLength(0);
    expect(onTimeout).toHaveBeenCalledOnce();
    expect(onTimeout).toHaveBeenCalledWith({
      record,
      timeoutSeconds: 60,
    });
  });

  it("re-queues via SQS when no onTimeout and timeoutSeconds <= 900", async () => {
    const handlerFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ timeoutSeconds: 300 }), { status: 200 })
    );

    const handler = createSQSHandler(handlerFn);
    const body = {
      queueName: "__wkf_step_test",
      message: {},
      messageId: "m1",
    };
    const event = makeEvent([makeSQSRecord("msg-1", body)]);

    const result = await handler(event, mockContext);

    expect(result.batchItemFailures).toHaveLength(0);
    const calls = sqsMock.commandCalls(SendMessageCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input).toEqual({
      QueueUrl: "https://sqs.us-east-1.amazonaws.com/123/test-queue",
      MessageBody: JSON.stringify(body),
      DelaySeconds: 300,
    });
  });

  it("caps delay at 900s and warns for long sleeps", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handlerFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ timeoutSeconds: 3600 }), { status: 200 })
    );

    const handler = createSQSHandler(handlerFn);
    const event = makeEvent([
      makeSQSRecord("msg-1", {
        queueName: "__wkf_step_test",
        message: {},
        messageId: "m1",
      }),
    ]);

    const result = await handler(event, mockContext);

    expect(result.batchItemFailures).toHaveLength(0);
    const calls = sqsMock.commandCalls(SendMessageCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.DelaySeconds).toBe(900);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("3600s exceeds SQS max delay");
  });

  it("does not re-queue when timeoutSeconds is 0", async () => {
    const onTimeout = vi.fn();
    const handlerFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ timeoutSeconds: 0 }), { status: 200 })
    );

    const handler = createSQSHandler(handlerFn, { onTimeout });
    const event = makeEvent([
      makeSQSRecord("msg-1", { message: {}, messageId: "m1" }),
    ]);

    const result = await handler(event, mockContext);

    expect(result.batchItemFailures).toHaveLength(0);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0);
  });

  it("reports onTimeout errors as batch failures", async () => {
    const onTimeout = vi
      .fn()
      .mockRejectedValue(new Error("Scheduler failed"));
    const handlerFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ timeoutSeconds: 60 }), { status: 200 })
    );

    const handler = createSQSHandler(handlerFn, { onTimeout });
    const event = makeEvent([
      makeSQSRecord("msg-1", { message: {}, messageId: "m1" }),
    ]);

    const result = await handler(event, mockContext);

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe("msg-1");
  });

  it("reports SQS re-queue failure as batch failure", async () => {
    sqsMock.on(SendMessageCommand).rejects(new Error("SQS unavailable"));
    const handlerFn = vi.fn().mockImplementation(
      () =>
        new Response(JSON.stringify({ timeoutSeconds: 60 }), { status: 200 })
    );

    const handler = createSQSHandler(handlerFn);
    const event = makeEvent([
      makeSQSRecord("msg-1", { message: {}, messageId: "m1" }),
    ]);

    const result = await handler(event, mockContext);

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe("msg-1");
  });

  it("does not re-queue when timeoutSeconds is negative", async () => {
    const onTimeout = vi.fn();
    const handlerFn = vi.fn().mockImplementation(
      () =>
        new Response(JSON.stringify({ timeoutSeconds: -1 }), { status: 200 })
    );

    const handler = createSQSHandler(handlerFn, { onTimeout });
    const event = makeEvent([
      makeSQSRecord("msg-1", { message: {}, messageId: "m1" }),
    ]);

    const result = await handler(event, mockContext);

    expect(result.batchItemFailures).toHaveLength(0);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0);
  });

  it("handles mixed batch: timeout and normal records independently", async () => {
    let callCount = 0;
    const handlerFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        return new Response(JSON.stringify({ timeoutSeconds: 120 }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const handler = createSQSHandler(handlerFn);
    const event = makeEvent([
      makeSQSRecord("msg-1", { message: {}, messageId: "m1" }),
      makeSQSRecord("msg-2", { message: {}, messageId: "m2" }),
      makeSQSRecord("msg-3", { message: {}, messageId: "m3" }),
    ]);

    const result = await handler(event, mockContext);

    expect(result.batchItemFailures).toHaveLength(0);
    expect(handlerFn).toHaveBeenCalledTimes(3);
    const calls = sqsMock.commandCalls(SendMessageCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.DelaySeconds).toBe(120);
  });
});
