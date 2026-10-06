import {
  apiKey,
  awsAccount,
  batchSend,
  contact,
  db,
  invitation,
  organizationExtension,
  template,
  workflow,
} from "@wraps/db";
import { member, user } from "@wraps/db/schema/auth";
import { createPlatformClient } from "@wraps.dev/client";
import { and, count, eq, isNull, ne } from "drizzle-orm";
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

type ContactNameInfo = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

/** Derive a display name from first/last name, falling back to email local-part. */
function deriveContactName(info?: ContactNameInfo): string | null {
  if (!info) {
    return null;
  }
  const name = [info.firstName, info.lastName].filter(Boolean).join(" ").trim();
  if (name) {
    return name;
  }
  const localPart = info.email?.split("@")[0]?.trim();
  return localPart || null;
}

/** Fire-and-forget PostHog capture. Never throws. */
function capture(
  distinctId: string,
  event: string,
  properties: Record<string, unknown>,
  personProperties?: Record<string, unknown>
) {
  try {
    const organizationId = properties.organization_id;
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId,
      event,
      properties,
      ...(personProperties && { $set: personProperties }),
      ...(typeof organizationId === "string" && {
        groups: { organization: organizationId },
      }),
    });
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
    if (!key) {
      return;
    }
    const normalizedEmail = userEmail.toLowerCase().trim();
    if (!normalizedEmail) {
      return;
    }
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
    await client.track(event, {
      contactEmail,
      properties,
      ...(options?.createIfMissing && { createIfMissing: true }),
    });
  } catch (err) {
    log.error({ event, err }, "Platform event emission failed");
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

async function countVerifiedDomains(organizationId: string): Promise<number> {
  const accounts = await db
    .select({ features: awsAccount.features })
    .from(awsAccount)
    .where(eq(awsAccount.organizationId, organizationId));

  const domains = new Set<string>();
  for (const account of accounts) {
    const identities = (account.features as Record<string, unknown> | null)
      ?.email;
    if (
      typeof identities === "object" &&
      identities !== null &&
      "identities" in identities
    ) {
      const list = (identities as { identities?: unknown[] }).identities;
      if (Array.isArray(list)) {
        for (const id of list) {
          if (
            typeof id === "object" &&
            id !== null &&
            "type" in id &&
            "identity" in id &&
            (id as { type: string }).type === "DOMAIN"
          ) {
            domains.add((id as { identity: string }).identity);
          }
        }
      }
    }
  }
  return domains.size;
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
    .where(
      and(
        eq(batchSend.organizationId, organizationId),
        ne(batchSend.status, "draft")
      )
    );
  return r?.count ?? 0;
}

async function lookupTemplateName(
  organizationId: string,
  templateId: string
): Promise<string | null> {
  try {
    const [r] = await db
      .select({ name: template.name })
      .from(template)
      .where(
        and(
          eq(template.organizationId, organizationId),
          eq(template.id, templateId)
        )
      );
    return r?.name ?? null;
  } catch {
    return null;
  }
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

/**
 * Atomically claim the one-time "first email sent" activation for an org.
 * Returns true for exactly one caller per org — the winner emits
 * `activation_first_email_sent`. Shares the `activation_first_email_tracked_at`
 * flag with the API so web broadcasts, workflow sends, and SDK deliveries all
 * fire the milestone exactly once per org. Upserts the extension row.
 */
async function claimFirstEmailTracked(
  organizationId: string
): Promise<boolean> {
  // Cheap PK read first: once the org is tracked, later calls short-circuit
  // here with no write and no row lock on organization_extension.
  const [existing] = await db
    .select({ trackedAt: organizationExtension.activationFirstEmailTrackedAt })
    .from(organizationExtension)
    .where(eq(organizationExtension.organizationId, organizationId));
  if (existing?.trackedAt) {
    return false;
  }

  // First-time path: atomic claim. The `IS NULL` setWhere makes concurrent
  // first-fires safe — exactly one upsert wins.
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
      capture(userId, "activation_aws_connected", props, {
        activation_aws_connected: true,
      });
      await emit(userId, "activation.aws_connected", props);
    }
    await updateActivationScore(userId, organizationId, {
      hasConnectedAws: true,
    });
  } catch {
    // never throw from tracking
  }
}

/**
 * The contact to flag for an account: the user who connected it (who also got
 * `activation.aws_connected`), else the org owner. Not the user running the
 * scan — a teammate's scan would flag the wrong contact, and once the stored
 * sandbox flag flips nothing would ever flag the right one.
 */
async function getAccountContactEmail(
  organizationId: string,
  createdBy: string | null
): Promise<string | null> {
  if (createdBy) {
    const [creator] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, createdBy))
      .limit(1);
    if (creator?.email) {
      return creator.email;
    }
  }
  const [owner] = await db
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(eq(member.organizationId, organizationId), eq(member.role, "owner"))
    )
    .limit(1);
  return owner?.email ?? null;
}

/**
 * An AWS account seen with SES production access during a dashboard scan.
 * The hourly account-health sweep emits the same event from the API side;
 * whichever sees it first flips the stored sandbox flag, so the other stays
 * quiet. The contact property is set before the event so a workflow gating on
 * `sesProductionAccess` never reads a stale value.
 */
export async function trackProductionAccess(
  organizationId: string,
  createdBy: string | null,
  properties: { region: string; accountId: string }
) {
  try {
    const userEmail = await getAccountContactEmail(organizationId, createdBy);
    if (!userEmail) {
      return;
    }
    const props = {
      organization_id: organizationId,
      region: properties.region,
      account_id: properties.accountId,
    };
    capture(userEmail, "ses_production_access", props);
    await setContactProperties(userEmail, { sesProductionAccess: true });
    await emit(userEmail, "activation.production_access", props);
  } catch {
    // never throw from tracking
  }
}

export async function trackDomainVerified(
  userId: string,
  organizationId: string,
  properties: {
    domain: string;
  }
) {
  try {
    const props = {
      organization_id: organizationId,
      domain: properties.domain,
    };
    capture(userId, "domain_verified", props);
    await emit(userId, "domain.verified", props);

    // Count all verified domains across all AWS accounts for this org
    // to determine if this is the first domain (called AFTER the domain
    // is persisted to features JSON, so count === 1 means first)
    const isFirstDomain = (await countVerifiedDomains(organizationId)) === 1;
    if (isFirstDomain) {
      capture(userId, "activation_domain_verified", props, {
        activation_domain_verified: true,
      });
      await emit(userId, "activation.domain_verified", props);
    }
    await updateActivationScore(
      userId,
      organizationId,
      isFirstDomain ? { hasDomainVerified: true } : undefined
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
    const isFirst = await claimFirstEmailTracked(organizationId);
    if (isFirst) {
      const props = {
        organization_id: organizationId,
        channel: properties.channel,
        source: properties.source,
      };
      capture(userId, "activation_first_email_sent", props, {
        activation_first_email_sent: true,
      });
      await emit(userId, "activation.first_email_sent", props);
    }
    await updateActivationScore(
      userId,
      organizationId,
      isFirst ? { hasSentEmail: true } : undefined
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
  properties: Record<string, unknown> = {},
  contactInfo?: ContactNameInfo
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
      const contactName = deriveContactName(contactInfo);
      const firstProps: Record<string, unknown> = {
        organization_id: organizationId,
        ...(contactName && { contactName }),
      };
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
  properties: { count: number; firstContact?: ContactNameInfo }
) {
  try {
    const existing = await countContacts(organizationId);
    const props = { organization_id: organizationId, count: properties.count };
    capture(userId, "contacts_imported", props);
    await emit(userId, "contacts.imported", props);
    if (existing <= properties.count) {
      const contactName = deriveContactName(properties.firstContact);
      const firstProps: Record<string, unknown> = {
        organization_id: organizationId,
        ...(contactName && { contactName }),
      };
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
      const firstProps: Record<string, unknown> = {
        organization_id: organizationId,
        ...(typeof properties.workflowName === "string" &&
          properties.workflowName && {
            workflowName: properties.workflowName,
          }),
      };
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
      const firstProps: Record<string, unknown> = {
        organization_id: organizationId,
        ...(typeof properties.templateName === "string" &&
          properties.templateName && {
            templateName: properties.templateName,
          }),
      };
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
  properties: { channel: string; recipientCount: number; templateId?: string }
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
      const templateName = properties.templateId
        ? await lookupTemplateName(organizationId, properties.templateId)
        : null;
      const firstProps: Record<string, unknown> = {
        organization_id: organizationId,
        channel: properties.channel,
        recipientCount: String(properties.recipientCount),
        ...(templateName && { templateName }),
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

export async function trackInvitationAccepted(
  userEmail: string,
  organizationId: string,
  properties: { organizationName: string; inviterName: string; role: string }
) {
  try {
    capture(userEmail, "invitation_accepted", {
      organization_id: organizationId,
      organization_name: properties.organizationName,
      inviter_name: properties.inviterName,
      role: properties.role,
    });

    // Mark the contact as an invited member BEFORE emitting the event, so the
    // owner-centric onboarding workflows can gate it out and the member
    // onboarding workflow can read it when its trigger evaluates.
    await setContactProperties(userEmail, { accountType: "invited" });

    // camelCase keys here feed SES template substitution in member-* emails
    await emit(
      userEmail,
      "invitation.accepted",
      {
        organization_id: organizationId,
        organizationName: properties.organizationName,
        inviterName: properties.inviterName,
        role: properties.role,
      },
      { createIfMissing: true }
    );
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

    capture(
      userEmail,
      "activation_score_updated",
      { organization_id: organizationId, activation_score: score },
      { activation_score: score }
    );

    await setContactProperties(userEmail, {
      ...extraContactProps,
      activationScore: score,
    });
  } catch {
    // never throw from tracking
  }
}
