/**
 * Workflow Events Service
 *
 * Handles emitting internal events to trigger workflows.
 * Used for contact lifecycle events, topic subscriptions, etc.
 */

import {
  type ContactRecord,
  contactEvent,
  contactMatchesCondition,
  db,
  eq,
  findContactsByIdsInOrg,
  getSegmentsByIds,
  workflow,
  workflowExecution,
} from "@wraps/db";
import { and, inArray, sql } from "drizzle-orm";

import { log } from "../lib/logger";
import { orgHasFeature } from "../lib/org-features";
import {
  deleteScheduledStep,
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

  // Trigger each matching workflow — batch to avoid N sequential SQS calls
  if (matchingWorkflows.length > 0) {
    const jobs: WorkflowJob[] = matchingWorkflows.map((wf) => ({
      type: "trigger",
      workflowId: wf.id,
      contactId,
      organizationId,
      eventData: eventData || {},
    }));
    await enqueueWorkflowStepBatch(jobs);
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

  if (matchingByTrigger.length > 0) {
    const jobs: WorkflowJob[] = matchingByTrigger.map((wf) => ({
      type: "trigger",
      workflowId: wf.id,
      contactId: params.contactId,
      organizationId: params.organizationId,
      eventData,
    }));
    await enqueueWorkflowStepBatch(jobs);
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
  changeSource?: ContactChangeSource;
}): Promise<{ workflowsTriggered: number }> {
  const eventData = {
    ...params.contactData,
    updatedFields: params.updatedFields,
    updatedAt: new Date().toISOString(),
    ...(params.changeSource ? { changeSource: params.changeSource } : {}),
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

  if (matchingByTrigger.length > 0) {
    const jobs: WorkflowJob[] = matchingByTrigger.map((wf) => ({
      type: "trigger",
      workflowId: wf.id,
      contactId: params.contactId,
      organizationId: params.organizationId,
      eventData,
    }));
    await enqueueWorkflowStepBatch(jobs);
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
 * What changed a contact, carried as `changeSource` in contact_updated event
 * data. Named so it cannot shadow a contact property called `source`.
 * - `api`: an API key. `user`: a signed-in session (dashboard or CLI).
 * - `bounce`: a hard bounce, or soft bounces escalating to `bounced`.
 * - `complaint`: an SES complaint.
 * - `ses_suppression`: an SES Suppressed event, or a bounce with a
 *   suppression sub-type.
 * - `unsubscribe`: the unsubscribe link.
 */
export type ContactChangeSource =
  | "api"
  | "user"
  | "bounce"
  | "complaint"
  | "ses_suppression"
  | "unsubscribe";

export type ContactUpdatedItem = {
  contactId: string;
  updatedFields: string[];
  changeSource: ContactChangeSource;
};

/** The contact fields every contact_updated event carries, as PATCH sends them. */
function contactUpdatedData(row: ContactRecord): Record<string, unknown> {
  return {
    email: row.email,
    phone: row.phone,
    firstName: row.firstName,
    lastName: row.lastName,
    company: row.company,
    jobTitle: row.jobTitle,
    preferredChannel: row.preferredChannel,
    emailStatus: row.emailStatus,
  };
}

/**
 * Emit contact_updated for many contacts of one org at once. Call it after the
 * change is persisted: the event data is read from the stored rows, so callers
 * pass ids only. Ids not found in the org are dropped.
 *
 * However many contacts there are, this runs one contact lookup and one
 * workflow query per match form (`event` + eventName `contact_updated`, and
 * triggerType `contact_updated`), then one batched enqueue. The contact_event
 * rows are written even when no workflow matches, since segments and the
 * timeline read them.
 */
export async function emitContactsUpdated(
  organizationId: string,
  items: ContactUpdatedItem[]
): Promise<{ workflowsTriggered: number }> {
  if (items.length === 0) {
    return { workflowsTriggered: 0 };
  }

  const contactIds = [...new Set(items.map((item) => item.contactId))];
  const rows = await findContactsByIdsInOrg(organizationId, contactIds, db);
  const rowsById = new Map(rows.map((row) => [row.id, row]));

  const updatedAt = new Date().toISOString();
  const events: { contactId: string; eventData: Record<string, unknown> }[] =
    [];
  for (const item of items) {
    const row = rowsById.get(item.contactId);
    if (!row) {
      continue;
    }
    events.push({
      contactId: row.id,
      eventData: {
        ...contactUpdatedData(row),
        updatedFields: item.updatedFields,
        updatedAt,
        changeSource: item.changeSource,
      },
    });
  }
  if (events.length === 0) {
    return { workflowsTriggered: 0 };
  }

  await recordContactUpdatedEvents(organizationId, events);

  const [matchingByEvent, matchingByTrigger] = await Promise.all([
    db
      .select({ id: workflow.id })
      .from(workflow)
      .where(
        and(
          eq(workflow.organizationId, organizationId),
          eq(workflow.status, "enabled"),
          eq(workflow.triggerType, "event"),
          sql`${workflow.triggerConfig}->>'eventName' = 'contact_updated'`
        )
      ),
    db
      .select({ id: workflow.id })
      .from(workflow)
      .where(
        and(
          eq(workflow.organizationId, organizationId),
          eq(workflow.status, "enabled"),
          eq(workflow.triggerType, "contact_updated")
        )
      ),
  ]);

  // A workflow has one trigger type, so the two sets never overlap.
  const workflowIds = [...matchingByEvent, ...matchingByTrigger].map(
    (wf) => wf.id
  );
  const jobs: WorkflowJob[] = events.flatMap((event) =>
    workflowIds.map((workflowId) => ({
      type: "trigger" as const,
      workflowId,
      contactId: event.contactId,
      organizationId,
      eventData: event.eventData,
    }))
  );

  if (jobs.length > 0) {
    await enqueueWorkflowStepBatch(jobs);
    log.info("contact_updated matched workflows", {
      organizationId,
      contactCount: events.length,
      workflowCount: workflowIds.length,
    });
  }

  return { workflowsTriggered: jobs.length };
}

/**
 * One multi-row insert; if it fails (a contact deleted since the lookup trips
 * the FK), each row is retried alone so one missing contact does not drop the
 * others' rows. Never throws: a lost event row must not stop the triggers.
 */
async function recordContactUpdatedEvents(
  organizationId: string,
  events: { contactId: string; eventData: Record<string, unknown> }[]
): Promise<void> {
  const values = events.map((event) => ({
    contactId: event.contactId,
    organizationId,
    eventName: "contact_updated",
    eventData: event.eventData,
  }));
  try {
    await db.insert(contactEvent).values(values);
    return;
  } catch (error) {
    log.warn("Batch contact_updated event insert failed; retrying per row", {
      organizationId,
      count: values.length,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  for (const value of values) {
    try {
      await db.insert(contactEvent).values(value);
    } catch (error) {
      log.error("Failed to record contact_updated event", error, {
        organizationId,
        contactId: value.contactId,
      });
    }
  }
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

  if (matchingByTrigger.length > 0) {
    const topicEventData = {
      topicId: params.topicId,
      topicName: params.topicName,
      subscribedAt: new Date().toISOString(),
    };
    const jobs: WorkflowJob[] = matchingByTrigger.map((wf) => ({
      type: "trigger",
      workflowId: wf.id,
      contactId: params.contactId,
      organizationId: params.organizationId,
      eventData: topicEventData,
    }));
    await enqueueWorkflowStepBatch(jobs);
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

  if (matchingByTrigger.length > 0) {
    const topicEventData = {
      topicId: params.topicId,
      topicName: params.topicName,
      unsubscribedAt: new Date().toISOString(),
    };
    const jobs: WorkflowJob[] = matchingByTrigger.map((wf) => ({
      type: "trigger",
      workflowId: wf.id,
      contactId: params.contactId,
      organizationId: params.organizationId,
      eventData: topicEventData,
    }));
    await enqueueWorkflowStepBatch(jobs);
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
 * Segments (referenced by an enabled segment_entry/segment_exit workflow) the
 * contact currently matches. Take this BEFORE mutating a contact and pass it
 * as `previousSegmentIds` to checkSegmentEntry/checkSegmentExit afterwards, so
 * they fire on transitions rather than on current state.
 *
 * Throws on evaluation failure; callers must treat a failed snapshot as
 * "skip segment triggers" rather than "contact was in no segments".
 */
export async function getSegmentMembership(params: {
  contactId: string;
  organizationId: string;
}): Promise<string[]> {
  const segmentWorkflows = await db
    .select({ triggerConfig: workflow.triggerConfig })
    .from(workflow)
    .where(
      and(
        eq(workflow.organizationId, params.organizationId),
        eq(workflow.status, "enabled"),
        inArray(workflow.triggerType, ["segment_entry", "segment_exit"])
      )
    );

  if (
    segmentWorkflows.length === 0 ||
    !(await orgHasFeature(params.organizationId, "segments"))
  ) {
    return [];
  }

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
    return [];
  }

  const segmentsMap = await getSegmentsByIds(
    db,
    segmentIds,
    params.organizationId
  );

  const memberOf: string[] = [];
  for (const [segmentId, seg] of segmentsMap) {
    if (
      await contactMatchesCondition(
        db,
        params.contactId,
        params.organizationId,
        seg.condition
      )
    ) {
      memberOf.push(segmentId);
    }
  }
  return memberOf;
}

/**
 * Check and emit segment entry events for a contact
 * Call this after a contact is created or updated. Fires only when the contact
 * matches the segment now and was not in `previousSegmentIds` before.
 *
 * Uses SQL-based evaluation: batch-fetches segments (1 query),
 * then runs one SQL query per segment to check if contact matches.
 */
export async function checkSegmentEntry(params: {
  contactId: string;
  organizationId: string;
  previousSegmentIds: string[];
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

  // Segment triggers need the segments feature (Pro and up). An org that
  // no longer has it keeps its workflows but they stop firing on membership.
  if (!(await orgHasFeature(params.organizationId, "segments"))) {
    log.warn("Skipping segment trigger: plan does not include segments", {
      organizationId: params.organizationId,
      workflows: segmentWorkflows.length,
    });
    return { workflowsTriggered: 0 };
  }

  // 2. Extract unique segment IDs from workflow configs
  const segmentIds = [
    ...new Set(
      segmentWorkflows
        .map(
          (wf) => (wf.triggerConfig as { segmentId?: string } | null)?.segmentId
        )
        .filter(
          (id): id is string => !!id && !params.previousSegmentIds.includes(id)
        )
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

    // Already a member before the change: not an entry
    if (params.previousSegmentIds.includes(config.segmentId)) {
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
 * Call this after a contact is updated. Fires only for segments in
 * `previousSegmentIds` that the contact no longer matches.
 *
 * Uses SQL-based evaluation: batch-fetches segments (1 query),
 * then runs one SQL query per segment to check if contact no longer matches.
 */
export async function checkSegmentExit(params: {
  contactId: string;
  organizationId: string;
  previousSegmentIds: string[];
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

  // Segment triggers need the segments feature (Pro and up). An org that
  // no longer has it keeps its workflows but they stop firing on membership.
  if (!(await orgHasFeature(params.organizationId, "segments"))) {
    log.warn("Skipping segment trigger: plan does not include segments", {
      organizationId: params.organizationId,
      workflows: segmentWorkflows.length,
    });
    return { workflowsTriggered: 0 };
  }

  // 2. Extract unique segment IDs, filtering by previousSegmentIds
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
          if (!params.previousSegmentIds.includes(id)) {
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
    if (!params.previousSegmentIds.includes(config.segmentId)) {
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

  // Find active executions for this contact in these workflows (org-scoped for defense-in-depth)
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
        eq(workflowExecution.organizationId, organizationId),
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
  // biome-ignore lint/plugin: executionIds all come from the activeExecutions query above, which is already scoped by eq(workflowExecution.organizationId, organizationId).
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
      // biome-ignore lint/plugin: wfId values come from countsByWorkflow, built from activeExecutions.workflowId, which is itself drawn from matchingWorkflows above — already scoped by eq(workflow.organizationId, organizationId).
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
