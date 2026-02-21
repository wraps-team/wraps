import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRunsStorage } from "../src/storage/runs.js";
import { createStepsStorage } from "../src/storage/steps.js";
import { createHooksStorage } from "../src/storage/hooks.js";
import { createEventsStorage } from "../src/storage/events.js";
import { getTableNames } from "../src/dynamodb/tables.js";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const tables = getTableNames("test");

function mockDocClient(responses: Record<string, unknown> = {}): DynamoDBDocumentClient {
  return {
    send: vi.fn().mockImplementation((command) => {
      const commandName = command.constructor.name;
      if (responses[commandName]) {
        return Promise.resolve(responses[commandName]);
      }
      return Promise.resolve({ Items: [], Item: null });
    }),
    destroy: vi.fn(),
  } as unknown as DynamoDBDocumentClient;
}

describe("RunsStorage", () => {
  it("get() throws when run not found", async () => {
    const docClient = mockDocClient({ GetCommand: { Item: null } });
    const runs = createRunsStorage(docClient, tables);

    await expect(runs.get("nonexistent")).rejects.toThrow("Run not found");
  });

  it("get() returns marshalled run with Date fields", async () => {
    const now = new Date().toISOString();
    const docClient = mockDocClient({
      GetCommand: {
        Item: {
          runId: "run-1",
          status: "running",
          deploymentId: "dep-1",
          workflowName: "test-workflow",
          input: new Uint8Array([1, 2, 3]),
          createdAt: now,
          updatedAt: now,
          startedAt: now,
        },
      },
    });

    const runs = createRunsStorage(docClient, tables);
    const run = await runs.get("run-1");

    expect(run.runId).toBe("run-1");
    expect(run.status).toBe("running");
    expect(run.createdAt).toBeInstanceOf(Date);
    expect(run.startedAt).toBeInstanceOf(Date);
    expect(run.input).toBeInstanceOf(Uint8Array);
  });

  it("get() with resolveData none strips input/output", async () => {
    const now = new Date().toISOString();
    const docClient = mockDocClient({
      GetCommand: {
        Item: {
          runId: "run-1",
          status: "pending",
          deploymentId: "dep-1",
          workflowName: "test-workflow",
          createdAt: now,
          updatedAt: now,
        },
      },
    });

    const runs = createRunsStorage(docClient, tables);
    const run = await runs.get("run-1", { resolveData: "none" });

    expect(run.input).toBeUndefined();
    expect(run.output).toBeUndefined();
  });

  it("list() returns paginated response", async () => {
    const now = new Date().toISOString();
    const docClient = mockDocClient({
      ScanCommand: {
        Items: [
          { runId: "run-1", status: "pending", deploymentId: "dep-1", workflowName: "wf", input: new Uint8Array(), createdAt: now, updatedAt: now },
        ],
        LastEvaluatedKey: { runId: "run-1" },
      },
    });

    const runs = createRunsStorage(docClient, tables);
    const result = await runs.list();

    expect(result.data).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toBeTruthy();
  });

  it("list() filters by workflowName using GSI", async () => {
    const docClient = mockDocClient({
      QueryCommand: { Items: [], LastEvaluatedKey: undefined },
    });

    const runs = createRunsStorage(docClient, tables);
    await runs.list({ workflowName: "test-workflow" });

    const call = (docClient.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.input.IndexName).toBe("gsi-workflow-name");
  });

  it("list() filters by status using GSI", async () => {
    const docClient = mockDocClient({
      QueryCommand: { Items: [], LastEvaluatedKey: undefined },
    });

    const runs = createRunsStorage(docClient, tables);
    await runs.list({ status: "running" });

    const call = (docClient.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.input.IndexName).toBe("gsi-status");
  });
});

describe("StepsStorage", () => {
  it("get() returns marshalled step", async () => {
    const now = new Date().toISOString();
    const docClient = mockDocClient({
      GetCommand: {
        Item: {
          stepId: "step-1",
          runId: "run-1",
          stepName: "process",
          status: "completed",
          input: new Uint8Array([1]),
          output: new Uint8Array([2]),
          attempt: 1,
          createdAt: now,
          updatedAt: now,
          completedAt: now,
        },
      },
    });

    const steps = createStepsStorage(docClient, tables);
    const step = await steps.get("run-1", "step-1");

    expect(step.stepId).toBe("step-1");
    expect(step.status).toBe("completed");
    expect(step.completedAt).toBeInstanceOf(Date);
  });

  it("list() queries by runId via GSI", async () => {
    const docClient = mockDocClient({
      QueryCommand: { Items: [], LastEvaluatedKey: undefined },
    });

    const steps = createStepsStorage(docClient, tables);
    await steps.list({ runId: "run-1" });

    const call = (docClient.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.input.IndexName).toBe("gsi-run");
  });
});

describe("HooksStorage", () => {
  it("get() returns marshalled hook", async () => {
    const now = new Date().toISOString();
    const docClient = mockDocClient({
      GetCommand: {
        Item: {
          hookId: "hook-1",
          runId: "run-1",
          token: "secret-token",
          ownerId: "",
          projectId: "",
          createdAt: now,
        },
      },
    });

    const hooks = createHooksStorage(docClient, tables);
    const hook = await hooks.get("hook-1");

    expect(hook.hookId).toBe("hook-1");
    expect(hook.token).toBe("secret-token");
    expect(hook.createdAt).toBeInstanceOf(Date);
  });

  it("getByToken() queries GSI", async () => {
    const now = new Date().toISOString();
    const docClient = mockDocClient({
      QueryCommand: {
        Items: [
          { hookId: "hook-1", runId: "run-1", token: "tok", ownerId: "", projectId: "", createdAt: now },
        ],
      },
    });

    const hooks = createHooksStorage(docClient, tables);
    const hook = await hooks.getByToken("tok");

    expect(hook.hookId).toBe("hook-1");
    const call = (docClient.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.input.IndexName).toBe("gsi-token");
  });

  it("getByToken() throws when not found", async () => {
    const docClient = mockDocClient({
      QueryCommand: { Items: [] },
    });

    const hooks = createHooksStorage(docClient, tables);
    await expect(hooks.getByToken("missing")).rejects.toThrow("Hook not found for token");
  });
});

describe("EventsStorage", () => {
  it("create() run_created generates IDs and creates run", async () => {
    const sendMock = vi.fn().mockResolvedValue({});
    const docClient = { send: sendMock, destroy: vi.fn() } as unknown as DynamoDBDocumentClient;

    const events = createEventsStorage(docClient, tables);
    const result = await events.create(null, {
      eventType: "run_created",
      eventData: {
        deploymentId: "dep-1",
        workflowName: "test-workflow",
        input: new Uint8Array([1, 2]),
      },
    });

    expect(result.event).toBeDefined();
    expect(result.event!.eventType).toBe("run_created");
    expect(result.event!.runId).toBeTruthy();
    expect(result.run).toBeDefined();
    expect(result.run!.status).toBe("pending");

    // Should have used TransactWriteCommand
    const transactCall = sendMock.mock.calls[0][0];
    expect(transactCall.constructor.name).toBe("TransactWriteCommand");
  });

  it("create() run_started updates run status", async () => {
    const sendMock = vi.fn()
      .mockResolvedValueOnce({}) // TransactWrite
      .mockResolvedValueOnce({ // GetCommand for run
        Item: {
          runId: "run-1",
          status: "running",
          deploymentId: "dep-1",
          workflowName: "wf",
          input: new Uint8Array(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
        },
      });
    const docClient = { send: sendMock, destroy: vi.fn() } as unknown as DynamoDBDocumentClient;

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", { eventType: "run_started" });

    expect(result.event!.eventType).toBe("run_started");
    expect(result.run!.status).toBe("running");
  });

  it("create() step_created creates step entity", async () => {
    const sendMock = vi.fn().mockResolvedValue({});
    const docClient = { send: sendMock, destroy: vi.fn() } as unknown as DynamoDBDocumentClient;

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "step_created",
      correlationId: "step-1",
      eventData: {
        stepName: "process-data",
        input: new Uint8Array([1]),
      },
    });

    expect(result.event!.eventType).toBe("step_created");
    expect(result.step).toBeDefined();
    expect(result.step!.stepName).toBe("process-data");
    expect(result.step!.status).toBe("pending");
  });

  it("create() hook_created with token conflict creates hook_conflict event", async () => {
    const sendMock = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("Conflict"), { name: "ConditionalCheckFailedException" }))
      .mockResolvedValueOnce({}); // PutCommand for conflict event
    const docClient = { send: sendMock, destroy: vi.fn() } as unknown as DynamoDBDocumentClient;

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "hook_created",
      correlationId: "hook-1",
      eventData: { token: "dup-token" },
    });

    expect(result.event!.eventType).toBe("hook_conflict");
    expect(result.hook).toBeUndefined();
  });

  it("create() throws on unknown event type", async () => {
    const docClient = mockDocClient();
    const events = createEventsStorage(docClient, tables);

    await expect(events.create("run-1", { eventType: "unknown_event" })).rejects.toThrow("Unknown event type");
  });

  it("list() queries events by runId", async () => {
    const now = new Date().toISOString();
    const docClient = mockDocClient({
      QueryCommand: {
        Items: [
          { runId: "run-1", eventId: "evt-1", eventType: "run_created", createdAt: now },
          { runId: "run-1", eventId: "evt-2", eventType: "run_started", createdAt: now },
        ],
      },
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.list({ runId: "run-1" });

    expect(result.data).toHaveLength(2);
    expect(result.data[0].eventType).toBe("run_created");
    expect(result.data[0].createdAt).toBeInstanceOf(Date);
  });

  it("list() with resolveData none strips eventData", async () => {
    const now = new Date().toISOString();
    const docClient = mockDocClient({
      QueryCommand: {
        Items: [
          { runId: "run-1", eventId: "evt-1", eventType: "run_created", eventData: { some: "data" }, createdAt: now },
        ],
      },
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.list({ runId: "run-1", resolveData: "none" });

    expect(result.data[0]).not.toHaveProperty("eventData");
  });

  it("listByCorrelationId() queries GSI", async () => {
    const docClient = mockDocClient({
      QueryCommand: { Items: [], LastEvaluatedKey: undefined },
    });

    const events = createEventsStorage(docClient, tables);
    await events.listByCorrelationId({ correlationId: "step-1" });

    const call = (docClient.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.input.IndexName).toBe("gsi-correlation");
  });
});
