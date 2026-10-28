/**
 * GET /v1/workflows, /:workflowId, /:workflowId/executions and
 * /executions/:executionId on a real DB (Neon test branch, no `@wraps/db` mock).
 *
 * Also proves static-vs-param precedence: GET /v1/workflows/pull must still
 * reach the sync handler with the read routes mounted in the order index.ts
 * will use (workflowsRoutes, workflowsSyncRoutes, then workflowsReadRoutes).
 *
 * Only rate-limit is mocked (DynamoDB). Auth is injected via `derive`, the
 * same seam as segments-api-db.test.ts.
 */

import {
  db,
  eq,
  member,
  messageSend,
  user,
  workflow,
  workflowExecution,
  workflowStepExecution,
} from "@wraps/db";
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
import { createErrorHarness } from "../../__tests__/error-handler-harness";
import {
  cleanupBaseOrg,
  clearWorkflowState,
  executionRow,
  messageSendRow,
  seedBaseOrg,
  workflowRow,
} from "./fixtures/real-db";

vi.mock("../../middleware/rate-limit", () => ({
  rateLimitMiddleware: new Elysia(),
}));

const { workflowsReadRoutes } = await import("../routes/workflows-read");
const { workflowsRoutes } = await import("../routes/workflows");
const { workflowsSyncRoutes } = await import("../routes/workflows-sync");

// PREFIX is embedded in path params, which are capped at 64 chars in the route.
const PREFIX = `t2x-t26-${crypto.randomUUID().slice(0, 8)}`;

const DENIED = "You don't have permission to perform this action";

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];

const RO_USER = `${PREFIX}-ro-user`;
const RO_MEMBER = `${PREFIX}-ro-member`;

// Fixed workflow / execution ids so assertions can pin exact values.
const WF_A_OLDER = `${PREFIX}-wf-a1`; // updatedAt: 3 min ago
const WF_A_NEWER = `${PREFIX}-wf-a2`; // updatedAt: 1 min ago
const WF_B = `${PREFIX}-wf-b`;
const WF_PUSHED = `${PREFIX}-wf-pushed`;
const EXEC_A_OLD = `${PREFIX}-ex-a1`; // startedAt: 5 min ago, completed
const EXEC_A_NEW = `${PREFIX}-ex-a2`; // startedAt: 1 min ago, active
const EXEC_B = `${PREFIX}-ex-b`;
const STEP_A_OLD = `${PREFIX}-step-a1`;
const MSG_A_OLD = `${PREFIX}-msg-a1`;
const SES_A_OLD = `${PREFIX}-ses-a1`;

const MIN = 60_000;

function appFor(organizationId: string, userId: string | null) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: { apiKeyId: null, organizationId, userId, planId: "free" },
    }))
    .use(workflowsReadRoutes);
}

function unauthedApp() {
  const { app } = createErrorHarness();
  return app.use(workflowsReadRoutes);
}

async function seedFixtures() {
  const now = Date.now();
  const at = (minutesAgo: number) => new Date(now - minutesAgo * MIN);

  await db.insert(workflow).values([
    wfRow(WF_A_OLDER, "Alpha Onboarding", at(3)),
    wfRow(WF_A_NEWER, "Beta Digest", at(1), { status: "draft" }),
    wfRow(WF_PUSHED, "Pushed From CLI", at(2), {
      slug: `${PREFIX}-pushed`,
      pushedFromCli: true,
      sourceTs: "export default defineWorkflow({ name: 'Pushed From CLI' });",
      sourceHash: `${PREFIX}-hash`,
    }),
    wfRow(WF_B, "Foreign Flow", at(0), {
      organizationId: ids.otherOrg,
    }),
  ]);

  await db.insert(workflowExecution).values([
    executionRow(ids, {
      id: EXEC_A_OLD,
      workflowId: WF_A_OLDER,
      contactId: ids.contact,
      organizationId: ids.org,
      status: "completed",
      startedAt: at(5),
      createdAt: at(5),
      updatedAt: at(5),
    }),
    executionRow(ids, {
      id: EXEC_A_NEW,
      workflowId: WF_A_OLDER,
      contactId: ids.contact,
      organizationId: ids.org,
      status: "active",
      startedAt: at(1),
      createdAt: at(1),
      updatedAt: at(1),
    }),
    executionRow(ids, {
      id: EXEC_B,
      workflowId: WF_B,
      contactId: ids.otherContact,
      organizationId: ids.otherOrg,
      status: "active",
      startedAt: at(0),
      createdAt: at(0),
      updatedAt: at(0),
    }),
  ]);

  // One completed email step on EXEC_A_OLD, linked to a delivered message.
  await db.insert(messageSend).values(
    messageSendRow(ids, {
      id: MSG_A_OLD,
      workflowExecutionId: EXEC_A_OLD,
      recipient: `${PREFIX}-c1@example.com`,
      messageId: SES_A_OLD,
      status: "delivered",
      sentAt: at(5),
      deliveredAt: at(5),
      createdAt: at(5),
    })
  );
  await db.insert(workflowStepExecution).values({
    id: STEP_A_OLD,
    executionId: EXEC_A_OLD,
    stepId: "send-1",
    stepType: "send_email",
    status: "completed",
    idempotencyKey: `${PREFIX}-idem-a1`,
    result: { messageId: SES_A_OLD },
    startedAt: at(5),
    createdAt: at(5),
  });
}

function wfRow(
  id: string,
  name: string,
  updatedAt: Date,
  overrides: Partial<typeof workflow.$inferInsert> = {}
): typeof workflow.$inferInsert {
  return workflowRow(ids, {
    id,
    name,
    status: "enabled",
    updatedAt,
    createdAt: updatedAt,
    ...overrides,
  });
}

async function clearRows() {
  await clearWorkflowState(ids.org, ids.otherOrg);
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;

  // A real user with a read-only membership in org A.
  await db.insert(user).values({
    id: RO_USER,
    email: `${PREFIX}-ro@example.com`,
    name: "Read Only Member",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as typeof user.$inferInsert);
  await db.insert(member).values({
    id: RO_MEMBER,
    organizationId: ids.org,
    userId: RO_USER,
    role: "read-only",
    createdAt: new Date(),
  });
});

beforeEach(async () => {
  await clearRows();
  await seedFixtures();
});

afterAll(async () => {
  await clearRows();
  await db.delete(member).where(eq(member.id, RO_MEMBER));
  await db.delete(user).where(eq(user.id, RO_USER));
  await cleanupBaseOrg(PREFIX);
});

// ─────────────────────────────────────────────────────────────────────────────
describe("auth — 401 with no auth", () => {
  const cases: Array<[string, string]> = [
    ["GET /", "http://localhost/v1/workflows"],
    ["GET /:workflowId", `http://localhost/v1/workflows/${WF_A_OLDER}`],
    [
      "GET /:workflowId/executions",
      `http://localhost/v1/workflows/${WF_A_OLDER}/executions`,
    ],
    [
      "GET /executions/:executionId",
      `http://localhost/v1/workflows/executions/${EXEC_A_OLD}`,
    ],
  ];

  it.each(cases)("%s returns 401", async (_label, url) => {
    const res = await unauthedApp().handle(new Request(url));
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /v1/workflows — list", () => {
  it("returns this org's workflows only, newest first, with pinned totals", async () => {
    const res = await appFor(ids.org, ids.user).handle(
      new Request("http://localhost/v1/workflows")
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.total).toBe(3);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(50);
    expect(body.workflows.map((w: { id: string }) => w.id)).toEqual([
      WF_A_NEWER,
      WF_PUSHED,
      WF_A_OLDER,
    ]);
    expect(body.workflows[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("filters by search (name, case-insensitive) and status", async () => {
    const app = appFor(ids.org, ids.user);

    const bySearch = await (
      await app.handle(
        new Request("http://localhost/v1/workflows?search=alpha")
      )
    ).json();
    expect(bySearch.total).toBe(1);
    expect(bySearch.workflows[0].id).toBe(WF_A_OLDER);

    const byStatus = await (
      await app.handle(
        new Request("http://localhost/v1/workflows?status=draft")
      )
    ).json();
    expect(byStatus.total).toBe(1);
    expect(byStatus.workflows[0].id).toBe(WF_A_NEWER);
  });

  it("paginates with page and pageSize", async () => {
    const res = await appFor(ids.org, ids.user).handle(
      new Request("http://localhost/v1/workflows?page=2&pageSize=2")
    );
    const body = await res.json();
    expect(body.total).toBe(3);
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(2);
    expect(body.workflows.map((w: { id: string }) => w.id)).toEqual([
      WF_A_OLDER,
    ]);
  });

  it("returns 422 'Validation failed' for an unknown status", async () => {
    const res = await appFor(ids.org, ids.user).handle(
      new Request("http://localhost/v1/workflows?status=bogus")
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "Validation failed" });
  });

  it("returns 422 'Validation failed' for pageSize above 100", async () => {
    const res = await appFor(ids.org, ids.user).handle(
      new Request("http://localhost/v1/workflows?pageSize=101")
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "Validation failed" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("org isolation", () => {
  it("list: org B's workflows are absent from org A's list", async () => {
    const body = await (
      await appFor(ids.org, ids.user).handle(
        new Request("http://localhost/v1/workflows")
      )
    ).json();

    const listedIds = body.workflows.map((w: { id: string }) => w.id);
    expect(listedIds).not.toContain(WF_B);
    expect(body.workflows.map((w: { name: string }) => w.name)).not.toContain(
      "Foreign Flow"
    );
  });

  it("get: org A's GET of org B's workflow id is 404", async () => {
    const res = await appFor(ids.org, ids.user).handle(
      new Request(`http://localhost/v1/workflows/${WF_B}`)
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Workflow not found" });
  });

  it("executions: org A's GET of org B's workflow id /executions is 404", async () => {
    const res = await appFor(ids.org, ids.user).handle(
      new Request(`http://localhost/v1/workflows/${WF_B}/executions`)
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Workflow not found" });
  });

  it("execution detail: org A's GET of org B's execution id is 404", async () => {
    const res = await appFor(ids.org, ids.user).handle(
      new Request(`http://localhost/v1/workflows/executions/${EXEC_B}`)
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Execution not found" });
  });

  it("lists only the executions of the requested workflow", async () => {
    const body = await (
      await appFor(ids.org, ids.user).handle(
        new Request(`http://localhost/v1/workflows/${WF_A_OLDER}/executions`)
      )
    ).json();
    expect(body.total).toBe(2);
    expect(body.executions.map((e: { id: string }) => e.id)).toEqual([
      EXEC_A_NEW,
      EXEC_A_OLD,
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /v1/workflows/:workflowId", () => {
  it("returns the workflow with its creator", async () => {
    const res = await appFor(ids.org, ids.user).handle(
      new Request(`http://localhost/v1/workflows/${WF_A_OLDER}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(WF_A_OLDER);
    expect(body.name).toBe("Alpha Onboarding");
    expect(body.status).toBe("enabled");
    expect(body.organizationId).toBe(ids.org);
    expect(body.createdByUser).toMatchObject({ id: ids.user });
  });

  it("returns 404 for an id that does not exist", async () => {
    const res = await appFor(ids.org, ids.user).handle(
      new Request(`http://localhost/v1/workflows/${PREFIX}-missing`)
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Workflow not found" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /v1/workflows/:workflowId/executions", () => {
  it("filters by status and attaches the contact", async () => {
    const body = await (
      await appFor(ids.org, ids.user).handle(
        new Request(
          `http://localhost/v1/workflows/${WF_A_OLDER}/executions?status=completed`
        )
      )
    ).json();
    expect(body.total).toBe(1);
    expect(body.executions[0].id).toBe(EXEC_A_OLD);
    expect(body.executions[0].contact).toMatchObject({ id: ids.contact });
  });

  it("returns an empty list (not 404) for an org workflow with no runs", async () => {
    const res = await appFor(ids.org, ids.user).handle(
      new Request(`http://localhost/v1/workflows/${WF_A_NEWER}/executions`)
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ total: 0, executions: [] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /v1/workflows/executions/:executionId", () => {
  it("returns the execution with step trace and per-step engagement", async () => {
    const res = await appFor(ids.org, ids.user).handle(
      new Request(`http://localhost/v1/workflows/executions/${EXEC_A_OLD}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(EXEC_A_OLD);
    expect(body.status).toBe("completed");
    expect(body.workflow).toEqual({ name: "Alpha Onboarding" });
    expect(body.contact).toMatchObject({ id: ids.contact });
    expect(body.stepExecutions.map((s: { id: string }) => s.id)).toEqual([
      STEP_A_OLD,
    ]);
    expect(body.stepEngagement[STEP_A_OLD]).toMatchObject({
      channel: "email",
      status: "delivered",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("permissions", () => {
  it("a user with no membership in the org gets 403 on every read route", async () => {
    // ids.user is not a member of otherOrg (seedBaseOrg only seeds org A).
    const app = appFor(ids.otherOrg, ids.user);
    const urls = [
      "http://localhost/v1/workflows",
      `http://localhost/v1/workflows/${WF_B}`,
      `http://localhost/v1/workflows/${WF_B}/executions`,
      `http://localhost/v1/workflows/executions/${EXEC_B}`,
    ];
    for (const url of urls) {
      const res = await app.handle(new Request(url));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: DENIED });
    }
  });

  it("a request with no user id gets 403", async () => {
    const res = await appFor(ids.org, null).handle(
      new Request("http://localhost/v1/workflows")
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: DENIED });
  });

  it("a read-only member can read (read permission is held by every role)", async () => {
    const res = await appFor(ids.org, RO_USER).handle(
      new Request(`http://localhost/v1/workflows/${WF_A_OLDER}`)
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: WF_A_OLDER });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("route precedence — static paths beat /:workflowId", () => {
  // Same order as index.ts after C1: workflowsRoutes, workflowsSyncRoutes,
  // then workflowsReadRoutes. Auth is injected, the real groups are mounted.
  function indexOrderApp() {
    const { app } = createErrorHarness();
    return app
      .derive(() => ({
        auth: {
          apiKeyId: null,
          organizationId: ids.org,
          userId: ids.user,
          planId: "free",
        },
      }))
      .use(workflowsRoutes)
      .use(workflowsSyncRoutes)
      .use(workflowsReadRoutes);
  }

  it("GET /v1/workflows/pull still reaches the sync handler", async () => {
    const res = await indexOrderApp().handle(
      new Request("http://localhost/v1/workflows/pull")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).not.toHaveProperty("error");
    expect(body).not.toHaveProperty("total");
    expect(body.workflows.map((w: { id: string }) => w.id)).toEqual([
      WF_PUSHED,
    ]);
    expect(body.workflows[0].sourceTs).toContain("defineWorkflow");
  });

  it("GET /v1/workflows/executions/:executionId is not swallowed by /:workflowId", async () => {
    const res = await indexOrderApp().handle(
      new Request(`http://localhost/v1/workflows/executions/${EXEC_A_OLD}`)
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: EXEC_A_OLD });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("OpenAPI", () => {
  it("every new GET path is in the generated spec", async () => {
    const { swagger } = await import("@elysiajs/swagger");
    const specApp = new Elysia()
      .use(
        swagger({
          path: "/swagger",
          exclude: ["/swagger", "/swagger/json"],
        })
      )
      .use(workflowsReadRoutes);

    const res = await specApp.handle(
      new Request("http://localhost/swagger/json")
    );
    expect(res.status).toBe(200);
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, { tags?: string[] }>>;
    };

    // The list route is registered as "/" under the prefix, so the spec key
    // carries a trailing slash (same as segments.ts `.get("/")`).
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        "/v1/workflows/",
        "/v1/workflows/{workflowId}",
        "/v1/workflows/{workflowId}/executions",
        "/v1/workflows/executions/{executionId}",
      ])
    );
    expect(spec.paths["/v1/workflows/"]).toHaveProperty("get");
    expect(spec.paths["/v1/workflows/{workflowId}"]).toHaveProperty("get");
    expect(spec.paths["/v1/workflows/{workflowId}/executions"]).toHaveProperty(
      "get"
    );
    expect(spec.paths["/v1/workflows/executions/{executionId}"]).toHaveProperty(
      "get"
    );
    expect(spec.paths["/v1/workflows/{workflowId}"].get.tags).toEqual([
      "workflows",
    ]);
  });
});
