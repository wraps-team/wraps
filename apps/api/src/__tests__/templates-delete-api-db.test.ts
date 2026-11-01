/**
 * DELETE /v1/templates/:id and DELETE /v1/templates (bulk) on the combined
 * templates router. Real DB and real permission gate; the SES and credentials
 * boundary is mocked, as in templates-api-db.test.ts.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mocks).
 * Every id is namespaced by a per-run PREFIX, so runs never collide.
 */

import {
  auditLog,
  awsAccount,
  batchSend,
  db,
  eq,
  member,
  template,
  user,
  workflow,
} from "@wraps/db";
import { inArray } from "drizzle-orm";
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
  seedBaseOrg,
  workflowRow,
} from "../(ee)/__tests__/fixtures/real-db";
import {
  FULL_ACCESS_PERMISSIONS,
  READ_ONLY_PERMISSIONS,
} from "../services/api-keys";
import { createErrorHarness } from "./error-handler-harness";

const { mockUpsertSESTemplate, mockDeleteSESTemplate, mockGetCredentials } =
  vi.hoisted(() => ({
    mockUpsertSESTemplate: vi.fn(
      async (..._args: unknown[]): Promise<void> => {}
    ),
    mockDeleteSESTemplate: vi.fn(
      async (
        _credentials: { accessKeyId: string },
        _region: string,
        _templateName: string
      ): Promise<void> => {}
    ),
    mockGetCredentials: vi.fn(async (accountId: string, _orgId: string) => ({
      accessKeyId: `AKIA${accountId}`,
      secretAccessKey: "secret",
      sessionToken: "token",
      expiration: new Date(Date.now() + 3_600_000),
      region: "us-east-1",
    })),
  }));

vi.mock("@wraps/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@wraps/email")>()),
  upsertSESTemplate: mockUpsertSESTemplate,
  deleteSESTemplate: mockDeleteSESTemplate,
}));

vi.mock("../services/credentials", () => ({
  getCredentials: mockGetCredentials,
}));

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: new Elysia(),
}));

const { templatesRoutes } = await import("../routes/templates");
const { templatesSyncRoutes } = await import("../routes/templates-sync");

// PREFIX doubles as a route param (`id: t.String({ maxLength: 36 })`), so it
// stays short. Per-row ids add 9 more characters.
const PREFIX = `tdel-${crypto.randomUUID().slice(0, 8)}`;

const READ_ONLY_USER = `${PREFIX}-ro-user`;
const READ_ONLY_MEMBER = `${PREFIX}-ro-member`;
const READ_ONLY_EMAIL = `${PREFIX}-ro@example.com`;

// A second AWS account in the primary org, in another region, so the SES
// cleanup must reach every account and use each one's own region.
const EXTRA_AWS = `${PREFIX}-aws-3`;
const EXTRA_ACCOUNT_NUMBER = `${Math.floor(Math.random() * 1e12)}`.padStart(
  12,
  "0"
);

const PERMISSION_DENIED = "You don't have permission to perform this action";

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];

type Auth = {
  apiKeyId: string | null;
  organizationId: string;
  userId: string | null;
  planId: string;
  apiKeyScopes?: string[];
};

type BroadcastStatus = NonNullable<(typeof batchSend.$inferInsert)["status"]>;

function appWith(auth: Auth) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({ auth }))
    .use(templatesSyncRoutes)
    .use(templatesRoutes);
}

type App = ReturnType<typeof appWith>;

/** The owner of the primary org, as a dashboard or CLI session. */
const asOwner = () =>
  appWith({
    apiKeyId: null,
    organizationId: ids.org,
    userId: ids.user,
    planId: "pro",
  });

const asReadOnlySession = () =>
  appWith({
    apiKeyId: null,
    organizationId: ids.org,
    userId: READ_ONLY_USER,
    planId: "pro",
  });

const asKey = (scopes: string[]) =>
  appWith({
    apiKeyId: `key-${PREFIX}`,
    organizationId: ids.org,
    userId: ids.user,
    planId: "pro",
    apiKeyScopes: scopes,
  });

async function call(
  app: App,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function uniq(label: string): string {
  return `${PREFIX}-${label}-${crypto.randomUUID().slice(0, 6)}`;
}

/** Insert a template row for `organizationId`; returns its id. */
async function newTemplate(
  overrides: Partial<typeof template.$inferInsert> = {},
  organizationId = ids.org
): Promise<string> {
  const id = uniq("t");
  const now = new Date();
  await db.insert(template).values({
    id,
    organizationId,
    name: `Template ${id}`,
    subject: "Hello",
    compiledHtml: "<p>Hi</p>",
    content: {},
    status: "PUBLISHED",
    sourceFormat: "react-email",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as typeof template.$inferInsert);
  return id;
}

async function insertBroadcast(
  templateId: string,
  status: BroadcastStatus,
  organizationId = ids.org
): Promise<string> {
  const [row] = await db
    .insert(batchSend)
    .values({
      organizationId,
      status,
      channel: "email",
      name: `${PREFIX} batch ${status}`,
      subject: "Subject line",
      htmlContent: "<p>Hello</p>",
      audienceType: "all",
      awsAccountId: ids.awsAccount,
      emailTemplateId: templateId,
      createdBy: ids.user,
    })
    .returning({ id: batchSend.id });
  return row.id;
}

type WorkflowStatus = NonNullable<(typeof workflow.$inferInsert)["status"]>;

async function insertWorkflow(
  steps: (typeof workflow.$inferInsert)["steps"],
  status: WorkflowStatus,
  organizationId = ids.org
): Promise<string> {
  const id = uniq("wf");
  await db.insert(workflow).values(
    workflowRow(ids, {
      id,
      organizationId,
      name: `${PREFIX} workflow ${status}`,
      status,
      steps,
    })
  );
  return id;
}

function emailStep(templateId: string) {
  return [
    {
      id: "step-email",
      type: "send_email" as const,
      name: "Send email",
      position: { x: 0, y: 0 },
      config: { type: "send_email" as const, templateId },
    },
  ];
}

function smsStep(templateId: string) {
  return [
    {
      id: "step-sms",
      type: "send_sms" as const,
      name: "Send SMS",
      position: { x: 0, y: 0 },
      config: { type: "send_sms" as const, templateId },
    },
  ];
}

function cascadeStep(templateId: string) {
  return [
    {
      id: "step-delay",
      type: "delay" as const,
      name: "Wait",
      position: { x: 0, y: 0 },
      config: { type: "delay" as const, amount: 1, unit: "hours" as const },
      cascadeGroupId: "group-1",
      cascadeChannels: [{ type: "email" as const, templateId }],
    },
  ];
}

async function templateExists(id: string): Promise<boolean> {
  const rows = await db
    .select({ id: template.id })
    .from(template)
    .where(eq(template.id, id));
  return rows.length === 1;
}

async function auditRowsFor(templateId: string) {
  return db
    .select({
      id: auditLog.id,
      metadata: auditLog.metadata,
      userId: auditLog.userId,
    })
    .from(auditLog)
    .where(eq(auditLog.resourceId, templateId));
}

async function clearAll() {
  await db
    .delete(auditLog)
    .where(inArray(auditLog.organizationId, [ids.org, ids.otherOrg]));
  await db
    .delete(batchSend)
    .where(inArray(batchSend.organizationId, [ids.org, ids.otherOrg]));
  await clearWorkflowState(ids.org, ids.otherOrg);
  // template_version cascades from template's FK.
  await db
    .delete(template)
    .where(inArray(template.organizationId, [ids.org, ids.otherOrg]));
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;

  await db.insert(awsAccount).values({
    id: EXTRA_AWS,
    organizationId: ids.org,
    name: "Extra AWS",
    accountId: EXTRA_ACCOUNT_NUMBER,
    region: "eu-west-1",
    roleArn: `arn:aws:iam::${EXTRA_ACCOUNT_NUMBER}:role/wraps`,
    externalId: `${PREFIX}-ext-3`,
    webhookSecret: fixture.secret,
    isVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as typeof awsAccount.$inferInsert);

  await db
    .insert(user)
    .values({
      id: READ_ONLY_USER,
      email: READ_ONLY_EMAIL,
      name: "Read Only Template Tester",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    } as typeof user.$inferInsert)
    .onConflictDoNothing();
  await db.insert(member).values({
    id: READ_ONLY_MEMBER,
    organizationId: ids.org,
    userId: READ_ONLY_USER,
    role: "read-only",
    createdAt: new Date(),
  });
});

beforeEach(async () => {
  await clearAll();
  mockUpsertSESTemplate.mockClear();
  mockDeleteSESTemplate.mockClear();
  mockGetCredentials.mockClear();
});

afterAll(async () => {
  await clearAll();
  await db.delete(awsAccount).where(eq(awsAccount.id, EXTRA_AWS));
  await db.delete(member).where(eq(member.id, READ_ONLY_MEMBER));
  await db.delete(user).where(eq(user.id, READ_ONLY_USER));
  await cleanupBaseOrg(PREFIX);
});

describe("DELETE /v1/templates/:id", () => {
  it("deletes the row and writes a template.deleted audit row", async () => {
    const id = await newTemplate();

    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/templates/${id}?confirm=true`
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, id });
    expect(await templateExists(id)).toBe(false);

    const audit = await auditRowsFor(id);
    expect(audit).toHaveLength(1);
    expect(audit[0].userId).toBe(ids.user);
    expect(audit[0].metadata).toMatchObject({ count: 1, templateIds: [id] });
  });

  it("refuses without confirm=true and changes nothing", async () => {
    const id = await newTemplate();

    const missing = await call(asOwner(), "DELETE", `/v1/templates/${id}`);
    const wrong = await call(
      asOwner(),
      "DELETE",
      `/v1/templates/${id}?confirm=yes`
    );

    for (const res of [missing, wrong]) {
      expect(res.status).toBe(400);
      expect(String(res.body?.error)).toContain("confirm=true");
    }
    expect(await templateExists(id)).toBe(true);
    expect(await auditRowsFor(id)).toHaveLength(0);
  });

  it("returns 404 for an id that is not in the organization", async () => {
    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/templates/${uniq("missing")}?confirm=true`
    );
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Template not found" });
  });
});

describe("DELETE /v1/templates (bulk)", () => {
  it("deletes the listed templates and reports a notFound id", async () => {
    const a = await newTemplate();
    const b = await newTemplate();
    const missing = uniq("missing");

    const res = await call(asOwner(), "DELETE", "/v1/templates?confirm=true", {
      ids: [a, b, missing],
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 2, notFound: [missing] });
    expect(await templateExists(a)).toBe(false);
    expect(await templateExists(b)).toBe(false);

    const audit = await db
      .select({ metadata: auditLog.metadata })
      .from(auditLog)
      .where(eq(auditLog.organizationId, ids.org));
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata).toMatchObject({ count: 2 });
  });

  it("refuses without confirm=true and changes nothing", async () => {
    const a = await newTemplate();

    const res = await call(asOwner(), "DELETE", "/v1/templates", { ids: [a] });

    expect(res.status).toBe(400);
    expect(String(res.body?.error)).toContain("confirm=true");
    expect(await templateExists(a)).toBe(true);
  });

  it("returns 400 for an empty list and for more than 100 ids", async () => {
    const a = await newTemplate();

    const empty = await call(
      asOwner(),
      "DELETE",
      "/v1/templates?confirm=true",
      {
        ids: [],
      }
    );
    expect(empty.status).toBe(400);
    expect(empty.body).toEqual({ error: "No template IDs provided" });

    const tooMany = await call(
      asOwner(),
      "DELETE",
      "/v1/templates?confirm=true",
      { ids: Array.from({ length: 101 }, (_, i) => `${PREFIX}-x${i}`) }
    );
    expect(tooMany.status).toBe(400);
    expect(tooMany.body).toEqual({
      error: "Maximum 100 templates can be deleted at once",
    });
    expect(await templateExists(a)).toBe(true);
  });
});

describe("permission and scope", () => {
  const DENIED_CALLERS: Array<[string, () => App]> = [
    ["read-only member session", asReadOnlySession],
    ["API key with READ_ONLY_PERMISSIONS", () => asKey(READ_ONLY_PERMISSIONS)],
  ];

  describe.each(DENIED_CALLERS)("%s", (_label, makeApp) => {
    it("single delete is 403 and deletes nothing", async () => {
      const id = await newTemplate();
      const res = await call(
        makeApp(),
        "DELETE",
        `/v1/templates/${id}?confirm=true`
      );
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: PERMISSION_DENIED });
      expect(await templateExists(id)).toBe(true);
      expect(await auditRowsFor(id)).toHaveLength(0);
    });

    it("bulk delete is 403 and deletes nothing", async () => {
      const id = await newTemplate();
      const res = await call(
        makeApp(),
        "DELETE",
        "/v1/templates?confirm=true",
        {
          ids: [id],
        }
      );
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: PERMISSION_DENIED });
      expect(await templateExists(id)).toBe(true);
    });
  });

  it("an owner session and a full-access key can delete", async () => {
    const viaSession = await newTemplate();
    const viaKey = await newTemplate();

    const sessionRes = await call(
      asOwner(),
      "DELETE",
      `/v1/templates/${viaSession}?confirm=true`
    );
    const keyRes = await call(
      asKey(FULL_ACCESS_PERMISSIONS),
      "DELETE",
      `/v1/templates/${viaKey}?confirm=true`
    );

    expect(sessionRes.status).toBe(200);
    expect(keyRes.status).toBe(200);
  });
});

describe("in use by a broadcast", () => {
  it.each(["scheduled", "queued", "processing"] as const)(
    "409 for a %s broadcast, and nothing is deleted",
    async (status) => {
      const id = await newTemplate();
      await insertBroadcast(id, status);

      const res = await call(
        asOwner(),
        "DELETE",
        `/v1/templates/${id}?confirm=true`
      );

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ blockingIds: [id] });
      expect(String(res.body?.error)).toContain("broadcast");
      expect(await templateExists(id)).toBe(true);
    }
  );

  it.each(["draft", "completed"] as const)(
    "a %s broadcast does not block the delete",
    async (status) => {
      const id = await newTemplate();
      await insertBroadcast(id, status);

      const res = await call(
        asOwner(),
        "DELETE",
        `/v1/templates/${id}?confirm=true`
      );

      expect(res.status).toBe(200);
      expect(await templateExists(id)).toBe(false);
    }
  );
});

describe("in use by a workflow", () => {
  it("409 for an enabled workflow with a send_email step", async () => {
    const id = await newTemplate();
    await insertWorkflow(emailStep(id), "enabled");

    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/templates/${id}?confirm=true`
    );

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ blockingIds: [id] });
    expect(String(res.body?.error)).toContain("workflow");
    expect(await templateExists(id)).toBe(true);
  });

  it("409 for an enabled workflow with a send_sms step", async () => {
    const id = await newTemplate();
    await insertWorkflow(smsStep(id), "enabled");

    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/templates/${id}?confirm=true`
    );

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ blockingIds: [id] });
    expect(await templateExists(id)).toBe(true);
  });

  it("409 for an enabled workflow that references the template only in cascadeChannels", async () => {
    const id = await newTemplate();
    await insertWorkflow(cascadeStep(id), "enabled");

    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/templates/${id}?confirm=true`
    );

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ blockingIds: [id] });
    expect(await templateExists(id)).toBe(true);
  });

  it.each(["draft", "paused"] as const)(
    "a %s workflow does not block the delete",
    async (status) => {
      const id = await newTemplate();
      await insertWorkflow(emailStep(id), status);

      const res = await call(
        asOwner(),
        "DELETE",
        `/v1/templates/${id}?confirm=true`
      );

      expect(res.status).toBe(200);
      expect(await templateExists(id)).toBe(false);
    }
  );
});

describe("bulk delete is all-or-nothing", () => {
  it("one blocked id returns 409 with blockingIds and deletes none of them", async () => {
    const free1 = await newTemplate();
    const blocked = await newTemplate();
    const free2 = await newTemplate();
    await insertBroadcast(blocked, "scheduled");

    const res = await call(asOwner(), "DELETE", "/v1/templates?confirm=true", {
      ids: [free1, blocked, free2],
    });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ blockingIds: [blocked] });
    expect(await templateExists(free1)).toBe(true);
    expect(await templateExists(blocked)).toBe(true);
    expect(await templateExists(free2)).toBe(true);
    expect(await auditRowsFor(free1)).toHaveLength(0);
  });
});

describe("SES cleanup", () => {
  it("deletes the stored name in every AWS account of the org, each with its own region", async () => {
    const name = uniq("ses");
    const id = await newTemplate({ sesTemplateName: name });

    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/templates/${id}?confirm=true`
    );

    expect(res.status).toBe(200);
    const calls = mockDeleteSESTemplate.mock.calls.map(
      ([credentials, region, templateName]) => [
        credentials.accessKeyId,
        region,
        templateName,
      ]
    );
    expect(calls.sort()).toEqual(
      [
        [`AKIA${ids.awsAccount}`, "us-east-1", name],
        [`AKIA${EXTRA_AWS}`, "eu-west-1", name],
      ].sort()
    );
    // Credentials were only requested for this org's accounts.
    expect(
      mockGetCredentials.mock.calls.map(([accountId]) => accountId).sort()
    ).toEqual([ids.awsAccount, EXTRA_AWS].sort());
  });

  it("keeps the SES template when another surviving template uses the same name", async () => {
    const name = uniq("shared");
    const doomed = await newTemplate({ sesTemplateName: name });
    const survivor = await newTemplate({ sesTemplateName: name });

    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/templates/${doomed}?confirm=true`
    );

    expect(res.status).toBe(200);
    expect(mockDeleteSESTemplate).not.toHaveBeenCalled();
    expect(await templateExists(survivor)).toBe(true);
  });

  it("deletes a shared name once when every template using it is deleted in bulk", async () => {
    const name = uniq("both");
    const a = await newTemplate({ sesTemplateName: name });
    const b = await newTemplate({ sesTemplateName: name });

    const res = await call(asOwner(), "DELETE", "/v1/templates?confirm=true", {
      ids: [a, b],
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 2, notFound: [] });
    // One call per AWS account, not one per template.
    expect(mockDeleteSESTemplate).toHaveBeenCalledTimes(2);
    for (const [, , templateName] of mockDeleteSESTemplate.mock.calls) {
      expect(templateName).toBe(name);
    }
  });

  it("does not touch SES when the template has no sesTemplateName", async () => {
    const id = await newTemplate({ sesTemplateName: null });

    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/templates/${id}?confirm=true`
    );

    expect(res.status).toBe(200);
    expect(mockDeleteSESTemplate).not.toHaveBeenCalled();
    expect(mockGetCredentials).not.toHaveBeenCalled();
  });

  it("still returns 200 and deletes the row when SES fails", async () => {
    const id = await newTemplate({ sesTemplateName: uniq("fail") });
    mockDeleteSESTemplate.mockRejectedValueOnce(new Error("SES unavailable"));

    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/templates/${id}?confirm=true`
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, id });
    expect(await templateExists(id)).toBe(false);
  });
});

describe("org isolation", () => {
  it("single delete of another org's template is 404 through this org's session and key, and its row survives", async () => {
    const foreign = await newTemplate({}, ids.otherOrg);

    const viaSession = await call(
      asOwner(),
      "DELETE",
      `/v1/templates/${foreign}?confirm=true`
    );
    const viaKey = await call(
      asKey(FULL_ACCESS_PERMISSIONS),
      "DELETE",
      `/v1/templates/${foreign}?confirm=true`
    );

    expect(viaSession.status).toBe(404);
    expect(viaSession.body).toEqual({ error: "Template not found" });
    expect(viaKey.status).toBe(404);
    expect(await templateExists(foreign)).toBe(true);
    expect(await auditRowsFor(foreign)).toHaveLength(0);
    expect(mockDeleteSESTemplate).not.toHaveBeenCalled();
  });

  it("bulk delete reports another org's id as notFound and leaves its row alone", async () => {
    const own = await newTemplate();
    const foreign = await newTemplate({}, ids.otherOrg);

    const res = await call(asOwner(), "DELETE", "/v1/templates?confirm=true", {
      ids: [own, foreign],
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 1, notFound: [foreign] });
    expect(await templateExists(own)).toBe(false);
    expect(await templateExists(foreign)).toBe(true);
  });

  it("another org's broadcast and enabled workflow do not block this org's delete", async () => {
    const own = await newTemplate();
    const foreignTemplate = await newTemplate({}, ids.otherOrg);
    const foreignBroadcast = await insertBroadcast(
      foreignTemplate,
      "scheduled",
      ids.otherOrg
    );
    const foreignWorkflow = await insertWorkflow(
      emailStep(foreignTemplate),
      "enabled",
      ids.otherOrg
    );

    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/templates/${own}?confirm=true`
    );

    expect(res.status).toBe(200);
    expect(await templateExists(own)).toBe(false);
    // The other org's rows are untouched.
    const [broadcastRow] = await db
      .select({
        status: batchSend.status,
        organizationId: batchSend.organizationId,
      })
      .from(batchSend)
      .where(eq(batchSend.id, foreignBroadcast));
    expect(broadcastRow).toMatchObject({
      status: "scheduled",
      organizationId: ids.otherOrg,
    });
    const [workflowRowAfter] = await db
      .select({
        status: workflow.status,
        organizationId: workflow.organizationId,
      })
      .from(workflow)
      .where(eq(workflow.id, foreignWorkflow));
    expect(workflowRowAfter).toMatchObject({
      status: "enabled",
      organizationId: ids.otherOrg,
    });
    expect(await templateExists(foreignTemplate)).toBe(true);
  });

  it("another org's live broadcast or enabled workflow pointing at this org's template does not block the delete", async () => {
    // Cannot happen through the API (templates and sends are org-scoped), but
    // the in-use query must still ignore rows outside the caller's org.
    const own = await newTemplate();
    await insertBroadcast(own, "processing", ids.otherOrg);
    await insertWorkflow(emailStep(own), "enabled", ids.otherOrg);

    const res = await call(
      asOwner(),
      "DELETE",
      `/v1/templates/${own}?confirm=true`
    );

    expect(res.status).toBe(200);
    expect(await templateExists(own)).toBe(false);
  });
});

describe("route shadowing", () => {
  it("registers exactly one DELETE on /v1/templates and one on /v1/templates/:id", () => {
    const app = asOwner();
    // Elysia registers `.delete("/")` under the prefix with a trailing slash,
    // the same as the GET list route.
    const bulk = app.routes.filter(
      (route) =>
        route.method === "DELETE" &&
        route.path.replace(/\/$/, "") === "/v1/templates"
    );
    const single = app.routes.filter(
      (route) => route.method === "DELETE" && route.path === "/v1/templates/:id"
    );
    expect(bulk).toHaveLength(1);
    expect(single).toHaveLength(1);
  });

  it("DELETE /v1/templates/push is not captured by a sync route: 404, nothing changes", async () => {
    const keep = await newTemplate();
    const before = await db
      .select({ id: template.id })
      .from(template)
      .where(eq(template.organizationId, ids.org));

    const res = await call(
      asOwner(),
      "DELETE",
      "/v1/templates/push?confirm=true"
    );

    expect(res.status).toBe(404);
    const after = await db
      .select({ id: template.id })
      .from(template)
      .where(eq(template.organizationId, ids.org));
    expect(after.map((row) => row.id).sort()).toEqual(
      before.map((row) => row.id).sort()
    );
    expect(await templateExists(keep)).toBe(true);
  });
});
