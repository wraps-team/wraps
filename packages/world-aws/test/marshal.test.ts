import { describe, expect, it } from "vitest";
import {
  marshalEvent,
  marshalHook,
  marshalRun,
  marshalStep,
  marshalWait,
} from "../src/storage/marshal.js";

const NOW = "2025-06-15T12:00:00.000Z";
const LATER = "2025-06-15T13:00:00.000Z";

describe("marshalRun", () => {
  it("converts ISO strings to Date objects", () => {
    const run = marshalRun({
      runId: "run-1",
      status: "completed",
      deploymentId: "dep-1",
      workflowName: "wf-test",
      createdAt: NOW,
      updatedAt: LATER,
      startedAt: NOW,
      completedAt: LATER,
    });

    expect(run.createdAt).toBeInstanceOf(Date);
    expect(run.updatedAt).toBeInstanceOf(Date);
    expect(run.startedAt).toBeInstanceOf(Date);
    expect(run.completedAt).toBeInstanceOf(Date);
    expect(run.createdAt.toISOString()).toBe(NOW);
  });

  it("leaves optional date fields undefined when absent", () => {
    const run = marshalRun({
      runId: "run-1",
      status: "pending",
      deploymentId: "dep-1",
      workflowName: "wf-test",
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(run.startedAt).toBeUndefined();
    expect(run.completedAt).toBeUndefined();
    expect(run.expiredAt).toBeUndefined();
  });

  it("passes through binary input/output", () => {
    const input = new Uint8Array([1, 2, 3]);
    const run = marshalRun({
      runId: "run-1",
      status: "completed",
      deploymentId: "dep-1",
      workflowName: "wf-test",
      input,
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(run.input).toBe(input);
    expect(run.output).toBeUndefined();
  });

  it("preserves error object", () => {
    const error = { message: "boom", code: "ERR" };
    const run = marshalRun({
      runId: "run-1",
      status: "failed",
      deploymentId: "dep-1",
      workflowName: "wf-test",
      error,
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(run.error).toEqual({ message: "boom", code: "ERR" });
  });
});

describe("marshalStep", () => {
  it("converts ISO strings to Date objects", () => {
    const step = marshalStep({
      runId: "run-1",
      stepId: "step-1",
      stepName: "doThing",
      status: "completed",
      attempt: 2,
      createdAt: NOW,
      updatedAt: LATER,
      startedAt: NOW,
      completedAt: LATER,
    });

    expect(step.createdAt).toBeInstanceOf(Date);
    expect(step.startedAt).toBeInstanceOf(Date);
    expect(step.completedAt).toBeInstanceOf(Date);
    expect(step.attempt).toBe(2);
  });

  it("defaults attempt to 0 when missing", () => {
    const step = marshalStep({
      runId: "run-1",
      stepId: "step-1",
      stepName: "doThing",
      status: "pending",
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(step.attempt).toBe(0);
  });

  it("handles retryAfter date", () => {
    const step = marshalStep({
      runId: "run-1",
      stepId: "step-1",
      stepName: "doThing",
      status: "failed",
      createdAt: NOW,
      updatedAt: NOW,
      retryAfter: LATER,
    });

    expect(step.retryAfter).toBeInstanceOf(Date);
    expect(step.retryAfter!.toISOString()).toBe(LATER);
  });
});

describe("marshalEvent", () => {
  it("converts createdAt to Date", () => {
    const event = marshalEvent({
      runId: "run-1",
      eventId: "evt-1",
      eventType: "run_created",
      createdAt: NOW,
    });

    expect(event.createdAt).toBeInstanceOf(Date);
    expect(event.eventType).toBe("run_created");
  });

  it("converts eventData.resumeAt from ISO string to Date", () => {
    const event = marshalEvent({
      runId: "run-1",
      eventId: "evt-1",
      eventType: "wait_created",
      eventData: { resumeAt: LATER },
      createdAt: NOW,
    });

    expect(event.eventData!.resumeAt).toBeInstanceOf(Date);
    expect((event.eventData!.resumeAt as Date).toISOString()).toBe(LATER);
  });

  it("leaves eventData.resumeAt alone if already not a string", () => {
    const date = new Date(LATER);
    const event = marshalEvent({
      runId: "run-1",
      eventId: "evt-1",
      eventType: "wait_created",
      eventData: { resumeAt: date },
      createdAt: NOW,
    });

    expect(event.eventData!.resumeAt).toBe(date);
  });

  it("handles missing eventData", () => {
    const event = marshalEvent({
      runId: "run-1",
      eventId: "evt-1",
      eventType: "run_created",
      createdAt: NOW,
    });

    expect(event.eventData).toBeUndefined();
  });

  it("preserves correlationId and specVersion", () => {
    const event = marshalEvent({
      runId: "run-1",
      eventId: "evt-1",
      eventType: "step_completed",
      correlationId: "corr-1",
      specVersion: 2,
      createdAt: NOW,
    });

    expect(event.correlationId).toBe("corr-1");
    expect(event.specVersion).toBe(2);
  });
});

describe("marshalHook", () => {
  it("converts createdAt to Date", () => {
    const hook = marshalHook({
      runId: "run-1",
      hookId: "hook-1",
      token: "tok-abc",
      ownerId: "owner-1",
      projectId: "proj-1",
      environment: "production",
      createdAt: NOW,
    });

    expect(hook.createdAt).toBeInstanceOf(Date);
    expect(hook.token).toBe("tok-abc");
    expect(hook.ownerId).toBe("owner-1");
  });

  it("passes through binary metadata", () => {
    const metadata = new Uint8Array([10, 20, 30]);
    const hook = marshalHook({
      runId: "run-1",
      hookId: "hook-1",
      token: "tok-abc",
      ownerId: "owner-1",
      projectId: "proj-1",
      environment: "production",
      metadata,
      createdAt: NOW,
    });

    expect(hook.metadata).toBe(metadata);
  });

  it("returns undefined metadata when absent", () => {
    const hook = marshalHook({
      runId: "run-1",
      hookId: "hook-1",
      token: "tok-abc",
      ownerId: "owner-1",
      projectId: "proj-1",
      environment: "production",
      createdAt: NOW,
    });

    expect(hook.metadata).toBeUndefined();
  });
});

describe("marshalWait", () => {
  it("converts date fields", () => {
    const wait = marshalWait({
      waitId: "wait-1",
      runId: "run-1",
      status: "completed",
      resumeAt: NOW,
      completedAt: LATER,
      createdAt: NOW,
      updatedAt: LATER,
    });

    expect(wait.createdAt).toBeInstanceOf(Date);
    expect(wait.updatedAt).toBeInstanceOf(Date);
    expect(wait.resumeAt).toBeInstanceOf(Date);
    expect(wait.completedAt).toBeInstanceOf(Date);
  });

  it("leaves optional dates undefined when absent", () => {
    const wait = marshalWait({
      waitId: "wait-1",
      runId: "run-1",
      status: "pending",
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(wait.resumeAt).toBeUndefined();
    expect(wait.completedAt).toBeUndefined();
  });
});
