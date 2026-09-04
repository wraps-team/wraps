import { db, organizationExtension, template, user, workflow } from "@wraps/db";
import { member } from "@wraps/db/schema/auth";
import { createPlatformClient } from "@wraps.dev/client";
import { and, count, eq, isNull } from "drizzle-orm";
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

/**
 * Atomically claim the one-time "first email sent" activation for an org.
 * Returns true for exactly one caller per org — the winner emits
 * `activation_first_email_sent`; every later/concurrent caller gets false.
 * Upserts the extension row so orgs without one are still handled, and the
 * `IS NULL` setWhere makes the claim a real single-shot guard (no count
 * window that re-opens on every send).
 */
async function claimFirstEmailTracked(
  organizationId: string
): Promise<boolean> {
  // Cheap PK read first: this runs on every Delivery webhook, so once the org
  // is tracked every later call short-circuits here with no write and no row
  // lock on organization_extension.
  const [existing] = await db
    .select({ trackedAt: organizationExtension.activationFirstEmailTrackedAt })
    .from(organizationExtension)
    .where(eq(organizationExtension.organizationId, organizationId))
    .limit(1);
  if (existing?.trackedAt) {
    return false;
  }

  // First-time path: atomic claim. The `IS NULL` setWhere makes concurrent
  // first-fires safe — two callers both read null above, but exactly one wins
  // the upsert.
  const now = new Date();
  const claimed = await db
    .insert(organizationExtension)
    .values({ organizationId, activationFirstEmailTrackedAt: now })
    .onConflictDoUpdate({
      target: organizationExtension.organizationId,
      set: { activationFirstEmailTrackedAt: now, updatedAt: now },
      setWhere: isNull(organizationExtension.activationFirstEmailTrackedAt),
    })
    .returning({ organizationId: organizationExtension.organizationId });
  return claimed.length > 0;
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
    // Fire exactly once per org. The atomic claim replaces the old
    // `count(status='sent') BETWEEN 1 AND 50` window, which re-fired on every
    // workflow run because workflow sends never land as status='sent'.
    if (!(await claimFirstEmailTracked(organizationId))) {
      return;
    }

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
    // Shares the same one-time claim as trackFirstEmailSent, so platform sends
    // already tracked there won't double-fire here, and pure SDK sends (no
    // messageSend records) still get caught from the webhook.
    if (!(await claimFirstEmailTracked(organizationId))) {
      return;
    }

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

    // Emit to platform API so activation workflows can trigger on SDK sends
    const ownerEmail = await getOrgOwnerEmail(organizationId);
    if (ownerEmail) {
      await emit(ownerEmail, "activation.first_email_sent", props);
    }

    log.info("Activation: first email delivery tracked from webhook", {
      organizationId,
      source,
    });
  } catch {
    // never throw from tracking
  }
}

/** Look up a user's email by ID. Returns null if not found. */
async function getUserEmail(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.email ?? null;
}

/** Look up the org owner's email. Returns null if not found. */
async function getOrgOwnerEmail(
  organizationId: string
): Promise<string | null> {
  const [row] = await db
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(eq(member.organizationId, organizationId), eq(member.role, "owner"))
    )
    .limit(1);
  return row?.email ?? null;
}

/** Set properties on a contact record via platform API. Best-effort, never throws. */
async function setContactProperties(
  userEmail: string,
  props: Record<string, unknown>
) {
  try {
    const key = process.env.WRAPS_API_KEY;
    if (!key) {
      return;
    }
    const client = createPlatformClient({ apiKey: key });
    const searchResult = await client.GET("/v1/contacts/", {
      params: { query: { search: userEmail, pageSize: "10" } },
    });

    const contacts =
      (
        searchResult.data as
          | {
              contacts?: {
                id: string;
                email: string | null;
                properties: Record<string, unknown> | null;
              }[];
            }
          | undefined
      )?.contacts ?? [];

    const normalizedEmail = userEmail.toLowerCase().trim();
    const matched = contacts.find(
      (c) =>
        typeof c.email === "string" &&
        c.email.toLowerCase().trim() === normalizedEmail
    );

    if (matched) {
      await client.PATCH("/v1/contacts/{id}", {
        params: { path: { id: matched.id } },
        body: {
          properties: {
            ...(typeof matched.properties === "object" &&
            matched.properties !== null
              ? matched.properties
              : {}),
            ...props,
          },
        },
      });
    }
  } catch {
    // best-effort
  }
}

/**
 * Track first resource creation for an organization.
 * Catches CLI pushes that bypass web-side activation tracking.
 * Sets contact properties so activation workflows don't send
 * redundant nudge emails to users who already created resources.
 * MUST be awaited in Lambda.
 */
export async function trackFirstResourceCreated(
  organizationId: string,
  resource: "template" | "workflow",
  source: "cli" | "dashboard" | "api",
  userId?: string | null,
  resourceName?: string | null
) {
  try {
    const table = resource === "template" ? template : workflow;
    const [r] = await db
      .select({ count: count() })
      .from(table)
      .where(eq(table.organizationId, organizationId));

    // Resolve user email for contact property updates and event emission
    const userEmail = userId ? await getUserEmail(userId) : null;

    // Always set contact properties so workflows know the user has created
    // this resource, even if it's not their first one
    if (userEmail) {
      const contactProp =
        resource === "template"
          ? { hasCreatedTemplate: true }
          : { hasCreatedWorkflow: true };
      await setContactProperties(userEmail, contactProp);
    }

    // Only fire "first" activation events when count === 1
    if ((r?.count ?? 0) !== 1) {
      return;
    }

    const eventName =
      resource === "template"
        ? "activation_first_template"
        : "activation_first_automation";
    const platformEvent =
      resource === "template"
        ? "activation.first_template"
        : "activation.first_automation";

    const props: Record<string, string> = {
      organization_id: organizationId,
      resource,
      source,
    };
    if (resourceName) {
      props[resource === "template" ? "templateName" : "workflowName"] =
        resourceName;
    }

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: userEmail ?? organizationId,
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
    if (userEmail) {
      await emit(userEmail, platformEvent, props);
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
