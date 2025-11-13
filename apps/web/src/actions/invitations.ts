"use server";

import { auth } from "@wraps/auth";
import { db, invitation, member, organization, user } from "@wraps/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type InvitationDetails = {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date;
  organization: {
    id: string;
    name: string;
    slug: string | null;
  };
  inviter: {
    name: string;
    email: string;
  };
};

export type GetInvitationResult =
  | {
      success: true;
      invitation: InvitationDetails;
      isExpired: boolean;
      isAlreadyMember: boolean;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Get invitation details by ID
 */
export async function getInvitation(
  invitationId: string
): Promise<GetInvitationResult> {
  try {
    // Fetch invitation with organization and inviter details
    const inv = await db.query.invitation.findFirst({
      where: eq(invitation.id, invitationId),
    });

    if (!inv) {
      return {
        success: false,
        error: "Invitation not found",
      };
    }

    // Fetch organization
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, inv.organizationId),
    });

    if (!org) {
      return {
        success: false,
        error: "Organization not found",
      };
    }

    // Fetch inviter
    const inviterUser = await db.query.user.findFirst({
      where: eq(user.id, inv.inviterId),
    });

    if (!inviterUser) {
      return {
        success: false,
        error: "Inviter not found",
      };
    }

    // Check if invitation has expired
    const isExpired = new Date(inv.expiresAt) < new Date();

    // Check if user is already a member
    const existingUser = await db.query.user.findFirst({
      where: eq(user.email, inv.email),
    });

    let isAlreadyMember = false;
    if (existingUser) {
      const existingMember = await db.query.member.findFirst({
        where: and(
          eq(member.organizationId, inv.organizationId),
          eq(member.userId, existingUser.id)
        ),
      });
      isAlreadyMember = !!existingMember;
    }

    return {
      success: true,
      invitation: {
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt,
        organization: {
          id: org.id,
          name: org.name,
          slug: org.slug,
        },
        inviter: {
          name: inviterUser.name,
          email: inviterUser.email,
        },
      },
      isExpired,
      isAlreadyMember,
    };
  } catch (error) {
    console.error("Error fetching invitation:", error);
    return {
      success: false,
      error: "Failed to fetch invitation details",
    };
  }
}

export type AcceptInvitationResult =
  | {
      success: true;
      organizationSlug: string;
      message: string;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Accept an invitation
 */
export async function acceptInvitation(
  invitationId: string
): Promise<AcceptInvitationResult> {
  try {
    // Get current session
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return {
        success: false,
        error:
          "You must be logged in to accept an invitation. Please sign in or create an account.",
      };
    }

    // Fetch invitation
    const inv = await db.query.invitation.findFirst({
      where: eq(invitation.id, invitationId),
    });

    if (!inv) {
      return {
        success: false,
        error: "Invitation not found",
      };
    }

    // Check if invitation is pending
    if (inv.status !== "pending") {
      return {
        success: false,
        error: "This invitation has already been used",
      };
    }

    // Check if invitation has expired
    if (new Date(inv.expiresAt) < new Date()) {
      return {
        success: false,
        error: "This invitation has expired",
      };
    }

    // Verify the logged-in user's email matches the invitation
    if (session.user.email !== inv.email) {
      return {
        success: false,
        error: `This invitation was sent to ${inv.email}. Please log in with that email address.`,
      };
    }

    // Check if user is already a member
    const existingMember = await db.query.member.findFirst({
      where: and(
        eq(member.organizationId, inv.organizationId),
        eq(member.userId, session.user.id)
      ),
    });

    if (existingMember) {
      return {
        success: false,
        error: "You are already a member of this organization",
      };
    }

    // Create membership
    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId: inv.organizationId,
      userId: session.user.id,
      role: inv.role || "member",
      createdAt: new Date(),
    });

    // Update invitation status
    await db
      .update(invitation)
      .set({ status: "accepted" })
      .where(eq(invitation.id, invitationId));

    // Get organization slug for redirect
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, inv.organizationId),
    });

    if (!org?.slug) {
      return {
        success: false,
        error: "Organization not found",
      };
    }

    // Revalidate relevant paths
    revalidatePath(`/${org.slug}`);
    revalidatePath(`/${org.slug}/members`);
    revalidatePath("/dashboard");

    return {
      success: true,
      organizationSlug: org.slug,
      message: `Welcome to ${org.name}!`,
    };
  } catch (error) {
    console.error("Error accepting invitation:", error);
    return {
      success: false,
      error: "Failed to accept invitation. Please try again.",
    };
  }
}

export type DeclineInvitationResult =
  | {
      success: true;
      message: string;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Decline an invitation
 */
export async function declineInvitation(
  invitationId: string
): Promise<DeclineInvitationResult> {
  try {
    // Fetch invitation
    const inv = await db.query.invitation.findFirst({
      where: eq(invitation.id, invitationId),
    });

    if (!inv) {
      return {
        success: false,
        error: "Invitation not found",
      };
    }

    // Check if invitation is pending
    if (inv.status !== "pending") {
      return {
        success: false,
        error: "This invitation has already been processed",
      };
    }

    // Update invitation status
    await db
      .update(invitation)
      .set({ status: "declined" })
      .where(eq(invitation.id, invitationId));

    // Get organization name for message
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, inv.organizationId),
    });

    return {
      success: true,
      message: `You have declined the invitation to join ${org?.name || "the organization"}`,
    };
  } catch (error) {
    console.error("Error declining invitation:", error);
    return {
      success: false,
      error: "Failed to decline invitation. Please try again.",
    };
  }
}
