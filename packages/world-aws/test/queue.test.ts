import { describe, it, expect, vi } from "vitest";
import { createQueue } from "../src/queue/index.js";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { ResolvedConfig } from "../src/config.js";

function mockSQSClient(): SQSClient {
  return {
    send: vi.fn().mockResolvedValue({ MessageId: "sqs-msg-1" }),
    destroy: vi.fn(),
  } as unknown as SQSClient;
}

const config: ResolvedConfig = {
  region: "us-east-1",
  tablePrefix: "test",
  queuePrefix: "test",
  endpoint: undefined,
  deploymentId: "aws-us-east-1",
};

describe("Queue", () => {
  it("getDeploymentId() returns config deploymentId", async () => {
    const sqsClient = mockSQSClient();
    const queue = createQueue(sqsClient, config);

    expect(await queue.getDeploymentId()).toBe("aws-us-east-1");
  });

  it("queue() routes workflow messages to workflows queue", async () => {
    const sqsClient = mockSQSClient();
    const queue = createQueue(sqsClient, config);

    await queue.queue("__wkf_workflow_test", { runId: "run-1" });

    const call = (sqsClient.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.input.QueueUrl).toContain("test-workflows");
    expect(call.input.QueueUrl).not.toContain("test-steps");
  });

  it("queue() routes step messages to steps queue", async () => {
    const sqsClient = mockSQSClient();
    const queue = createQueue(sqsClient, config);

    await queue.queue("__wkf_step_test", {
      workflowName: "wf",
      workflowRunId: "run-1",
      workflowStartedAt: Date.now(),
      stepId: "step-1",
    });

    const call = (sqsClient.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.input.QueueUrl).toContain("test-steps");
  });

  it("queue() returns a message ID", async () => {
    const sqsClient = mockSQSClient();
    const queue = createQueue(sqsClient, config);

    const result = await queue.queue("__wkf_workflow_test", { runId: "run-1" });

    expect(result.messageId).toBeTruthy();
    expect(typeof result.messageId).toBe("string");
  });

  it("queue() includes idempotency key in message attributes", async () => {
    const sqsClient = mockSQSClient();
    const queue = createQueue(sqsClient, config);

    await queue.queue("__wkf_workflow_test", { runId: "run-1" }, {
      idempotencyKey: "idem-1",
    });

    const call = (sqsClient.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.input.MessageAttributes.IdempotencyKey).toEqual({
      DataType: "String",
      StringValue: "idem-1",
    });
  });

  it("queue() passes delaySeconds", async () => {
    const sqsClient = mockSQSClient();
    const queue = createQueue(sqsClient, config);

    await queue.queue("__wkf_workflow_test", { runId: "run-1" }, {
      delaySeconds: 30,
    });

    const call = (sqsClient.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.input.DelaySeconds).toBe(30);
  });

  it("createQueueHandler() returns HTTP handler", async () => {
    const sqsClient = mockSQSClient();
    const queue = createQueue(sqsClient, config);

    const handler = queue.createQueueHandler(
      "__wkf_workflow_",
      async (message, meta) => {
        expect(meta.queueName).toBe("__wkf_workflow_test");
        expect(meta.messageId).toBe("msg-1");
      },
    );

    const req = new Request("https://localhost/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queueName: "__wkf_workflow_test",
        message: { runId: "run-1" },
        messageId: "msg-1",
        attempt: 1,
      }),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
  });

  it("createQueueHandler() rejects mismatched queue prefix", async () => {
    const sqsClient = mockSQSClient();
    const queue = createQueue(sqsClient, config);

    const handler = queue.createQueueHandler("__wkf_step_", async () => {});

    const req = new Request("https://localhost/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queueName: "__wkf_workflow_test",
        message: {},
        messageId: "msg-1",
      }),
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  it("createQueueHandler() returns 500 on handler error", async () => {
    const sqsClient = mockSQSClient();
    const queue = createQueue(sqsClient, config);

    const handler = queue.createQueueHandler("__wkf_workflow_", async () => {
      throw new Error("Handler failed");
    });

    const req = new Request("https://localhost/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queueName: "__wkf_workflow_test",
        message: {},
        messageId: "msg-1",
      }),
    });

    const res = await handler(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Handler failed");
  });
});
