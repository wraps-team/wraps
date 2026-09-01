/**
 * Event Ingestion Routes
 *
 * Receives tracked events from customer's API, triggers matching workflows,
 * and resumes waiting executions.
 *
 * Custom-event allowance: 5,000/month on Free, unlimited on every paid plan.
 * Soft cap with a 10% grace period (blocks at 110% of the allowance).
 * See middleware/event-limit.ts — these are Wraps' own storage and compute,
 * not email sends, which are never metered.
 */

import { createHash } from "node:crypto";
import {
  type contact,
  findContactByEmailHash,
  findContactByEmailInOrg,
  findContactByExternalIdInOrg,
  findContactById,
  findContactsByEmailsInOrg,
  findContactsByExternalIdsInOrg,
  findContactsByIdsInOrg,
  findEventWorkflows,
  findEventWorkflowsBatch,
  findWaitingExecutions,
  findWaitingExecutionsBatch,
  insertContact,
  insertContactEvent,
  insertContactEventsBatch,
  touchContactLastActivity,
} from "@wraps/db";
import { t } from "elysia";

// Hash email for deduplication
function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";
import {
  enforceEventLimit,
  getEventTTLExpiration,
  incrementEventUsage,
} from "../middleware/event-limit";
import { planGateMiddleware } from "../middleware/plan-gate";
import {
  deleteScheduledStep,
  enqueueWorkflowStep,
  enqueueWorkflowStepBatch,
  type WorkflowJob,
} from "../services/workflow-queue";

// Common response schemas
const _errorResponse = t.Object({
  error: t.String({ description: "Error message" }),
});

// OpenAPI 3.0 compatible arbitrary properties object
const propertiesSchema = t.Optional(
  t.Object({}, { additionalProperties: true, description: "Event properties" })
);

export const eventsRoutes = createAuthenticatedRoutes("/v1/events")
  .use(planGateMiddleware("events"))
  .onBeforeHandle(enforceEventLimit)

  /**
   * Ingest a custom event
   *
   * POST /v1/events
   *
   * Stores the event, triggers any matching workflows,
   * and resumes executions waiting for this event.
   */
  .post(
    "/",
    async (ctx) => {
      const { body } = ctx;
      const auth = getAuth(ctx);
      const {
        name,
        contactId,
        contactExternalId,
        contactEmail,
        contactName,
        createIfMissing,
        properties,
      } = body;

      // Find the contact — priority: contactId > contactExternalId > contactEmail
      let contactRecord: typeof contact.$inferSelect | undefined;
      let contactCreated = false;

      if (contactId) {
        contactRecord =
          (await findContactById(contactId, auth.organizationId)) ?? undefined;
      } else if (contactExternalId) {
        contactRecord =
          (await findContactByExternalIdInOrg(
            contactExternalId,
            auth.organizationId
          )) ?? undefined;
      } else if (contactEmail) {
        contactRecord =
          (await findContactByEmailInOrg(contactEmail, auth.organizationId)) ??
          undefined;
      }

      // Auto-create contact if missing and flag is set
      if (!contactRecord && createIfMissing && contactEmail) {
        const normalizedEmail = contactEmail.toLowerCase().trim();
        const emailHash = hashEmail(normalizedEmail);
        const newContact = await insertContact({
          organizationId: auth.organizationId,
          email: normalizedEmail,
          emailHash,
          emailStatus: "active",
          firstName: contactName || null,
          properties: {},
        });

        if (newContact) {
          contactRecord = newContact;
          contactCreated = true;
        } else {
          // Concurrent insert won the race — fetch the existing contact
          const existing = await findContactByEmailHash(
            emailHash,
            auth.organizationId
          );
          if (existing) {
            const full = await findContactById(
              existing.id,
              auth.organizationId
            );
            contactRecord = full ?? undefined;
          }
        }
      }

      if (!contactRecord) {
        ctx.set.status = 400;
        return {
          success: false as const,
          error: "Contact not found",
        };
      }

      const results = {
        workflowsTriggered: 0,
        executionsResumed: 0,
      };

      // 1. Store the event with 2-year TTL
      await insertContactEvent({
        contactId: contactRecord.id,
        organizationId: auth.organizationId,
        eventName: name,
        eventData: properties || {},
        expiresAt: getEventTTLExpiration(),
      });

      // 2. Increment event usage counter
      await incrementEventUsage(auth.organizationId);

      // 3. Find and trigger matching workflows
      const matchingWorkflows = await findEventWorkflows(
        auth.organizationId,
        name
      );

      for (const wf of matchingWorkflows) {
        await enqueueWorkflowStep({
          type: "trigger",
          workflowId: wf.id,
          contactId: contactRecord.id,
          organizationId: auth.organizationId,
          eventData: properties || {},
        });
        results.workflowsTriggered++;
      }

      // 4. Resume executions waiting for this event
      const waitingExecutions = await findWaitingExecutions(
        auth.organizationId,
        contactRecord.id,
        name
      );

      for (const execution of waitingExecutions) {
        // Cancel timeout scheduler
        if (execution.waitTimeoutSchedulerName) {
          await deleteScheduledStep(execution.waitTimeoutSchedulerName);
        }

        // Resume with 'yes' branch (event received)
        await enqueueWorkflowStep({
          type: "resume",
          executionId: execution.id,
          branch: "yes",
          organizationId: auth.organizationId,
        });
        results.executionsResumed++;
      }

      // Update contact last activity
      await touchContactLastActivity(contactRecord.id, auth.organizationId);

      return {
        success: true,
        contactCreated,
        ...results,
      };
    },
    {
      body: t.Object({
        name: t.String({
          description: "Event name (e.g., 'purchase.completed')",
          maxLength: 255,
        }),
        contactId: t.Optional(
          t.String({ description: "Contact ID", maxLength: 36 })
        ),
        contactExternalId: t.Optional(
          t.String({
            description: "Contact externalId (alternative to contactId)",
            maxLength: 255,
          })
        ),
        contactEmail: t.Optional(
          t.String({
            description: "Contact email (alternative to contactId)",
            maxLength: 255,
            format: "email",
          })
        ),
        contactName: t.Optional(
          t.String({
            description:
              "Contact name (used when createIfMissing is true to set firstName)",
            maxLength: 100,
          })
        ),
        createIfMissing: t.Optional(
          t.Boolean({
            description:
              "If true and contact doesn't exist, create a new contact with the provided email",
            default: false,
          })
        ),
        properties: propertiesSchema,
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          contactCreated: t.Boolean({
            description: "Whether a new contact was created",
          }),
          workflowsTriggered: t.Number({
            description: "Number of workflows triggered",
          }),
          executionsResumed: t.Number({
            description: "Number of executions resumed",
          }),
        }),
        400: t.Object({
          success: t.Literal(false),
          error: t.String(),
        }),
      },
      detail: {
        summary: "Ingest event",
        description:
          "Send a custom event to trigger workflows and resume waiting executions",
        tags: ["events"],
      },
    }
  )

  /**
   * Batch ingest events
   *
   * POST /v1/events/batch
   *
   * Process multiple events in a single request.
   */
  .post(
    "/batch",
    async (ctx) => {
      const { body } = ctx;
      const auth = getAuth(ctx);
      const results = {
        processed: 0,
        workflowsTriggered: 0,
        executionsResumed: 0,
        errors: [] as string[],
      };

      const events = body.events;
      if (events.length === 0) {
        return { success: true, ...results };
      }

      // Phase 1: Batch contact resolution (up to 3 queries)
      // Priority per event: contactId > contactExternalId > contactEmail
      const contactIdEvents = events.filter((e) => e.contactId);
      const contactExternalIdEvents = events.filter(
        (e) => !e.contactId && e.contactExternalId
      );
      const contactEmailEvents = events.filter(
        (e) => !(e.contactId || e.contactExternalId) && e.contactEmail
      );

      const contactMap = new Map<string, typeof contact.$inferSelect>();

      if (contactIdEvents.length > 0) {
        const uniqueIds = [
          ...new Set(contactIdEvents.map((e) => e.contactId!)),
        ];
        const contactsById = await findContactsByIdsInOrg(
          auth.organizationId,
          uniqueIds
        );
        for (const c of contactsById) {
          contactMap.set(c.id, c);
        }
      }

      if (contactExternalIdEvents.length > 0) {
        const uniqueExternalIds = [
          ...new Set(contactExternalIdEvents.map((e) => e.contactExternalId!)),
        ];
        const contactsByExternalId = await findContactsByExternalIdsInOrg(
          auth.organizationId,
          uniqueExternalIds
        );
        for (const c of contactsByExternalId) {
          if (c.externalId) {
            contactMap.set(c.externalId, c);
          }
        }
      }

      if (contactEmailEvents.length > 0) {
        const uniqueEmails = [
          ...new Set(contactEmailEvents.map((e) => e.contactEmail!)),
        ];
        const contactsByEmail = await findContactsByEmailsInOrg(
          auth.organizationId,
          uniqueEmails
        );
        for (const c of contactsByEmail) {
          if (c.email) {
            contactMap.set(c.email, c);
          }
        }
      }

      // Resolve each event to a contact
      type ResolvedEvent = {
        name: string;
        contactRecord: typeof contact.$inferSelect;
        properties: Record<string, unknown>;
      };

      const resolvedEvents: ResolvedEvent[] = [];

      for (const event of events) {
        const contactRecord = event.contactId
          ? contactMap.get(event.contactId)
          : event.contactExternalId
            ? contactMap.get(event.contactExternalId)
            : event.contactEmail
              ? contactMap.get(event.contactEmail)
              : undefined;

        if (!contactRecord) {
          results.errors.push(`Contact not found for event ${event.name}`);
          continue;
        }

        resolvedEvents.push({
          name: event.name,
          contactRecord,
          properties: (event.properties as Record<string, unknown>) || {},
        });
      }

      if (resolvedEvents.length === 0) {
        return { success: results.errors.length === 0, ...results };
      }

      // Phase 2: Batch event insert (1 query)
      const expiresAt = getEventTTLExpiration();
      await insertContactEventsBatch(
        resolvedEvents.map((e) => ({
          contactId: e.contactRecord.id,
          organizationId: auth.organizationId,
          eventName: e.name,
          eventData: e.properties,
          expiresAt,
        }))
      );

      results.processed = resolvedEvents.length;

      // Phase 3: Batch workflow matching (1 query)
      const uniqueEventNames = [...new Set(resolvedEvents.map((e) => e.name))];
      const matchingWorkflows = await findEventWorkflowsBatch(
        auth.organizationId,
        uniqueEventNames
      );

      // Index workflows by event name
      const workflowsByEvent = new Map<
        string,
        { id: string; triggerConfig: unknown }[]
      >();
      for (const wf of matchingWorkflows) {
        const eventName = (wf.triggerConfig as { eventName?: string })
          ?.eventName;
        if (!eventName) {
          continue;
        }
        const existing = workflowsByEvent.get(eventName) || [];
        existing.push(wf);
        workflowsByEvent.set(eventName, existing);
      }

      // Phase 4: Batch waiting execution lookup (1 query)
      const uniqueContactIds = [
        ...new Set(resolvedEvents.map((e) => e.contactRecord.id)),
      ];
      const waitingExecutions = await findWaitingExecutionsBatch(
        auth.organizationId,
        uniqueContactIds,
        uniqueEventNames
      );

      // Index waiting executions by contactId+eventName
      const waitingByKey = new Map<
        string,
        (typeof waitingExecutions)[number][]
      >();
      for (const exec of waitingExecutions) {
        const key = `${exec.contactId}:${exec.waitingForEvent}`;
        const existing = waitingByKey.get(key) || [];
        existing.push(exec);
        waitingByKey.set(key, existing);
      }

      // Phase 5: Collect all SQS jobs and batch enqueue
      const allJobs: WorkflowJob[] = [];

      for (const event of resolvedEvents) {
        // Trigger matching workflows
        const wfs = workflowsByEvent.get(event.name) || [];
        for (const wf of wfs) {
          allJobs.push({
            type: "trigger",
            workflowId: wf.id,
            contactId: event.contactRecord.id,
            organizationId: auth.organizationId,
            eventData: event.properties,
          });
          results.workflowsTriggered++;
        }

        // Resume waiting executions
        const key = `${event.contactRecord.id}:${event.name}`;
        const executions = waitingByKey.get(key) || [];
        for (const execution of executions) {
          // Cancel timeout scheduler (EventBridge API, must be individual)
          if (execution.waitTimeoutSchedulerName) {
            await deleteScheduledStep(execution.waitTimeoutSchedulerName);
          }

          allJobs.push({
            type: "resume",
            executionId: execution.id,
            branch: "yes",
            organizationId: auth.organizationId,
          });
          results.executionsResumed++;
        }
      }

      // Batch enqueue all SQS jobs
      if (allJobs.length > 0) {
        await enqueueWorkflowStepBatch(allJobs);
      }

      // Increment event usage counter with total processed count
      if (results.processed > 0) {
        await incrementEventUsage(auth.organizationId, results.processed);
      }

      return {
        success: results.errors.length === 0,
        ...results,
      };
    },
    {
      body: t.Object({
        events: t.Array(
          t.Object({
            name: t.String({ maxLength: 255 }),
            contactId: t.Optional(t.String({ maxLength: 36 })),
            contactExternalId: t.Optional(t.String({ maxLength: 255 })),
            contactEmail: t.Optional(t.String({ maxLength: 255 })),
            properties: t.Optional(
              t.Object({}, { additionalProperties: true })
            ),
          }),
          { description: "List of events to process", maxItems: 1000 }
        ),
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          processed: t.Number({ description: "Number of events processed" }),
          workflowsTriggered: t.Number({
            description: "Total workflows triggered",
          }),
          executionsResumed: t.Number({
            description: "Total executions resumed",
          }),
          errors: t.Array(t.String(), { description: "Error messages if any" }),
        }),
      },
      detail: {
        summary: "Batch ingest events",
        description: "Process multiple events in a single request",
        tags: ["events"],
      },
    }
  );
