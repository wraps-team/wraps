import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import {
  deleteNotificationsForOrg,
  hasRecentNotification,
} from "../repositories/notifications";
import { member, notification, organization, user } from "../schema/auth";

const suffix = crypto.randomUUID().slice(0, 8);

const orgA = `repo-notif-org-a-${suffix}`;
const orgB = `repo-notif-org-b-${suffix}`;
const ownerId = `repo-notif-owner-${suffix}`;
const adminId = `repo-notif-admin-${suffix}`;
const memberId = `repo-notif-member-${suffix}`;
const multiRoleId = `repo-notif-multi-${suffix}`;
const outsiderId = `repo-notif-outsider-${suffix}`;
const allUserIds = [ownerId, adminId, memberId, multiRoleId, outsiderId];

describe("Repository: notifications", () => {
  beforeAll(async () => {
    await db
      .insert(organization)
      .values([
        {
          id: orgA,
          name: "Notif Repo Test Org A",
          slug: `notif-repo-a-${suffix}`,
          createdAt: new Date(),
        },
        {
          id: orgB,
          name: "Notif Repo Test Org B",
          slug: `notif-repo-b-${suffix}`,
          createdAt: new Date(),
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(user)
      .values(
        allUserIds.map((id) => ({
          id,
          name: `Notif Test ${id}`,
          email: `${id}@test.wraps.dev`,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }))
      )
      .onConflictDoNothing();

    await db
      .insert(member)
      .values([
        {
          id: `m-${ownerId}`,
          organizationId: orgA,
          userId: ownerId,
          role: "owner",
          createdAt: new Date(),
        },
        {
          id: `m-${adminId}`,
          organizationId: orgA,
          userId: adminId,
          role: "admin",
          createdAt: new Date(),
        },
        {
          id: `m-${memberId}`,
          organizationId: orgA,
          userId: memberId,
          role: "member",
          createdAt: new Date(),
        },
        {
          id: `m-${multiRoleId}`,
          organizationId: orgA,
          userId: multiRoleId,
          role: "member,admin",
          createdAt: new Date(),
        },
        {
          id: `m-${outsiderId}`,
          organizationId: orgB,
          userId: outsiderId,
          role: "owner",
          createdAt: new Date(),
        },
      ])
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db
      .delete(notification)
      .where(inArray(notification.userId, allUserIds));
    await db.delete(member).where(inArray(member.userId, allUserIds));
    await db.delete(user).where(inArray(user.id, allUserIds));
    await db.delete(organization).where(eq(organization.id, orgA));
    await db.delete(organization).where(eq(organization.id, orgB));
  });

  it("hasRecentNotification sees a fresh notification and respects the window", async () => {
    // Fixture row: writers go through auth.api.notify (@wraps/auth/notify), so
    // this repository only reads and deletes.
    await db.insert(notification).values({
      userId: ownerId,
      organizationId: orgA,
      type: "test.dedupe",
      title: "Once",
      data: { awsAccountId: "acct-1" },
    });

    const recent = await hasRecentNotification({
      organizationId: orgA,
      type: "test.dedupe",
      since: new Date(Date.now() - 60_000),
    });
    expect(recent).toBe(true);

    const future = await hasRecentNotification({
      organizationId: orgA,
      type: "test.dedupe",
      since: new Date(Date.now() + 60_000),
    });
    expect(future).toBe(false);

    const otherType = await hasRecentNotification({
      organizationId: orgA,
      type: "test.dedupe.other",
      since: new Date(Date.now() - 60_000),
    });
    expect(otherType).toBe(false);
  });

  it("hasRecentNotification dataEquals distinguishes payload keys", async () => {
    const sameKey = await hasRecentNotification({
      organizationId: orgA,
      type: "test.dedupe",
      since: new Date(Date.now() - 60_000),
      dataEquals: { key: "awsAccountId", value: "acct-1" },
    });
    expect(sameKey).toBe(true);

    const otherKey = await hasRecentNotification({
      organizationId: orgA,
      type: "test.dedupe",
      since: new Date(Date.now() - 60_000),
      dataEquals: { key: "awsAccountId", value: "acct-2" },
    });
    expect(otherKey).toBe(false);
  });

  it("deleteNotificationsForOrg removes only the given types for the org", async () => {
    await db.insert(notification).values([
      {
        userId: ownerId,
        organizationId: orgA,
        type: "test.fanout",
        title: "A",
      },
      {
        userId: memberId,
        organizationId: orgA,
        type: "test.single",
        title: "B",
      },
    ]);

    await deleteNotificationsForOrg(orgA, ["test.fanout"]);

    const remaining = await db
      .select({ type: notification.type })
      .from(notification)
      .where(eq(notification.organizationId, orgA));
    const types = new Set(remaining.map((r) => r.type));
    expect(types.has("test.fanout")).toBe(false);
    expect(types.has("test.single")).toBe(true);
  });
});
