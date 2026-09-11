"use server";
// baseline:allow-large-file

import * as Sentry from "@sentry/nextjs";
import { auth } from "@wraps/auth";
import {
  type CanvasViewport,
  contact,
  db,
  escapeIlike,
  messageSend,
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
import { z } from "zod";
import { trackWorkflowCreated } from "@/lib/activation-tracking";
import { createActionLogger } from "@/lib/logger";
import { checkFeatureAccess, checkWorkflowLimit } from "@/lib/plan-limits";
import { orgAction } from "../shared/org-action";

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

export type StepEngagement = {
  channel: "email" | "sms";
  status: string;
  sentAt: Date | null;
  deliveredAt: Date | null;
  openedAt: Date | null;
  clickedAt: Date | null;
  bouncedAt: Date | null;
  complainedAt: Date | null;
  optedOutAt: Date | null;
  clickedUrl: string | null;
  bounceType: string | null;
  bounceSubType: string | null;
};

export type ExecutionDetail = WorkflowExecution & {
  contact: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
  workflow: { name: string } | null;
  stepExecutions: WorkflowStepExecutionRecord[];
  stepEngagement?: Record<string, StepEngagement>;
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
  const log = createActionLogger("callWorkflowScheduleApi", {});
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    log.error("[workflow-schedule] NEXT_PUBLIC_API_URL not configured");
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
      log.error(
        { action, workflowId, status: response.status },
        "[workflow-schedule] API action failed"
      );
      return { success: false, error: text };
    }

    return { success: true };
  } catch (error) {
    Sentry.captureException(error, { extra: { action, workflowId } });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List workflows for an organization with pagination
 */
export const listWorkflows = orgAction(
  {
    name: "listWorkflows",
    resource: "workflows",
    permission: ["read"],
    orgId: (
      organizationId: string,
      _options: {
        page?: number;
        pageSize?: number;
        search?: string;
        status?: Workflow["status"];
      } = {}
    ) => organizationId,
    onError: "Failed to fetch workflows",
  },
  async (
    ctx,
    organizationId: string,
    options: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: Workflow["status"];
    } = {}
  ): Promise<ListWorkflowsResult> => {
    const { page = 1, pageSize = 50, search, status } = options;
    const offset = (page - 1) * pageSize;

    // Build where conditions
    const conditions = [eq(workflow.organizationId, organizationId)];

    if (search) {
      conditions.push(ilike(workflow.name, `%${escapeIlike(search)}%`));
    }

    if (status) {
      conditions.push(eq(workflow.status, status));
    }

    // Get total count
    // biome-ignore lint/plugin: the org predicate built above is always the first entry in `conditions` — the plugin can't trace `organizationId` through the `...conditions` spread.
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
  }
);

/**
 * Get a single workflow by ID
 */
export const getWorkflow = orgAction(
  {
    name: "getWorkflow",
    resource: "workflows",
    permission: ["read"],
    orgId: (_workflowId: string, organizationId: string) => organizationId,
    onError: "Failed to fetch workflow",
  },
  async (
    ctx,
    workflowId: string,
    organizationId: string
  ): Promise<GetWorkflowResult> => {
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
  }
);

/**
 * Create a new workflow
 */
const uuidSchema = z.string().uuid();

export const createWorkflow = orgAction(
  {
    name: "createWorkflow",
    resource: "workflows",
    permission: ["write"],
    orgId: (
      organizationId: string,
      _data: {
        name: string;
        description?: string;
        awsAccountId?: string;
        topicId?: string;
      }
    ) => organizationId,
    onError: "Failed to create workflow",
  },
  async (
    ctx,
    organizationId: string,
    data: {
      name: string;
      description?: string;
      awsAccountId?: string;
      topicId?: string;
    }
  ): Promise<CreateWorkflowResult> => {
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

    const [newWorkflow] = await ctx.audited(
      async (tx) => {
        const [created] = await tx
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
            createdBy: ctx.access.userId,
          })
          .returning();
        return [created];
      },
      ([created]) => ({
        action: "workflow.created" as const,
        resource: "workflow",
        resourceId: created?.id,
        metadata: { workflowId: created?.id, name: created?.name },
      })
    );

    if (!newWorkflow) {
      return { success: false, error: "Failed to create workflow" };
    }

    // Revalidate
    revalidatePath(`/${ctx.access.orgSlug}/automations`, "page");

    // Track activation event
    await trackWorkflowCreated(ctx.access.userEmail, organizationId, {
      workflowName: newWorkflow.name,
    }).catch((err) => {
      ctx.log.error({ err }, "Failed to track workflow created");
    });

    return await getWorkflow(newWorkflow.id, organizationId);
  }
);

/**
 * Update a workflow
 */
export const updateWorkflow = orgAction(
  {
    name: "updateWorkflow",
    resource: "workflows",
    permission: ["write"],
    orgId: (
      _workflowId: string,
      organizationId: string,
      _data: {
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
        defaultFrom?: string | null;
        defaultFromName?: string | null;
        defaultReplyTo?: string | null;
        defaultSenderId?: string | null;
      }
    ) => organizationId,
    onError: "Failed to update workflow",
  },
  async (
    ctx,
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
  ): Promise<UpdateWorkflowResult> => {
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

    // Update workflow + audit log in one transaction
    await ctx.audited(
      async (tx) => {
        await tx
          .update(workflow)
          .set(updateData)
          .where(
            and(
              eq(workflow.id, workflowId),
              eq(workflow.organizationId, organizationId)
            )
          );
        return updateData.name ?? existing.name;
      },
      (effectiveName) => ({
        action: "workflow.updated" as const,
        resource: "workflow",
        resourceId: workflowId,
        metadata: {
          workflowId,
          name: effectiveName,
        },
      })
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
    revalidatePath(`/${ctx.access.orgSlug}/automations`, "page");
    revalidatePath(`/${ctx.access.orgSlug}/automations/${workflowId}`, "page");

    return await getWorkflow(workflowId, organizationId);
  }
);

/**
 * Delete a workflow
 */
export const deleteWorkflow = orgAction(
  {
    name: "deleteWorkflow",
    resource: "workflows",
    permission: ["delete"],
    orgId: (_workflowId: string, organizationId: string) => organizationId,
    onError: "Failed to delete workflow",
  },
  async (
    ctx,
    workflowId: string,
    organizationId: string
  ): Promise<DeleteWorkflowResult> => {
    if (!uuidSchema.safeParse(workflowId).success) {
      return { success: false, error: "Invalid workflow ID" };
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
    // biome-ignore lint/plugin: workflowId already verified org-scoped by the "Verify workflow exists" fetch above.
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

    // Delete workflow (cascades to executions) + audit log in one transaction
    await ctx.audited(
      async (tx) => {
        await tx
          .delete(workflow)
          .where(
            and(
              eq(workflow.id, workflowId),
              eq(workflow.organizationId, organizationId)
            )
          );
      },
      () => ({
        action: "workflow.deleted" as const,
        resource: "workflow",
        resourceId: workflowId,
        metadata: { workflowId },
      })
    );

    // Revalidate
    revalidatePath(`/${ctx.access.orgSlug}/automations`, "page");

    return { success: true };
  }
);

/**
 * Enable a workflow (make it active and start accepting triggers)
 */
export const enableWorkflow = orgAction(
  {
    name: "enableWorkflow",
    resource: "workflows",
    permission: ["write"],
    orgId: (_workflowId: string, organizationId: string) => organizationId,
    onError: "Failed to enable workflow",
  },
  async (
    ctx,
    workflowId: string,
    organizationId: string
  ): Promise<EnableWorkflowResult> => {
    if (!uuidSchema.safeParse(workflowId).success) {
      return { success: false, error: "Invalid workflow ID" };
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

    // Enable workflow (schedule already created if needed) + audit log in one transaction
    await ctx.audited(
      async (tx) => {
        await tx
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
      },
      () => ({
        action: "workflow.enabled" as const,
        resource: "workflow",
        resourceId: workflowId,
        metadata: { workflowId },
      })
    );

    // Revalidate
    revalidatePath(`/${ctx.access.orgSlug}/automations`, "page");
    revalidatePath(`/${ctx.access.orgSlug}/automations/${workflowId}`, "page");

    return await getWorkflow(workflowId, organizationId);
  }
);

/**
 * Disable a workflow (stop accepting new triggers, existing executions continue)
 */
export const disableWorkflow = orgAction(
  {
    name: "disableWorkflow",
    resource: "workflows",
    permission: ["write"],
    orgId: (_workflowId: string, organizationId: string) => organizationId,
    onError: "Failed to disable workflow",
  },
  async (
    ctx,
    workflowId: string,
    organizationId: string
  ): Promise<EnableWorkflowResult> => {
    if (!uuidSchema.safeParse(workflowId).success) {
      return { success: false, error: "Invalid workflow ID" };
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

    // If schedule trigger, delete pending EventBridge schedule FIRST (best effort).
    // Symmetric to enableWorkflow (create schedule first, then write DB status).
    // If schedule deletion fails, log.warn and continue — the reconciler will clean up.
    // If DB write fails after deletion, the reconciler recreates the schedule (acceptable tradeoff).
    if (existing.triggerType === "schedule") {
      try {
        await callWorkflowScheduleApi(workflowId, organizationId, "disable");
      } catch (scheduleError) {
        ctx.log.warn(
          { err: scheduleError, workflowId },
          "Failed to delete EventBridge schedule (continuing with DB update)"
        );
      }
    }

    // Pause workflow + audit log in one transaction
    await ctx.audited(
      async (tx) => {
        await tx
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
      },
      () => ({
        action: "workflow.disabled" as const,
        resource: "workflow",
        resourceId: workflowId,
        metadata: { workflowId },
      })
    );

    // Revalidate
    revalidatePath(`/${ctx.access.orgSlug}/automations`, "page");
    revalidatePath(`/${ctx.access.orgSlug}/automations/${workflowId}`, "page");

    return await getWorkflow(workflowId, organizationId);
  }
);

/**
 * Duplicate a workflow
 */
export const duplicateWorkflow = orgAction(
  {
    name: "duplicateWorkflow",
    resource: "workflows",
    permission: ["write"],
    orgId: (_workflowId: string, organizationId: string) => organizationId,
    onError: "Failed to duplicate workflow",
  },
  async (
    ctx,
    workflowId: string,
    organizationId: string
  ): Promise<DuplicateWorkflowResult> => {
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

    // Create duplicate workflow + audit log in one transaction
    const [newWorkflow] = await ctx.audited(
      async (tx) => {
        const [created] = await tx
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
            createdBy: ctx.access.userId,
          })
          .returning();
        return [created];
      },
      ([created]) => ({
        action: "workflow.duplicated" as const,
        resource: "workflow",
        resourceId: created?.id,
        metadata: { workflowId: created?.id, sourceId: workflowId },
      })
    );

    if (!newWorkflow) {
      return { success: false, error: "Failed to duplicate workflow" };
    }

    // Revalidate
    revalidatePath(`/${ctx.access.orgSlug}/automations`, "page");

    return await getWorkflow(newWorkflow.id, organizationId);
  }
);

/**
 * Get workflow execution statistics
 */
export const getWorkflowStats = orgAction(
  {
    name: "getWorkflowStats",
    resource: "workflows",
    permission: ["read"],
    orgId: (_workflowId: string, organizationId: string) => organizationId,
    onError: "Failed to get workflow stats",
  },
  async (
    ctx,
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
  > => {
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
  }
);

/**
 * List workflow executions with pagination and optional status filter
 */
export const listWorkflowExecutions = orgAction(
  {
    name: "listWorkflowExecutions",
    resource: "workflows",
    permission: ["read"],
    orgId: (
      _workflowId: string,
      organizationId: string,
      _options: {
        page?: number;
        pageSize?: number;
        status?: WorkflowExecutionStatus;
      } = {}
    ) => organizationId,
    onError: "Failed to list workflow executions",
  },
  async (
    ctx,
    workflowId: string,
    organizationId: string,
    options: {
      page?: number;
      pageSize?: number;
      status?: WorkflowExecutionStatus;
    } = {}
  ): Promise<ListWorkflowExecutionsResult> => {
    const { page = 1, pageSize = 50, status } = options;
    const offset = (page - 1) * pageSize;

    const conditions = [
      eq(workflowExecution.workflowId, workflowId),
      eq(workflowExecution.organizationId, organizationId),
    ];

    if (status) {
      conditions.push(eq(workflowExecution.status, status));
    }

    // biome-ignore lint/plugin: the org predicate built above is always the second entry in `conditions` — the plugin can't trace `organizationId` through the `...conditions` spread.
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
  }
);

/**
 * Get a single workflow execution with step trace and contact info
 */
export const getWorkflowExecution = orgAction(
  {
    name: "getWorkflowExecution",
    resource: "workflows",
    permission: ["read"],
    orgId: (_executionId: string, organizationId: string) => organizationId,
    onError: "Failed to get workflow execution",
  },
  async (
    ctx,
    executionId: string,
    organizationId: string
  ): Promise<GetWorkflowExecutionResult> => {
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

    // Query engagement data from messageSend via workflowExecutionId FK
    const sends =
      exec.stepExecutions.length > 0
        ? await db
            .select({
              id: messageSend.id,
              channel: messageSend.channel,
              status: messageSend.status,
              messageId: messageSend.messageId,
              sentAt: messageSend.sentAt,
              deliveredAt: messageSend.deliveredAt,
              openedAt: messageSend.openedAt,
              clickedAt: messageSend.clickedAt,
              bouncedAt: messageSend.bouncedAt,
              complainedAt: messageSend.complainedAt,
              optedOutAt: messageSend.optedOutAt,
              clickedUrl: messageSend.clickedUrl,
              bounceType: messageSend.bounceType,
              bounceSubType: messageSend.bounceSubType,
            })
            .from(messageSend)
            .where(
              and(
                eq(messageSend.workflowExecutionId, executionId),
                eq(messageSend.organizationId, organizationId)
              )
            )
            .limit(100)
        : [];

    // Build map: step execution ID -> engagement
    // Match via messageId from step result JSON -> messageSend.messageId
    const sendsByMessageId = new Map(
      sends.filter((s) => s.messageId).map((s) => [s.messageId!, s])
    );
    const stepEngagement: Record<string, StepEngagement> = {};
    for (const step of exec.stepExecutions) {
      if (step.stepType !== "send_email" && step.stepType !== "send_sms") {
        continue;
      }
      const result = step.result as Record<string, unknown> | null;
      const msgId = result?.messageId;
      if (typeof msgId !== "string" || !msgId) {
        continue;
      }
      const send = sendsByMessageId.get(msgId);
      if (!send) {
        continue;
      }
      stepEngagement[step.id] = {
        channel: send.channel as "email" | "sms",
        status: send.status,
        sentAt: send.sentAt,
        deliveredAt: send.deliveredAt,
        openedAt: send.openedAt,
        clickedAt: send.clickedAt,
        bouncedAt: send.bouncedAt,
        complainedAt: send.complainedAt,
        optedOutAt: send.optedOutAt,
        clickedUrl: send.clickedUrl,
        bounceType: send.bounceType,
        bounceSubType: send.bounceSubType,
      };
    }

    return {
      success: true,
      execution: { ...exec, stepEngagement } as ExecutionDetail,
    };
  }
);

export type RetryWorkflowExecutionResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Retry a failed workflow execution from the step where it failed
 */
export const retryWorkflowExecution = orgAction(
  {
    name: "retryWorkflowExecution",
    resource: "workflows",
    permission: ["write"],
    orgId: (_executionId: string, organizationId: string) => organizationId,
    onError: "Failed to retry execution",
  },
  async (
    ctx,
    executionId: string,
    organizationId: string
  ): Promise<RetryWorkflowExecutionResult> => {
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

    revalidatePath(`/${ctx.access.orgSlug}/automations`, "page");

    return { success: true };
  }
);

export type CancelWorkflowExecutionResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Cancel an active workflow execution
 */
export const cancelWorkflowExecution = orgAction(
  {
    name: "cancelWorkflowExecution",
    resource: "workflows",
    permission: ["write"],
    orgId: (_executionId: string, organizationId: string) => organizationId,
    onError: "Failed to cancel execution",
  },
  async (
    ctx,
    executionId: string,
    organizationId: string
  ): Promise<CancelWorkflowExecutionResult> => {
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

    revalidatePath(`/${ctx.access.orgSlug}/automations`, "page");

    return { success: true };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// NODE STATS
// ═══════════════════════════════════════════════════════════════════════════

export type WorkflowNodeStepStats = {
  stepId: string;
  stepType: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  yesBranchCount?: number;
  noBranchCount?: number;
  sentCount?: number;
  deliveredCount?: number;
  openedCount?: number;
  clickedCount?: number;
  bouncedCount?: number;
};

export type GetWorkflowNodeStatsResult =
  | { success: true; stats: Record<string, WorkflowNodeStepStats> }
  | { success: false; error: string };

/**
 * Get per-node execution stats for a workflow (aggregated by stepId)
 */
export const getWorkflowNodeStats = orgAction(
  {
    name: "getWorkflowNodeStats",
    resource: "workflows",
    permission: ["read"],
    orgId: (_workflowId: string, organizationId: string) => organizationId,
    onError: "Failed to get node stats",
  },
  async (
    ctx,
    workflowId: string,
    organizationId: string
  ): Promise<GetWorkflowNodeStatsResult> => {
    // Verify workflow ownership (prevents cross-org IDOR)
    const existing = await db.query.workflow.findFirst({
      where: and(
        eq(workflow.id, workflowId),
        eq(workflow.organizationId, organizationId)
      ),
      columns: { id: true },
    });

    if (!existing) {
      return { success: false, error: "Workflow not found" };
    }

    // Aggregate step executions by stepId
    const stepStats = await db
      .select({
        stepId: workflowStepExecution.stepId,
        stepType: workflowStepExecution.stepType,
        totalCount: count(),
        completedCount: count(
          sql`CASE WHEN ${workflowStepExecution.status} = 'completed' THEN 1 END`
        ),
        failedCount: count(
          sql`CASE WHEN ${workflowStepExecution.status} = 'failed' THEN 1 END`
        ),
        skippedCount: count(
          sql`CASE WHEN ${workflowStepExecution.status} = 'skipped' THEN 1 END`
        ),
        yesBranchCount: count(
          sql`CASE WHEN ${workflowStepExecution.branch} = 'yes' THEN 1 END`
        ),
        noBranchCount: count(
          sql`CASE WHEN ${workflowStepExecution.branch} = 'no' THEN 1 END`
        ),
      })
      .from(workflowStepExecution)
      .innerJoin(
        workflowExecution,
        eq(workflowStepExecution.executionId, workflowExecution.id)
      )
      .where(
        and(
          eq(workflowExecution.workflowId, workflowId),
          eq(workflowExecution.organizationId, organizationId)
        )
      )
      .groupBy(workflowStepExecution.stepId, workflowStepExecution.stepType);

    // Build engagement map for send steps
    const sendStepIds = stepStats
      .filter((s) => s.stepType === "send_email" || s.stepType === "send_sms")
      .map((s) => s.stepId);

    const engagementMap: Record<
      string,
      {
        sent: number;
        delivered: number;
        opened: number;
        clicked: number;
        bounced: number;
      }
    > = {};

    if (sendStepIds.length > 0) {
      const messageRows = await db
        .select({
          stepId: workflowStepExecution.stepId,
          messageId: sql<string>`${workflowStepExecution.result}->>'messageId'`,
        })
        .from(workflowStepExecution)
        .innerJoin(
          workflowExecution,
          eq(workflowStepExecution.executionId, workflowExecution.id)
        )
        .where(
          and(
            eq(workflowExecution.workflowId, workflowId),
            eq(workflowExecution.organizationId, organizationId),
            inArray(workflowStepExecution.stepId, sendStepIds),
            sql`${workflowStepExecution.result}->>'messageId' IS NOT NULL`
          )
        );

      const messageIdsByStep = new Map<string, string[]>();
      for (const row of messageRows) {
        if (!row.messageId) {
          continue;
        }
        const existing = messageIdsByStep.get(row.stepId) ?? [];
        existing.push(row.messageId);
        messageIdsByStep.set(row.stepId, existing);
      }

      const allMessageIds = messageRows
        .map((r) => r.messageId)
        .filter(Boolean) as string[];

      if (allMessageIds.length > 0) {
        const sends = await db
          .select({
            messageId: messageSend.messageId,
            sentAt: messageSend.sentAt,
            deliveredAt: messageSend.deliveredAt,
            openedAt: messageSend.openedAt,
            clickedAt: messageSend.clickedAt,
            bouncedAt: messageSend.bouncedAt,
          })
          .from(messageSend)
          .where(
            and(
              inArray(messageSend.messageId, allMessageIds),
              eq(messageSend.organizationId, organizationId)
            )
          );

        const sendLookup = new Map(sends.map((s) => [s.messageId!, s]));

        for (const [stepId, msgIds] of messageIdsByStep) {
          const stats = {
            sent: 0,
            delivered: 0,
            opened: 0,
            clicked: 0,
            bounced: 0,
          };
          for (const msgId of msgIds) {
            const send = sendLookup.get(msgId);
            if (!send) {
              continue;
            }
            if (send.sentAt) {
              stats.sent++;
            }
            if (send.deliveredAt) {
              stats.delivered++;
            }
            if (send.openedAt) {
              stats.opened++;
            }
            if (send.clickedAt) {
              stats.clicked++;
            }
            if (send.bouncedAt) {
              stats.bounced++;
            }
          }
          engagementMap[stepId] = stats;
        }
      }
    }

    // Build response map
    const statsMap: Record<string, WorkflowNodeStepStats> = {};
    for (const row of stepStats) {
      const engagement = engagementMap[row.stepId];
      statsMap[row.stepId] = {
        stepId: row.stepId,
        stepType: row.stepType,
        totalCount: row.totalCount,
        completedCount: row.completedCount,
        failedCount: row.failedCount,
        skippedCount: row.skippedCount,
        yesBranchCount: row.yesBranchCount || undefined,
        noBranchCount: row.noBranchCount || undefined,
        sentCount: engagement?.sent,
        deliveredCount: engagement?.delivered,
        openedCount: engagement?.opened,
        clickedCount: engagement?.clicked,
        bouncedCount: engagement?.bounced,
      };
    }

    return { success: true, stats: statsMap };
  }
);
