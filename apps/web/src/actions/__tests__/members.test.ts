import { db, invitation, member, organization, user } from "@wraps/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cancelInvitation,
  inviteMember,
  removeMember,
  updateMemberRole,
} from "../members";

// --- Test fixtures ---

const userA = {
  id: "idor-test-user-a",
  email: "idor-user-a@example.com",
  name: "IDOR User A",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const userB = {
  id: "idor-test-user-b",
  email: "idor-user-b@example.com",
  name: "IDOR User B",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const orgA = {
  id: "idor-test-org-a",
  name: "IDOR Org A",
  slug: "idor-org-a",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const orgB = {
  id: "idor-test-org-b",
  name: "IDOR Org B",
  slug: "idor-org-b",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const memberA = {
  id: "idor-test-member-a",
  organizationId: orgA.id,
  userId: userA.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const memberB = {
  id: "idor-test-member-b",
  organizationId: orgB.id,
  userId: userB.id,
  role: "member" as const,
  createdAt: new Date(),
};

const invitationB = {
  id: "idor-test-invitation-b",
  organizationId: orgB.id,
  email: "idor-invited@example.com",
  role: "member" as const,
  status: "pending",
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  inviterId: userB.id,
};

// --- Mocks ---

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
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
          id: "idor-session-a",
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: userA.id,
          expiresAt: new Date(Date.now() + 86_400_000),
          token: "idor-test-token",
        },
      })),
    },
  },
}));

// --- DB setup & teardown ---

beforeAll(async () => {
  // Insert users
  await db
    .insert(user)
    .values(userA)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
  await db
    .insert(user)
    .values(userB)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

  // Insert organizations
  await db
    .insert(organization)
    .values(orgA)
    .onConflictDoUpdate({ target: organization.id, set: { name: orgA.name } });
  await db
    .insert(organization)
    .values(orgB)
    .onConflictDoUpdate({ target: organization.id, set: { name: orgB.name } });

  // Insert members
  await db
    .insert(member)
    .values(memberA)
    .onConflictDoUpdate({ target: member.id, set: { role: memberA.role } });
  await db
    .insert(member)
    .values(memberB)
    .onConflictDoUpdate({ target: member.id, set: { role: memberB.role } });

  // Insert invitation belonging to Org B
  await db
    .insert(invitation)
    .values(invitationB)
    .onConflictDoUpdate({
      target: invitation.id,
      set: { status: invitationB.status },
    });
});

afterAll(async () => {
  await db.delete(invitation).where(eq(invitation.id, invitationB.id));
  await db.delete(member).where(eq(member.id, memberA.id));
  await db.delete(member).where(eq(member.id, memberB.id));
  await db.delete(organization).where(eq(organization.id, orgA.id));
  await db.delete(organization).where(eq(organization.id, orgB.id));
  await db.delete(user).where(eq(user.id, userA.id));
  await db.delete(user).where(eq(user.id, userB.id));
});

// --- IDOR tests ---

describe("Members IDOR Vulnerabilities", () => {
  describe("updateMemberRole — cross-org privilege escalation", () => {
    it("should reject updating a member that belongs to a different organization", async () => {
      // Authenticated as User A (owner of Org A).
      // Attempt to change the role of Member B (who belongs to Org B)
      // by passing Org A's ID as the organizationId parameter.
      //
      // BUG: Line 207 looks up the target member by `member.id` alone,
      // without scoping to the provided organizationId. This means the
      // lookup succeeds for ANY member across ALL orgs, and the update
      // on line 238 proceeds without verifying org ownership.
      const result = await updateMemberRole(memberB.id, "owner", orgA.id);

      // The action should fail because memberB does not belong to orgA.
      // If this assertion fails, the IDOR vulnerability is confirmed.
      expect(result.success).toBe(false);
    });

    afterAll(async () => {
      // Restore memberB's role in case the exploit succeeded
      await db
        .update(member)
        .set({ role: memberB.role })
        .where(eq(member.id, memberB.id));
    });
  });

  describe("removeMember — cross-org member deletion", () => {
    // We need a sacrificial member in Org B for this test so we don't
    // destroy the fixture used by other tests.
    const sacrificialMember = {
      id: "idor-test-member-b-sacrificial",
      organizationId: orgB.id,
      userId: userB.id,
      role: "member" as const,
      createdAt: new Date(),
    };

    beforeAll(async () => {
      // Create a second user for Org B to act as the removal target
      // (We reuse userB but with a different member record)
      await db
        .insert(member)
        .values(sacrificialMember)
        .onConflictDoUpdate({
          target: member.id,
          set: { role: sacrificialMember.role },
        });
    });

    it("should reject removing a member that belongs to a different organization", async () => {
      // Authenticated as User A (owner of Org A).
      // Attempt to remove the sacrificial member of Org B
      // by passing Org A's ID as the organizationId parameter.
      //
      // BUG: Line 496 looks up the target member by `member.id` alone,
      // without scoping to the provided organizationId. The delete on
      // line 524 also uses only `member.id`, so the member is removed
      // from Org B even though the caller only has access to Org A.
      const result = await removeMember(sacrificialMember.id, orgA.id);

      // The action should fail because the sacrificial member does not belong to orgA.
      // If this assertion fails, the IDOR vulnerability is confirmed.
      expect(result.success).toBe(false);
    });

    afterAll(async () => {
      // Restore the sacrificial member in case it was deleted by the exploit
      await db
        .insert(member)
        .values(sacrificialMember)
        .onConflictDoUpdate({
          target: member.id,
          set: { role: sacrificialMember.role },
        });
    });
  });

  describe("cancelInvitation — cross-org invitation deletion", () => {
    it("should reject cancelling an invitation that belongs to a different organization", async () => {
      // Authenticated as User A (owner of Org A).
      // Attempt to cancel Org B's invitation by passing Org A's ID
      // as the organizationId parameter.
      //
      // BUG: Line 603 deletes by `invitation.id` alone without
      // verifying the invitation's organizationId matches the
      // provided organizationId. An admin of any org can delete
      // invitations belonging to any other org.
      const result = await cancelInvitation(invitationB.id, orgA.id);

      // The action should fail because the invitation does not belong to orgA.
      // If this assertion fails, the IDOR vulnerability is confirmed.
      expect(result.success).toBe(false);
    });

    afterAll(async () => {
      // Restore the invitation in case the exploit deleted it
      await db
        .insert(invitation)
        .values(invitationB)
        .onConflictDoUpdate({
          target: invitation.id,
          set: { status: invitationB.status },
        });
    });
  });
});

// ─── Security: email validation in inviteMember ────────────────────────────

describe("inviteMember — email validation", () => {
  const INVALID_EMAILS = [
    { label: "empty string", value: "" },
    { label: "no @ sign", value: "notanemail" },
    { label: "no domain (foo@)", value: "foo@" },
    { label: "no TLD (foo@bar)", value: "foo@bar" },
    { label: "only @ sign", value: "@" },
    { label: "whitespace only", value: "   " },
  ];

  for (const { label, value } of INVALID_EMAILS) {
    it(`rejects invalid email: ${label}`, async () => {
      const result = await inviteMember(value, "member", orgA.id);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/invalid email/i);
      }
    });
  }

  it("accepts a valid email address format", async () => {
    // The invite will fail because orgA has no subscription, but the
    // important thing is it does NOT fail on email validation.
    const result = await inviteMember(
      "valid-invite@example.com",
      "member",
      orgA.id
    );

    // Should not return an email validation error
    if (!result.success) {
      expect((result as { success: false; error: string }).error).not.toMatch(
        /invalid email/i
      );
    }
  });
});
