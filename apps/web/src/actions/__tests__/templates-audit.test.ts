/**
 * Audit Log Instrumentation Tests — Templates (Chunk 2)
 *
 * Verifies that publishTemplateToSES, bulkDeleteTemplates,
 * bulkUpdateTemplateType, and bulkUpdateTemplateStatus
 * each write a correctly-shaped audit log row after a successful mutation.
 */

import {
  auditLog,
  awsAccount,
  db,
  member,
  organization,
  template,
  user,
} from "@wraps/db";
import { and, eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  bulkDeleteTemplates,
  bulkUpdateTemplateStatus,
  bulkUpdateTemplateType,
  publishTemplateToSES,
} from "../templates";

// --- Test fixtures ---

const testUser = {
  id: "audit-v2-tmpl-user-a",
  email: "audit-v2-tmpl-user-a@example.com",
  name: "Audit V2 Template User A",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: "audit-v2-tmpl-org-a",
  name: "Audit V2 Template Org A",
  slug: "audit-v2-tmpl-org-a",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: "audit-v2-tmpl-member-a",
  organizationId: testOrg.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testAwsAccount = {
  id: "audit-v2-tmpl-aws-acct",
  organizationId: testOrg.id,
  name: "Audit V2 Template AWS Account",
  accountId: "123456789012",
  region: "us-east-1",
  roleArn: "arn:aws:iam::123456789012:role/audit-v2-tmpl-role",
  externalId: `audit-v2-tmpl-ext-${Date.now()}`,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// --- Mocks ---

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: testUser.id, email: testUser.email, name: testUser.name },
        session: {
          id: "audit-v2-tmpl-session-a",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: testUser.id,
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "audit-v2-tmpl-token",
        },
      })),
    },
  },
}));

vi.mock("@/lib/aws/credential-cache", () => ({
  getOrAssumeRole: vi.fn(async () => ({
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
    sessionToken: "test-token",
  })),
}));

const { mockUpsertSESTemplate, mockDeleteSESTemplate } = vi.hoisted(() => ({
  mockUpsertSESTemplate: vi.fn(async () => {}),
  mockDeleteSESTemplate: vi.fn(async () => {}),
}));

vi.mock("@wraps/email", () => ({
  upsertSESTemplate: mockUpsertSESTemplate,
  deleteSESTemplate: mockDeleteSESTemplate,
  generateSESTemplateName: vi.fn((id: string, _name: string) => `wraps-${id}`),
  testRenderSESTemplate: vi.fn(async () => ({ status: "ok" as const })),
  toSesVariableName: vi.fn((name: string) => name),
  transformVariablesForSes: vi.fn((text: string) => text),
}));

vi.mock("@react-email/render", () => ({
  render: vi.fn(async () => "<html><body>Audit V2 Test</body></html>"),
  toPlainText: vi.fn(() => "Audit V2 Test"),
}));

vi.mock("@/lib/activation-tracking", () => ({
  trackTemplatePublished: vi.fn(),
}));

// --- Helpers ---

async function createTemplate(
  overrides: Partial<typeof template.$inferInsert> = {}
): Promise<string> {
  const id = `audit-v2-tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(template).values({
    id,
    organizationId: testOrg.id,
    name: `Audit V2 Template ${id}`,
    content: {},
    // publishTemplateToSES uploads compiledHtml — templates are compiled on save
    compiledHtml: "<html><body><p>Test template body</p></body></html>",
    compiledText: "Test template body",
    sourceFormat: "react-email",
    status: "DRAFT",
    emailType: "marketing",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: testUser.id,
    ...overrides,
  });
  return id;
}

// --- DB setup & teardown ---

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

  await db
    .insert(organization)
    .values(testOrg)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrg.name },
    });

  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({ target: member.id, set: { role: testMember.role } });

  await db
    .insert(awsAccount)
    .values(testAwsAccount)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { updatedAt: new Date() },
    });
});

afterAll(async () => {
  await db.delete(template).where(eq(template.organizationId, testOrg.id));
  await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));
  await db.delete(awsAccount).where(eq(awsAccount.id, testAwsAccount.id));
  await db.delete(member).where(eq(member.organizationId, testOrg.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

// --- Tests ---

describe("bulkDeleteTemplates — writes template.deleted audit log", () => {
  afterEach(async () => {
    await db.delete(template).where(eq(template.organizationId, testOrg.id));
    await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));
  });

  it("inserts a template.deleted audit log row with count and templateIds in metadata", async () => {
    const id1 = await createTemplate({ name: "Delete Audit 1" });
    const id2 = await createTemplate({ name: "Delete Audit 2" });
    const templateIds = [id1, id2];

    const result = await bulkDeleteTemplates(testOrg.id, templateIds);

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "template.deleted")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("template.deleted");
    expect(row.resource).toBe("template");
    expect(row.metadata).toMatchObject({
      count: 2,
      templateIds,
    });
  });
});

describe("bulkUpdateTemplateType — writes template.type_updated audit log", () => {
  afterEach(async () => {
    await db.delete(template).where(eq(template.organizationId, testOrg.id));
    await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));
  });

  it("inserts a template.type_updated audit log row with count and newType in metadata", async () => {
    const id1 = await createTemplate({ name: "Type Update 1" });
    const id2 = await createTemplate({ name: "Type Update 2" });

    const result = await bulkUpdateTemplateType(
      testOrg.id,
      [id1, id2],
      "transactional"
    );

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "template.type_updated")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("template.type_updated");
    expect(row.resource).toBe("template");
    expect(row.metadata).toMatchObject({
      count: 2,
      newType: "transactional",
    });
  });
});

describe("bulkUpdateTemplateStatus — writes template.status_updated audit log", () => {
  afterEach(async () => {
    await db.delete(template).where(eq(template.organizationId, testOrg.id));
    await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));
  });

  it("inserts a template.status_updated audit log row with count and newStatus for DRAFT", async () => {
    const id1 = await createTemplate({
      name: "Status Update 1",
      status: "PUBLISHED",
    });
    const id2 = await createTemplate({
      name: "Status Update 2",
      status: "PUBLISHED",
    });

    const result = await bulkUpdateTemplateStatus(
      testOrg.id,
      [id1, id2],
      "DRAFT"
    );

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "template.status_updated")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("template.status_updated");
    expect(row.resource).toBe("template");
    expect(row.metadata).toMatchObject({
      count: 2,
      newStatus: "DRAFT",
    });
  });
});

describe("publishTemplateToSES — writes template.published audit log", () => {
  afterEach(async () => {
    await db.delete(template).where(eq(template.organizationId, testOrg.id));
    await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));
  });

  it("inserts a template.published audit log row after SES publish succeeds", async () => {
    const templateId = await createTemplate({
      name: "Publish Audit Test",
      subject: "Hello {{firstName}}",
      sourceFormat: "react-email",
      channel: "email",
    });

    const result = await publishTemplateToSES(templateId, testOrg.id);

    expect(result.success).toBe(true);

    // Give best-effort audit write time to settle (it uses .catch(() => {}))
    await new Promise((resolve) => setTimeout(resolve, 50));

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "template.published")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("template.published");
    expect(row.resource).toBe("template");
    expect(row.resourceId).toBe(templateId);
    expect(row.metadata).toMatchObject({
      templateId,
      name: "Publish Audit Test",
    });
  });
});
