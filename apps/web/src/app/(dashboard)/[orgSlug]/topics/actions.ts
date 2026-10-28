"use server";

import {
  contact,
  db,
  eq,
  type PreferenceCenterTheme,
  topicSettings,
} from "@wraps/db";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/current-session";
import { createActionLogger } from "@/lib/logger";
import {
  sanitizeLogoUrl,
  sanitizeTheme,
} from "@/lib/preference-theme/validate";
import { generatePreferencesUrl } from "@/lib/unsubscribe-token";

type TopicSettingsType = typeof topicSettings.$inferSelect;

export type GetTopicSettingsResult =
  | { success: true; settings: TopicSettingsType | null }
  | { success: false; error: string };

export type UpdateTopicSettingsResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Verify user has access to organization
 */
async function verifyOrgAccess(
  organizationId: string
): Promise<{ userId: string; role: string } | null> {
  const session = await getCurrentSession();

  if (!session?.user) {
    return null;
  }

  const membership = await db.query.member.findFirst({
    where: (m, { and, eq }) =>
      and(eq(m.organizationId, organizationId), eq(m.userId, session.user.id)),
  });

  if (!membership) {
    return null;
  }

  return { userId: session.user.id, role: membership.role };
}

/**
 * Get topic settings for an organization
 */
export async function getTopicSettings(
  organizationId: string
): Promise<GetTopicSettingsResult> {
  const log = createActionLogger("getTopicSettings", {
    orgSlug: organizationId,
  });

  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const settings = await db.query.topicSettings.findFirst({
      where: (s, { eq }) => eq(s.organizationId, organizationId),
    });

    return { success: true, settings: settings ?? null };
  } catch (error) {
    log.error({ err: error }, "Failed to get topic settings");
    return { success: false, error: "Failed to fetch settings" };
  }
}

/**
 * Update topic settings for an organization
 */
export async function updateTopicSettings(
  organizationId: string,
  data: {
    confirmationFromName?: string | null;
    confirmationFromEmail?: string | null;
    confirmationReplyToEmail?: string | null;
    confirmationTemplateId?: string | null;
    preferenceCenterTitle?: string | null;
    preferenceCenterDescription?: string | null;
    preferenceCenterLogo?: string | null;
    preferenceCenterTheme?: PreferenceCenterTheme | null;
  }
): Promise<UpdateTopicSettingsResult> {
  const log = createActionLogger("updateTopicSettings", {
    orgSlug: organizationId,
  });

  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Only owners and admins can update settings
    if (!["owner", "admin"].includes(access.role)) {
      return {
        success: false,
        error: "Only owners and admins can update settings",
      };
    }

    // Never trust client input: re-validate the whole theme object
    // server-side before it can ever be persisted.
    let sanitizedData = data;
    if (data.preferenceCenterTheme !== undefined) {
      const sanitized =
        data.preferenceCenterTheme === null
          ? null
          : sanitizeTheme(data.preferenceCenterTheme);
      if (data.preferenceCenterTheme !== null && sanitized === null) {
        return { success: false, error: "Invalid theme" };
      }
      sanitizedData = { ...data, preferenceCenterTheme: sanitized };
    }

    // Same rule for the logo: it ends up as an <img src> on a public page.
    // Spread sanitizedData, not data — spreading data would discard the
    // sanitized theme above.
    if (data.preferenceCenterLogo !== undefined) {
      const sanitizedLogo =
        data.preferenceCenterLogo === null
          ? null
          : sanitizeLogoUrl(data.preferenceCenterLogo);
      if (data.preferenceCenterLogo !== null && sanitizedLogo === null) {
        return { success: false, error: "Invalid logo URL" };
      }
      sanitizedData = { ...sanitizedData, preferenceCenterLogo: sanitizedLogo };
    }

    // Check if settings exist
    const existing = await db.query.topicSettings.findFirst({
      where: (s, { eq }) => eq(s.organizationId, organizationId),
    });

    if (existing) {
      // Update existing settings
      await db
        .update(topicSettings)
        .set({
          ...sanitizedData,
          updatedAt: new Date(),
        })
        .where(eq(topicSettings.organizationId, organizationId));
    } else {
      // Insert new settings
      await db.insert(topicSettings).values({
        organizationId,
        ...sanitizedData,
      });
    }

    // Revalidate
    revalidatePath("/[orgSlug]/topics", "page");

    log.info("Updated topic settings");
    return { success: true };
  } catch (error) {
    log.error({ err: error }, "Failed to update topic settings");
    return { success: false, error: "Failed to save settings" };
  }
}

export type GeneratePreviewUrlResult =
  | { success: true; url: string }
  | { success: false; error: string };

/**
 * Generate a preview URL for the preference center
 * Uses the first active contact in the organization for preview
 */
export async function generatePreferenceCenterPreviewUrl(
  organizationId: string
): Promise<GeneratePreviewUrlResult> {
  const log = createActionLogger("generatePreferenceCenterPreviewUrl", {
    orgSlug: organizationId,
  });

  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Find the first active contact for this organization to use as preview
    const [previewContact] = await db
      .select({ id: contact.id })
      .from(contact)
      .where(eq(contact.organizationId, organizationId))
      .limit(1);

    if (!previewContact) {
      return {
        success: false,
        error:
          "No contacts found. Add at least one contact to preview the preference center.",
      };
    }

    const url = await generatePreferencesUrl(previewContact.id, organizationId);

    log.info("Generated preference center preview URL");
    return { success: true, url };
  } catch (error) {
    log.error({ err: error }, "Failed to generate preview URL");
    return { success: false, error: "Failed to generate preview URL" };
  }
}
