/**
 * GET/POST/PATCH /v1/templates, publish, duplicate, and /v1/templates/pull
 * on the combined app — real DB, boundary-mocked SES/credentials.
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mocks).
 * Boundary mocks: `@wraps/email`'s upsertSESTemplate/deleteSESTemplate (the
 * actual SES call), `../services/credentials`'s getCredentials (STS is
 * covered elsewhere), and the DynamoDB-backed rate limiter.
 * generateSESTemplateName and transformVariablesForSes run for real.
 */

import { createHash } from "node:crypto";
import { db, eq, template, templateVersion } from "@wraps/db";
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
import { createErrorHarness } from "./error-handler-harness";

const { mockUpsertSESTemplate, mockDeleteSESTemplate } = vi.hoisted(() => ({
  mockUpsertSESTemplate: vi.fn(async () => {}),
  mockDeleteSESTemplate: vi.fn(async () => {}),
}));

vi.mock("@wraps/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@wraps/email")>()),
  upsertSESTemplate: mockUpsertSESTemplate,
  deleteSESTemplate: mockDeleteSESTemplate,
}));

vi.mock("../services/credentials", () => ({
  getCredentials: vi.fn(async () => ({
    accessKeyId: "a",
    secretAccessKey: "b",
    sessionToken: "c",
    expiration: new Date(Date.now() + 3_600_000),
    region: "us-east-1",
  })),
}));

vi.mock("../middleware/rate-limit", () => ({
  rateLimitMiddleware: new Elysia(),
}));

const { templatesRoutes } = await import("../routes/templates");
const { templatesSyncRoutes } = await import("../routes/templates-sync");

// PREFIX doubles as a route param (`id: t.String({ maxLength: 36 })`), so
// keep it short — see the plan 216 lesson on this exact trap.
const PREFIX = `tapi-${crypto.randomUUID().slice(0, 8)}`;

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];

function appFor(organizationId: string, userId: string) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({
      auth: { apiKeyId: null, organizationId, userId, planId: "pro" },
    }))
    .use(templatesSyncRoutes)
    .use(templatesRoutes);
}

function unauthedApp() {
  const { app } = createErrorHarness();
  return app.use(templatesSyncRoutes).use(templatesRoutes);
}

function templateRow(
  id: string,
  organizationId: string,
  overrides: Partial<typeof template.$inferInsert> = {}
): typeof template.$inferInsert {
  const now = new Date();
  return {
    id,
    organizationId,
    name: `Template ${id}`,
    content: {},
    status: "DRAFT",
    sourceFormat: "react-email",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as typeof template.$inferInsert;
}

async function clearTemplates() {
  // template_version cascades from template's FK — no separate delete needed.
  await db
    .delete(template)
    .where(inArray(template.organizationId, [ids.org, ids.otherOrg]));
}

function collectKeys(v: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(v)) {
    for (const x of v) collectKeys(x, out);
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      collectKeys(x, out);
    }
  }
  return out;
}

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;
});

beforeEach(async () => {
  await clearTemplates();
  mockUpsertSESTemplate.mockClear();
  mockDeleteSESTemplate.mockClear();
});

afterAll(async () => {
  await clearTemplates();
  await cleanupBaseOrg(PREFIX);
});

describe("auth — 401 with no auth header", () => {
  const cases: Array<[string, () => Request]> = [
    ["GET /", () => new Request("http://localhost/v1/templates")],
    [
      "GET /:id",
      () => new Request(`http://localhost/v1/templates/${PREFIX}-nope`),
    ],
    [
      "POST /",
      () =>
        new Request("http://localhost/v1/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "x" }),
        }),
    ],
    [
      "PATCH /:id",
      () =>
        new Request(`http://localhost/v1/templates/${PREFIX}-nope`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
    ],
    [
      "POST /:id/publish",
      () =>
        new Request(`http://localhost/v1/templates/${PREFIX}-nope/publish`, {
          method: "POST",
        }),
    ],
    [
      "POST /:id/duplicate",
      () =>
        new Request(`http://localhost/v1/templates/${PREFIX}-nope/duplicate`, {
          method: "POST",
        }),
    ],
  ];

  it.each(cases)("%s returns 401", async (_label, buildRequest) => {
    const app = unauthedApp();
    const res = await app.handle(buildRequest());
    expect(res.status).toBe(401);
  });
});

describe("cross-org 404", () => {
  const FOREIGN_ID = `${PREFIX}-foreign`;

  beforeEach(async () => {
    await db.insert(template).values(
      templateRow(FOREIGN_ID, ids.otherOrg, {
        name: "Foreign",
        subject: "Foreign subject",
        compiledHtml: "<p>hi</p>",
      })
    );
  });

  const cases: Array<[string, () => Request]> = [
    [
      "GET /:id",
      () => new Request(`http://localhost/v1/templates/${FOREIGN_ID}`),
    ],
    [
      "PATCH /:id",
      () =>
        new Request(`http://localhost/v1/templates/${FOREIGN_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
    ],
    [
      "POST /:id/publish",
      () =>
        new Request(`http://localhost/v1/templates/${FOREIGN_ID}/publish`, {
          method: "POST",
        }),
    ],
    [
      "POST /:id/duplicate",
      () =>
        new Request(`http://localhost/v1/templates/${FOREIGN_ID}/duplicate`, {
          method: "POST",
        }),
    ],
  ];

  it.each(cases)(
    "%s returns 404 for another org's template",
    async (_label, buildRequest) => {
      const app = appFor(ids.org, ids.user);
      const res = await app.handle(buildRequest());
      expect(res.status).toBe(404);
    }
  );
});

describe("GET /v1/templates — list", () => {
  it("returns only this org's templates, newest updatedAt first, and paginates via nextCursor", async () => {
    const now = Date.now();
    await db.insert(template).values([
      templateRow(`${PREFIX}-list-1`, ids.org, {
        name: "One",
        updatedAt: new Date(now - 3000),
      }),
      templateRow(`${PREFIX}-list-2`, ids.org, {
        name: "Two",
        updatedAt: new Date(now - 2000),
      }),
      templateRow(`${PREFIX}-list-3`, ids.org, {
        name: "Three",
        updatedAt: new Date(now - 1000),
      }),
      templateRow(`${PREFIX}-list-foreign`, ids.otherOrg, {
        name: "Foreign",
        updatedAt: new Date(now),
      }),
    ]);

    const app = appFor(ids.org, ids.user);
    const res1 = await app.handle(
      new Request("http://localhost/v1/templates?limit=1")
    );
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.data).toHaveLength(1);
    expect(body1.data[0].id).toBe(`${PREFIX}-list-3`);
    expect(body1.nextCursor).not.toBeNull();

    const res2 = await app.handle(
      new Request(
        `http://localhost/v1/templates?limit=1&cursor=${encodeURIComponent(body1.nextCursor)}`
      )
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.data).toHaveLength(1);
    expect(body2.data[0].id).toBe(`${PREFIX}-list-2`);
    expect(
      body2.data.every((d: { id: string }) => d.id !== `${PREFIX}-list-foreign`)
    ).toBe(true);
  });

  it("never returns source, content, compiledHtml, compiledText, createdBy, or lastEditedBy", async () => {
    await db.insert(template).values(
      templateRow(`${PREFIX}-pii`, ids.org, {
        source: "export default function () {}",
        compiledHtml: "<p>hi</p>",
        compiledText: "hi",
        createdBy: ids.user,
        lastEditedBy: ids.user,
      })
    );

    const app = appFor(ids.org, ids.user);
    const res = await app.handle(new Request("http://localhost/v1/templates"));
    expect(res.status).toBe(200);
    const body = await res.json();

    const keys = collectKeys(body);
    for (const forbidden of [
      "source",
      "content",
      "compiledHtml",
      "compiledText",
      "createdBy",
      "lastEditedBy",
    ]) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });
});

describe("POST /v1/templates — create", () => {
  it("stores react-email format, non-null content, lastEditedFrom api, and a matching sourceHash", async () => {
    const source = "export default function Email() { return null; }";
    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request("http://localhost/v1/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Created", source }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sourceHash).toBe(
      createHash("sha256").update(source).digest("hex")
    );
    expect(body.lastEditedFrom).toBe("api");

    const [row] = await db
      .select({
        sourceFormat: template.sourceFormat,
        content: template.content,
      })
      .from(template)
      .where(eq(template.id, body.id));
    expect(row.sourceFormat).toBe("react-email");
    expect(row.content).not.toBeNull();
  });

  it("ignores a sourceFormat: tiptap in the body and stores react-email anyway", async () => {
    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request("http://localhost/v1/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Tiptap Attempt",
          sourceFormat: "tiptap",
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();

    const [row] = await db
      .select({ sourceFormat: template.sourceFormat })
      .from(template)
      .where(eq(template.id, body.id));
    expect(row.sourceFormat).toBe("react-email");
  });

  it("returns 409 when the slug already exists in this org", async () => {
    await db
      .insert(template)
      .values(
        templateRow(`${PREFIX}-slug-taken`, ids.org, { slug: "welcome" })
      );

    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request("http://localhost/v1/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Dup", slug: "welcome" }),
      })
    );
    expect(res.status).toBe(409);
  });
});

describe("PATCH /v1/templates/:id", () => {
  it("honors ifUnmodifiedSince: an earlier timestamp conflicts, its absence overwrites", async () => {
    const id = `${PREFIX}-patch-conflict`;
    const originalUpdatedAt = new Date(Date.now() - 60_000);
    await db.insert(template).values(
      templateRow(id, ids.org, {
        name: "Original",
        updatedAt: originalUpdatedAt,
      })
    );

    const app = appFor(ids.org, ids.user);
    const earlier = new Date(
      originalUpdatedAt.getTime() - 10_000
    ).toISOString();
    const res1 = await app.handle(
      new Request(`http://localhost/v1/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Attempted", ifUnmodifiedSince: earlier }),
      })
    );
    expect(res1.status).toBe(409);

    const res2 = await app.handle(
      new Request(`http://localhost/v1/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Overwritten" }),
      })
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.name).toBe("Overwritten");
  });

  it("writes one templateVersion row when source changes, none when it doesn't", async () => {
    const id = `${PREFIX}-version`;
    await db
      .insert(template)
      .values(templateRow(id, ids.org, { name: "Versioned" }));

    const app = appFor(ids.org, ids.user);
    const sourceA = "export default function A() {}";
    const res1 = await app.handle(
      new Request(`http://localhost/v1/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: sourceA }),
      })
    );
    expect(res1.status).toBe(200);

    const versionsAfterFirst = await db
      .select()
      .from(templateVersion)
      .where(eq(templateVersion.templateId, id));
    expect(versionsAfterFirst).toHaveLength(1);
    expect(versionsAfterFirst[0].source).toBe(sourceA);

    const res2 = await app.handle(
      new Request(`http://localhost/v1/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: sourceA }),
      })
    );
    expect(res2.status).toBe(200);

    const versionsAfterSecond = await db
      .select()
      .from(templateVersion)
      .where(eq(templateVersion.templateId, id));
    expect(versionsAfterSecond).toHaveLength(1);
  });

  it("blocks a CLI push without force after an API edit (line-318 predicate covers api)", async () => {
    const id = `${PREFIX}-api-then-cli`;
    await db
      .insert(template)
      .values(
        templateRow(id, ids.org, { name: "Original", slug: "api-then-cli" })
      );

    const app = appFor(ids.org, ids.user);
    const patchRes = await app.handle(
      new Request(`http://localhost/v1/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Edited via API" }),
      })
    );
    expect(patchRes.status).toBe(200);

    const pushRes = await app.handle(
      new Request("http://localhost/v1/templates/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: "api-then-cli",
          source: "// x",
          compiledHtml: "<p>x</p>",
          compiledText: "x",
          subject: "Subject",
          emailType: "transactional",
          variables: [],
          sourceHash: "hash",
          sesTemplateName: "wraps-x",
        }),
      })
    );
    expect(pushRes.status).toBe(409);
    const pushBody = await pushRes.json();
    expect(pushBody.error).toBe("conflict");
  });
});

describe("POST /v1/templates/:id/publish", () => {
  it("requires compiledHtml, then upserts the SES template and marks PUBLISHED", async () => {
    const id = `${PREFIX}-publish`;
    await db
      .insert(template)
      .values(
        templateRow(id, ids.org, { name: "Publishable", subject: "Hello" })
      );

    const app = appFor(ids.org, ids.user);
    const failRes = await app.handle(
      new Request(`http://localhost/v1/templates/${id}/publish`, {
        method: "POST",
      })
    );
    expect(failRes.status).toBe(400);
    expect(mockUpsertSESTemplate).not.toHaveBeenCalled();

    await db
      .update(template)
      .set({
        compiledHtml: "<p>Hi {{contactFirstName}}</p>",
        compiledText: "Hi",
      })
      .where(eq(template.id, id));

    const okRes = await app.handle(
      new Request(`http://localhost/v1/templates/${id}/publish`, {
        method: "POST",
      })
    );
    expect(okRes.status).toBe(200);
    const okBody = await okRes.json();
    expect(okBody.success).toBe(true);
    expect(mockUpsertSESTemplate).toHaveBeenCalledTimes(1);

    const [row] = await db
      .select({
        status: template.status,
        sesTemplateName: template.sesTemplateName,
        publishedAt: template.publishedAt,
      })
      .from(template)
      .where(eq(template.id, id));
    expect(row.status).toBe("PUBLISHED");
    expect(row.sesTemplateName).toBeTruthy();
    expect(row.publishedAt).not.toBeNull();
  });
});

describe("GET /v1/templates/pull on the combined app", () => {
  it("still reaches the sync handler (route precedence), and supports pagination + source toggle", async () => {
    await db.insert(template).values([
      templateRow(`${PREFIX}-pull-1`, ids.org, {
        slug: "pull-1",
        source: "// one",
        updatedAt: new Date(Date.now() - 2000),
      }),
      templateRow(`${PREFIX}-pull-2`, ids.org, {
        slug: "pull-2",
        source: "// two",
        updatedAt: new Date(Date.now() - 1000),
      }),
    ]);

    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request("http://localhost/v1/templates/pull")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.templates)).toBe(true);
    expect(body.templates.length).toBeGreaterThanOrEqual(2);
    expect("nextCursor" in body).toBe(false);

    const pagedRes = await app.handle(
      new Request("http://localhost/v1/templates/pull?limit=1")
    );
    expect(pagedRes.status).toBe(200);
    const pagedBody = await pagedRes.json();
    expect(pagedBody.templates).toHaveLength(1);
    expect(pagedBody.nextCursor).toBeDefined();

    const noSourceRes = await app.handle(
      new Request("http://localhost/v1/templates/pull?source=false")
    );
    expect(noSourceRes.status).toBe(200);
    const noSourceBody = await noSourceRes.json();
    expect(
      noSourceBody.templates.every(
        (t: Record<string, unknown>) => !("source" in t)
      )
    ).toBe(true);
  });
});

describe("POST /v1/templates/:id/duplicate", () => {
  it("copies channel and previewText, and resets slug/sesTemplateName/publishedAt/status", async () => {
    const id = `${PREFIX}-sms-original`;
    await db.insert(template).values(
      templateRow(id, ids.org, {
        name: "SMS Alert",
        channel: "sms",
        previewText: "preview",
        slug: "sms-alert",
        sesTemplateName: "wraps-sms-alert",
        publishedAt: new Date(),
        status: "PUBLISHED",
      })
    );

    const app = appFor(ids.org, ids.user);
    const res = await app.handle(
      new Request(`http://localhost/v1/templates/${id}/duplicate`, {
        method: "POST",
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("SMS Alert (Copy)");
    expect(body.channel).toBe("sms");
    expect(body.previewText).toBe("preview");
    expect(body.status).toBe("DRAFT");
    expect(body.slug).toBeNull();
    expect(body.publishedAt).toBeNull();

    const [row] = await db
      .select({ sesTemplateName: template.sesTemplateName })
      .from(template)
      .where(eq(template.id, body.id));
    expect(row.sesTemplateName).toBeNull();
  });
});
