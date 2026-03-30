import {
  db,
  member,
  messageSend,
  organizationExtension,
  template,
  user,
  workflow,
} from "@wraps/db";
import { createPlatformClient } from "@wraps.dev/client";
import { and, count, eq } from "drizzle-orm";
import { log } from "./logger";
import { getPostHogClient } from "./posthog";

/** Platform event emission. Never throws, but logs failures. */
async function emit(
  contactEmail: string,
  event: string,
  properties: Record<string, unknown>
) {
  try {
    const key = process.env.WRAPS_API_KEY;
    if (!key) {
      return;
    }
    const client = createPlatformClient({ apiKey: key });
    const { error } = await client.POST("/v1/events/", {
      body: { name: event, contactEmail, properties },
    });
    if (error) {
      log.error("Activation event emit failed", error, { event, contactEmail });
    }
  } catch (err) {
    log.error("Activation event emit threw", err, { event, contactEmail });
  }
}

async function getOrganizationContactEmail(
  organizationId: string
): Promise<string | null> {
  const ownerRows = await db
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, organizationId), eq(member.role, "owner")))
    .limit(1);

  const ownerEmail = ownerRows[0]?.email;
  if (ownerEmail) {
    return ownerEmail;
  }

  const memberRows = await db
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organizationId))
    .limit(1);

  return memberRows[0]?.email ?? null;
}

/**
 * Track first email sent for an organization.
 * Called after messageSend records are inserted with status "sent".
 * MUST be awaited in Lambda — fire-and-forget = dead code.
 */
export async function trackFirstEmailSent(
  organizationId: string,
  properties: { channel: string; source: string },
  contactEmail?: string
) {
  try {
    const [r] = await db
      .select({ count: count() })
      .from(messageSend)
      .where(
        and(
          eq(messageSend.organizationId, organizationId),
          eq(messageSend.status, "sent")
        )
      );

    const total = r?.count ?? 0;

    // Fire activation event only for the first batch of sent messages
    if (total > 0 && total <= 50) {
      const props = {
        organization_id: organizationId,
        channel: properties.channel,
        source: properties.source,
      };

      const posthog = getPostHogClient();
      posthog.capture({
        distinctId: organizationId,
        event: "activation_first_email_sent",
        properties: props,
        groups: { organization: organizationId },
      });
      posthog.groupIdentify({
        groupType: "organization",
        groupKey: organizationId,
        properties: {
          activation_first_email_sent: true,
        },
      });

      // Also emit to Wraps platform for workflow triggers
      if (contactEmail) {
        await emit(contactEmail, "activation.first_email_sent", props);
      }
    }
  } catch {
    // never throw from tracking
  }
}

/**
 * Track first email delivery for an organization from SES webhook events.
 * Catches SDK sends that bypass batch-sender (no messageSend records).
 * Uses organizationExtension as a cheap check to avoid repeated DB queries.
 * MUST be awaited in Lambda.
 */
export async function trackFirstEmailDelivered(
  organizationId: string,
  source: "sdk" | "platform"
) {
  try {
    // Fast path: check if org already has activation score > 0 with email tracked
    const [ext] = await db
      .select({ activationScore: organizationExtension.activationScore })
      .from(organizationExtension)
      .where(eq(organizationExtension.organizationId, organizationId))
      .limit(1);

    // If activation score >= 7, the org is already well-activated — skip
    if (ext && ext.activationScore >= 7) return;

    // Check whether we've already tracked this activation via messageSend records
    const [r] = await db
      .select({ count: count() })
      .from(messageSend)
      .where(
        and(
          eq(messageSend.organizationId, organizationId),
          eq(messageSend.status, "sent")
        )
      );

    // For platform sends, trackFirstEmailSent already handles this path
    // Only fire here if there are zero messageSend records (pure SDK send)
    // or if we've never fired the activation event before
    const hasPlatformSends = (r?.count ?? 0) > 0;
    if (source === "platform" && hasPlatformSends) return;

    const props = {
      organization_id: organizationId,
      channel: "email",
      source,
    };

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: organizationId,
      event: "activation_first_email_sent",
      properties: props,
      groups: { organization: organizationId },
    });
    posthog.groupIdentify({
      groupType: "organization",
      groupKey: organizationId,
      properties: {
        activation_first_email_sent: true,
        activation_email_source: source,
      },
    });

    log.info("Activation: first email delivery tracked from webhook", {
      organizationId,
      source,
    });
  } catch {
    // never throw from tracking
  }
}

/**
 * Track first resource creation for an organization.
 * Catches CLI pushes that bypass web-side activation tracking.
 * MUST be awaited in Lambda.
 */
export async function trackFirstResourceCreated(
  organizationId: string,
  resource: "template" | "workflow",
  source: "cli" | "dashboard"
) {
  try {
    const table = resource === "template" ? template : workflow;
    const [r] = await db
      .select({ count: count() })
      .from(table)
      .where(eq(table.organizationId, organizationId));

    // Only fire on the actual first resource
    if ((r?.count ?? 0) !== 1) return;

    const eventName =
      resource === "template"
        ? "activation_first_template"
        : "activation_first_automation";
    const platformEvent =
      resource === "template"
        ? "activation.first_template"
        : "activation.first_automation";

    const props = {
      organization_id: organizationId,
      resource,
      source,
    };

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: organizationId,
      event: eventName,
      properties: props,
      groups: { organization: organizationId },
    });
    posthog.groupIdentify({
      groupType: "organization",
      groupKey: organizationId,
      properties: {
        [eventName]: true,
        [`${eventName}_source`]: source,
      },
    });

    // Emit to platform so activation workflows can react
    const contactEmail = await getOrganizationContactEmail(organizationId);
    if (contactEmail) {
      await emit(contactEmail, platformEvent, props);
    } else {
      log.warn("Activation: no member email found, skipping platform event", {
        organizationId,
        resource,
      });
    }

    log.info("Activation: first resource created", {
      organizationId,
      resource,
      source,
    });
  } catch {
    // never throw from tracking
  }
}
