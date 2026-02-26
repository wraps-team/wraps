/**
 * Workflow Processor Worker
 *
 * SQS Lambda handler that processes workflow step executions.
 * Handles different step types and routes to next steps.
 */

import {
  PinpointSMSVoiceV2Client,
  SendTextMessageCommand,
} from "@aws-sdk/client-pinpoint-sms-voice-v2";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { toPlainText } from "@react-email/render";
import {
  type AutomationDefinitionSnapshot,
  type AutomationStep,
  type AutomationStepConfig,
  type AutomationTransition,
  awsAccount,
  CASCADE_ENGAGEMENT_FIELD,
  contact,
  contactIdsMatchingCondition,
  contactTopic,
  db,
  eq,
  messageSend,
  organization,
  type PreferredChannel,
  segment,
  type TriggerConfig,
  template,
  workflow,
  workflowExecution,
  workflowStepExecution,
} from "@wraps/db";
import {
  generateSESTemplateName,
  transformVariablesForSes,
  upsertSESTemplate,
} from "@wraps/email";
import type { SQSBatchResponse, SQSEvent } from "aws-lambda";
import { and, sql } from "drizzle-orm";
import Handlebars from "handlebars";

import { trackFirstEmailSent } from "../../lib/activation-tracking";
import { log } from "../../lib/logger";
import { generateUnsubscribeToken } from "../../lib/unsubscribe-token";
import {
  type AutomationJob,
  deleteScheduledStep,
  enqueueAutomationStep,
  enqueueAutomationStepBatch,
  scheduleAutomationStep,
  scheduleWaitTimeout,
} from "../../services/automation-queue";
import { createNextAutomationSchedule } from "../../services/automation-scheduler";
import { getCredentials } from "../../services/credentials";

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const results = await Promise.allSettled(
    event.Records.map(async (record) => {
      const job: AutomationJob = JSON.parse(record.body);

      switch (job.type) {
        case "execute":
          await processStep(job.executionId, job.stepId);
          break;
        case "resume":
          await resumeExecution(job.executionId, job.branch);
          break;
        case "trigger":
          await triggerWorkflow(
            job.workflowId,
            job.contactId,
            job.organizationId,
            job.eventData
          );
          break;
        case "schedule-trigger":
          await processScheduleTrigger(job.workflowId, job.organizationId);
          break;
      }
    })
  );

  const batchItemFailures = results
    .map((result, idx) => {
      if (result.status === "rejected") {
        log.error("Error processing workflow job", result.reason);
        return { itemIdentifier: event.Records[idx].messageId };
      }
      return null;
    })
    .filter((f): f is { itemIdentifier: string } => f !== null);

  return { batchItemFailures };
};

/**
 * Trigger a new workflow execution for a contact
 */
async function triggerWorkflow(
  workflowId: string,
  contactId: string,
  organizationId: string,
  eventData?: Record<string, unknown>
): Promise<void> {
  // Load workflow (scoped by org for defense-in-depth)
  const [wf] = await db
    .select()
    .from(workflow)
    .where(
      and(
        eq(workflow.id, workflowId),
        eq(workflow.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!wf || wf.status !== "enabled") {
    log.warn("Workflow not found or not enabled", { workflowId });
    return;
  }

  // Check reentry delay for completed executions (only when reentry not allowed)
  if (
    !wf.allowReentry &&
    wf.reentryDelaySeconds &&
    wf.reentryDelaySeconds > 0
  ) {
    const reentryCutoff = new Date(Date.now() - wf.reentryDelaySeconds * 1000);
    const recentlyCompleted = await db.query.workflowExecution.findFirst({
      where: and(
        eq(workflowExecution.workflowId, workflowId),
        eq(workflowExecution.contactId, contactId),
        eq(workflowExecution.status, "completed"),
        sql`${workflowExecution.completedAt} > ${reentryCutoff}`
      ),
    });

    if (recentlyCompleted) {
      log.info("Workflow skip: reentry delay", {
        contactId,
        workflowId,
        reentryDelaySeconds: wf.reentryDelaySeconds,
      });
      await incrementDroppedExecutions(workflowId);
      return;
    }
  }

  // Check contact cooldown (any workflow in this org)
  if (wf.contactCooldownSeconds && wf.contactCooldownSeconds > 0) {
    const cooldownCutoff = new Date(
      Date.now() - wf.contactCooldownSeconds * 1000
    );
    const recentExecution = await db.query.workflowExecution.findFirst({
      where: and(
        eq(workflowExecution.organizationId, organizationId),
        eq(workflowExecution.contactId, contactId),
        sql`${workflowExecution.createdAt} > ${cooldownCutoff}`
      ),
    });

    if (recentExecution) {
      log.info("Workflow skip: contact cooldown", {
        contactId,
        cooldownSeconds: wf.contactCooldownSeconds,
      });
      await incrementDroppedExecutions(workflowId);
      return;
    }
  }

  // Check maxConcurrentExecutions limit
  if (wf.maxConcurrentExecutions && wf.maxConcurrentExecutions > 0) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(workflowExecution)
      .where(
        and(
          eq(workflowExecution.workflowId, workflowId),
          sql`${workflowExecution.status} IN ('pending', 'active', 'paused', 'waiting')`
        )
      );

    if (count >= wf.maxConcurrentExecutions) {
      log.info("Workflow skip: max concurrent", {
        workflowId,
        current: count,
        max: wf.maxConcurrentExecutions,
      });
      await incrementDroppedExecutions(workflowId);
      return;
    }
  }

  // Find the trigger step to get the first connected step
  const steps = wf.steps as AutomationStep[];
  const transitions = wf.transitions as AutomationTransition[];

  const triggerStep = steps.find((s) => s.type === "trigger");
  if (!triggerStep) {
    log.error("No trigger step found in workflow", undefined, { workflowId });
    return;
  }

  // Find the first step after trigger
  const firstTransition = transitions.find(
    (t) => t.fromStepId === triggerStep.id
  );
  const firstStepId = firstTransition?.toStepId;

  if (!firstStepId) {
    log.warn("Workflow has no steps after trigger", { workflowId });
    return;
  }

  // Snapshot the definition so in-flight executions are immune to edits
  const definitionSnapshot: AutomationDefinitionSnapshot = {
    steps,
    transitions,
    workflowVersion: wf.version,
  };

  // Create execution + update stats in a transaction to prevent counter drift
  const execution = await db.transaction(async (tx) => {
    // Uses ON CONFLICT DO NOTHING with partial unique index to prevent race conditions
    // when allowReentry=false. The index only applies to active statuses.
    const [row] = await tx
      .insert(workflowExecution)
      .values({
        workflowId,
        contactId,
        organizationId,
        allowReentry: wf.allowReentry, // Denormalized for partial unique index
        status: "active",
        currentStepId: firstStepId,
        definitionSnapshot,
        triggerData: eventData ?? {},
        startedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();

    if (!row) return null;

    await tx
      .update(workflow)
      .set({
        totalExecutions: sql`${workflow.totalExecutions} + 1`,
        activeExecutions: sql`${workflow.activeExecutions} + 1`,
        lastTriggeredAt: new Date(),
      })
      .where(eq(workflow.id, workflowId));

    return row;
  });

  // If no row returned, a conflict occurred (contact already in workflow)
  if (!execution) {
    log.info("Workflow skip: duplicate execution", { contactId, workflowId });
    await incrementDroppedExecutions(workflowId);
    return;
  }

  // Process first step
  await enqueueAutomationStep({
    type: "execute",
    executionId: execution.id,
    stepId: firstStepId,
    organizationId,
  });
}

// Maximum contacts to process per schedule trigger
const MAX_CONTACTS_PER_TRIGGER = 1000;

/**
 * Process a schedule-trigger job.
 *
 * Fires when a one-time EventBridge Schedule goes off for a workflow.
 * Loads the workflow, verifies it's still enabled, fans out trigger jobs
 * to all matching contacts, then chains the next schedule.
 */
async function processScheduleTrigger(
  workflowId: string,
  organizationId: string
): Promise<void> {
  const now = new Date();

  // Load workflow
  const [wf] = await db
    .select()
    .from(workflow)
    .where(
      and(
        eq(workflow.id, workflowId),
        eq(workflow.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!wf) {
    log.info("Schedule trigger: workflow not found, chain stops", {
      workflowId,
    });
    return;
  }

  if (wf.status !== "enabled" || wf.triggerType !== "schedule") {
    log.info("Schedule trigger: workflow not eligible, chain stops", {
      workflowId,
      status: wf.status,
      triggerType: wf.triggerType,
    });
    return;
  }

  const config = wf.triggerConfig as TriggerConfig;

  if (!config.schedule) {
    log.info("Schedule trigger: no cron schedule, chain stops", { workflowId });
    return;
  }

  log.info("Schedule trigger: processing workflow", {
    workflowId,
    workflowName: wf.name,
  });

  // Get contacts to trigger for
  let contacts: { id: string }[];

  if (config.segmentId) {
    contacts = await getSegmentContacts(config.segmentId, organizationId);
  } else {
    // Get all active contacts in the organization
    contacts = await db
      .select({ id: contact.id })
      .from(contact)
      .where(
        and(
          eq(contact.organizationId, organizationId),
          eq(contact.status, "active")
        )
      )
      .limit(MAX_CONTACTS_PER_TRIGGER);
  }

  log.info("Schedule trigger: triggering workflow for contacts", {
    workflowId,
    contactCount: contacts.length,
  });

  // Batch enqueue trigger jobs for all contacts
  await enqueueAutomationStepBatch(
    contacts.map((c) => ({
      type: "trigger" as const,
      workflowId,
      contactId: c.id,
      organizationId,
      eventData: {
        triggerType: "schedule",
        triggeredAt: now.toISOString(),
        cronExpression: config.schedule,
      },
    }))
  );

  // Update last triggered timestamp
  await db
    .update(workflow)
    .set({ lastTriggeredAt: now })
    .where(eq(workflow.id, workflowId));

  // Chain: create the next schedule
  // Isolated in try/catch — failure must NOT propagate to SQS retry,
  // which would duplicate the contact fan-out that already succeeded above.
  try {
    await createNextAutomationSchedule({
      workflowId,
      organizationId,
      cronExpression: config.schedule,
      timezone: config.timezone,
    });
    log.info("Schedule trigger: complete, next schedule chained", {
      workflowId,
      executionsTriggered: contacts.length,
    });
  } catch (chainError) {
    log.error(
      "Schedule trigger: CHAIN BROKEN — failed to create next schedule",
      chainError,
      {
        workflowId,
        organizationId,
        cronExpression: config.schedule,
        chainBroken: true,
      }
    );
    // Do NOT re-throw. Contact fan-out and lastTriggeredAt already succeeded.
    // The DLQ handler and reconciliation job will detect and repair broken chains.
  }
}

/**
 * Get contacts that match a segment's filter criteria.
 * Uses bulk evaluation (3 queries total) instead of per-contact evaluation.
 */
async function getSegmentContacts(
  segmentId: string,
  organizationId: string
): Promise<{ id: string }[]> {
  // 1. Fetch segment condition
  const [seg] = await db
    .select({ condition: segment.condition })
    .from(segment)
    .where(eq(segment.id, segmentId))
    .limit(1);

  if (!seg) {
    log.warn("Schedule trigger: segment not found", { segmentId });
    return [];
  }

  // 2. Get all active contacts in the organization
  const allContacts = await db
    .select({ id: contact.id })
    .from(contact)
    .where(
      and(
        eq(contact.organizationId, organizationId),
        eq(contact.status, "active")
      )
    )
    .limit(MAX_CONTACTS_PER_TRIGGER);

  if (allContacts.length === 0) {
    return [];
  }

  log.info("Schedule trigger: evaluating segment", {
    segmentId,
    contactCount: allContacts.length,
  });

  // 3. SQL-based batch evaluation (1 query)
  const matchingIds = await contactIdsMatchingCondition(
    db,
    allContacts.map((c) => c.id),
    organizationId,
    seg.condition
  );

  const matchingIdSet = new Set(matchingIds);
  const matchingContacts = allContacts.filter((c) => matchingIdSet.has(c.id));

  log.info("Schedule trigger: segment evaluation complete", {
    segmentId,
    matchingCount: matchingContacts.length,
  });

  return matchingContacts;
}

/**
 * Process a single workflow step
 */
async function processStep(executionId: string, stepId: string): Promise<void> {
  // Load execution with workflow and contact
  const execution = await db.query.workflowExecution.findFirst({
    where: eq(workflowExecution.id, executionId),
  });

  if (!execution) {
    log.error("Execution not found", undefined, { executionId });
    return;
  }

  if (execution.status === "cancelled" || execution.status === "completed") {
    log.info("Execution already completed", {
      executionId,
      status: execution.status,
    });
    return;
  }

  // Load workflow (scoped by org for defense-in-depth)
  const [wf] = await db
    .select()
    .from(workflow)
    .where(
      and(
        eq(workflow.id, execution.workflowId),
        eq(workflow.organizationId, execution.organizationId)
      )
    )
    .limit(1);

  if (!wf) {
    log.error("Workflow not found", undefined, {
      workflowId: execution.workflowId,
    });
    return;
  }

  // Load contact (scoped by org for defense-in-depth)
  const [contactRecord] = await db
    .select()
    .from(contact)
    .where(
      and(
        eq(contact.id, execution.contactId),
        eq(contact.organizationId, execution.organizationId)
      )
    )
    .limit(1);

  if (!contactRecord) {
    log.error("Contact not found", undefined, {
      contactId: execution.contactId,
    });
    await failExecution(executionId, "Contact not found", stepId);
    return;
  }

  // Use the frozen definition snapshot (immune to live edits) with
  // fallback to the live definition for pre-snapshot executions
  const snapshot =
    execution.definitionSnapshot as AutomationDefinitionSnapshot | null;
  const steps = snapshot?.steps ?? (wf.steps as AutomationStep[]);
  const step = steps.find((s) => s.id === stepId);

  if (!step) {
    log.error("Step not found in workflow", undefined, { stepId });
    await failExecution(executionId, `Step ${stepId} not found`, stepId);
    return;
  }

  // Atomic idempotency check and step execution creation
  // Uses ON CONFLICT to prevent race conditions with duplicate SQS messages
  const idempotencyKey = `${executionId}-${stepId}`;

  const [stepExec] = await db
    .insert(workflowStepExecution)
    .values({
      executionId,
      stepId,
      stepType: step.type,
      status: "executing",
      idempotencyKey,
      startedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: workflowStepExecution.idempotencyKey,
      set: {
        // Only update if not already completed (prevents re-execution)
        status: sql`CASE WHEN ${workflowStepExecution.status} = 'completed' THEN ${workflowStepExecution.status} ELSE 'executing' END`,
        startedAt: sql`CASE WHEN ${workflowStepExecution.status} = 'completed' THEN ${workflowStepExecution.startedAt} ELSE ${new Date().toISOString()}::timestamp END`,
      },
    })
    .returning();

  // If step was already completed, skip execution
  if (stepExec.status === "completed") {
    log.info("Step already executed", { stepId, executionId });
    return;
  }

  // Update execution current step
  await db
    .update(workflowExecution)
    .set({ currentStepId: stepId, status: "active", updatedAt: new Date() })
    .where(eq(workflowExecution.id, executionId));

  // Execute step based on type
  try {
    const result = await executeStep(
      step,
      execution,
      contactRecord,
      wf.organizationId
    );

    // Mark step as completed
    await db
      .update(workflowStepExecution)
      .set({
        status: "completed",
        branch: result.branch,
        result: result.data,
        completedAt: new Date(),
      })
      .where(eq(workflowStepExecution.id, stepExec.id));

    // Handle step result — use snapshot transitions for routing
    const snapshotWf = snapshot
      ? { ...wf, steps, transitions: snapshot.transitions }
      : wf;
    if (result.action === "next") {
      await processNextStep(execution, step, snapshotWf, result.branch);
    } else if (result.action === "wait") {
      // Step is waiting (e.g., delay scheduled, waiting for event)
      // Execution status already updated by the step handler
    } else if (result.action === "exit") {
      await completeExecution(executionId);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("Step failed", error, { stepId, executionId });

    await db
      .update(workflowStepExecution)
      .set({
        status: "failed",
        error: errorMessage,
        completedAt: new Date(),
      })
      .where(eq(workflowStepExecution.id, stepExec.id));

    await failExecution(executionId, errorMessage, stepId);
  }
}

/**
 * Execute a single step and return the result
 */
type WorkflowBranch =
  | "yes"
  | "no"
  | "timeout"
  | "default"
  | "opened"
  | "clicked"
  | "bounced";

async function executeStep(
  step: AutomationStep,
  execution: typeof workflowExecution.$inferSelect,
  contactRecord: typeof contact.$inferSelect,
  organizationId: string
): Promise<{
  action: "next" | "wait" | "exit";
  branch?: WorkflowBranch;
  data?: Record<string, unknown>;
}> {
  const config = step.config;

  switch (config.type) {
    case "trigger":
      // Trigger is just an entry point, proceed to next
      return { action: "next" };

    case "send_email":
      return await handleSendEmail(
        config,
        execution,
        contactRecord,
        organizationId
      );

    case "send_sms":
      return await handleSendSms(
        config,
        execution,
        contactRecord,
        organizationId
      );

    case "delay":
      return await handleDelay(config, execution, step.id, organizationId);

    case "condition":
      return await handleCondition(config, contactRecord, execution, step);

    case "update_contact":
      return await handleUpdateContact(config, contactRecord);

    case "webhook":
      return await handleWebhook(config, contactRecord, execution);

    case "wait_for_event":
      return await handleWaitForEvent(
        config,
        execution,
        step.id,
        organizationId
      );

    case "wait_for_email_engagement":
      return await handleWaitForEmailEngagement(
        config,
        execution,
        step,
        organizationId
      );

    case "subscribe_topic":
      return await handleSubscribeTopic(config, contactRecord);

    case "unsubscribe_topic":
      return await handleUnsubscribeTopic(config, contactRecord);

    case "exit":
      return { action: "exit" };

    default:
      throw new Error(
        `Unknown step type: ${(config as { type: string }).type}`
      );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

async function handleSendEmail(
  config: Extract<AutomationStepConfig, { type: "send_email" }>,
  execution: typeof workflowExecution.$inferSelect,
  contactRecord: typeof contact.$inferSelect,
  organizationId: string
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

  // Check contact email status
  if (
    contactRecord.emailStatus === "unsubscribed" ||
    contactRecord.emailStatus === "bounced" ||
    contactRecord.emailStatus === "complained"
  ) {
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

  // Get AWS account region
  const [account] = await db
    .select({ region: awsAccount.region })
    .from(awsAccount)
    .where(eq(awsAccount.id, wf.awsAccountId))
    .limit(1);

  if (!account) {
    throw new Error(`AWS account ${wf.awsAccountId} not found`);
  }

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

  // Get credentials for customer's AWS account
  const credentials = await getCredentials(wf.awsAccountId);

  // Create SES client
  const sesClient = new SESv2Client({
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  // Build variable replacement data
  const replacementData: Record<string, string> = {
    email: contactRecord.email,
    contactEmail: contactRecord.email,
  };

  const addIfPresent = (key: string, value: string | null | undefined) => {
    if (value) {
      replacementData[key] = value;
    }
  };

  addIfPresent("firstName", contactRecord.firstName);
  addIfPresent("lastName", contactRecord.lastName);
  addIfPresent("company", contactRecord.company);
  addIfPresent("jobTitle", contactRecord.jobTitle);
  addIfPresent("contactFirstName", contactRecord.firstName);
  addIfPresent("contactLastName", contactRecord.lastName);
  addIfPresent("contactCompany", contactRecord.company);
  addIfPresent("contactJobTitle", contactRecord.jobTitle);
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

  // Generate unsubscribe URLs for marketing emails
  const isMarketing = tmpl.emailType === "marketing";
  const apiBaseUrl = process.env.API_BASE_URL || "https://api.wraps.dev";
  const appBaseUrl = process.env.APP_BASE_URL || "https://app.wraps.dev";

  let unsubscribeUrl: string | undefined;
  let preferencesUrl: string | undefined;

  if (isMarketing) {
    const unsubscribeToken = await generateUnsubscribeToken(
      contactRecord.id,
      organizationId
    );
    unsubscribeUrl = `${apiBaseUrl}/unsubscribe/${unsubscribeToken}`;
    preferencesUrl = `${appBaseUrl}/preferences/${unsubscribeToken}`;
    replacementData.unsubscribeUrl = unsubscribeUrl;
    replacementData.preferencesUrl = preferencesUrl;
  }

  // Build from address (step config > workflow default > fallback)
  const fromAddress =
    config.from ||
    wf.defaultFrom ||
    `noreply@${process.env.DEFAULT_DOMAIN || "wraps.dev"}`;
  const fromName = config.fromName || wf.defaultFromName;
  const fromDisplay = fromName ? `${fromName} <${fromAddress}>` : fromAddress;
  const replyTo = config.replyTo || wf.defaultReplyTo;

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

  let result: { MessageId?: string };
  let subject: string;

  if (sesTemplateName) {
    // Use SES template - let SES handle variable substitution
    // Transform subject for SES (handles both simple vars and fallbacks)
    subject = sanitizeEmailSubject(tmpl.subject || "Message");

    result = await sesClient.send(
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
        ConfigurationSetName: "wraps-email-tracking",
        EmailTags: emailTags,
      })
    );

    log.info("Workflow: email sent via SES template", {
      template: sesTemplateName,
      to: contactRecord.email,
    });
  } else {
    // Fallback: Apply variable substitution locally and send raw HTML
    const html = substituteVariables(tmpl.compiledHtml, replacementData, {
      escapeHtml: true,
    });

    // Build subject with variable substitution
    const rawSubject = substituteVariables(
      tmpl.subject || "Message",
      replacementData
    );
    subject = sanitizeEmailSubject(rawSubject);

    result = await sesClient.send(
      new SendEmailCommand({
        FromEmailAddress: fromDisplay,
        ReplyToAddresses: replyTo ? [replyTo] : undefined,
        Destination: {
          ToAddresses: [contactRecord.email],
        },
        Content: {
          Simple: {
            Subject: { Data: subject },
            Body: {
              Html: { Data: html },
              Text: { Data: htmlToPlainText(html) },
            },
            Headers: headers.length > 0 ? headers : undefined,
          },
        },
        ConfigurationSetName: "wraps-email-tracking",
        EmailTags: emailTags,
      })
    );

    log.info("Workflow: email sent via raw HTML", { to: contactRecord.email });
  }

  const messageId = result.MessageId ?? "";

  // Record the send in messageSend table
  // Note: workflowExecutionId is not yet in schema, will be added later
  await db.insert(messageSend).values({
    organizationId,
    contactId: contactRecord.id,
    awsAccountId: wf.awsAccountId,
    channel: "email",
    sourceType: "workflow",
    recipient: contactRecord.email,
    subject,
    from: fromAddress,
    fromName: fromName || null,
    emailTemplateId: config.templateId,
    messageId,
    status: "sent",
    sentAt: new Date(),
  });

  // Track first email sent (must await in Lambda)
  await trackFirstEmailSent(organizationId, {
    channel: "email",
    source: "workflow",
  });

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

/**
 * Substitute variables in text with values from a data object
 * Uses Handlebars to properly evaluate conditional syntax like:
 *   {{#if contactFirstName}}{{contactFirstName}}{{else}}there{{/if}}
 *
 * This is needed because compiledHtml contains SES-compatible Handlebars syntax
 * from transformVariablesForSes, and workflow sends use direct HTML (not SES templates).
 *
 * Handlebars automatically escapes HTML in {{variable}} expressions for safety.
 *
 * @exported for testing
 */
export function substituteVariables(
  text: string,
  data: Record<string, string>,
  _options: { escapeHtml?: boolean } = {}
): string {
  try {
    // Compile and execute the Handlebars template
    const template = Handlebars.compile(text, { noEscape: false });
    return template(data);
  } catch (error) {
    // If Handlebars fails, fall back to simple regex replacement
    log.warn("Workflow: Handlebars compilation failed, using fallback", {
      error: String(error),
    });
    return text.replace(
      /\{\{\s*(?:contact\.)?([a-zA-Z0-9_]+)\s*\}\}/g,
      (_match, key) => {
        const value = data[key.trim()];
        return value ?? "";
      }
    );
  }
}

/**
 * Sanitize email subject line
 * - Removes newlines to prevent header injection
 * - Collapses whitespace
 * - Truncates to reasonable length (998 chars per RFC 2822)
 */
export function sanitizeEmailSubject(subject: string): string {
  return subject
    .replace(/[\r\n]+/g, " ") // Remove newlines (header injection prevention)
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim()
    .slice(0, 998); // RFC 2822 max line length
}

/**
 * Convert HTML to plain text for email fallback
 * Uses react-email's toPlainText for robust HTML-to-text conversion
 */
function htmlToPlainText(html: string): string {
  return toPlainText(html);
}

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
    const sesText = htmlToPlainText(sesHtml);
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

/**
 * Validate phone number is in E.164 format
 * E.164: +[country code][subscriber number] (e.g., +15551234567)
 */
export function isValidE164Phone(phone: string): boolean {
  // E.164 format: + followed by 10-15 digits
  const e164Regex = /^\+[1-9]\d{9,14}$/;
  return e164Regex.test(phone);
}

async function handleSendSms(
  config: Extract<AutomationStepConfig, { type: "send_sms" }>,
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

  // Get credentials for the customer's AWS account
  const credentials = await getCredentials(wf.awsAccountId);

  // Create Pinpoint SMS Voice V2 client with assumed credentials
  const smsClient = new PinpointSMSVoiceV2Client({
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
  const replacementData: Record<string, string> = {};

  const addIfPresent = (key: string, value: string | null | undefined) => {
    if (value) replacementData[key] = value;
  };

  addIfPresent("email", contactRecord.email);
  addIfPresent("contactEmail", contactRecord.email);
  addIfPresent("firstName", contactRecord.firstName);
  addIfPresent("lastName", contactRecord.lastName);
  addIfPresent("company", contactRecord.company);
  addIfPresent("jobTitle", contactRecord.jobTitle);
  addIfPresent("contactFirstName", contactRecord.firstName);
  addIfPresent("contactLastName", contactRecord.lastName);
  addIfPresent("contactCompany", contactRecord.company);
  addIfPresent("contactJobTitle", contactRecord.jobTitle);
  addIfPresent("phone", contactRecord.phone);

  // Add contact properties
  const properties = contactRecord.properties as Record<string, unknown> | null;
  if (properties) {
    for (const [key, value] of Object.entries(properties)) {
      const strValue = value != null ? String(value) : null;
      if (strValue) replacementData[key] = strValue;
    }
  }

  // Add trigger data
  const triggerData = execution.triggerData as Record<string, unknown> | null;
  if (triggerData) {
    for (const [key, value] of Object.entries(triggerData)) {
      const strValue = value != null ? String(value) : null;
      if (strValue) replacementData[key] = strValue;
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

  log.info("Workflow: SMS sent", {
    to: contactRecord.phone,
    messageId: response.MessageId,
  });

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
      messageId: response.MessageId,
      recipient: contactRecord.phone,
      body: messageBody,
      timestamp: new Date().toISOString(),
    },
  };
}

async function handleDelay(
  config: Extract<AutomationStepConfig, { type: "delay" }>,
  execution: typeof workflowExecution.$inferSelect,
  stepId: string,
  organizationId: string
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
    execution.definitionSnapshot as AutomationDefinitionSnapshot | null;
  let transitions: AutomationTransition[] | undefined;

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
    transitions = wf?.transitions as AutomationTransition[] | undefined;
  }

  const nextTransition = transitions?.find((t) => t.fromStepId === stepId);

  if (!nextTransition) {
    // No next step - complete execution
    await completeExecution(execution.id);
    return { action: "wait" };
  }

  // Schedule the next step
  const schedulerName = await scheduleAutomationStep({
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

async function handleCondition(
  config: Extract<AutomationStepConfig, { type: "condition" }>,
  contactRecord: typeof contact.$inferSelect,
  execution: typeof workflowExecution.$inferSelect,
  step: AutomationStep
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

  // Strip "properties." prefix — the editor generates field values like
  // "properties.plan" for custom properties, but the actual key in the
  // properties object is just "plan".
  const field = config.field.startsWith("properties.")
    ? config.field.slice("properties.".length)
    : config.field;

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

export function evaluateCondition(
  fieldValue: unknown,
  operator: string,
  compareValue: unknown
): boolean {
  const strFieldValue = String(fieldValue ?? "");
  const strCompareValue = String(compareValue ?? "");

  switch (operator) {
    case "equals":
      return strFieldValue === strCompareValue;
    case "not_equals":
      return strFieldValue !== strCompareValue;
    case "contains":
      return strFieldValue.includes(strCompareValue);
    case "not_contains":
      return !strFieldValue.includes(strCompareValue);
    case "starts_with":
      return strFieldValue.startsWith(strCompareValue);
    case "ends_with":
      return strFieldValue.endsWith(strCompareValue);
    case "greater_than":
      return Number(fieldValue) > Number(compareValue);
    case "less_than":
      return Number(fieldValue) < Number(compareValue);
    case "greater_than_or_equals":
      return Number(fieldValue) >= Number(compareValue);
    case "less_than_or_equals":
      return Number(fieldValue) <= Number(compareValue);
    case "is_true":
      return (
        fieldValue === true || strFieldValue === "true" || strFieldValue === "1"
      );
    case "is_false":
      return (
        fieldValue === false ||
        fieldValue === null ||
        fieldValue === undefined ||
        strFieldValue === "false" ||
        strFieldValue === "0" ||
        strFieldValue === ""
      );
    case "is_set":
      return (
        fieldValue !== null && fieldValue !== undefined && fieldValue !== ""
      );
    case "is_not_set":
      return (
        fieldValue === null || fieldValue === undefined || fieldValue === ""
      );
    default:
      log.warn("Unknown condition operator", { operator });
      return false;
  }
}

const FIRST_CLASS_CONTACT_FIELDS = new Set([
  "preferredChannel",
  "firstName",
  "lastName",
  "company",
  "jobTitle",
]);

export async function handleUpdateContact(
  config: Extract<AutomationStepConfig, { type: "update_contact" }>,
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

const BLOCKED_IPV4_RANGES = [
  { prefix: "127.", label: "loopback" },
  { prefix: "10.", label: "private (10/8)" },
  { prefix: "169.254.", label: "link-local/IMDS" },
  { prefix: "0.", label: "unspecified" },
] as const;

/** @exported for testing */
export function isBlockedIp(ip: string): string | null {
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) — extract the IPv4 and re-check
  if (ip.startsWith("::ffff:")) {
    const v4 = ip.slice(7);
    if (v4.includes(".")) return isBlockedIp(v4);
  }

  for (const range of BLOCKED_IPV4_RANGES) {
    if (ip.startsWith(range.prefix)) return range.label;
  }
  // 100.64.0.0/10 (Carrier-grade NAT / AWS VPC)
  if (ip.startsWith("100.")) {
    const second = Number.parseInt(ip.split(".")[1], 10);
    if (second >= 64 && second <= 127) return "private (100.64/10 CGN)";
  }
  // 172.16.0.0/12
  if (ip.startsWith("172.")) {
    const second = Number.parseInt(ip.split(".")[1], 10);
    if (second >= 16 && second <= 31) return "private (172.16/12)";
  }
  // 192.168.0.0/16
  if (ip.startsWith("192.168.")) return "private (192.168/16)";
  // IPv6
  if (ip === "::1" || ip === "::") return "loopback";
  if (ip.startsWith("fe80:")) return "link-local";
  if (ip.startsWith("fd") || ip.startsWith("fc")) return "private (ULA)";
  return null;
}

/** @exported for testing */
export async function validateWebhookUrl(url: string): Promise<void> {
  const parsed = new URL(url);

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Webhook URL must use http(s), got ${parsed.protocol}`);
  }

  const dns = await import("node:dns/promises");
  const { address } = await dns.lookup(parsed.hostname);
  const blockedReason = isBlockedIp(address);
  if (blockedReason) {
    throw new Error(
      `Webhook URL resolves to blocked address (${blockedReason}): ${parsed.hostname} -> ${address}`
    );
  }
}

async function handleWebhook(
  config: Extract<AutomationStepConfig, { type: "webhook" }>,
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

  const body = {
    contact: {
      id: contactRecord.id,
      email: contactRecord.email,
      properties: contactRecord.properties,
    },
    execution: {
      id: execution.id,
      workflowId: execution.workflowId,
      triggerData: execution.triggerData,
    },
    ...(config.body || {}),
  };

  try {
    const response = await fetch(config.url, {
      method: config.method,
      headers: {
        "Content-Type": "application/json",
        ...(config.headers || {}),
      },
      body: config.method !== "GET" ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });

    return {
      action: "next",
      data: {
        status: response.status,
        ok: response.ok,
      },
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

async function handleWaitForEvent(
  config: Extract<AutomationStepConfig, { type: "wait_for_event" }>,
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

export async function handleWaitForEmailEngagement(
  config: Extract<AutomationStepConfig, { type: "wait_for_email_engagement" }>,
  execution: typeof workflowExecution.$inferSelect,
  step: AutomationStep,
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

async function handleSubscribeTopic(
  config: Extract<AutomationStepConfig, { type: "subscribe_topic" }>,
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

async function handleUnsubscribeTopic(
  config: Extract<AutomationStepConfig, { type: "unsubscribe_topic" }>,
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

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION FLOW HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process the next step in the workflow
 */
async function processNextStep(
  execution: typeof workflowExecution.$inferSelect,
  currentStep: AutomationStep,
  wf: typeof workflow.$inferSelect,
  branch?: WorkflowBranch
): Promise<void> {
  const transitions = wf.transitions as AutomationTransition[];

  // Find matching transition
  let nextTransition: AutomationTransition | undefined;

  if (branch) {
    // Look for transition with matching branch
    nextTransition = transitions.find(
      (t) => t.fromStepId === currentStep.id && t.condition?.branch === branch
    );
  }

  // Fallback to branchless transition only when no specific branch was requested.
  // When a branch IS specified (e.g., condition "yes"/"no"), falling back to a
  // branchless transition would incorrectly route through an unrelated path.
  if (!(nextTransition || branch)) {
    nextTransition = transitions.find(
      (t) => t.fromStepId === currentStep.id && !t.condition
    );
  }

  if (!nextTransition) {
    // No next step - complete execution
    await completeExecution(execution.id);
    return;
  }

  // Enqueue next step for processing
  await enqueueAutomationStep({
    type: "execute",
    executionId: execution.id,
    stepId: nextTransition.toStepId,
    organizationId: wf.organizationId,
  });
}

/**
 * Resume a paused/waiting execution.
 *
 * Uses an atomic UPDATE … WHERE status='waiting' RETURNING * to claim the
 * execution. If another handler (engagement webhook vs timeout scheduler)
 * already claimed it, Postgres returns zero rows and we bail out — no
 * duplicate emails, no corrupted state.
 */
async function resumeExecution(
  executionId: string,
  branch: WorkflowBranch
): Promise<void> {
  // Atomic claim: only one caller can transition waiting → active
  const [claimed] = await db
    .update(workflowExecution)
    .set({
      status: "active",
      waitingForEvent: null,
      waitTimeoutAt: null,
      // Keep waitTimeoutSchedulerName so RETURNING gives us the old value
      // for cancellation below. Stale name on an active execution is harmless.
      delaySchedulerName: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workflowExecution.id, executionId),
        eq(workflowExecution.status, "waiting")
      )
    )
    .returning();

  if (!claimed) {
    log.info("Execution already claimed by another handler", {
      executionId,
      branch,
    });
    return;
  }

  // Cancel the timeout scheduler if we were resumed by an engagement event
  if (branch !== "timeout" && claimed.waitTimeoutSchedulerName) {
    await deleteScheduledStep(claimed.waitTimeoutSchedulerName);
  }

  // Load workflow for infrastructure config (awsAccountId, sender defaults)
  const [wf] = await db
    .select()
    .from(workflow)
    .where(
      and(
        eq(workflow.id, claimed.workflowId),
        eq(workflow.organizationId, claimed.organizationId)
      )
    )
    .limit(1);

  if (!wf) {
    log.error("Workflow not found", undefined, {
      workflowId: claimed.workflowId,
    });
    await failExecution(
      executionId,
      "Workflow not found",
      claimed.currentStepId ?? "unknown"
    );
    return;
  }

  // Use snapshot (immune to live edits) with fallback for pre-snapshot executions
  const snapshot =
    claimed.definitionSnapshot as AutomationDefinitionSnapshot | null;
  const steps = snapshot?.steps ?? (wf.steps as AutomationStep[]);
  const currentStep = steps.find((s) => s.id === claimed.currentStepId);

  if (!currentStep) {
    log.error("Current step not found", undefined, {
      stepId: claimed.currentStepId,
    });
    await failExecution(
      executionId,
      `Step ${claimed.currentStepId} not found`,
      claimed.currentStepId ?? "unknown"
    );
    return;
  }

  // Record step completion with branch
  // Note: wait steps are already marked "completed" (with branch=null) when the
  // wait state is entered. This UPDATE overwrites the branch with the actual
  // resume reason. The atomic claim above is the real race-condition gate.
  await db
    .update(workflowStepExecution)
    .set({
      status: "completed",
      branch,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(workflowStepExecution.executionId, executionId),
        eq(workflowStepExecution.stepId, currentStep.id)
      )
    );

  // Process next step based on branch — use snapshot transitions for routing
  const snapshotWf = snapshot
    ? { ...wf, steps, transitions: snapshot.transitions }
    : wf;
  await processNextStep(claimed, currentStep, snapshotWf, branch);
}

/**
 * Mark execution as completed
 */
async function completeExecution(executionId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [execution] = await tx
      .update(workflowExecution)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workflowExecution.id, executionId))
      .returning();

    if (execution) {
      await tx
        .update(workflow)
        .set({
          activeExecutions: sql`GREATEST(0, ${workflow.activeExecutions} - 1)`,
          completedExecutions: sql`${workflow.completedExecutions} + 1`,
        })
        .where(eq(workflow.id, execution.workflowId));
    }
  });
}

/**
 * Increment the dropped executions counter on a workflow
 */
async function incrementDroppedExecutions(workflowId: string): Promise<void> {
  await db
    .update(workflow)
    .set({
      droppedExecutions: sql`${workflow.droppedExecutions} + 1`,
    })
    .where(eq(workflow.id, workflowId));
}

/**
 * Mark execution as failed
 */
async function failExecution(
  executionId: string,
  error: string,
  stepId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const [execution] = await tx
      .update(workflowExecution)
      .set({
        status: "failed",
        error,
        errorStepId: stepId,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workflowExecution.id, executionId))
      .returning();

    if (execution) {
      await tx
        .update(workflow)
        .set({
          activeExecutions: sql`GREATEST(0, ${workflow.activeExecutions} - 1)`,
          failedExecutions: sql`${workflow.failedExecutions} + 1`,
        })
        .where(eq(workflow.id, execution.workflowId));
    }
  });
}
