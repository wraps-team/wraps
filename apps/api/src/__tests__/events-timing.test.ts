/**
 * Focused test for the per-phase timing log on POST /v1/events/.
 *
 * `POST /v1/events/` is the slowest route on the API and its tail is a fixed
 * ~6 s on roughly one request in ten. The request total alone cannot say which
 * awaited call owns those seconds, so the handler laps each phase and logs the
 * split once. The route's storage, queue, and usage-limit dependencies are
 * mocked here so this runs without a database: it asserts the response is
 * unchanged and that the single-event path emits exactly one `api.event.timing`
 * line carrying the per-phase breakdown.
 */

import { Elysia } from "elysia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { logInfo, contactRow } = vi.hoisted(() => ({
  logInfo: vi.fn(),
  contactRow: {
    id: "events-timing-contact",
    organizationId: "events-timing-org",
    email: "person@example.com",
  },
}));

vi.mock("../lib/logger", () => ({
  log: {
    info: logInfo,
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../services/workflow-queue", () => ({
  enqueueWorkflowStep: vi.fn().mockResolvedValue(undefined),
  enqueueWorkflowStepBatch: vi.fn().mockResolvedValue(undefined),
  deleteScheduledStep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../middleware/event-limit", () => ({
  enforceEventLimit: vi.fn().mockResolvedValue(undefined),
  getEventTTLExpiration: () => new Date("2028-09-17T00:00:00Z"),
  incrementEventUsage: vi.fn().mockResolvedValue(1),
}));

vi.mock("@wraps/db", () => ({
  findContactById: vi.fn().mockResolvedValue(undefined),
  findContactByEmailInOrg: vi.fn().mockResolvedValue(contactRow),
  findContactByEmailHash: vi.fn().mockResolvedValue(undefined),
  findContactByExternalIdInOrg: vi.fn().mockResolvedValue(undefined),
  findContactsByEmailsInOrg: vi.fn().mockResolvedValue([]),
  findContactsByExternalIdsInOrg: vi.fn().mockResolvedValue([]),
  findContactsByIdsInOrg: vi.fn().mockResolvedValue([]),
  findEventWorkflows: vi.fn().mockResolvedValue([]),
  findEventWorkflowsBatch: vi.fn().mockResolvedValue([]),
  findWaitingExecutions: vi.fn().mockResolvedValue([]),
  findWaitingExecutionsBatch: vi.fn().mockResolvedValue([]),
  insertContact: vi.fn().mockResolvedValue(undefined),
  insertContactEvent: vi.fn().mockResolvedValue(undefined),
  insertContactEventsBatch: vi.fn().mockResolvedValue([]),
  touchContactLastActivity: vi.fn().mockResolvedValue(undefined),
}));

import type { AuthContext } from "../middleware/auth";
import { eventsRoutes } from "../routes/events";

const mockAuth: AuthContext = {
  apiKeyId: "events-timing-key",
  organizationId: "events-timing-org",
  userId: null,
  planId: "starter",
};

function createTestApp() {
  return new Elysia().derive(() => ({ auth: mockAuth })).use(eventsRoutes);
}

describe("POST /v1/events (timing)", () => {
  beforeEach(() => {
    logInfo.mockClear();
  });

  it("returns the ingest result and logs one per-phase breakdown", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/v1/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "events-timing-request",
        },
        body: JSON.stringify({
          name: "purchase.completed",
          contactEmail: "person@example.com",
        }),
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      contactCreated: false,
      workflowsTriggered: 0,
      executionsResumed: 0,
    });

    const timingCalls = logInfo.mock.calls.filter(
      ([message]) => message === "api.event.timing"
    );
    expect(timingCalls).toHaveLength(1);

    const [, data] = timingCalls[0] as [
      string,
      {
        requestId: string;
        organizationId: string;
        eventName: string;
        phases: Record<string, number>;
      },
    ];
    expect(data.requestId).toBe("events-timing-request");
    expect(data.organizationId).toBe("events-timing-org");
    expect(data.eventName).toBe("purchase.completed");

    const phases = data.phases;
    expect(Object.keys(phases)).toEqual(
      expect.arrayContaining([
        "contactLookup",
        "contactCreateIfMissing",
        "insertContactEvent",
        "incrementEventUsage",
        "findEventWorkflows",
        "enqueueWorkflowStep",
        "findWaitingExecutions",
        "resumeWaitingExecutions",
        "touchContactLastActivity",
      ])
    );
    expect(Object.values(phases).every((ms) => Number.isFinite(ms))).toBe(true);
  });
});
