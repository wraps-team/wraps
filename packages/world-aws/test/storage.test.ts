import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { getTableNames } from "../src/dynamodb/tables.js";
import { WorldError } from "../src/errors.js";
import { createEventsStorage } from "../src/storage/events.js";
import { createHooksStorage } from "../src/storage/hooks.js";
import { createRunsStorage } from "../src/storage/runs.js";
import { createStepsStorage } from "../src/storage/steps.js";
import { createWaitsStorage } from "../src/storage/waits.js";

const tables = getTableNames("test");

const ddbMock = mockClient(DynamoDBClient);
const docMock = mockClient(DynamoDBDocumentClient);

const docClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "us-east-1" })
);

beforeEach(() => {
  ddbMock.reset();
  docMock.reset();
});

const now = new Date().toISOString();

describe("RunsStorage", () => {
  it("get() throws when run not found", async () => {
    docMock.on(GetCommand).resolves({ Item: undefined });
    const runs = createRunsStorage(docClient, tables);

    await expect(runs.get("nonexistent")).rejects.toThrow("Run not found");
  });

  it("get() returns marshalled run with Date fields", async () => {
    docMock.on(GetCommand).resolves({
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
    docMock.on(GetCommand).resolves({
      Item: {
        runId: "run-1",
        status: "pending",
        deploymentId: "dep-1",
        workflowName: "test-workflow",
        createdAt: now,
        updatedAt: now,
      },
    });

    const runs = createRunsStorage(docClient, tables);
    const run = await runs.get("run-1", { resolveData: "none" });

    expect(run.input).toBeUndefined();
    expect(run.output).toBeUndefined();
  });

  it("list() returns paginated response", async () => {
    docMock.on(ScanCommand).resolves({
      Items: [
        {
          runId: "run-1",
          status: "pending",
          deploymentId: "dep-1",
          workflowName: "wf",
          input: new Uint8Array(),
          createdAt: now,
          updatedAt: now,
        },
      ],
      LastEvaluatedKey: { runId: "run-1" },
    });

    const runs = createRunsStorage(docClient, tables);
    const result = await runs.list();

    expect(result.data).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toBeTruthy();
  });

  it("list() filters by workflowName using GSI", async () => {
    docMock.on(QueryCommand).resolves({ Items: [] });

    const runs = createRunsStorage(docClient, tables);
    await runs.list({ workflowName: "test-workflow" });

    const calls = docMock.commandCalls(QueryCommand);
    expect(calls[0].args[0].input.IndexName).toBe("gsi-workflow-name");
  });

  it("list() filters by status using GSI", async () => {
    docMock.on(QueryCommand).resolves({ Items: [] });

    const runs = createRunsStorage(docClient, tables);
    await runs.list({ status: "running" });

    const calls = docMock.commandCalls(QueryCommand);
    expect(calls[0].args[0].input.IndexName).toBe("gsi-status");
  });

  it("list() returns empty results correctly", async () => {
    docMock.on(ScanCommand).resolves({ Items: [] });

    const runs = createRunsStorage(docClient, tables);
    const result = await runs.list();

    expect(result.data).toEqual([]);
    expect(result.cursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  it("list() single item without LastEvaluatedKey has hasMore false", async () => {
    docMock.on(ScanCommand).resolves({
      Items: [
        {
          runId: "run-1",
          status: "pending",
          deploymentId: "dep-1",
          workflowName: "wf",
          input: new Uint8Array(),
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    const runs = createRunsStorage(docClient, tables);
    const result = await runs.list();

    expect(result.data).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeNull();
  });

  it("list() caps limit at 1000", async () => {
    docMock.on(ScanCommand).resolves({ Items: [] });

    const runs = createRunsStorage(docClient, tables);
    await runs.list({ pagination: { limit: 5000 } });

    const calls = docMock.commandCalls(ScanCommand);
    expect(calls[0].args[0].input.Limit).toBe(1000);
  });

  it("list() cursor round-trip passes ExclusiveStartKey", async () => {
    const cursorKey = { runId: "run-1" };
    const cursor = Buffer.from(JSON.stringify(cursorKey))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    docMock.on(ScanCommand).resolves({ Items: [] });

    const runs = createRunsStorage(docClient, tables);
    await runs.list({ pagination: { cursor } });

    const calls = docMock.commandCalls(ScanCommand);
    expect(calls[0].args[0].input.ExclusiveStartKey).toEqual(cursorKey);
  });

  it("list() sortOrder desc sets ScanIndexForward false", async () => {
    docMock.on(QueryCommand).resolves({ Items: [] });

    const runs = createRunsStorage(docClient, tables);
    await runs.list({
      workflowName: "wf",
      pagination: { sortOrder: "desc" },
    });

    const calls = docMock.commandCalls(QueryCommand);
    expect(calls[0].args[0].input.ScanIndexForward).toBe(false);
  });
});

describe("StepsStorage", () => {
  it("get() returns marshalled step", async () => {
    docMock.on(GetCommand).resolves({
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
    });

    const steps = createStepsStorage(docClient, tables);
    const step = await steps.get("run-1", "step-1");

    expect(step.stepId).toBe("step-1");
    expect(step.status).toBe("completed");
    expect(step.completedAt).toBeInstanceOf(Date);
  });

  it("list() queries by runId via GSI", async () => {
    docMock.on(QueryCommand).resolves({ Items: [] });

    const steps = createStepsStorage(docClient, tables);
    await steps.list({ runId: "run-1" });

    const calls = docMock.commandCalls(QueryCommand);
    expect(calls[0].args[0].input.IndexName).toBe("gsi-run");
  });

  it("list() returns empty results correctly", async () => {
    docMock.on(QueryCommand).resolves({ Items: [] });

    const steps = createStepsStorage(docClient, tables);
    const result = await steps.list({ runId: "run-1" });

    expect(result.data).toEqual([]);
    expect(result.cursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  it("list() caps limit at 1000", async () => {
    docMock.on(QueryCommand).resolves({ Items: [] });

    const steps = createStepsStorage(docClient, tables);
    await steps.list({ runId: "run-1", pagination: { limit: 9999 } });

    const calls = docMock.commandCalls(QueryCommand);
    expect(calls[0].args[0].input.Limit).toBe(1000);
  });

  it("list() sortOrder desc sets ScanIndexForward false", async () => {
    docMock.on(QueryCommand).resolves({ Items: [] });

    const steps = createStepsStorage(docClient, tables);
    await steps.list({ runId: "run-1", pagination: { sortOrder: "desc" } });

    const calls = docMock.commandCalls(QueryCommand);
    expect(calls[0].args[0].input.ScanIndexForward).toBe(false);
  });
});

describe("HooksStorage", () => {
  it("get() returns marshalled hook", async () => {
    docMock.on(GetCommand).resolves({
      Item: {
        hookId: "hook-1",
        runId: "run-1",
        token: "secret-token",
        ownerId: "",
        projectId: "",
        createdAt: now,
      },
    });

    const hooks = createHooksStorage(docClient, tables);
    const hook = await hooks.get("hook-1");

    expect(hook.hookId).toBe("hook-1");
    expect(hook.token).toBe("secret-token");
    expect(hook.createdAt).toBeInstanceOf(Date);
  });

  it("getByToken() queries GSI", async () => {
    docMock.on(QueryCommand).resolves({
      Items: [
        {
          hookId: "hook-1",
          runId: "run-1",
          token: "tok",
          ownerId: "",
          projectId: "",
          createdAt: now,
        },
      ],
    });

    const hooks = createHooksStorage(docClient, tables);
    const hook = await hooks.getByToken("tok");

    expect(hook.hookId).toBe("hook-1");
    const calls = docMock.commandCalls(QueryCommand);
    expect(calls[0].args[0].input.IndexName).toBe("gsi-token");
  });

  it("getByToken() throws when not found", async () => {
    docMock.on(QueryCommand).resolves({ Items: [] });

    const hooks = createHooksStorage(docClient, tables);
    await expect(hooks.getByToken("missing")).rejects.toThrow(
      "Hook not found for token"
    );
  });

  it("list() returns empty results correctly", async () => {
    docMock.on(ScanCommand).resolves({ Items: [] });

    const hooks = createHooksStorage(docClient, tables);
    const result = await hooks.list({});

    expect(result.data).toEqual([]);
    expect(result.cursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  it("list() caps limit at 1000", async () => {
    docMock.on(ScanCommand).resolves({ Items: [] });

    const hooks = createHooksStorage(docClient, tables);
    await hooks.list({ pagination: { limit: 2000 } });

    const calls = docMock.commandCalls(ScanCommand);
    expect(calls[0].args[0].input.Limit).toBe(1000);
  });

  it("list() sortOrder desc sets ScanIndexForward false", async () => {
    docMock.on(QueryCommand).resolves({ Items: [] });

    const hooks = createHooksStorage(docClient, tables);
    await hooks.list({ runId: "run-1", pagination: { sortOrder: "desc" } });

    const calls = docMock.commandCalls(QueryCommand);
    expect(calls[0].args[0].input.ScanIndexForward).toBe(false);
  });
});

describe("EventsStorage", () => {
  it("create() run_created generates IDs and creates run", async () => {
    docMock.on(TransactWriteCommand).resolves({});

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

    const calls = docMock.commandCalls(TransactWriteCommand);
    expect(calls).toHaveLength(1);

    const runPut = calls[0].args[0].input.TransactItems![1].Put;
    expect(runPut!.ConditionExpression).toBe("attribute_not_exists(runId)");
  });

  it("create() run_started updates run status", async () => {
    docMock.on(TransactWriteCommand).resolves({});
    docMock.on(GetCommand).resolves({
      Item: {
        runId: "run-1",
        status: "running",
        deploymentId: "dep-1",
        workflowName: "wf",
        input: new Uint8Array(),
        createdAt: now,
        updatedAt: now,
        startedAt: now,
      },
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", { eventType: "run_started" });

    expect(result.event!.eventType).toBe("run_started");
    expect(result.run!.status).toBe("running");
  });

  it("create() step_created creates step entity", async () => {
    docMock.on(TransactWriteCommand).resolves({});

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
    docMock.on(TransactWriteCommand).rejectsOnce(
      Object.assign(new Error("Transaction cancelled"), {
        name: "TransactionCanceledException",
        CancellationReasons: [
          { Code: "ConditionalCheckFailed" },
          { Code: "None" },
        ],
      })
    );
    docMock.on(PutCommand).resolves({});

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "hook_created",
      correlationId: "hook-1",
      eventData: { token: "dup-token" },
    });

    expect(result.event!.eventType).toBe("hook_conflict");
    expect(result.hook).toBeUndefined();
  });

  it("create() hook_created re-throws non-conflict TransactionCanceledException", async () => {
    docMock.on(TransactWriteCommand).rejectsOnce(
      Object.assign(new Error("Transaction cancelled"), {
        name: "TransactionCanceledException",
        CancellationReasons: [{ Code: "None" }, { Code: "ValidationError" }],
      })
    );

    const events = createEventsStorage(docClient, tables);
    await expect(
      events.create("run-1", {
        eventType: "hook_created",
        correlationId: "hook-1",
        eventData: { token: "tok" },
      })
    ).rejects.toThrow("Transaction cancelled");
  });

  it("create() throws on unknown event type", async () => {
    const events = createEventsStorage(docClient, tables);
    await expect(
      events.create("run-1", { eventType: "unknown_event" })
    ).rejects.toThrow("Unknown event type");
  });

  it("list() queries events by runId", async () => {
    docMock.on(QueryCommand).resolves({
      Items: [
        {
          runId: "run-1",
          eventId: "evt-1",
          eventType: "run_created",
          createdAt: now,
        },
        {
          runId: "run-1",
          eventId: "evt-2",
          eventType: "run_started",
          createdAt: now,
        },
      ],
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.list({ runId: "run-1" });

    expect(result.data).toHaveLength(2);
    expect(result.data[0].eventType).toBe("run_created");
    expect(result.data[0].createdAt).toBeInstanceOf(Date);
  });

  it("list() with resolveData none strips eventData", async () => {
    docMock.on(QueryCommand).resolves({
      Items: [
        {
          runId: "run-1",
          eventId: "evt-1",
          eventType: "run_created",
          eventData: { some: "data" },
          createdAt: now,
        },
      ],
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.list({ runId: "run-1", resolveData: "none" });

    expect(result.data[0]).not.toHaveProperty("eventData");
  });

  it("listByCorrelationId() queries GSI", async () => {
    docMock.on(QueryCommand).resolves({ Items: [] });

    const events = createEventsStorage(docClient, tables);
    await events.listByCorrelationId({ correlationId: "step-1" });

    const calls = docMock.commandCalls(QueryCommand);
    expect(calls[0].args[0].input.IndexName).toBe("gsi-correlation");
  });

  it("list() returns empty results correctly", async () => {
    docMock.on(QueryCommand).resolves({ Items: [] });

    const events = createEventsStorage(docClient, tables);
    const result = await events.list({ runId: "run-1" });

    expect(result.data).toEqual([]);
    expect(result.cursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  it("list() sortOrder desc sets ScanIndexForward false", async () => {
    docMock.on(QueryCommand).resolves({ Items: [] });

    const events = createEventsStorage(docClient, tables);
    await events.list({
      runId: "run-1",
      pagination: { sortOrder: "desc" },
    });

    const calls = docMock.commandCalls(QueryCommand);
    expect(calls[0].args[0].input.ScanIndexForward).toBe(false);
  });

  it("list() cursor round-trip passes ExclusiveStartKey", async () => {
    const cursorKey = { runId: "run-1", eventId: "evt-1" };
    const cursor = Buffer.from(JSON.stringify(cursorKey))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    docMock.on(QueryCommand).resolves({ Items: [] });

    const events = createEventsStorage(docClient, tables);
    await events.list({ runId: "run-1", pagination: { cursor } });

    const calls = docMock.commandCalls(QueryCommand);
    expect(calls[0].args[0].input.ExclusiveStartKey).toEqual(cursorKey);
  });

  it("create() run_completed sets output and cleans up hooks/waits", async () => {
    docMock.on(TransactWriteCommand).resolves({});
    docMock
      .on(QueryCommand)
      .resolvesOnce({ Items: [] }) // hooks query
      .resolvesOnce({ Items: [] }); // waits query
    docMock.on(GetCommand).resolves({
      Item: {
        runId: "run-1",
        status: "completed",
        deploymentId: "dep-1",
        workflowName: "wf",
        output: new Uint8Array([42]),
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "run_completed",
      eventData: { output: new Uint8Array([42]) },
    });

    expect(result.event!.eventType).toBe("run_completed");
    expect(result.run!.status).toBe("completed");

    // Verify TransactWrite includes condition expression
    const txCalls = docMock.commandCalls(TransactWriteCommand);
    const updateItem = txCalls[0].args[0].input.TransactItems![1].Update;
    expect(updateItem!.ConditionExpression).toContain("NOT #status IN");
  });

  it("create() run_completed on already-terminal run returns existing state", async () => {
    docMock.on(TransactWriteCommand).rejects(
      Object.assign(new Error("Transaction cancelled"), {
        name: "TransactionCanceledException",
      })
    );
    docMock.on(GetCommand).resolves({
      Item: {
        runId: "run-1",
        status: "failed",
        deploymentId: "dep-1",
        workflowName: "wf",
        error: { message: "something broke" },
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "run_completed",
      eventData: { output: new Uint8Array() },
    });

    expect(result.run!.status).toBe("failed");
  });

  it("create() run_failed sets error and cleans up hooks/waits", async () => {
    docMock.on(TransactWriteCommand).resolves({});
    docMock
      .on(QueryCommand)
      .resolvesOnce({ Items: [{ hookId: "h1" }] }) // hooks query
      .resolvesOnce({ Items: [] }); // waits query
    docMock.on(BatchWriteCommand).resolves({});
    docMock.on(GetCommand).resolves({
      Item: {
        runId: "run-1",
        status: "failed",
        deploymentId: "dep-1",
        workflowName: "wf",
        error: { message: "crash" },
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "run_failed",
      eventData: { error: { message: "crash" } },
    });

    expect(result.event!.eventType).toBe("run_failed");
    expect(result.run!.status).toBe("failed");

    // Verify hooks cleanup query was made
    const queryCalls = docMock.commandCalls(QueryCommand);
    expect(queryCalls[0].args[0].input.TableName).toBe(tables.hooks);
  });

  it("create() run_cancelled sets status and cleans up", async () => {
    docMock.on(TransactWriteCommand).resolves({});
    docMock
      .on(QueryCommand)
      .resolvesOnce({ Items: [] }) // hooks
      .resolvesOnce({ Items: [] }); // waits
    docMock.on(GetCommand).resolves({
      Item: {
        runId: "run-1",
        status: "cancelled",
        deploymentId: "dep-1",
        workflowName: "wf",
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", { eventType: "run_cancelled" });

    expect(result.event!.eventType).toBe("run_cancelled");
    expect(result.run!.status).toBe("cancelled");
  });

  it("create() run_cancelled is idempotent when already cancelled", async () => {
    docMock.on(TransactWriteCommand).rejects(
      Object.assign(new Error("Transaction cancelled"), {
        name: "TransactionCanceledException",
      })
    );
    docMock.on(GetCommand).resolves({
      Item: {
        runId: "run-1",
        status: "cancelled",
        deploymentId: "dep-1",
        workflowName: "wf",
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", { eventType: "run_cancelled" });

    expect(result.run!.status).toBe("cancelled");
  });

  it("create() step_started increments attempt and sets running", async () => {
    docMock.on(TransactWriteCommand).resolves({});
    docMock.on(GetCommand).resolves({
      Item: {
        stepId: "step-1",
        runId: "run-1",
        stepName: "send-email",
        status: "running",
        attempt: 1,
        createdAt: now,
        updatedAt: now,
        startedAt: now,
      },
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "step_started",
      correlationId: "step-1",
    });

    expect(result.event!.eventType).toBe("step_started");
    expect(result.step!.status).toBe("running");

    const txCalls = docMock.commandCalls(TransactWriteCommand);
    const update = txCalls[0].args[0].input.TransactItems![1].Update;
    expect(update!.UpdateExpression).toContain("attempt + :one");
    expect(update!.ConditionExpression).toContain("NOT #status IN");
  });

  it("create() step_completed sets output", async () => {
    docMock.on(TransactWriteCommand).resolves({});
    docMock.on(GetCommand).resolves({
      Item: {
        stepId: "step-1",
        runId: "run-1",
        stepName: "process",
        status: "completed",
        output: new Uint8Array([99]),
        attempt: 1,
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "step_completed",
      correlationId: "step-1",
      eventData: { result: new Uint8Array([99]) },
    });

    expect(result.event!.eventType).toBe("step_completed");
    expect(result.step!.status).toBe("completed");

    const txCalls = docMock.commandCalls(TransactWriteCommand);
    const update = txCalls[0].args[0].input.TransactItems![1].Update;
    expect(update!.UpdateExpression).toContain("output = :output");
  });

  it("create() step_failed sets error with stack trace", async () => {
    docMock.on(TransactWriteCommand).resolves({});
    docMock.on(GetCommand).resolves({
      Item: {
        stepId: "step-1",
        runId: "run-1",
        stepName: "process",
        status: "failed",
        error: { message: "timeout", stack: "Error: timeout\n  at ..." },
        attempt: 2,
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "step_failed",
      correlationId: "step-1",
      eventData: { error: "timeout", stack: "Error: timeout\n  at ..." },
    });

    expect(result.event!.eventType).toBe("step_failed");
    expect(result.step!.status).toBe("failed");

    const txCalls = docMock.commandCalls(TransactWriteCommand);
    const update = txCalls[0].args[0].input.TransactItems![1].Update;
    expect(update!.ExpressionAttributeValues![":error"]).toEqual({
      message: "timeout",
      stack: "Error: timeout\n  at ...",
    });
  });

  it("create() step_retrying resets to pending with retryAfter", async () => {
    const retryAt = new Date(Date.now() + 30_000).toISOString();
    docMock.on(TransactWriteCommand).resolves({});
    docMock.on(GetCommand).resolves({
      Item: {
        stepId: "step-1",
        runId: "run-1",
        stepName: "process",
        status: "pending",
        error: { message: "rate limit" },
        attempt: 2,
        retryAfter: retryAt,
        createdAt: now,
        updatedAt: now,
      },
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "step_retrying",
      correlationId: "step-1",
      eventData: { error: "rate limit", retryAfter: retryAt },
    });

    expect(result.event!.eventType).toBe("step_retrying");
    expect(result.step!.status).toBe("pending");

    const txCalls = docMock.commandCalls(TransactWriteCommand);
    const update = txCalls[0].args[0].input.TransactItems![1].Update;
    expect(update!.ExpressionAttributeValues![":status"]).toBe("pending");
    expect(update!.ExpressionAttributeValues![":retryAfter"]).toBeTruthy();
    expect(update!.ConditionExpression).toBe(
      "NOT #status IN (:completed, :failed)"
    );
  });

  it("create() step_retrying returns existing step if already terminal", async () => {
    docMock.on(TransactWriteCommand).rejectsOnce(
      Object.assign(new Error("Transaction cancelled"), {
        name: "TransactionCanceledException",
      })
    );
    docMock.on(GetCommand).resolves({
      Item: {
        stepId: "step-1",
        runId: "run-1",
        stepName: "process",
        status: "completed",
        attempt: 2,
        createdAt: now,
        updatedAt: now,
      },
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "step_retrying",
      correlationId: "step-1",
      eventData: { error: "rate limit" },
    });

    expect(result.event!.eventType).toBe("step_retrying");
    expect(result.step!.status).toBe("completed");
  });

  it("create() hook_created succeeds and returns hook", async () => {
    docMock.on(TransactWriteCommand).resolves({});

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "hook_created",
      correlationId: "hook-1",
      eventData: { token: "my-token" },
    });

    expect(result.event!.eventType).toBe("hook_created");
    expect(result.hook).toBeDefined();
    expect(result.hook!.token).toBe("my-token");
    expect(result.hook!.hookId).toBe("hook-1");

    // TransactWrite should include condition on the hook Put
    const txCalls = docMock.commandCalls(TransactWriteCommand);
    const hookPut = txCalls[0].args[0].input.TransactItems![0].Put;
    expect(hookPut!.ConditionExpression).toBe("attribute_not_exists(hookId)");
  });

  it("create() hook_received writes event only", async () => {
    docMock.on(TransactWriteCommand).resolves({});

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "hook_received",
      correlationId: "hook-1",
      eventData: { payload: { foo: "bar" } },
    });

    expect(result.event!.eventType).toBe("hook_received");
    expect(result.hook).toBeUndefined();
    expect(result.run).toBeUndefined();

    const txCalls = docMock.commandCalls(TransactWriteCommand);
    expect(txCalls[0].args[0].input.TransactItems).toHaveLength(1);
  });

  it("create() hook_disposed deletes hook", async () => {
    docMock.on(TransactWriteCommand).resolves({});

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "hook_disposed",
      correlationId: "hook-1",
    });

    expect(result.event!.eventType).toBe("hook_disposed");

    const txCalls = docMock.commandCalls(TransactWriteCommand);
    expect(txCalls[0].args[0].input.TransactItems).toHaveLength(2);
    const deleteItem = txCalls[0].args[0].input.TransactItems![1].Delete;
    expect(deleteItem!.TableName).toBe(tables.hooks);
    expect(deleteItem!.Key).toEqual({ hookId: "hook-1" });
  });

  it("create() wait_created creates wait entity", async () => {
    const resumeAt = new Date(Date.now() + 60_000).toISOString();
    docMock.on(TransactWriteCommand).resolves({});

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "wait_created",
      correlationId: "wait-1",
      eventData: { resumeAt },
    });

    expect(result.event!.eventType).toBe("wait_created");
    expect(result.wait).toBeDefined();
    expect(result.wait!.waitId).toBe("wait-1");
    expect(result.wait!.status).toBe("waiting");

    const txCalls = docMock.commandCalls(TransactWriteCommand);
    expect(txCalls[0].args[0].input.TransactItems).toHaveLength(2);
    const waitPut = txCalls[0].args[0].input.TransactItems![1].Put;
    expect(waitPut!.TableName).toBe(tables.waits);
    expect(waitPut!.Item!.status).toBe("waiting");
  });

  it("create() wait_completed updates wait status with condition", async () => {
    docMock.on(TransactWriteCommand).resolves({});
    docMock.on(GetCommand).resolves({
      Item: {
        waitId: "wait-1",
        runId: "run-1",
        status: "completed",
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "wait_completed",
      correlationId: "wait-1",
    });

    expect(result.event!.eventType).toBe("wait_completed");
    expect(result.wait).toBeDefined();
    expect(result.wait!.status).toBe("completed");

    const txCalls = docMock.commandCalls(TransactWriteCommand);
    const update = txCalls[0].args[0].input.TransactItems![1].Update;
    expect(update!.ConditionExpression).toBe("#status = :waiting");
  });

  it("create() run_completed deletes hooks across multiple pages", async () => {
    docMock.on(TransactWriteCommand).resolves({});
    docMock
      .on(QueryCommand)
      // hooks page 1 — has more
      .resolvesOnce({
        Items: [{ hookId: "h1" }, { hookId: "h2" }],
        LastEvaluatedKey: { hookId: "h2" },
      })
      // hooks page 2 — last page
      .resolvesOnce({
        Items: [{ hookId: "h3" }],
      })
      // waits page 1 — empty
      .resolvesOnce({ Items: [] });
    docMock.on(BatchWriteCommand).resolves({});
    docMock.on(GetCommand).resolves({
      Item: {
        runId: "run-1",
        status: "completed",
        deploymentId: "dep-1",
        workflowName: "wf",
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    });

    const events = createEventsStorage(docClient, tables);
    await events.create("run-1", {
      eventType: "run_completed",
      eventData: { output: null },
    });

    const batchCalls = docMock.commandCalls(BatchWriteCommand);
    expect(batchCalls).toHaveLength(2);
    expect(
      batchCalls[0].args[0].input.RequestItems![tables.hooks]
    ).toHaveLength(2);
    expect(
      batchCalls[1].args[0].input.RequestItems![tables.hooks]
    ).toHaveLength(1);
  });

  it("create() run_completed wraps throttling error during cleanup as WorldError", async () => {
    docMock.on(TransactWriteCommand).resolves({});
    docMock.on(QueryCommand).resolvesOnce({
      Items: [{ hookId: "h1" }],
    });
    docMock.on(BatchWriteCommand).rejectsOnce(
      Object.assign(new Error("Rate exceeded"), {
        name: "ThrottlingException",
      })
    );

    const events = createEventsStorage(docClient, tables);
    await expect(
      events.create("run-1", {
        eventType: "run_completed",
        eventData: { output: null },
      })
    ).rejects.toThrow(WorldError);
  });

  it("create() step_started returns existing step on TransactionCanceledException", async () => {
    docMock.on(TransactWriteCommand).rejects(
      Object.assign(new Error("Transaction cancelled"), {
        name: "TransactionCanceledException",
      })
    );
    docMock.on(GetCommand).resolves({
      Item: {
        stepId: "step-1",
        runId: "run-1",
        stepName: "process",
        status: "completed",
        attempt: 1,
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "step_started",
      correlationId: "step-1",
    });

    expect(result.step!.status).toBe("completed");
  });

  it("create() step_completed returns existing step on TransactionCanceledException", async () => {
    docMock.on(TransactWriteCommand).rejects(
      Object.assign(new Error("Transaction cancelled"), {
        name: "TransactionCanceledException",
      })
    );
    docMock.on(GetCommand).resolves({
      Item: {
        stepId: "step-1",
        runId: "run-1",
        stepName: "process",
        status: "completed",
        output: new Uint8Array([99]),
        attempt: 1,
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "step_completed",
      correlationId: "step-1",
      eventData: { result: new Uint8Array([99]) },
    });

    expect(result.step!.status).toBe("completed");
  });

  it("create() run_created includes ttl attribute when ttlSeconds configured", async () => {
    docMock.on(TransactWriteCommand).resolves({});

    const events = createEventsStorage(docClient, tables, 86_400);
    const result = await events.create(null, {
      eventType: "run_created",
      eventData: {
        deploymentId: "dep-1",
        workflowName: "test-workflow",
        input: new Uint8Array([1, 2]),
      },
    });

    expect(result.event).toBeDefined();

    const calls = docMock.commandCalls(TransactWriteCommand);
    const eventPut = calls[0].args[0].input.TransactItems![0].Put;
    const runPut = calls[0].args[0].input.TransactItems![1].Put;

    expect(eventPut!.Item!.ttl).toBeTypeOf("number");
    expect(runPut!.Item!.ttl).toBeTypeOf("number");
  });

  it("create() run_created omits ttl attribute when ttlSeconds undefined", async () => {
    docMock.on(TransactWriteCommand).resolves({});

    const events = createEventsStorage(docClient, tables);
    await events.create(null, {
      eventType: "run_created",
      eventData: {
        deploymentId: "dep-1",
        workflowName: "test-workflow",
        input: new Uint8Array([1, 2]),
      },
    });

    const calls = docMock.commandCalls(TransactWriteCommand);
    const eventPut = calls[0].args[0].input.TransactItems![0].Put;
    const runPut = calls[0].args[0].input.TransactItems![1].Put;

    expect(eventPut!.Item!.ttl).toBeUndefined();
    expect(runPut!.Item!.ttl).toBeUndefined();
  });

  it("create() step_created includes ttl on both event and step items", async () => {
    docMock.on(TransactWriteCommand).resolves({});

    const events = createEventsStorage(docClient, tables, 3600);
    await events.create("run-1", {
      eventType: "step_created",
      correlationId: "step-1",
      eventData: {
        stepName: "process-data",
        input: new Uint8Array([1]),
      },
    });

    const calls = docMock.commandCalls(TransactWriteCommand);
    const eventPut = calls[0].args[0].input.TransactItems![0].Put;
    const stepPut = calls[0].args[0].input.TransactItems![1].Put;

    expect(eventPut!.Item!.ttl).toBeTypeOf("number");
    expect(stepPut!.Item!.ttl).toBeTypeOf("number");
  });

  it("create() hook_created includes ttl on both event and hook items", async () => {
    docMock.on(TransactWriteCommand).resolves({});

    const events = createEventsStorage(docClient, tables, 7200);
    await events.create("run-1", {
      eventType: "hook_created",
      correlationId: "hook-1",
      eventData: { token: "my-token" },
    });

    const calls = docMock.commandCalls(TransactWriteCommand);
    const hookPut = calls[0].args[0].input.TransactItems![0].Put;
    const eventPut = calls[0].args[0].input.TransactItems![1].Put;

    expect(hookPut!.Item!.ttl).toBeTypeOf("number");
    expect(eventPut!.Item!.ttl).toBeTypeOf("number");
  });

  it("create() wait_created includes ttl on both event and wait items", async () => {
    docMock.on(TransactWriteCommand).resolves({});

    const events = createEventsStorage(docClient, tables, 86_400);
    await events.create("run-1", {
      eventType: "wait_created",
      correlationId: "wait-1",
      eventData: {},
    });

    const calls = docMock.commandCalls(TransactWriteCommand);
    const eventPut = calls[0].args[0].input.TransactItems![0].Put;
    const waitPut = calls[0].args[0].input.TransactItems![1].Put;

    expect(eventPut!.Item!.ttl).toBeTypeOf("number");
    expect(waitPut!.Item!.ttl).toBeTypeOf("number");
  });

  it("create() step_failed returns existing step on TransactionCanceledException", async () => {
    docMock.on(TransactWriteCommand).rejects(
      Object.assign(new Error("Transaction cancelled"), {
        name: "TransactionCanceledException",
      })
    );
    docMock.on(GetCommand).resolves({
      Item: {
        stepId: "step-1",
        runId: "run-1",
        stepName: "process",
        status: "failed",
        error: { message: "crash" },
        attempt: 2,
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    });

    const events = createEventsStorage(docClient, tables);
    const result = await events.create("run-1", {
      eventType: "step_failed",
      correlationId: "step-1",
      eventData: { error: "crash" },
    });

    expect(result.step!.status).toBe("failed");
  });
});

describe("WaitsStorage", () => {
  it("get() returns a wait by ID", async () => {
    docMock.on(GetCommand).resolves({
      Item: {
        waitId: "wait-1",
        runId: "run-1",
        status: "waiting",
        createdAt: now,
        updatedAt: now,
      },
    });

    const waits = createWaitsStorage(docClient, tables);
    const wait = await waits.get("wait-1");

    expect(wait.waitId).toBe("wait-1");
    expect(wait.status).toBe("waiting");
    expect(wait.createdAt).toBeInstanceOf(Date);
  });

  it("get() throws when wait not found", async () => {
    docMock.on(GetCommand).resolves({ Item: undefined });

    const waits = createWaitsStorage(docClient, tables);
    await expect(waits.get("nonexistent")).rejects.toThrow("Wait not found");
  });

  it("list() returns paginated waits", async () => {
    docMock.on(ScanCommand).resolves({
      Items: [
        {
          waitId: "wait-1",
          runId: "run-1",
          status: "waiting",
          createdAt: now,
          updatedAt: now,
        },
      ],
      LastEvaluatedKey: { waitId: "wait-1" },
    });

    const waits = createWaitsStorage(docClient, tables);
    const result = await waits.list();

    expect(result.data).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toBeTruthy();
  });

  it("list() filters by runId using GSI", async () => {
    docMock.on(QueryCommand).resolves({ Items: [] });

    const waits = createWaitsStorage(docClient, tables);
    await waits.list({ runId: "run-1" });

    const calls = docMock.commandCalls(QueryCommand);
    expect(calls[0].args[0].input.IndexName).toBe("gsi-run");
  });

  it("list() returns empty results correctly", async () => {
    docMock.on(ScanCommand).resolves({ Items: [] });

    const waits = createWaitsStorage(docClient, tables);
    const result = await waits.list();

    expect(result.data).toEqual([]);
    expect(result.cursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  it("list() caps limit at 1000", async () => {
    docMock.on(ScanCommand).resolves({ Items: [] });

    const waits = createWaitsStorage(docClient, tables);
    await waits.list({ pagination: { limit: 3000 } });

    const calls = docMock.commandCalls(ScanCommand);
    expect(calls[0].args[0].input.Limit).toBe(1000);
  });

  it("list() sortOrder desc sets ScanIndexForward false", async () => {
    docMock.on(QueryCommand).resolves({ Items: [] });

    const waits = createWaitsStorage(docClient, tables);
    await waits.list({ runId: "run-1", pagination: { sortOrder: "desc" } });

    const calls = docMock.commandCalls(QueryCommand);
    expect(calls[0].args[0].input.ScanIndexForward).toBe(false);
  });
});
