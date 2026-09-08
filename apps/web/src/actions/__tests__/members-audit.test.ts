/**
 * Audit Log Instrumentation Tests — Chunk 3
 *
 * Verifies that inviteMember, removeMember, updateMemberRole, and
 * acceptInvitation each write a correctly-shaped audit log row after
 * a successful mutation.
 */

import {
  auditLog,
  db,
  invitation,
  member,
  organization,
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
import { acceptInvitation } from "../invitations";
import { inviteMember, removeMember, updateMemberRole } from "../members";

// --- Test fixtures ---

const userA = {
  id: "audit-chunk3-user-a",
  email: "audit-chunk3-user-a@example.com",
  name: "Audit Chunk3 User A",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const userInvitee = {
  id: "audit-chunk3-user-invitee",
  email: "audit-chunk3-invitee@example.com",
  name: "Audit Chunk3 Invitee",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const orgA = {
  id: "audit-chunk3-org-a",
  name: "Audit Chunk3 Org A",
  slug: "audit-chunk3-org-a",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const memberA = {
  id: "audit-chunk3-member-a",
  organizationId: orgA.id,
  userId: userA.id,
  role: "owner" as const,
  createdAt: new Date(),
};

// --- Mocks ---

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@wraps/email/emails/invitation", () => ({
  sendInvitationEmail: vi.fn(() =>
    Promise.resolve({ success: true, messageId: "test-msg-id" })
  ),
}));

vi.mock("@wraps/email/lib/client", () => ({
  getWrapsClient: vi.fn(async () => ({
    sendTemplate: vi.fn(),
  })),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: userA.id, email: userA.email, name: userA.name },
        session: {
          id: "audit-chunk3-session-a",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: userA.id,
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "audit-chunk3-token",
        },
      })),
    },
  },
}));

// --- DB setup & teardown ---

beforeAll(async () => {
  await db
    .insert(user)
    .values(userA)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
  await db
    .insert(user)
    .values(userInvitee)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

  await db
    .insert(organization)
    .values(orgA)
    .onConflictDoUpdate({ target: organization.id, set: { name: orgA.name } });

  await db
    .insert(member)
    .values(memberA)
    .onConflictDoUpdate({ target: member.id, set: { role: memberA.role } });
});

afterAll(async () => {
  await db.delete(auditLog).where(eq(auditLog.organizationId, orgA.id));
  await db.delete(member).where(eq(member.organizationId, orgA.id));
  await db.delete(invitation).where(eq(invitation.organizationId, orgA.id));
  await db.delete(organization).where(eq(organization.id, orgA.id));
  await db.delete(user).where(eq(user.id, userA.id));
  await db.delete(user).where(eq(user.id, userInvitee.id));
});

// --- Tests ---

describe("inviteMember — writes member.invited audit log", () => {
  afterEach(async () => {
    // Clean up invitations created during this test
    await db
      .delete(invitation)
      .where(eq(invitation.email, "audit-invited@example.com"));
  });

  it("inserts a member.invited audit log row with correct fields", async () => {
    const result = await inviteMember(
      "audit-invited@example.com",
      "member",
      orgA.id
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, orgA.id),
          eq(auditLog.action, "member.invited")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(orgA.id);
    expect(row.userId).toBe(userA.id);
    expect(row.actorEmail).toBe(userA.email);
    expect(row.action).toBe("member.invited");
    expect(row.resource).toBe("invitation");
    expect(row.resourceId).toBe(result.invitationId);
    expect(row.metadata).toMatchObject({
      inviteeEmail: "audit-invited@example.com",
      role: "member",
    });
  });
});

describe("removeMember — writes member.removed audit log", () => {
  const targetMember = {
    id: "audit-chunk3-member-target",
    organizationId: orgA.id,
    userId: userInvitee.id,
    role: "member" as const,
    createdAt: new Date(),
  };

  beforeAll(async () => {
    await db
      .insert(member)
      .values(targetMember)
      .onConflictDoUpdate({
        target: member.id,
        set: { role: targetMember.role },
      });
  });

  it("inserts a member.removed audit log row with correct fields", async () => {
    const result = await removeMember(targetMember.id, orgA.id);

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, orgA.id),
          eq(auditLog.action, "member.removed")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(orgA.id);
    expect(row.userId).toBe(userA.id);
    expect(row.actorEmail).toBe(userA.email);
    expect(row.action).toBe("member.removed");
    expect(row.resource).toBe("member");
    expect(row.resourceId).toBe(targetMember.userId);
    expect(row.metadata).toMatchObject({ role: "member" });
  });
});

describe("updateMemberRole — writes member.role_changed audit log", () => {
  const roleChangeMember = {
    id: "audit-chunk3-member-rolechange",
    organizationId: orgA.id,
    userId: userInvitee.id,
    role: "member" as const,
    createdAt: new Date(),
  };

  beforeAll(async () => {
    await db
      .insert(member)
      .values(roleChangeMember)
      .onConflictDoUpdate({
        target: member.id,
        set: { role: roleChangeMember.role },
      });
  });

  afterAll(async () => {
    await db.delete(member).where(eq(member.id, roleChangeMember.id));
  });

  it("inserts a member.role_changed audit log row with oldRole and newRole in metadata", async () => {
    const result = await updateMemberRole(
      roleChangeMember.id,
      "admin",
      orgA.id
    );

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, orgA.id),
          eq(auditLog.action, "member.role_changed")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(orgA.id);
    expect(row.userId).toBe(userA.id);
    expect(row.actorEmail).toBe(userA.email);
    expect(row.action).toBe("member.role_changed");
    expect(row.resource).toBe("member");
    expect(row.resourceId).toBe(roleChangeMember.userId);
    expect(row.metadata).toMatchObject({
      oldRole: "member",
      newRole: "admin",
    });
  });
});

describe("acceptInvitation — writes member.invite_accepted audit log", () => {
  const pendingInvite = {
    id: "audit-chunk3-invite-accept",
    organizationId: orgA.id,
    email: userInvitee.email,
    role: "member",
    status: "pending",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    inviterId: userA.id,
  };

  beforeAll(async () => {
    await db
      .insert(invitation)
      .values(pendingInvite)
      .onConflictDoUpdate({
        target: invitation.id,
        set: { status: pendingInvite.status },
      });
  });

  it("inserts a member.invite_accepted audit log row with correct fields", async () => {
    const { auth } = await import("@wraps/auth");
    vi.mocked(auth.api.getSession).mockResolvedValueOnce({
      user: {
        id: userInvitee.id,
        email: userInvitee.email,
        name: userInvitee.name,
      },
      session: {
        id: "audit-chunk3-session-invitee",
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: userInvitee.id,
        expiresAt: new Date(Date.now() + 86_400_000),
        token: "audit-chunk3-token-invitee",
      },
    } as any);

    const result = await acceptInvitation(pendingInvite.id);

    expect(result.success).toBe(true);

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, orgA.id),
          eq(auditLog.action, "member.invite_accepted")
        )
      )
      .orderBy(auditLog.createdAt);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1];
    expect(row.organizationId).toBe(orgA.id);
    expect(row.userId).toBe(userInvitee.id);
    expect(row.actorEmail).toBe(userInvitee.email);
    expect(row.action).toBe("member.invite_accepted");
    expect(row.resource).toBe("invitation");
    expect(row.resourceId).toBe(pendingInvite.id);
    expect(row.metadata).toMatchObject({ organizationId: orgA.id });
  });
});
