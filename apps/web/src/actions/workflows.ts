"use server";
// baseline:allow-large-file

import { auth } from "@wraps/auth";
import {
  type CanvasViewport,
  contact,
  db,
  type TriggerConfig,
  template,
  type Workflow,
  type WorkflowExecution,
  type WorkflowExecutionStatus,
  type WorkflowStep,
  type WorkflowStepExecutionRecord,
  type WorkflowTransition,
  type WorkflowTriggerType,
  workflow,
  workflowExecution,
  workflowStepExecution,
} from "@wraps/db";
import { and, asc, count, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { trackWorkflowCreated } from "@/lib/activation-tracking";
import { createActionLogger, serializeError } from "@/lib/logger";
import { checkFeatureAccess, checkWorkflowLimit } from "@/lib/plan-limits";
import { verifyOrgAccess } from "./shared/verify-org-access";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type WorkflowWithMeta = Workflow & {
  createdByUser?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

export type ListWorkflowsResult =
  | {
      success: true;
      workflows: WorkflowWithMeta[];
      total: number;
      page: number;
      pageSize: number;
    }
  | { success: false; error: string };

export type GetWorkflowResult =
  | { success: true; workflow: WorkflowWithMeta }
  | { success: false; error: string };

export type CreateWorkflowResult =
  | { success: true; workflow: WorkflowWithMeta }
  | { success: false; error: string };

export type UpdateWorkflowResult =
  | { success: true; workflow: WorkflowWithMeta }
  | { success: false; error: string };

export type DeleteWorkflowResult =
  | { success: true }
  | { success: false; error: string };

export type EnableWorkflowResult =
  | { success: true; workflow: WorkflowWithMeta }
  | { success: false; error: string };

export type DuplicateWorkflowResult =
  | { success: true; workflow: WorkflowWithMeta }
  | { success: false; error: string };

export type ExecutionWithContact = WorkflowExecution & {
  contact: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
};

export type ListWorkflowExecutionsResult =
  | {
      success: true;
      executions: ExecutionWithContact[];
      total: number;
      page: number;
      pageSize: number;
    }
  | { success: false; error: string };

export type ExecutionDetail = WorkflowExecution & {
  contact: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
  workflow: { name: string } | null;
  stepExecutions: WorkflowStepExecutionRecord[];
};

export type GetWorkflowExecutionResult =
  | { success: true; execution: ExecutionDetail }
  | { success: false; error: string };

/**
 * Validate workflow definition for common issues
 */
function validateWorkflowDefinition(
  steps: WorkflowStep[],
  transitions: WorkflowTransition[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for trigger node
  const triggerSteps = steps.filter((s) => s.type === "trigger");
  if (triggerSteps.length === 0) {
    errors.push("Workflow must have a trigger node");
  } else if (triggerSteps.length > 1) {
    errors.push("Workflow can only have one trigger node");
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
// WORKFLOW SCHEDULE API HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Call the workflow schedule API to manage EventBridge schedules.
 * Follows the same pattern as batch.ts for auth + org headers.
 */
async function callWorkflowScheduleApi(
  workflowId: string,
  organizationId: string,
  action: "enable" | "disable" | "update",
  body?: { cronExpression: string; timezone?: string }
): Promise<{ success: boolean; error?: string }> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    console.error("[workflow-schedule] NEXT_PUBLIC_API_URL not configured");
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
      url = `${apiUrl}/v1/workflow-schedules/${workflowId}/enable`;
      method = "POST";
      fetchBody = JSON.stringify(body);
      baseHeaders["Content-Type"] = "application/json";
      break;
    case "disable":
      url = `${apiUrl}/v1/workflow-schedules/${workflowId}/disable`;
      method = "POST";
      break;
    case "update":
      url = `${apiUrl}/v1/workflow-schedules/${workflowId}`;
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
        `[workflow-schedule] API ${action} failed for ${workflowId}: ${response.status} ${text}`
      );
      return { success: false, error: text };
    }

    return { success: true };
  } catch (error) {
    console.error(
      `[workflow-schedule] API ${action} error for ${workflowId}:`,
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
 * List workflows for an organization with pagination
 */
export async function listWorkflows(
  organizationId: string,
  options: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: Workflow["status"];
  } = {}
): Promise<ListWorkflowsResult> {
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
    const conditions = [eq(workflow.organizationId, organizationId)];

    if (search) {
      conditions.push(ilike(workflow.name, `%${search}%`));
    }

    if (status) {
      conditions.push(eq(workflow.status, status));
    }

    // Get total count
    const [totalResult] = await db
      .select({ count: count() })
      .from(workflow)
      .where(and(...conditions));

    const total = totalResult?.count ?? 0;

    // Get workflows with pagination
    const workflows = await db.query.workflow.findMany({
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
      orderBy: [desc(workflow.updatedAt)],
      limit: pageSize,
      offset,
    });

    return {
      success: true,
      workflows: workflows as WorkflowWithMeta[],
      total,
      page,
      pageSize,
    };
  } catch (error) {
    const log = createActionLogger("listWorkflows", {
      orgSlug: organizationId,
    });
    log.error({ err: serializeError(error) }, "Failed to list workflows");
    return { success: false, error: "Failed to fetch workflows" };
  }
}

/**
 * Get a single workflow by ID
 */
export async function getWorkflow(
  workflowId: string,
  organizationId: string
): Promise<GetWorkflowResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const w = await db.query.workflow.findFirst({
      where: and(
        eq(workflow.id, workflowId),
        eq(workflow.organizationId, organizationId)
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

    if (!w) {
      return { success: false, error: "Workflow not found" };
    }

    return { success: true, workflow: w as WorkflowWithMeta };
  } catch (error) {
    const log = createActionLogger("getWorkflow", { orgSlug: organizationId });
    log.error(
      { err: serializeError(error), workflowId },
      "Failed to get workflow"
    );
    return { success: false, error: "Failed to fetch workflow" };
  }
}

/**
 * Create a new workflow
 */
export async function createWorkflow(
  organizationId: string,
  data: {
    name: string;
    description?: string;
    awsAccountId?: string;
    topicId?: string;
  }
): Promise<CreateWorkflowResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Check if workflows feature is available for this plan
    const featureCheck = await checkFeatureAccess(organizationId, "workflows");
    if (!featureCheck.allowed) {
      return {
        success: false,
        error:
          featureCheck.message ?? "Automations require an active subscription.",
      };
    }

    // Check if organization has reached their workflow limit
    const limitCheck = await checkWorkflowLimit(organizationId);
    if (!limitCheck.allowed) {
      return {
        success: false,
        error: limitCheck.message ?? "You have reached your workflow limit.",
      };
    }

    if (!data.name?.trim()) {
      return { success: false, error: "Workflow name is required" };
    }

    // Create default trigger step
    const triggerId = crypto.randomUUID();
    const defaultSteps: WorkflowStep[] = [
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

    const [newWorkflow] = await db
      .insert(workflow)
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

    if (!newWorkflow) {
      return { success: false, error: "Failed to create workflow" };
    }

    // Revalidate
    revalidatePath("/[orgSlug]/automations", "page");

    // Track activation event
    await trackWorkflowCreated(access.userEmail, organizationId).catch(
      (err) => {
        const log = createActionLogger("createWorkflow", {
          orgSlug: organizationId,
        });
        log.error(
          { err: serializeError(err) },
          "Failed to track workflow created"
        );
      }
    );

    return await getWorkflow(newWorkflow.id, organizationId);
  } catch (error) {
    const log = createActionLogger("createWorkflow", {
      orgSlug: organizationId,
    });
    log.error({ err: serializeError(error) }, "Failed to create workflow");
    return { success: false, error: "Failed to create workflow" };
  }
}

/**
 * Update a workflow
 */
export async function updateWorkflow(
  workflowId: string,
  organizationId: string,
  data: {
    name?: string;
    description?: string;
    awsAccountId?: string | null;
    topicId?: string | null;
    triggerType?: WorkflowTriggerType;
    triggerConfig?: TriggerConfig;
    steps?: WorkflowStep[];
    transitions?: WorkflowTransition[];
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
): Promise<UpdateWorkflowResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Check if workflows feature is available for this plan
    const featureCheck = await checkFeatureAccess(organizationId, "workflows");
    if (!featureCheck.allowed) {
      return {
        success: false,
        error:
          featureCheck.message ?? "Automations require an active subscription.",
      };
    }

    // Verify workflow exists
    const existing = await db.query.workflow.findFirst({
      where: and(
        eq(workflow.id, workflowId),
        eq(workflow.organizationId, organizationId)
      ),
    });

    if (!existing) {
      return { success: false, error: "Workflow not found" };
    }

    // Validate steps/transitions if provided
    if (data.steps !== undefined || data.transitions !== undefined) {
      const steps = data.steps ?? (existing.steps as WorkflowStep[]);
      const transitions =
        data.transitions ?? (existing.transitions as WorkflowTransition[]);

      const validation = validateWorkflowDefinition(steps, transitions);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid workflow: ${validation.errors.join(", ")}`,
        };
      }
    }

    // Build update data
    const updateData: Partial<typeof workflow.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) {
      if (!data.name.trim()) {
        return { success: false, error: "Workflow name is required" };
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
        sql`${workflow.version} + 1`;
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

    // Update workflow
    await db
      .update(workflow)
      .set(updateData)
      .where(
        and(
          eq(workflow.id, workflowId),
          eq(workflow.organizationId, organizationId)
        )
      );

    // Handle schedule changes for enabled workflows
    if (existing.status === "enabled") {
      const oldTriggerType = existing.triggerType;
      const newTriggerType = data.triggerType ?? oldTriggerType;
      const oldConfig = existing.triggerConfig as TriggerConfig;
      const newConfig = data.triggerConfig ?? oldConfig;

      // TriggerType changed FROM schedule → delete old schedule
      if (oldTriggerType === "schedule" && newTriggerType !== "schedule") {
        await callWorkflowScheduleApi(workflowId, organizationId, "disable");
      }

      // TriggerType changed TO schedule → create new schedule
      if (
        oldTriggerType !== "schedule" &&
        newTriggerType === "schedule" &&
        newConfig.schedule
      ) {
        await callWorkflowScheduleApi(workflowId, organizationId, "enable", {
          cronExpression: newConfig.schedule,
          timezone: newConfig.timezone,
        });
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
        await callWorkflowScheduleApi(workflowId, organizationId, "update", {
          cronExpression: newConfig.schedule,
          timezone: newConfig.timezone,
        });
      }
    }

    // Revalidate
    revalidatePath("/[orgSlug]/automations", "page");
    revalidatePath(`/[orgSlug]/automations/${workflowId}`, "page");

    return await getWorkflow(workflowId, organizationId);
  } catch (error) {
    const log = createActionLogger("updateWorkflow", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), workflowId },
      "Failed to update workflow"
    );
    return { success: false, error: "Failed to update workflow" };
  }
}

/**
 * Delete a workflow
 */
export async function deleteWorkflow(
  workflowId: string,
  organizationId: string
): Promise<DeleteWorkflowResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Check if workflows feature is available for this plan
    const featureCheck = await checkFeatureAccess(organizationId, "workflows");
    if (!featureCheck.allowed) {
      return {
        success: false,
        error:
          featureCheck.message ?? "Automations require an active subscription.",
      };
    }

    // Verify workflow exists
    const existing = await db.query.workflow.findFirst({
      where: and(
        eq(workflow.id, workflowId),
        eq(workflow.organizationId, organizationId)
      ),
    });

    if (!existing) {
      return { success: false, error: "Workflow not found" };
    }

    // Check for active executions
    const [activeCount] = await db
      .select({ count: count() })
      .from(workflowExecution)
      .where(
        and(
          eq(workflowExecution.workflowId, workflowId),
          inArray(workflowExecution.status, [
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
        error: `Cannot delete workflow with ${activeCount?.count} active execution(s). Disable the workflow first and wait for executions to complete.`,
      };
    }

    // Clean up pending schedule before delete (best effort)
    if (existing.triggerType === "schedule") {
      await callWorkflowScheduleApi(workflowId, organizationId, "disable");
    }

    // Delete workflow (cascades to executions)
    await db
      .delete(workflow)
      .where(
        and(
          eq(workflow.id, workflowId),
          eq(workflow.organizationId, organizationId)
        )
      );

    // Revalidate
    revalidatePath("/[orgSlug]/automations", "page");

    return { success: true };
  } catch (error) {
    const log = createActionLogger("deleteWorkflow", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), workflowId },
      "Failed to delete workflow"
    );
    return { success: false, error: "Failed to delete workflow" };
  }
}

/**
 * Enable a workflow (make it active and start accepting triggers)
 */
export async function enableWorkflow(
  workflowId: string,
  organizationId: string
): Promise<EnableWorkflowResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Check if workflows feature is available for this plan
    const featureCheck = await checkFeatureAccess(organizationId, "workflows");
    if (!featureCheck.allowed) {
      return {
        success: false,
        error:
          featureCheck.message ?? "Automations require an active subscription.",
      };
    }

    // Get workflow
    const existing = await db.query.workflow.findFirst({
      where: and(
        eq(workflow.id, workflowId),
        eq(workflow.organizationId, organizationId)
      ),
    });

    if (!existing) {
      return { success: false, error: "Workflow not found" };
    }

    // Require AWS account to be configured
    if (!existing.awsAccountId) {
      return {
        success: false,
        error:
          "Please select an AWS account in workflow settings before enabling",
      };
    }

    // Validate workflow has required configuration
    const steps = existing.steps as WorkflowStep[];
    const transitions = existing.transitions as WorkflowTransition[];

    const validation = validateWorkflowDefinition(steps, transitions);
    if (!validation.valid) {
      return {
        success: false,
        error: `Cannot enable workflow: ${validation.errors.join(", ")}`,
      };
    }

    // Check trigger is configured
    const triggerStep = steps.find((s) => s.type === "trigger");
    if (!triggerStep) {
      return {
        success: false,
        error: "Workflow must have a trigger configured",
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

    // Check workflow has at least one action step
    const actionSteps = steps.filter(
      (s) => s.type !== "trigger" && s.type !== "exit"
    );
    if (actionSteps.length === 0) {
      return {
        success: false,
        error: "Workflow must have at least one action step",
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
          "Please configure a sender email in workflow settings before enabling",
      };
    }

    // If schedule trigger, create EventBridge schedule BEFORE setting status
    // to avoid a window where the workflow is "enabled" without a valid schedule
    if (existing.triggerType === "schedule" && triggerConfig.schedule) {
      const scheduleResult = await callWorkflowScheduleApi(
        workflowId,
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

    // Enable workflow (schedule already created if needed)
    await db
      .update(workflow)
      .set({
        status: "enabled",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflow.id, workflowId),
          eq(workflow.organizationId, organizationId)
        )
      );

    // Revalidate
    revalidatePath("/[orgSlug]/automations", "page");
    revalidatePath(`/[orgSlug]/automations/${workflowId}`, "page");

    return await getWorkflow(workflowId, organizationId);
  } catch (error) {
    const log = createActionLogger("enableWorkflow", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), workflowId },
      "Failed to enable workflow"
    );
    return { success: false, error: "Failed to enable workflow" };
  }
}

/**
 * Disable a workflow (stop accepting new triggers, existing executions continue)
 */
export async function disableWorkflow(
  workflowId: string,
  organizationId: string
): Promise<EnableWorkflowResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Check if workflows feature is available for this plan
    const featureCheck = await checkFeatureAccess(organizationId, "workflows");
    if (!featureCheck.allowed) {
      return {
        success: false,
        error:
          featureCheck.message ?? "Automations require an active subscription.",
      };
    }

    // Verify workflow exists
    const existing = await db.query.workflow.findFirst({
      where: and(
        eq(workflow.id, workflowId),
        eq(workflow.organizationId, organizationId)
      ),
    });

    if (!existing) {
      return { success: false, error: "Workflow not found" };
    }

    // Pause workflow and mark as edited from dashboard (for CLI conflict detection)
    await db
      .update(workflow)
      .set({
        status: "paused",
        lastEditedFrom: "dashboard",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflow.id, workflowId),
          eq(workflow.organizationId, organizationId)
        )
      );

    // If schedule trigger, delete pending EventBridge schedule (best effort)
    if (existing.triggerType === "schedule") {
      await callWorkflowScheduleApi(workflowId, organizationId, "disable");
    }

    // Revalidate
    revalidatePath("/[orgSlug]/automations", "page");
    revalidatePath(`/[orgSlug]/automations/${workflowId}`, "page");

    return await getWorkflow(workflowId, organizationId);
  } catch (error) {
    const log = createActionLogger("disableWorkflow", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), workflowId },
      "Failed to disable workflow"
    );
    return { success: false, error: "Failed to disable workflow" };
  }
}

/**
 * Duplicate a workflow
 */
export async function duplicateWorkflow(
  workflowId: string,
  organizationId: string
): Promise<DuplicateWorkflowResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Check if workflows feature is available for this plan
    const featureCheck = await checkFeatureAccess(organizationId, "workflows");
    if (!featureCheck.allowed) {
      return {
        success: false,
        error:
          featureCheck.message ?? "Automations require an active subscription.",
      };
    }

    // Check if organization has reached their workflow limit
    const limitCheck = await checkWorkflowLimit(organizationId);
    if (!limitCheck.allowed) {
      return {
        success: false,
        error: limitCheck.message ?? "You have reached your workflow limit.",
      };
    }

    // Get original workflow
    const original = await db.query.workflow.findFirst({
      where: and(
        eq(workflow.id, workflowId),
        eq(workflow.organizationId, organizationId)
      ),
    });

    if (!original) {
      return { success: false, error: "Workflow not found" };
    }

    // Generate new IDs for steps and update transitions
    const oldToNewIdMap = new Map<string, string>();
    const originalSteps = original.steps as WorkflowStep[];
    const originalTransitions = original.transitions as WorkflowTransition[];

    // Map old step IDs to new ones
    for (const step of originalSteps) {
      oldToNewIdMap.set(step.id, crypto.randomUUID());
    }

    // Create new steps with updated IDs
    const newSteps: WorkflowStep[] = originalSteps.map((step) => ({
      ...step,
      id: oldToNewIdMap.get(step.id)!,
    }));

    // Create new transitions with updated IDs
    const newTransitions: WorkflowTransition[] = originalTransitions.map(
      (transition) => ({
        ...transition,
        id: crypto.randomUUID(),
        fromStepId:
          oldToNewIdMap.get(transition.fromStepId) || transition.fromStepId,
        toStepId: oldToNewIdMap.get(transition.toStepId) || transition.toStepId,
      })
    );

    // Create duplicate workflow
    const [newWorkflow] = await db
      .insert(workflow)
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

    if (!newWorkflow) {
      return { success: false, error: "Failed to duplicate workflow" };
    }

    // Revalidate
    revalidatePath("/[orgSlug]/automations", "page");

    return await getWorkflow(newWorkflow.id, organizationId);
  } catch (error) {
    const log = createActionLogger("duplicateWorkflow", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), workflowId },
      "Failed to duplicate workflow"
    );
    return { success: false, error: "Failed to duplicate workflow" };
  }
}

/**
 * Get workflow execution statistics
 */
export async function getWorkflowStats(
  workflowId: string,
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

    // Verify workflow exists
    const existing = await db.query.workflow.findFirst({
      where: and(
        eq(workflow.id, workflowId),
        eq(workflow.organizationId, organizationId)
      ),
      columns: {
        totalExecutions: true,
        activeExecutions: true,
        completedExecutions: true,
        failedExecutions: true,
      },
    });

    if (!existing) {
      return { success: false, error: "Workflow not found" };
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
    const log = createActionLogger("getWorkflowStats", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), workflowId },
      "Failed to get workflow stats"
    );
    return { success: false, error: "Failed to get workflow stats" };
  }
}

/**
 * List workflow executions with pagination and optional status filter
 */
export async function listWorkflowExecutions(
  workflowId: string,
  organizationId: string,
  options: {
    page?: number;
    pageSize?: number;
    status?: WorkflowExecutionStatus;
  } = {}
): Promise<ListWorkflowExecutionsResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const { page = 1, pageSize = 50, status } = options;
    const offset = (page - 1) * pageSize;

    const conditions = [
      eq(workflowExecution.workflowId, workflowId),
      eq(workflowExecution.organizationId, organizationId),
    ];

    if (status) {
      conditions.push(eq(workflowExecution.status, status));
    }

    const [totalResult] = await db
      .select({ count: count() })
      .from(workflowExecution)
      .where(and(...conditions));

    const total = totalResult?.count ?? 0;

    const executions = await db
      .select({
        execution: workflowExecution,
        contact: {
          id: contact.id,
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
        },
      })
      .from(workflowExecution)
      .leftJoin(contact, eq(workflowExecution.contactId, contact.id))
      .where(and(...conditions))
      .orderBy(desc(workflowExecution.startedAt))
      .limit(pageSize)
      .offset(offset);

    const mapped: ExecutionWithContact[] = executions.map((row) => ({
      ...row.execution,
      contact: row.contact,
    }));

    return {
      success: true,
      executions: mapped,
      total,
      page,
      pageSize,
    };
  } catch (error) {
    const log = createActionLogger("listWorkflowExecutions", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), workflowId },
      "Failed to list workflow executions"
    );
    return { success: false, error: "Failed to list workflow executions" };
  }
}

/**
 * Get a single workflow execution with step trace and contact info
 */
export async function getWorkflowExecution(
  executionId: string,
  organizationId: string
): Promise<GetWorkflowExecutionResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const exec = await db.query.workflowExecution.findFirst({
      where: and(
        eq(workflowExecution.id, executionId),
        eq(workflowExecution.organizationId, organizationId)
      ),
      with: {
        contact: {
          columns: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        workflow: {
          columns: {
            name: true,
          },
        },
        stepExecutions: {
          orderBy: [asc(workflowStepExecution.startedAt)],
        },
      },
    });

    if (!exec) {
      return { success: false, error: "Execution not found" };
    }

    return {
      success: true,
      execution: exec as ExecutionDetail,
    };
  } catch (error) {
    const log = createActionLogger("getWorkflowExecution", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), executionId },
      "Failed to get workflow execution"
    );
    return { success: false, error: "Failed to get workflow execution" };
  }
}

export type RetryWorkflowExecutionResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Retry a failed workflow execution from the step where it failed
 */
export async function retryWorkflowExecution(
  executionId: string,
  organizationId: string
): Promise<RetryWorkflowExecutionResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      return { success: false, error: "API URL not configured" };
    }

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.session?.token) {
      return { success: false, error: "Not authenticated" };
    }

    const response = await fetch(
      `${apiUrl}/v1/workflows/executions/${executionId}/retry`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.session.token}`,
          "X-Organization-Id": organizationId,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: text };
    }

    const result = await response.json();
    if (!result.success) {
      return { success: false, error: result.error ?? "Retry failed" };
    }

    revalidatePath("/[orgSlug]/automations", "page");

    return { success: true };
  } catch (error) {
    const log = createActionLogger("retryWorkflowExecution", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), executionId },
      "Failed to retry execution"
    );
    return { success: false, error: "Failed to retry execution" };
  }
}

export type CancelWorkflowExecutionResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Cancel an active workflow execution
 */
export async function cancelWorkflowExecution(
  executionId: string,
  organizationId: string
): Promise<CancelWorkflowExecutionResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      return { success: false, error: "API URL not configured" };
    }

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.session?.token) {
      return { success: false, error: "Not authenticated" };
    }

    const response = await fetch(
      `${apiUrl}/v1/workflows/executions/${executionId}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.session.token}`,
          "X-Organization-Id": organizationId,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: text };
    }

    const result = await response.json();
    if (!result.success) {
      return { success: false, error: result.error ?? "Cancel failed" };
    }

    revalidatePath("/[orgSlug]/automations", "page");

    return { success: true };
  } catch (error) {
    const log = createActionLogger("cancelWorkflowExecution", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), executionId },
      "Failed to cancel execution"
    );
    return { success: false, error: "Failed to cancel execution" };
  }
}
