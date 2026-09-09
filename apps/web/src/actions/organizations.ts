"use server";

import { auth } from "@wraps/auth";
import { auditLog, db } from "@wraps/db";
import { organizationExtension } from "@wraps/db/schema/app";
import { organization } from "@wraps/db/schema/auth";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auditLogEntry, getAuditContext } from "@/lib/audit";
import {
  type CreateOrganizationInput,
  createOrganizationSchema,
} from "@/lib/forms/create-organization";
import {
  type UpdateOrganizationInput,
  updateOrganizationSchema,
} from "@/lib/forms/update-organization";
import { createActionLogger, serializeError } from "@/lib/logger";
import {
  generateSlug,
  getOrganizationWithMembership,
} from "@/lib/organization";

export type CreateOrganizationResult =
  | {
      success: true;
      organization: {
        id: string;
        name: string;
        slug: string;
      };
    }
  | {
      success: false;
      error: string;
      field?: string;
    };

export async function createOrganizationAction(
  data: CreateOrganizationInput
): Promise<CreateOrganizationResult> {
  try {
    // 1. Get session
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return {
        success: false,
        error: "You must be logged in to create an organization",
      };
    }

    // 2. Validate input
    const validationResult = createOrganizationSchema.safeParse(data);
    if (!validationResult.success) {
      const firstError = validationResult.error.issues[0];
      return {
        success: false,
        error: firstError.message,
        field: firstError.path[0]?.toString(),
      };
    }

    const { name, slug: customSlug } = validationResult.data;

    // 3. Generate slug if not provided
    const slug = customSlug || generateSlug(name);

    // 4. Check if slug already exists
    const existingOrg = await db.query.organization.findFirst({
      where: (orgs, { eq: eqOp }) => eqOp(orgs.slug, slug),
    });

    if (existingOrg) {
      return {
        success: false,
        error: "An organization with this slug already exists",
        field: "slug",
      };
    }

    // 5. Create organization in database
    const [newOrg] = await db
      .insert(organization)
      .values({
        id: crypto.randomUUID(),
        name,
        slug,
        createdAt: new Date(),
      })
      .returning();

    if (!newOrg) {
      return {
        success: false,
        error: "Failed to create organization",
      };
    }

    // 6. Create membership for the creator as owner
    const { member } = await import("@wraps/db/schema/auth");
    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId: newOrg.id,
      userId: session.user.id,
      role: "owner",
      createdAt: new Date(),
    });

    // 6.5. Create organization extension for usage tracking
    // Note: Subscription/plan is managed separately via Better-Auth Stripe plugin
    const { organizationExtension } = await import("@wraps/db/schema/app");
    await db.insert(organizationExtension).values({
      organizationId: newOrg.id,
      awsAccountCount: 0,
      memberCount: 1,
      onboardingCompleted: false,
      updatedAt: new Date(),
    });

    // 7. Set as active organization
    const { session: sessionTable } = await import("@wraps/db/schema/auth");
    const { eq } = await import("drizzle-orm");
    await db
      .update(sessionTable)
      .set({ activeOrganizationId: newOrg.id })
      .where(eq(sessionTable.userId, session.user.id));

    // 7.5. Attach an AWS Marketplace subscription, if this signup came from one.
    let linkedMarketplaceSubscriptionId: string | null = null;
    //
    // Deliberately non-fatal: a buyer who cannot be linked still gets a working
    // organization, and the subscription stays unlinked for a human to attach.
    // Failing org creation over this would be strictly worse.
    try {
      const { cookies } = await import("next/headers");
      const {
        linkMarketplaceSubscription,
        MARKETPLACE_LINK_COOKIE,
        MARKETPLACE_SESSION_COOKIE,
      } = await import("@/lib/marketplace/aws");
      const cookieStore = await cookies();

      const linkedId = await linkMarketplaceSubscription({
        organizationId: newOrg.id,
        cookieRef: cookieStore.get(MARKETPLACE_SESSION_COOKIE)?.value ?? null,
        linkTokenSubscriptionId:
          cookieStore.get(MARKETPLACE_LINK_COOKIE)?.value ?? null,
      });

      linkedMarketplaceSubscriptionId = linkedId;
    } catch (linkError) {
      createActionLogger("createOrganizationAction", {}).error(
        { err: serializeError(linkError), organizationId: newOrg.id },
        "Failed to link AWS Marketplace subscription to a new organization"
      );
    }

    // 8. Revalidate paths
    // Use "page" type to only revalidate the root page, not all routes.
    // revalidatePath("/") without a type is a special case that purges the
    // entire Router Cache, which races with the client-side router.push()
    // and prevents navigation to the onboarding page.
    revalidatePath("/", "page");

    // 8.5. Write audit log
    const auditCtx = await getAuditContext();
    await db.insert(auditLog).values(
      auditLogEntry(auditCtx, {
        organizationId: newOrg.id,
        actorId: session.user.id,
        actorEmail: session.user.email,
        action: "org.created",
        resource: "organization",
        resourceId: newOrg.id,
        metadata: { name, slug },
      })
    );

    // Written after org.created so the audit log reads in causal order.
    if (linkedMarketplaceSubscriptionId) {
      await db.insert(auditLog).values(
        auditLogEntry(auditCtx, {
          organizationId: newOrg.id,
          actorId: session.user.id,
          actorEmail: session.user.email,
          action: "marketplace.linked",
          resource: "organization",
          resourceId: newOrg.id,
          metadata: { subscriptionId: linkedMarketplaceSubscriptionId },
        })
      );
    }

    // 9. Return success
    return {
      success: true,
      organization: {
        id: newOrg.id,
        name: newOrg.name,
        slug,
      },
    };
  } catch (error) {
    const log = createActionLogger("createOrganizationAction", {});
    log.error({ err: error }, "Failed to create organization");
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export type UpdateOrganizationResult =
  | {
      success: true;
      organization: {
        id: string;
        name: string;
        slug: string;
      };
    }
  | {
      success: false;
      error: string;
      field?: string;
    };

export async function updateOrganizationAction(
  orgSlug: string,
  data: UpdateOrganizationInput
): Promise<UpdateOrganizationResult> {
  try {
    // 1. Get session
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return {
        success: false,
        error: "You must be logged in to update an organization",
      };
    }

    // 2. Get organization with membership
    const orgWithMembership = await getOrganizationWithMembership(
      orgSlug,
      session.user.id
    );

    if (!orgWithMembership) {
      return {
        success: false,
        error: "Organization not found",
      };
    }

    // 3. Check permissions (only owner and admin can update org settings)
    if (!["owner", "admin"].includes(orgWithMembership.userRole)) {
      return {
        success: false,
        error: "You do not have permission to update organization settings",
      };
    }

    // 4. Validate input
    const validationResult = updateOrganizationSchema.safeParse(data);
    if (!validationResult.success) {
      const firstError = validationResult.error.issues[0];
      return {
        success: false,
        error: firstError.message,
        field: firstError.path[0]?.toString(),
      };
    }

    const { name, slug: newSlug, logo } = validationResult.data;

    // 5. Check if slug changed and if new slug already exists
    if (newSlug && newSlug !== orgWithMembership.slug) {
      const existingOrg = await db.query.organization.findFirst({
        where: (orgs, { eq: eqOp }) => eqOp(orgs.slug, newSlug),
      });

      if (existingOrg) {
        return {
          success: false,
          error: "An organization with this slug already exists",
          field: "slug",
        };
      }
    }

    // 6. Update organization in database + write audit log atomically
    const { eq } = await import("drizzle-orm");
    const auditCtx = await getAuditContext();

    const updates: Record<string, unknown> = {};
    if (name) updates.name = name;
    if (newSlug) updates.slug = newSlug;
    if (logo !== undefined) updates.logo = logo;

    const updatedOrg = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(organization)
        .set({
          ...(name && { name }),
          ...(newSlug && { slug: newSlug }),
          ...(logo !== undefined && { logo }),
        })
        .where(eq(organization.id, orgWithMembership.id))
        .returning();
      if (!updated) return null;
      await tx.insert(auditLog).values(
        auditLogEntry(auditCtx, {
          organizationId: orgWithMembership.id,
          actorId: session.user.id,
          actorEmail: session.user.email,
          action: "settings.updated",
          resource: "organization",
          resourceId: orgWithMembership.id,
          metadata: { fields: Object.keys(updates) },
        })
      );
      return updated;
    });

    if (!updatedOrg) {
      return {
        success: false,
        error: "Failed to update organization",
      };
    }

    // 8. Revalidate paths
    revalidatePath("/");
    revalidatePath(`/${orgSlug}`);
    if (newSlug && newSlug !== orgSlug) {
      revalidatePath(`/${newSlug}`);
    }

    // 9. Return success
    return {
      success: true,
      organization: {
        id: updatedOrg.id,
        name: updatedOrg.name,
        slug: updatedOrg.slug || orgSlug,
      },
    };
  } catch (error) {
    const log = createActionLogger("updateOrganizationAction", { orgSlug });
    log.error({ err: error }, "Failed to update organization");
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SENDER DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════

export type SenderDefaults = {
  defaultAwsAccountId: string | null;
  defaultFrom: string | null;
  defaultFromName: string | null;
  defaultReplyTo: string | null;
  defaultSenderId: string | null;
};

export type GetSenderDefaultsResult =
  | {
      success: true;
      defaults: SenderDefaults;
    }
  | {
      success: false;
      error: string;
    };

export async function getSenderDefaultsAction(
  orgSlug: string
): Promise<GetSenderDefaultsResult> {
  try {
    // 1. Get session
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return {
        success: false,
        error: "You must be logged in",
      };
    }

    // 2. Get organization with membership
    const orgWithMembership = await getOrganizationWithMembership(
      orgSlug,
      session.user.id
    );

    if (!orgWithMembership) {
      return {
        success: false,
        error: "Organization not found",
      };
    }

    // 3. Get organization extension (sender defaults)
    const extension = await db.query.organizationExtension.findFirst({
      where: (ext, { eq: eqOp }) =>
        eqOp(ext.organizationId, orgWithMembership.id),
    });

    return {
      success: true,
      defaults: {
        defaultAwsAccountId: extension?.defaultAwsAccountId ?? null,
        defaultFrom: extension?.defaultFrom ?? null,
        defaultFromName: extension?.defaultFromName ?? null,
        defaultReplyTo: extension?.defaultReplyTo ?? null,
        defaultSenderId: extension?.defaultSenderId ?? null,
      },
    };
  } catch (error) {
    const log = createActionLogger("getSenderDefaultsAction", { orgSlug });
    log.error({ err: error }, "Failed to get sender defaults");
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export type UpdateSenderDefaultsInput = {
  defaultAwsAccountId?: string | null;
  defaultFrom?: string | null;
  defaultFromName?: string | null;
  defaultReplyTo?: string | null;
  defaultSenderId?: string | null;
};

export type UpdateSenderDefaultsResult =
  | {
      success: true;
      defaults: SenderDefaults;
    }
  | {
      success: false;
      error: string;
    };

export async function updateSenderDefaultsAction(
  orgSlug: string,
  data: UpdateSenderDefaultsInput
): Promise<UpdateSenderDefaultsResult> {
  try {
    // 1. Get session
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return {
        success: false,
        error: "You must be logged in",
      };
    }

    // 2. Get organization with membership
    const orgWithMembership = await getOrganizationWithMembership(
      orgSlug,
      session.user.id
    );

    if (!orgWithMembership) {
      return {
        success: false,
        error: "Organization not found",
      };
    }

    // 3. Check permissions (only owner and admin can update sender defaults)
    if (!["owner", "admin"].includes(orgWithMembership.userRole)) {
      return {
        success: false,
        error: "You do not have permission to update sender defaults",
      };
    }

    // 4. Update organization extension
    const [updated] = await db
      .update(organizationExtension)
      .set({
        defaultAwsAccountId: data.defaultAwsAccountId ?? null,
        defaultFrom: data.defaultFrom ?? null,
        defaultFromName: data.defaultFromName ?? null,
        defaultReplyTo: data.defaultReplyTo ?? null,
        defaultSenderId: data.defaultSenderId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(organizationExtension.organizationId, orgWithMembership.id))
      .returning();

    if (!updated) {
      return {
        success: false,
        error: "Failed to update sender defaults",
      };
    }

    // 5. Revalidate paths
    revalidatePath(`/${orgSlug}/settings/sender-defaults`);

    // 5.5. Write audit log
    const auditCtx = await getAuditContext();
    await db.insert(auditLog).values(
      auditLogEntry(auditCtx, {
        organizationId: orgWithMembership.id,
        actorId: session.user.id,
        actorEmail: session.user.email,
        action: "settings.sender_defaults_updated",
        resource: "organization",
        resourceId: orgWithMembership.id,
      })
    );

    return {
      success: true,
      defaults: {
        defaultAwsAccountId: updated.defaultAwsAccountId,
        defaultFrom: updated.defaultFrom,
        defaultFromName: updated.defaultFromName,
        defaultReplyTo: updated.defaultReplyTo,
        defaultSenderId: updated.defaultSenderId,
      },
    };
  } catch (error) {
    const log = createActionLogger("updateSenderDefaultsAction", { orgSlug });
    log.error({ err: error }, "Failed to update sender defaults");
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}
