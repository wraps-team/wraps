import {
  awsAccount,
  batchSend,
  contact,
  db,
  member,
  messageSend,
  organization,
  organizationExtension,
  subscription,
  template,
  user,
} from "@wraps/db";
import { and, eq, sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { exportAllBroadcasts } from "@/actions/export";
import { publishTemplateToSES } from "@/actions/templates";
import { checkFeatureAccess } from "@/lib/plan-limits";
import {
  deleteDraftBatchSend,
  duplicateBatchSend,
  exportBroadcastRecipients,
  listBatchSends,
  listBroadcastRecipientOutcomes,
  promoteDraftToSend,
  saveDraftBatchSend,
  updateDraftBatchSend,
} from "../batch";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const testUser = {
  id: "test-batch-drafts-user-1",
  email: "batch-drafts-owner@example.com",
  name: "Batch Drafts Owner",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testMemberUser = {
  id: "test-batch-drafts-member-user-1",
  email: "batch-drafts-member@example.com",
  name: "Batch Drafts Member",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrganization = {
  id: "test-batch-drafts-org-1",
  name: "Batch Drafts Test Org",
  slug: "batch-drafts-test-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testSecondaryOrganization = {
  id: "test-batch-drafts-org-2",
  name: "Batch Drafts Test Org 2",
  slug: "batch-drafts-test-org-2",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testOwnerMember = {
  id: "test-batch-drafts-owner-member-1",
  organizationId: testOrganization.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testSecondaryOwnerMember = {
  id: "test-batch-drafts-owner-member-2",
  organizationId: testSecondaryOrganization.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testRegularMember = {
  id: "test-batch-drafts-regular-member-1",
  organizationId: testOrganization.id,
  userId: testMemberUser.id,
  role: "billing" as const,
  createdAt: new Date(),
};

const testAwsAccount = {
  id: "test-batch-drafts-aws-1",
  organizationId: testOrganization.id,
  accountId: "123456789012",
  region: "us-east-1",
  roleArn: "arn:aws:iam::123456789012:role/test-role",
  externalId: "test-batch-drafts-ext-id-unique",
  name: "Test AWS Account",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: testUser.id,
};

const testTemplate = {
  id: "test-batch-drafts-template-1",
  organizationId: testOrganization.id,
  name: "Broadcast Template",
  subject: "Subject from template",
  content: {},
  status: "PUBLISHED" as const,
  type: "EMAIL" as const,
  sesTemplateName: "wraps-org-test-batch-drafts-template-1",
  publishedAt: new Date("2026-01-01"),
  createdAt: new Date(),
  updatedAt: new Date("2025-12-01"), // older than publishedAt so no re-publish triggers
  createdBy: testUser.id,
};

const testContact = {
  id: "test-batch-drafts-contact-1",
  organizationId: testOrganization.id,
  email: "active@example.com",
  emailHash: "batch-drafts-contact-hash-1",
  emailStatus: "active" as const,
  status: "active",
  properties: {},
  emailsSent: 0,
  emailsOpened: 0,
  emailsClicked: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock boundaries — system edges only. DB is real.

let currentMockUserId = testUser.id;

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/server", () => ({
  after: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: {
          id: currentMockUserId,
          email:
            currentMockUserId === testUser.id
              ? testUser.email
              : testMemberUser.email,
          name:
            currentMockUserId === testUser.id
              ? testUser.name
              : testMemberUser.name,
        },
        session: {
          id: "session-123",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: currentMockUserId,
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "test-token",
        },
      })),
    },
  },
}));

// plan-limits: default to allow. Individual tests override via mocked import.
vi.mock("@/lib/plan-limits", () => ({
  checkFeatureAccess: vi.fn(async () => ({ allowed: true })),
}));

// listBroadcastRecipients / listBroadcasts: passthrough to the real (real-DB)
// implementation by default — every test except the two truncation tests
// below hits the real repository function against the real DB, same as the
// rest of this file. The truncation tests override one call each, to avoid
// seeding 50,000+ rows to observe MAX_RECIPIENT_EXPORT_ROWS / MAX_EXPORT_ROWS
// truncation.
const { mockListBroadcastRecipients, mockListBroadcasts } = vi.hoisted(() => ({
  mockListBroadcastRecipients: vi.fn(),
  mockListBroadcasts: vi.fn(),
}));

vi.mock("@wraps/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@wraps/db")>();
  mockListBroadcastRecipients.mockImplementation(
    actual.listBroadcastRecipients
  );
  mockListBroadcasts.mockImplementation(actual.listBroadcasts);
  return {
    ...actual,
    listBroadcastRecipients: mockListBroadcastRecipients,
    listBroadcasts: mockListBroadcasts,
  };
});

// templates action — spy on publishTemplateToSES
vi.mock("@/actions/templates", () => ({
  publishTemplateToSES: vi.fn(async () => ({
    success: true,
    sesTemplateName: "wraps-org-test-batch-drafts-template-1",
  })),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Daily quota reserve preflight mocks — AssumeRole + SES GetAccount.
// validateAndPrepareSend now consults SES for every email broadcast (not only
// reserve-enabled ones), so this suite would otherwise attempt a real
// sts:AssumeRole against a fake ARN. Generous default quota so no assertion
// in this file changes.
// ─────────────────────────────────────────────────────────────────────────────

const getOrAssumeRoleMock = vi.fn().mockResolvedValue({
  accessKeyId: "AKIA-test",
  secretAccessKey: "secret-test",
  sessionToken: "token-test",
  expiration: new Date("2099-01-01"),
});

vi.mock("@/lib/aws/credential-cache", () => ({
  getOrAssumeRole: (...args: unknown[]) => getOrAssumeRoleMock(...args),
}));

let sesGetAccountShouldThrow = false;
let sesGetAccountQuota: {
  Max24HourSend?: number;
  SentLast24Hours?: number;
} | null = { Max24HourSend: 1_000_000, SentLast24Hours: 0 };

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = vi.fn().mockImplementation(() => {
      if (sesGetAccountShouldThrow) {
        return Promise.reject(new Error("GetAccount failed: network error"));
      }
      return Promise.resolve({ SendQuota: sesGetAccountQuota ?? {} });
    });
  },
  GetAccountCommand: class {
    constructor(public input: unknown) {}
  },
}));

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
  await db
    .insert(user)
    .values(testMemberUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
  await db
    .insert(organization)
    .values(testOrganization)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrganization.name },
    });
  await db
    .insert(organization)
    .values(testSecondaryOrganization)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testSecondaryOrganization.name },
    });
  await db
    .insert(organizationExtension)
    .values({ organizationId: testOrganization.id })
    .onConflictDoUpdate({
      target: organizationExtension.organizationId,
      set: { updatedAt: new Date() },
    });
  await db
    .insert(subscription)
    .values({
      id: `sub_test_batch_drafts_${testOrganization.id}`,
      plan: "growth",
      referenceId: testOrganization.id,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscription.id,
      set: { plan: "growth", status: "active" },
    });
  await db
    .insert(member)
    .values(testOwnerMember)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: testOwnerMember.role },
    });
  await db
    .insert(member)
    .values(testSecondaryOwnerMember)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: testSecondaryOwnerMember.role },
    });
  await db
    .insert(member)
    .values(testRegularMember)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: testRegularMember.role },
    });
  await db
    .insert(awsAccount)
    .values(testAwsAccount)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { name: testAwsAccount.name },
    });
  await db
    .insert(template)
    .values(testTemplate)
    .onConflictDoUpdate({
      target: template.id,
      set: { name: testTemplate.name },
    });
  await db
    .insert(contact)
    .values(testContact)
    .onConflictDoUpdate({
      target: contact.id,
      set: { updatedAt: new Date() },
    });
});

beforeEach(async () => {
  currentMockUserId = testUser.id;
  await db
    .delete(batchSend)
    .where(eq(batchSend.organizationId, testOrganization.id));
  await db
    .delete(batchSend)
    .where(eq(batchSend.organizationId, testSecondaryOrganization.id));
  vi.clearAllMocks();
  sesGetAccountShouldThrow = false;
  sesGetAccountQuota = { Max24HourSend: 1_000_000, SentLast24Hours: 0 };
  getOrAssumeRoleMock.mockResolvedValue({
    accessKeyId: "AKIA-test",
    secretAccessKey: "secret-test",
    sessionToken: "token-test",
    expiration: new Date("2099-01-01"),
  });
});

afterAll(async () => {
  await db
    .delete(batchSend)
    .where(eq(batchSend.organizationId, testOrganization.id));
  await db
    .delete(batchSend)
    .where(eq(batchSend.organizationId, testSecondaryOrganization.id));
  await db.delete(contact).where(eq(contact.id, testContact.id));
  await db.delete(template).where(eq(template.id, testTemplate.id));
  await db.delete(awsAccount).where(eq(awsAccount.id, testAwsAccount.id));
  await db.delete(member).where(eq(member.id, testOwnerMember.id));
  await db.delete(member).where(eq(member.id, testSecondaryOwnerMember.id));
  await db.delete(member).where(eq(member.id, testRegularMember.id));
  await db
    .delete(subscription)
    .where(eq(subscription.id, `sub_test_batch_drafts_${testOrganization.id}`));
  await db
    .delete(organizationExtension)
    .where(eq(organizationExtension.organizationId, testOrganization.id));
  await db.delete(organization).where(eq(organization.id, testOrganization.id));
  await db
    .delete(organization)
    .where(eq(organization.id, testSecondaryOrganization.id));
  await db.delete(user).where(eq(user.id, testUser.id));
  await db.delete(user).where(eq(user.id, testMemberUser.id));
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit 1 (tracer): saveDraftBatchSend inserts row with status='draft'
// ─────────────────────────────────────────────────────────────────────────────

describe("saveDraftBatchSend", () => {
  it("inserts a row with status='draft', organizationId set, and createdBy = session user", async () => {
    const result = await saveDraftBatchSend(testOrganization.id, {});

    expect(result.success).toBe(true);
    if (!result.success) return;

    const row = await db.query.batchSend.findFirst({
      where: and(
        eq(batchSend.id, result.batch.id),
        eq(batchSend.organizationId, testOrganization.id)
      ),
    });

    expect(row).toBeDefined();
    expect(row?.status).toBe("draft");
    expect(row?.organizationId).toBe(testOrganization.id);
    expect(row?.createdBy).toBe(testUser.id);
  });

  it("rejects a billing-role caller (no broadcast access)", async () => {
    currentMockUserId = testMemberUser.id;

    const result = await saveDraftBatchSend(testOrganization.id, {});

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("permission");

    const rowsAfter = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(batchSend)
      .where(eq(batchSend.organizationId, testOrganization.id));
    expect(rowsAfter[0]?.count ?? 0).toBe(0);
  });

  it("rejects when checkFeatureAccess('batch') denies", async () => {
    vi.mocked(checkFeatureAccess).mockResolvedValueOnce({
      allowed: false,
      requiredPlan: "starter",
      message: "Upgrade to send broadcasts",
    });

    const result = await saveDraftBatchSend(testOrganization.id, {});

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/upgrade|not available/i);

    const rowsAfter = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(batchSend)
      .where(eq(batchSend.organizationId, testOrganization.id));
    expect(rowsAfter[0]?.count ?? 0).toBe(0);
  });

  it("with template+htmlContent does NOT call publishTemplateToSES", async () => {
    const result = await saveDraftBatchSend(testOrganization.id, {
      templateId: testTemplate.id,
      htmlContent: "<p>hi</p>",
    });

    expect(result.success).toBe(true);
    expect(vi.mocked(publishTemplateToSES)).not.toHaveBeenCalled();
  });
});

describe("updateDraftBatchSend", () => {
  it("updates subject+from on an existing draft; other fields unchanged", async () => {
    const created = await saveDraftBatchSend(testOrganization.id, {
      subject: "Original subject",
      from: "old@example.com",
      previewText: "keep-me",
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    const result = await updateDraftBatchSend(
      created.batch.id,
      testOrganization.id,
      { subject: "New subject", from: "new@example.com" }
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.batch.subject).toBe("New subject");
    expect(result.batch.from).toBe("new@example.com");
    expect(result.batch.previewText).toBe("keep-me");
    expect(result.batch.status).toBe("draft");
  });

  it("blocks cross-org IDOR — draft in org B unreachable via org A's session", async () => {
    // Seed a draft in the secondary org directly in DB
    const [otherOrgDraft] = await db
      .insert(batchSend)
      .values({
        organizationId: testSecondaryOrganization.id,
        status: "draft",
        channel: "email",
        subject: "Secret draft",
        createdBy: testUser.id,
      })
      .returning();
    expect(otherOrgDraft).toBeDefined();
    if (!otherOrgDraft) return;

    // Call as org A session (current mock user is still testUser) but pass org A's id
    const result = await updateDraftBatchSend(
      otherOrgDraft.id,
      testOrganization.id,
      { subject: "Attacker subject" }
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/not found/i);

    // Secret draft still unchanged
    const after = await db.query.batchSend.findFirst({
      where: eq(batchSend.id, otherOrgDraft.id),
    });
    expect(after?.subject).toBe("Secret draft");
  });

  it("refuses to update a non-draft row; row unchanged", async () => {
    // Insert a 'queued' row directly (bypassing saveDraftBatchSend so status='queued')
    const [queuedRow] = await db
      .insert(batchSend)
      .values({
        organizationId: testOrganization.id,
        status: "queued",
        channel: "email",
        subject: "Locked subject",
        from: "locked@example.com",
        awsAccountId: testAwsAccount.id,
        createdBy: testUser.id,
      })
      .returning();
    expect(queuedRow).toBeDefined();
    if (!queuedRow) return;

    const before = await db.query.batchSend.findFirst({
      where: eq(batchSend.id, queuedRow.id),
    });

    const result = await updateDraftBatchSend(
      queuedRow.id,
      testOrganization.id,
      { subject: "Should not apply" }
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/queued|draft/i);

    const after = await db.query.batchSend.findFirst({
      where: eq(batchSend.id, queuedRow.id),
    });
    expect(after?.subject).toBe(before?.subject);
    expect(after?.from).toBe(before?.from);
    expect(after?.status).toBe("queued");
  });
});

describe("promoteDraftToSend", () => {
  it("happy path: publishes template, POSTs to /v1/batch/:id/send, flips status to 'queued', row count unchanged", async () => {
    // Ensure NEXT_PUBLIC_API_URL is set for this test
    const origApiUrl = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";

    // Make template need publish: null sesTemplateName
    await db
      .update(template)
      .set({ sesTemplateName: null, publishedAt: null })
      .where(eq(template.id, testTemplate.id));

    let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: testAwsAccount.id,
        templateId: testTemplate.id,
        from: "promote@example.com",
        subject: "Promote me",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      // Stub fetch: intercept only our API POST; pass through everything
      // else (Neon serverless DB uses fetch internally).
      const realFetch = globalThis.fetch.bind(globalThis);
      fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (...args: Parameters<typeof fetch>) => {
          const [url] = args;
          const asString = typeof url === "string" ? url : url.toString();
          if (asString.includes("/v1/batch/") && asString.endsWith("/send")) {
            const match = asString.match(/\/v1\/batch\/([^/]+)\/send$/);
            if (match) {
              await db
                .update(batchSend)
                .set({ status: "queued", totalRecipients: 1 })
                .where(
                  and(
                    eq(batchSend.id, match[1]!),
                    eq(batchSend.organizationId, testOrganization.id),
                    eq(batchSend.status, "draft")
                  )
                );
            }
            return new Response(
              JSON.stringify({
                id: match?.[1] ?? "",
                status: "queued",
                channel: "email",
                totalRecipients: 1,
                createdAt: new Date().toISOString(),
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return realFetch(...args);
        });

      // Row count snapshot BEFORE
      const [before] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      const beforeCount = before?.count ?? 0;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      // publishTemplateToSES invoked
      expect(vi.mocked(publishTemplateToSES)).toHaveBeenCalledWith(
        testTemplate.id,
        testOrganization.id
      );

      // fetch invoked with the promote URL
      expect(fetchSpy).toHaveBeenCalledWith(
        `http://localhost:3001/v1/batch/${draft.batch.id}/send`,
        expect.objectContaining({ method: "POST" })
      );

      // Row is now queued
      expect(result.batch.status).toBe("queued");

      // Row count unchanged — no orphan INSERT
      const [after] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(batchSend)
        .where(eq(batchSend.organizationId, testOrganization.id));
      const afterCount = after?.count ?? 0;
      expect(afterCount).toBe(beforeCount);
    } finally {
      fetchSpy?.mockRestore();
      if (origApiUrl === undefined) {
        process.env.NEXT_PUBLIC_API_URL = undefined;
      } else {
        process.env.NEXT_PUBLIC_API_URL = origApiUrl;
      }
      // Restore template
      await db
        .update(template)
        .set({
          sesTemplateName: testTemplate.sesTemplateName,
          publishedAt: testTemplate.publishedAt,
        })
        .where(eq(template.id, testTemplate.id));
    }
  });

  it("blocks cross-org IDOR — cannot promote a draft from another org", async () => {
    const [otherOrgDraft] = await db
      .insert(batchSend)
      .values({
        organizationId: testSecondaryOrganization.id,
        status: "draft",
        channel: "email",
        awsAccountId: testAwsAccount.id,
        subject: "Secret promote target",
        createdBy: testUser.id,
      })
      .returning();
    expect(otherOrgDraft).toBeDefined();
    if (!otherOrgDraft) return;

    const result = await promoteDraftToSend(
      otherOrgDraft.id,
      testOrganization.id,
      {}
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/not found/i);

    // Row status unchanged
    const after = await db.query.batchSend.findFirst({
      where: eq(batchSend.id, otherOrgDraft.id),
    });
    expect(after?.status).toBe("draft");
  });

  it("returns 'no contacts' error when recipient count is 0; row status unchanged", async () => {
    // Delete the active contact so the recipient count returns 0.
    await db.delete(contact).where(eq(contact.id, testContact.id));

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: testAwsAccount.id,
        from: "from@example.com",
        subject: "Zero recipients test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toMatch(/no active email contacts|no contacts/i);

      const after = await db.query.batchSend.findFirst({
        where: eq(batchSend.id, draft.batch.id),
      });
      expect(after?.status).toBe("draft");
    } finally {
      // Restore the contact for subsequent tests
      await db
        .insert(contact)
        .values(testContact)
        .onConflictDoUpdate({
          target: contact.id,
          set: { updatedAt: new Date() },
        });
    }
  });
});

describe("deleteDraftBatchSend", () => {
  it("hard-deletes a draft; refuses queued; org-scoped", async () => {
    // Seed a draft + a queued row in the same org
    const draft = await saveDraftBatchSend(testOrganization.id, {
      subject: "Delete me",
    });
    expect(draft.success).toBe(true);
    if (!draft.success) return;

    const [queuedRow] = await db
      .insert(batchSend)
      .values({
        organizationId: testOrganization.id,
        status: "queued",
        channel: "email",
        subject: "Do not delete",
        awsAccountId: testAwsAccount.id,
        createdBy: testUser.id,
      })
      .returning();
    expect(queuedRow).toBeDefined();
    if (!queuedRow) return;

    // Count before
    const [before] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(batchSend)
      .where(eq(batchSend.organizationId, testOrganization.id));
    expect(before?.count).toBe(2);

    // Delete draft → succeeds
    const resultDraft = await deleteDraftBatchSend(
      draft.batch.id,
      testOrganization.id
    );
    expect(resultDraft.success).toBe(true);

    const draftAfter = await db.query.batchSend.findFirst({
      where: eq(batchSend.id, draft.batch.id),
    });
    expect(draftAfter).toBeUndefined();

    // Delete queued → refuses, row still there
    const resultQueued = await deleteDraftBatchSend(
      queuedRow.id,
      testOrganization.id
    );
    expect(resultQueued.success).toBe(false);

    const queuedAfter = await db.query.batchSend.findFirst({
      where: eq(batchSend.id, queuedRow.id),
    });
    expect(queuedAfter?.status).toBe("queued");

    // Count after: 2 - 1 (draft deleted) = 1 (queued still there)
    const [after] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(batchSend)
      .where(eq(batchSend.organizationId, testOrganization.id));
    expect(after?.count).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// duplicateBatchSend: clone a broadcast's config as a new draft.
// ─────────────────────────────────────────────────────────────────────────────

describe("duplicateBatchSend", () => {
  it("on a completed source, creates a new row with status='draft', name='<source.name> (copy)', createdBy = session user", async () => {
    // Seed a completed source directly so the source is not a draft.
    const [source] = await db
      .insert(batchSend)
      .values({
        organizationId: testOrganization.id,
        status: "completed",
        channel: "email",
        name: "Q1 Launch",
        subject: "Hello",
        from: "hi@example.com",
        awsAccountId: testAwsAccount.id,
        createdBy: testUser.id,
      })
      .returning();
    expect(source).toBeDefined();
    if (!source) return;

    const result = await duplicateBatchSend(source.id, testOrganization.id);

    expect(result.success).toBe(true);
    if (!result.success) return;

    // New row is distinct from source
    expect(result.batch.id).not.toBe(source.id);
    expect(result.batch.status).toBe("draft");
    expect(result.batch.name).toBe("Q1 Launch (copy)");

    const row = await db.query.batchSend.findFirst({
      where: and(
        eq(batchSend.id, result.batch.id),
        eq(batchSend.organizationId, testOrganization.id)
      ),
    });
    expect(row).toBeDefined();
    expect(row?.status).toBe("draft");
    expect(row?.organizationId).toBe(testOrganization.id);
    expect(row?.createdBy).toBe(testUser.id);
    expect(row?.name).toBe("Q1 Launch (copy)");
  });

  it("copies all content fields exactly from source", async () => {
    const sourceMappings = [
      {
        variableName: "coupon",
        source: { type: "static" as const, value: "WELCOME10" },
      },
    ];

    const [source] = await db
      .insert(batchSend)
      .values({
        organizationId: testOrganization.id,
        status: "completed",
        channel: "email",
        name: "Launch email",
        subject: "Hi there",
        previewText: "A fresh start",
        from: "founder@example.com",
        fromName: "Founder",
        replyTo: "reply@example.com",
        emailTemplateId: testTemplate.id,
        htmlContent: "<p>Hello</p>",
        textContent: "Hello",
        variableMappings: sourceMappings,
        audienceType: "topic",
        topicId: "topic-123",
        segmentId: "segment-456",
        awsAccountId: testAwsAccount.id,
        body: "SMS body text",
        senderId: "sender-999",
        createdBy: testUser.id,
      })
      .returning();
    expect(source).toBeDefined();
    if (!source) return;

    const result = await duplicateBatchSend(source.id, testOrganization.id);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const row = await db.query.batchSend.findFirst({
      where: eq(batchSend.id, result.batch.id),
    });
    expect(row).toBeDefined();
    if (!row) return;

    // Content fields copied verbatim
    expect(row.channel).toBe(source.channel);
    expect(row.subject).toBe(source.subject);
    expect(row.previewText).toBe(source.previewText);
    expect(row.from).toBe(source.from);
    expect(row.fromName).toBe(source.fromName);
    expect(row.replyTo).toBe(source.replyTo);
    expect(row.emailTemplateId).toBe(source.emailTemplateId);
    expect(row.htmlContent).toBe(source.htmlContent);
    expect(row.textContent).toBe(source.textContent);
    expect(row.variableMappings).toEqual(source.variableMappings);
    expect(row.audienceType).toBe(source.audienceType);
    expect(row.topicId).toBe(source.topicId);
    expect(row.segmentId).toBe(source.segmentId);
    expect(row.awsAccountId).toBe(source.awsAccountId);
    expect(row.body).toBe(source.body);
    expect(row.senderId).toBe(source.senderId);
  });

  it("does NOT copy runtime state: counters reset to 0, timestamps/errors null", async () => {
    // Seed a source that has done a full send — counters populated, timestamps
    // set, errors present. The duplicate must NOT carry any of that over.
    const [source] = await db
      .insert(batchSend)
      .values({
        organizationId: testOrganization.id,
        status: "completed",
        channel: "email",
        name: "Finished broadcast",
        subject: "Hi",
        from: "hi@example.com",
        awsAccountId: testAwsAccount.id,
        totalRecipients: 100,
        processedRecipients: 100,
        sent: 95,
        delivered: 90,
        failed: 5,
        opened: 40,
        clicked: 10,
        bounced: 3,
        complained: 1,
        suppressed: 2,
        smsSegments: 0,
        smsOptedOut: 0,
        errorMessage: "partial failure",
        errorDetails: { reason: "rate limit" },
        scheduledFor: new Date("2026-01-01"),
        startedAt: new Date("2026-01-02"),
        completedAt: new Date("2026-01-03"),
        createdBy: testUser.id,
      })
      .returning();
    expect(source).toBeDefined();
    if (!source) return;

    const result = await duplicateBatchSend(source.id, testOrganization.id);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const row = await db.query.batchSend.findFirst({
      where: eq(batchSend.id, result.batch.id),
    });
    expect(row).toBeDefined();
    if (!row) return;

    // All counters reset to 0
    expect(row.totalRecipients).toBe(0);
    expect(row.processedRecipients).toBe(0);
    expect(row.sent).toBe(0);
    expect(row.delivered).toBe(0);
    expect(row.failed).toBe(0);
    expect(row.opened).toBe(0);
    expect(row.clicked).toBe(0);
    expect(row.bounced).toBe(0);
    expect(row.complained).toBe(0);
    expect(row.suppressed).toBe(0);
    expect(row.smsSegments).toBe(0);
    expect(row.smsOptedOut).toBe(0);

    // Timestamps and errors null
    expect(row.scheduledFor).toBeNull();
    expect(row.startedAt).toBeNull();
    expect(row.completedAt).toBeNull();
    expect(row.errorMessage).toBeNull();
    expect(row.errorDetails).toBeNull();
  });

  it("blocks cross-org IDOR — source in org B unreachable with org A's id; no row inserted in org A", async () => {
    // Seed a broadcast in the secondary org
    const [otherOrgBatch] = await db
      .insert(batchSend)
      .values({
        organizationId: testSecondaryOrganization.id,
        status: "completed",
        channel: "email",
        name: "Secret broadcast",
        subject: "Confidential",
        from: "leak@example.com",
        createdBy: testUser.id,
      })
      .returning();
    expect(otherOrgBatch).toBeDefined();
    if (!otherOrgBatch) return;

    // Row count in org A before — should be 0
    const [before] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(batchSend)
      .where(eq(batchSend.organizationId, testOrganization.id));
    const beforeCount = before?.count ?? 0;

    // Attempt to duplicate the org-B broadcast using org A's id
    const result = await duplicateBatchSend(
      otherOrgBatch.id,
      testOrganization.id
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/not found/i);

    // No row was inserted in org A
    const [after] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(batchSend)
      .where(eq(batchSend.organizationId, testOrganization.id));
    const afterCount = after?.count ?? 0;
    expect(afterCount).toBe(beforeCount);

    // Source in org B is still intact
    const stillThere = await db.query.batchSend.findFirst({
      where: eq(batchSend.id, otherOrgBatch.id),
    });
    expect(stillThere?.name).toBe("Secret broadcast");
    expect(stillThere?.organizationId).toBe(testSecondaryOrganization.id);
  });
});

describe("listBroadcastRecipientOutcomes / exportBroadcastRecipients", () => {
  afterEach(async () => {
    await db
      .delete(messageSend)
      .where(eq(messageSend.organizationId, testOrganization.id));
    await db
      .delete(messageSend)
      .where(eq(messageSend.organizationId, testSecondaryOrganization.id));
  });

  async function seedBatchWithRecipients() {
    const [batch] = await db
      .insert(batchSend)
      .values({
        organizationId: testOrganization.id,
        channel: "email",
        status: "completed",
        createdBy: testUser.id,
      })
      .returning();
    if (!batch) {
      throw new Error("failed to seed batch for recipients test");
    }

    await db.insert(messageSend).values([
      {
        organizationId: testOrganization.id,
        awsAccountId: testAwsAccount.id,
        channel: "email",
        sourceType: "batch",
        batchSendId: batch.id,
        recipient: "recip-outcome-1@example.com",
        status: "failed",
        error: "Message rejected",
      },
      {
        organizationId: testOrganization.id,
        awsAccountId: testAwsAccount.id,
        channel: "email",
        sourceType: "batch",
        batchSendId: batch.id,
        recipient: "recip-outcome-2@example.com",
        status: "sent",
      },
    ]);

    return batch;
  }

  it("listBroadcastRecipientOutcomes returns the seeded recipients for the owning org", async () => {
    const batch = await seedBatchWithRecipients();

    const result = await listBroadcastRecipientOutcomes(
      batch.id,
      testOrganization.id
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.total).toBe(2);
    expect(result.recipients.map((r) => r.recipient).sort()).toEqual([
      "recip-outcome-1@example.com",
      "recip-outcome-2@example.com",
    ]);
  });

  it("listBroadcastRecipientOutcomes returns nothing when called with a different org's id (IDOR guard)", async () => {
    const batch = await seedBatchWithRecipients();

    // The batch and its recipients belong to testOrganization. Call as if the
    // caller resolved to testSecondaryOrganization instead — the repository
    // scopes by both batchSendId AND organizationId, so this must come back
    // empty even though the batchId is valid and the caller has real access
    // to testSecondaryOrganization.
    const result = await listBroadcastRecipientOutcomes(
      batch.id,
      testSecondaryOrganization.id
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.total).toBe(0);
    expect(result.recipients).toEqual([]);
  });

  it("exportBroadcastRecipients returns nothing when called with a different org's id (IDOR guard)", async () => {
    const batch = await seedBatchWithRecipients();

    const result = await exportBroadcastRecipients(
      batch.id,
      testSecondaryOrganization.id
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.total).toBe(0);
    expect(result.recipients).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it("exportBroadcastRecipients sets truncated: true when total exceeds the returned row count", async () => {
    const batch = await seedBatchWithRecipients();

    // Override the repository call for this one export so we can observe the
    // truncation math (`total > rows.length`) without seeding more than
    // MAX_RECIPIENT_EXPORT_ROWS (50,000) real rows.
    mockListBroadcastRecipients.mockImplementationOnce(async () => ({
      rows: [
        {
          id: "truncation-test-row-1",
          recipient: "recip-outcome-1@example.com",
          status: "failed",
          error: "Message rejected",
          bounceType: null,
          bounceSubType: null,
          sentAt: null,
          createdAt: new Date(),
        },
      ],
      total: 5,
    }));

    const result = await exportBroadcastRecipients(
      batch.id,
      testOrganization.id
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.total).toBe(5);
    expect(result.recipients).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  it("exportBroadcastRecipients sets truncated: false when every matching row is returned", async () => {
    const batch = await seedBatchWithRecipients();

    const result = await exportBroadcastRecipients(
      batch.id,
      testOrganization.id
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.total).toBe(2);
    expect(result.recipients).toHaveLength(2);
    expect(result.truncated).toBe(false);
  });
});

describe("listBatchSends / exportAllBroadcasts", () => {
  afterEach(async () => {
    await db
      .delete(batchSend)
      .where(eq(batchSend.organizationId, testOrganization.id));
  });

  async function seedListBatches() {
    const [batchA] = await db
      .insert(batchSend)
      .values({
        organizationId: testOrganization.id,
        channel: "email",
        status: "completed",
        name: "Action Test Alpha",
        subject: "alpha subject",
        createdBy: testUser.id,
      })
      .returning();
    const [batchB] = await db
      .insert(batchSend)
      .values({
        organizationId: testOrganization.id,
        channel: "email",
        status: "draft",
        name: "Action Test Beta",
        subject: "beta subject",
        createdBy: testUser.id,
      })
      .returning();
    if (!(batchA && batchB)) {
      throw new Error("failed to seed batches for listBatchSends test");
    }
    return { batchA, batchB };
  }

  it("listBatchSends forwards search to the repository and total reflects the filter", async () => {
    await seedListBatches();

    const result = await listBatchSends(testOrganization.id, {
      search: "Alpha",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.total).toBe(1);
    expect(result.batches.map((b) => b.name)).toEqual(["Action Test Alpha"]);
  });

  it("listBatchSends forwards status to the repository", async () => {
    await seedListBatches();

    const result = await listBatchSends(testOrganization.id, {
      status: "draft",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.total).toBe(1);
    expect(result.batches.map((b) => b.name)).toEqual(["Action Test Beta"]);
  });

  it("exportAllBroadcasts sets truncated: true when total exceeds the returned row count", async () => {
    await seedListBatches();

    // Override for this one call so we can observe the truncation math
    // (`total > batches.length`) without seeding more than MAX_EXPORT_ROWS
    // (50,000) real rows.
    mockListBroadcasts.mockImplementationOnce(async () => ({
      batches: [
        {
          id: "truncation-test-batch-1",
          name: "Fake truncated batch",
          channel: "email",
          status: "completed",
          createdAt: new Date(),
        },
      ],
      total: 5,
    }));

    const result = await exportAllBroadcasts(testOrganization.id, {});

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.total).toBe(5);
    expect(result.batches).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  it("exportAllBroadcasts sets truncated: false when every matching row is returned", async () => {
    await seedListBatches();

    const result = await exportAllBroadcasts(testOrganization.id, {});

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.total).toBe(2);
    expect(result.batches).toHaveLength(2);
    expect(result.truncated).toBe(false);
  });
});
