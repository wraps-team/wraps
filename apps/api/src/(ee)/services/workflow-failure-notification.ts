/**
 * Workflow failure notification
 *
 * Writes an in-app (better-inbox) notification to the org when a workflow
 * execution fails. Deduped to one per workflow per 24h so a broken sequence
 * does not flood the inbox. Never throws — a notification failure must not
 * fail the job. Imported by the DLQ consumer, so keep imports minimal.
 */

import { captureException } from "@sentry/aws-serverless";
import {
  db,
  hasRecentNotification,
  notifyOrg,
  organization,
  workflow,
} from "@wraps/db";
import { and, eq } from "drizzle-orm";
import { log } from "../../lib/logger";

export const WORKFLOW_FAILURE_NOTIFICATION_TYPE = "workflow.execution_failed";
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function notifyWorkflowExecutionFailed(params: {
  organizationId: string;
  workflowId: string;
  executionId: string;
  error: string;
}): Promise<boolean> {
  try {
    const already = await hasRecentNotification({
      organizationId: params.organizationId,
      type: WORKFLOW_FAILURE_NOTIFICATION_TYPE,
      since: new Date(Date.now() - DEDUPE_WINDOW_MS),
      dataEquals: { key: "workflowId", value: params.workflowId },
    });
    if (already) {
      return false;
    }

    const [wf] = await db
      .select({ name: workflow.name })
      .from(workflow)
      .where(
        and(
          eq(workflow.id, params.workflowId),
          eq(workflow.organizationId, params.organizationId)
        )
      )
      .limit(1);
    const [org] = await db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, params.organizationId))
      .limit(1);
    if (!(wf && org)) {
      return false;
    }

    await notifyOrg({
      organizationId: params.organizationId,
      roles: ["owner", "admin", "marketing"],
      type: WORKFLOW_FAILURE_NOTIFICATION_TYPE,
      title: `Workflow "${wf.name}" has failing executions`,
      body: `${params.error.slice(0, 200)} — further failures of this workflow today won't notify again.`,
      href: `/${org.slug}/automations/${params.workflowId}/executions?status=failed`,
      data: { workflowId: params.workflowId, executionId: params.executionId },
    });
    return true;
  } catch (error) {
    captureException(error, {
      tags: { worker: "workflow-failure-notification" },
      extra: {
        workflowId: params.workflowId,
        executionId: params.executionId,
      },
    });
    log.error("Failed to write workflow failure notification", error as Error, {
      workflowId: params.workflowId,
    });
    return false;
  }
}
