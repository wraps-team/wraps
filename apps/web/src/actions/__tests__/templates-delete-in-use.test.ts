/**
 * Dashboard template delete refuses templates still in use, on both paths:
 * the `bulkDeleteTemplates` server action and the single-template route
 * DELETE /api/[orgSlug]/emails/templates/[id]. Both use the shared rule in
 * @wraps/db (`findTemplateDeleteBlockers`): a draft, scheduled, queued or
 * processing broadcast, or an enabled workflow, blocks the delete.
 *
 * Real DB. Every fixture id is namespaced by a per-run PREFIX, so this file
 * runs in the parallel project without colliding. SES and STS are mocked.
 */

import {
  auditLog,
  awsAccount,
  batchSend,
  db,
  member,
  organization,
  template,
  user,
  workflow,
} from "@wraps/db";
import { and, eq, inArray } from "drizzle-orm";
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

const PREFIX = `tdiu-${crypto.randomUUID().slice(0, 8)}`;

const testUser = {
  id: `${PREFIX}-user`,
  email: `${PREFIX}-user@example.com`,
  name: "Template In-Use Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: `${PREFIX}-org`,
  name: "Template In-Use Test Org",
  slug: `${PREFIX}-org`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

// A second org whose rows point at testOrg's templates, to prove every
// blocker query is scoped by organizationId.
const otherOrg = {
  id: `${PREFIX}-other-org`,
  name: "Template In-Use Other Org",
  slug: `${PREFIX}-other-org`,
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: `${PREFIX}-member`,
  organizationId: testOrg.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testAwsAccount = {
  id: `${PREFIX}-aws`,
  organizationId: testOrg.id,
  name: "Template In-Use AWS Account",
  accountId: "123456789012",
  region: "us-east-1",
  roleArn: "arn:aws:iam::123456789012:role/tdiu-role",
  externalId: `${PREFIX}-ext`,
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
          id: `${PREFIX}-session`,
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: testUser.id,
          expiresAt: new Date(Date.now() + 86_400_000),
          token: `${PREFIX}-token`,
        },
      })),
    },
  },
}));

// The route resolves the org from its slug through this helper.
vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: vi.fn(async (slug: string, userId: string) =>
    slug === testOrg.slug && userId === testUser.id
      ? {
          id: testOrg.id,
          name: testOrg.name,
          slug: testOrg.slug,
          userRole: "owner",
        }
      : null
  ),
}));

vi.mock("@/lib/aws/credential-cache", () => ({
  getOrAssumeRole: vi.fn(async () => ({
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
    sessionToken: "test-token",
  })),
}));

const { mockDeleteSESTemplate } = vi.hoisted(() => ({
  mockDeleteSESTemplate: vi.fn(
    async (
      _credentials: unknown,
      _region: string,
      _templateName: string
    ): Promise<void> => {}
  ),
}));

vi.mock("@wraps/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@wraps/email")>()),
  deleteSESTemplate: mockDeleteSESTemplate,
}));

vi.mock("@/lib/activation-tracking", () => ({
  trackTemplatePublished: vi.fn(),
}));

const { bulkDeleteTemplates } = await import("../templates");
const { DELETE } = await import(
  "@/app/api/[orgSlug]/emails/templates/[id]/route"
);

// --- Helpers ---

function uniq(label: string): string {
  return `${PREFIX}-${label}-${crypto.randomUUID().slice(0, 6)}`;
}

async function newTemplate(
  overrides: Partial<typeof template.$inferInsert> = {},
  organizationId = testOrg.id
): Promise<string> {
  const id = uniq("t");
  await db.insert(template).values({
    id,
    organizationId,
    name: `Template ${id}`,
    content: {},
    sourceFormat: "react-email",
    status: "PUBLISHED",
    sesTemplateName: `wraps-${id}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: testUser.id,
    ...overrides,
  });
  return id;
}

type BroadcastStatus = NonNullable<(typeof batchSend.$inferInsert)["status"]>;

async function insertBroadcast(
  templateId: string,
  status: BroadcastStatus,
  name: string,
  organizationId = testOrg.id
): Promise<void> {
  await db.insert(batchSend).values({
    organizationId,
    status,
    channel: "email",
    name,
    subject: "Hello",
    from: "hi@example.com",
    emailTemplateId: templateId,
    createdBy: testUser.id,
  });
}

async function insertEnabledWorkflow(
  templateId: string,
  name: string
): Promise<void> {
  await db.insert(workflow).values({
    id: uniq("wf"),
    organizationId: testOrg.id,
    name,
    status: "enabled",
    triggerType: "event",
    triggerConfig: {},
    steps: [
      {
        id: "step-email",
        type: "send_email",
        name: "Send email",
        position: { x: 0, y: 0 },
        config: { type: "send_email", templateId },
      },
    ],
    transitions: [],
    createdBy: testUser.id,
  });
}

async function templateExists(
  id: string,
  organizationId = testOrg.id
): Promise<boolean> {
  const rows = await db
    .select({ id: template.id })
    .from(template)
    .where(
      and(eq(template.id, id), eq(template.organizationId, organizationId))
    );
  return rows.length === 1;
}

/** Every template.deleted audit row, in any org, that names `templateId`. */
async function auditRowsNaming(templateId: string) {
  const rows = await db
    .select({ metadata: auditLog.metadata, resourceId: auditLog.resourceId })
    .from(auditLog)
    .where(
      and(
        inArray(auditLog.organizationId, [testOrg.id, otherOrg.id]),
        eq(auditLog.action, "template.deleted")
      )
    );
  return rows.filter(
    (row) =>
      row.resourceId === templateId ||
      JSON.stringify(row.metadata ?? {}).includes(templateId)
  );
}

async function deletedAuditRows() {
  return await db
    .select({ metadata: auditLog.metadata, resourceId: auditLog.resourceId })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.organizationId, testOrg.id),
        eq(auditLog.action, "template.deleted")
      )
    );
}

/** Records, at each SES delete, whether the template row still existed. */
function recordRowStateAtSesDelete(): Array<{
  templateName: string;
  rowExisted: boolean;
}> {
  const seen: Array<{ templateName: string; rowExisted: boolean }> = [];
  mockDeleteSESTemplate.mockImplementation(
    async (_credentials, _region, templateName) => {
      const rows = await db
        .select({ id: template.id })
        .from(template)
        .where(
          and(
            eq(template.organizationId, testOrg.id),
            eq(template.sesTemplateName, templateName)
          )
        );
      seen.push({ templateName, rowExisted: rows.length > 0 });
    }
  );
  return seen;
}

function routeDelete(id: string) {
  return DELETE(
    new Request(`http://localhost/api/${testOrg.slug}/emails/templates/${id}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ orgSlug: testOrg.slug, id }) }
  );
}

async function clearRows() {
  const orgIds = [testOrg.id, otherOrg.id];
  await db.delete(batchSend).where(inArray(batchSend.organizationId, orgIds));
  await db.delete(workflow).where(inArray(workflow.organizationId, orgIds));
  await db.delete(template).where(inArray(template.organizationId, orgIds));
  await db.delete(auditLog).where(inArray(auditLog.organizationId, orgIds));
}

// --- Setup ---

beforeAll(async () => {
  await db.insert(user).values(testUser);
  await db.insert(organization).values([testOrg, otherOrg]);
  await db.insert(member).values(testMember);
  await db.insert(awsAccount).values(testAwsAccount);
});

beforeEach(() => {
  mockDeleteSESTemplate.mockReset();
  mockDeleteSESTemplate.mockImplementation(async () => {});
});

afterEach(async () => {
  await clearRows();
});

afterAll(async () => {
  await clearRows();
  await db.delete(awsAccount).where(eq(awsAccount.id, testAwsAccount.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db
    .delete(organization)
    .where(inArray(organization.id, [testOrg.id, otherOrg.id]));
  await db.delete(user).where(eq(user.id, testUser.id));
});

// --- bulkDeleteTemplates ---

describe("bulkDeleteTemplates refuses templates still in use", () => {
  it.each(["draft", "processing"] as const)(
    "a %s broadcast blocks: nothing deleted, no audit row, SES untouched",
    async (status) => {
      const id = await newTemplate();
      await insertBroadcast(id, status, `${PREFIX} Spring sale`);

      const result = await bulkDeleteTemplates(testOrg.id, [id]);

      expect(result).toEqual({
        success: false,
        error: `Can't delete "Template ${id}": still used by broadcast "${PREFIX} Spring sale" (${status}).`,
      });
      expect(await templateExists(id)).toBe(true);
      expect(await deletedAuditRows()).toHaveLength(0);
      expect(mockDeleteSESTemplate).not.toHaveBeenCalled();
    }
  );

  it("an enabled workflow blocks: nothing deleted, no audit row, SES untouched", async () => {
    const id = await newTemplate();
    await insertEnabledWorkflow(id, `${PREFIX} Welcome`);

    const result = await bulkDeleteTemplates(testOrg.id, [id]);

    expect(result).toEqual({
      success: false,
      error: `Can't delete "Template ${id}": still used by enabled workflow "${PREFIX} Welcome".`,
    });
    expect(await templateExists(id)).toBe(true);
    expect(await deletedAuditRows()).toHaveLength(0);
    expect(mockDeleteSESTemplate).not.toHaveBeenCalled();
  });

  it("names at most 5 blockers, then 'and N more'", async () => {
    const id = await newTemplate();
    for (let i = 1; i <= 7; i++) {
      await insertBroadcast(id, "draft", `${PREFIX} Draft ${i}`);
    }

    const result = await bulkDeleteTemplates(testOrg.id, [id]);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.startsWith(`Can't delete "Template ${id}": still used by `)
    ).toBe(true);
    expect(result.error.match(/\(draft\)/g)).toHaveLength(5);
    expect(result.error).toMatch(/ and 2 more\.$/);
  });

  it("a mixed selection with one blocked template deletes nothing", async () => {
    const free = await newTemplate();
    const blocked = await newTemplate();
    await insertBroadcast(blocked, "draft", `${PREFIX} Half done`);

    const result = await bulkDeleteTemplates(testOrg.id, [free, blocked]);

    expect(result).toEqual({
      success: false,
      error: `Can't delete "Template ${blocked}": still used by broadcast "${PREFIX} Half done" (draft).`,
    });
    expect(await templateExists(free)).toBe(true);
    expect(await templateExists(blocked)).toBe(true);
    expect(await deletedAuditRows()).toHaveLength(0);
    expect(mockDeleteSESTemplate).not.toHaveBeenCalled();
  });

  it("an unused template is deleted, audited, and removed from SES after the row is gone", async () => {
    const id = await newTemplate();
    // A completed broadcast does not block.
    await insertBroadcast(id, "completed", `${PREFIX} Old send`);
    const seen = recordRowStateAtSesDelete();

    const result = await bulkDeleteTemplates(testOrg.id, [id]);

    expect(result).toEqual({ success: true, count: 1 });
    expect(await templateExists(id)).toBe(false);
    const audit = await deletedAuditRows();
    expect(audit).toHaveLength(1);
    expect(audit[0]?.metadata).toEqual({ count: 1, templateIds: [id] });
    expect(mockDeleteSESTemplate).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([{ templateName: `wraps-${id}`, rowExisted: false }]);
  });

  it("keeps the SES template when a surviving template shares its SES name", async () => {
    const sharedName = `wraps-${PREFIX}-shared`;
    const deleted = await newTemplate({ sesTemplateName: sharedName });
    const survivor = await newTemplate({ sesTemplateName: sharedName });

    const result = await bulkDeleteTemplates(testOrg.id, [deleted]);

    expect(result).toEqual({ success: true, count: 1 });
    expect(await templateExists(deleted)).toBe(false);
    expect(await templateExists(survivor)).toBe(true);
    expect(mockDeleteSESTemplate).not.toHaveBeenCalled();
  });

  it("deletes a shared SES name once when every template using it is deleted", async () => {
    const sharedName = `wraps-${PREFIX}-shared-all`;
    const first = await newTemplate({ sesTemplateName: sharedName });
    const second = await newTemplate({ sesTemplateName: sharedName });

    const result = await bulkDeleteTemplates(testOrg.id, [first, second]);

    expect(result).toEqual({ success: true, count: 2 });
    expect(mockDeleteSESTemplate).toHaveBeenCalledTimes(1);
    expect(mockDeleteSESTemplate).toHaveBeenCalledWith(
      expect.anything(),
      "us-east-1",
      sharedName
    );
  });

  it("another org's template id deletes nothing: count 0, row intact, SES untouched, no audit row", async () => {
    const foreign = await newTemplate({}, otherOrg.id);

    const result = await bulkDeleteTemplates(testOrg.id, [foreign]);

    expect(result).toEqual({ success: true, count: 0 });
    expect(await templateExists(foreign, otherOrg.id)).toBe(true);
    expect(mockDeleteSESTemplate).not.toHaveBeenCalled();
    expect(await auditRowsNaming(foreign)).toHaveLength(0);
    // Nothing was deleted, so no template.deleted row at all (as in the API).
    expect(await deletedAuditRows()).toHaveLength(0);
  });

  it("another org's draft broadcast pointing at this org's template does not block", async () => {
    // Would block if the broadcast query lost its organizationId predicate:
    // the status blocks and emailTemplateId is this org's template.
    const id = await newTemplate();
    await insertBroadcast(id, "draft", `${PREFIX} Foreign draft`, otherOrg.id);

    const result = await bulkDeleteTemplates(testOrg.id, [id]);

    expect(result).toEqual({ success: true, count: 1 });
    expect(await templateExists(id)).toBe(false);
  });
});

// --- DELETE /api/[orgSlug]/emails/templates/[id] ---

describe("DELETE /api/[orgSlug]/emails/templates/[id] refuses templates still in use", () => {
  it("a draft broadcast blocks: 409 naming it, row kept, no audit row, SES untouched", async () => {
    const id = await newTemplate();
    await insertBroadcast(id, "draft", `${PREFIX} Spring sale`);

    const response = await routeDelete(id);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: `Can't delete "Template ${id}": still used by broadcast "${PREFIX} Spring sale" (draft).`,
      blockingIds: [id],
    });
    expect(await templateExists(id)).toBe(true);
    expect(await deletedAuditRows()).toHaveLength(0);
    expect(mockDeleteSESTemplate).not.toHaveBeenCalled();
  });

  it("an enabled workflow blocks with 409", async () => {
    const id = await newTemplate();
    await insertEnabledWorkflow(id, `${PREFIX} Welcome`);

    const response = await routeDelete(id);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      `Can't delete "Template ${id}": still used by enabled workflow "${PREFIX} Welcome".`
    );
    expect(await templateExists(id)).toBe(true);
    expect(mockDeleteSESTemplate).not.toHaveBeenCalled();
  });

  it("an unused template is deleted, audited, and removed from SES after the row is gone", async () => {
    const id = await newTemplate();
    const seen = recordRowStateAtSesDelete();

    const response = await routeDelete(id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(await templateExists(id)).toBe(false);
    const audit = await deletedAuditRows();
    expect(audit).toHaveLength(1);
    expect(audit[0]?.resourceId).toBe(id);
    expect(seen).toEqual([{ templateName: `wraps-${id}`, rowExisted: false }]);
  });

  it("keeps the SES template when a surviving template shares its SES name", async () => {
    const sharedName = `wraps-${PREFIX}-route-shared`;
    const deleted = await newTemplate({ sesTemplateName: sharedName });
    const survivor = await newTemplate({ sesTemplateName: sharedName });

    const response = await routeDelete(deleted);

    expect(response.status).toBe(200);
    expect(await templateExists(deleted)).toBe(false);
    expect(await templateExists(survivor)).toBe(true);
    expect(mockDeleteSESTemplate).not.toHaveBeenCalled();
  });

  it("another org's template id is 404: row intact, SES untouched, no audit row names it", async () => {
    const foreign = await newTemplate({}, otherOrg.id);

    const response = await routeDelete(foreign);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Template not found" });
    expect(await templateExists(foreign, otherOrg.id)).toBe(true);
    expect(mockDeleteSESTemplate).not.toHaveBeenCalled();
    expect(await auditRowsNaming(foreign)).toHaveLength(0);
  });

  it("another org's draft broadcast pointing at this org's template does not block", async () => {
    const id = await newTemplate();
    await insertBroadcast(id, "draft", `${PREFIX} Foreign draft`, otherOrg.id);

    const response = await routeDelete(id);

    expect(response.status).toBe(200);
    expect(await templateExists(id)).toBe(false);
  });
});
