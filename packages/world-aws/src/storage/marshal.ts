import { fromISO, toBinaryOrUndefined, toDateOrUndefined } from "../util.js";

export function marshalEvent(item: Record<string, unknown>) {
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

export function marshalRun(item: Record<string, unknown>) {
  return {
    runId: item.runId as string,
    status: item.status as string,
    deploymentId: item.deploymentId as string,
    workflowName: item.workflowName as string,
    input: toBinaryOrUndefined(item.input as Uint8Array | undefined),
    output: toBinaryOrUndefined(item.output as Uint8Array | undefined),
    error: item.error as
      | { message: string; stack?: string; code?: string }
      | undefined,
    executionContext: item.executionContext as
      | Record<string, unknown>
      | undefined,
    specVersion: item.specVersion as number | undefined,
    startedAt: toDateOrUndefined(item.startedAt as string | undefined),
    completedAt: toDateOrUndefined(item.completedAt as string | undefined),
    createdAt: fromISO(item.createdAt as string),
    updatedAt: fromISO(item.updatedAt as string),
    expiredAt: toDateOrUndefined(item.expiredAt as string | undefined),
  };
}

export function marshalStep(item: Record<string, unknown>) {
  return {
    runId: item.runId as string,
    stepId: item.stepId as string,
    stepName: item.stepName as string,
    status: item.status as string,
    input: toBinaryOrUndefined(item.input as Uint8Array | undefined),
    output: toBinaryOrUndefined(item.output as Uint8Array | undefined),
    error: item.error as
      | { message: string; stack?: string; code?: string }
      | undefined,
    attempt: (item.attempt as number) ?? 0,
    retryAfter: toDateOrUndefined(item.retryAfter as string | undefined),
    startedAt: toDateOrUndefined(item.startedAt as string | undefined),
    completedAt: toDateOrUndefined(item.completedAt as string | undefined),
    createdAt: fromISO(item.createdAt as string),
    updatedAt: fromISO(item.updatedAt as string),
    specVersion: item.specVersion as number | undefined,
  };
}

export function marshalHook(item: Record<string, unknown>) {
  return {
    runId: item.runId as string,
    hookId: item.hookId as string,
    token: item.token as string,
    ownerId: item.ownerId as string,
    projectId: item.projectId as string,
    environment: item.environment as string,
    metadata: toBinaryOrUndefined(item.metadata as Uint8Array | undefined),
    createdAt: fromISO(item.createdAt as string),
    specVersion: item.specVersion as number | undefined,
  };
}

export function marshalWait(item: Record<string, unknown>) {
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
