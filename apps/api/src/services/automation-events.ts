/**
 * Automation Events Service
 *
 * Handles emitting internal events to trigger automations.
 * Used for contact lifecycle events, topic subscriptions, etc.
 */

import {
  automation,
  automationExecution,
  contactEvent,
  contactMatchesCondition,
  db,
  eq,
  getSegmentsByIds,
} from "@wraps/db";
import { and, inArray, sql } from "drizzle-orm";

import { log } from "../lib/logger";
import {
  type AutomationJob,
  deleteScheduledStep,
  enqueueAutomationStep,
  enqueueAutomationStepBatch,
} from "./automation-queue";

/**
 * Emit an internal event that may trigger automations
 *
 * @param params Event parameters
 * @returns Number of automations triggered
 */
export async function emitAutomationEvent(params: {
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
      log.error("Failed to record automation event", error, {
        eventName,
        contactId,
      });
    }
  }

  // Find matching automations
  const matchingAutomations = await db
    .select({ id: automation.id })
    .from(automation)
    .where(
      and(
        eq(automation.organizationId, organizationId),
        eq(automation.status, "enabled"),
        eq(automation.triggerType, "event"),
        sql`${automation.triggerConfig}->>'eventName' = ${eventName}`
      )
    );

  // Trigger each matching automation
  for (const a of matchingAutomations) {
    await enqueueAutomationStep({
      type: "trigger",
      workflowId: a.id,
      contactId,
      organizationId,
      eventData: eventData || {},
    });
  }

  if (matchingAutomations.length > 0) {
    log.info("Automation event triggered automations", {
      eventName,
      contactId,
      workflowCount: matchingAutomations.length,
    });
  }

  return { workflowsTriggered: matchingAutomations.length };
}

/** @deprecated Use `emitAutomationEvent` instead */
export const emitWorkflowEvent = emitAutomationEvent;

/**
 * Emit contact_created event
 *
 * Matches automations with either:
 * - triggerType: "event" + eventName: "contact_created" (generic event format)
 * - triggerType: "contact_created" (direct trigger type from CLI-pushed automations)
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

  // Match automations with triggerType: "event" + eventName: "contact_created"
  const matchingByEvent = await emitAutomationEvent({
    eventName: "contact_created",
    contactId: params.contactId,
    organizationId: params.organizationId,
    eventData,
  });

  // Match automations with triggerType: "contact_created" (CLI-pushed format)
  const matchingByTrigger = await db
    .select({ id: automation.id })
    .from(automation)
    .where(
      and(
        eq(automation.organizationId, params.organizationId),
        eq(automation.status, "enabled"),
        eq(automation.triggerType, "contact_created")
      )
    );

  for (const a of matchingByTrigger) {
    await enqueueAutomationStep({
      type: "trigger",
      workflowId: a.id,
      contactId: params.contactId,
      organizationId: params.organizationId,
      eventData,
    });
  }

  if (matchingByTrigger.length > 0) {
    log.info("contact_created trigger matched automations", {
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
 * Matches automations with either:
 * - triggerType: "event" + eventName: "contact_updated" (generic event format)
 * - triggerType: "contact_updated" (direct trigger type from CLI-pushed automations)
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

  // Match automations with triggerType: "event" + eventName: "contact_updated"
  const matchingByEvent = await emitAutomationEvent({
    eventName: "contact_updated",
    contactId: params.contactId,
    organizationId: params.organizationId,
    eventData,
  });

  // Match automations with triggerType: "contact_updated" (CLI-pushed format)
  const matchingByTrigger = await db
    .select({ id: automation.id })
    .from(automation)
    .where(
      and(
        eq(automation.organizationId, params.organizationId),
        eq(automation.status, "enabled"),
        eq(automation.triggerType, "contact_updated")
      )
    );

  for (const a of matchingByTrigger) {
    await enqueueAutomationStep({
      type: "trigger",
      workflowId: a.id,
      contactId: params.contactId,
      organizationId: params.organizationId,
      eventData,
    });
  }

  if (matchingByTrigger.length > 0) {
    log.info("contact_updated trigger matched automations", {
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
  const matchingByEvent = await emitAutomationEvent({
    eventName: "topic_subscribed",
    contactId: params.contactId,
    organizationId: params.organizationId,
    eventData: {
      topicId: params.topicId,
      topicName: params.topicName,
      subscribedAt: new Date().toISOString(),
    },
  });

  // Check for automations with topic_subscribed trigger type
  const matchingByTrigger = await db
    .select({ id: automation.id })
    .from(automation)
    .where(
      and(
        eq(automation.organizationId, params.organizationId),
        eq(automation.status, "enabled"),
        eq(automation.triggerType, "topic_subscribed"),
        sql`${automation.triggerConfig}->>'topicId' = ${params.topicId}`
      )
    );

  for (const a of matchingByTrigger) {
    await enqueueAutomationStep({
      type: "trigger",
      workflowId: a.id,
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
    log.info("topic_subscribed trigger matched automations", {
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
 * Also cancels any active automation executions that were triggered by
 * topic_subscribed for this topic.
 */
export async function emitTopicUnsubscribed(params: {
  contactId: string;
  organizationId: string;
  topicId: string;
  topicName?: string;
}): Promise<{ workflowsTriggered: number; executionsCancelled: number }> {
  // Cancel any active executions for topic_subscribed automations
  const { executionsCancelled } = await cancelExecutionsForTopicUnsubscribe({
    contactId: params.contactId,
    organizationId: params.organizationId,
    topicId: params.topicId,
  });

  // Check for event-based triggers
  const matchingByEvent = await emitAutomationEvent({
    eventName: "topic_unsubscribed",
    contactId: params.contactId,
    organizationId: params.organizationId,
    eventData: {
      topicId: params.topicId,
      topicName: params.topicName,
      unsubscribedAt: new Date().toISOString(),
    },
  });

  // Check for automations with topic_unsubscribed trigger type
  const matchingByTrigger = await db
    .select({ id: automation.id })
    .from(automation)
    .where(
      and(
        eq(automation.organizationId, params.organizationId),
        eq(automation.status, "enabled"),
        eq(automation.triggerType, "topic_unsubscribed"),
        sql`${automation.triggerConfig}->>'topicId' = ${params.topicId}`
      )
    );

  for (const a of matchingByTrigger) {
    await enqueueAutomationStep({
      type: "trigger",
      workflowId: a.id,
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
    log.info("topic_unsubscribed trigger matched automations", {
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
  // 1. Get automations with segment_entry trigger
  const segmentAutomations = await db
    .select({
      id: automation.id,
      triggerConfig: automation.triggerConfig,
    })
    .from(automation)
    .where(
      and(
        eq(automation.organizationId, params.organizationId),
        eq(automation.status, "enabled"),
        eq(automation.triggerType, "segment_entry")
      )
    );

  if (segmentAutomations.length === 0) {
    return { workflowsTriggered: 0 };
  }

  // 2. Extract unique segment IDs from automation configs
  const segmentIds = [
    ...new Set(
      segmentAutomations
        .map(
          (a) => (a.triggerConfig as { segmentId?: string } | null)?.segmentId
        )
        .filter((id): id is string => !!id)
    ),
  ];

  if (segmentIds.length === 0) {
    return { workflowsTriggered: 0 };
  }

  // 3. Batch-fetch all segments (1 query)
  const segmentsMap = await getSegmentsByIds(db, segmentIds);

  // 4. Evaluate via SQL and collect trigger jobs
  const jobs: AutomationJob[] = [];

  for (const a of segmentAutomations) {
    const config = a.triggerConfig as { segmentId?: string } | null;
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
          workflowId: a.id,
          contactId: params.contactId,
          organizationId: params.organizationId,
          eventData: {
            segmentId: config.segmentId,
            segmentName: seg.name,
            enteredAt: new Date().toISOString(),
          },
        });

        log.info("Segment entry: triggered automation", {
          contactId: params.contactId,
          segmentId: config.segmentId,
          automationId: a.id,
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
    await enqueueAutomationStepBatch(jobs);
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
  // 1. Get automations with segment_exit trigger
  const segmentAutomations = await db
    .select({
      id: automation.id,
      triggerConfig: automation.triggerConfig,
    })
    .from(automation)
    .where(
      and(
        eq(automation.organizationId, params.organizationId),
        eq(automation.status, "enabled"),
        eq(automation.triggerType, "segment_exit")
      )
    );

  if (segmentAutomations.length === 0) {
    return { workflowsTriggered: 0 };
  }

  // 2. Extract unique segment IDs, filtering by previousSegmentIds if provided
  const segmentIds = [
    ...new Set(
      segmentAutomations
        .map(
          (a) => (a.triggerConfig as { segmentId?: string } | null)?.segmentId
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

  // 3. Batch-fetch all segments (1 query)
  const segmentsMap = await getSegmentsByIds(db, segmentIds);

  // 4. Evaluate via SQL and collect trigger jobs
  const jobs: AutomationJob[] = [];

  for (const a of segmentAutomations) {
    const config = a.triggerConfig as { segmentId?: string } | null;
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
          workflowId: a.id,
          contactId: params.contactId,
          organizationId: params.organizationId,
          eventData: {
            segmentId: config.segmentId,
            segmentName: seg.name,
            exitedAt: new Date().toISOString(),
          },
        });

        log.info("Segment exit: triggered automation", {
          contactId: params.contactId,
          segmentId: config.segmentId,
          automationId: a.id,
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
    await enqueueAutomationStepBatch(jobs);
  }

  return { workflowsTriggered: jobs.length };
}

/**
 * Cancel active automation executions when a contact unsubscribes from a topic.
 *
 * This finds all active executions for automations triggered by topic_subscribed
 * with the matching topicId and cancels them.
 */
export async function cancelExecutionsForTopicUnsubscribe(params: {
  contactId: string;
  organizationId: string;
  topicId: string;
}): Promise<{ executionsCancelled: number }> {
  const { contactId, organizationId, topicId } = params;

  // Find automations triggered by topic_subscribed for this topic
  const matchingAutomations = await db
    .select({ id: automation.id })
    .from(automation)
    .where(
      and(
        eq(automation.organizationId, organizationId),
        eq(automation.triggerType, "topic_subscribed"),
        sql`${automation.triggerConfig}->>'topicId' = ${topicId}`
      )
    );

  if (matchingAutomations.length === 0) {
    return { executionsCancelled: 0 };
  }

  const automationIds = matchingAutomations.map((a) => a.id);

  // Find active executions for this contact in these automations
  const activeExecutions = await db
    .select({
      id: automationExecution.id,
      workflowId: automationExecution.workflowId,
      delaySchedulerName: automationExecution.delaySchedulerName,
      waitTimeoutSchedulerName: automationExecution.waitTimeoutSchedulerName,
    })
    .from(automationExecution)
    .where(
      and(
        eq(automationExecution.contactId, contactId),
        inArray(automationExecution.workflowId, automationIds),
        sql`${automationExecution.status} IN ('pending', 'active', 'paused', 'waiting')`
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
    .update(automationExecution)
    .set({
      status: "cancelled",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(inArray(automationExecution.id, executionIds));

  // Decrement active execution counts per automation
  const countsByAutomation = new Map<string, number>();
  for (const execution of activeExecutions) {
    countsByAutomation.set(
      execution.workflowId,
      (countsByAutomation.get(execution.workflowId) ?? 0) + 1
    );
  }
  await Promise.all(
    [...countsByAutomation.entries()].map(([aId, count]) =>
      db
        .update(automation)
        .set({
          activeExecutions: sql`GREATEST(0, ${automation.activeExecutions} - ${count})`,
        })
        .where(eq(automation.id, aId))
    )
  );

  log.info("Automation: cancelled executions for topic unsubscribe", {
    contactId,
    topicId,
    count: activeExecutions.length,
  });

  return { executionsCancelled: activeExecutions.length };
}
