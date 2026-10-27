"use server";

import { notifyUser } from "@wraps/auth/notify";
import { awsAccount, contact, db, messageSend, template } from "@wraps/db";
import { invitation, member, user } from "@wraps/db/schema/auth";
import { sendInvitationEmail } from "@wraps/email/emails/invitation";
import { resolveAppUrl } from "@wraps/email/lib/app-url";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { trackTeammateInvited } from "@/lib/activation-tracking";
import { createActionLogger } from "@/lib/logger";
import { VALID_ROLES } from "@/lib/preset-roles";
import { orgAction } from "./shared/org-action";

export type MemberWithUser = {
  id: string;
  role: string;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date;
  inviter: {
    id: string;
    name: string;
    email: string;
  };
};

export type ListMembersResult =
  | {
      success: true;
      members: MemberWithUser[];
      invitations: PendingInvitation[];
    }
  | {
      success: false;
      error: string;
    };

/**
 * List all members and pending invitations for an organization
 */
export const listMembers = orgAction(
  {
    name: "listMembers",
    resource: "members",
    permission: ["read"],
    orgId: (organizationId: string) => organizationId,
    onError: "Failed to fetch members",
  },
  async (_ctx, organizationId: string): Promise<ListMembersResult> => {
    // Fetch all members with user info using join instead of with
    const membersData = await db
      .select({
        id: member.id,
        role: member.role,
        createdAt: member.createdAt,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userImage: user.image,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, organizationId))
      .orderBy(member.createdAt);

    // Fetch pending invitations using join
    const invitationsData = await db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        inviterId: user.id,
        inviterName: user.name,
        inviterEmail: user.email,
      })
      .from(invitation)
      .innerJoin(user, eq(invitation.inviterId, user.id))
      .where(
        and(
          eq(invitation.organizationId, organizationId),
          eq(invitation.status, "pending")
        )
      )
      .orderBy(invitation.expiresAt);

    return {
      success: true,
      members: membersData.map((m) => ({
        id: m.id,
        role: m.role,
        createdAt: m.createdAt,
        user: {
          id: m.userId,
          name: m.userName,
          email: m.userEmail,
          image: m.userImage,
        },
      })),
      invitations: invitationsData.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt,
        inviter: {
          id: inv.inviterId,
          name: inv.inviterName,
          email: inv.inviterEmail,
        },
      })),
    };
  }
);

export type UpdateMemberRoleResult =
  | {
      success: true;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Update a member's role (only owners and admins can do this)
 */
export const updateMemberRole = orgAction(
  {
    name: "updateMemberRole",
    resource: "members",
    permission: ["changeRole"],
    orgId: (_memberId: string, _newRole: string, organizationId: string) =>
      organizationId,
    onError: "Failed to update member role",
  },
  async (
    ctx,
    memberId: string,
    newRole: string,
    organizationId: string
  ): Promise<UpdateMemberRoleResult> => {
    if (!VALID_ROLES.has(newRole)) {
      return { success: false, error: "Invalid role" };
    }

    // Get the target member (scoped to org to prevent cross-org IDOR)
    const targetMember = await db.query.member.findFirst({
      where: and(
        eq(member.id, memberId),
        eq(member.organizationId, organizationId)
      ),
    });

    if (!targetMember) {
      return {
        success: false,
        error: "Member not found",
      };
    }

    // Prevent non-owners from changing owner roles or making someone an owner
    if (
      ctx.access.role !== "owner" &&
      (targetMember.role === "owner" || newRole === "owner")
    ) {
      return {
        success: false,
        error: "Only owners can change owner roles",
      };
    }

    // Prevent users from changing their own role
    if (targetMember.userId === ctx.access.userId) {
      return {
        success: false,
        error: "You cannot change your own role",
      };
    }

    // Update the role (scoped to org to prevent cross-org IDOR)
    await ctx.audited(
      async (tx) => {
        await tx
          .update(member)
          .set({ role: newRole })
          .where(
            and(
              eq(member.id, memberId),
              eq(member.organizationId, organizationId)
            )
          );
      },
      () => ({
        action: "member.role_changed" as const,
        resource: "member",
        resourceId: targetMember.userId,
        metadata: { oldRole: targetMember.role, newRole },
      })
    );

    try {
      await notifyUser({
        userId: targetMember.userId,
        organizationId,
        type: "member.role_changed",
        title: `Your role is now ${newRole}`,
        body: `An administrator changed your role from ${targetMember.role} to ${newRole}.`,
        href: `/${ctx.access.orgSlug}/settings/members`,
        data: { oldRole: targetMember.role, newRole },
      });
    } catch (notifyError) {
      const log = createActionLogger("updateMemberRole", { organizationId });
      log.error(
        { err: notifyError },
        "Failed to write role-changed notification"
      );
    }

    revalidatePath(`/${ctx.access.orgSlug}/settings/members`);

    return {
      success: true,
    };
  }
);

export type InviteMemberResult =
  | {
      success: true;
      invitationId: string;
    }
  | {
      success: false;
      error: string;
    };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Invite a new member to the organization
 */
export const inviteMember = orgAction(
  {
    name: "inviteMember",
    resource: "members",
    permission: ["invite"],
    orgId: (_email: string, _role: string, organizationId: string) =>
      organizationId,
    onError: "Failed to send invitation",
  },
  async (
    ctx,
    email: string,
    role: string,
    organizationId: string
  ): Promise<InviteMemberResult> => {
    if (!VALID_ROLES.has(role)) {
      return { success: false, error: "Invalid role" };
    }
    if (role === "owner") {
      return {
        success: false,
        error: "Owner role cannot be assigned via invitation",
      };
    }

    if (!(email && EMAIL_REGEX.test(email.trim()))) {
      return { success: false, error: "Invalid email address" };
    }

    // Check if user is already a member
    const existingUser = await db.query.user.findFirst({
      where: eq(user.email, email),
    });

    if (existingUser) {
      const existingMember = await db.query.member.findFirst({
        where: and(
          eq(member.organizationId, organizationId),
          eq(member.userId, existingUser.id)
        ),
      });

      if (existingMember) {
        return {
          success: false,
          error: "This user is already a member of the organization",
        };
      }
    }

    // Check if there's already a pending invitation
    const existingInvitation = await db.query.invitation.findFirst({
      where: and(
        eq(invitation.organizationId, organizationId),
        eq(invitation.email, email),
        eq(invitation.status, "pending")
      ),
    });

    if (existingInvitation) {
      return {
        success: false,
        error: "An invitation has already been sent to this email",
      };
    }

    // Get organization details for email (needed after transaction)
    const org = await db.query.organization.findFirst({
      where: (orgs, { eq: eqOp }) => eqOp(orgs.id, organizationId),
    });

    if (!org) {
      return {
        success: false,
        error: "Organization not found",
      };
    }

    // Resolve the link target before writing anything: resolveAppUrl throws on
    // a misconfigured deployment, and failing after the insert would leave a
    // pending invitation whose email never went out.
    let appUrl: string;
    try {
      appUrl = resolveAppUrl();
    } catch (error) {
      // Letting this reach orgAction's catch flattens it to "Failed to send
      // invitation" — but the message names the environment variable a
      // self-hosted operator has to set, which is the whole point of throwing.
      ctx.log.error({ err: error }, "Dashboard URL is not configured");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to invite user",
      };
    }

    // Create the invitation + audit log atomically
    const newInvitation = await ctx.audited(
      async (tx) => {
        const [inserted] = await tx
          .insert(invitation)
          .values({
            id: crypto.randomUUID(),
            organizationId,
            email,
            role,
            status: "pending",
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            inviterId: ctx.access.userId,
          })
          .returning();
        if (!inserted) return null;
        return inserted;
      },
      (r) => ({
        action: "member.invited" as const,
        resource: "invitation",
        resourceId: r?.id ?? null,
        metadata: { inviteeEmail: email, role },
      })
    );

    if (!newInvitation) {
      return {
        success: false,
        error: "Failed to create invitation",
      };
    }

    // Gather workspace context for the enriched invite email
    try {
      const [templateResult, contactResult, sentResult, accounts] =
        await Promise.all([
          db
            .select({ count: count() })
            .from(template)
            .where(eq(template.organizationId, organizationId)),
          db
            .select({ count: count() })
            .from(contact)
            .where(eq(contact.organizationId, organizationId)),
          db
            .select({ count: count() })
            .from(messageSend)
            .where(
              and(
                eq(messageSend.organizationId, organizationId),
                eq(messageSend.status, "sent")
              )
            ),
          db.query.awsAccount.findMany({
            where: eq(awsAccount.organizationId, organizationId),
            columns: { isVerified: true, features: true },
          }),
        ]);

      const verifiedDomains: string[] = [];
      for (const a of accounts) {
        const features = a.features as {
          email?: { identities?: Array<{ type: string; identity: string }> };
        } | null;
        for (const id of features?.email?.identities ?? []) {
          if (id.type === "DOMAIN") {
            verifiedDomains.push(id.identity);
          }
        }
      }

      await sendInvitationEmail({
        to: email,
        inviteLink: `${appUrl}/invitations/${newInvitation.id}/accept`,
        declineLink: `${appUrl}/invitations/${newInvitation.id}/decline`,
        organizationName: org.name,
        inviterName: ctx.access.userName ?? ctx.access.userEmail,
        role,
        workspaceContext: {
          templateCount: templateResult[0]?.count ?? 0,
          contactCount: contactResult[0]?.count ?? 0,
          hasAwsAccount: accounts.length > 0,
          verifiedDomains,
          hasSentEmail: (sentResult[0]?.count ?? 0) > 0,
        },
      });
    } catch (emailError) {
      const log = createActionLogger("inviteMember", {
        orgSlug: organizationId,
      });
      log.error({ err: emailError, email }, "Failed to send invitation email");
      // Continue even if email fails - the invitation is still created
    }

    await trackTeammateInvited(ctx.access.userEmail, organizationId, {
      invitedEmail: email,
      role,
    });

    revalidatePath(`/${ctx.access.orgSlug}/settings/members`);

    return {
      success: true,
      invitationId: newInvitation.id,
    };
  }
);

export type RemoveMemberResult =
  | {
      success: true;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Remove a member from the organization
 */
export const removeMember = orgAction(
  {
    name: "removeMember",
    resource: "members",
    permission: ["remove"],
    orgId: (_memberId: string, organizationId: string) => organizationId,
    onError: "Failed to remove member",
  },
  async (
    ctx,
    memberId: string,
    organizationId: string
  ): Promise<RemoveMemberResult> => {
    // Get the target member (scoped to org to prevent cross-org IDOR)
    const targetMember = await db.query.member.findFirst({
      where: and(
        eq(member.id, memberId),
        eq(member.organizationId, organizationId)
      ),
    });

    if (!targetMember) {
      return {
        success: false,
        error: "Member not found",
      };
    }

    // Prevent non-owners from removing owners
    if (ctx.access.role !== "owner" && targetMember.role === "owner") {
      return {
        success: false,
        error: "Only owners can remove other owners",
      };
    }

    // Prevent users from removing themselves
    if (targetMember.userId === ctx.access.userId) {
      return {
        success: false,
        error: "You cannot remove yourself from the organization",
      };
    }

    // Remove the member (scoped to org to prevent cross-org IDOR)
    await ctx.audited(
      async (tx) => {
        await tx
          .delete(member)
          .where(
            and(
              eq(member.id, memberId),
              eq(member.organizationId, organizationId)
            )
          );
      },
      () => ({
        action: "member.removed" as const,
        resource: "member",
        resourceId: targetMember.userId,
        metadata: { role: targetMember.role },
      })
    );

    revalidatePath(`/${ctx.access.orgSlug}/settings/members`);

    return {
      success: true,
    };
  }
);

export type CancelInvitationResult =
  | {
      success: true;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Cancel a pending invitation
 */
export const cancelInvitation = orgAction(
  {
    name: "cancelInvitation",
    resource: "members",
    permission: ["invite"],
    orgId: (_invitationId: string, organizationId: string) => organizationId,
    onError: "Failed to cancel invitation",
  },
  async (
    ctx,
    invitationId: string,
    organizationId: string
  ): Promise<CancelInvitationResult> => {
    // Verify invitation belongs to this org before deleting (prevent cross-org IDOR)
    const targetInvitation = await db.query.invitation.findFirst({
      where: and(
        eq(invitation.id, invitationId),
        eq(invitation.organizationId, organizationId)
      ),
    });

    if (!targetInvitation) {
      return {
        success: false,
        error: "Invitation not found",
      };
    }

    // Delete the invitation + audit log atomically
    await ctx.audited(
      async (tx) => {
        await tx
          .delete(invitation)
          .where(
            and(
              eq(invitation.id, invitationId),
              eq(invitation.organizationId, organizationId)
            )
          );
      },
      () => ({
        action: "member.invite_cancelled" as const,
        resource: "invitation",
        resourceId: invitationId,
        metadata: { inviteeEmail: targetInvitation.email },
      })
    );

    revalidatePath(`/${ctx.access.orgSlug}/settings/members`);

    return {
      success: true,
    };
  }
);
