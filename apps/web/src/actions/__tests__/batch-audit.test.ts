/**
 * Audit Log Instrumentation Tests — Chunk 5: Broadcasts
 *
 * Verifies that batch send mutations each write a correctly-shaped audit log
 * row after a successful mutation.
 */

import {
  auditLog,
  awsAccount,
  batchSend,
  contact,
  db,
  member,
  organization,
  organizationExtension,
  subscription,
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
  cancelBatchSend,
  createBatchSend,
  deleteDraftBatchSend,
  duplicateBatchSend,
  promoteDraftToSend,
  saveDraftBatchSend,
  updateDraftBatchSend,
} from "../batch";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

// Use RFC-4122 compliant UUIDs so getBatchSend UUID validation passes
// Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (version=4, variant=8)
const USER_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01";
const ORG_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02";
const MEMBER_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03";
const AWS_ACCOUNT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04";
const TEMPLATE_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05";
const CONTACT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06";
const SUB_ID = "sub_audit_v2_batch_uuid";

const testUser = {
  id: USER_ID,
  email: "audit-v2-batch-owner@example.com",
  name: "Audit V2 Batch Owner",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrganization = {
  id: ORG_ID,
  name: "Audit V2 Batch Org",
  slug: "audit-v2-batch-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testOwnerMember = {
  id: MEMBER_ID,
  organizationId: ORG_ID,
  userId: USER_ID,
  role: "owner" as const,
  createdAt: new Date(),
};

const testAwsAccount = {
  id: AWS_ACCOUNT_ID,
  organizationId: ORG_ID,
  accountId: "111122223333",
  region: "us-east-1",
  roleArn: "arn:aws:iam::111122223333:role/audit-v2-batch-role",
  externalId: "audit-v2-batch-ext-id-unique",
  name: "Audit V2 Batch AWS Account",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: USER_ID,
};

const testTemplate = {
  id: TEMPLATE_ID,
  organizationId: ORG_ID,
  name: "Audit V2 Batch Template",
  subject: "Subject from template",
  content: {},
  status: "PUBLISHED" as const,
  type: "EMAIL" as const,
  sesTemplateName: "wraps-org-audit-v2-batch-template-1",
  publishedAt: new Date("2026-01-01"),
  createdAt: new Date(),
  updatedAt: new Date("2025-12-01"),
  createdBy: USER_ID,
};

const testContact = {
  id: CONTACT_ID,
  organizationId: ORG_ID,
  email: "active-audit-v2@example.com",
  emailHash: "audit-v2-batch-contact-hash-1",
  emailStatus: "active" as const,
  status: "active",
  properties: {},
  emailsSent: 0,
  emailsOpened: 0,
  emailsClicked: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

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
        user: { id: testUser.id, email: testUser.email, name: testUser.name },
        session: {
          id: "audit-v2-batch-session-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: testUser.id,
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "audit-v2-batch-token",
        },
      })),
    },
  },
}));

vi.mock("@/lib/plan-limits", () => ({
  checkFeatureAccess: vi.fn(async () => ({ allowed: true })),
}));

vi.mock("@/actions/templates", () => ({
  publishTemplateToSES: vi.fn(async () => ({
    success: true,
    sesTemplateName: "wraps-org-audit-v2-batch-template-1",
  })),
}));

vi.mock("@/lib/activation-tracking", () => ({
  trackBroadcastCreated: vi.fn(async () => {}),
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

// ─────────────────────────────────────────────────────────────────────────────
// DB setup & teardown
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

  await db
    .insert(organization)
    .values(testOrganization)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrganization.name },
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
      id: `sub_audit_v2_batch_${testOrganization.id}`,
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

afterEach(async () => {
  await db
    .delete(auditLog)
    .where(eq(auditLog.organizationId, testOrganization.id));
  await db
    .delete(batchSend)
    .where(eq(batchSend.organizationId, testOrganization.id));
  vi.clearAllMocks();
});

afterAll(async () => {
  await db
    .delete(auditLog)
    .where(eq(auditLog.organizationId, testOrganization.id));
  await db
    .delete(batchSend)
    .where(eq(batchSend.organizationId, testOrganization.id));
  await db.delete(contact).where(eq(contact.id, testContact.id));
  await db.delete(template).where(eq(template.id, testTemplate.id));
  await db.delete(awsAccount).where(eq(awsAccount.id, testAwsAccount.id));
  await db.delete(member).where(eq(member.id, testOwnerMember.id));
  await db
    .delete(subscription)
    .where(eq(subscription.id, `sub_audit_v2_batch_${testOrganization.id}`));
  await db
    .delete(organizationExtension)
    .where(eq(organizationExtension.organizationId, testOrganization.id));
  await db.delete(organization).where(eq(organization.id, testOrganization.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("saveDraftBatchSend — writes broadcast.draft_saved audit log", () => {
  it("inserts a broadcast.draft_saved audit log row with correct fields", async () => {
    const result = await saveDraftBatchSend(testOrganization.id, {
      channel: "email",
      subject: "Audit draft test",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrganization.id),
          eq(auditLog.action, "broadcast.draft_saved")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrganization.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("broadcast.draft_saved");
    expect(row.resource).toBe("broadcast");
    expect(row.resourceId).toBe(result.batch.id);
    expect(row.metadata).toMatchObject({
      broadcastId: result.batch.id,
      channel: "email",
    });
  });
});

describe("updateDraftBatchSend — writes broadcast.draft_updated audit log", () => {
  it("inserts a broadcast.draft_updated audit log row with correct fields", async () => {
    const draft = await saveDraftBatchSend(testOrganization.id, {
      subject: "Original subject",
    });
    expect(draft.success).toBe(true);
    if (!draft.success) return;

    // Clear audit log written by saveDraft
    await db
      .delete(auditLog)
      .where(eq(auditLog.organizationId, testOrganization.id));

    const result = await updateDraftBatchSend(
      draft.batch.id,
      testOrganization.id,
      { subject: "Updated subject" }
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrganization.id),
          eq(auditLog.action, "broadcast.draft_updated")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrganization.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("broadcast.draft_updated");
    expect(row.resource).toBe("broadcast");
    expect(row.resourceId).toBe(draft.batch.id);
    expect(row.metadata).toMatchObject({ broadcastId: draft.batch.id });
  });
});

describe("deleteDraftBatchSend — writes broadcast.draft_deleted audit log", () => {
  it("inserts a broadcast.draft_deleted audit log row with correct fields", async () => {
    const draft = await saveDraftBatchSend(testOrganization.id, {
      subject: "Delete me",
    });
    expect(draft.success).toBe(true);
    if (!draft.success) return;

    await db
      .delete(auditLog)
      .where(eq(auditLog.organizationId, testOrganization.id));

    const result = await deleteDraftBatchSend(
      draft.batch.id,
      testOrganization.id
    );

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrganization.id),
          eq(auditLog.action, "broadcast.draft_deleted")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrganization.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("broadcast.draft_deleted");
    expect(row.resource).toBe("broadcast");
    expect(row.resourceId).toBe(draft.batch.id);
    expect(row.metadata).toMatchObject({ broadcastId: draft.batch.id });
  });
});

describe("duplicateBatchSend — writes broadcast.duplicated audit log", () => {
  it("inserts a broadcast.duplicated audit log row with correct fields", async () => {
    const [source] = await db
      .insert(batchSend)
      .values({
        organizationId: testOrganization.id,
        status: "completed",
        channel: "email",
        name: "Audit Source Broadcast",
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

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrganization.id),
          eq(auditLog.action, "broadcast.duplicated")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrganization.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("broadcast.duplicated");
    expect(row.resource).toBe("broadcast");
    expect(row.resourceId).toBe(result.batch.id);
    expect(row.metadata).toMatchObject({
      broadcastId: result.batch.id,
      sourceId: source.id,
    });
  });
});

describe("promoteDraftToSend — writes broadcast.sent_from_draft audit log", () => {
  it("inserts a broadcast.sent_from_draft audit log row (best-effort) after SQS enqueue", async () => {
    const origApiUrl = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";

    await db
      .update(template)
      .set({ sesTemplateName: null, publishedAt: null })
      .where(eq(template.id, testTemplate.id));

    let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

    try {
      const draft = await saveDraftBatchSend(testOrganization.id, {
        awsAccountId: testAwsAccount.id,
        templateId: testTemplate.id,
        from: "promote-audit@example.com",
        subject: "Promote audit test",
      });
      expect(draft.success).toBe(true);
      if (!draft.success) return;

      await db
        .delete(auditLog)
        .where(eq(auditLog.organizationId, testOrganization.id));

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

      const result = await promoteDraftToSend(
        draft.batch.id,
        testOrganization.id,
        {}
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      const rows = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.organizationId, testOrganization.id),
            eq(auditLog.action, "broadcast.sent_from_draft")
          )
        )
        .orderBy(auditLog.createdAt);

      expect(rows.length).toBeGreaterThan(0);
      const row = rows[rows.length - 1];
      expect(row.organizationId).toBe(testOrganization.id);
      expect(row.userId).toBe(testUser.id);
      expect(row.actorEmail).toBe(testUser.email);
      expect(row.action).toBe("broadcast.sent_from_draft");
      expect(row.resource).toBe("broadcast");
      expect(row.resourceId).toBe(draft.batch.id);
      expect(row.metadata).toMatchObject({
        broadcastId: draft.batch.id,
        channel: "email",
      });
    } finally {
      fetchSpy?.mockRestore();
      if (origApiUrl === undefined) {
        process.env.NEXT_PUBLIC_API_URL = undefined;
      } else {
        process.env.NEXT_PUBLIC_API_URL = origApiUrl;
      }
      await db
        .update(template)
        .set({
          sesTemplateName: testTemplate.sesTemplateName,
          publishedAt: testTemplate.publishedAt,
        })
        .where(eq(template.id, testTemplate.id));
    }
  });
});

describe("createBatchSend — writes broadcast.sent audit log (best-effort)", () => {
  it("inserts a broadcast.sent audit log row after API enqueue succeeds", async () => {
    const origApiUrl = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";

    let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;
    const fakeId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"; // valid RFC-4122 UUID

    try {
      const realFetch = globalThis.fetch.bind(globalThis);
      fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (...args: Parameters<typeof fetch>) => {
          const [url] = args;
          const asString = typeof url === "string" ? url : url.toString();
          // POST /v1/batch (create) — return a fake id
          if (asString.endsWith("/v1/batch") && !asString.includes("/send")) {
            // Insert a real row so getBatchSend can find it afterwards
            await db
              .insert(batchSend)
              .values({
                id: fakeId,
                organizationId: testOrganization.id,
                status: "queued",
                channel: "email",
                subject: "Audit sent test",
                awsAccountId: testAwsAccount.id,
                totalRecipients: 1,
                createdBy: testUser.id,
              })
              .onConflictDoNothing();
            return new Response(JSON.stringify({ id: fakeId }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return realFetch(...args);
        });

      const result = await createBatchSend(testOrganization.id, {
        awsAccountId: testAwsAccount.id,
        channel: "email",
        subject: "Audit sent test",
        from: "sender@example.com",
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const rows = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.organizationId, testOrganization.id),
            eq(auditLog.action, "broadcast.sent")
          )
        )
        .orderBy(auditLog.createdAt);

      expect(rows.length).toBeGreaterThan(0);
      const row = rows[rows.length - 1];
      expect(row.organizationId).toBe(testOrganization.id);
      expect(row.userId).toBe(testUser.id);
      expect(row.actorEmail).toBe(testUser.email);
      expect(row.action).toBe("broadcast.sent");
      expect(row.resource).toBe("broadcast");
      expect(row.resourceId).toBe(fakeId);
      expect(row.metadata).toMatchObject({
        broadcastId: fakeId,
        channel: "email",
      });
    } finally {
      fetchSpy?.mockRestore();
      if (origApiUrl === undefined) {
        process.env.NEXT_PUBLIC_API_URL = undefined;
      } else {
        process.env.NEXT_PUBLIC_API_URL = origApiUrl;
      }
    }
  });
});

describe("cancelBatchSend — writes broadcast.cancelled audit log", () => {
  it("inserts a broadcast.cancelled audit log row after successful cancel", async () => {
    const origApiUrl = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001";

    let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

    // Insert a queued batch to cancel
    const [queuedBatch] = await db
      .insert(batchSend)
      .values({
        organizationId: testOrganization.id,
        status: "queued",
        channel: "email",
        subject: "Cancel me",
        awsAccountId: testAwsAccount.id,
        createdBy: testUser.id,
      })
      .returning();
    expect(queuedBatch).toBeDefined();
    if (!queuedBatch) return;

    try {
      const realFetch = globalThis.fetch.bind(globalThis);
      fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (...args: Parameters<typeof fetch>) => {
          const [url, init] = args;
          const asString = typeof url === "string" ? url : url.toString();
          if (
            asString.includes("/v1/batch/") &&
            (init as RequestInit)?.method === "DELETE"
          ) {
            return new Response(null, { status: 200 });
          }
          return realFetch(...args);
        });

      const result = await cancelBatchSend(queuedBatch.id, testOrganization.id);

      expect(result.success).toBe(true);

      const rows = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.organizationId, testOrganization.id),
            eq(auditLog.action, "broadcast.cancelled")
          )
        )
        .orderBy(auditLog.createdAt);

      expect(rows.length).toBeGreaterThan(0);
      const row = rows[rows.length - 1];
      expect(row.organizationId).toBe(testOrganization.id);
      expect(row.userId).toBe(testUser.id);
      expect(row.actorEmail).toBe(testUser.email);
      expect(row.action).toBe("broadcast.cancelled");
      expect(row.resource).toBe("broadcast");
      expect(row.resourceId).toBe(queuedBatch.id);
      expect(row.metadata).toMatchObject({ broadcastId: queuedBatch.id });
    } finally {
      fetchSpy?.mockRestore();
      if (origApiUrl === undefined) {
        process.env.NEXT_PUBLIC_API_URL = undefined;
      } else {
        process.env.NEXT_PUBLIC_API_URL = origApiUrl;
      }
    }
  });
});
