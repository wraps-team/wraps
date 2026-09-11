"use server";

import { auth } from "@wraps/auth";
import {
  auditLog,
  db,
  invitation,
  member,
  notifyUser,
  organization,
  user,
} from "@wraps/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { trackInvitationAccepted } from "@/lib/activation-tracking";
import { auditLogEntry, getAuditContext } from "@/lib/audit";
import { createActionLogger } from "@/lib/logger";

export type InvitationDetails = {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date;
  organization: {
    name: string;
  };
  inviter: {
    name: string;
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
          name: org.name,
        },
        inviter: {
          name: inviterUser.name,
        },
      },
      isExpired,
      isAlreadyMember,
    };
  } catch (error) {
    const log = createActionLogger("getInvitation", {});
    log.error({ err: error, invitationId }, "Failed to fetch invitation");
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

    const auditCtx = await getAuditContext();
    // Atomically claim the invitation, create membership, and write audit log
    const claimResult = await db.transaction(async (tx) => {
      // biome-ignore lint/plugin: invitationId is the accept flow's own credential (verified above: pending, unexpired, session email matches inv.email) — it uniquely determines the target org, so there is no separate authenticated org context to compare it against. eq(status, "pending") is the atomic double-accept guard.
      const result = await tx
        .update(invitation)
        .set({ status: "accepted" })
        .where(
          and(eq(invitation.id, invitationId), eq(invitation.status, "pending"))
        );
      if ((result as any)?.rowCount === 0) return "already_used";

      await tx.insert(member).values({
        id: crypto.randomUUID(),
        organizationId: inv.organizationId,
        userId: session.user.id,
        role: inv.role || "member",
        createdAt: new Date(),
      });

      await tx.insert(auditLog).values(
        auditLogEntry(auditCtx, {
          organizationId: inv.organizationId,
          actorId: session.user.id,
          actorEmail: session.user.email,
          action: "member.invite_accepted",
          resource: "invitation",
          resourceId: invitationId,
          metadata: { organizationId: inv.organizationId },
        })
      );
      return "ok";
    });

    if (claimResult === "already_used") {
      return {
        success: false,
        error: "This invitation has already been used",
      };
    }

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

    // Emit the invitation.accepted platform event so the member onboarding
    // workflow fires, and flag the contact as invited so the owner-centric
    // onboarding flows skip them. Best-effort — never blocks the join.
    const inviterUser = await db.query.user.findFirst({
      where: eq(user.id, inv.inviterId),
    });
    await trackInvitationAccepted(session.user.email, inv.organizationId, {
      organizationName: org.name,
      inviterName: inviterUser?.name ?? "A teammate",
      role: inv.role ?? "member",
    });

    if (inviterUser) {
      try {
        await notifyUser({
          userId: inviterUser.id,
          organizationId: inv.organizationId,
          type: "member.invite_accepted",
          title: `${session.user.name || session.user.email} joined ${org.name}`,
          body: `They accepted your invitation and joined as ${inv.role ?? "member"}.`,
          href: `/${org.slug}/settings/members`,
          data: { invitationId, memberUserId: session.user.id },
        });
      } catch (notifyError) {
        const log = createActionLogger("acceptInvitation", {
          organizationId: inv.organizationId,
        });
        log.error(
          { err: notifyError },
          "Failed to write invite-accepted notification"
        );
      }
    }

    // Revalidate relevant paths
    revalidatePath(`/${org.slug}`);
    revalidatePath(`/${org.slug}/settings/members`);
    revalidatePath("/");

    return {
      success: true,
      organizationSlug: org.slug,
      message: `Welcome to ${org.name}!`,
    };
  } catch (error) {
    const log = createActionLogger("acceptInvitation", {});
    log.error({ err: error, invitationId }, "Failed to accept invitation");
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
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return {
        success: false,
        error: "You must be logged in to decline an invitation.",
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
        error: "This invitation has already been processed",
      };
    }

    // Verify the logged-in user's email matches the invitation
    if (session.user.email !== inv.email) {
      return {
        success: false,
        error: `This invitation was sent to ${inv.email}. Please log in with that email address.`,
      };
    }

    // Update invitation status
    // biome-ignore lint/plugin: invitationId is the primary key of the row already fetched and email-verified above. The invitee is not yet an org member, so organizationId scoping doesn't apply here — email ownership is the authorization.
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
    const log = createActionLogger("declineInvitation", {});
    log.error({ err: error, invitationId }, "Failed to decline invitation");
    return {
      success: false,
      error: "Failed to decline invitation. Please try again.",
    };
  }
}
