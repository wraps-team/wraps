"use server";

import { auth } from "@wraps/auth";
import {
  type Automation,
  type AutomationStep,
  type AutomationTransition,
  type AutomationTriggerType,
  automation,
  automationExecution,
  type CanvasViewport,
  db,
  type TriggerConfig,
  template,
} from "@wraps/db";
import { and, count, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { trackWorkflowCreated } from "@/lib/activation-tracking";
import { createActionLogger, serializeError } from "@/lib/logger";
import { checkFeatureAccess, checkWorkflowLimit } from "@/lib/plan-limits";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type AutomationWithMeta = Automation & {
  createdByUser?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

export type ListAutomationsResult =
  | {
      success: true;
      automations: AutomationWithMeta[];
      total: number;
      page: number;
      pageSize: number;
    }
  | { success: false; error: string };

export type GetAutomationResult =
  | { success: true; automation: AutomationWithMeta }
  | { success: false; error: string };

export type CreateAutomationResult =
  | { success: true; automation: AutomationWithMeta }
  | { success: false; error: string };

export type UpdateAutomationResult =
  | { success: true; automation: AutomationWithMeta }
  | { success: false; error: string };

export type DeleteAutomationResult =
  | { success: true }
  | { success: false; error: string };

export type EnableAutomationResult =
  | { success: true; automation: AutomationWithMeta }
  | { success: false; error: string };

export type DuplicateAutomationResult =
  | { success: true; automation: AutomationWithMeta }
  | { success: false; error: string };

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verify user has access to organization
 */
async function verifyOrgAccess(
  organizationId: string
): Promise<{ userId: string; userEmail: string; role: string } | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return null;
  }

  const membership = await db.query.member.findFirst({
    where: (m, { and, eq }) =>
      and(eq(m.organizationId, organizationId), eq(m.userId, session.user.id)),
  });

  if (!membership) {
    return null;
  }

  return {
    userId: session.user.id,
    userEmail: session.user.email,
    role: membership.role,
  };
}

/**
 * Validate automation definition for common issues
 */
function validateAutomationDefinition(
  steps: AutomationStep[],
  transitions: AutomationTransition[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for trigger node
  const triggerSteps = steps.filter((s) => s.type === "trigger");
  if (triggerSteps.length === 0) {
    errors.push("Automation must have a trigger node");
  } else if (triggerSteps.length > 1) {
    errors.push("Automation can only have one trigger node");
  }

  // Check all steps have IDs
  for (const step of steps) {
    if (!step.id) {
      errors.push("All steps must have an ID");
      break;
    }
  }

  // Check transitions reference valid step IDs
  const stepIds = new Set(steps.map((s) => s.id));
  for (const transition of transitions) {
    if (!stepIds.has(transition.fromStepId)) {
      errors.push(
        `Transition references unknown step: ${transition.fromStepId}`
      );
    }
    if (!stepIds.has(transition.toStepId)) {
      errors.push(`Transition references unknown step: ${transition.toStepId}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTOMATION SCHEDULE API HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Call the automation schedule API to manage EventBridge schedules.
 * Follows the same pattern as batch.ts for auth + org headers.
 */
async function callAutomationScheduleApi(
  automationId: string,
  organizationId: string,
  action: "enable" | "disable" | "update",
  body?: { cronExpression: string; timezone?: string }
): Promise<{ success: boolean; error?: string }> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    console.error("[automation-schedule] NEXT_PUBLIC_API_URL not configured");
    return { success: false, error: "API URL not configured" };
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.session?.token) {
    return { success: false, error: "Not authenticated" };
  }

  const baseHeaders: Record<string, string> = {
    Authorization: `Bearer ${session.session.token}`,
    "X-Organization-Id": organizationId,
  };

  let url: string;
  let method: string;
  let fetchBody: string | undefined;

  switch (action) {
    case "enable":
      url = `${apiUrl}/v1/automation-schedules/${automationId}/enable`;
      method = "POST";
      fetchBody = JSON.stringify(body);
      baseHeaders["Content-Type"] = "application/json";
      break;
    case "disable":
      url = `${apiUrl}/v1/automation-schedules/${automationId}/disable`;
      method = "POST";
      break;
    case "update":
      url = `${apiUrl}/v1/automation-schedules/${automationId}`;
      method = "PUT";
      fetchBody = JSON.stringify(body);
      baseHeaders["Content-Type"] = "application/json";
      break;
  }

  try {
    const response = await fetch(url, {
      method,
      headers: baseHeaders,
      body: fetchBody,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(
        `[automation-schedule] API ${action} failed for ${automationId}: ${response.status} ${text}`
      );
      return { success: false, error: text };
    }

    return { success: true };
  } catch (error) {
    console.error(
      `[automation-schedule] API ${action} error for ${automationId}:`,
      error
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "API call failed",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List automations for an organization with pagination
 */
export async function listAutomations(
  organizationId: string,
  options: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: Automation["status"];
  } = {}
): Promise<ListAutomationsResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const { page = 1, pageSize = 50, search, status } = options;
    const offset = (page - 1) * pageSize;

    // Build where conditions
    const conditions = [eq(automation.organizationId, organizationId)];

    if (search) {
      conditions.push(ilike(automation.name, `%${search}%`));
    }

    if (status) {
      conditions.push(eq(automation.status, status));
    }

    // Get total count
    const [totalResult] = await db
      .select({ count: count() })
      .from(automation)
      .where(and(...conditions));

    const total = totalResult?.count ?? 0;

    // Get automations with pagination
    const automations = await db.query.automation.findMany({
      where: and(...conditions),
      with: {
        createdByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [desc(automation.updatedAt)],
      limit: pageSize,
      offset,
    });

    return {
      success: true,
      automations: automations as AutomationWithMeta[],
      total,
      page,
      pageSize,
    };
  } catch (error) {
    const log = createActionLogger("listAutomations", {
      orgSlug: organizationId,
    });
    log.error({ err: serializeError(error) }, "Failed to list automations");
    return { success: false, error: "Failed to fetch automations" };
  }
}

/**
 * Get a single automation by ID
 */
export async function getAutomation(
  automationId: string,
  organizationId: string
): Promise<GetAutomationResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const a = await db.query.automation.findFirst({
      where: and(
        eq(automation.id, automationId),
        eq(automation.organizationId, organizationId)
      ),
      with: {
        createdByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!a) {
      return { success: false, error: "Automation not found" };
    }

    return { success: true, automation: a as AutomationWithMeta };
  } catch (error) {
    const log = createActionLogger("getAutomation", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), automationId },
      "Failed to get automation"
    );
    return { success: false, error: "Failed to fetch automation" };
  }
}

/**
 * Create a new automation
 */
export async function createAutomation(
  organizationId: string,
  data: {
    name: string;
    description?: string;
    awsAccountId?: string;
    topicId?: string;
  }
): Promise<CreateAutomationResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Check if automations feature is available for this plan
    const featureCheck = await checkFeatureAccess(
      organizationId,
      "automations"
    );
    if (!featureCheck.allowed) {
      return {
        success: false,
        error:
          featureCheck.message ?? "Automations require an active subscription.",
      };
    }

    // Check if organization has reached their automation limit
    const limitCheck = await checkWorkflowLimit(organizationId);
    if (!limitCheck.allowed) {
      return {
        success: false,
        error: limitCheck.message ?? "You have reached your automation limit.",
      };
    }

    if (!data.name?.trim()) {
      return { success: false, error: "Automation name is required" };
    }

    // Create default trigger step
    const triggerId = crypto.randomUUID();
    const defaultSteps: AutomationStep[] = [
      {
        id: triggerId,
        type: "trigger",
        name: "Trigger",
        position: { x: 400, y: 50 },
        config: {
          type: "trigger",
          triggerType: "event",
        },
      },
    ];

    const [newAutomation] = await db
      .insert(automation)
      .values({
        organizationId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        awsAccountId: data.awsAccountId || null,
        topicId: data.topicId || null,
        status: "draft",
        triggerType: "event",
        triggerConfig: {},
        steps: defaultSteps,
        transitions: [],
        createdBy: access.userId,
      })
      .returning();

    if (!newAutomation) {
      return { success: false, error: "Failed to create automation" };
    }

    // Revalidate
    revalidatePath("/[orgSlug]/automations", "page");

    // Track activation event
    await trackWorkflowCreated(access.userEmail, organizationId).catch(
      (err) => {
        const log = createActionLogger("createAutomation", {
          orgSlug: organizationId,
        });
        log.error(
          { err: serializeError(err) },
          "Failed to track automation created"
        );
      }
    );

    return await getAutomation(newAutomation.id, organizationId);
  } catch (error) {
    const log = createActionLogger("createAutomation", {
      orgSlug: organizationId,
    });
    log.error({ err: serializeError(error) }, "Failed to create automation");
    return { success: false, error: "Failed to create automation" };
  }
}

/**
 * Update an automation
 */
export async function updateAutomation(
  automationId: string,
  organizationId: string,
  data: {
    name?: string;
    description?: string;
    awsAccountId?: string | null;
    topicId?: string | null;
    triggerType?: AutomationTriggerType;
    triggerConfig?: TriggerConfig;
    steps?: AutomationStep[];
    transitions?: AutomationTransition[];
    canvasViewport?: CanvasViewport;
    allowReentry?: boolean;
    reentryDelaySeconds?: number | null;
    maxConcurrentExecutions?: number;
    contactCooldownSeconds?: number | null;
    // Sender defaults
    defaultFrom?: string | null;
    defaultFromName?: string | null;
    defaultReplyTo?: string | null;
    defaultSenderId?: string | null;
  }
): Promise<UpdateAutomationResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Check if automations feature is available for this plan
    const featureCheck = await checkFeatureAccess(
      organizationId,
      "automations"
    );
    if (!featureCheck.allowed) {
      return {
        success: false,
        error:
          featureCheck.message ?? "Automations require an active subscription.",
      };
    }

    // Verify automation exists
    const existing = await db.query.automation.findFirst({
      where: and(
        eq(automation.id, automationId),
        eq(automation.organizationId, organizationId)
      ),
    });

    if (!existing) {
      return { success: false, error: "Automation not found" };
    }

    // Validate steps/transitions if provided
    if (data.steps !== undefined || data.transitions !== undefined) {
      const steps = data.steps ?? (existing.steps as AutomationStep[]);
      const transitions =
        data.transitions ?? (existing.transitions as AutomationTransition[]);

      const validation = validateAutomationDefinition(steps, transitions);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid automation: ${validation.errors.join(", ")}`,
        };
      }
    }

    // Build update data
    const updateData: Partial<typeof automation.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) {
      if (!data.name.trim()) {
        return { success: false, error: "Automation name is required" };
      }
      updateData.name = data.name.trim();
    }

    if (data.description !== undefined) {
      updateData.description = data.description?.trim() || null;
    }

    if (data.awsAccountId !== undefined) {
      updateData.awsAccountId = data.awsAccountId;
    }

    if (data.topicId !== undefined) {
      updateData.topicId = data.topicId;
    }

    if (data.triggerType !== undefined) {
      updateData.triggerType = data.triggerType;
    }

    if (data.triggerConfig !== undefined) {
      updateData.triggerConfig = data.triggerConfig;
    }

    if (data.steps !== undefined) {
      updateData.steps = data.steps;
    }

    if (data.transitions !== undefined) {
      updateData.transitions = data.transitions;
    }

    // Bump version when the definition (steps or transitions) changes
    // so new executions get a fresh snapshot and existing snapshots stay valid
    if (data.steps !== undefined || data.transitions !== undefined) {
      (updateData as Record<string, unknown>).version =
        sql`${automation.version} + 1`;
    }

    if (data.canvasViewport !== undefined) {
      updateData.canvasViewport = data.canvasViewport;
    }

    if (data.allowReentry !== undefined) {
      updateData.allowReentry = data.allowReentry;
    }

    if (data.reentryDelaySeconds !== undefined) {
      updateData.reentryDelaySeconds = data.reentryDelaySeconds;
    }

    if (data.maxConcurrentExecutions !== undefined) {
      updateData.maxConcurrentExecutions = data.maxConcurrentExecutions;
    }

    if (data.contactCooldownSeconds !== undefined) {
      updateData.contactCooldownSeconds = data.contactCooldownSeconds;
    }

    // Sender defaults
    if (data.defaultFrom !== undefined) {
      updateData.defaultFrom = data.defaultFrom;
    }

    if (data.defaultFromName !== undefined) {
      updateData.defaultFromName = data.defaultFromName;
    }

    if (data.defaultReplyTo !== undefined) {
      updateData.defaultReplyTo = data.defaultReplyTo;
    }

    if (data.defaultSenderId !== undefined) {
      updateData.defaultSenderId = data.defaultSenderId;
    }

    // Update automation
    await db
      .update(automation)
      .set(updateData)
      .where(
        and(
          eq(automation.id, automationId),
          eq(automation.organizationId, organizationId)
        )
      );

    // Handle schedule changes for enabled automations
    if (existing.status === "enabled") {
      const oldTriggerType = existing.triggerType;
      const newTriggerType = data.triggerType ?? oldTriggerType;
      const oldConfig = existing.triggerConfig as TriggerConfig;
      const newConfig = data.triggerConfig ?? oldConfig;

      // TriggerType changed FROM schedule → delete old schedule
      if (oldTriggerType === "schedule" && newTriggerType !== "schedule") {
        await callAutomationScheduleApi(
          automationId,
          organizationId,
          "disable"
        );
      }

      // TriggerType changed TO schedule → create new schedule
      if (
        oldTriggerType !== "schedule" &&
        newTriggerType === "schedule" &&
        newConfig.schedule
      ) {
        await callAutomationScheduleApi(
          automationId,
          organizationId,
          "enable",
          {
            cronExpression: newConfig.schedule,
            timezone: newConfig.timezone,
          }
        );
      }

      // TriggerType stayed schedule but cron/timezone changed → reschedule
      if (
        oldTriggerType === "schedule" &&
        newTriggerType === "schedule" &&
        data.triggerConfig !== undefined &&
        newConfig.schedule &&
        (oldConfig.schedule !== newConfig.schedule ||
          oldConfig.timezone !== newConfig.timezone)
      ) {
        await callAutomationScheduleApi(
          automationId,
          organizationId,
          "update",
          {
            cronExpression: newConfig.schedule,
            timezone: newConfig.timezone,
          }
        );
      }
    }

    // Revalidate
    revalidatePath("/[orgSlug]/automations", "page");
    revalidatePath(`/[orgSlug]/automations/${automationId}`, "page");

    return await getAutomation(automationId, organizationId);
  } catch (error) {
    const log = createActionLogger("updateAutomation", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), automationId },
      "Failed to update automation"
    );
    return { success: false, error: "Failed to update automation" };
  }
}

/**
 * Delete an automation
 */
export async function deleteAutomation(
  automationId: string,
  organizationId: string
): Promise<DeleteAutomationResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Check if automations feature is available for this plan
    const featureCheck = await checkFeatureAccess(
      organizationId,
      "automations"
    );
    if (!featureCheck.allowed) {
      return {
        success: false,
        error:
          featureCheck.message ?? "Automations require an active subscription.",
      };
    }

    // Verify automation exists
    const existing = await db.query.automation.findFirst({
      where: and(
        eq(automation.id, automationId),
        eq(automation.organizationId, organizationId)
      ),
    });

    if (!existing) {
      return { success: false, error: "Automation not found" };
    }

    // Check for active executions
    const [activeCount] = await db
      .select({ count: count() })
      .from(automationExecution)
      .where(
        and(
          eq(automationExecution.workflowId, automationId),
          inArray(automationExecution.status, [
            "pending",
            "active",
            "paused",
            "waiting",
          ])
        )
      );

    if ((activeCount?.count ?? 0) > 0) {
      return {
        success: false,
        error: `Cannot delete automation with ${activeCount?.count} active execution(s). Disable the automation first and wait for executions to complete.`,
      };
    }

    // Clean up pending schedule before delete (best effort)
    if (existing.triggerType === "schedule") {
      await callAutomationScheduleApi(automationId, organizationId, "disable");
    }

    // Delete automation (cascades to executions)
    await db
      .delete(automation)
      .where(
        and(
          eq(automation.id, automationId),
          eq(automation.organizationId, organizationId)
        )
      );

    // Revalidate
    revalidatePath("/[orgSlug]/automations", "page");

    return { success: true };
  } catch (error) {
    const log = createActionLogger("deleteAutomation", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), automationId },
      "Failed to delete automation"
    );
    return { success: false, error: "Failed to delete automation" };
  }
}

/**
 * Enable an automation (make it active and start accepting triggers)
 */
export async function enableAutomation(
  automationId: string,
  organizationId: string
): Promise<EnableAutomationResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Check if automations feature is available for this plan
    const featureCheck = await checkFeatureAccess(
      organizationId,
      "automations"
    );
    if (!featureCheck.allowed) {
      return {
        success: false,
        error:
          featureCheck.message ?? "Automations require an active subscription.",
      };
    }

    // Get automation
    const existing = await db.query.automation.findFirst({
      where: and(
        eq(automation.id, automationId),
        eq(automation.organizationId, organizationId)
      ),
    });

    if (!existing) {
      return { success: false, error: "Automation not found" };
    }

    // Require AWS account to be configured
    if (!existing.awsAccountId) {
      return {
        success: false,
        error:
          "Please select an AWS account in automation settings before enabling",
      };
    }

    // Validate automation has required configuration
    const steps = existing.steps as AutomationStep[];
    const transitions = existing.transitions as AutomationTransition[];

    const validation = validateAutomationDefinition(steps, transitions);
    if (!validation.valid) {
      return {
        success: false,
        error: `Cannot enable automation: ${validation.errors.join(", ")}`,
      };
    }

    // Check trigger is configured
    const triggerStep = steps.find((s) => s.type === "trigger");
    if (!triggerStep) {
      return {
        success: false,
        error: "Automation must have a trigger configured",
      };
    }

    // Validate trigger configuration based on type
    const triggerConfig = existing.triggerConfig as TriggerConfig;

    switch (existing.triggerType) {
      case "event":
        // Custom event triggers require eventName
        if (!triggerConfig?.eventName) {
          return {
            success: false,
            error: "Custom event trigger must have an event name configured",
          };
        }
        break;

      case "schedule":
        // Schedule triggers require a cron expression
        if (!triggerConfig?.schedule) {
          return {
            success: false,
            error: "Schedule trigger must have a cron expression configured",
          };
        }
        break;

      case "segment_entry":
      case "segment_exit":
        // Segment triggers require a segmentId
        if (!triggerConfig?.segmentId) {
          return {
            success: false,
            error: "Segment trigger must have a segment selected",
          };
        }
        break;

      case "topic_subscribed":
      case "topic_unsubscribed":
        // Topic triggers require a topicId
        if (!triggerConfig?.topicId) {
          return {
            success: false,
            error: "Topic trigger must have a topic selected",
          };
        }
        break;

      case "api":
      case "contact_created":
      case "contact_updated":
        // These triggers don't require additional configuration
        break;
    }

    // Check automation has at least one action step
    const actionSteps = steps.filter(
      (s) => s.type !== "trigger" && s.type !== "exit"
    );
    if (actionSteps.length === 0) {
      return {
        success: false,
        error: "Automation must have at least one action step",
      };
    }

    // Defense-in-depth: verify referenced templates exist
    const emailSteps = steps.filter((s) => s.type === "send_email");
    const templateIds = emailSteps
      .map((s) => (s.config.type === "send_email" ? s.config.templateId : ""))
      .filter(Boolean);
    const uniqueTemplateIds = [...new Set(templateIds)];

    if (uniqueTemplateIds.length > 0) {
      const foundTemplates = await db
        .select({ id: template.id })
        .from(template)
        .where(
          and(
            eq(template.organizationId, organizationId),
            inArray(template.id, uniqueTemplateIds)
          )
        );

      const foundIds = new Set(foundTemplates.map((t) => t.id));
      const missingCount = uniqueTemplateIds.filter(
        (id) => !foundIds.has(id)
      ).length;

      if (missingCount > 0) {
        return {
          success: false,
          error: `Cannot enable: ${missingCount} referenced template${missingCount > 1 ? "s do" : " does"} not exist`,
        };
      }
    }

    // Defense-in-depth: require sender email when email steps exist
    if (emailSteps.length > 0 && !existing.defaultFrom) {
      return {
        success: false,
        error:
          "Please configure a sender email in automation settings before enabling",
      };
    }

    // If schedule trigger, create EventBridge schedule BEFORE setting status
    // to avoid a window where the automation is "enabled" without a valid schedule
    if (existing.triggerType === "schedule" && triggerConfig.schedule) {
      const scheduleResult = await callAutomationScheduleApi(
        automationId,
        organizationId,
        "enable",
        {
          cronExpression: triggerConfig.schedule,
          timezone: triggerConfig.timezone,
        }
      );

      if (!scheduleResult.success) {
        return {
          success: false,
          error: `Failed to create schedule: ${scheduleResult.error}`,
        };
      }
    }

    // Enable automation (schedule already created if needed)
    await db
      .update(automation)
      .set({
        status: "enabled",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(automation.id, automationId),
          eq(automation.organizationId, organizationId)
        )
      );

    // Revalidate
    revalidatePath("/[orgSlug]/automations", "page");
    revalidatePath(`/[orgSlug]/automations/${automationId}`, "page");

    return await getAutomation(automationId, organizationId);
  } catch (error) {
    const log = createActionLogger("enableAutomation", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), automationId },
      "Failed to enable automation"
    );
    return { success: false, error: "Failed to enable automation" };
  }
}

/**
 * Disable an automation (stop accepting new triggers, existing executions continue)
 */
export async function disableAutomation(
  automationId: string,
  organizationId: string
): Promise<EnableAutomationResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Check if automations feature is available for this plan
    const featureCheck = await checkFeatureAccess(
      organizationId,
      "automations"
    );
    if (!featureCheck.allowed) {
      return {
        success: false,
        error:
          featureCheck.message ?? "Automations require an active subscription.",
      };
    }

    // Verify automation exists
    const existing = await db.query.automation.findFirst({
      where: and(
        eq(automation.id, automationId),
        eq(automation.organizationId, organizationId)
      ),
    });

    if (!existing) {
      return { success: false, error: "Automation not found" };
    }

    // Pause automation and mark as edited from dashboard (for CLI conflict detection)
    await db
      .update(automation)
      .set({
        status: "paused",
        lastEditedFrom: "dashboard",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(automation.id, automationId),
          eq(automation.organizationId, organizationId)
        )
      );

    // If schedule trigger, delete pending EventBridge schedule (best effort)
    if (existing.triggerType === "schedule") {
      await callAutomationScheduleApi(automationId, organizationId, "disable");
    }

    // Revalidate
    revalidatePath("/[orgSlug]/automations", "page");
    revalidatePath(`/[orgSlug]/automations/${automationId}`, "page");

    return await getAutomation(automationId, organizationId);
  } catch (error) {
    const log = createActionLogger("disableAutomation", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), automationId },
      "Failed to disable automation"
    );
    return { success: false, error: "Failed to disable automation" };
  }
}

/**
 * Duplicate an automation
 */
export async function duplicateAutomation(
  automationId: string,
  organizationId: string
): Promise<DuplicateAutomationResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Check if automations feature is available for this plan
    const featureCheck = await checkFeatureAccess(
      organizationId,
      "automations"
    );
    if (!featureCheck.allowed) {
      return {
        success: false,
        error:
          featureCheck.message ?? "Automations require an active subscription.",
      };
    }

    // Check if organization has reached their automation limit
    const limitCheck = await checkWorkflowLimit(organizationId);
    if (!limitCheck.allowed) {
      return {
        success: false,
        error: limitCheck.message ?? "You have reached your automation limit.",
      };
    }

    // Get original automation
    const original = await db.query.automation.findFirst({
      where: and(
        eq(automation.id, automationId),
        eq(automation.organizationId, organizationId)
      ),
    });

    if (!original) {
      return { success: false, error: "Automation not found" };
    }

    // Generate new IDs for steps and update transitions
    const oldToNewIdMap = new Map<string, string>();
    const originalSteps = original.steps as AutomationStep[];
    const originalTransitions = original.transitions as AutomationTransition[];

    // Map old step IDs to new ones
    for (const step of originalSteps) {
      oldToNewIdMap.set(step.id, crypto.randomUUID());
    }

    // Create new steps with updated IDs
    const newSteps: AutomationStep[] = originalSteps.map((step) => ({
      ...step,
      id: oldToNewIdMap.get(step.id)!,
    }));

    // Create new transitions with updated IDs
    const newTransitions: AutomationTransition[] = originalTransitions.map(
      (transition) => ({
        ...transition,
        id: crypto.randomUUID(),
        fromStepId:
          oldToNewIdMap.get(transition.fromStepId) || transition.fromStepId,
        toStepId: oldToNewIdMap.get(transition.toStepId) || transition.toStepId,
      })
    );

    // Create duplicate automation
    const [newAutomation] = await db
      .insert(automation)
      .values({
        organizationId,
        name: `${original.name} (copy)`,
        description: original.description,
        awsAccountId: original.awsAccountId,
        topicId: original.topicId,
        status: "draft", // Always start as draft
        triggerType: original.triggerType,
        triggerConfig: original.triggerConfig,
        steps: newSteps,
        transitions: newTransitions,
        canvasViewport: original.canvasViewport,
        allowReentry: original.allowReentry,
        reentryDelaySeconds: original.reentryDelaySeconds,
        maxConcurrentExecutions: original.maxConcurrentExecutions,
        contactCooldownSeconds: original.contactCooldownSeconds,
        createdBy: access.userId,
      })
      .returning();

    if (!newAutomation) {
      return { success: false, error: "Failed to duplicate automation" };
    }

    // Revalidate
    revalidatePath("/[orgSlug]/automations", "page");

    return await getAutomation(newAutomation.id, organizationId);
  } catch (error) {
    const log = createActionLogger("duplicateAutomation", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), automationId },
      "Failed to duplicate automation"
    );
    return { success: false, error: "Failed to duplicate automation" };
  }
}

/**
 * Get automation execution statistics
 */
export async function getAutomationStats(
  automationId: string,
  organizationId: string
): Promise<
  | {
      success: true;
      stats: {
        total: number;
        active: number;
        completed: number;
        failed: number;
      };
    }
  | { success: false; error: string }
> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Verify automation exists
    const existing = await db.query.automation.findFirst({
      where: and(
        eq(automation.id, automationId),
        eq(automation.organizationId, organizationId)
      ),
      columns: {
        totalExecutions: true,
        activeExecutions: true,
        completedExecutions: true,
        failedExecutions: true,
      },
    });

    if (!existing) {
      return { success: false, error: "Automation not found" };
    }

    return {
      success: true,
      stats: {
        total: existing.totalExecutions,
        active: existing.activeExecutions,
        completed: existing.completedExecutions,
        failed: existing.failedExecutions,
      },
    };
  } catch (error) {
    const log = createActionLogger("getAutomationStats", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), automationId },
      "Failed to get automation stats"
    );
    return { success: false, error: "Failed to get automation stats" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKWARD-COMPAT ALIASES
// ═══════════════════════════════════════════════════════════════════════════

/** @deprecated Use AutomationWithMeta */
export type WorkflowWithMeta = AutomationWithMeta;

/** @deprecated Use ListAutomationsResult */
export type ListWorkflowsResult = ListAutomationsResult;

/** @deprecated Use GetAutomationResult */
export type GetWorkflowResult = GetAutomationResult;

/** @deprecated Use CreateAutomationResult */
export type CreateWorkflowResult = CreateAutomationResult;

/** @deprecated Use UpdateAutomationResult */
export type UpdateWorkflowResult = UpdateAutomationResult;

/** @deprecated Use DeleteAutomationResult */
export type DeleteWorkflowResult = DeleteAutomationResult;

/** @deprecated Use EnableAutomationResult */
export type EnableWorkflowResult = EnableAutomationResult;

/** @deprecated Use DuplicateAutomationResult */
export type DuplicateWorkflowResult = DuplicateAutomationResult;

/** @deprecated Use listAutomations */
export const listWorkflows = listAutomations as (
  organizationId: string,
  options?: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: Automation["status"];
  }
) => Promise<ListAutomationsResult>;

/** @deprecated Use getAutomation */
export const getWorkflow = getAutomation;

/** @deprecated Use createAutomation */
export const createWorkflow = createAutomation;

/** @deprecated Use updateAutomation */
export const updateWorkflow = updateAutomation;

/** @deprecated Use deleteAutomation */
export const deleteWorkflow = deleteAutomation;

/** @deprecated Use enableAutomation */
export const enableWorkflow = enableAutomation;

/** @deprecated Use disableAutomation */
export const disableWorkflow = disableAutomation;

/** @deprecated Use duplicateAutomation */
export const duplicateWorkflow = duplicateAutomation;

/** @deprecated Use getAutomationStats */
export const getWorkflowStats = getAutomationStats;
