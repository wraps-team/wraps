/**
 * Invitation Security Tests
 *
 * Verifies that:
 * - declineInvitation requires authentication (no unauthenticated decline)
 * - declineInvitation rejects callers whose email doesn't match the invite
 * - getInvitation does not expose the inviter's email address (PII)
 */

import { db, invitation, member, organization, user } from "@wraps/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { declineInvitation, getInvitation } from "../invitations";

// --- Test fixtures ---

const inviterUser = {
  id: "inv-sec-inviter-1",
  email: "inviter@example.com",
  name: "Inviter User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const inviteeUser = {
  id: "inv-sec-invitee-1",
  email: "invitee@example.com",
  name: "Invitee User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const anotherUser = {
  id: "inv-sec-another-1",
  email: "another@example.com",
  name: "Another User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrg = {
  id: "inv-sec-org-1",
  name: "Invitation Security Org",
  slug: "inv-sec-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const inviterMember = {
  id: "inv-sec-member-1",
  organizationId: testOrg.id,
  userId: inviterUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const pendingInvitation = {
  id: "inv-sec-invite-1",
  organizationId: testOrg.id,
  email: inviteeUser.email,
  role: "member",
  status: "pending",
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  inviterId: inviterUser.id,
};

// --- Auth mock (default: authenticated as inviteeUser) ---

const mockGetSession = vi.fn();

vi.mock("@wraps/auth", () => ({
  auth: {
    api: { getSession: (...args: unknown[]) => mockGetSession(...args) },
  },
}));

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// --- DB setup & teardown ---

beforeAll(async () => {
  await db
    .insert(user)
    .values(inviterUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
  await db
    .insert(user)
    .values(inviteeUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
  await db
    .insert(user)
    .values(anotherUser)
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
    .values(inviterMember)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: inviterMember.role },
    });
});

afterAll(async () => {
  await db.delete(invitation).where(eq(invitation.id, pendingInvitation.id));
  await db.delete(member).where(eq(member.id, inviterMember.id));
  await db.delete(organization).where(eq(organization.id, testOrg.id));
  await db.delete(user).where(eq(user.id, inviterUser.id));
  await db.delete(user).where(eq(user.id, inviteeUser.id));
  await db.delete(user).where(eq(user.id, anotherUser.id));
});

// Re-insert a fresh pending invitation before each relevant test
async function seedPendingInvitation() {
  await db.delete(invitation).where(eq(invitation.id, pendingInvitation.id));
  await db.insert(invitation).values(pendingInvitation);
}

// --- Tests ---

describe("declineInvitation — authentication requirement", () => {
  it("rejects unauthenticated calls (no session)", async () => {
    await seedPendingInvitation();
    mockGetSession.mockResolvedValueOnce(null);

    const result = await declineInvitation(pendingInvitation.id);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/logged in/i);
    }

    // Verify the invitation is still pending in the DB
    const inv = await db.query.invitation.findFirst({
      where: eq(invitation.id, pendingInvitation.id),
    });
    expect(inv?.status).toBe("pending");
  });

  it("rejects calls where session email does not match invitation", async () => {
    await seedPendingInvitation();
    mockGetSession.mockResolvedValueOnce({
      user: {
        id: anotherUser.id,
        email: anotherUser.email,
        name: anotherUser.name,
      },
    });

    const result = await declineInvitation(pendingInvitation.id);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/invitee@example\.com/);
    }

    // Invitation must remain pending
    const inv = await db.query.invitation.findFirst({
      where: eq(invitation.id, pendingInvitation.id),
    });
    expect(inv?.status).toBe("pending");
  });

  it("allows the authenticated invitee to decline their own invitation", async () => {
    await seedPendingInvitation();
    mockGetSession.mockResolvedValueOnce({
      user: {
        id: inviteeUser.id,
        email: inviteeUser.email,
        name: inviteeUser.name,
      },
    });

    const result = await declineInvitation(pendingInvitation.id);

    expect(result.success).toBe(true);

    // Verify status is now declined
    const inv = await db.query.invitation.findFirst({
      where: eq(invitation.id, pendingInvitation.id),
    });
    expect(inv?.status).toBe("declined");
  });
});

describe("getInvitation — PII exposure", () => {
  beforeAll(async () => {
    await seedPendingInvitation();
  });

  it("returns invitation details without the inviter's email address", async () => {
    const result = await getInvitation(pendingInvitation.id);

    expect(result.success).toBe(true);
    if (result.success) {
      const inviter = result.invitation.inviter;

      // Name is present (needed for UI)
      expect(inviter.name).toBe(inviterUser.name);

      // Email must NOT be present on the inviter object
      expect("email" in inviter).toBe(false);
    }
  });

  it("returns organization name and invitee email (needed for UI)", async () => {
    const result = await getInvitation(pendingInvitation.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.invitation.organization.name).toBe(testOrg.name);
      expect(result.invitation.email).toBe(inviteeUser.email);
    }
  });
});
