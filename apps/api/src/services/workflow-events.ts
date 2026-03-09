/**
 * Workflow Events Service
 *
 * Handles emitting internal events to trigger workflows.
 * Used for contact lifecycle events, topic subscriptions, etc.
 */

import {
  contactEvent,
  contactMatchesCondition,
  db,
  eq,
  getSegmentsByIds,
  workflow,
  workflowExecution,
} from "@wraps/db";
import { and, inArray, sql } from "drizzle-orm";

import { log } from "../lib/logger";
import {
  deleteScheduledStep,
  enqueueWorkflowStep,
  enqueueWorkflowStepBatch,
  type WorkflowJob,
} from "./workflow-queue";

/**
 * Emit an internal event that may trigger workflows
 *
 * @param params Event parameters
 * @returns Number of workflows triggered
 */
export async function emitWorkflowEvent(params: {
  eventName: string;
  contactId: string;
  organizationId: string;
  eventData?: Record<string, unknown>;
  /** Skip recording to contact_event table (for internal events that are already tracked elsewhere) */
  skipEventRecord?: boolean;
}): Promise<{ workflowsTriggered: number }> {
  const { eventName, contactId, organizationId, eventData, skipEventRecord } =
    params;

  // Record the event to contact_event table (for segment evaluation)
  if (!skipEventRecord) {
    try {
      await db.insert(contactEvent).values({
        contactId,
        organizationId,
        eventName,
        eventData,
      });
    } catch (error) {
      // Log but don't fail the event emission
      log.error("Failed to record workflow event", error, {
        eventName,
        contactId,
      });
    }
  }

  // Find matching workflows
  const matchingWorkflows = await db
    .select({ id: workflow.id })
    .from(workflow)
    .where(
      and(
        eq(workflow.organizationId, organizationId),
        eq(workflow.status, "enabled"),
        eq(workflow.triggerType, "event"),
        sql`${workflow.triggerConfig}->>'eventName' = ${eventName}`
      )
    );

  // Trigger each matching workflow
  for (const wf of matchingWorkflows) {
    await enqueueWorkflowStep({
      type: "trigger",
      workflowId: wf.id,
      contactId,
      organizationId,
      eventData: eventData || {},
    });
  }

  if (matchingWorkflows.length > 0) {
    log.info("Workflow event triggered workflows", {
      eventName,
      contactId,
      workflowCount: matchingWorkflows.length,
    });
  }

  return { workflowsTriggered: matchingWorkflows.length };
}

/**
 * Emit contact_created event
 *
 * Matches workflows with either:
 * - triggerType: "event" + eventName: "contact_created" (generic event format)
 * - triggerType: "contact_created" (direct trigger type from CLI-pushed workflows)
 */
export async function emitContactCreated(params: {
  contactId: string;
  organizationId: string;
  contactData?: Record<string, unknown>;
}): Promise<{ workflowsTriggered: number }> {
  const eventData = {
    ...params.contactData,
    createdAt: new Date().toISOString(),
  };

  // Match workflows with triggerType: "event" + eventName: "contact_created"
  const matchingByEvent = await emitWorkflowEvent({
    eventName: "contact_created",
    contactId: params.contactId,
    organizationId: params.organizationId,
    eventData,
  });

  // Match workflows with triggerType: "contact_created" (CLI-pushed format)
  const matchingByTrigger = await db
    .select({ id: workflow.id })
    .from(workflow)
    .where(
      and(
        eq(workflow.organizationId, params.organizationId),
        eq(workflow.status, "enabled"),
        eq(workflow.triggerType, "contact_created")
      )
    );

  for (const wf of matchingByTrigger) {
    await enqueueWorkflowStep({
      type: "trigger",
      workflowId: wf.id,
      contactId: params.contactId,
      organizationId: params.organizationId,
      eventData,
    });
  }

  if (matchingByTrigger.length > 0) {
    log.info("contact_created trigger matched workflows", {
      contactId: params.contactId,
      workflowCount: matchingByTrigger.length,
    });
  }

  return {
    workflowsTriggered:
      matchingByEvent.workflowsTriggered + matchingByTrigger.length,
  };
}

/**
 * Emit contact_updated event
 *
 * Matches workflows with either:
 * - triggerType: "event" + eventName: "contact_updated" (generic event format)
 * - triggerType: "contact_updated" (direct trigger type from CLI-pushed workflows)
 */
export async function emitContactUpdated(params: {
  contactId: string;
  organizationId: string;
  updatedFields?: string[];
  contactData?: Record<string, unknown>;
}): Promise<{ workflowsTriggered: number }> {
  const eventData = {
    ...params.contactData,
    updatedFields: params.updatedFields,
    updatedAt: new Date().toISOString(),
  };

  // Match workflows with triggerType: "event" + eventName: "contact_updated"
  const matchingByEvent = await emitWorkflowEvent({
    eventName: "contact_updated",
    contactId: params.contactId,
    organizationId: params.organizationId,
    eventData,
  });

  // Match workflows with triggerType: "contact_updated" (CLI-pushed format)
  const matchingByTrigger = await db
    .select({ id: workflow.id })
    .from(workflow)
    .where(
      and(
        eq(workflow.organizationId, params.organizationId),
        eq(workflow.status, "enabled"),
        eq(workflow.triggerType, "contact_updated")
      )
    );

  for (const wf of matchingByTrigger) {
    await enqueueWorkflowStep({
      type: "trigger",
      workflowId: wf.id,
      contactId: params.contactId,
      organizationId: params.organizationId,
      eventData,
    });
  }

  if (matchingByTrigger.length > 0) {
    log.info("contact_updated trigger matched workflows", {
      contactId: params.contactId,
      workflowCount: matchingByTrigger.length,
    });
  }

  return {
    workflowsTriggered:
      matchingByEvent.workflowsTriggered + matchingByTrigger.length,
  };
}

/**
 * Emit topic_subscribed event
 */
export async function emitTopicSubscribed(params: {
  contactId: string;
  organizationId: string;
  topicId: string;
  topicName?: string;
}): Promise<{ workflowsTriggered: number }> {
  // Also check for topic_subscribed trigger type
  const matchingByEvent = await emitWorkflowEvent({
    eventName: "topic_subscribed",
    contactId: params.contactId,
    organizationId: params.organizationId,
    eventData: {
      topicId: params.topicId,
      topicName: params.topicName,
      subscribedAt: new Date().toISOString(),
    },
  });

  // Check for workflows with topic_subscribed trigger type
  const matchingByTrigger = await db
    .select({ id: workflow.id })
    .from(workflow)
    .where(
      and(
        eq(workflow.organizationId, params.organizationId),
        eq(workflow.status, "enabled"),
        eq(workflow.triggerType, "topic_subscribed"),
        sql`${workflow.triggerConfig}->>'topicId' = ${params.topicId}`
      )
    );

  for (const wf of matchingByTrigger) {
    await enqueueWorkflowStep({
      type: "trigger",
      workflowId: wf.id,
      contactId: params.contactId,
      organizationId: params.organizationId,
      eventData: {
        topicId: params.topicId,
        topicName: params.topicName,
        subscribedAt: new Date().toISOString(),
      },
    });
  }

  if (matchingByTrigger.length > 0) {
    log.info("topic_subscribed trigger matched workflows", {
      workflowCount: matchingByTrigger.length,
    });
  }

  return {
    workflowsTriggered:
      matchingByEvent.workflowsTriggered + matchingByTrigger.length,
  };
}

/**
 * Emit topic_unsubscribed event
 *
 * Also cancels any active workflow executions that were triggered by
 * topic_subscribed for this topic.
 */
export async function emitTopicUnsubscribed(params: {
  contactId: string;
  organizationId: string;
  topicId: string;
  topicName?: string;
}): Promise<{ workflowsTriggered: number; executionsCancelled: number }> {
  // Cancel any active executions for topic_subscribed workflows
  const { executionsCancelled } = await cancelExecutionsForTopicUnsubscribe({
    contactId: params.contactId,
    organizationId: params.organizationId,
    topicId: params.topicId,
  });

  // Check for event-based triggers
  const matchingByEvent = await emitWorkflowEvent({
    eventName: "topic_unsubscribed",
    contactId: params.contactId,
    organizationId: params.organizationId,
    eventData: {
      topicId: params.topicId,
      topicName: params.topicName,
      unsubscribedAt: new Date().toISOString(),
    },
  });

  // Check for workflows with topic_unsubscribed trigger type
  const matchingByTrigger = await db
    .select({ id: workflow.id })
    .from(workflow)
    .where(
      and(
        eq(workflow.organizationId, params.organizationId),
        eq(workflow.status, "enabled"),
        eq(workflow.triggerType, "topic_unsubscribed"),
        sql`${workflow.triggerConfig}->>'topicId' = ${params.topicId}`
      )
    );

  for (const wf of matchingByTrigger) {
    await enqueueWorkflowStep({
      type: "trigger",
      workflowId: wf.id,
      contactId: params.contactId,
      organizationId: params.organizationId,
      eventData: {
        topicId: params.topicId,
        topicName: params.topicName,
        unsubscribedAt: new Date().toISOString(),
      },
    });
  }

  if (matchingByTrigger.length > 0) {
    log.info("topic_unsubscribed trigger matched workflows", {
      workflowCount: matchingByTrigger.length,
    });
  }

  return {
    workflowsTriggered:
      matchingByEvent.workflowsTriggered + matchingByTrigger.length,
    executionsCancelled,
  };
}

/**
 * Check and emit segment entry events for a contact
 * Call this after a contact is created or updated
 *
 * Uses SQL-based evaluation: batch-fetches segments (1 query),
 * then runs one SQL query per segment to check if contact matches.
 */
export async function checkSegmentEntry(params: {
  contactId: string;
  organizationId: string;
}): Promise<{ workflowsTriggered: number }> {
  // 1. Get workflows with segment_entry trigger
  const segmentWorkflows = await db
    .select({
      id: workflow.id,
      triggerConfig: workflow.triggerConfig,
    })
    .from(workflow)
    .where(
      and(
        eq(workflow.organizationId, params.organizationId),
        eq(workflow.status, "enabled"),
        eq(workflow.triggerType, "segment_entry")
      )
    );

  if (segmentWorkflows.length === 0) {
    return { workflowsTriggered: 0 };
  }

  // 2. Extract unique segment IDs from workflow configs
  const segmentIds = [
    ...new Set(
      segmentWorkflows
        .map(
          (wf) => (wf.triggerConfig as { segmentId?: string } | null)?.segmentId
        )
        .filter((id): id is string => !!id)
    ),
  ];

  if (segmentIds.length === 0) {
    return { workflowsTriggered: 0 };
  }

  // 3. Batch-fetch all segments (1 query, org-scoped to prevent cross-org IDOR)
  const segmentsMap = await getSegmentsByIds(
    db,
    segmentIds,
    params.organizationId
  );

  // 4. Evaluate via SQL and collect trigger jobs
  const jobs: WorkflowJob[] = [];

  for (const wf of segmentWorkflows) {
    const config = wf.triggerConfig as { segmentId?: string } | null;
    if (!config?.segmentId) {
      continue;
    }

    const seg = segmentsMap.get(config.segmentId);
    if (!seg) {
      continue;
    }

    try {
      const matches = await contactMatchesCondition(
        db,
        params.contactId,
        params.organizationId,
        seg.condition
      );

      if (matches) {
        jobs.push({
          type: "trigger",
          workflowId: wf.id,
          contactId: params.contactId,
          organizationId: params.organizationId,
          eventData: {
            segmentId: config.segmentId,
            segmentName: seg.name,
            enteredAt: new Date().toISOString(),
          },
        });

        log.info("Segment entry: triggered workflow", {
          contactId: params.contactId,
          segmentId: config.segmentId,
          workflowId: wf.id,
        });
      }
    } catch (error) {
      log.error("Error checking segment entry", error, {
        segmentId: config.segmentId,
      });
    }
  }

  // 5. Batch enqueue all trigger jobs
  if (jobs.length > 0) {
    await enqueueWorkflowStepBatch(jobs);
  }

  return { workflowsTriggered: jobs.length };
}

/**
 * Check and emit segment exit events for a contact
 * Call this after a contact is updated
 *
 * Uses SQL-based evaluation: batch-fetches segments (1 query),
 * then runs one SQL query per segment to check if contact no longer matches.
 */
export async function checkSegmentExit(params: {
  contactId: string;
  organizationId: string;
  previousSegmentIds?: string[]; // Optional: segments contact was previously in
}): Promise<{ workflowsTriggered: number }> {
  // 1. Get workflows with segment_exit trigger
  const segmentWorkflows = await db
    .select({
      id: workflow.id,
      triggerConfig: workflow.triggerConfig,
    })
    .from(workflow)
    .where(
      and(
        eq(workflow.organizationId, params.organizationId),
        eq(workflow.status, "enabled"),
        eq(workflow.triggerType, "segment_exit")
      )
    );

  if (segmentWorkflows.length === 0) {
    return { workflowsTriggered: 0 };
  }

  // 2. Extract unique segment IDs, filtering by previousSegmentIds if provided
  const segmentIds = [
    ...new Set(
      segmentWorkflows
        .map(
          (wf) => (wf.triggerConfig as { segmentId?: string } | null)?.segmentId
        )
        .filter((id): id is string => {
          if (!id) {
            return false;
          }
          if (
            params.previousSegmentIds &&
            !params.previousSegmentIds.includes(id)
          ) {
            return false;
          }
          return true;
        })
    ),
  ];

  if (segmentIds.length === 0) {
    return { workflowsTriggered: 0 };
  }

  // 3. Batch-fetch all segments (1 query, org-scoped to prevent cross-org IDOR)
  const segmentsMap = await getSegmentsByIds(
    db,
    segmentIds,
    params.organizationId
  );

  // 4. Evaluate via SQL and collect trigger jobs
  const jobs: WorkflowJob[] = [];

  for (const wf of segmentWorkflows) {
    const config = wf.triggerConfig as { segmentId?: string } | null;
    if (!config?.segmentId) {
      continue;
    }

    // Skip if not in previousSegmentIds
    if (
      params.previousSegmentIds &&
      !params.previousSegmentIds.includes(config.segmentId)
    ) {
      continue;
    }

    const seg = segmentsMap.get(config.segmentId);
    if (!seg) {
      continue;
    }

    try {
      // Check if contact NO LONGER matches the segment via SQL
      const matches = await contactMatchesCondition(
        db,
        params.contactId,
        params.organizationId,
        seg.condition
      );

      if (!matches) {
        jobs.push({
          type: "trigger",
          workflowId: wf.id,
          contactId: params.contactId,
          organizationId: params.organizationId,
          eventData: {
            segmentId: config.segmentId,
            segmentName: seg.name,
            exitedAt: new Date().toISOString(),
          },
        });

        log.info("Segment exit: triggered workflow", {
          contactId: params.contactId,
          segmentId: config.segmentId,
          workflowId: wf.id,
        });
      }
    } catch (error) {
      log.error("Error checking segment exit", error, {
        segmentId: config.segmentId,
      });
    }
  }

  // 5. Batch enqueue all trigger jobs
  if (jobs.length > 0) {
    await enqueueWorkflowStepBatch(jobs);
  }

  return { workflowsTriggered: jobs.length };
}

/**
 * Cancel active workflow executions when a contact unsubscribes from a topic.
 *
 * This finds all active executions for workflows triggered by topic_subscribed
 * with the matching topicId and cancels them.
 */
export async function cancelExecutionsForTopicUnsubscribe(params: {
  contactId: string;
  organizationId: string;
  topicId: string;
}): Promise<{ executionsCancelled: number }> {
  const { contactId, organizationId, topicId } = params;

  // Find workflows triggered by topic_subscribed for this topic
  const matchingWorkflows = await db
    .select({ id: workflow.id })
    .from(workflow)
    .where(
      and(
        eq(workflow.organizationId, organizationId),
        eq(workflow.triggerType, "topic_subscribed"),
        sql`${workflow.triggerConfig}->>'topicId' = ${topicId}`
      )
    );

  if (matchingWorkflows.length === 0) {
    return { executionsCancelled: 0 };
  }

  const workflowIds = matchingWorkflows.map((w) => w.id);

  // Find active executions for this contact in these workflows
  const activeExecutions = await db
    .select({
      id: workflowExecution.id,
      workflowId: workflowExecution.workflowId,
      delaySchedulerName: workflowExecution.delaySchedulerName,
      waitTimeoutSchedulerName: workflowExecution.waitTimeoutSchedulerName,
    })
    .from(workflowExecution)
    .where(
      and(
        eq(workflowExecution.contactId, contactId),
        inArray(workflowExecution.workflowId, workflowIds),
        sql`${workflowExecution.status} IN ('pending', 'active', 'paused', 'waiting')`
      )
    );

  if (activeExecutions.length === 0) {
    return { executionsCancelled: 0 };
  }

  // Clean up any scheduled steps (in parallel)
  const schedulerCleanups: Promise<void>[] = [];
  for (const execution of activeExecutions) {
    if (execution.delaySchedulerName) {
      schedulerCleanups.push(
        deleteScheduledStep(execution.delaySchedulerName).catch((err) => {
          log.error("Failed to delete delay scheduler", err, {
            schedulerName: execution.delaySchedulerName,
          });
        })
      );
    }

    if (execution.waitTimeoutSchedulerName) {
      schedulerCleanups.push(
        deleteScheduledStep(execution.waitTimeoutSchedulerName).catch((err) => {
          log.error("Failed to delete timeout scheduler", err, {
            schedulerName: execution.waitTimeoutSchedulerName,
          });
        })
      );
    }
  }
  await Promise.all(schedulerCleanups);

  // Batch cancel all executions
  const executionIds = activeExecutions.map((e) => e.id);
  await db
    .update(workflowExecution)
    .set({
      status: "cancelled",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(inArray(workflowExecution.id, executionIds));

  // Decrement active execution counts per workflow
  const countsByWorkflow = new Map<string, number>();
  for (const execution of activeExecutions) {
    countsByWorkflow.set(
      execution.workflowId,
      (countsByWorkflow.get(execution.workflowId) ?? 0) + 1
    );
  }
  await Promise.all(
    [...countsByWorkflow.entries()].map(([wfId, count]) =>
      db
        .update(workflow)
        .set({
          activeExecutions: sql`GREATEST(0, ${workflow.activeExecutions} - ${count})`,
        })
        .where(eq(workflow.id, wfId))
    )
  );

  log.info("Workflow: cancelled executions for topic unsubscribe", {
    contactId,
    topicId,
    count: activeExecutions.length,
  });

  return { executionsCancelled: activeExecutions.length };
}
