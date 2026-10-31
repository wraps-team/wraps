/**
 * Workflow Schedule Routes
 *
 * Internal routes for managing EventBridge one-time schedules
 * for schedule-triggered workflows.
 *
 * Called by server actions on enable/disable/update of scheduled workflows.
 */

import { db, eq, workflow } from "@wraps/db";
import { and } from "drizzle-orm";
import { t } from "elysia";

import { log } from "../../lib/logger";
import { requirePermission } from "../../lib/require-permission";
import { createAuthenticatedRoutes, getAuth } from "../../middleware/auth";
import {
  createNextWorkflowSchedule,
  deleteWorkflowSchedule,
  updateWorkflowSchedule,
} from "../services/workflow-scheduler";

// Body returned when requirePermission denies the caller.
const permissionDeniedResponse = t.Object({
  error: t.String(),
});

/**
 * Verify the workflow belongs to the authenticated organization.
 * Returns the workflow ID if valid, or null if not found.
 */
async function verifyWorkflowOwnership(
  workflowId: string,
  organizationId: string
): Promise<boolean> {
  const [wf] = await db
    .select({ id: workflow.id })
    .from(workflow)
    .where(
      and(
        eq(workflow.id, workflowId),
        eq(workflow.organizationId, organizationId)
      )
    )
    .limit(1);

  return !!wf;
}

export const workflowScheduleRoutes = createAuthenticatedRoutes(
  "/v1/workflow-schedules"
)
  /**
   * Enable a workflow schedule
   *
   * POST /v1/workflow-schedules/:workflowId/enable
   *
   * Creates the next one-time EventBridge Schedule for a workflow.
   */
  .post(
    "/:workflowId/enable",
    async (ctx) => {
      const gate = await requirePermission(ctx, "workflows", ["write"]);
      if (!gate.ok) {
        return gate.body;
      }
      const { params, body, set } = ctx;
      const auth = getAuth(ctx);

      // Verify workflow belongs to this organization
      const isOwner = await verifyWorkflowOwnership(
        params.workflowId,
        auth.organizationId
      );
      if (!isOwner) {
        set.status = 404;
        return { success: false, error: "Workflow not found" };
      }

      try {
        const scheduleName = await createNextWorkflowSchedule({
          workflowId: params.workflowId,
          organizationId: auth.organizationId,
          cronExpression: body.cronExpression,
          timezone: body.timezone,
        });

        return { success: true, scheduleName };
      } catch (error) {
        log.error("Failed to enable workflow schedule", error, {
          workflowId: params.workflowId,
          organizationId: auth.organizationId,
        });
        set.status = 500;
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to create schedule",
        };
      }
    },
    {
      params: t.Object({
        workflowId: t.String(),
      }),
      body: t.Object({
        cronExpression: t.String(),
        timezone: t.Optional(t.String()),
      }),
      response: {
        403: permissionDeniedResponse,
      },
    }
  )

  /**
   * Disable a workflow schedule
   *
   * POST /v1/workflow-schedules/:workflowId/disable
   *
   * Deletes the pending EventBridge Schedule for a workflow.
   */
  .post(
    "/:workflowId/disable",
    async (ctx) => {
      const gate = await requirePermission(ctx, "workflows", ["write"]);
      if (!gate.ok) {
        return gate.body;
      }
      const { params, set } = ctx;
      const auth = getAuth(ctx);

      // Verify workflow belongs to this organization
      const isOwner = await verifyWorkflowOwnership(
        params.workflowId,
        auth.organizationId
      );
      if (!isOwner) {
        set.status = 404;
        return { success: false, error: "Workflow not found" };
      }

      try {
        await deleteWorkflowSchedule(params.workflowId);
        return { success: true };
      } catch (error) {
        log.error("Failed to disable workflow schedule", error, {
          workflowId: params.workflowId,
          organizationId: auth.organizationId,
        });
        set.status = 500;
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to delete schedule",
        };
      }
    },
    {
      params: t.Object({
        workflowId: t.String(),
      }),
      response: {
        403: permissionDeniedResponse,
      },
    }
  )

  /**
   * Update a workflow schedule (reschedule)
   *
   * PUT /v1/workflow-schedules/:workflowId
   *
   * Deletes the old schedule and creates a new one with updated cron.
   */
  .put(
    "/:workflowId",
    async (ctx) => {
      const gate = await requirePermission(ctx, "workflows", ["write"]);
      if (!gate.ok) {
        return gate.body;
      }
      const { params, body, set } = ctx;
      const auth = getAuth(ctx);

      // Verify workflow belongs to this organization
      const isOwner = await verifyWorkflowOwnership(
        params.workflowId,
        auth.organizationId
      );
      if (!isOwner) {
        set.status = 404;
        return { success: false, error: "Workflow not found" };
      }

      try {
        // Atomic update — no gap window between delete and create
        const scheduleName = await updateWorkflowSchedule({
          workflowId: params.workflowId,
          organizationId: auth.organizationId,
          cronExpression: body.cronExpression,
          timezone: body.timezone,
        });

        return { success: true, scheduleName };
      } catch (error) {
        log.error("Failed to update workflow schedule", error, {
          workflowId: params.workflowId,
          organizationId: auth.organizationId,
        });
        set.status = 500;
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to update schedule",
        };
      }
    },
    {
      params: t.Object({
        workflowId: t.String(),
      }),
      body: t.Object({
        cronExpression: t.String(),
        timezone: t.Optional(t.String()),
      }),
      response: {
        403: permissionDeniedResponse,
      },
    }
  );
