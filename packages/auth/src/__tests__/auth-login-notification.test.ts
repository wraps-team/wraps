/**
 * Login Notification Tests
 *
 * Verifies that createLoginNotification inserts a correctly-shaped
 * notification row (better-inbox). Tests the extracted function directly
 * since the session.create.after hook is too tightly coupled to better-auth
 * to unit test in isolation — same approach as auth-login-audit.test.ts.
 */

import { db, notification, user } from "@wraps/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLoginNotification } from "../index";

const testUser = {
  id: "login-notif-user-a",
  email: "login-notif-user-a@example.com",
  name: "Login Notif User A",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

describe("createLoginNotification", () => {
  beforeAll(async () => {
    await db.insert(user).values(testUser).onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(notification).where(eq(notification.userId, testUser.id));
    await db.delete(user).where(eq(user.id, testUser.id));
  });

  it("inserts an unread security notification with ip and agent context", async () => {
    await createLoginNotification(testUser.id, "203.0.113.7", "TestAgent/1.0");

    const rows = await db.query.notification.findMany({
      where: eq(notification.userId, testUser.id),
    });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toMatchObject({
      userId: testUser.id,
      organizationId: null,
      type: "security.new_device_login",
      title: "New sign-in to your account",
      href: "/settings/security",
      read: false,
    });
    expect(row?.body).toContain("203.0.113.7");
    expect(row?.data).toEqual({
      ipAddress: "203.0.113.7",
      userAgent: "TestAgent/1.0",
    });
  });

  it("handles missing ip/agent without failing the auth flow", async () => {
    await db.delete(notification).where(eq(notification.userId, testUser.id));

    await createLoginNotification(testUser.id);

    const rows = await db.query.notification.findMany({
      where: eq(notification.userId, testUser.id),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.body).toContain("an unknown IP");
    expect(rows[0]?.data).toEqual({ ipAddress: null, userAgent: null });
  });
});
