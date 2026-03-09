/**
 * Workflow Processor Worker
 *
 * SQS Lambda handler that processes workflow step executions.
 * Handles different step types and routes to next steps.
 */

import {
  contact,
  contactIdsMatchingCondition,
  db,
  eq,
  segment,
  type TriggerConfig,
  type WorkflowDefinitionSnapshot,
  type WorkflowStep,
  type WorkflowTransition,
  workflow,
  workflowExecution,
  workflowStepExecution,
} from "@wraps/db";
import type { SQSBatchResponse, SQSEvent } from "aws-lambda";
import { and, sql } from "drizzle-orm";

import { flushLogger, log } from "../../lib/logger";

import {
  deleteScheduledStep,
  enqueueWorkflowStep,
  enqueueWorkflowStepBatch,
  type WorkflowJob,
} from "../../services/workflow-queue";
import { createNextWorkflowSchedule } from "../../services/workflow-scheduler";

import {
  handleCondition,
  handleDelay,
  handleSendEmail,
  handleSendSms,
  handleSubscribeTopic,
  handleUnsubscribeTopic,
  handleUpdateContact,
  handleWaitForEmailEngagement,
  handleWaitForEvent,
  handleWebhook,
} from "./workflow-step-handlers";
import type { WorkflowBranch } from "./workflow-utils";

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const results = await Promise.allSettled(
    event.Records.map(async (record) => {
      const job: WorkflowJob = JSON.parse(record.body);

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

  await flushLogger();
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

  // Check maxConcurrentExecutions limit (scoped by org for cross-org safety)
  if (wf.maxConcurrentExecutions && wf.maxConcurrentExecutions > 0) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(workflowExecution)
      .where(
        and(
          eq(workflowExecution.workflowId, workflowId),
          eq(workflowExecution.organizationId, organizationId),
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
  const steps = wf.steps as WorkflowStep[];
  const transitions = wf.transitions as WorkflowTransition[];

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
  const definitionSnapshot: WorkflowDefinitionSnapshot = {
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
  await enqueueWorkflowStep({
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
  await enqueueWorkflowStepBatch(
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
    await createNextWorkflowSchedule({
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
    execution.definitionSnapshot as WorkflowDefinitionSnapshot | null;
  const steps = snapshot?.steps ?? (wf.steps as WorkflowStep[]);
  const step = steps.find((s) => s.id === stepId);

  if (!step) {
    log.error("Step not found in workflow", undefined, { stepId });
    await failExecution(executionId, `Step ${stepId} not found`, stepId);
    return;
  }

  // Atomic idempotency check and step execution creation.
  // Uses ON CONFLICT with a WHERE clause to prevent both duplicate sends
  // (completed) AND concurrent execution (executing). Only allows retry
  // when the previous attempt failed.
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
        status: sql`'executing'`,
        startedAt: sql`${new Date().toISOString()}::timestamp`,
        error: null,
        completedAt: null,
      },
      // Only allow update when previous attempt failed (retry).
      // Rejects when status is 'executing' (concurrent) or 'completed' (done).
      setWhere: sql`${workflowStepExecution.status} NOT IN ('executing', 'completed')`,
    })
    .returning();

  // If no row returned, another message already claimed or completed this step
  if (!stepExec) {
    log.info("Step already executing or completed", { stepId, executionId });
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
async function executeStep(
  step: WorkflowStep,
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
      return await handleDelay(
        config,
        execution,
        step.id,
        organizationId,
        completeExecution
      );

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
// EXECUTION FLOW HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process the next step in the workflow
 */
async function processNextStep(
  execution: typeof workflowExecution.$inferSelect,
  currentStep: WorkflowStep,
  wf: typeof workflow.$inferSelect,
  branch?: WorkflowBranch
): Promise<void> {
  const transitions = wf.transitions as WorkflowTransition[];

  // Find matching transition
  let nextTransition: WorkflowTransition | undefined;

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
  await enqueueWorkflowStep({
    type: "execute",
    executionId: execution.id,
    stepId: nextTransition.toStepId,
    organizationId: wf.organizationId,
  });
}

/**
 * Resume a paused/waiting execution.
 *
 * Uses an atomic UPDATE ... WHERE status='waiting' RETURNING * to claim the
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
    claimed.definitionSnapshot as WorkflowDefinitionSnapshot | null;
  const steps = snapshot?.steps ?? (wf.steps as WorkflowStep[]);
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

export {
  handleCondition,
  handleDelay,
  handleSendEmail,
  handleSendSms,
  handleSubscribeTopic,
  handleUnsubscribeTopic,
  handleUpdateContact,
  handleWaitForEmailEngagement,
  handleWaitForEvent,
  handleWebhook,
} from "./workflow-step-handlers";
// Re-export for external consumers and tests
export {
  evaluateCondition,
  isBlockedIp,
  isValidE164Phone,
  sanitizeEmailSubject,
  substituteVariables,
  validateWebhookUrl,
  type WorkflowBranch,
} from "./workflow-utils";
