"use server";
// baseline:allow-large-file

import { GetAccountCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { auth } from "@wraps/auth";
import {
  auditLog,
  checkSegmentUsable,
  countBroadcastRecipients,
  db,
  deleteDraftBroadcast,
  duplicateBroadcast,
  findAwsAccountForOrg,
  findBroadcast,
  findBroadcastStatus,
  findBroadcastWithMeta,
  findDraftBroadcast,
  findTemplateContent,
  findTemplateForValidation,
  findTemplateVariables,
  getBroadcastSendOutcomes,
  getBroadcastSendOutcomesForBatches,
  getSampleBroadcastRecipients,
  getSampleRecipientsWithProperties,
  insertDraftBroadcast,
  listBroadcastRecipients,
  listBroadcasts,
  listPublishedTemplates,
  listSegmentsForBroadcast,
  listTopicsWithSubscriberCounts,
  MAX_RECIPIENT_EXPORT_ROWS,
  sumInFlightBroadcastRecipients,
  updateDraftBroadcast,
} from "@wraps/db";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { getVariablesForContext } from "@/components/template-editor/variables/variable-definitions";
import { trackBroadcastCreated } from "@/lib/activation-tracking";
import { auditLogEntry, getAuditContext } from "@/lib/audit";
import { getOrAssumeRole } from "@/lib/aws/credential-cache";
import type {
  BatchStatus,
  CancelBatchResult,
  Channel,
  CheckSendDurationResult,
  CheckTemplateVariableCoverageResult,
  CreateBatchInput,
  CreateBatchResult,
  CreateDraftBatchInput,
  DeleteDraftBatchResult,
  DuplicateBatchResult,
  ExtractedVariable,
  GetBatchResult,
  GetSampleContactsResult,
  ListBatchesResult,
  PromoteDraftBatchResult,
  RecipientFilter,
  ResumeBatchResult,
  SampleContact,
  SaveDraftBatchResult,
  UpdateDraftBatchInput,
  UpdateDraftBatchResult,
  VariableMapping,
} from "@/lib/batch";
import {
  extractHandlebarsVariables,
  HANDLEBARS_KEYWORDS,
} from "@/lib/handlebars";
import { createActionLogger } from "@/lib/logger";
import { checkFeatureAccess } from "@/lib/plan-limits";
import { orgAction } from "./shared/org-action";
import { publishTemplateToSES } from "./templates";

// UUID validation schema for input sanitization
const uuidSchema = z.string().uuid();

// Re-export types for convenience
export type {
  AudienceType,
  BatchSendWithMeta,
  CancelBatchResult,
  CheckTemplateVariableCoverageResult,
  ContentType,
  CreateBatchResult,
  GetBatchResult,
  ListBatchesResult,
  RecipientFilter,
  VariableMapping,
} from "@/lib/batch";

/**
 * List batch sends for an organization
 */
export const listBatchSends = orgAction(
  {
    name: "listBatchSends",
    resource: "broadcasts",
    permission: ["read"],
    orgId: (
      organizationId: string,
      _options: {
        page?: number;
        pageSize?: number;
        status?: BatchStatus;
        channel?: Channel;
        search?: string;
      } = {}
    ) => organizationId,
    onError: "Failed to fetch batch sends",
  },
  async (
    ctx,
    organizationId: string,
    options: {
      page?: number;
      pageSize?: number;
      status?: BatchStatus;
      channel?: Channel;
      search?: string;
    } = {}
  ): Promise<ListBatchesResult> => {
    const { batches, total } = await listBroadcasts(organizationId, options);

    // Same reconciled source as the detail page (loadBatchWithMeta): the list
    // used to render the raw batch_send counters, so one broadcast showed two
    // different sent/failed figures depending on which page you were on.
    // Broadcasts with no per-message rows are absent from the map and fall
    // back to the counters, exactly as the single-batch path does.
    const outcomesByBatch = await getBroadcastSendOutcomesForBatches(
      batches.map((b) => b.id),
      organizationId
    );

    return {
      success: true,
      batches: batches.map((b) => {
        const outcomes = outcomesByBatch.get(b.id);
        const hasPerMessageRows = (outcomes?.total ?? 0) > 0;
        return {
          id: b.id,
          name: b.name,
          channel: b.channel as Channel,
          status: b.status as BatchStatus,
          subject: b.subject,
          previewText: b.previewText,
          from: b.from,
          fromName: b.fromName,
          replyTo: b.replyTo,
          templateId: b.emailTemplateId,
          templateName: b.emailTemplate?.name,
          totalRecipients: b.totalRecipients,
          processedRecipients: b.processedRecipients,
          sent: hasPerMessageRows && outcomes ? outcomes.accepted : b.sent,
          delivered: b.delivered,
          failed: hasPerMessageRows && outcomes ? outcomes.failed : b.failed,
          opened: b.opened,
          clicked: b.clicked,
          bounced: b.bounced,
          complained: b.complained,
          errorMessage: b.errorMessage,
          pausedReason: b.pausedReason,
          lastChunkAt: b.lastChunkAt,
          scheduledFor: b.scheduledFor,
          startedAt: b.startedAt,
          completedAt: b.completedAt,
          createdAt: b.createdAt,
          createdBy: b.createdByUser,
          awsAccount: b.awsAccount,
        };
      }),
      total,
    };
  }
);

/**
 * Get a single batch send by ID
 */
export const getBatchSend = orgAction(
  {
    name: "getBatchSend",
    resource: "broadcasts",
    permission: ["read"],
    orgId: (_batchId: string, organizationId: string) => organizationId,
    onError: "Failed to fetch batch send",
  },
  async (
    ctx,
    batchId: string,
    organizationId: string
  ): Promise<GetBatchResult> => {
    // Validate UUID format before any database operations
    if (!uuidSchema.safeParse(batchId).success) {
      return {
        success: false,
        error: "Invalid batch ID",
        errorCode: "NOT_FOUND",
      };
    }
    if (!uuidSchema.safeParse(organizationId).success) {
      return { success: false, error: "Invalid organization ID" };
    }

    return loadBatchWithMeta(batchId, organizationId);
  }
);

// =============================================================================
// TEMPLATE VARIABLE COVERAGE
// =============================================================================

/**
 * Identifies "risky" template variables — custom variables with no fallback
 * and no static mapping — then checks a sample of contacts to see how many
 * are missing them. Returns coverage stats without performing auth checks
 * (callers are responsible for auth).
 */
type CoverageResult = {
  allFail: boolean;
  missingCount: number;
  totalSampled: number;
  totalRecipients: number;
  missingVariables: string[];
};

type SourceVar = { name: string; fallback?: string | null };

const EMPTY_COVERAGE: CoverageResult = {
  allFail: false,
  missingCount: 0,
  totalSampled: 0,
  totalRecipients: 0,
  missingVariables: [],
};

async function assessVariableCoverage(
  organizationId: string,
  templateId: string,
  recipientFilter: RecipientFilter | undefined,
  variableMappings: VariableMapping[] | undefined
): Promise<CoverageResult> {
  const templateData = await findTemplateVariables(templateId, organizationId);
  if (!templateData) return EMPTY_COVERAGE;

  const storedVars = (templateData.variables ?? []) as SourceVar[];
  const seen = new Set(storedVars.map((v) => v.name));
  const allVars: SourceVar[] = [...storedVars];
  // Subject-line variables aren't stored in templateData.variables (which is
  // extracted from body HTML only), so parse them separately.
  if (templateData.subject) {
    for (const v of extractHandlebarsVariables(templateData.subject)) {
      if (!seen.has(v.name)) {
        seen.add(v.name);
        allVars.push(v);
      }
    }
  }

  return assessCoverageForVariables(
    organizationId,
    allVars,
    recipientFilter,
    variableMappings
  );
}

/**
 * Same coverage check for hand-authored HTML. Custom-HTML broadcasts had no
 * variable check on either the client or the server, so the exact `{{...}}`
 * failure mode that failed 1200/1200 sends in July 2026 was unguarded on this
 * path while the template path blocked it.
 */
async function assessHtmlVariableCoverage(
  organizationId: string,
  htmlContent: string,
  subject: string | undefined,
  recipientFilter: RecipientFilter | undefined,
  variableMappings: VariableMapping[] | undefined
): Promise<CoverageResult> {
  const seen = new Set<string>();
  const allVars: SourceVar[] = [];
  for (const source of [htmlContent, subject ?? ""]) {
    for (const v of extractHandlebarsVariables(source)) {
      if (!seen.has(v.name)) {
        seen.add(v.name);
        allVars.push(v);
      }
    }
  }

  return assessCoverageForVariables(
    organizationId,
    allVars,
    recipientFilter,
    variableMappings
  );
}

/**
 * Shared core: given the variables a message references, work out how many
 * sampled contacts would fail to resolve at least one of them. Performs no
 * auth — callers are responsible.
 */
async function assessCoverageForVariables(
  organizationId: string,
  allVars: SourceVar[],
  recipientFilter: RecipientFilter | undefined,
  variableMappings: VariableMapping[] | undefined
): Promise<CoverageResult> {
  const EMPTY = EMPTY_COVERAGE;

  // A variable with a non-empty static value is satisfied for every contact.
  const staticMappedVars = new Set(
    (variableMappings ?? [])
      .filter((m) => m.source.type === "static" && m.source.value.trim() !== "")
      .map((m) => m.variableName)
  );

  // A variable mapped to a contact field resolves from that column, not from
  // a same-named custom property, so it has to be checked against the column.
  const contactFieldMappedVars = new Map(
    (variableMappings ?? [])
      .filter((m) => m.source.type === "contact" && m.source.field)
      .map((m) => [
        m.variableName,
        (m.source as { type: "contact"; field: string }).field,
      ])
  );

  // Names the batch sender always provides from contact columns (not properties)
  const BATCH_SENDER_SHORT_NAMES = new Set([
    "firstName",
    "lastName",
    "company",
    "jobTitle",
    "email",
    "contactFirstName",
    "contactLastName",
    "contactCompany",
    "contactJobTitle",
    "contactEmail",
    "organizationName",
    "unsubscribeUrl",
    "preferencesUrl",
    "confirmationUrl",
  ]);

  const knownVariableNames = new Set(
    getVariablesForContext("broadcast").map((v) => v.name)
  );

  const riskyVars: string[] = [];
  for (const v of allVars) {
    if (HANDLEBARS_KEYWORDS.has(v.name)) continue;
    if (v.fallback) continue;
    if (staticMappedVars.has(v.name)) continue;
    if (BATCH_SENDER_SHORT_NAMES.has(v.name)) continue;
    if (knownVariableNames.has(v.name)) continue;
    if (knownVariableNames.has(`contact.${v.name}`)) continue;
    if (v.name.startsWith("contact.")) continue;
    if (v.name.startsWith("organization.")) continue;
    riskyVars.push(v.name);
  }

  if (riskyVars.length === 0) return EMPTY;

  const { contacts, totalCount } = await getSampleRecipientsWithProperties(
    organizationId,
    "email",
    recipientFilter
      ? {
          audienceType: recipientFilter.audienceType,
          topicId: recipientFilter.topicId,
          segmentId: recipientFilter.segmentId,
        }
      : undefined
  );

  if (contacts.length === 0) {
    return {
      ...EMPTY,
      totalRecipients: totalCount,
      missingVariables: riskyVars,
    };
  }

  // Mirrors resolveContactField in apps/api/src/workers/variable-mappings.ts —
  // the preflight must agree with what the sender actually resolves.
  const PROPERTY_PREFIX = "properties.";
  const resolveMappedField = (
    c: (typeof contacts)[number],
    field: string
  ): unknown => {
    if (field.startsWith(PROPERTY_PREFIX)) {
      return c.properties?.[field.slice(PROPERTY_PREFIX.length)];
    }
    switch (field) {
      case "firstName":
        return c.firstName;
      case "lastName":
        return c.lastName;
      case "email":
        return c.email;
      case "company":
        return c.company;
      case "jobTitle":
        return c.jobTitle;
      default:
        return;
    }
  };

  const missingContacts = contacts.filter((c) => {
    const props = c.properties ?? {};
    return riskyVars.some((varName) => {
      const field = contactFieldMappedVars.get(varName);
      const val = field ? resolveMappedField(c, field) : props[varName];
      return val == null || val === "";
    });
  });

  return {
    allFail: missingContacts.length === contacts.length,
    missingCount: missingContacts.length,
    totalSampled: contacts.length,
    totalRecipients: totalCount,
    missingVariables: riskyVars,
  };
}

/**
 * Resolves SES send-quota headroom for an org's AWS account and derives the
 * broadcast warnings from it. Fails open: any AssumeRole/SES/permission
 * failure returns `{ available: false }` and callers proceed without a
 * warning, which is the behavior the send preflight has always had.
 *
 * Single source of truth for quota-derived warnings — both the send
 * preflight (validateAndPrepareSend) and the pre-confirmation duration
 * estimate (checkBroadcastSendDuration) call this rather than re-deriving
 * the math, so they cannot start disagreeing.
 *
 * Performs no auth — callers are responsible (matches assessVariableCoverage).
 */
async function assessQuotaHeadroom(params: {
  organizationId: string;
  awsAccountRow: {
    id: string;
    roleArn: string;
    externalId: string;
    region: string;
    dailyQuotaReserve: number | null;
  };
  channel: string;
  recipientCount: number;
  scheduled: boolean;
}): Promise<
  | { available: false }
  | {
      available: true;
      max24HourSend: number;
      sentLast24Hours: number;
      reserve: number;
      dailyCapacity: number;
      /**
       * `false` means the account is in the SES sandbox: SES accepts mail only
       * to verified addresses, and the 200/day sandbox quota is what makes the
       * multi-day estimate enormous. Without this the preflight reported
       * "~100 days" for a cause it could not name.
       */
      productionAccessEnabled: boolean;
      /**
       * Non-null only when the audience, plus recipients still unsent on
       * other in-flight broadcasts on this AWS account, exceeds a full day's
       * capacity.
       */
      estimatedDays: number | null;
      /** The blocking error, when dailyCapacity <= 0. */
      blockError: string | null;
      /** The warning string, identical to what the send preflight emits today. */
      quotaWarning: string | undefined;
      /** Other queued/processing email broadcasts on this AWS account. */
      inFlightBatches: number;
      /** Their combined unsent remainder — the quota this send has to share. */
      inFlightRecipients: number;
    }
> {
  const { organizationId, awsAccountRow, channel, recipientCount, scheduled } =
    params;
  const reserve = awsAccountRow.dailyQuotaReserve ?? 0;

  // SES daily quota is an email-specific concern — SMS has no bearing on it.
  // Gated here (not just at each call site) so both callers can't disagree.
  if (channel === "sms") {
    return { available: false };
  }

  try {
    const credentials = await getOrAssumeRole({
      roleArn: awsAccountRow.roleArn,
      externalId: awsAccountRow.externalId,
      region: awsAccountRow.region,
    });
    const sesClient = new SESv2Client({
      region: awsAccountRow.region,
      credentials,
    });
    const accountInfo = await sesClient.send(new GetAccountCommand({}));
    const max24HourSend = accountInfo.SendQuota?.Max24HourSend;
    const sentLast24Hours = accountInfo.SendQuota?.SentLast24Hours;
    // Absent means AWS did not say. Treating silence as "in the sandbox" would
    // put a scary warning on accounts that are fine, so default to enabled.
    const productionAccessEnabled =
      accountInfo.ProductionAccessEnabled !== false;

    if (
      !(
        typeof max24HourSend === "number" &&
        max24HourSend > 0 && // -1 = unlimited quota; skip
        typeof sentLast24Hours === "number"
      )
    ) {
      return { available: false };
    }

    const dailyCapacity = max24HourSend - reserve;
    if (dailyCapacity <= 0) {
      return {
        available: true,
        max24HourSend,
        sentLast24Hours,
        reserve,
        dailyCapacity,
        productionAccessEnabled,
        estimatedDays: null,
        blockError: `Broadcast blocked: the transactional reserve (${reserve.toLocaleString()}) is at or above this account's daily SES quota (${max24HourSend.toLocaleString()}), so no broadcast can ever send. Lower the reserve in AWS account settings.`,
        quotaWarning: undefined,
        inFlightBatches: 0,
        inFlightRecipients: 0,
      };
    }

    let inFlight = { batches: 0, remainingRecipients: 0 };
    try {
      inFlight = await sumInFlightBroadcastRecipients(
        organizationId,
        awsAccountRow.id
      );
    } catch (error) {
      // Degrade to "nothing else in flight" rather than dropping the whole
      // quota warning — a stale-optimistic estimate beats no estimate.
      const log = createActionLogger("assessQuotaHeadroom", {
        organizationId,
      });
      log.warn(
        { err: error },
        "Could not sum in-flight broadcasts, assuming none"
      );
    }

    const contendedCount = recipientCount + inFlight.remainingRecipients;

    let estimatedDays: number | null = null;
    let quotaWarning: string | undefined;
    if (contendedCount > dailyCapacity) {
      estimatedDays = Math.ceil(contendedCount / dailyCapacity);
      // If the audience alone already exceeds dailyCapacity, "recipients is
      // more than this account can send" is true as written — leave it
      // alone. But when contention is what tips contendedCount over (the
      // audience alone still fits), that leading clause would otherwise
      // claim recipientCount exceeds a capacity figure printed two clauses
      // later that recipientCount does NOT exceed — the exact
      // self-contradicting-arithmetic failure rule 5b exists to prevent, just
      // on the other branch. Name the combined figure instead.
      const tippedByContention =
        recipientCount <= dailyCapacity && inFlight.remainingRecipients > 0;
      const leadingSubject = tippedByContention
        ? `${recipientCount.toLocaleString()} recipients, plus ${inFlight.remainingRecipients.toLocaleString()} already queued on this AWS account,`
        : `${recipientCount.toLocaleString()} recipients`;
      quotaWarning =
        `${leadingSubject} is more than this account ` +
        `can send in 24h (daily quota ${max24HourSend.toLocaleString()}` +
        (reserve
          ? `, ${reserve.toLocaleString()} reserved for transactional → ` +
            `${dailyCapacity.toLocaleString()}/day for broadcasts`
          : "") +
        "). Sending pauses and resumes automatically and should finish in about " +
        `${estimatedDays} day${estimatedDays === 1 ? "" : "s"}. You can cancel any time from the ` +
        "broadcast page." +
        (inFlight.batches > 0
          ? tippedByContention
            ? ` ${inFlight.batches} other broadcast${inFlight.batches === 1 ? "" : "s"} on this AWS account ` +
              `share${inFlight.batches === 1 ? "s" : ""} the same daily quota with this one.`
            : ` ${inFlight.batches} other broadcast${inFlight.batches === 1 ? "" : "s"} on this AWS account ` +
              `${inFlight.batches === 1 ? "still has" : "still have"} ${inFlight.remainingRecipients.toLocaleString()} recipients to send; ` +
              `this broadcast shares the same daily quota with ${inFlight.batches === 1 ? "it" : "them"}.`
          : "");
    } else {
      // Current usage says nothing about usage at a future send time, so a
      // "right now" warning would be misleading on a scheduled broadcast.
      const headroom =
        max24HourSend -
        sentLast24Hours -
        reserve -
        inFlight.remainingRecipients;
      if (!scheduled && recipientCount > headroom) {
        const sendableNow = Math.max(0, headroom);
        quotaWarning =
          `Only ${sendableNow.toLocaleString()} of ${recipientCount.toLocaleString()} emails can send right now (daily quota ${max24HourSend.toLocaleString()} − ${sentLast24Hours.toLocaleString()} sent in the last 24h − ${reserve.toLocaleString()} reserved for transactional` +
          (inFlight.remainingRecipients > 0
            ? ` − ${inFlight.remainingRecipients.toLocaleString()} queued in other broadcasts`
            : "") +
          "). Sending pauses and resumes automatically as quota frees up." +
          (inFlight.batches > 0
            ? ` ${inFlight.batches} other broadcast${inFlight.batches === 1 ? "" : "s"} on this AWS account ` +
              `${inFlight.batches === 1 ? "still has" : "still have"} ${inFlight.remainingRecipients.toLocaleString()} recipients to send; ` +
              `this broadcast shares the same daily quota with ${inFlight.batches === 1 ? "it" : "them"}.`
            : "");
      }
    }

    return {
      available: true,
      max24HourSend,
      sentLast24Hours,
      reserve,
      dailyCapacity,
      productionAccessEnabled,
      estimatedDays,
      blockError: null,
      quotaWarning,
      inFlightBatches: inFlight.batches,
      inFlightRecipients: inFlight.remainingRecipients,
    };
  } catch (error) {
    const log = createActionLogger("assessQuotaHeadroom", { organizationId });
    log.warn(
      { err: error },
      "Could not check daily quota reserve headroom, proceeding"
    );
    return { available: false };
  }
}

/**
 * Pre-flight check: assess whether template custom variables can be resolved
 * for the selected audience. Returned data drives a warning banner in the
 * broadcast form (review step) before the user clicks Send.
 */
export const checkTemplateVariableCoverage = orgAction(
  {
    name: "checkTemplateVariableCoverage",
    resource: "broadcasts",
    permission: ["read"],
    orgId: (
      organizationId: string,
      _templateId: string,
      _recipientFilter: RecipientFilter,
      _variableMappings?: VariableMapping[]
    ) => organizationId,
    onError: "Failed to check template variable coverage",
  },
  async (
    ctx,
    organizationId: string,
    templateId: string,
    recipientFilter: RecipientFilter,
    variableMappings?: VariableMapping[]
  ): Promise<CheckTemplateVariableCoverageResult> => {
    const coverage = await assessVariableCoverage(
      organizationId,
      templateId,
      recipientFilter,
      variableMappings
    );

    return { success: true, ...coverage };
  }
);

/**
 * Pre-flight check for hand-authored HTML, mirroring
 * checkTemplateVariableCoverage. The review step had no coverage warning at all
 * on the custom-HTML path, so the same `{{...}}` failure the template path
 * warns about arrived only as a rejected send.
 */
export const checkHtmlVariableCoverage = orgAction(
  {
    name: "checkHtmlVariableCoverage",
    resource: "broadcasts",
    permission: ["read"],
    orgId: (
      organizationId: string,
      _htmlContent: string,
      _subject: string | undefined,
      _recipientFilter: RecipientFilter,
      _variableMappings?: VariableMapping[]
    ) => organizationId,
    onError: "Failed to check variable coverage",
  },
  async (
    ctx,
    organizationId: string,
    htmlContent: string,
    subject: string | undefined,
    recipientFilter: RecipientFilter,
    variableMappings?: VariableMapping[]
  ): Promise<CheckTemplateVariableCoverageResult> => {
    const coverage = await assessHtmlVariableCoverage(
      organizationId,
      htmlContent,
      subject,
      recipientFilter,
      variableMappings
    );

    return { success: true, ...coverage };
  }
);

/**
 * Pre-confirmation check: estimate how many calendar days a broadcast will
 * take to drain against the account's SES daily quota, so the user learns
 * this BEFORE confirming the send rather than from a toast afterwards.
 * Read-only — never blocks or permits a send; that stays in
 * validateAndPrepareSend. Degrades to `available: false` on any failure to
 * read quota, which the caller renders as "no estimate", never as an error.
 */
export const checkBroadcastSendDuration = orgAction(
  {
    name: "checkBroadcastSendDuration",
    resource: "broadcasts",
    permission: ["read"],
    orgId: (
      organizationId: string,
      _awsAccountId: string,
      _channel: string,
      _recipientCount: number,
      _scheduled: boolean
    ) => organizationId,
    onError: "Failed to estimate send duration",
  },
  async (
    ctx,
    organizationId: string,
    awsAccountId: string,
    channel: string,
    recipientCount: number,
    scheduled: boolean
  ): Promise<CheckSendDurationResult> => {
    // Scoped by (awsAccountId, organizationId) — this is the only thing
    // preventing a caller-supplied awsAccountId from disclosing another
    // tenant's quota.
    const awsAccountRow = await findAwsAccountForOrg(
      awsAccountId,
      organizationId
    );
    if (!awsAccountRow) {
      return { success: true, available: false };
    }

    const headroom = await assessQuotaHeadroom({
      organizationId,
      awsAccountRow: {
        id: awsAccountRow.id,
        roleArn: awsAccountRow.roleArn,
        externalId: awsAccountRow.externalId,
        region: awsAccountRow.region,
        dailyQuotaReserve: awsAccountRow.dailyQuotaReserve,
      },
      channel,
      recipientCount,
      scheduled,
    });

    if (!headroom.available) {
      return { success: true, available: false };
    }

    return {
      success: true,
      available: true,
      estimatedDays: headroom.estimatedDays,
      dailyCapacity: headroom.dailyCapacity,
      productionAccessEnabled: headroom.productionAccessEnabled,
      inFlightBatches: headroom.inFlightBatches,
      inFlightRecipients: headroom.inFlightRecipients,
    };
  }
);

/**
 * Shared pre-send validation.
 *
 * Runs all the checks + side effects that both direct-send (createBatchSend)
 * and promote-from-draft (promoteDraftToSend) must perform:
 * - plan feature access ("batch", plus "campaigns" if scheduled)
 * - AWS account ownership
 * - template existence + auto-publish to SES if needed
 * - eligible recipient count (real-time, audience drift safe)
 *
 * Returns a discriminated union so callers can destructure without casts.
 */
type PrepareSendData = {
  awsAccountId: string;
  channel?: Channel;
  templateId?: string;
  /** Hand-authored HTML. Checked for variable coverage exactly like a template. */
  htmlContent?: string;
  subject?: string;
  recipientFilter?: RecipientFilter;
  scheduledFor?: Date;
  variableMappings?: VariableMapping[];
};

type PrepareSendResult =
  | {
      ok: true;
      recipientCount: number;
      quotaWarning?: string;
      /** Set when the account has no SES production access. Never blocks. */
      sandboxWarning?: string;
    }
  | { ok: false; error: string };

async function validateAndPrepareSend(
  organizationId: string,
  data: PrepareSendData
): Promise<PrepareSendResult> {
  const featureCheck = await checkFeatureAccess(organizationId, "batch");
  if (!featureCheck.allowed) {
    return {
      ok: false,
      error:
        featureCheck.message ?? "Batch sending is not available on your plan.",
    };
  }

  if (data.scheduledFor) {
    const schedulingCheck = await checkFeatureAccess(
      organizationId,
      "campaigns"
    );
    if (!schedulingCheck.allowed) {
      return {
        ok: false,
        error:
          schedulingCheck.message ??
          "Scheduling broadcasts requires a paid plan.",
      };
    }
  }

  const awsAccountRow = await findAwsAccountForOrg(
    data.awsAccountId,
    organizationId
  );

  if (!awsAccountRow) {
    return { ok: false, error: "AWS account not found" };
  }

  if (data.templateId) {
    const tmpl = await findTemplateForValidation(
      data.templateId,
      organizationId
    );

    if (!tmpl) {
      return { ok: false, error: "Template not found" };
    }

    const needsPublish =
      !tmpl.sesTemplateName ||
      (tmpl.updatedAt &&
        (!tmpl.publishedAt || tmpl.updatedAt > tmpl.publishedAt));

    if (needsPublish) {
      const publishResult = await publishTemplateToSES(
        data.templateId,
        organizationId
      );

      if (!publishResult.success) {
        return {
          ok: false,
          error: `Failed to publish template: ${publishResult.error}`,
        };
      }
    }
  }

  const recipientCount = await countBroadcastRecipients(
    organizationId,
    data.channel ?? "email",
    data.recipientFilter
      ? {
          audienceType: data.recipientFilter.audienceType,
          topicId: data.recipientFilter.topicId,
          segmentId: data.recipientFilter.segmentId,
        }
      : undefined
  );

  if (recipientCount === 0) {
    // Recipient counting fails closed on an unusable segment, so a zero count
    // here can mean "segment is broken" rather than "audience is empty".
    if (
      data.recipientFilter?.audienceType === "segment" &&
      data.recipientFilter.segmentId
    ) {
      const usability = await checkSegmentUsable(
        organizationId,
        data.recipientFilter.segmentId
      );
      if (usability === "missing") {
        return {
          ok: false,
          error:
            "The selected segment no longer exists. Pick another audience.",
        };
      }
      if (usability === "no-valid-filters") {
        return {
          ok: false,
          error:
            "The selected segment has no valid filters, so it matches no contacts. Open the segment and check its filters.",
        };
      }
    }

    return {
      ok: false,
      error:
        data.channel === "sms"
          ? "No contacts with SMS consent found"
          : "No active email contacts found",
    };
  }

  // Daily quota reserve preflight. The send worker already pauses and
  // re-enqueues any chunk that would eat into the transactional reserve, so a
  // broadcast bigger than a single day's capacity is not a problem — it
  // drains across days as the rolling 24h window frees up. Only block sends
  // that can NEVER drain: a reserve at or above the whole daily quota.
  // Anything that merely takes multiple days returns a warning instead.
  // Best-effort — any AssumeRole/SES failure fails open.
  // Runs regardless of whether a reserve is set: with reserve 0 the whole daily
  // quota is the broadcast budget, and an audience that exceeds it still needs
  // the multi-day warning. Previously gating this on a nonzero reserve made
  // the reserve a cliff — only zero disabled the block, and zero also removed
  // the protection.
  let quotaWarning: string | undefined;
  let sandboxWarning: string | undefined;
  if (data.channel !== "sms") {
    const headroom = await assessQuotaHeadroom({
      organizationId,
      awsAccountRow: {
        id: awsAccountRow.id,
        roleArn: awsAccountRow.roleArn,
        externalId: awsAccountRow.externalId,
        region: awsAccountRow.region,
        dailyQuotaReserve: awsAccountRow.dailyQuotaReserve,
      },
      channel: data.channel ?? "email",
      recipientCount,
      scheduled: Boolean(data.scheduledFor),
    });
    if (headroom.available) {
      if (headroom.blockError) {
        return { ok: false, error: headroom.blockError };
      }
      quotaWarning = headroom.quotaWarning;
      // The sandbox is not a reason to block — sending to verified addresses
      // works, and that first send is how people learn the product. It IS the
      // reason a multi-day estimate exists, so it has to be named alongside it
      // rather than leaving the day count to speak for a cause it can't state.
      if (!headroom.productionAccessEnabled) {
        sandboxWarning = `This AWS account is still in the SES sandbox, so SES will reject every recipient that is not a verified address, and the daily quota is ${headroom.max24HourSend.toLocaleString()}. Request production access in the SES console to send to your full list.`;
      }
    }
  }

  // Block sends where every contact would fail rendering due to missing custom
  // variables that have no fallback and no static mapping. Custom HTML goes
  // through the same gate as a template — it used to go through none at all.
  if (data.channel !== "sms") {
    let coverage: CoverageResult | null = null;
    if (data.templateId) {
      coverage = await assessVariableCoverage(
        organizationId,
        data.templateId,
        data.recipientFilter,
        data.variableMappings
      );
    } else if (data.htmlContent) {
      coverage = await assessHtmlVariableCoverage(
        organizationId,
        data.htmlContent,
        data.subject,
        data.recipientFilter,
        data.variableMappings
      );
    }
    if (coverage?.allFail && coverage.missingVariables.length > 0) {
      const source = data.templateId ? "the template" : "your HTML";
      return {
        ok: false,
        error: `All contacts are missing required variables: ${coverage.missingVariables.join(", ")}. Set a value under Template Variables, add these attributes to your contacts, or set a fallback in ${source}.`,
      };
    }
  }

  return { ok: true, recipientCount, quotaWarning, sandboxWarning };
}

/** Both post-send warnings ride the single `warning` field. Joined rather than
 *  dropped: an account that is both in the sandbox and over its daily quota has
 *  two separate things wrong with it. */
function joinSendWarnings(
  ...parts: Array<string | undefined>
): string | undefined {
  const present = parts.filter((p): p is string => Boolean(p));
  return present.length > 0 ? present.join(" ") : undefined;
}

/**
 * Create a new batch send by calling the API (direct-send path).
 */
export const createBatchSend = orgAction(
  {
    name: "createBatchSend",
    resource: "broadcasts",
    permission: ["send"],
    orgId: (organizationId: string, _data: CreateBatchInput) => organizationId,
    onError: "Failed to create batch send",
  },
  async (
    ctx,
    organizationId: string,
    data: CreateBatchInput
  ): Promise<CreateBatchResult> => {
    const prep = await validateAndPrepareSend(organizationId, {
      awsAccountId: data.awsAccountId,
      channel: data.channel,
      templateId: data.templateId,
      htmlContent: data.htmlContent,
      subject: data.subject,
      recipientFilter: data.recipientFilter,
      scheduledFor: data.scheduledFor,
      variableMappings: data.variableMappings,
    });

    if (!prep.ok) {
      return { success: false, error: prep.error };
    }

    const { recipientCount } = prep;

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return { success: false, error: "Session not found" };
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      return { success: false, error: "API URL not configured" };
    }

    const response = await fetch(`${apiUrl}/v1/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session.token}`,
        "X-Organization-Id": organizationId,
      },
      body: JSON.stringify({
        channel: data.channel ?? "email",
        name: data.name ?? `Broadcast ${new Date().toLocaleDateString()}`,
        audienceType: data.recipientFilter?.audienceType ?? "all",
        topicId: data.recipientFilter?.topicId,
        segmentId: data.recipientFilter?.segmentId,
        subject: data.subject,
        previewText: data.previewText,
        from: data.from,
        fromName: data.fromName,
        replyTo: data.replyTo,
        templateId: data.templateId,
        htmlContent: data.htmlContent,
        variableMappings: data.variableMappings,
        body: data.body,
        senderId: data.senderId,
        scheduledFor: data.scheduledFor?.toISOString(),
        awsAccountId: data.awsAccountId,
        totalRecipients: recipientCount,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const log = createActionLogger("createBatchSend", { organizationId });
      try {
        const errorData = JSON.parse(errorText) as {
          error?: string;
          debug?: unknown;
        };
        // The debug payload goes to the log, not into a toast. Concatenating it
        // into the message produced an unreadable JSON blob at the worst moment
        // in the flow.
        log.error(
          { status: response.status, debug: errorData.debug },
          "Batch create rejected by API"
        );
        return {
          success: false,
          error: errorData.error || "The broadcast could not be created.",
        };
      } catch {
        log.error(
          { status: response.status, body: errorText.slice(0, 500) },
          "Batch create rejected by API with a non-JSON body"
        );
        return {
          success: false,
          error:
            errorText.slice(0, 300) || "The broadcast could not be created.",
        };
      }
    }

    const result = (await response.json()) as {
      id: string;
      warning?: string;
    };

    revalidatePath(`/${ctx.access.orgSlug}/emails/broadcasts`, "page");

    const auditCtx = await getAuditContext();
    after(() =>
      db
        .insert(auditLog)
        .values(
          auditLogEntry(auditCtx, {
            organizationId,
            actorId: ctx.access.userId,
            actorEmail: ctx.access.userEmail,
            action: "broadcast.sent",
            resource: "broadcast",
            resourceId: result.id,
            metadata: {
              broadcastId: result.id,
              channel: data.channel ?? "email",
              recipientCount,
            },
          })
        )
        .catch((err) =>
          createActionLogger("createBatchSend", {
            orgSlug: organizationId,
          }).warn({ err }, "Best-effort audit log write failed")
        )
    );

    await trackBroadcastCreated(ctx.access.userEmail, organizationId, {
      channel: data.channel ?? "email",
      recipientCount,
      templateId: data.templateId,
    });

    const created = await getBatchSend(result.id, organizationId);
    const warning = joinSendWarnings(
      result.warning,
      prep.sandboxWarning,
      prep.quotaWarning
    );
    return created.success && warning ? { ...created, warning } : created;
  }
);

/**
 * Save a broadcast as a draft.
 */
export const saveDraftBatchSend = orgAction(
  {
    name: "saveDraftBatchSend",
    resource: "broadcasts",
    permission: ["write"],
    orgId: (organizationId: string, _data: CreateDraftBatchInput) =>
      organizationId,
    onError: "Failed to save draft",
  },
  async (
    ctx,
    organizationId: string,
    data: CreateDraftBatchInput
  ): Promise<SaveDraftBatchResult> => {
    const featureCheck = await checkFeatureAccess(organizationId, "batch");
    if (!featureCheck.allowed) {
      return {
        success: false,
        error:
          featureCheck.message ??
          "Batch sending is not available on your plan.",
      };
    }

    const newBatch = await ctx.audited(
      async (tx) => {
        const inserted = await insertDraftBroadcast(
          {
            organizationId,
            status: "draft",
            channel: data.channel ?? "email",
            name: data.name ?? null,
            subject: data.subject ?? null,
            previewText: data.previewText ?? null,
            from: data.from ?? null,
            fromName: data.fromName ?? null,
            replyTo: data.replyTo ?? null,
            emailTemplateId: data.templateId ?? null,
            htmlContent: data.htmlContent ?? null,
            variableMappings: data.variableMappings ?? null,
            body: data.body ?? null,
            senderId: data.senderId ?? null,
            audienceType: data.recipientFilter?.audienceType ?? "all",
            topicId: data.recipientFilter?.topicId ?? null,
            segmentId: data.recipientFilter?.segmentId ?? null,
            awsAccountId: data.awsAccountId ?? null,
            scheduledFor: data.scheduledFor ?? null,
            createdBy: ctx.access.userId,
          },
          tx
        );
        if (!inserted) throw new Error("Broadcast insert returned null");
        return inserted;
      },
      (inserted) => ({
        action: "broadcast.draft_saved" as const,
        resource: "broadcast",
        resourceId: inserted.id,
        metadata: {
          broadcastId: inserted.id,
          channel: data.channel ?? "email",
        },
      })
    );

    revalidatePath(`/${ctx.access.orgSlug}/emails/broadcasts`, "page");

    return loadBatchWithMeta(newBatch.id, organizationId);
  }
);

/**
 * Internal helper: load a batch by (id, orgId) shaped as BatchSendWithMeta.
 */
async function loadBatchWithMeta(
  batchId: string,
  organizationId: string
): Promise<GetBatchResult> {
  // sent/failed come from message_send row statuses, not the batch counters:
  // rows self-heal as SES events arrive, counters don't. Broadcasts that
  // predate per-message rows (total === 0) fall back to the counters.
  const [b, outcomes] = await Promise.all([
    findBroadcastWithMeta(batchId, organizationId),
    getBroadcastSendOutcomes(batchId, organizationId),
  ]);

  if (!b) {
    return {
      success: false,
      error: "Batch send not found",
      errorCode: "NOT_FOUND",
    };
  }

  const hasPerMessageRows = outcomes.total > 0;

  return {
    success: true,
    batch: {
      id: b.id,
      name: b.name,
      channel: b.channel as Channel,
      status: b.status as BatchStatus,
      subject: b.subject,
      previewText: b.previewText,
      from: b.from,
      fromName: b.fromName,
      replyTo: b.replyTo,
      templateId: b.emailTemplateId,
      templateName: b.emailTemplate?.name,
      htmlContent: b.htmlContent,
      variableMappings: b.variableMappings,
      audienceType: b.audienceType,
      topicId: b.topicId,
      segmentId: b.segmentId,
      totalRecipients: b.totalRecipients,
      processedRecipients: b.processedRecipients,
      sent: hasPerMessageRows ? outcomes.accepted : b.sent,
      delivered: b.delivered,
      failed: hasPerMessageRows ? outcomes.failed : b.failed,
      opened: b.opened,
      clicked: b.clicked,
      bounced: b.bounced,
      complained: b.complained,
      errorMessage: b.errorMessage,
      pausedReason: b.pausedReason,
      lastChunkAt: b.lastChunkAt,
      scheduledFor: b.scheduledFor,
      startedAt: b.startedAt,
      completedAt: b.completedAt,
      createdAt: b.createdAt,
      createdBy: b.createdByUser,
      awsAccount: b.awsAccount,
    },
  };
}

/**
 * Update an existing draft broadcast. Fails if the row is not a draft.
 */
export const updateDraftBatchSend = orgAction(
  {
    name: "updateDraftBatchSend",
    resource: "broadcasts",
    permission: ["write"],
    orgId: (
      _batchId: string,
      organizationId: string,
      _data: UpdateDraftBatchInput
    ) => organizationId,
    onError: "Failed to update draft",
  },
  async (
    ctx,
    batchId: string,
    organizationId: string,
    data: UpdateDraftBatchInput
  ): Promise<UpdateDraftBatchResult> => {
    const existing = await findBroadcastStatus(batchId, organizationId);

    if (!existing) {
      return { success: false, error: "Draft not found" };
    }

    if (existing.status !== "draft") {
      return {
        success: false,
        error: `Cannot edit: broadcast is already ${existing.status}`,
      };
    }

    const updateData: Parameters<typeof updateDraftBroadcast>[2] = {};

    if (data.channel !== undefined) updateData.channel = data.channel;
    if (data.name !== undefined) updateData.name = data.name ?? null;
    if (data.subject !== undefined) updateData.subject = data.subject ?? null;
    if (data.previewText !== undefined)
      updateData.previewText = data.previewText ?? null;
    if (data.from !== undefined) updateData.from = data.from ?? null;
    if (data.fromName !== undefined)
      updateData.fromName = data.fromName ?? null;
    if (data.replyTo !== undefined) updateData.replyTo = data.replyTo ?? null;
    if (data.templateId !== undefined)
      updateData.emailTemplateId = data.templateId ?? null;
    if (data.htmlContent !== undefined)
      updateData.htmlContent = data.htmlContent ?? null;
    if (data.variableMappings !== undefined)
      updateData.variableMappings = data.variableMappings ?? null;
    if (data.body !== undefined) updateData.body = data.body ?? null;
    if (data.senderId !== undefined)
      updateData.senderId = data.senderId ?? null;
    if (data.awsAccountId !== undefined)
      updateData.awsAccountId = data.awsAccountId ?? null;
    if (data.scheduledFor !== undefined)
      updateData.scheduledFor = data.scheduledFor ?? null;
    if (data.recipientFilter !== undefined) {
      updateData.audienceType = data.recipientFilter.audienceType;
      updateData.topicId = data.recipientFilter.topicId ?? null;
      updateData.segmentId = data.recipientFilter.segmentId ?? null;
    }

    await ctx.audited(
      async (tx) => {
        await updateDraftBroadcast(batchId, organizationId, updateData, tx);
      },
      () => ({
        action: "broadcast.draft_updated" as const,
        resource: "broadcast",
        resourceId: batchId,
        metadata: { broadcastId: batchId },
      })
    );

    revalidatePath(`/${ctx.access.orgSlug}/emails/broadcasts`, "page");
    revalidatePath(
      `/${ctx.access.orgSlug}/emails/broadcasts/${batchId}`,
      "page"
    );

    return loadBatchWithMeta(batchId, organizationId);
  }
);

/**
 * Promote a draft broadcast to a real send.
 */
export const promoteDraftToSend = orgAction(
  {
    name: "promoteDraftToSend",
    resource: "broadcasts",
    permission: ["send"],
    orgId: (
      _batchId: string,
      organizationId: string,
      _data: UpdateDraftBatchInput & { scheduledFor?: Date }
    ) => organizationId,
    onError: "Failed to send broadcast",
  },
  async (
    ctx,
    batchId: string,
    organizationId: string,
    data: UpdateDraftBatchInput & { scheduledFor?: Date }
  ): Promise<PromoteDraftBatchResult> => {
    const existing = await findDraftBroadcast(batchId, organizationId);

    if (!existing) {
      return { success: false, error: "Draft not found" };
    }

    const merged = {
      awsAccountId: data.awsAccountId ?? existing.awsAccountId ?? undefined,
      channel: (data.channel ?? existing.channel) as Channel,
      name: data.name ?? existing.name ?? undefined,
      subject: data.subject ?? existing.subject ?? undefined,
      previewText: data.previewText ?? existing.previewText ?? undefined,
      from: data.from ?? existing.from ?? undefined,
      fromName: data.fromName ?? existing.fromName ?? undefined,
      replyTo: data.replyTo ?? existing.replyTo ?? undefined,
      templateId: data.templateId ?? existing.emailTemplateId ?? undefined,
      htmlContent: data.htmlContent ?? existing.htmlContent ?? undefined,
      variableMappings:
        data.variableMappings ?? existing.variableMappings ?? undefined,
      body: data.body ?? existing.body ?? undefined,
      senderId: data.senderId ?? existing.senderId ?? undefined,
      recipientFilter:
        data.recipientFilter ??
        ({
          audienceType: (existing.audienceType ?? "all") as
            | "all"
            | "topic"
            | "segment",
          topicId: existing.topicId ?? undefined,
          segmentId: existing.segmentId ?? undefined,
        } as RecipientFilter),
      scheduledFor: data.scheduledFor ?? existing.scheduledFor ?? undefined,
    };

    if (!merged.awsAccountId) {
      return {
        success: false,
        error: "AWS account is required before sending",
      };
    }

    const prep = await validateAndPrepareSend(organizationId, {
      awsAccountId: merged.awsAccountId,
      channel: merged.channel,
      templateId: merged.templateId,
      htmlContent: merged.htmlContent,
      subject: merged.subject,
      recipientFilter: merged.recipientFilter,
      scheduledFor: merged.scheduledFor,
      variableMappings: merged.variableMappings,
    });

    if (!prep.ok) {
      return { success: false, error: prep.error };
    }

    const { recipientCount } = prep;

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return { success: false, error: "Session not found" };
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      return { success: false, error: "API URL not configured" };
    }

    const response = await fetch(`${apiUrl}/v1/batch/${batchId}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session.token}`,
        "X-Organization-Id": organizationId,
      },
      body: JSON.stringify({
        channel: merged.channel,
        name: merged.name,
        audienceType: merged.recipientFilter.audienceType,
        topicId: merged.recipientFilter.topicId,
        segmentId: merged.recipientFilter.segmentId,
        subject: merged.subject,
        previewText: merged.previewText,
        from: merged.from,
        fromName: merged.fromName,
        replyTo: merged.replyTo,
        templateId: merged.templateId,
        htmlContent: merged.htmlContent,
        variableMappings: merged.variableMappings,
        body: merged.body,
        senderId: merged.senderId,
        scheduledFor: merged.scheduledFor
          ? merged.scheduledFor.toISOString()
          : undefined,
        awsAccountId: merged.awsAccountId,
        totalRecipients: recipientCount,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorData = JSON.parse(errorText) as {
          error?: string;
          debug?: unknown;
        };
        return {
          success: false,
          error: errorData.error || "Failed to send broadcast",
        };
      } catch {
        return {
          success: false,
          error: errorText || "Failed to send broadcast",
        };
      }
    }

    const promoteResponse = (await response.json().catch(() => ({}))) as {
      warning?: string;
    };

    revalidatePath(`/${ctx.access.orgSlug}/emails/broadcasts`, "page");
    revalidatePath(
      `/${ctx.access.orgSlug}/emails/broadcasts/${batchId}`,
      "page"
    );

    const auditCtx = await getAuditContext();
    after(() =>
      db
        .insert(auditLog)
        .values(
          auditLogEntry(auditCtx, {
            organizationId,
            actorId: ctx.access.userId,
            actorEmail: ctx.access.userEmail,
            action: "broadcast.sent_from_draft",
            resource: "broadcast",
            resourceId: batchId,
            metadata: {
              broadcastId: batchId,
              channel: merged.channel,
              recipientCount,
            },
          })
        )
        .catch((err) =>
          createActionLogger("promoteDraftToSend", {
            orgSlug: organizationId,
          }).warn({ err }, "Best-effort audit log write failed")
        )
    );

    await trackBroadcastCreated(ctx.access.userEmail, organizationId, {
      channel: merged.channel,
      recipientCount,
      templateId: merged.templateId,
    });

    const promoted = await loadBatchWithMeta(batchId, organizationId);
    const promoteWarning = joinSendWarnings(
      promoteResponse.warning,
      prep.sandboxWarning,
      prep.quotaWarning
    );
    return promoted.success && promoteWarning
      ? { ...promoted, warning: promoteWarning }
      : promoted;
  }
);

/**
 * Hard-delete a draft broadcast.
 */
export const deleteDraftBatchSend = orgAction(
  {
    name: "deleteDraftBatchSend",
    resource: "broadcasts",
    permission: ["write"],
    orgId: (_batchId: string, organizationId: string) => organizationId,
    onError: "Failed to delete draft",
  },
  async (
    ctx,
    batchId: string,
    organizationId: string
  ): Promise<DeleteDraftBatchResult> => {
    // Pre-check: verify the draft exists and is in draft status
    const existing = await findBroadcastStatus(batchId, organizationId);
    if (!existing || existing.status !== "draft") {
      return { success: false, error: "Draft not found or already sent" };
    }

    await ctx.audited(
      async (tx) => {
        await deleteDraftBroadcast(batchId, organizationId, tx);
      },
      () => ({
        action: "broadcast.draft_deleted" as const,
        resource: "broadcast",
        resourceId: batchId,
        metadata: { broadcastId: batchId },
      })
    );

    revalidatePath(`/${ctx.access.orgSlug}/emails/broadcasts`, "page");

    return { success: true };
  }
);

/**
 * Duplicate a broadcast: clone its config as a new draft row.
 */
export const duplicateBatchSend = orgAction(
  {
    name: "duplicateBatchSend",
    resource: "broadcasts",
    permission: ["write"],
    orgId: (_sourceBatchId: string, organizationId: string) => organizationId,
    onError: "Failed to duplicate broadcast",
  },
  async (
    ctx,
    sourceBatchId: string,
    organizationId: string
  ): Promise<DuplicateBatchResult> => {
    const featureCheck = await checkFeatureAccess(organizationId, "batch");
    if (!featureCheck.allowed) {
      return {
        success: false,
        error:
          featureCheck.message ??
          "Batch sending is not available on your plan.",
      };
    }

    const source = await findBroadcastWithMeta(sourceBatchId, organizationId);

    if (!source) {
      return { success: false, error: "Broadcast not found" };
    }

    const newBatch = await ctx.audited(
      async (tx) => {
        const inserted = await duplicateBroadcast(
          source,
          organizationId,
          ctx.access.userId,
          tx
        );
        if (!inserted) throw new Error("Broadcast duplicate returned null");
        return inserted;
      },
      (inserted) => ({
        action: "broadcast.duplicated" as const,
        resource: "broadcast",
        resourceId: inserted.id,
        metadata: { broadcastId: inserted.id, sourceId: sourceBatchId },
      })
    );

    revalidatePath(`/${ctx.access.orgSlug}/emails/broadcasts`, "page");

    return loadBatchWithMeta(newBatch.id, organizationId);
  }
);

/**
 * Cancel a batch send
 */
export const cancelBatchSend = orgAction(
  {
    name: "cancelBatchSend",
    resource: "broadcasts",
    permission: ["write"],
    orgId: (_batchId: string, organizationId: string) => organizationId,
    onError: "Failed to cancel batch send",
  },
  async (
    ctx,
    batchId: string,
    organizationId: string
  ): Promise<CancelBatchResult> => {
    if (!uuidSchema.safeParse(batchId).success) {
      return { success: false, error: "Invalid batch ID" };
    }
    if (!uuidSchema.safeParse(organizationId).success) {
      return { success: false, error: "Invalid organization ID" };
    }

    const batch = await findBroadcast(batchId, organizationId);

    if (!batch) {
      return { success: false, error: "Batch not found" };
    }

    if (!["scheduled", "queued", "processing"].includes(batch.status)) {
      return {
        success: false,
        error: `Cannot cancel batch with status "${batch.status}"`,
      };
    }

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return { success: false, error: "Session not found" };
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      return { success: false, error: "API URL not configured" };
    }

    const response = await fetch(`${apiUrl}/v1/batch/${batch.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.session.token}`,
        "X-Organization-Id": organizationId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorData = JSON.parse(errorText) as { error?: string };
        return {
          success: false,
          error: errorData.error || "Failed to cancel batch send",
        };
      } catch {
        return {
          success: false,
          error: errorText || "Failed to cancel batch send",
        };
      }
    }

    const auditCtx = await getAuditContext();
    await db.insert(auditLog).values(
      auditLogEntry(auditCtx, {
        organizationId,
        actorId: ctx.access.userId,
        actorEmail: ctx.access.userEmail,
        action: "broadcast.cancelled",
        resource: "broadcast",
        resourceId: batchId,
        metadata: { broadcastId: batchId },
      })
    );

    revalidatePath(`/${ctx.access.orgSlug}/emails/broadcasts`, "page");
    revalidatePath(
      `/${ctx.access.orgSlug}/emails/broadcasts/${batchId}`,
      "page"
    );

    return { success: true };
  }
);

/**
 * Resume a stalled or failed broadcast from its last completed chunk.
 *
 * The API has always had POST /v1/batch/:id/resume, but nothing in the
 * dashboard called it — recovering a stuck send needed curl and a runbook, so
 * a recoverable failure read as terminal. This is the dashboard's path to it.
 * The API re-validates every gate; the checks here exist to give a useful
 * message before a round trip, not to be the authority.
 */
export const resumeBatchSend = orgAction(
  {
    name: "resumeBatchSend",
    resource: "broadcasts",
    permission: ["send"],
    orgId: (_batchId: string, organizationId: string) => organizationId,
    onError: "Failed to resume broadcast",
  },
  async (
    ctx,
    batchId: string,
    organizationId: string
  ): Promise<ResumeBatchResult> => {
    // Only batchId is shape-checked: orgAction has already resolved and
    // verified membership for this exact organizationId, so re-validating its
    // shape here would reject nothing that got this far.
    if (!uuidSchema.safeParse(batchId).success) {
      return { success: false, error: "Invalid batch ID" };
    }

    const batch = await findBroadcast(batchId, organizationId);

    if (!batch) {
      return { success: false, error: "Broadcast not found" };
    }

    if (!(batch.status === "processing" || batch.status === "failed")) {
      return {
        success: false,
        error: `Only a sending or failed broadcast can be resumed. This one is ${batch.status}.`,
      };
    }

    if (batch.channel !== "email") {
      return {
        success: false,
        error: "Resume is only supported for email broadcasts.",
      };
    }

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return { success: false, error: "Session not found" };
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      return { success: false, error: "API URL not configured" };
    }

    const response = await fetch(`${apiUrl}/v1/batch/${batch.id}/resume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session.token}`,
        "X-Organization-Id": organizationId,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorData = JSON.parse(errorText) as { error?: string };
        return {
          success: false,
          error: errorData.error || "Failed to resume broadcast",
        };
      } catch {
        return {
          success: false,
          error: errorText || "Failed to resume broadcast",
        };
      }
    }

    const result = (await response.json()) as { fromChunkIndex: number };

    const auditCtx = await getAuditContext();
    await db.insert(auditLog).values(
      auditLogEntry(auditCtx, {
        organizationId,
        actorId: ctx.access.userId,
        actorEmail: ctx.access.userEmail,
        action: "broadcast.resumed",
        resource: "broadcast",
        resourceId: batchId,
        metadata: {
          broadcastId: batchId,
          fromChunkIndex: result.fromChunkIndex,
        },
      })
    );

    revalidatePath(`/${ctx.access.orgSlug}/emails/broadcasts`, "page");
    revalidatePath(
      `/${ctx.access.orgSlug}/emails/broadcasts/${batchId}`,
      "page"
    );

    return { success: true, fromChunkIndex: result.fromChunkIndex };
  }
);

/**
 * Get recipient preview count for batch send form
 */
export const getRecipientCount = orgAction(
  {
    name: "getRecipientCount",
    resource: "broadcasts",
    permission: ["read"],
    orgId: (
      organizationId: string,
      _channel?: Channel,
      _filter?: RecipientFilter
    ) => organizationId,
    onError: "Failed to count recipients",
  },
  async (
    ctx,
    organizationId: string,
    channel: Channel = "email",
    filter?: RecipientFilter
  ): Promise<
    { success: true; count: number } | { success: false; error: string }
  > => {
    const count = await countBroadcastRecipients(
      organizationId,
      channel,
      filter
        ? {
            audienceType: filter.audienceType,
            topicId: filter.topicId,
            segmentId: filter.segmentId,
          }
        : undefined
    );
    return { success: true, count };
  }
);

export const listBroadcastRecipientOutcomes = orgAction(
  {
    name: "listBroadcastRecipientOutcomes",
    resource: "broadcasts",
    permission: ["read"],
    orgId: (
      _batchId: string,
      organizationId: string,
      _options?: { status?: string; limit?: number; offset?: number }
    ) => organizationId,
    onError: "Failed to load recipient outcomes",
  },
  async (
    ctx,
    batchId: string,
    organizationId: string,
    options: { status?: string; limit?: number; offset?: number } = {}
  ) => {
    const { rows, total } = await listBroadcastRecipients(
      batchId,
      organizationId,
      options
    );
    return { success: true as const, recipients: rows, total };
  }
);

export const exportBroadcastRecipients = orgAction(
  {
    name: "exportBroadcastRecipients",
    resource: "broadcasts",
    permission: ["read"],
    orgId: (
      _batchId: string,
      organizationId: string,
      _options?: { status?: string }
    ) => organizationId,
    onError: "Failed to export recipient outcomes",
  },
  async (
    ctx,
    batchId: string,
    organizationId: string,
    options: { status?: string } = {}
  ) => {
    const { rows, total } = await listBroadcastRecipients(
      batchId,
      organizationId,
      { status: options.status, limit: MAX_RECIPIENT_EXPORT_ROWS, offset: 0 }
    );
    return {
      success: true as const,
      recipients: rows,
      total,
      truncated: total > rows.length,
    };
  }
);

/**
 * Get sample contacts for audience preview
 */
export const getSampleContacts = orgAction(
  {
    name: "getSampleContacts",
    resource: "broadcasts",
    permission: ["read"],
    orgId: (
      organizationId: string,
      _channel?: Channel,
      _filter?: RecipientFilter,
      _limit?: number
    ) => organizationId,
    onError: "Failed to fetch sample contacts",
  },
  async (
    ctx,
    organizationId: string,
    channel: Channel = "email",
    filter?: RecipientFilter,
    limit = 5
  ): Promise<GetSampleContactsResult> => {
    const { contacts, totalCount } = await getSampleBroadcastRecipients(
      organizationId,
      channel,
      filter
        ? {
            audienceType: filter.audienceType,
            topicId: filter.topicId,
            segmentId: filter.segmentId,
          }
        : undefined,
      limit
    );

    return {
      success: true,
      contacts: contacts as SampleContact[],
      totalCount,
    };
  }
);

/**
 * List templates for batch send form
 */
export const listTemplatesForBatch = orgAction(
  {
    name: "listTemplatesForBatch",
    resource: "broadcasts",
    permission: ["read"],
    orgId: (organizationId: string) => organizationId,
    onError: "Failed to fetch templates",
  },
  async (
    ctx,
    organizationId: string
  ): Promise<
    | {
        success: true;
        templates: Array<{
          id: string;
          name: string;
          subject: string | null;
          previewText: string | null;
        }>;
      }
    | { success: false; error: string }
  > => {
    const templates = await listPublishedTemplates(organizationId);

    return { success: true, templates };
  }
);

/**
 * List topics for batch send recipient selection
 */
export const listTopicsForBatch = orgAction(
  {
    name: "listTopicsForBatch",
    resource: "broadcasts",
    permission: ["read"],
    orgId: (organizationId: string) => organizationId,
    onError: "Failed to fetch topics",
  },
  async (
    ctx,
    organizationId: string
  ): Promise<
    | {
        success: true;
        topics: Array<{ id: string; name: string; subscriberCount: number }>;
      }
    | { success: false; error: string }
  > => {
    const topics = await listTopicsWithSubscriberCounts(organizationId);

    return { success: true, topics };
  }
);

/**
 * List segments for batch send recipient selection
 */
export const listSegmentsForBatch = orgAction(
  {
    name: "listSegmentsForBatch",
    resource: "broadcasts",
    permission: ["read"],
    orgId: (organizationId: string) => organizationId,
    onError: "Failed to fetch segments",
  },
  async (
    ctx,
    organizationId: string
  ): Promise<
    | {
        success: true;
        segments: Array<{ id: string; name: string; memberCount: number }>;
      }
    | { success: false; error: string }
  > => {
    const segments = await listSegmentsForBroadcast(organizationId);

    return { success: true, segments };
  }
);

// =============================================================================
// TEMPLATE VARIABLE EXTRACTION
// =============================================================================

type JSONContent = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JSONContent[];
  text?: string;
};

/**
 * Extract all variables from a template's JSON content
 */
export const extractTemplateVariables = orgAction(
  {
    name: "extractTemplateVariables",
    resource: "broadcasts",
    permission: ["read"],
    orgId: (organizationId: string, _templateId: string) => organizationId,
    onError: "Failed to extract template variables",
  },
  async (
    ctx,
    organizationId: string,
    templateId: string
  ): Promise<
    | { success: true; variables: ExtractedVariable[] }
    | { success: false; error: string }
  > => {
    const templateData = await findTemplateVariables(
      templateId,
      organizationId
    );

    if (!templateData) {
      return { success: false, error: "Template not found" };
    }

    const knownVariables = getVariablesForContext("broadcast");
    const knownVariableNames = new Set(knownVariables.map((v) => v.name));

    const extractedVariables: ExtractedVariable[] = [];
    const seenVariables = new Set<string>();

    if (templateData.sourceFormat === "react-email") {
      const storedVars = (templateData.variables ?? []) as Array<{
        name: string;
        fallback?: string;
      }>;
      for (const v of storedVars) {
        if (HANDLEBARS_KEYWORDS.has(v.name)) {
          continue;
        }
        if (!seenVariables.has(v.name)) {
          seenVariables.add(v.name);

          const isKnown = knownVariableNames.has(v.name);
          const knownDef = knownVariables.find((kv) => kv.name === v.name);

          let category: "contact" | "organization" | "system" | "custom";
          if (isKnown && knownDef?.category) {
            category = knownDef.category as typeof category;
          } else if (v.name.startsWith("contact.")) {
            category = "contact";
          } else if (v.name.startsWith("organization.")) {
            category = "organization";
          } else if (
            v.name === "unsubscribeUrl" ||
            v.name === "preferencesUrl" ||
            v.name === "confirmationUrl"
          ) {
            category = "system";
          } else {
            category = "custom";
          }

          extractedVariables.push({
            name: v.name,
            label: knownDef?.label,
            fallback: v.fallback,
            isKnown,
            category,
          });
        }
      }

      extractedVariables.sort((a, b) => {
        if (a.isKnown !== b.isKnown) {
          return a.isKnown ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return { success: true, variables: extractedVariables };
    }

    function extractFromNode(node: JSONContent) {
      if (node.type === "variable" && node.attrs) {
        const name = node.attrs.name as string;
        const label = node.attrs.label as string | undefined;
        const fallback = node.attrs.fallback as string | undefined;

        if (name && !seenVariables.has(name)) {
          seenVariables.add(name);

          const isKnown = knownVariableNames.has(name);
          const knownDef = knownVariables.find((v) => v.name === name);

          let category: "contact" | "organization" | "system" | "custom";
          if (isKnown && knownDef?.category) {
            category = knownDef.category as typeof category;
          } else if (name.startsWith("contact.")) {
            category = "contact";
          } else if (name.startsWith("organization.")) {
            category = "organization";
          } else if (
            name === "unsubscribeUrl" ||
            name === "preferencesUrl" ||
            name === "confirmationUrl"
          ) {
            category = "system";
          } else {
            category = "custom";
          }

          extractedVariables.push({
            name,
            label: label ?? knownDef?.label,
            fallback: fallback ?? undefined,
            isKnown,
            category,
          });
        }
      }

      if (node.content) {
        for (const child of node.content) {
          extractFromNode(child);
        }
      }
    }

    if (templateData.content) {
      const content =
        typeof templateData.content === "string"
          ? JSON.parse(templateData.content)
          : templateData.content;
      extractFromNode(content as JSONContent);
    }

    extractedVariables.sort((a, b) => {
      if (a.isKnown !== b.isKnown) {
        return a.isKnown ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return { success: true, variables: extractedVariables };
  }
);

/**
 * Get template content for preview rendering
 */
export const getTemplateContent = orgAction(
  {
    name: "getTemplateContent",
    resource: "broadcasts",
    permission: ["read"],
    orgId: (organizationId: string, _templateId: string) => organizationId,
    onError: "Failed to fetch template content",
  },
  async (
    ctx,
    organizationId: string,
    templateId: string
  ): Promise<
    | {
        success: true;
        content: unknown;
        subject: string | null;
        compiledHtml: string | null;
        sourceFormat: string | null;
      }
    | { success: false; error: string }
  > => {
    const templateData = await findTemplateContent(templateId, organizationId);

    if (!templateData) {
      return { success: false, error: "Template not found" };
    }

    return {
      success: true,
      content: templateData.content,
      subject: templateData.subject,
      compiledHtml: templateData.compiledHtml,
      sourceFormat: templateData.sourceFormat,
    };
  }
);
