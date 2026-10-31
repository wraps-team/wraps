/**
 * Workflow write-permission gates (real DB)
 *
 * Every write route on the workflow surface calls requirePermission(workflows,
 * write): trigger, trigger/batch, execution retry and cancel, the
 * workflow-schedules enable/disable/reschedule routes, and the CLI push routes.
 * For each route this pins four things:
 *
 * - a read-only member session is refused with 403 and changes nothing,
 * - an API key without workflows:write is refused with 403 and changes nothing,
 * - an owner session passes the gate,
 * - a full-access key passes the gate.
 *
 * The AWS-facing services (SQS queue, EventBridge scheduler, cancel) are
 * mocked so a passing call proves the gate, not the infrastructure. The DB is
 * real, so a refused call's "changes nothing" is checked against the rows.
 *
 * File suffix `-db.test.ts` = real Neon test branch.
 */

import { db, eq, member, user, workflow, workflowExecution } from "@wraps/db";
import { Elysia } from "elysia";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  cleanupBaseOrg,
  clearWorkflowState,
  executionRow,
  seedBaseOrg,
  workflowRow,
} from "../(ee)/__tests__/fixtures/real-db";
import { workflowScheduleRoutes } from "../(ee)/routes/workflow-schedules";
import { workflowsRoutes } from "../(ee)/routes/workflows";
import { workflowsSyncRoutes } from "../(ee)/routes/workflows-sync";
import {
  FULL_ACCESS_PERMISSIONS,
  READ_ONLY_PERMISSIONS,
} from "../services/api-keys";

const mocks = vi.hoisted(() => ({
  enqueueWorkflowStep: vi.fn(),
  enqueueWorkflowStepBatch: vi.fn(),
  cancelWorkflowExecution: vi.fn(),
  createNextWorkflowSchedule: vi.fn(),
  deleteWorkflowSchedule: vi.fn(),
  updateWorkflowSchedule: vi.fn(),
  trackFirstResourceCreated: vi.fn(),
}));

vi.mock("../services/workflow-queue", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  enqueueWorkflowStep: mocks.enqueueWorkflowStep,
  enqueueWorkflowStepBatch: mocks.enqueueWorkflowStepBatch,
}));

vi.mock("../(ee)/services/workflow-cancel", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  cancelWorkflowExecution: mocks.cancelWorkflowExecution,
}));

vi.mock("../(ee)/services/workflow-scheduler", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createNextWorkflowSchedule: mocks.createNextWorkflowSchedule,
  deleteWorkflowSchedule: mocks.deleteWorkflowSchedule,
  updateWorkflowSchedule: mocks.updateWorkflowSchedule,
}));

vi.mock("../lib/activation-tracking", () => ({
  trackFirstResourceCreated: mocks.trackFirstResourceCreated,
}));

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: new Elysia(),
}));

// Short enough to fit the route params (maxLength 36) once suffixed.
const PREFIX = `t3-P2G4-${crypto.randomUUID().slice(0, 8)}`;

const RO_USER = `${PREFIX}-ro-user`;
const RO_MEMBER = `${PREFIX}-ro-member`;
const RO_EMAIL = `${PREFIX}-ro@example.com`;

const DENIED = "You don't have permission to perform this action";

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];

const WF = () => `${ids.org}-wf`;
const EXEC_FAILED = () => `${ids.org}-exec-failed`;
const EXEC_ACTIVE = () => `${ids.org}-exec-active`;

type Auth = Record<string, unknown>;

const sessionOwner = (): Auth => ({
  apiKeyId: null,
  organizationId: ids.org,
  userId: ids.user,
  planId: "pro",
});

const sessionReadOnly = (): Auth => ({
  apiKeyId: null,
  organizationId: ids.org,
  userId: RO_USER,
  planId: "pro",
});

const keyFull = (): Auth => ({
  apiKeyId: `${PREFIX}-key-full`,
  organizationId: ids.org,
  userId: ids.user,
  planId: "pro",
  apiKeyScopes: [...FULL_ACCESS_PERMISSIONS],
});

const keyReadOnly = (): Auth => ({
  apiKeyId: `${PREFIX}-key-ro`,
  organizationId: ids.org,
  userId: ids.user,
  planId: "pro",
  apiKeyScopes: [...READ_ONLY_PERMISSIONS],
});

function pushBody(slug: string) {
  return {
    slug,
    name: slug,
    sourceTs: "",
    sourceHash: "h",
    steps: [],
    transitions: [],
    triggerType: "event",
  };
}

type Case = {
  name: string;
  plugin: unknown;
  method: "POST" | "PUT";
  path: () => string;
  body?: () => unknown;
  /** The mock an allowed call reaches; used to show a refused call reached nothing. */
  reached: keyof typeof mocks;
  expectedStatus: number;
};

const cases: Case[] = [
  {
    name: "POST /v1/workflows/:workflowId/trigger",
    plugin: workflowsRoutes,
    method: "POST",
    path: () => `/v1/workflows/${WF()}/trigger`,
    body: () => ({ contactId: ids.contact }),
    reached: "enqueueWorkflowStep",
    expectedStatus: 200,
  },
  {
    name: "POST /v1/workflows/:workflowId/trigger/batch",
    plugin: workflowsRoutes,
    method: "POST",
    path: () => `/v1/workflows/${WF()}/trigger/batch`,
    body: () => ({ contacts: [{ contactId: ids.contact }] }),
    reached: "enqueueWorkflowStepBatch",
    expectedStatus: 200,
  },
  {
    name: "POST /v1/workflows/executions/:executionId/retry",
    plugin: workflowsRoutes,
    method: "POST",
    path: () => `/v1/workflows/executions/${EXEC_FAILED()}/retry`,
    reached: "enqueueWorkflowStep",
    expectedStatus: 200,
  },
  {
    name: "POST /v1/workflows/executions/:executionId/cancel",
    plugin: workflowsRoutes,
    method: "POST",
    path: () => `/v1/workflows/executions/${EXEC_ACTIVE()}/cancel`,
    reached: "cancelWorkflowExecution",
    expectedStatus: 200,
  },
  {
    name: "POST /v1/workflow-schedules/:workflowId/enable",
    plugin: workflowScheduleRoutes,
    method: "POST",
    path: () => `/v1/workflow-schedules/${WF()}/enable`,
    body: () => ({ cronExpression: "0 9 * * *" }),
    reached: "createNextWorkflowSchedule",
    expectedStatus: 200,
  },
  {
    name: "POST /v1/workflow-schedules/:workflowId/disable",
    plugin: workflowScheduleRoutes,
    method: "POST",
    path: () => `/v1/workflow-schedules/${WF()}/disable`,
    reached: "deleteWorkflowSchedule",
    expectedStatus: 200,
  },
  {
    name: "PUT /v1/workflow-schedules/:workflowId",
    plugin: workflowScheduleRoutes,
    method: "PUT",
    path: () => `/v1/workflow-schedules/${WF()}`,
    body: () => ({ cronExpression: "0 10 * * *" }),
    reached: "updateWorkflowSchedule",
    expectedStatus: 200,
  },
  {
    name: "POST /v1/workflows/push",
    plugin: workflowsSyncRoutes,
    method: "POST",
    path: () => "/v1/workflows/push",
    body: () => pushBody(`${PREFIX}-push`),
    reached: "trackFirstResourceCreated",
    expectedStatus: 201,
  },
  {
    name: "POST /v1/workflows/push/batch",
    plugin: workflowsSyncRoutes,
    method: "POST",
    path: () => "/v1/workflows/push/batch",
    body: () => ({ workflows: [pushBody(`${PREFIX}-batch-a`)] }),
    reached: "trackFirstResourceCreated",
    expectedStatus: 200,
  },
];

async function call(
  c: Case,
  auth: Auth
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const app = new Elysia().derive(() => ({ auth })).use(c.plugin as Elysia);
  const body = c.body?.();
  const res = await app.handle(
    new Request(`http://localhost${c.path()}`, {
      method: c.method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** Every workflow and execution row in the org, sorted, so a refused call can be compared. */
async function dbState(): Promise<string> {
  const wfs = await db
    .select()
    .from(workflow)
    .where(eq(workflow.organizationId, ids.org));
  const exs = await db
    .select()
    .from(workflowExecution)
    .where(eq(workflowExecution.organizationId, ids.org));
  wfs.sort((a, b) => a.id.localeCompare(b.id));
  exs.sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({ wfs, exs });
}

function reachedAny(): string[] {
  return Object.entries(mocks)
    .filter(([, fn]) => fn.mock.calls.length > 0)
    .map(([name]) => name);
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;

  await db
    .insert(user)
    .values({
      id: RO_USER,
      email: RO_EMAIL,
      name: "Read Only Workflow Tester",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    } as typeof user.$inferInsert)
    .onConflictDoNothing();
  await db.insert(member).values({
    id: RO_MEMBER,
    organizationId: ids.org,
    userId: RO_USER,
    role: "read-only",
    createdAt: new Date(),
  });
});

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.enqueueWorkflowStep.mockResolvedValue(undefined);
  mocks.enqueueWorkflowStepBatch.mockResolvedValue(undefined);
  mocks.cancelWorkflowExecution.mockResolvedValue({ success: true });
  mocks.createNextWorkflowSchedule.mockResolvedValue("sched-name");
  mocks.deleteWorkflowSchedule.mockResolvedValue(undefined);
  mocks.updateWorkflowSchedule.mockResolvedValue("sched-name");

  await clearWorkflowState(ids.org, ids.otherOrg);
  await db.insert(workflow).values(
    workflowRow(ids, {
      id: WF(),
      name: "Permission Test Workflow",
      status: "enabled",
      triggerType: "api",
    })
  );
  await db.insert(workflowExecution).values([
    executionRow(ids, {
      id: EXEC_FAILED(),
      workflowId: WF(),
      status: "failed",
      errorStepId: "step-1",
      // Only the step id matters to the retry check; the rest of the step
      // shape is irrelevant here.
      definitionSnapshot: {
        steps: [{ id: "step-1" }],
        transitions: [],
      } as unknown as typeof workflowExecution.$inferInsert.definitionSnapshot,
    }),
    executionRow(ids, {
      id: EXEC_ACTIVE(),
      workflowId: WF(),
      status: "active",
    }),
  ]);
});

afterAll(async () => {
  await clearWorkflowState(ids.org, ids.otherOrg);
  await db.delete(member).where(eq(member.id, RO_MEMBER));
  await db.delete(user).where(eq(user.id, RO_USER));
  await cleanupBaseOrg(PREFIX);
});

describe.each(cases)("$name", (c) => {
  it("refuses a read-only member session and changes nothing", async () => {
    const before = await dbState();

    const res = await call(c, sessionReadOnly());

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: DENIED });
    expect(await dbState()).toBe(before);
    expect(reachedAny()).toEqual([]);
  });

  it("refuses an API key without workflows:write and changes nothing", async () => {
    const before = await dbState();

    const res = await call(c, keyReadOnly());

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: DENIED });
    expect(await dbState()).toBe(before);
    expect(reachedAny()).toEqual([]);
  });

  it("lets an owner session through the gate", async () => {
    const res = await call(c, sessionOwner());

    expect(res.status).toBe(c.expectedStatus);
    expect(reachedAny()).toContain(c.reached);
  });

  it("lets a full-access key through the gate", async () => {
    const res = await call(c, keyFull());

    expect(res.status).toBe(c.expectedStatus);
    expect(reachedAny()).toContain(c.reached);
  });
});
