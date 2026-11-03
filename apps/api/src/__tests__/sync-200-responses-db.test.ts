/**
 * The 200 (and first-push 201) bodies of the six template/workflow sync routes, on a real DB.
 *
 * Elysia validates and strips (`normalize`) a response against the schema
 * declared for the status the handler set, so a 200 schema that is narrower than
 * the handler's body would silently drop fields from a working call. Each test
 * pins the exact key set and values of a 200 or 201 body (these assertions held before
 * the schemas were declared), and the last block pins the generated OpenAPI
 * document.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mock).
 * Boundary mocks: rate limiter (DynamoDB), activation tracking (PostHog).
 */

import { swagger } from "@elysiajs/swagger";
import { and, db, eq, template, workflow } from "@wraps/db";
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
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";
import { injectErrorResponses } from "../lib/openapi-errors";
import { createErrorHarness } from "./error-handler-harness";

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: new Elysia(),
}));

vi.mock("../lib/activation-tracking", () => ({
  trackFirstResourceCreated: vi.fn(async () => {}),
}));

const { templatesSyncRoutes } = await import("../routes/templates-sync");
const { workflowsSyncRoutes } = await import("../(ee)/routes/workflows-sync");

const PREFIX = `s200-${crypto.randomUUID().slice(0, 8)}`;

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];

function appFor(organizationId: string, userId: string) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: { apiKeyId: null, organizationId, userId, planId: "pro" },
    }))
    .use(templatesSyncRoutes)
    .use(workflowsSyncRoutes);
}

function call(method: "GET" | "POST", path: string, body?: unknown) {
  return appFor(ids.org, ids.user).handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    })
  );
}

const sortedKeys = (v: object) => Object.keys(v).sort();

function templatePush(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    slug,
    source: `export default function ${slug}() { return null; }`,
    compiledHtml: "<p>hi</p>",
    compiledText: "hi",
    subject: `Subject ${slug}`,
    emailType: "transactional",
    variables: [{ name: "firstName", fallback: "friend" }],
    sourceHash: `hash-${slug}`,
    sesTemplateName: `ses-${slug}`,
    ...overrides,
  };
}

function workflowPush(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    slug,
    name: `Flow ${slug}`,
    description: "A pushed flow",
    sourceTs: `export default defineWorkflow({ name: '${slug}' });`,
    sourceHash: `hash-${slug}`,
    steps: [
      {
        id: "s1",
        type: "trigger",
        name: "Trigger",
        position: { x: 0, y: 0 },
        config: { type: "trigger", triggerType: "event", eventName: "go" },
      },
    ],
    transitions: [],
    triggerType: "event",
    triggerConfig: { eventName: "go" },
    ...overrides,
  };
}

async function clearRows() {
  const orgs = [ids.org, ids.otherOrg];
  await db.delete(template).where(inArray(template.organizationId, orgs));
  await db.delete(workflow).where(inArray(workflow.organizationId, orgs));
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;
});

beforeEach(async () => {
  await clearRows();
});

afterAll(async () => {
  await clearRows();
  await cleanupBaseOrg(PREFIX);
});

describe("POST /v1/templates/push 200", () => {
  it("returns the update body with exactly id, slug, status, updatedAt, remoteHash", async () => {
    const first = await call("POST", "/v1/templates/push", templatePush("a"));
    expect(first.status).toBe(201);
    const created = await first.json();

    const res = await call(
      "POST",
      "/v1/templates/push",
      templatePush("a", { subject: "changed", sourceHash: "hash-a2" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(sortedKeys(body)).toEqual([
      "id",
      "remoteHash",
      "slug",
      "status",
      "updatedAt",
    ]);
    expect(body.id).toBe(created.id);
    expect(body.slug).toBe("a");
    expect(body.status).toBe("PUBLISHED");
    expect(body.remoteHash).toBe("hash-a2");
    expect(new Date(body.updatedAt).toISOString()).toBe(body.updatedAt);
  });
});

describe("first-push 201 bodies", () => {
  it("POST /v1/templates/push keeps the 201 body and its key order", async () => {
    const res = await call("POST", "/v1/templates/push", templatePush("c"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Object.keys(body)).toEqual([
      "id",
      "slug",
      "status",
      "updatedAt",
      "remoteHash",
    ]);
    const [row] = await db
      .select({ id: template.id })
      .from(template)
      .where(and(eq(template.organizationId, ids.org), eq(template.slug, "c")));
    expect(body).toEqual({
      id: row.id,
      slug: "c",
      status: "PUBLISHED",
      updatedAt: body.updatedAt,
      remoteHash: "hash-c",
    });
    expect(new Date(body.updatedAt).toISOString()).toBe(body.updatedAt);
  });

  it("POST /v1/workflows/push keeps the 201 body and its key order", async () => {
    const res = await call("POST", "/v1/workflows/push", workflowPush("c"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Object.keys(body)).toEqual([
      "id",
      "slug",
      "status",
      "updatedAt",
      "remoteHash",
    ]);
    const [row] = await db
      .select({ id: workflow.id })
      .from(workflow)
      .where(and(eq(workflow.organizationId, ids.org), eq(workflow.slug, "c")));
    expect(body).toEqual({
      id: row.id,
      slug: "c",
      status: "enabled",
      updatedAt: body.updatedAt,
      remoteHash: "hash-c",
    });
    expect(new Date(body.updatedAt).toISOString()).toBe(body.updatedAt);
  });

  it("POST /v1/workflows/push keeps scheduleError on a 201", async () => {
    const res = await call(
      "POST",
      "/v1/workflows/push",
      workflowPush("sc", { triggerType: "schedule", triggerConfig: {} })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Object.keys(body)).toEqual([
      "id",
      "slug",
      "status",
      "updatedAt",
      "remoteHash",
      "scheduleError",
    ]);
    expect(body.status).toBe("draft");
  });
});

describe("POST /v1/templates/push/batch 200", () => {
  it("returns results with exactly slug, id, status per template, created or updated", async () => {
    await call("POST", "/v1/templates/push", templatePush("old"));

    const res = await call("POST", "/v1/templates/push/batch", {
      templates: [templatePush("old"), templatePush("new")],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(sortedKeys(body)).toEqual(["results"]);
    expect(body.results).toHaveLength(2);
    for (const r of body.results) {
      expect(sortedKeys(r)).toEqual(["id", "slug", "status"]);
      expect(r.status).toBe("PUBLISHED");
    }
    expect(body.results.map((r: { slug: string }) => r.slug).sort()).toEqual([
      "new",
      "old",
    ]);
  });

  it("returns an empty results array for an empty batch", async () => {
    const res = await call("POST", "/v1/templates/push/batch", {
      templates: [],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
  });
});

describe("GET /v1/templates/pull 200", () => {
  const ROW_KEYS = [
    "channel",
    "emailType",
    "id",
    "lastEditedFrom",
    "slug",
    "source",
    "sourceHash",
    "status",
    "subject",
    "updatedAt",
    "variables",
  ];

  const HANDLER_ORDER = [
    "id",
    "slug",
    "subject",
    "emailType",
    "channel",
    "variables",
    "sourceHash",
    "status",
    "updatedAt",
    "lastEditedFrom",
    "source",
  ];

  it("returns {templates: []} with no nextCursor key when the org has none", async () => {
    const res = await call("GET", "/v1/templates/pull");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ templates: [] });
  });

  it("returns every row with its full field set and no nextCursor when unpaginated", async () => {
    await call("POST", "/v1/templates/push", templatePush("p1"));
    await call(
      "POST",
      "/v1/templates/push",
      templatePush("p2", { channel: "sms", emailType: "marketing" })
    );

    const res = await call("GET", "/v1/templates/pull");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(sortedKeys(body)).toEqual(["templates"]);
    expect(body.templates).toHaveLength(2);
    for (const row of body.templates) {
      expect(sortedKeys(row)).toEqual(ROW_KEYS);
      // Order too: the response is rebuilt in schema key order, which must be
      // the order mapRow emits (select columns, then source).
      expect(Object.keys(row)).toEqual(HANDLER_ORDER);
      expect(row.status).toBe("PUBLISHED");
      expect(row.lastEditedFrom).toBe("cli");
      expect(row.variables).toEqual([
        { name: "firstName", fallback: "friend" },
      ]);
    }
    const p2 = body.templates.find((r: { slug: string }) => r.slug === "p2");
    expect(p2.channel).toBe("sms");
    expect(p2.emailType).toBe("marketing");
    expect(p2.subject).toBe("Subject p2");
    expect(p2.sourceHash).toBe("hash-p2");
    expect(p2.source).toContain("p2");
  });

  it("serves rows the dashboard or the public API wrote, with nulls and other statuses", async () => {
    const at = new Date("2026-01-02T03:04:05.000Z");
    const base = {
      organizationId: ids.org,
      content: {},
      sourceFormat: "react-email",
      updatedAt: at,
      createdAt: at,
    };
    await db.insert(template).values([
      {
        ...base,
        id: `${PREFIX}-null-row`,
        name: "Null row",
        source: "export default () => null;",
        slug: null,
        subject: null,
        sourceHash: null,
        variables: null,
        lastEditedFrom: null,
        status: "DRAFT",
      },
      {
        ...base,
        id: `${PREFIX}-api-row`,
        name: "Api row",
        source: "export default () => 1;",
        slug: "api-row",
        subject: "From the API",
        sourceHash: "h",
        variables: [{ name: "x" }],
        lastEditedFrom: "api",
        status: "ARCHIVED",
        emailType: "transactional",
        channel: "sms",
      },
    ] as unknown as (typeof template.$inferInsert)[]);

    const res = await call("GET", "/v1/templates/pull");
    expect(res.status).toBe(200);
    const { templates } = await res.json();
    const byId = Object.fromEntries(
      templates.map((r: { id: string }) => [r.id, r])
    );
    expect(byId[`${PREFIX}-null-row`]).toEqual({
      id: `${PREFIX}-null-row`,
      slug: null,
      subject: null,
      emailType: "marketing",
      channel: "email",
      variables: null,
      sourceHash: null,
      status: "DRAFT",
      updatedAt: at.toISOString(),
      lastEditedFrom: null,
      source: "export default () => null;",
    });
    expect(byId[`${PREFIX}-api-row`]).toEqual({
      id: `${PREFIX}-api-row`,
      slug: "api-row",
      subject: "From the API",
      emailType: "transactional",
      channel: "sms",
      variables: [{ name: "x" }],
      sourceHash: "h",
      status: "ARCHIVED",
      updatedAt: at.toISOString(),
      lastEditedFrom: "api",
      source: "export default () => 1;",
    });
  });

  it("returns nextCursor on a paginated page and null on the last", async () => {
    await call("POST", "/v1/templates/push", templatePush("q1"));
    await call("POST", "/v1/templates/push", templatePush("q2"));

    const res = await call("GET", "/v1/templates/pull?limit=1");
    expect(res.status).toBe(200);
    const page1 = await res.json();
    expect(sortedKeys(page1)).toEqual(["nextCursor", "templates"]);
    expect(typeof page1.nextCursor).toBe("string");
    expect(page1.templates).toHaveLength(1);

    const res2 = await call(
      "GET",
      `/v1/templates/pull?limit=1&cursor=${encodeURIComponent(page1.nextCursor)}`
    );
    const page2 = await res2.json();
    expect(page2.nextCursor).toBeNull();
    expect(page2.templates).toHaveLength(1);
  });

  it("omits source from every row with source=false", async () => {
    await call("POST", "/v1/templates/push", templatePush("r1"));
    const res = await call("GET", "/v1/templates/pull?source=false");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.templates).toHaveLength(1);
    expect(sortedKeys(body.templates[0])).toEqual(
      ROW_KEYS.filter((k) => k !== "source")
    );
  });
});

describe("POST /v1/workflows/push 200", () => {
  it("returns id, slug, status, updatedAt, remoteHash for an enabled update", async () => {
    const first = await call("POST", "/v1/workflows/push", workflowPush("a"));
    expect(first.status).toBe(201);
    const created = await first.json();

    const res = await call(
      "POST",
      "/v1/workflows/push",
      workflowPush("a", { sourceHash: "hash-a2" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(sortedKeys(body)).toEqual([
      "id",
      "remoteHash",
      "slug",
      "status",
      "updatedAt",
    ]);
    expect(body.id).toBe(created.id);
    expect(body.slug).toBe("a");
    expect(body.status).toBe("enabled");
    expect(body.remoteHash).toBe("hash-a2");
    expect(new Date(body.updatedAt).toISOString()).toBe(body.updatedAt);
  });

  it("returns status draft for a draft push", async () => {
    await call("POST", "/v1/workflows/push", workflowPush("d"));
    const res = await call(
      "POST",
      "/v1/workflows/push",
      workflowPush("d", { draft: true })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("draft");
  });

  it("includes scheduleError when an enabled schedule workflow has no cron", async () => {
    const push = () =>
      call(
        "POST",
        "/v1/workflows/push",
        workflowPush("sched", { triggerType: "schedule", triggerConfig: {} })
      );
    expect((await push()).status).toBe(201);

    const res = await push();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(sortedKeys(body)).toEqual([
      "id",
      "remoteHash",
      "scheduleError",
      "slug",
      "status",
      "updatedAt",
    ]);
    expect(body.status).toBe("draft");
    expect(body.scheduleError).toBe(
      "Schedule trigger has no cron expression (trigger.schedule)."
    );
  });
});

describe("POST /v1/workflows/push/batch 200", () => {
  it("returns results with slug, id, status, plus scheduleError only when set", async () => {
    const res = await call("POST", "/v1/workflows/push/batch", {
      workflows: [
        workflowPush("ok"),
        workflowPush("nocron", { triggerType: "schedule", triggerConfig: {} }),
        workflowPush("dr", { draft: true }),
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(sortedKeys(body)).toEqual(["results"]);
    const bySlug = Object.fromEntries(
      body.results.map((r: { slug: string }) => [r.slug, r])
    );
    expect(sortedKeys(bySlug.ok)).toEqual(["id", "slug", "status"]);
    expect(bySlug.ok.status).toBe("enabled");
    expect(sortedKeys(bySlug.dr)).toEqual(["id", "slug", "status"]);
    expect(bySlug.dr.status).toBe("draft");
    expect(sortedKeys(bySlug.nocron)).toEqual([
      "id",
      "scheduleError",
      "slug",
      "status",
    ]);
    expect(bySlug.nocron.status).toBe("draft");
  });

  it("returns an empty results array for an empty batch", async () => {
    const res = await call("POST", "/v1/workflows/push/batch", {
      workflows: [],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
  });
});

describe("GET /v1/workflows/pull 200", () => {
  const ROW_KEYS = [
    "description",
    "id",
    "lastEditedFrom",
    "name",
    "slug",
    "sourceHash",
    "sourceTs",
    "status",
    "steps",
    "transitions",
    "triggerConfig",
    "triggerType",
    "updatedAt",
  ];

  it("returns {workflows: []} when the org has none", async () => {
    const res = await call("GET", "/v1/workflows/pull");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workflows: [] });
  });

  it("returns every pushed workflow with its full field set", async () => {
    await call(
      "POST",
      "/v1/workflows/push",
      workflowPush("w1", {
        transitions: [
          {
            id: "t1",
            fromStepId: "s1",
            toStepId: "s2",
            condition: { branch: "yes" },
          },
        ],
      })
    );
    await call(
      "POST",
      "/v1/workflows/push",
      workflowPush("w2", { draft: true })
    );
    // Dashboard-made and foreign-org rows are not pulled.
    await db.insert(workflow).values([
      {
        id: `${PREFIX}-dash`,
        organizationId: ids.org,
        name: "Dashboard flow",
        status: "draft",
        triggerType: "event",
      },
      {
        id: `${PREFIX}-foreign`,
        organizationId: ids.otherOrg,
        name: "Foreign flow",
        slug: "foreign",
        status: "draft",
        triggerType: "event",
        pushedFromCli: true,
      },
    ]);

    const res = await call("GET", "/v1/workflows/pull");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(sortedKeys(body)).toEqual(["workflows"]);
    expect(body.workflows).toHaveLength(2);
    for (const row of body.workflows) {
      expect(sortedKeys(row)).toEqual(ROW_KEYS);
      expect(new Date(row.updatedAt).toISOString()).toBe(row.updatedAt);
      expect(row.lastEditedFrom).toBe("cli");
    }
    const w1 = body.workflows.find((w: { slug: string }) => w.slug === "w1");
    expect(w1.name).toBe("Flow w1");
    expect(w1.description).toBe("A pushed flow");
    expect(w1.status).toBe("enabled");
    expect(w1.triggerType).toBe("event");
    expect(w1.triggerConfig).toEqual({ eventName: "go" });
    expect(w1.sourceHash).toBe("hash-w1");
    expect(w1.sourceTs).toContain("defineWorkflow");
    expect(w1.steps).toEqual(workflowPush("w1").steps);
    expect(w1.transitions).toEqual([
      {
        id: "t1",
        fromStepId: "s1",
        toStepId: "s2",
        condition: { branch: "yes" },
      },
    ]);
    const w2 = body.workflows.find((w: { slug: string }) => w.slug === "w2");
    expect(w2.status).toBe("draft");
  });

  it("passes stored step, transition and trigger fields through untouched", async () => {
    // Rows written by the dashboard or an older CLI can carry fields the push
    // body schema would strip today (cascade metadata, trigger keys, anything
    // newer), so seed the row directly: a response schema must not drop them.
    const steps = [
      {
        id: "s2",
        type: "delay",
        name: "Wait",
        position: { x: 10, y: 20, z: 3 },
        config: { type: "delay", amount: 1, unit: "days", extra: { a: [1] } },
        cascadeGroupId: "g1",
        cascadeChannels: [{ channel: "email", delaySeconds: 5 }],
        someFutureField: "kept",
      },
    ];
    const transitions = [
      {
        id: "t9",
        fromStepId: "s1",
        toStepId: "s2",
        condition: { branch: "timeout" },
        someFutureField: 1,
      },
    ];
    const triggerConfig = {
      schedule: "cron(0 9 * * ? *)",
      timezone: "UTC",
      someFutureField: true,
    };
    await db.insert(workflow).values({
      id: `${PREFIX}-rich`,
      organizationId: ids.org,
      name: "Rich",
      slug: "rich",
      status: "paused",
      triggerType: "schedule",
      triggerConfig,
      steps,
      transitions,
      pushedFromCli: true,
      lastEditedFrom: "dashboard",
    } as unknown as typeof workflow.$inferInsert);

    const res = await call("GET", "/v1/workflows/pull");
    expect(res.status).toBe(200);
    const [row] = (await res.json()).workflows;
    expect(row.status).toBe("paused");
    expect(row.lastEditedFrom).toBe("dashboard");
    expect(row.steps).toEqual(steps);
    expect(row.transitions).toEqual(transitions);
    expect(row.triggerConfig).toEqual(triggerConfig);
  });

  it("serves jsonb the dashboard may have written with nulls and omissions", async () => {
    // Nothing in the database constrains these columns, so pull must not turn a
    // row it serves today into a 422 over a null or a missing optional key.
    const steps = [
      { id: "s1", type: "trigger", name: "Start" },
      { id: "s3", type: "delay", name: "Null position", position: null },
      {
        id: "s2",
        type: "delay",
        name: "Wait",
        position: { x: 1, y: 2 },
        config: { type: "delay", amount: 1, unit: "days" },
        cascadeGroupId: null,
        cascadeChannels: null,
      },
    ];
    const transitions = [
      { id: "t1", fromStepId: "s1", toStepId: "s2", condition: null },
      { id: "t2", fromStepId: "s2", toStepId: "s3" },
    ];
    const triggerConfig = {
      eventName: null,
      segmentId: null,
      schedule: null,
      timezone: null,
      topicId: null,
    };
    await db.insert(workflow).values({
      id: `${PREFIX}-loose`,
      organizationId: ids.org,
      name: "Loose",
      slug: "loose",
      status: "draft",
      triggerType: "event",
      triggerConfig,
      steps,
      transitions,
      pushedFromCli: true,
    } as unknown as typeof workflow.$inferInsert);

    const res = await call("GET", "/v1/workflows/pull");
    expect(res.status).toBe(200);
    const [row] = (await res.json()).workflows;
    expect(row.steps).toEqual(steps);
    expect(row.transitions).toEqual(transitions);
    expect(row.triggerConfig).toEqual(triggerConfig);
  });

  it("passes nulls through for columns a row leaves empty", async () => {
    await db.insert(workflow).values({
      id: `${PREFIX}-bare`,
      organizationId: ids.org,
      name: "Bare",
      slug: "bare",
      status: "draft",
      pushedFromCli: true,
    });
    const res = await call("GET", "/v1/workflows/pull");
    expect(res.status).toBe(200);
    const [row] = (await res.json()).workflows;
    expect(sortedKeys(row)).toEqual(ROW_KEYS);
    expect(row.description).toBeNull();
    expect(row.sourceTs).toBeNull();
    expect(row.sourceHash).toBeNull();
    expect(row.triggerType).toBeNull();
    expect(row.lastEditedFrom).toBeNull();
  });
});

describe("OpenAPI document", () => {
  type Schema = {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
    items?: Schema;
  };
  type Spec = {
    paths: Record<
      string,
      Record<
        string,
        {
          responses: Record<
            string,
            { content?: Record<string, { schema?: Schema }> }
          >;
        }
      >
    >;
  };

  async function fetchSpec(): Promise<Spec> {
    const specApp = new Elysia()
      .onAfterHandle({ as: "global" }, ({ path, response }) => {
        if (
          path === "/swagger/json" &&
          response &&
          typeof response === "object"
        ) {
          injectErrorResponses(response as Record<string, never>);
        }
      })
      .use(
        swagger({
          path: "/swagger",
          exclude: ["/swagger", "/swagger/json"],
        })
      )
      .derive(() => ({
        auth: {
          apiKeyId: null,
          organizationId: "o",
          userId: "u",
          planId: "pro",
        },
      }))
      .use(templatesSyncRoutes)
      .use(workflowsSyncRoutes);
    const res = await specApp.handle(
      new Request("http://localhost/swagger/json")
    );
    expect(res.status).toBe(200);
    return (await res.json()) as Spec;
  }

  const cases: Array<{
    method: "get" | "post";
    path: string;
    fields: string[];
    required: string[];
  }> = [
    {
      method: "post",
      path: "/v1/templates/push",
      fields: ["id", "slug", "status", "updatedAt", "remoteHash"],
      required: ["id", "slug", "status", "updatedAt", "remoteHash"],
    },
    {
      method: "post",
      path: "/v1/templates/push/batch",
      fields: ["results"],
      required: ["results"],
    },
    {
      method: "get",
      path: "/v1/templates/pull",
      fields: ["templates", "nextCursor"],
      required: ["templates"],
    },
    {
      method: "post",
      path: "/v1/workflows/push",
      fields: [
        "id",
        "slug",
        "status",
        "updatedAt",
        "remoteHash",
        "scheduleError",
      ],
      required: ["id", "slug", "status", "updatedAt", "remoteHash"],
    },
    {
      method: "post",
      path: "/v1/workflows/push/batch",
      fields: ["results"],
      required: ["results"],
    },
    {
      method: "get",
      path: "/v1/workflows/pull",
      fields: ["workflows"],
      required: ["workflows"],
    },
  ];

  for (const c of cases) {
    it(`${c.method.toUpperCase()} ${c.path} declares a JSON 200 schema`, async () => {
      const spec = await fetchSpec();
      const operation = spec.paths[c.path]?.[c.method];
      expect(operation, `${c.path} is in the spec`).toBeDefined();
      const schema =
        operation.responses["200"]?.content?.["application/json"]?.schema;
      expect(schema, `${c.path} has a 200 JSON schema`).toBeDefined();
      expect(schema?.type).toBe("object");
      expect(Object.keys(schema?.properties ?? {})).toEqual(
        expect.arrayContaining(c.fields)
      );
      expect([...(schema?.required ?? [])].sort()).toEqual(
        [...c.required].sort()
      );
    });
  }

  it("declares the first-push 201 on both push routes with the 200 schema", async () => {
    const spec = await fetchSpec();
    for (const path of ["/v1/templates/push", "/v1/workflows/push"]) {
      const responses = spec.paths[path].post.responses;
      const ok = responses["200"]?.content?.["application/json"]?.schema;
      const created = responses["201"]?.content?.["application/json"]?.schema;
      expect(created, `${path} lists a 201 JSON schema`).toBeDefined();
      expect(created, `${path}: 201 matches 200`).toEqual(ok);
    }
  });

  it("keeps the injected error responses next to the 200", async () => {
    const spec = await fetchSpec();
    for (const c of cases) {
      const responses = spec.paths[c.path][c.method].responses;
      expect(Object.keys(responses)).toEqual(
        expect.arrayContaining(["200", "403", "401"])
      );
    }
  });
});
