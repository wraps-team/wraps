import type { Context, SQSEvent } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";
import { createSQSHandler } from "../src/lambda/sqs-handler.js";

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

describe("createSQSHandler", () => {
  it("processes all records successfully", async () => {
    const handlerFn = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
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
      .mockResolvedValue(new Response("ok", { status: 200 }));
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
});
