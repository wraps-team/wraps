import { and, eq, workflow } from "@wraps/db";
import { count, inArray } from "drizzle-orm";
import { isPlanId, type PlanId } from "../../lib/plan-ids";
import { isSelfHosted } from "./license";

// Plan limits for workflows (matches maxWorkflows in apps/web/src/lib/plans.ts;
// a parity test in baseline/architecture.test.ts keeps them identical).
const PLAN_WORKFLOW_LIMITS: Record<PlanId, number> = {
  free: 2,
  pro: -1,
  business: -1,
  starter: -1,
  growth: -1,
  scale: -1,
};

export function getMaxWorkflows(planId: string | null): number {
  if (!isPlanId(planId)) {
    return PLAN_WORKFLOW_LIMITS.free;
  }
  return PLAN_WORKFLOW_LIMITS[planId];
}

/** -1 is unlimited. Updates (newCount 0) are never refused. */
export function exceedsWorkflowLimit(params: {
  limit: number;
  current: number;
  newCount: number;
}): boolean {
  const { limit, current, newCount } = params;
  return limit !== -1 && newCount > 0 && current + newCount > limit;
}

type DbLike = Pick<typeof import("@wraps/db").db, "select">;

export type WorkflowLimitResult =
  | { allowed: true }
  | {
      allowed: false;
      limit: number;
      current: number;
      newCount: number;
      message: string;
    };

/**
 * Would pushing these slugs create more workflows than the plan allows?
 * Counts every workflow row for the org, whatever its status, exactly as the
 * dashboard's checkWorkflowLimit does. Self-hosted is unlimited.
 */
export async function checkWorkflowPushLimit(
  database: DbLike,
  params: { organizationId: string; planId: string | null; slugs: string[] }
): Promise<WorkflowLimitResult> {
  const limit = isSelfHosted() ? -1 : getMaxWorkflows(params.planId);
  if (limit === -1) {
    return { allowed: true };
  }

  const slugs = [...new Set(params.slugs)];
  const existing = slugs.length
    ? await database
        .select({ slug: workflow.slug })
        .from(workflow)
        .where(
          and(
            eq(workflow.organizationId, params.organizationId),
            inArray(workflow.slug, slugs)
          )
        )
    : [];
  const newCount = slugs.length - existing.length;

  const [row] = await database
    .select({ count: count() })
    .from(workflow)
    .where(eq(workflow.organizationId, params.organizationId));
  const current = row?.count ?? 0;

  if (!exceedsWorkflowLimit({ limit, current, newCount })) {
    return { allowed: true };
  }
  return {
    allowed: false,
    limit,
    current,
    newCount,
    message:
      `Your plan includes ${limit} workflow${limit === 1 ? "" : "s"} and this organization has ${current}. ` +
      `This push would create ${newCount} more. Upgrade at https://wraps.dev/upgrade or delete a workflow in the dashboard.`,
  };
}
