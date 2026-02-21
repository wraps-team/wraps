import {
  TransactWriteCommand,
  GetCommand,
  QueryCommand,
  BatchWriteCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { TableNames } from "../dynamodb/tables.js";
import { GSI } from "../dynamodb/tables.js";
import { encodeCursor, decodeCursor } from "../dynamodb/pagination.js";
import { toISO, fromISO, toDateOrUndefined } from "../util.js";
import { ulid } from "ulid";

const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];

function marshalEvent(item: Record<string, unknown>) {
  return {
    runId: item.runId as string,
    eventId: item.eventId as string,
    eventType: item.eventType as string,
    correlationId: item.correlationId as string | undefined,
    eventData: item.eventData as Record<string, unknown> | undefined,
    createdAt: fromISO(item.createdAt as string),
    specVersion: item.specVersion as number | undefined,
  };
}

function marshalRun(item: Record<string, unknown>) {
  return {
    runId: item.runId as string,
    status: item.status as string,
    deploymentId: item.deploymentId as string,
    workflowName: item.workflowName as string,
    input: item.input,
    output: item.output,
    error: item.error as { message: string; stack?: string; code?: string } | undefined,
    executionContext: item.executionContext as Record<string, unknown> | undefined,
    specVersion: item.specVersion as number | undefined,
    startedAt: toDateOrUndefined(item.startedAt as string | undefined),
    completedAt: toDateOrUndefined(item.completedAt as string | undefined),
    createdAt: fromISO(item.createdAt as string),
    updatedAt: fromISO(item.updatedAt as string),
    expiredAt: toDateOrUndefined(item.expiredAt as string | undefined),
  };
}

function marshalStep(item: Record<string, unknown>) {
  return {
    runId: item.runId as string,
    stepId: item.stepId as string,
    stepName: item.stepName as string,
    status: item.status as string,
    input: item.input,
    output: item.output,
    error: item.error as { message: string; stack?: string; code?: string } | undefined,
    attempt: (item.attempt as number) ?? 0,
    retryAfter: toDateOrUndefined(item.retryAfter as string | undefined),
    startedAt: toDateOrUndefined(item.startedAt as string | undefined),
    completedAt: toDateOrUndefined(item.completedAt as string | undefined),
    createdAt: fromISO(item.createdAt as string),
    updatedAt: fromISO(item.updatedAt as string),
    specVersion: item.specVersion as number | undefined,
  };
}

function marshalHook(item: Record<string, unknown>) {
  return {
    runId: item.runId as string,
    hookId: item.hookId as string,
    token: item.token as string,
    ownerId: item.ownerId as string,
    projectId: item.projectId as string,
    environment: item.environment as string,
    metadata: item.metadata,
    createdAt: fromISO(item.createdAt as string),
    specVersion: item.specVersion as number | undefined,
  };
}

function marshalWait(item: Record<string, unknown>) {
  return {
    waitId: item.waitId as string,
    runId: item.runId as string,
    status: item.status as string,
    resumeAt: toDateOrUndefined(item.resumeAt as string | undefined),
    completedAt: toDateOrUndefined(item.completedAt as string | undefined),
    createdAt: fromISO(item.createdAt as string),
    updatedAt: fromISO(item.updatedAt as string),
    specVersion: item.specVersion as number | undefined,
  };
}

function buildEventItem(
  runId: string,
  eventId: string,
  data: Record<string, unknown>,
  now: string,
) {
  return {
    runId,
    eventId,
    eventType: data.eventType,
    ...(data.correlationId ? { correlationId: data.correlationId } : {}),
    ...(data.eventData !== undefined ? { eventData: data.eventData } : {}),
    createdAt: now,
    ...(data.specVersion !== undefined ? { specVersion: data.specVersion } : {}),
  };
}

export function createEventsStorage(
  docClient: DynamoDBDocumentClient,
  tables: TableNames,
) {
  async function deleteHooksAndWaitsForRun(runId: string): Promise<void> {
    // Delete all hooks for this run
    const hooksResult = await docClient.send(
      new QueryCommand({
        TableName: tables.hooks,
        IndexName: GSI.hooks.run,
        KeyConditionExpression: "runId = :runId",
        ExpressionAttributeValues: { ":runId": runId },
        ProjectionExpression: "hookId",
      }),
    );

    if (hooksResult.Items && hooksResult.Items.length > 0) {
      const batches = [];
      for (let i = 0; i < hooksResult.Items.length; i += 25) {
        batches.push(hooksResult.Items.slice(i, i + 25));
      }
      for (const batch of batches) {
        await docClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [tables.hooks]: batch.map((item) => ({
                DeleteRequest: { Key: { hookId: item.hookId } },
              })),
            },
          }),
        );
      }
    }

    // Delete all waits for this run
    const waitsResult = await docClient.send(
      new QueryCommand({
        TableName: tables.waits,
        IndexName: GSI.waits.run,
        KeyConditionExpression: "runId = :runId",
        ExpressionAttributeValues: { ":runId": runId },
        ProjectionExpression: "waitId",
      }),
    );

    if (waitsResult.Items && waitsResult.Items.length > 0) {
      const batches = [];
      for (let i = 0; i < waitsResult.Items.length; i += 25) {
        batches.push(waitsResult.Items.slice(i, i + 25));
      }
      for (const batch of batches) {
        await docClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [tables.waits]: batch.map((item) => ({
                DeleteRequest: { Key: { waitId: item.waitId } },
              })),
            },
          }),
        );
      }
    }
  }

  async function getRun(runId: string) {
    const result = await docClient.send(
      new GetCommand({
        TableName: tables.runs,
        Key: { runId },
      }),
    );
    return result.Item ? marshalRun(result.Item) : null;
  }

  async function handleRunCreated(
    runId: string | null,
    data: Record<string, unknown>,
    _params?: Record<string, unknown>,
  ) {
    const actualRunId = runId ?? ulid();
    const eventId = ulid();
    const now = toISO(new Date());
    const eventData = data.eventData as Record<string, unknown>;

    const eventItem = buildEventItem(actualRunId, eventId, data, now);

    const runItem = {
      runId: actualRunId,
      status: "pending",
      deploymentId: eventData.deploymentId,
      workflowName: eventData.workflowName,
      input: eventData.input,
      ...(eventData.executionContext ? { executionContext: eventData.executionContext } : {}),
      ...(data.specVersion !== undefined ? { specVersion: data.specVersion } : {}),
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: tables.events, Item: eventItem } },
          { Put: { TableName: tables.runs, Item: runItem } },
        ],
      }),
    );

    return {
      event: marshalEvent(eventItem),
      run: marshalRun(runItem),
    };
  }

  async function handleRunStarted(
    runId: string,
    data: Record<string, unknown>,
  ) {
    const eventId = ulid();
    const now = toISO(new Date());
    const eventItem = buildEventItem(runId, eventId, data, now);

    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            { Put: { TableName: tables.events, Item: eventItem } },
            {
              Update: {
                TableName: tables.runs,
                Key: { runId },
                UpdateExpression: "SET #status = :status, startedAt = :now, updatedAt = :now",
                ConditionExpression: "NOT #status IN (:completed, :failed, :cancelled)",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                  ":status": "running",
                  ":now": now,
                  ":completed": "completed",
                  ":failed": "failed",
                  ":cancelled": "cancelled",
                },
              },
            },
          ],
        }),
      );
    } catch (e) {
      if (e instanceof Error && e.name === "TransactionCanceledException") {
        const run = await getRun(runId);
        if (run && TERMINAL_STATUSES.includes(run.status)) {
          return { event: marshalEvent(eventItem), run };
        }
      }
      throw e;
    }

    const run = await getRun(runId);
    return { event: marshalEvent(eventItem), run: run! };
  }

  async function handleRunCompleted(
    runId: string,
    data: Record<string, unknown>,
  ) {
    const eventId = ulid();
    const now = toISO(new Date());
    const eventData = data.eventData as Record<string, unknown> | undefined;
    const eventItem = buildEventItem(runId, eventId, data, now);

    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            { Put: { TableName: tables.events, Item: eventItem } },
            {
              Update: {
                TableName: tables.runs,
                Key: { runId },
                UpdateExpression:
                  "SET #status = :status, output = :output, completedAt = :now, updatedAt = :now",
                ConditionExpression: "NOT #status IN (:completed, :failed, :cancelled)",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                  ":status": "completed",
                  ":output": eventData?.output ?? null,
                  ":now": now,
                  ":completed": "completed",
                  ":failed": "failed",
                  ":cancelled": "cancelled",
                },
              },
            },
          ],
        }),
      );
    } catch (e) {
      if (e instanceof Error && e.name === "TransactionCanceledException") {
        const run = await getRun(runId);
        if (run && TERMINAL_STATUSES.includes(run.status)) {
          return { event: marshalEvent(eventItem), run };
        }
      }
      throw e;
    }

    await deleteHooksAndWaitsForRun(runId);
    const run = await getRun(runId);
    return { event: marshalEvent(eventItem), run: run! };
  }

  async function handleRunFailed(
    runId: string,
    data: Record<string, unknown>,
  ) {
    const eventId = ulid();
    const now = toISO(new Date());
    const eventData = data.eventData as Record<string, unknown>;
    const eventItem = buildEventItem(runId, eventId, data, now);

    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            { Put: { TableName: tables.events, Item: eventItem } },
            {
              Update: {
                TableName: tables.runs,
                Key: { runId },
                UpdateExpression:
                  "SET #status = :status, #error = :error, completedAt = :now, updatedAt = :now",
                ConditionExpression: "NOT #status IN (:completed, :failed, :cancelled)",
                ExpressionAttributeNames: { "#status": "status", "#error": "error" },
                ExpressionAttributeValues: {
                  ":status": "failed",
                  ":error": eventData.error,
                  ":now": now,
                  ":completed": "completed",
                  ":failed": "failed",
                  ":cancelled": "cancelled",
                },
              },
            },
          ],
        }),
      );
    } catch (e) {
      if (e instanceof Error && e.name === "TransactionCanceledException") {
        const run = await getRun(runId);
        if (run && TERMINAL_STATUSES.includes(run.status)) {
          return { event: marshalEvent(eventItem), run };
        }
      }
      throw e;
    }

    await deleteHooksAndWaitsForRun(runId);
    const run = await getRun(runId);
    return { event: marshalEvent(eventItem), run: run! };
  }

  async function handleRunCancelled(
    runId: string,
    data: Record<string, unknown>,
  ) {
    const eventId = ulid();
    const now = toISO(new Date());
    const eventItem = buildEventItem(runId, eventId, data, now);

    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            { Put: { TableName: tables.events, Item: eventItem } },
            {
              Update: {
                TableName: tables.runs,
                Key: { runId },
                UpdateExpression: "SET #status = :status, completedAt = :now, updatedAt = :now",
                ConditionExpression: "NOT #status IN (:completed, :failed)",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                  ":status": "cancelled",
                  ":now": now,
                  ":completed": "completed",
                  ":failed": "failed",
                },
              },
            },
          ],
        }),
      );
    } catch (e) {
      if (e instanceof Error && e.name === "TransactionCanceledException") {
        const run = await getRun(runId);
        if (run) {
          // Idempotent: if already cancelled, still succeed
          if (run.status === "cancelled") {
            return { event: marshalEvent(eventItem), run };
          }
          if (TERMINAL_STATUSES.includes(run.status)) {
            return { event: marshalEvent(eventItem), run };
          }
        }
      }
      throw e;
    }

    await deleteHooksAndWaitsForRun(runId);
    const run = await getRun(runId);
    return { event: marshalEvent(eventItem), run: run! };
  }

  async function handleStepCreated(
    runId: string,
    data: Record<string, unknown>,
  ) {
    const eventId = ulid();
    const now = toISO(new Date());
    const eventData = data.eventData as Record<string, unknown>;
    const correlationId = data.correlationId as string;
    const eventItem = buildEventItem(runId, eventId, data, now);

    const stepItem = {
      runId,
      stepId: correlationId,
      stepName: eventData.stepName,
      status: "pending",
      input: eventData.input,
      attempt: 0,
      ...(data.specVersion !== undefined ? { specVersion: data.specVersion } : {}),
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: tables.events, Item: eventItem } },
          { Put: { TableName: tables.steps, Item: stepItem } },
        ],
      }),
    );

    return {
      event: marshalEvent(eventItem),
      step: marshalStep(stepItem),
    };
  }

  async function handleStepStarted(
    runId: string,
    data: Record<string, unknown>,
  ) {
    const eventId = ulid();
    const now = toISO(new Date());
    const correlationId = data.correlationId as string;
    const eventItem = buildEventItem(runId, eventId, data, now);

    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            { Put: { TableName: tables.events, Item: eventItem } },
            {
              Update: {
                TableName: tables.steps,
                Key: { stepId: correlationId },
                UpdateExpression:
                  "SET #status = :status, attempt = attempt + :one, updatedAt = :now, retryAfter = :null" +
                  ", startedAt = if_not_exists(startedAt, :now)",
                ConditionExpression: "NOT #status IN (:completed, :failed)",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                  ":status": "running",
                  ":one": 1,
                  ":now": now,
                  ":null": null,
                  ":completed": "completed",
                  ":failed": "failed",
                },
              },
            },
          ],
        }),
      );
    } catch (e) {
      if (e instanceof Error && e.name === "TransactionCanceledException") {
        throw e;
      }
      throw e;
    }

    const stepResult = await docClient.send(
      new GetCommand({
        TableName: tables.steps,
        Key: { stepId: correlationId },
      }),
    );

    return {
      event: marshalEvent(eventItem),
      step: stepResult.Item ? marshalStep(stepResult.Item) : undefined,
    };
  }

  async function handleStepCompleted(
    runId: string,
    data: Record<string, unknown>,
  ) {
    const eventId = ulid();
    const now = toISO(new Date());
    const eventData = data.eventData as Record<string, unknown>;
    const correlationId = data.correlationId as string;
    const eventItem = buildEventItem(runId, eventId, data, now);

    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            { Put: { TableName: tables.events, Item: eventItem } },
            {
              Update: {
                TableName: tables.steps,
                Key: { stepId: correlationId },
                UpdateExpression:
                  "SET #status = :status, output = :output, completedAt = :now, updatedAt = :now",
                ConditionExpression: "NOT #status IN (:completed, :failed)",
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                  ":status": "completed",
                  ":output": eventData.result,
                  ":now": now,
                  ":completed": "completed",
                  ":failed": "failed",
                },
              },
            },
          ],
        }),
      );
    } catch (e) {
      if (e instanceof Error && e.name === "TransactionCanceledException") {
        throw e;
      }
      throw e;
    }

    const stepResult = await docClient.send(
      new GetCommand({
        TableName: tables.steps,
        Key: { stepId: correlationId },
      }),
    );

    return {
      event: marshalEvent(eventItem),
      step: stepResult.Item ? marshalStep(stepResult.Item) : undefined,
    };
  }

  async function handleStepFailed(
    runId: string,
    data: Record<string, unknown>,
  ) {
    const eventId = ulid();
    const now = toISO(new Date());
    const eventData = data.eventData as Record<string, unknown>;
    const correlationId = data.correlationId as string;
    const eventItem = buildEventItem(runId, eventId, data, now);

    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            { Put: { TableName: tables.events, Item: eventItem } },
            {
              Update: {
                TableName: tables.steps,
                Key: { stepId: correlationId },
                UpdateExpression:
                  "SET #status = :status, #error = :error, completedAt = :now, updatedAt = :now",
                ConditionExpression: "NOT #status IN (:completed, :failed)",
                ExpressionAttributeNames: { "#status": "status", "#error": "error" },
                ExpressionAttributeValues: {
                  ":status": "failed",
                  ":error": {
                    message: eventData.error,
                    ...(eventData.stack ? { stack: eventData.stack } : {}),
                  },
                  ":now": now,
                  ":completed": "completed",
                  ":failed": "failed",
                },
              },
            },
          ],
        }),
      );
    } catch (e) {
      if (e instanceof Error && e.name === "TransactionCanceledException") {
        throw e;
      }
      throw e;
    }

    const stepResult = await docClient.send(
      new GetCommand({
        TableName: tables.steps,
        Key: { stepId: correlationId },
      }),
    );

    return {
      event: marshalEvent(eventItem),
      step: stepResult.Item ? marshalStep(stepResult.Item) : undefined,
    };
  }

  async function handleStepRetrying(
    runId: string,
    data: Record<string, unknown>,
  ) {
    const eventId = ulid();
    const now = toISO(new Date());
    const eventData = data.eventData as Record<string, unknown>;
    const correlationId = data.correlationId as string;
    const eventItem = buildEventItem(runId, eventId, data, now);

    const retryAfterValue = eventData.retryAfter
      ? toISO(new Date(eventData.retryAfter as string | number))
      : null;

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: tables.events, Item: eventItem } },
          {
            Update: {
              TableName: tables.steps,
              Key: { stepId: correlationId },
              UpdateExpression:
                "SET #status = :status, #error = :error, retryAfter = :retryAfter, updatedAt = :now",
              ExpressionAttributeNames: { "#status": "status", "#error": "error" },
              ExpressionAttributeValues: {
                ":status": "pending",
                ":error": {
                  message: eventData.error,
                  ...(eventData.stack ? { stack: eventData.stack } : {}),
                },
                ":retryAfter": retryAfterValue,
                ":now": now,
              },
            },
          },
        ],
      }),
    );

    const stepResult = await docClient.send(
      new GetCommand({
        TableName: tables.steps,
        Key: { stepId: correlationId },
      }),
    );

    return {
      event: marshalEvent(eventItem),
      step: stepResult.Item ? marshalStep(stepResult.Item) : undefined,
    };
  }

  async function handleHookCreated(
    runId: string,
    data: Record<string, unknown>,
  ) {
    const eventId = ulid();
    const now = toISO(new Date());
    const eventData = data.eventData as Record<string, unknown>;
    const correlationId = data.correlationId as string;

    // Try to create the hook first — check for token conflict
    const hookItem = {
      hookId: correlationId,
      runId,
      token: eventData.token,
      ownerId: "",
      projectId: "",
      environment: "",
      ...(eventData.metadata !== undefined ? { metadata: eventData.metadata } : {}),
      ...(data.specVersion !== undefined ? { specVersion: data.specVersion } : {}),
      createdAt: now,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: tables.hooks,
          Item: hookItem,
          ConditionExpression: "attribute_not_exists(hookId)",
        }),
      );
    } catch (e) {
      if (e instanceof Error && e.name === "ConditionalCheckFailedException") {
        // Token conflict — create a hook_conflict event instead
        const conflictEventItem = {
          runId,
          eventId,
          eventType: "hook_conflict",
          correlationId,
          eventData: { token: eventData.token },
          createdAt: now,
          ...(data.specVersion !== undefined ? { specVersion: data.specVersion } : {}),
        };

        await docClient.send(
          new PutCommand({
            TableName: tables.events,
            Item: conflictEventItem,
          }),
        );

        return { event: marshalEvent(conflictEventItem) };
      }
      throw e;
    }

    // Hook created successfully — now create the event
    const eventItem = buildEventItem(runId, eventId, data, now);

    await docClient.send(
      new PutCommand({
        TableName: tables.events,
        Item: eventItem,
      }),
    );

    return {
      event: marshalEvent(eventItem),
      hook: marshalHook(hookItem),
    };
  }

  async function handleHookReceived(
    runId: string,
    data: Record<string, unknown>,
  ) {
    const eventId = ulid();
    const now = toISO(new Date());
    const eventItem = buildEventItem(runId, eventId, data, now);

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [{ Put: { TableName: tables.events, Item: eventItem } }],
      }),
    );

    return { event: marshalEvent(eventItem) };
  }

  async function handleHookDisposed(
    runId: string,
    data: Record<string, unknown>,
  ) {
    const eventId = ulid();
    const now = toISO(new Date());
    const correlationId = data.correlationId as string;
    const eventItem = buildEventItem(runId, eventId, data, now);

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: tables.events, Item: eventItem } },
          {
            Delete: {
              TableName: tables.hooks,
              Key: { hookId: correlationId },
            },
          },
        ],
      }),
    );

    return { event: marshalEvent(eventItem) };
  }

  async function handleWaitCreated(
    runId: string,
    data: Record<string, unknown>,
  ) {
    const eventId = ulid();
    const now = toISO(new Date());
    const eventData = data.eventData as Record<string, unknown>;
    const correlationId = data.correlationId as string;
    const eventItem = buildEventItem(runId, eventId, data, now);

    const resumeAtValue = eventData.resumeAt
      ? toISO(new Date(eventData.resumeAt as string | number))
      : undefined;

    const waitItem = {
      waitId: correlationId,
      runId,
      status: "waiting",
      ...(resumeAtValue ? { resumeAt: resumeAtValue } : {}),
      ...(data.specVersion !== undefined ? { specVersion: data.specVersion } : {}),
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: tables.events, Item: eventItem } },
          { Put: { TableName: tables.waits, Item: waitItem } },
        ],
      }),
    );

    return {
      event: marshalEvent(eventItem),
      wait: marshalWait(waitItem),
    };
  }

  async function handleWaitCompleted(
    runId: string,
    data: Record<string, unknown>,
  ) {
    const eventId = ulid();
    const now = toISO(new Date());
    const correlationId = data.correlationId as string;
    const eventItem = buildEventItem(runId, eventId, data, now);

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: tables.events, Item: eventItem } },
          {
            Update: {
              TableName: tables.waits,
              Key: { waitId: correlationId },
              UpdateExpression:
                "SET #status = :status, completedAt = :now, updatedAt = :now",
              ConditionExpression: "#status = :waiting",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: {
                ":status": "completed",
                ":now": now,
                ":waiting": "waiting",
              },
            },
          },
        ],
      }),
    );

    const waitResult = await docClient.send(
      new GetCommand({
        TableName: tables.waits,
        Key: { waitId: correlationId },
      }),
    );

    return {
      event: marshalEvent(eventItem),
      wait: waitResult.Item ? marshalWait(waitResult.Item) : undefined,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventHandlers: Record<string, (...args: any[]) => Promise<unknown>> = {
    run_created: handleRunCreated,
    run_started: handleRunStarted,
    run_completed: handleRunCompleted,
    run_failed: handleRunFailed,
    run_cancelled: handleRunCancelled,
    step_created: handleStepCreated,
    step_started: handleStepStarted,
    step_completed: handleStepCompleted,
    step_failed: handleStepFailed,
    step_retrying: handleStepRetrying,
    hook_created: handleHookCreated,
    hook_received: handleHookReceived,
    hook_disposed: handleHookDisposed,
    wait_created: handleWaitCreated,
    wait_completed: handleWaitCompleted,
  };

  async function create(
    runId: string | null,
    data: Record<string, unknown>,
    params?: Record<string, unknown>,
  ) {
    const eventType = data.eventType as string;
    const handler = eventHandlers[eventType];
    if (!handler) {
      throw new Error(`Unknown event type: ${eventType}`);
    }

    // run_created handles null runId internally (generates one via ulid)
    // All other event types require a runId
    return handler(runId, data, params);
  }

  async function list(params: {
    runId: string;
    pagination?: { limit?: number; cursor?: string; sortOrder?: "asc" | "desc" };
    resolveData?: "none" | "all";
  }) {
    const { runId, pagination, resolveData } = params;
    const limit = pagination?.limit ?? 50;
    const sortOrder = pagination?.sortOrder ?? "asc";

    const queryParams: Record<string, unknown> = {
      TableName: tables.events,
      KeyConditionExpression: "runId = :runId",
      ExpressionAttributeValues: { ":runId": runId },
      Limit: limit,
      ScanIndexForward: sortOrder === "asc",
    };

    if (pagination?.cursor) {
      (queryParams as Record<string, unknown>).ExclusiveStartKey = decodeCursor(pagination.cursor);
    }

    const result = await docClient.send(
      new QueryCommand(queryParams as ConstructorParameters<typeof QueryCommand>[0]),
    );

    const events = (result.Items ?? []).map((item) => {
      const event = marshalEvent(item);
      if (resolveData === "none") {
        const { eventData: _, ...rest } = event;
        return rest;
      }
      return event;
    });

    return {
      data: events,
      cursor: result.LastEvaluatedKey ? encodeCursor(result.LastEvaluatedKey) : null,
      hasMore: !!result.LastEvaluatedKey,
    };
  }

  async function listByCorrelationId(params: {
    correlationId: string;
    pagination?: { limit?: number; cursor?: string; sortOrder?: "asc" | "desc" };
    resolveData?: "none" | "all";
  }) {
    const { correlationId, pagination, resolveData } = params;
    const limit = pagination?.limit ?? 50;
    const sortOrder = pagination?.sortOrder ?? "asc";

    const queryParams: Record<string, unknown> = {
      TableName: tables.events,
      IndexName: GSI.events.correlation,
      KeyConditionExpression: "correlationId = :correlationId",
      ExpressionAttributeValues: { ":correlationId": correlationId },
      Limit: limit,
      ScanIndexForward: sortOrder === "asc",
    };

    if (pagination?.cursor) {
      (queryParams as Record<string, unknown>).ExclusiveStartKey = decodeCursor(pagination.cursor);
    }

    const result = await docClient.send(
      new QueryCommand(queryParams as ConstructorParameters<typeof QueryCommand>[0]),
    );

    const events = (result.Items ?? []).map((item) => {
      const event = marshalEvent(item);
      if (resolveData === "none") {
        const { eventData: _, ...rest } = event;
        return rest;
      }
      return event;
    });

    return {
      data: events,
      cursor: result.LastEvaluatedKey ? encodeCursor(result.LastEvaluatedKey) : null,
      hasMore: !!result.LastEvaluatedKey,
    };
  }

  return { create, list, listByCorrelationId };
}
