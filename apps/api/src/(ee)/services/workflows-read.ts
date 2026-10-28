/**
 * Read-only workflow queries for the public API.
 *
 * Lifted from `apps/web/src/actions/(ee)/workflows.ts` (listWorkflows,
 * getWorkflow, listWorkflowExecutions, getWorkflowExecution). The dashboard
 * action keeps its own copy: it is `"use server"` with `headers()` and
 * `revalidatePath`, and this node does not edit it. Keep the two in step when
 * either changes.
 *
 * Every query is scoped by `organizationId` (including by-id lookups). Nothing
 * here reads the request or the session; callers pass the org from `authContext`.
 */

import {
  contact,
  db,
  escapeIlike,
  messageSend,
  type WorkflowExecutionStatus,
  workflow,
  workflowExecution,
  workflowStepExecution,
} from "@wraps/db";
import { and, asc, count, desc, eq, ilike } from "drizzle-orm";

export type WorkflowListStatus = "draft" | "enabled" | "paused" | "archived";

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

export type ListWorkflowsInput = {
  page: number;
  pageSize: number;
  search?: string;
  status?: WorkflowListStatus;
};

export async function listWorkflowsForOrg(
  organizationId: string,
  input: ListWorkflowsInput
) {
  const { page, pageSize, search, status } = input;
  const where = and(
    eq(workflow.organizationId, organizationId),
    search ? ilike(workflow.name, `%${escapeIlike(search)}%`) : undefined,
    status ? eq(workflow.status, status) : undefined
  );

  // biome-ignore lint/plugin: the org predicate is the first term of `where`, built above; the plugin cannot trace it through `and(...)`.
  const [totalResult] = await db
    .select({ count: count() })
    .from(workflow)
    .where(where);

  const rows = await db.query.workflow.findMany({
    where,
    with: {
      createdByUser: {
        columns: { id: true, name: true, email: true },
      },
    },
    orderBy: [desc(workflow.updatedAt)],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  return { workflows: rows, total: totalResult?.count ?? 0 };
}

export function getWorkflowForOrg(organizationId: string, id: string) {
  return db.query.workflow.findFirst({
    where: and(
      eq(workflow.id, id),
      eq(workflow.organizationId, organizationId)
    ),
    with: {
      createdByUser: {
        columns: { id: true, name: true, email: true },
      },
    },
  });
}

/**
 * Org-scoped existence check. The action does not do this (it returns an
 * empty list for an unknown workflow id); the API returns 404 instead, so a
 * foreign or missing id is not indistinguishable from a workflow with no runs.
 */
export async function workflowExistsForOrg(
  organizationId: string,
  id: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: workflow.id })
    .from(workflow)
    .where(
      and(eq(workflow.id, id), eq(workflow.organizationId, organizationId))
    )
    .limit(1);
  return row !== undefined;
}

export type ListExecutionsInput = {
  page: number;
  pageSize: number;
  status?: WorkflowExecutionStatus;
};

export async function listExecutionsForWorkflow(
  organizationId: string,
  workflowId: string,
  input: ListExecutionsInput
) {
  const { page, pageSize, status } = input;
  const where = and(
    eq(workflowExecution.workflowId, workflowId),
    eq(workflowExecution.organizationId, organizationId),
    status ? eq(workflowExecution.status, status) : undefined
  );

  // biome-ignore lint/plugin: the org predicate is the first term of `where`, built above; the plugin cannot trace it through `and(...)`.
  const [totalResult] = await db
    .select({ count: count() })
    .from(workflowExecution)
    .where(where);

  const rows = await db
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
    .where(where)
    .orderBy(desc(workflowExecution.startedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    executions: rows.map((row) => ({ ...row.execution, contact: row.contact })),
    total: totalResult?.count ?? 0,
  };
}

/**
 * One execution with its step trace, contact, workflow name and per-step
 * engagement. Returns null when the execution is not in `organizationId`.
 */
export async function getExecutionForOrg(
  organizationId: string,
  executionId: string
) {
  const exec = await db.query.workflowExecution.findFirst({
    where: and(
      eq(workflowExecution.id, executionId),
      eq(workflowExecution.organizationId, organizationId)
    ),
    with: {
      contact: {
        columns: { id: true, email: true, firstName: true, lastName: true },
      },
      workflow: {
        columns: { name: true },
      },
      stepExecutions: {
        orderBy: [asc(workflowStepExecution.startedAt)],
      },
    },
  });

  if (!exec) {
    return null;
  }

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

  // Step execution ID -> engagement, matched via the step result's messageId.
  const sendsByMessageId = new Map(
    sends.flatMap((s) => (s.messageId ? [[s.messageId, s] as const] : []))
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

  return { ...exec, stepEngagement };
}
