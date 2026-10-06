/**
 * Workflows Sync Routes
 *
 * CLI-to-platform workflow synchronization for "workflows as code".
 *
 * POST /v1/workflows/push       - Upsert a single workflow from CLI
 * POST /v1/workflows/push/batch - Push multiple workflows atomically
 * GET  /v1/workflows/pull       - List all code-pushed workflows with source
 */

import {
  and,
  awsAccount,
  db,
  eq,
  organizationExtension,
  type TriggerConfig,
  template,
  type WorkflowStep,
  type WorkflowTransition,
  type WorkflowTriggerType,
  workflow,
} from "@wraps/db";
import { asc, inArray, sql } from "drizzle-orm";
import { t } from "elysia";
import { trackFirstResourceCreated } from "../../lib/activation-tracking";
import { log } from "../../lib/logger";
import type { AuthContext } from "../../middleware/auth";
import { createAuthenticatedRoutes, getAuth } from "../../middleware/auth";
import { checkWorkflowPushLimit } from "../lib/workflow-limit";
import {
  deleteWorkflowSchedule,
  updateWorkflowSchedule,
} from "../services/workflow-scheduler";

type DbOrTx =
  | typeof db
  | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

export const workflowsSyncRoutes = createAuthenticatedRoutes("/v1/workflows")
  // POST /push — Upsert a single workflow from CLI
  .post(
    "/push",
    async (ctx) => {
      const authContext = getAuth(ctx);
      const { body } = ctx;

      const limitCheck = await checkWorkflowPushLimit(db, {
        organizationId: authContext.organizationId,
        planId: authContext.planId,
        slugs: [body.slug],
      });
      if (!limitCheck.allowed) {
        ctx.set.status = 403;
        return { error: "workflow_limit", message: limitCheck.message };
      }

      // Resolve template slugs to IDs
      const resolvedSteps = await resolveTemplateReferences(
        db,
        authContext.organizationId,
        body.steps as WorkflowStep[]
      );

      const result = await upsertWorkflowFromCli(db, authContext, {
        ...body,
        steps: resolvedSteps,
        transitions: body.transitions as WorkflowTransition[],
      });

      if (result.conflict) {
        ctx.set.status = 409;
        return {
          error: "conflict",
          message: "Workflow was edited on the dashboard since last push",
          lastEditedFrom: "dashboard",
          updatedAt: result.updatedAt,
        };
      }

      const synced = await applyPushedSchedule(authContext, result);

      if (result.created) {
        await trackFirstResourceCreated(
          authContext.organizationId,
          "workflow",
          "cli",
          authContext.userId,
          body.name
        );
      }

      ctx.set.status = result.created ? 201 : 200;
      return {
        id: result.id,
        slug: result.slug,
        status: synced.status,
        updatedAt: result.updatedAt,
        remoteHash: body.sourceHash,
        ...(synced.scheduleError
          ? { scheduleError: synced.scheduleError }
          : {}),
      };
    },
    {
      body: t.Object({
        slug: t.String({
          description: "Workflow slug (filename without extension)",
        }),
        name: t.String({ description: "Workflow display name" }),
        description: t.Optional(
          t.String({ description: "Workflow description" })
        ),
        sourceTs: t.String({ description: "Original TypeScript source code" }),
        sourceHash: t.String({ description: "SHA256 hash of source file" }),
        steps: t.Array(
          t.Object({
            id: t.String(),
            type: t.String(),
            name: t.String(),
            position: t.Object({ x: t.Number(), y: t.Number() }),
            config: t.Any(),
          }),
          { description: "Flat array of workflow steps" }
        ),
        transitions: t.Array(
          t.Object({
            id: t.String(),
            fromStepId: t.String(),
            toStepId: t.String(),
            condition: t.Optional(
              t.Object({
                branch: t.String(),
              })
            ),
          }),
          { description: "Flat array of step transitions" }
        ),
        triggerType: t.String({ description: "Trigger type" }),
        triggerConfig: t.Optional(
          t.Any({ description: "Trigger configuration" })
        ),
        settings: t.Optional(
          t.Object({
            allowReentry: t.Optional(t.Boolean()),
            reentryDelaySeconds: t.Optional(t.Number()),
            maxConcurrentExecutions: t.Optional(t.Number()),
            contactCooldownSeconds: t.Optional(t.Number()),
          })
        ),
        defaults: t.Optional(
          t.Object({
            from: t.Optional(t.String()),
            fromName: t.Optional(t.String()),
            replyTo: t.Optional(t.String()),
            senderId: t.Optional(t.String()),
          })
        ),
        cliProjectPath: t.Optional(
          t.String({
            description: "Path in project (e.g. workflows/onboarding.ts)",
          })
        ),
        force: t.Optional(
          t.Boolean({
            description: "Force overwrite even if edited on dashboard",
          })
        ),
        draft: t.Optional(
          t.Boolean({
            description: "Push as draft without enabling the workflow",
          })
        ),
      }),
      detail: {
        tags: ["workflows"],
        summary: "Push a workflow from CLI",
        description:
          "Upserts a workflow parsed from TypeScript source. Used by `wraps email workflows push`.",
      },
    }
  )

  // POST /push/batch — Push multiple workflows in a transaction
  .post(
    "/push/batch",
    async (ctx) => {
      const authContext = getAuth(ctx);
      const { body } = ctx;

      const limitCheck = await checkWorkflowPushLimit(db, {
        organizationId: authContext.organizationId,
        planId: authContext.planId,
        slugs: body.workflows.map((w) => w.slug),
      });
      if (!limitCheck.allowed) {
        ctx.set.status = 403;
        return { error: "workflow_limit", message: limitCheck.message };
      }

      const written = await db.transaction(async (tx) => {
        const settled = await Promise.allSettled(
          body.workflows.map(async (wf) => {
            const resolvedSteps = await resolveTemplateReferences(
              tx,
              authContext.organizationId,
              wf.steps as WorkflowStep[]
            );
            return upsertWorkflowFromCli(tx, authContext, {
              ...wf,
              steps: resolvedSteps,
              transitions: wf.transitions as WorkflowTransition[],
            });
          })
        );

        // If any rejected with unexpected errors, throw to rollback
        const errors = settled.filter(
          (s): s is PromiseRejectedResult => s.status === "rejected"
        );
        if (errors.length > 0) {
          throw errors[0].reason;
        }

        return settled
          .filter(
            (s): s is PromiseFulfilledResult<UpsertResult> =>
              s.status === "fulfilled"
          )
          .map((s) => s.value);
      });

      // EventBridge calls happen only after the transaction has committed.
      const results = await Promise.all(
        written.map((r) => applyPushedSchedule(authContext, r))
      );

      // Check if any had conflicts
      const conflicts = results.filter((r) => r.conflict);
      if (conflicts.length > 0) {
        ctx.set.status = 409;
        return {
          error: "conflict",
          conflicts: conflicts.map((c) => ({
            slug: c.slug,
            message: "Workflow was edited on the dashboard since last push",
            updatedAt: c.updatedAt,
          })),
          results: results
            .filter((r) => !r.conflict)
            .map((r) => ({
              slug: r.slug,
              id: r.id,
              status: r.status,
              ...(r.scheduleError ? { scheduleError: r.scheduleError } : {}),
            })),
        };
      }

      const createdWorkflow = results.find((r) => r.created);
      if (createdWorkflow) {
        await trackFirstResourceCreated(
          authContext.organizationId,
          "workflow",
          "cli",
          authContext.userId,
          body.workflows.find((w) => w.slug === createdWorkflow.slug)?.name ??
            createdWorkflow.slug
        );
      }

      return {
        results: results.map((r) => ({
          slug: r.slug,
          id: r.id,
          status: r.status,
          ...(r.scheduleError ? { scheduleError: r.scheduleError } : {}),
        })),
      };
    },
    {
      body: t.Object({
        workflows: t.Array(
          t.Object({
            slug: t.String(),
            name: t.String(),
            description: t.Optional(t.String()),
            sourceTs: t.String(),
            sourceHash: t.String(),
            steps: t.Array(
              t.Object({
                id: t.String(),
                type: t.String(),
                name: t.String(),
                position: t.Object({ x: t.Number(), y: t.Number() }),
                config: t.Any(),
              })
            ),
            transitions: t.Array(
              t.Object({
                id: t.String(),
                fromStepId: t.String(),
                toStepId: t.String(),
                condition: t.Optional(
                  t.Object({
                    branch: t.String(),
                  })
                ),
              })
            ),
            triggerType: t.String(),
            triggerConfig: t.Optional(t.Any()),
            settings: t.Optional(
              t.Object({
                allowReentry: t.Optional(t.Boolean()),
                reentryDelaySeconds: t.Optional(t.Number()),
                maxConcurrentExecutions: t.Optional(t.Number()),
                contactCooldownSeconds: t.Optional(t.Number()),
              })
            ),
            defaults: t.Optional(
              t.Object({
                from: t.Optional(t.String()),
                fromName: t.Optional(t.String()),
                replyTo: t.Optional(t.String()),
                senderId: t.Optional(t.String()),
              })
            ),
            cliProjectPath: t.Optional(t.String()),
            force: t.Optional(t.Boolean()),
            draft: t.Optional(t.Boolean()),
          })
        ),
      }),
      detail: {
        tags: ["workflows"],
        summary: "Push multiple workflows from CLI",
        description: "Batch upsert workflows parsed from TypeScript source.",
      },
    }
  )

  // GET /pull — List all code-pushed workflows with source
  .get(
    "/pull",
    async (ctx) => {
      const authContext = getAuth(ctx);

      const workflows = await db
        .select({
          id: workflow.id,
          slug: workflow.slug,
          name: workflow.name,
          description: workflow.description,
          sourceTs: workflow.sourceTs,
          sourceHash: workflow.sourceHash,
          status: workflow.status,
          triggerType: workflow.triggerType,
          triggerConfig: workflow.triggerConfig,
          steps: workflow.steps,
          transitions: workflow.transitions,
          updatedAt: workflow.updatedAt,
          lastEditedFrom: workflow.lastEditedFrom,
        })
        .from(workflow)
        .where(
          and(
            eq(workflow.organizationId, authContext.organizationId),
            eq(workflow.pushedFromCli, true)
          )
        );

      return {
        workflows: workflows
          .filter((w) => w.slug != null)
          .map((w) => ({
            ...w,
            updatedAt: w.updatedAt.toISOString(),
          })),
      };
    },
    {
      detail: {
        tags: ["workflows"],
        summary: "Pull workflows for CLI sync",
        description:
          "Returns all workflows pushed from CLI with their TypeScript source.",
      },
    }
  );

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

type PushBody = {
  slug: string;
  name: string;
  description?: string;
  sourceTs: string;
  sourceHash: string;
  steps: WorkflowStep[];
  transitions: WorkflowTransition[];
  triggerType: string;
  triggerConfig?: TriggerConfig;
  settings?: {
    allowReentry?: boolean;
    reentryDelaySeconds?: number;
    maxConcurrentExecutions?: number;
    contactCooldownSeconds?: number;
  };
  defaults?: {
    from?: string;
    fromName?: string;
    replyTo?: string;
    senderId?: string;
  };
  cliProjectPath?: string;
  force?: boolean;
  draft?: boolean;
};

export type ScheduleIntent =
  | { action: "none" }
  | { action: "sync"; cronExpression: string; timezone?: string }
  | { action: "missing_cron" }
  | { action: "delete" };

export type UpsertResult = {
  id: string;
  slug: string;
  status: "draft" | "enabled" | "paused" | "archived";
  updatedAt: string;
  created: boolean;
  conflict?: boolean;
  /** What push must do to EventBridge once the write has committed. */
  schedule: ScheduleIntent;
  /** Set by the route when registering the schedule failed; the row was moved to draft. */
  scheduleError?: string;
};

/**
 * EventBridge work a push implies. A schedule-triggered workflow fires only
 * from its EventBridge schedule, so an enabled one needs a schedule (created or
 * updated), and one that stops being an enabled scheduled workflow should lose it.
 */
export function scheduleIntentFor(
  previous: { triggerType: string | null } | null,
  next: { status: string; triggerType: string; triggerConfig: TriggerConfig }
): ScheduleIntent {
  if (next.status === "enabled" && next.triggerType === "schedule") {
    return next.triggerConfig.schedule
      ? {
          action: "sync",
          cronExpression: next.triggerConfig.schedule,
          timezone: next.triggerConfig.timezone,
        }
      : { action: "missing_cron" };
  }
  if (previous?.triggerType === "schedule") {
    return { action: "delete" };
  }
  return { action: "none" };
}

/**
 * Make EventBridge match a pushed workflow. Runs after the DB write has
 * committed. If a schedule cannot be registered, the workflow is moved to draft
 * so it is never shown as enabled while nothing will fire it; a later push
 * enables it again and retries.
 */
export async function applyPushedSchedule(
  authContext: AuthContext,
  result: UpsertResult
): Promise<UpsertResult> {
  const { schedule } = result;
  if (result.conflict || schedule.action === "none") {
    return result;
  }

  if (schedule.action === "delete") {
    try {
      await deleteWorkflowSchedule(result.id);
    } catch (error) {
      // A leftover schedule fires once, sees the workflow is no longer an
      // enabled scheduled workflow, and stops (workflow-processor.ts).
      log.warn("Push: failed to delete workflow schedule", {
        workflowId: result.id,
        organizationId: authContext.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return result;
  }

  let scheduleError: string | undefined;
  if (schedule.action === "missing_cron") {
    scheduleError =
      "Schedule trigger has no cron expression (trigger.schedule).";
  } else {
    try {
      await updateWorkflowSchedule({
        workflowId: result.id,
        organizationId: authContext.organizationId,
        cronExpression: schedule.cronExpression,
        timezone: schedule.timezone,
      });
      return result;
    } catch (error) {
      log.error("Push: failed to register workflow schedule", error, {
        workflowId: result.id,
        organizationId: authContext.organizationId,
      });
      scheduleError =
        error instanceof Error ? error.message : "Failed to register schedule";
    }
  }

  await db
    .update(workflow)
    .set({ status: "draft", updatedAt: new Date() })
    .where(
      and(
        eq(workflow.id, result.id),
        eq(workflow.organizationId, authContext.organizationId)
      )
    );
  return { ...result, status: "draft", scheduleError };
}

/**
 * Resolve template slug references to UUIDs.
 *
 * In the CLI, send_email and send_sms steps use template slugs (e.g., "welcome").
 * The API needs to resolve these to actual template UUIDs.
 */
export async function resolveTemplateReferences(
  tx: DbOrTx,
  organizationId: string,
  steps: WorkflowStep[]
): Promise<WorkflowStep[]> {
  // Collect all template slugs referenced in steps
  const templateSlugs = new Set<string>();
  for (const step of steps) {
    if (step.config.type === "send_email" || step.config.type === "send_sms") {
      const config = step.config as { templateId?: string; template?: string };
      const slug = config.templateId || config.template;
      if (slug) {
        templateSlugs.add(slug);
      }
    }
  }

  if (templateSlugs.size === 0) {
    return steps;
  }

  // Fetch only the templates we need by slug
  const templates = await tx
    .select({ id: template.id, slug: template.slug })
    .from(template)
    .where(
      and(
        eq(template.organizationId, organizationId),
        inArray(template.slug, [...templateSlugs])
      )
    );

  const slugToId = new Map(
    templates.filter((t) => t.slug != null).map((t) => [t.slug!, t.id])
  );

  // Replace slugs with IDs in step configs
  return steps.map((step) => {
    if (step.config.type === "send_email" || step.config.type === "send_sms") {
      const config = step.config as { templateId?: string; template?: string };
      const slug = config.templateId || config.template;
      if (slug && slugToId.has(slug)) {
        return {
          ...step,
          config: {
            ...step.config,
            templateId: slugToId.get(slug)!,
          },
        };
      }
    }
    return step;
  });
}

/**
 * Which AWS account a newly pushed workflow sends through: the org's default
 * (only if the org owns it), else its oldest account, else none. Ordering is
 * explicit so a multi-account org never gets an arbitrary row.
 */
async function resolvePushAwsAccountId(
  tx: DbOrTx,
  organizationId: string
): Promise<string | null> {
  const [ext] = await tx
    .select({ defaultAwsAccountId: organizationExtension.defaultAwsAccountId })
    .from(organizationExtension)
    .where(eq(organizationExtension.organizationId, organizationId))
    .limit(1);

  if (ext?.defaultAwsAccountId) {
    const [owned] = await tx
      .select({ id: awsAccount.id })
      .from(awsAccount)
      .where(
        and(
          eq(awsAccount.id, ext.defaultAwsAccountId),
          eq(awsAccount.organizationId, organizationId)
        )
      )
      .limit(1);
    if (owned?.id === ext.defaultAwsAccountId) {
      return owned.id;
    }
  }

  const [oldest] = await tx
    .select({ id: awsAccount.id })
    .from(awsAccount)
    .where(eq(awsAccount.organizationId, organizationId))
    .orderBy(asc(awsAccount.createdAt), asc(awsAccount.id))
    .limit(1);
  return oldest?.id ?? null;
}

export async function upsertWorkflowFromCli(
  tx: DbOrTx,
  authContext: AuthContext,
  body: PushBody
): Promise<UpsertResult> {
  const now = new Date();

  // Check for existing workflow by (organizationId, slug)
  const [existing] = await tx
    .select({
      id: workflow.id,
      lastEditedFrom: workflow.lastEditedFrom,
      updatedAt: workflow.updatedAt,
      status: workflow.status,
      awsAccountId: workflow.awsAccountId,
      triggerType: workflow.triggerType,
      triggerConfig: workflow.triggerConfig,
    })
    .from(workflow)
    .where(
      and(
        eq(workflow.organizationId, authContext.organizationId),
        eq(workflow.slug, body.slug)
      )
    )
    .limit(1);

  if (existing) {
    // A workflow paused in the dashboard stays paused: resuming it is a
    // dashboard decision, not something a push should undo.
    let targetStatus: "draft" | "paused" | "enabled" = "enabled";
    if (body.draft) {
      targetStatus = "draft";
    } else if (existing.status === "paused") {
      targetStatus = "paused";
    }

    // Conflict check: if last edited from dashboard and not forcing, reject
    if (existing.lastEditedFrom === "dashboard" && !body.force) {
      return {
        id: existing.id,
        slug: body.slug,
        status: existing.status,
        updatedAt: existing.updatedAt.toISOString(),
        created: false,
        conflict: true,
        schedule: { action: "none" },
      };
    }

    // Update existing workflow (bump version since steps/transitions change)
    await tx
      .update(workflow)
      .set({
        name: body.name,
        description: body.description,
        sourceTs: body.sourceTs,
        sourceHash: body.sourceHash,
        steps: body.steps,
        transitions: body.transitions,
        version: sql`${workflow.version} + 1`,
        triggerType: body.triggerType as WorkflowTriggerType,
        triggerConfig: body.triggerConfig ?? {},
        awsAccountId:
          existing.awsAccountId ??
          (await resolvePushAwsAccountId(tx, authContext.organizationId)),
        allowReentry: body.settings?.allowReentry ?? false,
        reentryDelaySeconds: body.settings?.reentryDelaySeconds,
        maxConcurrentExecutions: body.settings?.maxConcurrentExecutions,
        contactCooldownSeconds: body.settings?.contactCooldownSeconds,
        defaultFrom: body.defaults?.from,
        defaultFromName: body.defaults?.fromName,
        defaultReplyTo: body.defaults?.replyTo,
        defaultSenderId: body.defaults?.senderId,
        status: targetStatus,
        pushedFromCli: true,
        lastPushedAt: now,
        cliProjectPath: body.cliProjectPath,
        lastEditedFrom: "cli",
        updatedAt: now,
      })
      .where(
        and(
          eq(workflow.id, existing.id),
          eq(workflow.organizationId, authContext.organizationId)
        )
      );

    return {
      id: existing.id,
      slug: body.slug,
      status: targetStatus,
      updatedAt: now.toISOString(),
      created: false,
      schedule: scheduleIntentFor(
        { triggerType: existing.triggerType },
        {
          status: targetStatus,
          triggerType: body.triggerType,
          triggerConfig: body.triggerConfig ?? {},
        }
      ),
    };
  }

  // Insert new workflow
  const targetStatus = body.draft ? "draft" : "enabled";
  const id = crypto.randomUUID();
  await tx.insert(workflow).values({
    id,
    organizationId: authContext.organizationId,
    awsAccountId: await resolvePushAwsAccountId(tx, authContext.organizationId),
    name: body.name,
    slug: body.slug,
    description: body.description,
    sourceTs: body.sourceTs,
    sourceHash: body.sourceHash,
    steps: body.steps,
    transitions: body.transitions,
    triggerType: body.triggerType as WorkflowTriggerType,
    triggerConfig: body.triggerConfig ?? {},
    allowReentry: body.settings?.allowReentry ?? false,
    reentryDelaySeconds: body.settings?.reentryDelaySeconds,
    maxConcurrentExecutions: body.settings?.maxConcurrentExecutions ?? 1000,
    contactCooldownSeconds: body.settings?.contactCooldownSeconds,
    defaultFrom: body.defaults?.from,
    defaultFromName: body.defaults?.fromName,
    defaultReplyTo: body.defaults?.replyTo,
    defaultSenderId: body.defaults?.senderId,
    status: targetStatus,
    pushedFromCli: true,
    lastPushedAt: now,
    cliProjectPath: body.cliProjectPath,
    lastEditedFrom: "cli",
    createdBy: authContext.userId ?? undefined,
  });

  return {
    id,
    slug: body.slug,
    status: targetStatus,
    updatedAt: now.toISOString(),
    created: true,
    schedule: scheduleIntentFor(null, {
      status: targetStatus,
      triggerType: body.triggerType,
      triggerConfig: body.triggerConfig ?? {},
    }),
  };
}
