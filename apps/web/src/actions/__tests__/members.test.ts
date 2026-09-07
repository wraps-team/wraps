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

const mockSendInvitationEmail = vi.fn(() =>
  Promise.resolve({ success: true, messageId: "test-msg-id" })
);

vi.mock("@wraps/email/emails/invitation", () => ({
  sendInvitationEmail: (...args: Parameters<typeof mockSendInvitationEmail>) =>
    mockSendInvitationEmail(...args),
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
      // Guards: the target-member lookup and the role-update write are both
      // scoped by `and(eq(member.id, memberId), eq(member.organizationId,
      // organizationId))`, so a caller authorized for org A cannot reach or
      // mutate a member row that belongs to org B.
      const result = await updateMemberRole(memberB.id, "owner", orgA.id);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Member not found");
      }

      // Prove the write never happened: re-read memberB before the
      // afterAll restore hook below would mask the exploit succeeding.
      const stillMember = await db
        .select()
        .from(member)
        .where(eq(member.id, memberB.id));
      expect(stillMember).toHaveLength(1);
      expect(stillMember[0]?.role).toBe(memberB.role);
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
      // Guards: the target-member lookup and the delete are both scoped by
      // `and(eq(member.id, memberId), eq(member.organizationId,
      // organizationId))`, so a caller authorized for org A cannot reach or
      // remove a member row that belongs to org B.
      const result = await removeMember(sacrificialMember.id, orgA.id);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Member not found");
      }

      // Prove the row was never deleted, before the afterAll restore hook
      // below would mask the exploit succeeding.
      const stillThere = await db
        .select()
        .from(member)
        .where(eq(member.id, sacrificialMember.id));
      expect(stillThere).toHaveLength(1);
      expect(stillThere[0]?.organizationId).toBe(orgB.id);
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
      // Guard: the target-invitation lookup and the delete are both scoped
      // by `and(eq(invitation.id, invitationId), eq(invitation.organizationId,
      // organizationId))`, so a caller authorized for org A cannot reach or
      // delete an invitation that belongs to org B.
      const result = await cancelInvitation(invitationB.id, orgA.id);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Invitation not found");
      }

      // Prove the invitation was never deleted, before the afterAll restore
      // hook below would mask the exploit succeeding.
      const stillThere = await db
        .select()
        .from(invitation)
        .where(eq(invitation.id, invitationB.id));
      expect(stillThere).toHaveLength(1);
      expect(stillThere[0]?.status).toBe("pending");
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

// ─── Preset Roles: updateMemberRole ────────────────────────────────────────

describe("updateMemberRole — preset roles", () => {
  const userC = {
    id: "preset-test-user-c",
    email: "preset-user-c@example.com",
    name: "Preset User C",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    image: null,
    twoFactorEnabled: false,
    stripeCustomerId: null,
  };

  const memberC = {
    id: "preset-test-member-c",
    organizationId: orgA.id,
    userId: userC.id,
    role: "member" as const,
    createdAt: new Date(),
  };

  beforeAll(async () => {
    await db
      .insert(user)
      .values(userC)
      .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });
    await db
      .insert(member)
      .values(memberC)
      .onConflictDoUpdate({ target: member.id, set: { role: memberC.role } });
  });

  afterAll(async () => {
    await db.delete(member).where(eq(member.id, memberC.id));
    await db.delete(user).where(eq(user.id, userC.id));
  });

  it("rejects an unrecognized role string", async () => {
    const result = await updateMemberRole(
      memberC.id,
      "completelyfake",
      orgA.id
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/invalid role/i);
    }
  });

  it("stores 'marketing' as a valid preset role", async () => {
    const result = await updateMemberRole(memberC.id, "marketing", orgA.id);
    expect(result.success).toBe(true);
    const updated = await db.query.member.findFirst({
      where: (m, { eq: eqOp }) => eqOp(m.id, memberC.id),
    });
    expect(updated?.role).toBe("marketing");
  });

  it("stores 'read-only' as a valid preset role", async () => {
    const result = await updateMemberRole(memberC.id, "read-only", orgA.id);
    expect(result.success).toBe(true);
    const updated = await db.query.member.findFirst({
      where: (m, { eq: eqOp }) => eqOp(m.id, memberC.id),
    });
    expect(updated?.role).toBe("read-only");
  });
});

// ─── Preset Roles: inviteMember ─────────────────────────────────────────────

describe("inviteMember — preset roles", () => {
  it("rejects 'owner' as an invitable role", async () => {
    const result = await inviteMember(
      "owner-invite@example.com",
      "owner",
      orgA.id
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(
        /owner role cannot be assigned via invitation/i
      );
    }
  });

  it("accepts 'marketing' as a valid invite role", async () => {
    mockSendInvitationEmail.mockClear();
    const result = await inviteMember(
      "marketing-invite@example.com",
      "marketing",
      orgA.id
    );
    expect(result.success).toBe(true);
    if (result.success) {
      const inv = await db.query.invitation.findFirst({
        where: (i, { eq: eqOp }) => eqOp(i.id, result.invitationId),
      });
      expect(inv?.role).toBe("marketing");
      expect(inv?.email).toBe("marketing-invite@example.com");
    }
  });

  afterAll(async () => {
    await db
      .delete(invitation)
      .where(eq(invitation.email, "marketing-invite@example.com"));
  });
});

// ─── verifyOrgAccess null path ──────────────────────────────────────────────
// These tests ensure every function returns { success: false, error: "No access" }
// when the caller has no membership in the target org (verifyOrgAccess returns null).

describe("inviteMember — non-member org returns No access", () => {
  it("returns { success: false, error: 'No access' } for an org the user is not a member of", async () => {
    // userA is authenticated (mock returns userA's session) but has no membership
    // in "nonexistent-org-id" — verifyOrgAccess will return null.
    const result = await inviteMember(
      "valid@example.com",
      "member",
      "nonexistent-org-id"
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("You don't have access to this organization");
    }
  });
});

describe("updateMemberRole — non-member org returns No access", () => {
  it("returns { success: false, error: 'No access' } for an org the user is not a member of", async () => {
    // userA is authenticated but not a member of "nonexistent-org-id"
    const result = await updateMemberRole(
      memberB.id,
      "admin",
      "nonexistent-org-id"
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("You don't have access to this organization");
    }
  });
});

// ─── Enriched invite email ──────────────────────────────────────────────────

describe("inviteMember — enriched invite email", () => {
  it("calls sendInvitationEmail with workspace context instead of sendTemplate", async () => {
    mockSendInvitationEmail.mockClear();

    const result = await inviteMember(
      "enriched-invite@example.com",
      "member",
      orgA.id
    );

    // The invite should succeed (invitation is created)
    expect(result.success).toBe(true);

    // Should have called the new sendInvitationEmail, not the old sendTemplate
    expect(mockSendInvitationEmail).toHaveBeenCalledTimes(1);
    expect(mockSendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "enriched-invite@example.com",
        organizationName: orgA.name,
        inviterName: userA.name,
        role: "member",
        inviteLink: expect.stringContaining("/accept"),
        declineLink: expect.stringContaining("/decline"),
        workspaceContext: expect.objectContaining({
          templateCount: expect.any(Number),
          contactCount: expect.any(Number),
          hasAwsAccount: expect.any(Boolean),
          verifiedDomains: expect.any(Array),
          hasSentEmail: expect.any(Boolean),
        }),
      })
    );
  });

  afterAll(async () => {
    // Clean up invitation created by test
    await db
      .delete(invitation)
      .where(eq(invitation.email, "enriched-invite@example.com"));
  });
});
