/**
 * Audit Log Instrumentation Tests — Chunk 4
 *
 * Verifies that createSegment, updateSegment, deleteSegment, createTopic,
 * updateTopic, and deleteTopic each write a correctly-shaped audit log row
 * after a successful mutation.
 */

import type { FilterCondition } from "@wraps/db";
import {
  auditLog,
  db,
  member,
  organization,
  segment,
  subscription,
  topic,
  user,
} from "@wraps/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSegment, deleteSegment, updateSegment } from "../segments";
import { createTopic, deleteTopic, updateTopic } from "../topics";

// A minimal valid FilterCondition (one group, one "exists" filter needs no value)
const validCondition: FilterCondition = {
  logic: "AND",
  groups: [
    {
      filters: [{ field: "status", operator: "exists" }],
    },
  ],
};

// --- Test fixtures ---

const testUser = {
  id: "audit-v2-segtopic-user",
  email: "audit-v2-segtopic@example.com",
  name: "Audit V2 SegTopic User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: "audit-v2-segtopic-org",
  name: "Audit V2 SegTopic Org",
  slug: "audit-v2-segtopic-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: "audit-v2-segtopic-member",
  organizationId: testOrg.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

// Growth plan is required for segments & topics features
const testSubscription = {
  id: "audit-v2-segtopic-sub",
  plan: "growth",
  referenceId: testOrg.id,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Pre-created segment for update/delete tests
const preSegment = {
  id: "audit-v2-segtopic-seg-pre",
  organizationId: testOrg.id,
  name: "Pre-created Segment",
  description: null,
  condition: validCondition,
  trackMembership: false,
  memberCount: 0,
  lastComputedAt: new Date(),
  createdBy: testUser.id,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Pre-created topic for update/delete tests
const preTopicId = "audit-v2-segtopic-topic-pre";

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
          id: "audit-v2-segtopic-session",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: testUser.id,
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "audit-v2-segtopic-token",
        },
      })),
    },
  },
}));

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

  await db.delete(subscription).where(eq(subscription.referenceId, testOrg.id));
  await db.insert(subscription).values(testSubscription);

  // Insert pre-created segment for update/delete tests
  await db
    .insert(segment)
    .values(preSegment)
    .onConflictDoUpdate({ target: segment.id, set: { name: preSegment.name } });

  // Insert pre-created topic for update/delete tests
  await db
    .insert(topic)
    .values({
      id: preTopicId,
      organizationId: testOrg.id,
      name: "Pre-created Topic",
      slug: "audit-v2-segtopic-topic-pre",
      description: null,
      public: true,
      doubleOptIn: false,
      createdBy: testUser.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: topic.id,
      set: { name: "Pre-created Topic" },
    });
});

afterAll(async () => {
  await db.delete(auditLog).where(eq(auditLog.organizationId, testOrg.id));
  await db.delete(segment).where(eq(segment.organizationId, testOrg.id));
  await db.delete(topic).where(eq(topic.organizationId, testOrg.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(subscription).where(eq(subscription.referenceId, testOrg.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

// --- Tests ---

describe("createSegment — writes segment.created audit log", () => {
  it("inserts a segment.created audit log row with correct fields", async () => {
    const result = await createSegment(testOrg.id, {
      name: "Audit Test Segment",
      condition: validCondition,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "segment.created")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("segment.created");
    expect(row.resource).toBe("segment");
    expect(row.metadata).toMatchObject({ name: "Audit Test Segment" });
    expect(row.resourceId).toBeTruthy();
  });
});

describe("updateSegment — writes segment.updated audit log", () => {
  it("inserts a segment.updated audit log row with correct fields", async () => {
    const result = await updateSegment(preSegment.id, testOrg.id, {
      name: "Updated Segment Name",
    });

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "segment.updated")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("segment.updated");
    expect(row.resource).toBe("segment");
    expect(row.resourceId).toBe(preSegment.id);
    expect(row.metadata).toMatchObject({
      segmentId: preSegment.id,
      name: "Updated Segment Name",
    });
  });
});

describe("deleteSegment — writes segment.deleted audit log", () => {
  it("inserts a segment.deleted audit log row with correct fields", async () => {
    // Create a segment to delete
    const segToDelete = {
      id: "audit-v2-segtopic-seg-del",
      organizationId: testOrg.id,
      name: "Segment To Delete",
      description: null,
      condition: validCondition,
      trackMembership: false,
      memberCount: 0,
      lastComputedAt: new Date(),
      createdBy: testUser.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db
      .insert(segment)
      .values(segToDelete)
      .onConflictDoUpdate({
        target: segment.id,
        set: { name: segToDelete.name },
      });

    const result = await deleteSegment(segToDelete.id, testOrg.id);

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "segment.deleted")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("segment.deleted");
    expect(row.resource).toBe("segment");
    expect(row.resourceId).toBe(segToDelete.id);
    expect(row.metadata).toMatchObject({ segmentId: segToDelete.id });
  });
});

describe("createTopic — writes topic.created audit log", () => {
  it("inserts a topic.created audit log row with correct fields", async () => {
    const result = await createTopic(testOrg.id, {
      name: "Audit Test Topic",
      slug: "audit-test-topic-v2",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "topic.created")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("topic.created");
    expect(row.resource).toBe("topic");
    expect(row.resourceId).toBeTruthy();
    expect(row.metadata).toMatchObject({ name: "Audit Test Topic" });
  });
});

describe("updateTopic — writes topic.updated audit log", () => {
  it("inserts a topic.updated audit log row with correct fields", async () => {
    const result = await updateTopic(preTopicId, testOrg.id, {
      name: "Updated Topic Name",
    });

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "topic.updated")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("topic.updated");
    expect(row.resource).toBe("topic");
    expect(row.resourceId).toBe(preTopicId);
    expect(row.metadata).toMatchObject({
      topicId: preTopicId,
      name: "Updated Topic Name",
    });
  });
});

describe("deleteTopic — writes topic.deleted audit log", () => {
  it("inserts a topic.deleted audit log row with correct fields", async () => {
    // Create a topic to delete
    const topicToDeleteId = "audit-v2-segtopic-topic-del";
    await db
      .insert(topic)
      .values({
        id: topicToDeleteId,
        organizationId: testOrg.id,
        name: "Topic To Delete",
        slug: "audit-v2-segtopic-topic-del",
        description: null,
        public: true,
        doubleOptIn: false,
        createdBy: testUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: topic.id,
        set: { name: "Topic To Delete" },
      });

    const result = await deleteTopic(topicToDeleteId, testOrg.id);

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, testOrg.id),
          eq(auditLog.action, "topic.deleted")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(testOrg.id);
    expect(row.userId).toBe(testUser.id);
    expect(row.actorEmail).toBe(testUser.email);
    expect(row.action).toBe("topic.deleted");
    expect(row.resource).toBe("topic");
    expect(row.resourceId).toBe(topicToDeleteId);
    expect(row.metadata).toMatchObject({ topicId: topicToDeleteId });
  });
});
