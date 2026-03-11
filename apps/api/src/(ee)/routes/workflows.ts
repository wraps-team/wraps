/**
 * Workflow Trigger Routes
 *
 * API endpoints for directly triggering workflows.
 * Used for workflows with triggerType "api" that are triggered
 * by external systems or customer code.
 */

import { contact, db, eq, workflow, workflowExecution } from "@wraps/db";
import { and, inArray, sql } from "drizzle-orm";
import { t } from "elysia";

import { log } from "../../lib/logger";
import {
  type AuthContext,
  createAuthenticatedRoutes,
} from "../../middleware/auth";
import { rateLimitMiddleware } from "../../middleware/rate-limit";
import { cancelWorkflowExecution } from "../../services/workflow-cancel";
import {
  enqueueWorkflowStep,
  enqueueWorkflowStepBatch,
  type WorkflowJob,
} from "../../services/workflow-queue";

// Common response schemas
const _errorResponse = t.Object({
  success: t.Literal(false),
  error: t.String({ description: "Error message" }),
});

// OpenAPI 3.0 compatible arbitrary properties object
const dataSchema = t.Optional(
  t.Object(
    {},
    { additionalProperties: true, description: "Data to pass to the workflow" }
  )
);

export const workflowsRoutes = createAuthenticatedRoutes("/v1/workflows")
  .use(rateLimitMiddleware)

  /**
   * Trigger a workflow via API
   *
   * POST /v1/workflows/:workflowId/trigger
   *
   * Triggers a specific workflow for a contact. The workflow must have
   * triggerType "api" and be enabled.
   */
  .post(
    "/:workflowId/trigger",
    async (ctx) => {
      const { params, body } = ctx;
      const auth = (ctx as unknown as { auth: AuthContext }).auth;
      const { workflowId } = params;
      const { contactId, contactEmail, data } = body;

      // Find the workflow
      const [wf] = await db
        .select()
        .from(workflow)
        .where(
          and(
            eq(workflow.id, workflowId),
            eq(workflow.organizationId, auth.organizationId)
          )
        )
        .limit(1);

      if (!wf) {
        return {
          success: false,
          error: "Workflow not found",
        };
      }

      // Check workflow is enabled
      if (wf.status !== "enabled") {
        return {
          success: false,
          error: "Workflow is not enabled",
        };
      }

      // Check workflow has api trigger type
      if (wf.triggerType !== "api") {
        return {
          success: false,
          error: `Workflow has trigger type "${wf.triggerType}", expected "api"`,
        };
      }

      // Find the contact
      let contactRecord: typeof contact.$inferSelect | undefined;

      if (contactId) {
        const [c] = await db
          .select()
          .from(contact)
          .where(
            and(
              eq(contact.id, contactId),
              eq(contact.organizationId, auth.organizationId)
            )
          )
          .limit(1);
        contactRecord = c;
      } else if (contactEmail) {
        const [c] = await db
          .select()
          .from(contact)
          .where(
            and(
              eq(contact.email, contactEmail),
              eq(contact.organizationId, auth.organizationId)
            )
          )
          .limit(1);
        contactRecord = c;
      }

      if (!contactRecord) {
        return {
          success: false,
          error: "Contact not found",
        };
      }

      // Enqueue the workflow trigger
      await enqueueWorkflowStep({
        type: "trigger",
        workflowId: wf.id,
        contactId: contactRecord.id,
        organizationId: auth.organizationId,
        eventData: data || {},
      });

      log.info("Workflow API trigger", {
        workflowId: wf.id,
        contactId: contactRecord.id,
      });

      return {
        success: true,
        message: "Workflow triggered successfully",
        workflowId: wf.id,
        workflowName: wf.name,
        contactId: contactRecord.id,
      };
    },
    {
      params: t.Object({
        workflowId: t.String({
          description: "Workflow ID to trigger",
          maxLength: 36,
        }),
      }),
      body: t.Object({
        contactId: t.Optional(
          t.String({ description: "Contact ID", maxLength: 36 })
        ),
        contactEmail: t.Optional(
          t.String({
            description: "Contact email (alternative to contactId)",
            maxLength: 255,
          })
        ),
        data: dataSchema,
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          message: t.Optional(t.String()),
          workflowId: t.Optional(t.String()),
          workflowName: t.Optional(t.String()),
          contactId: t.Optional(t.String()),
          error: t.Optional(t.String()),
        }),
      },
      detail: {
        summary: "Trigger workflow",
        description:
          "Trigger a specific workflow for a contact. The workflow must have triggerType 'api' and be enabled.",
        tags: ["workflows"],
      },
    }
  )

  /**
   * Batch trigger a workflow for multiple contacts
   *
   * POST /v1/workflows/:workflowId/trigger/batch
   *
   * Triggers a workflow for multiple contacts at once.
   */
  .post(
    "/:workflowId/trigger/batch",
    async (ctx) => {
      const { params, body } = ctx;
      const auth = (ctx as unknown as { auth: AuthContext }).auth;
      const { workflowId } = params;
      const { contacts, data } = body;

      // Find the workflow
      const [wf] = await db
        .select()
        .from(workflow)
        .where(
          and(
            eq(workflow.id, workflowId),
            eq(workflow.organizationId, auth.organizationId)
          )
        )
        .limit(1);

      if (!wf) {
        return {
          success: false,
          error: "Workflow not found",
        };
      }

      // Check workflow is enabled
      if (wf.status !== "enabled") {
        return {
          success: false,
          error: "Workflow is not enabled",
        };
      }

      // Check workflow has api trigger type
      if (wf.triggerType !== "api") {
        return {
          success: false,
          error: `Workflow has trigger type "${wf.triggerType}", expected "api"`,
        };
      }

      const results = {
        triggered: 0,
        errors: [] as string[],
      };

      // Batch fetch all contacts in 2 queries (by ID and by email) instead of N queries
      const contactIds = contacts
        .filter((c) => c.contactId)
        .map((c) => c.contactId as string);
      const contactEmails = contacts
        .filter((c) => c.contactEmail && !c.contactId)
        .map((c) => c.contactEmail as string);

      // Fetch contacts by ID
      const contactsById = new Map<string, typeof contact.$inferSelect>();
      if (contactIds.length > 0) {
        const foundById = await db
          .select()
          .from(contact)
          .where(
            and(
              inArray(contact.id, contactIds),
              eq(contact.organizationId, auth.organizationId)
            )
          );
        for (const c of foundById) {
          contactsById.set(c.id, c);
        }
      }

      // Fetch contacts by email
      const contactsByEmail = new Map<string, typeof contact.$inferSelect>();
      if (contactEmails.length > 0) {
        const foundByEmail = await db
          .select()
          .from(contact)
          .where(
            and(
              inArray(contact.email, contactEmails),
              eq(contact.organizationId, auth.organizationId)
            )
          );
        for (const c of foundByEmail) {
          if (c.email) {
            contactsByEmail.set(c.email, c);
          }
        }
      }

      // Process each contact request and collect jobs for batch enqueue.
      // Deduplicate by resolved contactId to prevent double-triggering.
      const jobs: WorkflowJob[] = [];
      const seenContactIds = new Set<string>();
      for (const c of contacts) {
        let contactRecord: typeof contact.$inferSelect | undefined;

        if (c.contactId) {
          contactRecord = contactsById.get(c.contactId);
        } else if (c.contactEmail) {
          contactRecord = contactsByEmail.get(c.contactEmail);
        }

        if (!contactRecord) {
          results.errors.push(
            `Contact not found: ${c.contactId || c.contactEmail}`
          );
          continue;
        }

        if (seenContactIds.has(contactRecord.id)) {
          continue;
        }
        seenContactIds.add(contactRecord.id);

        jobs.push({
          type: "trigger",
          workflowId: wf.id,
          contactId: contactRecord.id,
          organizationId: auth.organizationId,
          eventData: { ...(data || {}), ...(c.data || {}) },
        });

        results.triggered++;
      }

      // Batch enqueue all trigger jobs
      await enqueueWorkflowStepBatch(jobs);

      log.info("Workflow API batch trigger", {
        workflowId: wf.id,
        triggered: results.triggered,
      });

      return {
        success: results.errors.length === 0,
        workflowId: wf.id,
        workflowName: wf.name,
        ...results,
      };
    },
    {
      params: t.Object({
        workflowId: t.String({
          description: "Workflow ID to trigger",
          maxLength: 36,
        }),
      }),
      body: t.Object({
        contacts: t.Array(
          t.Object({
            contactId: t.Optional(t.String({ maxLength: 36 })),
            contactEmail: t.Optional(t.String({ maxLength: 255 })),
            data: t.Optional(t.Object({}, { additionalProperties: true })),
          }),
          { description: "List of contacts to trigger the workflow for" }
        ),
        data: t.Optional(
          t.Object(
            {},
            {
              additionalProperties: true,
              description: "Common data to pass to all workflow triggers",
            }
          )
        ),
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          workflowId: t.Optional(t.String()),
          workflowName: t.Optional(t.String()),
          triggered: t.Optional(
            t.Number({ description: "Number of contacts triggered" })
          ),
          errors: t.Optional(
            t.Array(t.String(), { description: "Error messages if any" })
          ),
          error: t.Optional(t.String()),
        }),
      },
      detail: {
        summary: "Batch trigger workflow",
        description:
          "Trigger a workflow for multiple contacts at once. Each contact can have its own data that gets merged with common data.",
        tags: ["workflows"],
      },
    }
  )

  /**
   * Retry a failed workflow execution
   *
   * POST /v1/workflows/executions/:executionId/retry
   *
   * Resets the failed execution to active and re-enqueues the failed step
   * for processing. Completed steps are preserved.
   */
  .post(
    "/executions/:executionId/retry",
    async (ctx) => {
      const { params } = ctx;
      const auth = (ctx as unknown as { auth: AuthContext }).auth;
      const { executionId } = params;

      // Load execution with org scoping
      const [exec] = await db
        .select()
        .from(workflowExecution)
        .where(
          and(
            eq(workflowExecution.id, executionId),
            eq(workflowExecution.organizationId, auth.organizationId)
          )
        )
        .limit(1);

      if (!exec) {
        return { success: false, error: "Execution not found" };
      }

      if (exec.status !== "failed") {
        return {
          success: false,
          error: "Only failed executions can be retried",
        };
      }

      if (!exec.errorStepId) {
        return { success: false, error: "No error step to retry from" };
      }

      const errorStepId = exec.errorStepId;

      // Reset execution and fix workflow stats atomically.
      // The WHERE includes status='failed' to prevent double-counting
      // if two retry requests race — only one wins the UPDATE.
      const claimed = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(workflowExecution)
          .set({
            status: "active",
            currentStepId: errorStepId,
            error: null,
            errorStepId: null,
            completedAt: null,
            retryCount: sql`${workflowExecution.retryCount} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(workflowExecution.id, executionId),
              eq(workflowExecution.status, "failed")
            )
          )
          .returning({ id: workflowExecution.id });

        if (!updated) return false;

        await tx
          .update(workflow)
          .set({
            activeExecutions: sql`${workflow.activeExecutions} + 1`,
            failedExecutions: sql`GREATEST(0, ${workflow.failedExecutions} - 1)`,
          })
          .where(eq(workflow.id, exec.workflowId));

        return true;
      });

      if (!claimed) {
        return {
          success: false,
          error: "Execution is no longer in failed state",
        };
      }

      // Enqueue the failed step for re-processing
      try {
        await enqueueWorkflowStep({
          type: "execute",
          executionId: exec.id,
          stepId: errorStepId,
          organizationId: auth.organizationId,
        });
      } catch (error) {
        await db.transaction(async (tx) => {
          const [rolledBack] = await tx
            .update(workflowExecution)
            .set({
              status: "failed",
              error: exec.error ?? "Retry enqueue failed",
              errorStepId,
              completedAt: new Date(),
              retryCount: sql`GREATEST(0, ${workflowExecution.retryCount} - 1)`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(workflowExecution.id, executionId),
                eq(workflowExecution.organizationId, auth.organizationId),
                eq(workflowExecution.status, "active"),
                eq(workflowExecution.currentStepId, errorStepId),
                sql`${workflowExecution.errorStepId} IS NULL`
              )
            )
            .returning({ id: workflowExecution.id });

          if (!rolledBack) {
            return;
          }

          await tx
            .update(workflow)
            .set({
              activeExecutions: sql`GREATEST(0, ${workflow.activeExecutions} - 1)`,
              failedExecutions: sql`${workflow.failedExecutions} + 1`,
            })
            .where(eq(workflow.id, exec.workflowId));
        });

        log.error("Workflow execution retry enqueue failed", error, {
          executionId: exec.id,
          stepId: errorStepId,
          workflowId: exec.workflowId,
        });
        return {
          success: false,
          error: "Failed to enqueue execution retry",
        };
      }

      log.info("Workflow execution retry", {
        executionId: exec.id,
        stepId: errorStepId,
        workflowId: exec.workflowId,
      });

      return { success: true, message: "Execution retry started" };
    },
    {
      params: t.Object({
        executionId: t.String({
          description: "Execution ID to retry",
          maxLength: 36,
        }),
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          message: t.Optional(t.String()),
          error: t.Optional(t.String()),
        }),
      },
      detail: {
        summary: "Retry failed execution",
        description:
          "Retry a failed workflow execution from the step where it failed. Completed steps are preserved.",
        tags: ["workflows"],
      },
    }
  )

  /**
   * Cancel a workflow execution
   *
   * POST /v1/workflows/executions/:executionId/cancel
   *
   * Cancels an active execution, cleans up schedulers, adjusts workflow stats.
   */
  .post(
    "/executions/:executionId/cancel",
    async (ctx) => {
      const { params } = ctx;
      const auth = (ctx as unknown as { auth: AuthContext }).auth;

      return cancelWorkflowExecution({
        executionId: params.executionId,
        organizationId: auth.organizationId,
      });
    },
    {
      params: t.Object({
        executionId: t.String({
          description: "Execution ID to cancel",
          maxLength: 36,
        }),
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          error: t.Optional(t.String()),
        }),
      },
      detail: {
        summary: "Cancel workflow execution",
        description:
          "Cancel an active workflow execution. Cleans up schedulers and adjusts workflow stats.",
        tags: ["workflows"],
      },
    }
  );
