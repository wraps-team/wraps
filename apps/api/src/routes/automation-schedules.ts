/**
 * Automation Schedule Routes
 *
 * Internal routes for managing EventBridge one-time schedules
 * for schedule-triggered automations.
 *
 * Called by server actions on enable/disable/update of scheduled automations.
 */

import { automation, db, eq } from "@wraps/db";
import { and } from "drizzle-orm";
import { t } from "elysia";

import {
  type AuthContext,
  createAuthenticatedRoutes,
} from "../middleware/auth";
import {
  createNextAutomationSchedule,
  deleteAutomationSchedule,
} from "../services/automation-scheduler";

/**
 * Verify the automation belongs to the authenticated organization.
 * Returns true if valid, or false if not found.
 */
async function verifyAutomationOwnership(
  automationId: string,
  organizationId: string
): Promise<boolean> {
  const [a] = await db
    .select({ id: automation.id })
    .from(automation)
    .where(
      and(
        eq(automation.id, automationId),
        eq(automation.organizationId, organizationId)
      )
    )
    .limit(1);

  return !!a;
}

export const automationScheduleRoutes = createAuthenticatedRoutes(
  "/v1/automation-schedules"
)
  /**
   * Enable an automation schedule
   *
   * POST /v1/automation-schedules/:automationId/enable
   *
   * Creates the next one-time EventBridge Schedule for an automation.
   */
  .post(
    "/:automationId/enable",
    async (ctx) => {
      const { params, body, set } = ctx;
      const auth = (ctx as unknown as { auth: AuthContext }).auth;

      // Verify automation belongs to this organization
      const isOwner = await verifyAutomationOwnership(
        params.automationId,
        auth.organizationId
      );
      if (!isOwner) {
        set.status = 404;
        return { success: false, error: "Automation not found" };
      }

      try {
        const scheduleName = await createNextAutomationSchedule({
          workflowId: params.automationId,
          organizationId: auth.organizationId,
          cronExpression: body.cronExpression,
          timezone: body.timezone,
        });

        return { success: true, scheduleName };
      } catch (error) {
        console.error(
          `[automation-schedules] Failed to enable schedule for ${params.automationId}:`,
          error
        );
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
        automationId: t.String(),
      }),
      body: t.Object({
        cronExpression: t.String(),
        timezone: t.Optional(t.String()),
      }),
    }
  )

  /**
   * Disable an automation schedule
   *
   * POST /v1/automation-schedules/:automationId/disable
   *
   * Deletes the pending EventBridge Schedule for an automation.
   */
  .post(
    "/:automationId/disable",
    async (ctx) => {
      const { params, set } = ctx;
      const auth = (ctx as unknown as { auth: AuthContext }).auth;

      // Verify automation belongs to this organization
      const isOwner = await verifyAutomationOwnership(
        params.automationId,
        auth.organizationId
      );
      if (!isOwner) {
        set.status = 404;
        return { success: false, error: "Automation not found" };
      }

      try {
        await deleteAutomationSchedule(params.automationId);
        return { success: true };
      } catch (error) {
        console.error(
          `[automation-schedules] Failed to disable schedule for ${params.automationId}:`,
          error
        );
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
        automationId: t.String(),
      }),
    }
  )

  /**
   * Update an automation schedule (reschedule)
   *
   * PUT /v1/automation-schedules/:automationId
   *
   * Deletes the old schedule and creates a new one with updated cron.
   */
  .put(
    "/:automationId",
    async (ctx) => {
      const { params, body, set } = ctx;
      const auth = (ctx as unknown as { auth: AuthContext }).auth;

      // Verify automation belongs to this organization
      const isOwner = await verifyAutomationOwnership(
        params.automationId,
        auth.organizationId
      );
      if (!isOwner) {
        set.status = 404;
        return { success: false, error: "Automation not found" };
      }

      try {
        // Delete old schedule first
        await deleteAutomationSchedule(params.automationId);

        // Create new schedule with updated cron
        const scheduleName = await createNextAutomationSchedule({
          workflowId: params.automationId,
          organizationId: auth.organizationId,
          cronExpression: body.cronExpression,
          timezone: body.timezone,
        });

        return { success: true, scheduleName };
      } catch (error) {
        console.error(
          `[automation-schedules] Failed to update schedule for ${params.automationId}:`,
          error
        );
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
        automationId: t.String(),
      }),
      body: t.Object({
        cronExpression: t.String(),
        timezone: t.Optional(t.String()),
      }),
    }
  );

/** @deprecated Use `automationScheduleRoutes` instead */
export const workflowScheduleRoutes = automationScheduleRoutes;
