// baseline:allow-large-file
/**
 * Workflow Step Handlers
 *
 * Individual handler functions for each workflow step type.
 * Called by executeStep() in the main workflow processor.
 */

import {
  PinpointSMSVoiceV2Client,
  SendTextMessageCommand,
} from "@aws-sdk/client-pinpoint-sms-voice-v2";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import {
  awsAccount,
  CASCADE_ENGAGEMENT_FIELD,
  contact,
  contactTopic,
  db,
  eq,
  isEmailSendable,
  messageSend,
  organization,
  organizationExtension,
  type PreferredChannel,
  template,
  type WorkflowDefinitionSnapshot,
  type WorkflowStep,
  type WorkflowStepConfig,
  type WorkflowTransition,
  workflow,
  workflowExecution,
  workflowStepExecution,
} from "@wraps/db";
import {
  generateSESTemplateName,
  resolveAppUrl,
  toSesVariableName,
  transformVariablesForSes,
  upsertSESTemplate,
} from "@wraps/email";
import { resolveConfigurationSetName, sendEmail } from "@wraps/email-send";
import {
  extractCanonicalVars,
  normalizePlainTextForSes,
} from "@wraps/template-render";
import { resolveApiBaseUrl } from "@wraps/unsubscribe-token";
import { and, isNull, sql } from "drizzle-orm";
import { trackFirstEmailSent } from "../../lib/activation-tracking";
import { awsDefaults } from "../../lib/aws-defaults";
import { log } from "../../lib/logger";
import { generateUnsubscribeToken } from "../../lib/unsubscribe-token";
import { getCredentials } from "../../services/credentials";
import {
  scheduleWaitTimeout,
  scheduleWorkflowStep,
} from "../../services/workflow-queue";

import {
  createSsrfSafeDispatcher,
  evaluateCondition,
  FIRST_CLASS_CONTACT_FIELDS,
  htmlToPlainText,
  isValidE164Phone,
  sanitizeEmailSubject,
  substituteVariables,
  validateWebhookUrl,
} from "./workflow-utils";

function isSESPermissionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const msg = error.message || "";
  const name = error.name || "";
  return (
    name === "AccessDeniedException" ||
    name === "AccessDenied" ||
    msg.includes("is not authorized to perform") ||
    msg.includes("AccessDenied")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SENSITIVE_KEY_PATTERN =
  /password|token|secret|api_key|apikey|credit_card|card_number|cvv|ssn|auth|authorization|bearer|private_key/i;

function isTransientDbError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code ?? "";
  // Postgres connection/shutdown/concurrency errors that are safe to retry
  return (
    code.startsWith("08") || // connection exceptions
    code === "57P01" || // admin_shutdown
    code === "57P02" || // crash_shutdown
    code === "40001" || // serialization_failure
    code === "40P01" // deadlock_detected
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SEND EMAIL
// ═══════════════════════════════════════════════════════════════════════════

// Staleness threshold for the send-claim reclaim below. Aligned with
// STEP_EXECUTION_TIMEOUT_MINUTES (workflow-processor.ts) — that is the
// reclaim horizon for the step itself, and this claim exists to survive the
// same crash window. If one changes, change both.
export const WORKFLOW_SEND_CLAIM_STALE_MINUTES = 15;

export async function handleSendEmail(
  config: Extract<WorkflowStepConfig, { type: "send_email" }>,
  execution: typeof workflowExecution.$inferSelect,
  contactRecord: typeof contact.$inferSelect,
  organizationId: string,
  stepId: string
): Promise<{ action: "next"; data: Record<string, unknown> }> {
  // Check contact has email
  if (!contactRecord.email) {
    log.info("Workflow: contact has no email, skipping", {
      contactId: contactRecord.id,
    });
    return {
      action: "next",
      data: {
        skipped: true,
        reason: "no_email",
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Allowlist, not a denylist. This read `unsubscribed || bounced ||
  // complained` and so missed "suppressed", which processSuppression has been
  // writing since it shipped: those contacts reached SES, were refused at the
  // account suppression list, and came back as synthetic bounces that counted
  // against the workflow's send stats. A status this build has not heard of
  // must not be sendable by default.
  if (!isEmailSendable(contactRecord.emailStatus)) {
    log.info("Workflow: contact email suppressed, skipping", {
      contactId: contactRecord.id,
      emailStatus: contactRecord.emailStatus,
    });
    return {
      action: "next",
      data: {
        skipped: true,
        reason: `email_status_${contactRecord.emailStatus}`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Get the workflow to find the AWS account and sender defaults (scoped by org)
  const [wf] = await db
    .select({
      awsAccountId: workflow.awsAccountId,
      defaultFrom: workflow.defaultFrom,
      defaultFromName: workflow.defaultFromName,
      defaultReplyTo: workflow.defaultReplyTo,
    })
    .from(workflow)
    .where(
      and(
        eq(workflow.id, execution.workflowId),
        eq(workflow.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!wf?.awsAccountId) {
    log.warn("Workflow: no AWS account configured", {
      workflowId: execution.workflowId,
    });
    return {
      action: "next",
      data: {
        skipped: true,
        reason: "no_aws_account",
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CLAIM BEFORE SEND (plan 034)
  //
  // Claim the messageSend row BEFORE any SES call, mirroring
  // apps/api/src/workers/batch-sender.ts's race-safe claim (~:1256-1337).
  // message_send_workflow_step_dedup_idx — UNIQUE on (workflowExecutionId,
  // stepId) — makes this insert race-safe: concurrent/redelivered attempts
  // for the same step each try to INSERT, only one wins. Claiming here,
  // before the AWS account/template/credential lookups below, also means a
  // replay skips all of that (including an STS AssumeRole call), not just
  // the SES send itself.
  //
  // NOTE: bare onConflictDoNothing() — Drizzle cannot target a partial
  // unique index.
  // ═══════════════════════════════════════════════════════════════════════
  const [claimedRow] = await db
    .insert(messageSend)
    .values({
      organizationId,
      contactId: contactRecord.id,
      awsAccountId: wf.awsAccountId,
      channel: "email",
      sourceType: "workflow",
      workflowExecutionId: execution.id,
      stepId,
      recipient: contactRecord.email,
      emailTemplateId: config.templateId,
      status: "queued",
      claimedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: messageSend.id });

  if (!claimedRow) {
    // Another attempt already claimed (workflowExecutionId, stepId) —
    // figure out whether it already sent, is still in flight, or crashed.
    const [existing] = await db
      .select({
        messageId: messageSend.messageId,
        subject: messageSend.subject,
        status: messageSend.status,
        claimedAt: messageSend.claimedAt,
      })
      .from(messageSend)
      .where(
        and(
          eq(messageSend.workflowExecutionId, execution.id),
          eq(messageSend.stepId, stepId)
        )
      )
      .limit(1);

    if (existing?.messageId) {
      // A row carrying a messageId was accepted by SES — regardless of its
      // current status (sent/delivered/opened/…), re-sending it would
      // duplicate mail, and SES has no idempotency token to stop it (mirrors
      // batch-sender.ts's identical messageId-based guard). This is an
      // idempotent replay: reuse the recorded result, do not send again.
      log.info("Workflow: send already recorded, skipping duplicate send", {
        executionId: execution.id,
        stepId,
        messageId: existing.messageId,
      });
      return {
        action: "next",
        data: {
          messageId: existing.messageId,
          templateId: config.templateId,
          recipient: contactRecord.email,
          subject: existing.subject ?? undefined,
          timestamp: new Date().toISOString(),
          replay: true,
        },
      };
    }

    const isStaleQueuedClaim =
      existing?.status === "queued" &&
      existing.claimedAt !== null &&
      Date.now() - new Date(existing.claimedAt).getTime() >
        WORKFLOW_SEND_CLAIM_STALE_MINUTES * 60 * 1000;

    if (!isStaleQueuedClaim) {
      // A fresh 'queued' claim — another active attempt owns this send right
      // now. The processor's own step-execution claim (workflow-processor.ts)
      // makes concurrent handleSendEmail calls for the same
      // (executionId, stepId) rare, but this is the guard that actually
      // prevents the duplicate SES send if it happens anyway.
      log.warn(
        "Workflow: send claim held by another active attempt, skipping",
        { executionId: execution.id, stepId, status: existing?.status }
      );
      return {
        action: "next",
        data: {
          skipped: true,
          reason: "send_claim_in_progress",
          timestamp: new Date().toISOString(),
        },
      };
    }

    // Stale 'queued' claim with no messageId — the previous attempt crashed
    // before reaching SES. Reclaim it. WHERE also requires messageId IS NULL
    // (mirrors batch-sender.ts's re-claim guard): a row that gained a
    // messageId between the SELECT above and this UPDATE was SES-accepted,
    // and re-sending it would duplicate mail.
    const [reclaimed] = await db
      .update(messageSend)
      .set({ claimedAt: new Date() })
      .where(
        and(
          eq(messageSend.workflowExecutionId, execution.id),
          eq(messageSend.stepId, stepId),
          eq(messageSend.status, "queued"),
          isNull(messageSend.messageId),
          sql`${messageSend.claimedAt} < now() - interval '${sql.raw(String(WORKFLOW_SEND_CLAIM_STALE_MINUTES))} minutes'`
        )
      )
      .returning({ id: messageSend.id });

    if (!reclaimed) {
      // Lost the reclaim race to another concurrent attempt — same
      // "someone else owns it" outcome as above.
      log.warn("Workflow: lost stale-claim reclaim race, skipping send", {
        executionId: execution.id,
        stepId,
      });
      return {
        action: "next",
        data: {
          skipped: true,
          reason: "send_claim_in_progress",
          timestamp: new Date().toISOString(),
        },
      };
    }
    // Reclaimed the stale claim — fall through and send.
  }

  // Get AWS account region and features (for config set name). Scoped by org
  // (Cross-Org IDOR Prevention, root CLAUDE.md): wf.awsAccountId comes from
  // this org's own workflow row, but every lookup must still verify org
  // ownership rather than trust an id alone.
  const [account] = await db
    .select({ region: awsAccount.region, features: awsAccount.features })
    .from(awsAccount)
    .where(
      and(
        eq(awsAccount.id, wf.awsAccountId),
        eq(awsAccount.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!account) {
    throw new Error(`AWS account ${wf.awsAccountId} not found`);
  }
  // The SES config set is resolved after the sender is known (per-domain).

  // Get template (scoped by org for defense-in-depth)
  const [tmpl] = await db
    .select({
      id: template.id,
      name: template.name,
      subject: template.subject,
      compiledHtml: template.compiledHtml,
      emailType: template.emailType,
      sesTemplateName: template.sesTemplateName,
    })
    .from(template)
    .where(
      and(
        eq(template.id, config.templateId),
        eq(template.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!tmpl) {
    throw new Error(`Template ${config.templateId} not found`);
  }

  if (!tmpl.compiledHtml) {
    throw new Error(`Template ${config.templateId} has no compiled HTML`);
  }

  // Get organization for name
  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);

  // Get credentials for customer's AWS account (scoped by org)
  const credentials = await getCredentials(wf.awsAccountId, organizationId);

  // Create SES client
  const sesClient = new SESv2Client({
    ...awsDefaults,
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  // Build variable replacement data.
  // Always include contact fields with empty string fallbacks — SES templates
  // fail with a rendering error if a referenced variable is absent entirely.
  const replacementData: Record<string, string> = {
    email: contactRecord.email,
    contactEmail: contactRecord.email,
    firstName: contactRecord.firstName ?? "",
    lastName: contactRecord.lastName ?? "",
    company: contactRecord.company ?? "",
    jobTitle: contactRecord.jobTitle ?? "",
    contactFirstName: contactRecord.firstName ?? "",
    contactLastName: contactRecord.lastName ?? "",
    contactCompany: contactRecord.company ?? "",
    contactJobTitle: contactRecord.jobTitle ?? "",
  };

  const addIfPresent = (key: string, value: string | null | undefined) => {
    if (value) {
      replacementData[key] = value;
    }
  };
  addIfPresent("organizationName", org?.name);

  // Add contact properties
  const properties = contactRecord.properties as Record<string, unknown> | null;
  if (properties) {
    for (const [key, value] of Object.entries(properties)) {
      const strValue = value != null ? String(value) : null;
      if (strValue) {
        replacementData[key] = strValue;
      }
    }
  }

  // Add trigger data
  const triggerData = execution.triggerData as Record<string, unknown> | null;
  if (triggerData) {
    for (const [key, value] of Object.entries(triggerData)) {
      const strValue = value != null ? String(value) : null;
      if (strValue) {
        replacementData[key] = strValue;
      }
    }
  }

  // Generate unsubscribe URLs — always included because templates reference
  // {{unsubscribeUrl}} in their footer. List-Unsubscribe headers are still
  // marketing-only (see below).
  const isMarketing = tmpl.emailType === "marketing";
  // Both throw when the deployment has not configured its own URLs. That is the
  // intended behavior for a recipient-facing link: a self-hosted customer's
  // unsubscribe token is meaningless to the Wraps platform, so a silent
  // fallback would mail their contacts a dead link on another company's domain.
  // Do not wrap these in a try/catch that restores a default.
  const apiBaseUrl = resolveApiBaseUrl();
  const appBaseUrl = resolveAppUrl();

  const unsubscribeToken = await generateUnsubscribeToken(
    contactRecord.id,
    organizationId
  );
  const unsubscribeUrl = `${apiBaseUrl}/unsubscribe/${unsubscribeToken}`;
  const preferencesUrl = `${appBaseUrl}/preferences/${unsubscribeToken}`;
  replacementData.unsubscribeUrl = unsubscribeUrl;
  replacementData.preferencesUrl = preferencesUrl;

  // Build from address (step config > workflow default > org default > owner domain > fail)
  let fromAddress: string | null | undefined = config.from || wf.defaultFrom;
  let fromName: string | null | undefined =
    config.fromName || wf.defaultFromName;

  if (!fromAddress) {
    const [orgExt] = await db
      .select({
        defaultFrom: organizationExtension.defaultFrom,
        defaultFromName: organizationExtension.defaultFromName,
      })
      .from(organizationExtension)
      .where(eq(organizationExtension.organizationId, organizationId))
      .limit(1);
    fromAddress = orgExt?.defaultFrom ?? null;
    if (!fromName) {
      fromName = orgExt?.defaultFromName ?? null;
    }
  }

  if (!fromAddress) {
    log.error("Workflow: no sender address configured", {
      workflowId: execution.workflowId,
      organizationId,
    });
    return {
      action: "next",
      data: {
        skipped: true,
        reason: "no_sender_configured",
        error:
          "No sender email configured. Set a default sender in Settings > Sender Defaults.",
        timestamp: new Date().toISOString(),
      },
    };
  }
  const fromDisplay = fromName ? `${fromName} <${fromAddress}>` : fromAddress;
  const replyTo = config.replyTo || wf.defaultReplyTo;

  // Resolve the SES config set from the actual sender domain (per-domain).
  // Looks up a set discovery confirmed exists; never derives a missing name.
  const configSetName = resolveConfigurationSetName({
    fromDomain: fromAddress.split("@").at(-1),
    storedConfigSetName: account.features?.email?.configSetName,
    identities: account.features?.email?.identities,
  });

  // Build headers for marketing emails
  const headers: Array<{ Name: string; Value: string }> = [];
  if (isMarketing && unsubscribeUrl) {
    headers.push(
      { Name: "List-Unsubscribe", Value: `<${unsubscribeUrl}>` },
      { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" }
    );
  }

  // Common email tags
  const emailTags = [
    { Name: "workflowId", Value: execution.workflowId },
    { Name: "executionId", Value: execution.id },
    { Name: "organizationId", Value: organizationId },
    { Name: "templateId", Value: config.templateId },
    { Name: "source", Value: "automation" },
  ];

  // Try to use SES template if available
  let sesTemplateName = tmpl.sesTemplateName;

  // Auto-publish if not published to SES (requires compiledHtml)
  if (!sesTemplateName && tmpl.compiledHtml) {
    sesTemplateName = await autoPublishTemplate(
      tmpl as {
        id: string;
        name: string;
        subject: string | null;
        compiledHtml: string;
      },
      credentials,
      account.region
    );
  }

  // Step-level subject override takes precedence over template subject
  const baseSubject = config.subject || tmpl.subject || "Message";

  let messageId: string;
  let subject: string;

  // Marketing payload shared across all three send paths
  const marketing =
    isMarketing && unsubscribeUrl ? { unsubscribeUrl } : undefined;
  // Raw-HTML paths consume @wraps/email-send tag shape ({name, value}); the
  // SES-template path uses the AWS SDK's upper-case shape via `emailTags`.
  const sharedTags = emailTags.map((t) => ({ name: t.Name, value: t.Value }));

  // Pad replacementData so SES never encounters an absent variable.
  // SES hard-fails template rendering (RenderingFailure → silent non-delivery)
  // when a bare {{var}} is referenced but missing from TemplateData. Empty
  // string is falsy for {{#if}}, so conditionals still work correctly.
  // We do this for all vars extracted from subject + html regardless of which
  // send path ends up being used (the raw-HTML path ignores the extras; the
  // SES-template path needs them).
  const canonicalVars = extractCanonicalVars(
    `${tmpl.subject ?? ""}\n${tmpl.compiledHtml}`
  );
  for (const rawVar of canonicalVars) {
    const sesKey = toSesVariableName(rawVar);
    if (!(sesKey in replacementData)) {
      replacementData[sesKey] = "";
    }
  }

  try {
    if (sesTemplateName && !config.subject) {
      // Use SES template - let SES handle variable substitution
      // (SES templates have their own subject baked in, so only use this path
      // when there's no step-level override)
      //
      // Render the subject locally anyway: messageSend must record what the
      // recipient sees (not raw {{...}} syntax), and an unrenderable subject
      // must block the send here rather than surface as an async SES
      // rendering failure after the send is already recorded.
      // transformVariablesForSes first: stored subjects may use the authoring
      // syntax ({{firstName|there}}, {{contact.firstName}}) which Handlebars
      // can't parse / resolve against our flat replacementData — the SES copy
      // was transformed at publish, so the local render must match.
      subject = sanitizeEmailSubject(
        substituteVariables(
          transformVariablesForSes(tmpl.subject || "Message"),
          replacementData
        )
      );

      const response = await sesClient.send(
        new SendEmailCommand({
          FromEmailAddress: fromDisplay,
          ReplyToAddresses: replyTo ? [replyTo] : undefined,
          Destination: {
            ToAddresses: [contactRecord.email],
          },
          Content: {
            Template: {
              TemplateName: sesTemplateName,
              TemplateData: JSON.stringify(replacementData),
              Headers: headers.length > 0 ? headers : undefined,
            },
          },
          ConfigurationSetName: configSetName,
          EmailTags: emailTags,
        })
      );
      if (!response.MessageId) {
        throw new Error("SES SendEmail returned no MessageId");
      }
      messageId = response.MessageId;

      log.info("Workflow: email sent via SES template", {
        template: sesTemplateName,
        to: contactRecord.email,
      });
    } else if (sesTemplateName && config.subject) {
      // SES template exists but step has a subject override — send as raw HTML
      // so we can apply the overridden subject.
      // transformVariablesForSes first: authoring syntax ({{var|fallback}},
      // dotted paths) must become the flat #if form our renderer and
      // replacementData understand.
      const html = substituteVariables(
        transformVariablesForSes(tmpl.compiledHtml),
        replacementData
      );

      const rawSubject = substituteVariables(
        transformVariablesForSes(baseSubject),
        replacementData
      );
      subject = sanitizeEmailSubject(rawSubject);

      const result = await sendEmail({
        client: sesClient,
        from: fromDisplay,
        to: contactRecord.email,
        subject,
        html,
        text: htmlToPlainText(html),
        replyTo: replyTo ?? undefined,
        marketing,
        tags: sharedTags,
        configurationSetName: configSetName,
      });
      messageId = result.messageId;

      log.info("Workflow: email sent via raw HTML (subject override)", {
        to: contactRecord.email,
      });
    } else {
      // Fallback: Apply variable substitution locally and send raw HTML
      const html = substituteVariables(
        transformVariablesForSes(tmpl.compiledHtml),
        replacementData
      );

      // Build subject with variable substitution
      const rawSubject = substituteVariables(
        transformVariablesForSes(baseSubject),
        replacementData
      );
      subject = sanitizeEmailSubject(rawSubject);

      const result = await sendEmail({
        client: sesClient,
        from: fromDisplay,
        to: contactRecord.email,
        subject,
        html,
        text: htmlToPlainText(html),
        replyTo: replyTo ?? undefined,
        marketing,
        tags: sharedTags,
        configurationSetName: configSetName,
      });
      messageId = result.messageId;

      log.info("Workflow: email sent via raw HTML", {
        to: contactRecord.email,
      });
    }
  } catch (error) {
    if (isSESPermissionError(error)) {
      throw new Error(
        "Your IAM role does not have permission to send emails. " +
          "Fix: update your CloudFormation stack to the latest version, " +
          "or run `wraps platform update-role` in the CLI."
      );
    }
    throw error;
  }

  // Mark the claimed row 'sent' — retry only on transient DB errors.
  //
  // Deliberately runs OUTSIDE the SES try/catch above and deliberately does
  // NOT rethrow after exhausting retries. SES has already accepted the
  // message: this mirrors the isolation rule
  // apps/api/src/workers/batch-sender.ts's recordAcceptedSend establishes
  // (see its comment there) — a transient Postgres error here must never
  // surface as a send failure, because the processor's catch block would
  // then mark this step (and the execution) 'failed' despite mail being in
  // flight. On persistent failure the row is left 'queued' with no
  // messageId, which the stale-reclaim block above will pick up on a later
  // retry of this step. That reclaim is also the residual risk this
  // decision accepts: if the reclaim fires before this UPDATE ever lands,
  // the email sends a second time. Same shape as batch, which accepts the
  // identical window — SES is not transactional with Postgres. See plan 034
  // R4 for the alternative (rethrow) and why it was rejected: it would mark
  // an SES-accepted send 'failed', which is a worse lie than the rare
  // reclaim duplicate.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db
        .update(messageSend)
        .set({
          status: "sent",
          messageId,
          subject,
          from: fromAddress,
          fromName: fromName || null,
          sentAt: new Date(),
        })
        .where(
          and(
            eq(messageSend.workflowExecutionId, execution.id),
            eq(messageSend.stepId, stepId)
          )
        );
      break;
    } catch (dbError) {
      if (attempt < 2 && isTransientDbError(dbError)) {
        await sleep(100 * 2 ** attempt);
        continue;
      }
      log.error(
        "Workflow: failed to mark messageSend sent after retries exhausted",
        dbError,
        {
          executionId: execution.id,
          stepId,
          messageId,
          channel: "email",
          attempt: attempt + 1,
        }
      );
      break;
    }
  }

  // Track first email sent (must await in Lambda)
  await trackFirstEmailSent(
    organizationId,
    { channel: "email", source: "workflow" },
    contactRecord.email
  );

  // Update contact email metrics
  await db
    .update(contact)
    .set({
      lastEmailSentAt: new Date(),
      emailsSent: sql`COALESCE(${contact.emailsSent}, 0) + 1`,
    })
    .where(eq(contact.id, contactRecord.id));

  return {
    action: "next",
    data: {
      messageId,
      templateId: config.templateId,
      recipient: contactRecord.email,
      subject,
      timestamp: new Date().toISOString(),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-PUBLISH TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Auto-publish a template to SES if not already published.
 * Uses the existing compiledHtml from the template.
 * Returns the SES template name if successful, or null if publishing fails.
 */
async function autoPublishTemplate(
  tmpl: {
    id: string;
    name: string;
    subject: string | null;
    compiledHtml: string;
  },
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  },
  region: string
): Promise<string | null> {
  try {
    // 1. Transform variables for SES compatibility
    // compiledHtml already has {{contact.firstName}} format
    // We need to transform to {{contactFirstName}} format for SES
    // Also handles fallbacks: {{name|fallback}} → {{#if name}}{{name}}{{else}}fallback{{/if}}
    const sesHtml = transformVariablesForSes(tmpl.compiledHtml);
    // normalizePlainTextForSes: html-to-text uppercases heading content,
    // turning {{#if firstName}} into {{#IF FIRSTNAME}} — SES rejects that
    // as a missing 'IF' attribute and the send never delivers.
    const sesText = normalizePlainTextForSes(htmlToPlainText(sesHtml), sesHtml);
    const sesSubject = transformVariablesForSes(tmpl.subject || "Message");

    // 2. Generate template name and publish to SES
    const sesTemplateName = generateSESTemplateName(tmpl.id, tmpl.name);
    await upsertSESTemplate(credentials, region, {
      templateName: sesTemplateName,
      subject: sesSubject,
      htmlPart: sesHtml,
      textPart: sesText,
    });

    // 3. Update template in DB with SES template name
    await db
      .update(template)
      .set({
        sesTemplateName,
        publishedAt: new Date(),
      })
      .where(eq(template.id, tmpl.id));

    log.info("Workflow: auto-published SES template", {
      templateId: tmpl.id,
      sesTemplateName,
    });
    return sesTemplateName;
  } catch (error) {
    log.error("Workflow: auto-publish failed", error);
    return null; // Fall back to raw HTML
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SEND SMS
// ═══════════════════════════════════════════════════════════════════════════

export async function handleSendSms(
  config: Extract<WorkflowStepConfig, { type: "send_sms" }>,
  execution: typeof workflowExecution.$inferSelect,
  contactRecord: typeof contact.$inferSelect,
  organizationId: string
): Promise<{ action: "next"; data: Record<string, unknown> }> {
  // Get the contact's phone number
  if (!contactRecord.phone) {
    log.info("Workflow: contact has no phone, skipping SMS", {
      contactId: contactRecord.id,
    });
    return {
      action: "next",
      data: {
        skipped: true,
        reason: "no_phone",
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Validate phone number format (E.164)
  if (!isValidE164Phone(contactRecord.phone)) {
    log.warn("Workflow: invalid phone format", {
      contactId: contactRecord.id,
      phone: contactRecord.phone,
    });
    return {
      action: "next",
      data: {
        skipped: true,
        reason: "invalid_phone_format",
        phone: contactRecord.phone,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Get the workflow to find the AWS account and sender defaults (scoped by org)
  const [wf] = await db
    .select({
      awsAccountId: workflow.awsAccountId,
      defaultSenderId: workflow.defaultSenderId,
    })
    .from(workflow)
    .where(
      and(
        eq(workflow.id, execution.workflowId),
        eq(workflow.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!wf?.awsAccountId) {
    log.warn("Workflow: no AWS account configured for SMS", {
      workflowId: execution.workflowId,
    });
    return {
      action: "next",
      data: {
        skipped: true,
        reason: "no_aws_account",
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Get the AWS account region
  const [account] = await db
    .select({ region: awsAccount.region })
    .from(awsAccount)
    .where(eq(awsAccount.id, wf.awsAccountId))
    .limit(1);

  if (!account) {
    throw new Error(`AWS account ${wf.awsAccountId} not found`);
  }

  // Get credentials for the customer's AWS account (scoped by org)
  const credentials = await getCredentials(wf.awsAccountId, organizationId);

  // Create Pinpoint SMS Voice V2 client with assumed credentials
  const smsClient = new PinpointSMSVoiceV2Client({
    ...awsDefaults,
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  // Build message body with variable substitution
  const rawBody = config.body || "";
  if (!rawBody) {
    log.warn("Workflow: SMS step has no message body");
    return {
      action: "next",
      data: {
        skipped: true,
        reason: "no_message_body",
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Build replacement data (same pattern as handleSendEmail)
  const replacementData: Record<string, string> = {
    email: contactRecord.email ?? "",
    contactEmail: contactRecord.email ?? "",
    firstName: contactRecord.firstName ?? "",
    lastName: contactRecord.lastName ?? "",
    company: contactRecord.company ?? "",
    jobTitle: contactRecord.jobTitle ?? "",
    contactFirstName: contactRecord.firstName ?? "",
    contactLastName: contactRecord.lastName ?? "",
    contactCompany: contactRecord.company ?? "",
    contactJobTitle: contactRecord.jobTitle ?? "",
    phone: contactRecord.phone ?? "",
  };

  const _addIfPresent = (key: string, value: string | null | undefined) => {
    if (value) {
      replacementData[key] = value;
    }
  };

  // Add contact properties
  const properties = contactRecord.properties as Record<string, unknown> | null;
  if (properties) {
    for (const [key, value] of Object.entries(properties)) {
      const strValue = value != null ? String(value) : null;
      if (strValue) {
        replacementData[key] = strValue;
      }
    }
  }

  // Add trigger data
  const triggerData = execution.triggerData as Record<string, unknown> | null;
  if (triggerData) {
    for (const [key, value] of Object.entries(triggerData)) {
      const strValue = value != null ? String(value) : null;
      if (strValue) {
        replacementData[key] = strValue;
      }
    }
  }

  const normalizedBody = transformVariablesForSes(rawBody);
  const messageBody = substituteVariables(normalizedBody, replacementData);

  // Build sender ID (step config > workflow default)
  const senderId = config.senderId || wf.defaultSenderId;

  // Send SMS
  const command = new SendTextMessageCommand({
    DestinationPhoneNumber: contactRecord.phone,
    MessageBody: messageBody,
    ConfigurationSetName: "wraps-sms-config",
    MessageType: "TRANSACTIONAL",
    ...(senderId && { OriginationIdentity: senderId }),
  });

  const response = await smsClient.send(command);

  const smsMessageId = response.MessageId ?? crypto.randomUUID();

  log.info("Workflow: SMS sent", {
    to: contactRecord.phone,
    messageId: smsMessageId,
  });

  // Record the send in messageSend table (parity with email sends) — retry only on transient DB errors
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.insert(messageSend).values({
        organizationId,
        contactId: contactRecord.id,
        awsAccountId: wf.awsAccountId,
        channel: "sms",
        sourceType: "workflow",
        workflowExecutionId: execution.id,
        recipient: contactRecord.phone,
        subject: null,
        from: senderId || null,
        fromName: null,
        messageId: smsMessageId,
        status: "sent",
        sentAt: new Date(),
      });
      break;
    } catch (dbError) {
      if (attempt < 2 && isTransientDbError(dbError)) {
        await sleep(100 * 2 ** attempt);
      } else {
        log.error(
          "Workflow: failed to record messageSend after 3 attempts",
          dbError,
          {
            executionId: execution.id,
            messageId: smsMessageId,
            channel: "sms",
          }
        );
        throw dbError;
      }
    }
  }

  // Update contact SMS metrics
  await db
    .update(contact)
    .set({
      lastSmsSentAt: new Date(),
      smsSent: sql`COALESCE(${contact.smsSent}, 0) + 1`,
    })
    .where(eq(contact.id, contactRecord.id));

  return {
    action: "next",
    data: {
      messageId: smsMessageId,
      recipient: contactRecord.phone,
      body: messageBody,
      timestamp: new Date().toISOString(),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DELAY
// ═══════════════════════════════════════════════════════════════════════════

export async function handleDelay(
  config: Extract<WorkflowStepConfig, { type: "delay" }>,
  execution: typeof workflowExecution.$inferSelect,
  stepId: string,
  organizationId: string,
  completeExecution: (executionId: string) => Promise<void>
): Promise<{ action: "wait" }> {
  // Calculate delay in seconds
  let delaySeconds = config.amount;
  switch (config.unit) {
    case "minutes":
      delaySeconds *= 60;
      break;
    case "hours":
      delaySeconds *= 3600;
      break;
    case "days":
      delaySeconds *= 86_400;
      break;
    case "weeks":
      delaySeconds *= 604_800;
      break;
  }

  // Use snapshot transitions (immune to live edits) with fallback for pre-snapshot executions
  const snapshot =
    execution.definitionSnapshot as WorkflowDefinitionSnapshot | null;
  let transitions: WorkflowTransition[] | undefined;

  if (snapshot) {
    transitions = snapshot.transitions;
  } else {
    const [wf] = await db
      .select()
      .from(workflow)
      .where(
        and(
          eq(workflow.id, execution.workflowId),
          eq(workflow.organizationId, organizationId)
        )
      )
      .limit(1);
    transitions = wf?.transitions as WorkflowTransition[] | undefined;
  }

  const nextTransition = transitions?.find((t) => t.fromStepId === stepId);

  if (!nextTransition) {
    // No next step - complete execution
    await completeExecution(execution.id);
    return { action: "wait" };
  }

  // Schedule the next step
  const schedulerName = await scheduleWorkflowStep({
    executionId: execution.id,
    stepId: nextTransition.toStepId,
    organizationId,
    delaySeconds,
  });

  // Update execution status
  await db
    .update(workflowExecution)
    .set({
      status: "paused",
      nextStepScheduledAt: new Date(Date.now() + delaySeconds * 1000),
      delaySchedulerName: schedulerName,
      updatedAt: new Date(),
    })
    .where(eq(workflowExecution.id, execution.id));

  return { action: "wait" };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONDITION
// ═══════════════════════════════════════════════════════════════════════════

export async function handleCondition(
  config: Extract<WorkflowStepConfig, { type: "condition" }>,
  contactRecord: typeof contact.$inferSelect,
  execution: typeof workflowExecution.$inferSelect,
  step: WorkflowStep
): Promise<{ action: "next"; branch: "yes" | "no" }> {
  // Handle engagement.status — used by cascade condition steps to check
  // whether the contact engaged with a previous email. The preceding
  // wait_for_email_engagement step records its branch ("opened", "clicked",
  // "bounced", or "timeout") on the step execution row.
  if (config.field === CASCADE_ENGAGEMENT_FIELD) {
    // Scope to the same cascade group to avoid picking up engagement results
    // from a different cascade node in the same workflow execution.
    // Cascade step IDs follow the pattern: ${cascadeGroupId}-cond-${i},
    // and wait steps are: ${cascadeGroupId}-wait-${i}.
    const cascadeGroupId = step.cascadeGroupId;
    const waitStepFilter = cascadeGroupId
      ? sql`${workflowStepExecution.stepId} LIKE ${`${cascadeGroupId}-wait-%`}`
      : undefined;

    const previousWaitStep = await db
      .select({ branch: workflowStepExecution.branch })
      .from(workflowStepExecution)
      .where(
        and(
          eq(workflowStepExecution.executionId, execution.id),
          eq(workflowStepExecution.stepType, "wait_for_email_engagement"),
          eq(workflowStepExecution.status, "completed"),
          waitStepFilter
        )
      )
      .orderBy(sql`${workflowStepExecution.completedAt} DESC`)
      .limit(1);

    const engaged =
      previousWaitStep[0]?.branch === "opened" ||
      previousWaitStep[0]?.branch === "clicked";

    // The cascade expansion uses operator "equals" / value "true",
    // so "true" === "true" when engaged, "false" !== "true" when not.
    const fieldValue = String(engaged);
    const conditionMet = evaluateCondition(
      fieldValue,
      config.operator,
      config.value
    );

    return {
      action: "next",
      branch: conditionMet ? "yes" : "no",
    };
  }

  // Get the field value from contact properties
  const properties = contactRecord.properties as Record<string, unknown> | null;
  const triggerData = execution.triggerData as Record<string, unknown> | null;

  // Strip prefixes added by the SDK and dashboard editor:
  // - "contact.properties.onboardingPath" → "onboardingPath"
  // - "contact.hasConnectedAws" → "hasConnectedAws"
  // - "properties.plan" → "plan"
  let field = config.field;
  if (field.startsWith("contact.")) {
    field = field.slice("contact.".length);
  }
  if (field.startsWith("properties.")) {
    field = field.slice("properties.".length);
  }

  // Try contact fields first, then contact.properties, then trigger data
  let fieldValue: unknown;
  if (field in contactRecord) {
    fieldValue = contactRecord[field as keyof typeof contactRecord];
  } else if (properties && field in properties) {
    fieldValue = properties[field];
  } else if (triggerData && field in triggerData) {
    fieldValue = triggerData[field];
  }

  // Evaluate condition
  const conditionMet = evaluateCondition(
    fieldValue,
    config.operator,
    config.value
  );

  return {
    action: "next",
    branch: conditionMet ? "yes" : "no",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE CONTACT
// ═══════════════════════════════════════════════════════════════════════════

export async function handleUpdateContact(
  config: Extract<WorkflowStepConfig, { type: "update_contact" }>,
  contactRecord: typeof contact.$inferSelect
): Promise<{ action: "next"; data: Record<string, unknown> }> {
  const updates = config.updates || [];
  const currentProperties =
    (contactRecord.properties as Record<string, unknown>) || {};
  const newProperties = { ...currentProperties };
  const directUpdates: Partial<typeof contact.$inferInsert> = {};

  for (const update of updates) {
    const isFirstClass = FIRST_CLASS_CONTACT_FIELDS.has(update.field);

    switch (update.operation) {
      case "set":
        if (isFirstClass) {
          switch (update.field) {
            case "preferredChannel":
              directUpdates.preferredChannel =
                update.value as PreferredChannel | null;
              break;
            case "firstName":
              directUpdates.firstName = update.value as string | null;
              break;
            case "lastName":
              directUpdates.lastName = update.value as string | null;
              break;
            case "company":
              directUpdates.company = update.value as string | null;
              break;
            case "jobTitle":
              directUpdates.jobTitle = update.value as string | null;
              break;
          }
        } else {
          newProperties[update.field] = update.value;
        }
        break;
      case "unset":
        if (isFirstClass) {
          switch (update.field) {
            case "preferredChannel":
              directUpdates.preferredChannel = null;
              break;
            case "firstName":
              directUpdates.firstName = null;
              break;
            case "lastName":
              directUpdates.lastName = null;
              break;
            case "company":
              directUpdates.company = null;
              break;
            case "jobTitle":
              directUpdates.jobTitle = null;
              break;
          }
        } else {
          delete newProperties[update.field];
        }
        break;
      case "increment":
        newProperties[update.field] =
          (Number(newProperties[update.field]) || 0) + Number(update.value);
        break;
      case "decrement":
        newProperties[update.field] =
          (Number(newProperties[update.field]) || 0) - Number(update.value);
        break;
      case "append": {
        const arr = Array.isArray(newProperties[update.field])
          ? newProperties[update.field]
          : [];
        (arr as unknown[]).push(update.value);
        newProperties[update.field] = arr;
        break;
      }
      case "remove":
        if (Array.isArray(newProperties[update.field])) {
          newProperties[update.field] = (
            newProperties[update.field] as unknown[]
          ).filter((v) => v !== update.value);
        }
        break;
    }
  }

  await db
    .update(contact)
    .set({
      ...directUpdates,
      properties: newProperties,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contact.id, contactRecord.id),
        eq(contact.organizationId, contactRecord.organizationId)
      )
    );

  return {
    action: "next",
    data: { updatedFields: updates.map((u) => u.field) },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK
// ═══════════════════════════════════════════════════════════════════════════

const FORBIDDEN_WEBHOOK_HEADERS = new Set([
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
]);

/** @exported for testing */
export function sanitizeWebhookHeaders(
  custom: Record<string, string> | undefined
): Record<string, string> {
  const out: Record<string, string> = { "Content-Type": "application/json" };
  for (const [key, value] of Object.entries(custom ?? {})) {
    if (FORBIDDEN_WEBHOOK_HEADERS.has(key.toLowerCase())) {
      continue;
    }
    if (/[\r\n\0]/.test(key) || /[\r\n\0]/.test(value)) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

export async function handleWebhook(
  config: Extract<WorkflowStepConfig, { type: "webhook" }>,
  contactRecord: typeof contact.$inferSelect,
  execution: typeof workflowExecution.$inferSelect
): Promise<{ action: "next"; data: Record<string, unknown> }> {
  try {
    await validateWebhookUrl(config.url);
  } catch (error) {
    log.error("Webhook SSRF blocked", error, { url: config.url });
    return {
      action: "next",
      data: {
        error: error instanceof Error ? error.message : "Invalid webhook URL",
        blocked: true,
      },
    };
  }

  const allProperties =
    (contactRecord.properties as Record<string, unknown>) ?? {};
  const droppedKeys = Object.keys(allProperties).filter((key) =>
    SENSITIVE_KEY_PATTERN.test(key)
  );
  if (droppedKeys.length > 0) {
    log.warn("Webhook: sensitive contact property keys omitted from payload", {
      executionId: execution.id,
      droppedKeys,
    });
  }
  const filteredProperties = Object.fromEntries(
    Object.entries(allProperties).filter(
      ([key]) => !SENSITIVE_KEY_PATTERN.test(key)
    )
  );

  const body = {
    contact: {
      id: contactRecord.id,
      email: contactRecord.email,
      properties: filteredProperties,
    },
    execution: {
      id: execution.id,
      workflowId: execution.workflowId,
      triggerData: execution.triggerData,
    },
    ...(config.body || {}),
  };

  const dispatcher = createSsrfSafeDispatcher();
  try {
    // Cast to include undici dispatcher — Node fetch accepts it; not in DOM types
    const fetchOptions: RequestInit & { dispatcher: unknown } = {
      method: config.method,
      headers: sanitizeWebhookHeaders(config.headers),
      body: config.method !== "GET" ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
      dispatcher,
    };
    const response = await fetch(config.url, fetchOptions);

    if (response.status >= 300 && response.status < 400) {
      log.warn("Webhook redirect blocked", {
        url: config.url,
        status: response.status,
      });
      return {
        action: "next",
        data: { error: "Webhook redirect blocked", blocked: true },
      };
    }

    return {
      action: "next",
      data: { status: response.status, ok: response.ok },
    };
  } catch (error) {
    log.error("Webhook failed", error);
    return {
      action: "next",
      data: {
        error: error instanceof Error ? error.message : "Webhook failed",
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WAIT FOR EVENT
// ═══════════════════════════════════════════════════════════════════════════

export async function handleWaitForEvent(
  config: Extract<WorkflowStepConfig, { type: "wait_for_event" }>,
  execution: typeof workflowExecution.$inferSelect,
  stepId: string,
  organizationId: string
): Promise<{ action: "wait" }> {
  const timeoutSeconds = config.timeoutSeconds || 86_400; // Default 24 hours
  const timeoutAt = new Date(Date.now() + timeoutSeconds * 1000);

  // Schedule timeout
  const schedulerName = await scheduleWaitTimeout({
    executionId: execution.id,
    stepId,
    organizationId,
    timeoutSeconds,
  });

  // Update execution to waiting state
  await db
    .update(workflowExecution)
    .set({
      status: "waiting",
      waitingForEvent: config.eventName,
      waitTimeoutAt: timeoutAt,
      waitTimeoutSchedulerName: schedulerName,
      updatedAt: new Date(),
    })
    .where(eq(workflowExecution.id, execution.id));

  return { action: "wait" };
}

// ═══════════════════════════════════════════════════════════════════════════
// WAIT FOR EMAIL ENGAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export async function handleWaitForEmailEngagement(
  config: Extract<WorkflowStepConfig, { type: "wait_for_email_engagement" }>,
  execution: typeof workflowExecution.$inferSelect,
  step: WorkflowStep,
  organizationId: string
): Promise<{ action: "wait" }> {
  const timeoutSeconds = config.timeoutSeconds || 259_200; // Default 3 days
  const timeoutAt = new Date(Date.now() + timeoutSeconds * 1000);

  // Scope to cascade group if applicable, so we match the correct email
  const cascadeGroupId = step.cascadeGroupId;
  const sendStepFilter = cascadeGroupId
    ? sql`${workflowStepExecution.stepId} LIKE ${`${cascadeGroupId}-send-%`}`
    : undefined;

  // Find the previous send_email step execution to get the message ID
  const previousStepExecs = await db
    .select()
    .from(workflowStepExecution)
    .where(
      and(
        eq(workflowStepExecution.executionId, execution.id),
        eq(workflowStepExecution.stepType, "send_email"),
        eq(workflowStepExecution.status, "completed"),
        sendStepFilter
      )
    )
    .orderBy(sql`${workflowStepExecution.completedAt} DESC`)
    .limit(1);

  const lastEmailStep = previousStepExecs[0];
  const messageId = lastEmailStep?.result
    ? (lastEmailStep.result as Record<string, unknown>).messageId
    : undefined;

  // Schedule timeout
  const schedulerName = await scheduleWaitTimeout({
    executionId: execution.id,
    stepId: step.id,
    organizationId,
    timeoutSeconds,
  });

  // Update execution to waiting state
  // We use 'email_engagement' as a special event name prefix
  await db
    .update(workflowExecution)
    .set({
      status: "waiting",
      waitingForEvent: `email_engagement:${messageId || "unknown"}`,
      waitTimeoutAt: timeoutAt,
      waitTimeoutSchedulerName: schedulerName,
      updatedAt: new Date(),
    })
    .where(eq(workflowExecution.id, execution.id));

  return { action: "wait" };
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIBE / UNSUBSCRIBE TOPIC
// ═══════════════════════════════════════════════════════════════════════════

export async function handleSubscribeTopic(
  config: Extract<WorkflowStepConfig, { type: "subscribe_topic" }>,
  contactRecord: typeof contact.$inferSelect
): Promise<{ action: "next"; data: Record<string, unknown> }> {
  // Upsert contact-topic subscription
  await db
    .insert(contactTopic)
    .values({
      contactId: contactRecord.id,
      topicId: config.topicId,
      status: "subscribed",
      subscribedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [contactTopic.contactId, contactTopic.topicId],
      set: {
        status: "subscribed",
        subscribedAt: new Date(),
        unsubscribedAt: null,
      },
    });

  return {
    action: "next",
    data: {
      topicId: config.topicId,
      channel: config.channel,
      action: "subscribed",
    },
  };
}

export async function handleUnsubscribeTopic(
  config: Extract<WorkflowStepConfig, { type: "unsubscribe_topic" }>,
  contactRecord: typeof contact.$inferSelect
): Promise<{ action: "next"; data: Record<string, unknown> }> {
  // Update subscription to unsubscribe
  await db
    .update(contactTopic)
    .set({
      status: "unsubscribed",
      unsubscribedAt: new Date(),
    })
    .where(
      and(
        eq(contactTopic.contactId, contactRecord.id),
        eq(contactTopic.topicId, config.topicId)
      )
    );

  return {
    action: "next",
    data: {
      topicId: config.topicId,
      channel: config.channel,
      action: "unsubscribed",
    },
  };
}
