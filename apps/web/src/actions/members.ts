"use server";

import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { invitation, member, user } from "@wraps/db/schema/auth";
import { sendInvitationEmail } from "@wraps/email/emails/invitation";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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
export async function listMembers(
  organizationId: string
): Promise<ListMembersResult> {
  try {
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return {
        success: false,
        error: "You must be logged in",
      };
    }

    // Verify user is a member of this organization
    const userMembership = await db.query.member.findFirst({
      where: and(
        eq(member.organizationId, organizationId),
        eq(member.userId, session.user.id)
      ),
    });

    if (!userMembership) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

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
  } catch (error) {
    console.error("Error listing members:", error);
    return {
      success: false,
      error: "Failed to fetch members",
    };
  }
}

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
export async function updateMemberRole(
  memberId: string,
  newRole: "owner" | "admin" | "member",
  organizationId: string
): Promise<UpdateMemberRoleResult> {
  try {
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return {
        success: false,
        error: "You must be logged in",
      };
    }

    // Get the current user's membership
    const userMembership = await db.query.member.findFirst({
      where: and(
        eq(member.organizationId, organizationId),
        eq(member.userId, session.user.id)
      ),
    });

    if (!userMembership) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Check permissions - only owners and admins can change roles
    if (userMembership.role !== "owner" && userMembership.role !== "admin") {
      return {
        success: false,
        error: "You don't have permission to change member roles",
      };
    }

    // Get the target member
    const targetMember = await db.query.member.findFirst({
      where: eq(member.id, memberId),
    });

    if (!targetMember) {
      return {
        success: false,
        error: "Member not found",
      };
    }

    // Prevent non-owners from changing owner roles or making someone an owner
    if (
      userMembership.role !== "owner" &&
      (targetMember.role === "owner" || newRole === "owner")
    ) {
      return {
        success: false,
        error: "Only owners can change owner roles",
      };
    }

    // Prevent users from changing their own role
    if (targetMember.userId === session.user.id) {
      return {
        success: false,
        error: "You cannot change your own role",
      };
    }

    // Update the role
    await db
      .update(member)
      .set({ role: newRole })
      .where(eq(member.id, memberId));

    // Revalidate the members page
    const org = await db.query.organization.findFirst({
      where: (orgs, { eq }) => eq(orgs.id, organizationId),
    });

    if (org?.slug) {
      revalidatePath(`/${org.slug}/members`);
    }

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error updating member role:", error);
    return {
      success: false,
      error: "Failed to update member role",
    };
  }
}

export type InviteMemberResult =
  | {
      success: true;
      invitationId: string;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Invite a new member to the organization
 */
export async function inviteMember(
  email: string,
  role: "admin" | "member",
  organizationId: string
): Promise<InviteMemberResult> {
  try {
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return {
        success: false,
        error: "You must be logged in",
      };
    }

    // Get the current user's membership
    const userMembership = await db.query.member.findFirst({
      where: and(
        eq(member.organizationId, organizationId),
        eq(member.userId, session.user.id)
      ),
    });

    if (!userMembership) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Check permissions - only owners and admins can invite members
    if (userMembership.role !== "owner" && userMembership.role !== "admin") {
      return {
        success: false,
        error: "You don't have permission to invite members",
      };
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

    // Create the invitation
    const [newInvitation] = await db
      .insert(invitation)
      .values({
        id: crypto.randomUUID(),
        organizationId,
        email,
        role,
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        inviterId: session.user.id,
      })
      .returning();

    if (!newInvitation) {
      return {
        success: false,
        error: "Failed to create invitation",
      };
    }

    // Get organization details for email
    const org = await db.query.organization.findFirst({
      where: (orgs, { eq }) => eq(orgs.id, organizationId),
    });

    if (!org) {
      return {
        success: false,
        error: "Organization not found",
      };
    }

    // Send invitation email using @wraps.dev/email
    try {
      await sendInvitationEmail({
        to: email,
        inviterName: session.user.name,
        organizationName: org.name,
        role,
        invitationId: newInvitation.id,
      });
    } catch (emailError) {
      console.error("Error sending invitation email:", emailError);
      // Continue even if email fails - the invitation is still created
      // The user can manually share the link or we can retry later
    }

    // Revalidate the members page
    if (org.slug) {
      revalidatePath(`/${org.slug}/members`);
    }

    return {
      success: true,
      invitationId: newInvitation.id,
    };
  } catch (error) {
    console.error("Error inviting member:", error);
    return {
      success: false,
      error: "Failed to send invitation",
    };
  }
}

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
export async function removeMember(
  memberId: string,
  organizationId: string
): Promise<RemoveMemberResult> {
  try {
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return {
        success: false,
        error: "You must be logged in",
      };
    }

    // Get the current user's membership
    const userMembership = await db.query.member.findFirst({
      where: and(
        eq(member.organizationId, organizationId),
        eq(member.userId, session.user.id)
      ),
    });

    if (!userMembership) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Check permissions - only owners and admins can remove members
    if (userMembership.role !== "owner" && userMembership.role !== "admin") {
      return {
        success: false,
        error: "You don't have permission to remove members",
      };
    }

    // Get the target member
    const targetMember = await db.query.member.findFirst({
      where: eq(member.id, memberId),
    });

    if (!targetMember) {
      return {
        success: false,
        error: "Member not found",
      };
    }

    // Prevent non-owners from removing owners
    if (userMembership.role !== "owner" && targetMember.role === "owner") {
      return {
        success: false,
        error: "Only owners can remove other owners",
      };
    }

    // Prevent users from removing themselves
    if (targetMember.userId === session.user.id) {
      return {
        success: false,
        error: "You cannot remove yourself from the organization",
      };
    }

    // Remove the member
    await db.delete(member).where(eq(member.id, memberId));

    // Revalidate the members page
    const org = await db.query.organization.findFirst({
      where: (orgs, { eq }) => eq(orgs.id, organizationId),
    });

    if (org?.slug) {
      revalidatePath(`/${org.slug}/members`);
    }

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error removing member:", error);
    return {
      success: false,
      error: "Failed to remove member",
    };
  }
}

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
export async function cancelInvitation(
  invitationId: string,
  organizationId: string
): Promise<CancelInvitationResult> {
  try {
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return {
        success: false,
        error: "You must be logged in",
      };
    }

    // Get the current user's membership
    const userMembership = await db.query.member.findFirst({
      where: and(
        eq(member.organizationId, organizationId),
        eq(member.userId, session.user.id)
      ),
    });

    if (!userMembership) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Check permissions - only owners and admins can cancel invitations
    if (userMembership.role !== "owner" && userMembership.role !== "admin") {
      return {
        success: false,
        error: "You don't have permission to cancel invitations",
      };
    }

    // Delete the invitation
    await db.delete(invitation).where(eq(invitation.id, invitationId));

    // Revalidate the members page
    const org = await db.query.organization.findFirst({
      where: (orgs, { eq }) => eq(orgs.id, organizationId),
    });

    if (org?.slug) {
      revalidatePath(`/${org.slug}/members`);
    }

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error canceling invitation:", error);
    return {
      success: false,
      error: "Failed to cancel invitation",
    };
  }
}
