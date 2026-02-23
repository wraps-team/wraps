import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import type { ResolvedConfig } from "../src/config.js";
import { createQueue } from "../src/queue/index.js";

const sqsMock = mockClient(SQSClient);
const sqsClient = new SQSClient({ region: "us-east-1" });

const config: ResolvedConfig = {
  region: "us-east-1",
  tablePrefix: "test",
  queuePrefix: "test",
  endpoint: undefined,
  deploymentId: "aws-us-east-1",
};

beforeEach(() => {
  sqsMock.reset();
  sqsMock.on(SendMessageCommand).resolves({ MessageId: "sqs-msg-1" });
  process.env.AWS_ACCOUNT_ID = "123456789012";
});

describe("Queue", () => {
  it("getDeploymentId() returns config deploymentId", async () => {
    const queue = createQueue(sqsClient, config);
    expect(await queue.getDeploymentId()).toBe("aws-us-east-1");
  });

  it("queue() routes workflow messages to workflows queue", async () => {
    const queue = createQueue(sqsClient, config);
    await queue.queue("__wkf_workflow_test", { runId: "run-1" });

    const calls = sqsMock.commandCalls(SendMessageCommand);
    expect(calls[0].args[0].input.QueueUrl).toContain("test-workflows");
    expect(calls[0].args[0].input.QueueUrl).not.toContain("test-steps");
  });

  it("queue() routes step messages to steps queue", async () => {
    const queue = createQueue(sqsClient, config);
    await queue.queue("__wkf_step_test", {
      workflowName: "wf",
      workflowRunId: "run-1",
      workflowStartedAt: Date.now(),
      stepId: "step-1",
    });

    const calls = sqsMock.commandCalls(SendMessageCommand);
    expect(calls[0].args[0].input.QueueUrl).toContain("test-steps");
  });

  it("queue() returns a message ID", async () => {
    const queue = createQueue(sqsClient, config);
    const result = await queue.queue("__wkf_workflow_test", { runId: "run-1" });

    expect(result.messageId).toBeTruthy();
    expect(typeof result.messageId).toBe("string");
  });

  it("queue() includes idempotency key in message attributes", async () => {
    const queue = createQueue(sqsClient, config);
    await queue.queue(
      "__wkf_workflow_test",
      { runId: "run-1" },
      {
        idempotencyKey: "idem-1",
      }
    );

    const calls = sqsMock.commandCalls(SendMessageCommand);
    expect(calls[0].args[0].input.MessageAttributes!.IdempotencyKey).toEqual({
      DataType: "String",
      StringValue: "idem-1",
    });
  });

  it("queue() passes delaySeconds", async () => {
    const queue = createQueue(sqsClient, config);
    await queue.queue(
      "__wkf_workflow_test",
      { runId: "run-1" },
      {
        delaySeconds: 30,
      }
    );

    const calls = sqsMock.commandCalls(SendMessageCommand);
    expect(calls[0].args[0].input.DelaySeconds).toBe(30);
  });

  it("createQueueHandler() returns HTTP handler", async () => {
    const queue = createQueue(sqsClient, config);

    const handler = queue.createQueueHandler(
      "__wkf_workflow_",
      async (message, meta) => {
        expect(meta.queueName).toBe("__wkf_workflow_test");
        expect(meta.messageId).toBe("msg-1");
      }
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

  it("queue URL uses custom endpoint format", async () => {
    const endpointConfig: ResolvedConfig = {
      ...config,
      endpoint: "http://localhost:4566",
    };
    const queue = createQueue(sqsClient, endpointConfig);
    await queue.queue("__wkf_workflow_test", { runId: "run-1" });

    const calls = sqsMock.commandCalls(SendMessageCommand);
    expect(calls[0].args[0].input.QueueUrl).toBe(
      "http://localhost:4566/000000000000/test-workflows"
    );
  });

  it("queue URL throws when AWS_ACCOUNT_ID missing and no endpoint", async () => {
    const originalAccountId = process.env.AWS_ACCOUNT_ID;
    const originalWorkflowsUrl = process.env.WORKFLOW_AWS_WORKFLOWS_QUEUE_URL;
    // biome-ignore lint/performance/noDelete: process.env coerces undefined to string "undefined"
    delete process.env.AWS_ACCOUNT_ID;
    // biome-ignore lint/performance/noDelete: process.env coerces undefined to string "undefined"
    delete process.env.WORKFLOW_AWS_WORKFLOWS_QUEUE_URL;

    try {
      const queue = createQueue(sqsClient, config);
      await expect(
        queue.queue("__wkf_workflow_test", { runId: "run-1" })
      ).rejects.toThrow("AWS_ACCOUNT_ID");
    } finally {
      if (originalAccountId !== undefined)
        process.env.AWS_ACCOUNT_ID = originalAccountId;
      if (originalWorkflowsUrl !== undefined)
        process.env.WORKFLOW_AWS_WORKFLOWS_QUEUE_URL = originalWorkflowsUrl;
    }
  });

  it("createQueueHandler() supports header-based protocol", async () => {
    const queue = createQueue(sqsClient, config);

    const handler = queue.createQueueHandler(
      "__wkf_workflow_",
      async (message, meta) => {
        expect(meta.queueName).toBe("__wkf_workflow_test");
        expect(meta.messageId).toBe("msg-h1");
        expect(meta.attempt).toBe(2);
        expect(message).toEqual({ runId: "run-1" });
      }
    );

    const req = new Request("https://localhost/queue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vqs-queue-name": "__wkf_workflow_test",
        "x-vqs-message-id": "msg-h1",
        "x-vqs-message-attempt": "2",
      },
      body: JSON.stringify({ runId: "run-1" }),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
  });

  it("createQueueHandler() header protocol rejects mismatched prefix", async () => {
    const queue = createQueue(sqsClient, config);
    const handler = queue.createQueueHandler("__wkf_step_", async () => {});

    const req = new Request("https://localhost/queue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vqs-queue-name": "__wkf_workflow_test",
        "x-vqs-message-id": "msg-h1",
        "x-vqs-message-attempt": "1",
      },
      body: JSON.stringify({}),
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  it("createQueueHandler() returns 500 on handler error", async () => {
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
