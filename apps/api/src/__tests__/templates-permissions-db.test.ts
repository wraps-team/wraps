/**
 * Permission gate on POST/PATCH /v1/templates, POST /:id/publish,
 * POST /:id/duplicate, and the CLI push routes POST /v1/templates/push and
 * /push/batch. Real DB and real gate; boundary mocks as in templates-api-db
 * (SES upsert/delete, credentials, rate limiter).
 *
 * File suffix `-db.test.ts` = real Neon test branch (no `@wraps/db` mocks).
 */

import { db, eq, member, template, user } from "@wraps/db";
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
import {
  FULL_ACCESS_PERMISSIONS,
  READ_ONLY_PERMISSIONS,
} from "../services/api-keys";
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

// PREFIX doubles as a route param (`id: t.String({ maxLength: 36 })`), so it
// stays short: "t3-P2G3-" (8) + 8 random chars.
const PREFIX = `t3-P2G3-${crypto.randomUUID().slice(0, 8)}`;

const READ_ONLY_USER = `${PREFIX}-ro-user`;
const READ_ONLY_MEMBER = `${PREFIX}-ro-member`;
const READ_ONLY_EMAIL = `${PREFIX}-ro@example.com`;

const PERMISSION_DENIED = "You don't have permission to perform this action";

let ids: Awaited<ReturnType<typeof seedBaseOrg>>["ids"];

type Auth = {
  apiKeyId: string | null;
  organizationId: string;
  userId: string | null;
  planId: string;
  apiKeyScopes?: string[];
};

function appWith(auth: Auth) {
  const { app } = createErrorHarness();
  return app
    .derive(() => ({ auth }))
    .use(templatesSyncRoutes)
    .use(templatesRoutes);
}

type App = ReturnType<typeof appWith>;

/** A dashboard/CLI session acting as `userId` in the primary org. */
const asSession = (userId: string) =>
  appWith({ apiKeyId: null, organizationId: ids.org, userId, planId: "pro" });

/** An API key with the given scopes, in the primary org. */
const asKey = (scopes: string[]) =>
  appWith({
    apiKeyId: "key-p2g3",
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

function templateRow(
  id: string,
  overrides: Partial<typeof template.$inferInsert> = {}
): typeof template.$inferInsert {
  const now = new Date();
  return {
    id,
    organizationId: ids.org,
    name: `Template ${id}`,
    subject: "Hello",
    compiledHtml: "<p>Hi</p>",
    content: {},
    status: "DRAFT",
    sourceFormat: "react-email",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as typeof template.$inferInsert;
}

function pushBody(slug: string) {
  return {
    slug,
    source: "export default function T() {}",
    compiledHtml: "<p>Hi</p>",
    compiledText: "Hi",
    subject: "Hello",
    emailType: "transactional" as const,
    variables: [],
    sourceHash: "abc123",
    sesTemplateName: `wraps-${slug}`,
  };
}

async function orgTemplates() {
  return db
    .select({ id: template.id, name: template.name, status: template.status })
    .from(template)
    .where(eq(template.organizationId, ids.org));
}

async function readTemplate(id: string) {
  const [row] = await db
    .select({ name: template.name, status: template.status })
    .from(template)
    .where(eq(template.id, id));
  return row ?? null;
}

async function clearTemplates() {
  // template_version cascades from template's FK.
  await db
    .delete(template)
    .where(inArray(template.organizationId, [ids.org, ids.otherOrg]));
}

const DENIED_CALLERS: Array<[string, () => App]> = [
  ["read-only member session", () => asSession(READ_ONLY_USER)],
  ["API key with READ_ONLY_PERMISSIONS", () => asKey(READ_ONLY_PERMISSIONS)],
];

const ALLOWED_CALLERS: Array<[string, () => App]> = [
  ["owner session", () => asSession(ids.user)],
  [
    "API key with FULL_ACCESS_PERMISSIONS",
    () => asKey(FULL_ACCESS_PERMISSIONS),
  ],
];

beforeAll(async () => {
  const fixture = await seedBaseOrg(PREFIX);
  ids = fixture.ids;

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
  await clearTemplates();
  mockUpsertSESTemplate.mockClear();
  mockDeleteSESTemplate.mockClear();
});

afterAll(async () => {
  await clearTemplates();
  await db.delete(member).where(eq(member.id, READ_ONLY_MEMBER));
  await db.delete(user).where(eq(user.id, READ_ONLY_USER));
  await cleanupBaseOrg(PREFIX);
});

describe("denied callers: nothing changes", () => {
  describe.each(DENIED_CALLERS)("%s", (_label, makeApp) => {
    it("GET /v1/templates still answers 200 (reads are ungated)", async () => {
      const res = await call(makeApp(), "GET", "/v1/templates");
      expect(res.status).toBe(200);
    });

    it("POST /v1/templates is 403 and creates no row", async () => {
      const res = await call(makeApp(), "POST", "/v1/templates", {
        name: "Sneaky",
      });
      expect(res.status).toBe(403);
      expect(res.body?.error).toBe(PERMISSION_DENIED);
      expect(await orgTemplates()).toHaveLength(0);
    });

    it("PATCH /v1/templates/:id is 403 and the row is unchanged", async () => {
      const id = `${PREFIX}-patch`;
      await db
        .insert(template)
        .values(templateRow(id, { name: "Stable Name" }));

      const res = await call(makeApp(), "PATCH", `/v1/templates/${id}`, {
        name: "Changed",
      });
      expect(res.status).toBe(403);
      expect(res.body?.error).toBe(PERMISSION_DENIED);
      expect(await readTemplate(id)).toEqual({
        name: "Stable Name",
        status: "DRAFT",
      });
    });

    it("POST /:id/publish is 403, never calls SES, and the row stays DRAFT", async () => {
      const id = `${PREFIX}-publish`;
      await db.insert(template).values(templateRow(id));

      const res = await call(makeApp(), "POST", `/v1/templates/${id}/publish`);
      expect(res.status).toBe(403);
      expect(res.body?.error).toBe(PERMISSION_DENIED);
      expect(mockUpsertSESTemplate).not.toHaveBeenCalled();
      expect(mockDeleteSESTemplate).not.toHaveBeenCalled();
      expect((await readTemplate(id))?.status).toBe("DRAFT");
    });

    it("POST /:id/duplicate is 403 and creates no copy", async () => {
      const id = `${PREFIX}-dup`;
      await db.insert(template).values(templateRow(id));

      const res = await call(
        makeApp(),
        "POST",
        `/v1/templates/${id}/duplicate`
      );
      expect(res.status).toBe(403);
      expect(res.body?.error).toBe(PERMISSION_DENIED);
      expect(await orgTemplates()).toHaveLength(1);
    });

    it("POST /v1/templates/push is 403 and writes no row", async () => {
      const res = await call(
        makeApp(),
        "POST",
        "/v1/templates/push",
        pushBody(`${PREFIX}-push`)
      );
      expect(res.status).toBe(403);
      expect(res.body?.error).toBe(PERMISSION_DENIED);
      expect(await orgTemplates()).toHaveLength(0);
    });

    it("POST /v1/templates/push/batch is 403 and writes no row", async () => {
      const res = await call(makeApp(), "POST", "/v1/templates/push/batch", {
        templates: [pushBody(`${PREFIX}-b1`), pushBody(`${PREFIX}-b2`)],
      });
      expect(res.status).toBe(403);
      expect(res.body?.error).toBe(PERMISSION_DENIED);
      expect(await orgTemplates()).toHaveLength(0);
    });
  });
});

describe("allowed callers pass the gate", () => {
  describe.each(ALLOWED_CALLERS)("%s", (_label, makeApp) => {
    it("POST /v1/templates creates a template (201)", async () => {
      const res = await call(makeApp(), "POST", "/v1/templates", {
        name: "Welcome",
      });
      expect(res.status).toBe(201);
      expect(await orgTemplates()).toHaveLength(1);
    });

    it("PATCH /v1/templates/:id updates the row (200)", async () => {
      const id = `${PREFIX}-ok-patch`;
      await db.insert(template).values(templateRow(id));

      const res = await call(makeApp(), "PATCH", `/v1/templates/${id}`, {
        name: "Renamed",
      });
      expect(res.status).toBe(200);
      expect((await readTemplate(id))?.name).toBe("Renamed");
    });

    it("POST /:id/publish upserts SES and marks PUBLISHED (200)", async () => {
      const id = `${PREFIX}-ok-publish`;
      await db.insert(template).values(templateRow(id));

      const res = await call(makeApp(), "POST", `/v1/templates/${id}/publish`);
      expect(res.status).toBe(200);
      expect(mockUpsertSESTemplate).toHaveBeenCalledTimes(1);
      expect((await readTemplate(id))?.status).toBe("PUBLISHED");
    });

    it("POST /:id/duplicate creates a copy (201)", async () => {
      const id = `${PREFIX}-ok-dup`;
      await db.insert(template).values(templateRow(id));

      const res = await call(
        makeApp(),
        "POST",
        `/v1/templates/${id}/duplicate`
      );
      expect(res.status).toBe(201);
      expect(await orgTemplates()).toHaveLength(2);
    });

    it("POST /v1/templates/push upserts the template (201)", async () => {
      const res = await call(
        makeApp(),
        "POST",
        "/v1/templates/push",
        pushBody(`${PREFIX}-ok-push`)
      );
      expect(res.status).toBe(201);
      expect(await orgTemplates()).toHaveLength(1);
    });

    it("POST /v1/templates/push/batch upserts every template (200)", async () => {
      const res = await call(makeApp(), "POST", "/v1/templates/push/batch", {
        templates: [pushBody(`${PREFIX}-ok-b1`), pushBody(`${PREFIX}-ok-b2`)],
      });
      expect(res.status).toBe(200);
      expect(await orgTemplates()).toHaveLength(2);
    });
  });
});
