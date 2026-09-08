/**
 * Audit Log Instrumentation Tests — Route Handler Gaps
 *
 * Verifies that template duplicate POST and template versions POST each
 * write correctly-shaped audit log rows.
 */

import {
  auditLog,
  db,
  member,
  organization,
  template,
  templateVersion,
  user,
} from "@wraps/db";
import { and, eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// --- Mocks ---

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: {
          id: "audit-routes-user-a",
          email: "audit-routes-user-a@example.com",
          name: "Audit Routes User A",
        },
        session: {
          id: "audit-routes-session-a",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: "audit-routes-user-a",
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "audit-routes-token",
        },
      })),
    },
  },
}));

vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: vi.fn(async () => ({
    id: "audit-routes-org-a",
    name: "Audit Routes Org A",
    slug: "audit-routes-org-a",
    userRole: "owner",
  })),
}));

// --- Fixtures ---

const fixUser = {
  id: "audit-routes-user-a",
  email: "audit-routes-user-a@example.com",
  name: "Audit Routes User A",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const fixOrg = {
  id: "audit-routes-org-a",
  name: "Audit Routes Org A",
  slug: "audit-routes-org-a",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const fixMember = {
  id: "audit-routes-member-a",
  organizationId: fixOrg.id,
  userId: fixUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const fixTemplate = {
  id: "audit-routes-template-a",
  organizationId: fixOrg.id,
  name: "Audit Routes Template",
  emailType: "transactional" as const,
  status: "DRAFT" as const,
  sourceFormat: "react-email" as const,
  content: {},
  createdBy: fixUser.id,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// --- DB setup & teardown ---

beforeAll(async () => {
  await db
    .insert(user)
    .values(fixUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

  await db
    .insert(organization)
    .values(fixOrg)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: fixOrg.name },
    });

  await db
    .insert(member)
    .values(fixMember)
    .onConflictDoUpdate({ target: member.id, set: { role: fixMember.role } });

  await db
    .insert(template)
    .values(fixTemplate)
    .onConflictDoUpdate({
      target: template.id,
      set: { updatedAt: new Date() },
    });
});

afterAll(async () => {
  await db.delete(auditLog).where(eq(auditLog.organizationId, fixOrg.id));
  await db
    .delete(templateVersion)
    .where(eq(templateVersion.templateId, fixTemplate.id));
  // Duplicated templates share org, so clean by org and name pattern
  await db.delete(template).where(eq(template.organizationId, fixOrg.id));
  await db.delete(member).where(eq(member.organizationId, fixOrg.id));
  await db.delete(organization).where(eq(organization.id, fixOrg.id));
  await db.delete(user).where(eq(user.id, fixUser.id));
});

// biome-ignore lint/suspicious/noExplicitAny: test helper — route contexts are typed internally
function makeContext(params: Record<string, string>): any {
  return { params: Promise.resolve(params) };
}

// ============================================================
// emails/templates/[id]/duplicate/route.ts — POST
// ============================================================

describe("POST /api/[orgSlug]/emails/templates/[id]/duplicate — writes template.duplicated audit log", () => {
  afterEach(async () => {
    await db
      .delete(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "template.duplicated")
        )
      );
    // Clean up the duplicated template copy
    await db
      .delete(template)
      .where(
        and(
          eq(template.organizationId, fixOrg.id),
          eq(template.name, `${fixTemplate.name} (Copy)`)
        )
      );
  });

  it("inserts a template.duplicated audit log row after duplicating a template", async () => {
    const { POST } = await import(
      "../[orgSlug]/emails/templates/[id]/duplicate/route"
    );

    const request = new Request(
      `http://localhost/api/audit-routes-org-a/emails/templates/${fixTemplate.id}/duplicate`,
      { method: "POST" }
    );

    const response = await POST(
      request,
      makeContext({ orgSlug: fixOrg.slug, id: fixTemplate.id })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.name).toBe(`${fixTemplate.name} (Copy)`);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "template.duplicated")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(fixOrg.id);
    expect(row.userId).toBe(fixUser.id);
    expect(row.actorEmail).toBe(fixUser.email);
    expect(row.action).toBe("template.duplicated");
    expect(row.resource).toBe("template");
    expect(row.resourceId).toBe(fixTemplate.id);
    expect(row.metadata).toMatchObject({
      originalTemplateId: fixTemplate.id,
      newTemplateId: body.id,
    });
  });
});

// ============================================================
// emails/templates/[id]/versions/route.ts — POST
// ============================================================

describe("POST /api/[orgSlug]/emails/templates/[id]/versions — writes template.version_created audit log", () => {
  afterEach(async () => {
    await db
      .delete(templateVersion)
      .where(eq(templateVersion.templateId, fixTemplate.id));
    await db
      .delete(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "template.version_created")
        )
      );
  });

  it("inserts a template.version_created audit log row after creating a version", async () => {
    const { POST } = await import(
      "../[orgSlug]/emails/templates/[id]/versions/route"
    );

    const request = new Request(
      `http://localhost/api/audit-routes-org-a/emails/templates/${fixTemplate.id}/versions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeNote: "Initial snapshot" }),
      }
    );

    const response = await POST(
      request,
      makeContext({ orgSlug: fixOrg.slug, id: fixTemplate.id })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.version).toBe(1);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, fixOrg.id),
          eq(auditLog.action, "template.version_created")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(fixOrg.id);
    expect(row.userId).toBe(fixUser.id);
    expect(row.actorEmail).toBe(fixUser.email);
    expect(row.action).toBe("template.version_created");
    expect(row.resource).toBe("template");
    expect(row.resourceId).toBe(fixTemplate.id);
    expect(row.metadata).toMatchObject({
      templateId: fixTemplate.id,
      version: 1,
    });
  });
});
