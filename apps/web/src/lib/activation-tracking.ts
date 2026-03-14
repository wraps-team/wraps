import {
  apiKey,
  awsAccount,
  batchSend,
  contact,
  db,
  invitation,
  messageSend,
  organizationExtension,
  template,
  workflow,
} from "@wraps/db";
import { createPlatformClient } from "@wraps.dev/client";
import { and, count, eq } from "drizzle-orm";
import { logger } from "./logger";
import { getPostHogClient } from "./posthog-server";

const log = logger.child({ module: "activation-tracking" });

type ContactLookupResult = {
  id: string;
  email: string | null;
  properties: Record<string, unknown> | null;
};

type ContactsListResponse = {
  contacts?: ContactLookupResult[];
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Fire-and-forget PostHog capture. Never throws. */
function capture(
  distinctId: string,
  event: string,
  properties: Record<string, unknown>
) {
  try {
    const posthog = getPostHogClient();
    posthog.capture({ distinctId, event, properties });
  } catch {
    // intentionally swallowed - tracking should never break the app
  }
}

/** Set properties on a contact record. Best-effort, never throws. */
async function setContactProperties(
  userEmail: string,
  props: Record<string, unknown>
) {
  try {
    const key = process.env.WRAPS_API_KEY;
    if (!key) return;
    const normalizedEmail = userEmail.toLowerCase().trim();
    if (!normalizedEmail) return;
    const client = createPlatformClient({ apiKey: key });
    const searchResult = await client.GET("/v1/contacts/", {
      params: { query: { search: normalizedEmail, pageSize: "10" } },
    });

    const contactsData = searchResult.data as ContactsListResponse | undefined;
    const contacts = contactsData?.contacts ?? [];

    let matchedContact: ContactLookupResult | undefined;
    for (const candidate of contacts) {
      if (
        typeof candidate.email === "string" &&
        candidate.email.toLowerCase().trim() === normalizedEmail
      ) {
        matchedContact = candidate;
        break;
      }
    }

    if (matchedContact) {
      await client.PATCH("/v1/contacts/{id}", {
        params: { path: { id: matchedContact.id } },
        body: {
          properties: {
            ...(isObjectRecord(matchedContact.properties)
              ? matchedContact.properties
              : {}),
            ...props,
          },
        },
      });
      return;
    }

    await client.POST("/v1/contacts/", {
      body: {
        email: normalizedEmail,
        emailStatus: "active",
        properties: props,
      },
    });
  } catch {
    // contact properties update is best-effort
  }
}

/** Platform event emission. Never throws, but logs failures. */
async function emit(
  contactEmail: string,
  event: string,
  properties: Record<string, unknown>,
  options?: { createIfMissing?: boolean }
) {
  try {
    const key = process.env.WRAPS_API_KEY;
    if (!key) {
      return;
    }
    const client = createPlatformClient({ apiKey: key });
    const { error } = await client.POST("/v1/events/", {
      body: {
        name: event,
        contactEmail,
        properties,
        ...(options?.createIfMissing && { createIfMissing: true }),
      },
    });
    if (error) {
      log.error({ event, error }, "Platform event emission failed");
    }
  } catch (err) {
    log.error({ event, err }, "Platform event emission threw");
  }
}

// ─── Count Helpers ──────────────────────────────────────────────────────────
// Called AFTER insert, so "first" means count === 1.

async function countAwsAccounts(organizationId: string): Promise<number> {
  const [r] = await db
    .select({ count: count() })
    .from(awsAccount)
    .where(eq(awsAccount.organizationId, organizationId));
  return r?.count ?? 0;
}

async function countContacts(organizationId: string): Promise<number> {
  const [r] = await db
    .select({ count: count() })
    .from(contact)
    .where(eq(contact.organizationId, organizationId));
  return r?.count ?? 0;
}

async function countTemplates(organizationId: string): Promise<number> {
  const [r] = await db
    .select({ count: count() })
    .from(template)
    .where(eq(template.organizationId, organizationId));
  return r?.count ?? 0;
}

async function countBatchSends(organizationId: string): Promise<number> {
  const [r] = await db
    .select({ count: count() })
    .from(batchSend)
    .where(eq(batchSend.organizationId, organizationId));
  return r?.count ?? 0;
}

async function countApiKeys(organizationId: string): Promise<number> {
  const [r] = await db
    .select({ count: count() })
    .from(apiKey)
    .where(eq(apiKey.organizationId, organizationId));
  return r?.count ?? 0;
}

async function countWorkflows(organizationId: string): Promise<number> {
  const [r] = await db
    .select({ count: count() })
    .from(workflow)
    .where(eq(workflow.organizationId, organizationId));
  return r?.count ?? 0;
}

async function countInvitations(organizationId: string): Promise<number> {
  const [r] = await db
    .select({ count: count() })
    .from(invitation)
    .where(eq(invitation.organizationId, organizationId));
  return r?.count ?? 0;
}

async function countSentMessages(organizationId: string): Promise<number> {
  const [r] = await db
    .select({ count: count() })
    .from(messageSend)
    .where(
      and(
        eq(messageSend.organizationId, organizationId),
        eq(messageSend.status, "sent")
      )
    );
  return r?.count ?? 0;
}

// ─── Tracking Helpers ────────────────────────────────────────────────────────
// Each helper is wrapped in try/catch so it never throws.
// Callers should await these to ensure events are emitted before the context exits.

// ─── Tier 1: Infrastructure Activation ───────────────────────────────────────
// These represent the critical path to "can they send email?"
// Fully Activated = aws_connected + domain_verified + first_email_sent

export async function trackAwsConnected(
  userId: string,
  organizationId: string,
  properties: { region: string; accountId: string }
) {
  try {
    const existing = await countAwsAccounts(organizationId);
    const props = {
      organization_id: organizationId,
      region: properties.region,
      account_id: properties.accountId,
    };
    capture(userId, "aws_account_connected", props);
    await emit(userId, "aws_account.connected", props);
    if (existing === 1) {
      capture(userId, "activation_aws_connected", props);
      await emit(userId, "activation.aws_connected", props);
    }
    await updateActivationScore(
      userId,
      organizationId,
      existing === 1 ? { hasConnectedAws: true } : undefined
    );
  } catch {
    // never throw from tracking
  }
}

export async function trackDomainVerified(
  userId: string,
  organizationId: string,
  properties: {
    domain: string;
    isFirstDomain: boolean;
  }
) {
  try {
    const props = {
      organization_id: organizationId,
      domain: properties.domain,
    };
    capture(userId, "domain_verified", props);
    await emit(userId, "domain.verified", props);
    if (properties.isFirstDomain) {
      capture(userId, "activation_domain_verified", props);
      await emit(userId, "activation.domain_verified", props);
    }
    await updateActivationScore(
      userId,
      organizationId,
      properties.isFirstDomain ? { hasDomainVerified: true } : undefined
    );
  } catch {
    // never throw from tracking
  }
}

export async function trackFirstEmailSent(
  userId: string,
  organizationId: string,
  properties: { channel: string; source: string } = {
    channel: "email",
    source: "broadcast",
  }
) {
  try {
    const existing = await countSentMessages(organizationId);
    if (existing <= 1) {
      const props = {
        organization_id: organizationId,
        channel: properties.channel,
        source: properties.source,
      };
      capture(userId, "activation_first_email_sent", props);
      await emit(userId, "activation.first_email_sent", props);
    }
    await updateActivationScore(
      userId,
      organizationId,
      existing <= 1 ? { hasSentEmail: true } : undefined
    );
  } catch {
    // never throw from tracking
  }
}

export async function trackOnboardingCompleted(
  userEmail: string,
  organizationId: string,
  properties?: { path?: "start_building" | "connect_aws" }
) {
  try {
    const props: Record<string, unknown> = {
      organization_id: organizationId,
    };
    if (properties?.path) {
      props.path = properties.path;
    }
    capture(userEmail, "onboarding_completed", props);

    // Store onboarding path on contact properties BEFORE emitting the event,
    // so workflow conditions can read the path when the gate evaluates
    if (properties?.path) {
      await setContactProperties(userEmail, {
        onboardingPath: properties.path,
      });
    }

    await emit(userEmail, "onboarding.completed", props, {
      createIfMissing: true,
    });
  } catch {
    // never throw from tracking
  }
}

// ─── Tier 2: Product Adoption ────────────────────────────────────────────────
// These track deeper engagement with product features.

export async function trackContactCreated(
  userId: string,
  organizationId: string,
  properties: Record<string, unknown> = {}
) {
  try {
    const existing = await countContacts(organizationId);
    const props = {
      organization_id: organizationId,
      method: "manual",
      ...properties,
    };
    capture(userId, "contact_created", props);
    await emit(userId, "contact.created", props);
    if (existing === 1) {
      const firstProps = { organization_id: organizationId };
      capture(userId, "activation_first_contact", firstProps);
      await emit(userId, "activation.first_contact", firstProps);
    }
    await updateActivationScore(userId, organizationId);
  } catch {
    // never throw from tracking
  }
}

export async function trackContactsImported(
  userId: string,
  organizationId: string,
  properties: { count: number }
) {
  try {
    const existing = await countContacts(organizationId);
    const props = { organization_id: organizationId, count: properties.count };
    capture(userId, "contacts_imported", props);
    await emit(userId, "contacts.imported", props);
    if (existing <= properties.count) {
      const firstProps = { organization_id: organizationId };
      capture(userId, "activation_first_contact", firstProps);
      await emit(userId, "activation.first_contact", firstProps);
    }
    await updateActivationScore(userId, organizationId);
  } catch {
    // never throw from tracking
  }
}

export async function trackWorkflowCreated(
  userId: string,
  organizationId: string,
  properties: Record<string, unknown> = {}
) {
  try {
    const existing = await countWorkflows(organizationId);
    const props = { organization_id: organizationId, ...properties };
    capture(userId, "workflow_created", props);
    await emit(userId, "workflow.created", props);
    if (existing === 1) {
      const firstProps = { organization_id: organizationId };
      capture(userId, "activation_first_automation", firstProps);
      await emit(userId, "activation.first_automation", firstProps);
    }
    await setContactProperties(userId, { hasCreatedWorkflow: true });
    await updateActivationScore(userId, organizationId);
  } catch {
    // never throw from tracking
  }
}

export async function trackTemplateCreated(
  userId: string,
  organizationId: string,
  properties: Record<string, unknown> = {}
) {
  try {
    const existing = await countTemplates(organizationId);
    const props = { organization_id: organizationId, ...properties };
    capture(userId, "template_created", props);
    await emit(userId, "template.created", props);
    if (existing === 1) {
      const firstProps = { organization_id: organizationId };
      capture(userId, "activation_first_template", firstProps);
      await emit(userId, "activation.first_template", firstProps);
    }
    await updateActivationScore(
      userId,
      organizationId,
      existing === 1 ? { hasCreatedTemplate: true } : undefined
    );
  } catch {
    // never throw from tracking
  }
}

export async function trackTemplatePublished(
  userId: string,
  organizationId: string,
  properties: Record<string, unknown> = {}
) {
  try {
    const props = { organization_id: organizationId, ...properties };
    capture(userId, "template_published", props);
    await emit(userId, "template.published", props);
  } catch {
    // never throw from tracking
  }
}

export async function trackBroadcastCreated(
  userId: string,
  organizationId: string,
  properties: { channel: string; recipientCount: number }
) {
  try {
    const existing = await countBatchSends(organizationId);
    const props = {
      organization_id: organizationId,
      channel: properties.channel,
      recipient_count: properties.recipientCount,
    };
    capture(userId, "broadcast_created", props);
    await emit(userId, "broadcast.created", props);
    if (existing === 1) {
      const firstProps = {
        organization_id: organizationId,
        channel: properties.channel,
      };
      capture(userId, "activation_first_broadcast", firstProps);
      await emit(userId, "activation.first_broadcast", firstProps);
    }
    await updateActivationScore(
      userId,
      organizationId,
      existing === 1 ? { hasSentBroadcast: true } : undefined
    );
  } catch {
    // never throw from tracking
  }
}

export async function trackApiKeyCreated(
  userId: string,
  organizationId: string
) {
  try {
    const existing = await countApiKeys(organizationId);
    const props = { organization_id: organizationId };
    capture(userId, "api_key_created", props);
    await emit(userId, "api_key.created", props);
    if (existing === 1) {
      capture(userId, "activation_first_api_key", props);
      await emit(userId, "activation.first_api_key", props);
    }
  } catch {
    // never throw from tracking
  }
}

// ─── Tier 3: Team & Onboarding ──────────────────────────────────────────────

export async function trackTeammateInvited(
  userId: string,
  organizationId: string,
  properties: { invitedEmail: string; role: string }
) {
  try {
    const existing = await countInvitations(organizationId);
    const props = {
      organization_id: organizationId,
      invited_email: properties.invitedEmail,
      role: properties.role,
    };
    capture(userId, "teammate_invited", props);
    await emit(userId, "teammate.invited", props);
    if (existing === 1) {
      capture(userId, "activation_teammate_invited", {
        organization_id: organizationId,
      });
      await emit(userId, "activation.teammate_invited", {
        organization_id: organizationId,
      });
    }
    await updateActivationScore(userId, organizationId);
  } catch {
    // never throw from tracking
  }
}

export async function trackOnboardingPathChosen(
  userId: string,
  organizationId: string,
  properties: { path: "start_building" | "connect_aws" }
) {
  try {
    const props = {
      organization_id: organizationId,
      path: properties.path,
    };
    capture(userId, "onboarding_path_chosen", props);
    await emit(userId, "onboarding.path_chosen", props);
  } catch {
    // never throw from tracking
  }
}

// ─── Activation Score ───────────────────────────────────────────────────────

export async function computeActivationScore(
  organizationId: string
): Promise<{ score: number; milestones: Record<string, boolean> }> {
  const { getSetupStatus } = await import("@/lib/setup-status");
  const [setupResult, contactCount, invitationCount] = await Promise.all([
    getSetupStatus(organizationId),
    countContacts(organizationId),
    countInvitations(organizationId),
  ]);

  const { setupStatus } = setupResult;
  const milestones = {
    hasTemplate: setupStatus.hasTemplate,
    hasBroadcast: setupStatus.hasBroadcast,
    hasContact: contactCount > 0,
    hasTeammateInvited: invitationCount > 0,
    hasAwsAccount: setupStatus.hasAwsAccount,
    hasVerifiedDomain: setupStatus.hasVerifiedDomain,
    hasSentEmail: setupStatus.hasSentEmail,
    hasAutomation: setupStatus.hasWorkflow,
  };

  const score = Object.values(milestones).filter(Boolean).length;
  return { score, milestones };
}

async function updateActivationScore(
  userEmail: string,
  organizationId: string,
  extraContactProps?: Record<string, unknown>
): Promise<void> {
  try {
    const { score } = await computeActivationScore(organizationId);

    await db
      .insert(organizationExtension)
      .values({ organizationId, activationScore: score })
      .onConflictDoUpdate({
        target: organizationExtension.organizationId,
        set: { activationScore: score, updatedAt: new Date() },
      });

    await setContactProperties(userEmail, {
      ...extraContactProps,
      activationScore: score,
    });
  } catch {
    // never throw from tracking
  }
}
