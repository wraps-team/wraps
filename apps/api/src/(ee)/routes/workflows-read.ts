/**
 * Workflow read routes (list, get, executions, execution detail).
 *
 * GET /v1/workflows                        - List workflows (paginated)
 * GET /v1/workflows/:workflowId            - Get one workflow
 * GET /v1/workflows/:workflowId/executions - List a workflow's executions
 * GET /v1/workflows/executions/:executionId - Get one execution with its step trace
 *
 * Mount order matters: this group must be mounted AFTER `workflowsSyncRoutes`
 * (index.ts). `GET /v1/workflows/pull` is a static path in that group and must
 * win over `GET /:workflowId`. See registration.md in the T2.6a node dir.
 *
 * Lifted from apps/web/src/actions/(ee)/workflows.ts. Reads only; the
 * permission is the action's `workflows` read.
 */

import { t } from "elysia";
import { requirePermission } from "../../lib/require-permission";
import { createAuthenticatedRoutes, getAuth } from "../../middleware/auth";
import { rateLimitMiddleware } from "../../middleware/rate-limit";
import {
  getExecutionForOrg,
  getWorkflowForOrg,
  listExecutionsForWorkflow,
  listWorkflowsForOrg,
  workflowExistsForOrg,
} from "../services/workflows-read";

const errorResponse = t.Object({ error: t.String() });

const WORKFLOW_STATUSES = [
  t.Literal("draft"),
  t.Literal("enabled"),
  t.Literal("paused"),
  t.Literal("archived"),
];

const EXECUTION_STATUSES = [
  t.Literal("pending"),
  t.Literal("active"),
  t.Literal("paused"),
  t.Literal("waiting"),
  t.Literal("completed"),
  t.Literal("failed"),
  t.Literal("cancelled"),
];

const pageQuery = {
  page: t.Optional(t.Number({ default: 1, minimum: 1 })),
  pageSize: t.Optional(t.Number({ default: 50, minimum: 1, maximum: 100 })),
};

const createdByUserSchema = t.Optional(
  t.Union([
    t.Object({
      id: t.String(),
      name: t.Union([t.String(), t.Null()]),
      email: t.String(),
    }),
    t.Null(),
  ])
);

const workflowSchema = t.Object(
  {
    id: t.String(),
    organizationId: t.String(),
    name: t.String(),
    description: t.Union([t.String(), t.Null()]),
    status: t.String(),
    triggerType: t.Union([t.String(), t.Null()]),
    triggerConfig: t.Optional(t.Any()),
    steps: t.Optional(t.Any()),
    transitions: t.Optional(t.Any()),
    version: t.Number(),
    totalExecutions: t.Number(),
    activeExecutions: t.Number(),
    completedExecutions: t.Number(),
    failedExecutions: t.Number(),
    createdBy: t.Union([t.String(), t.Null()]),
    createdAt: t.String(),
    updatedAt: t.String(),
    createdByUser: createdByUserSchema,
  },
  {
    additionalProperties: true,
    description: "Workflow row. Extra columns are passed through.",
  }
);

const executionSchema = t.Object(
  {
    id: t.String(),
    workflowId: t.String(),
    contactId: t.String(),
    organizationId: t.String(),
    status: t.String(),
    currentStepId: t.Union([t.String(), t.Null()]),
    startedAt: t.Union([t.String(), t.Null()]),
    completedAt: t.Union([t.String(), t.Null()]),
    createdAt: t.String(),
    updatedAt: t.String(),
    contact: t.Union([
      t.Object({
        id: t.String(),
        email: t.Union([t.String(), t.Null()]),
        firstName: t.Union([t.String(), t.Null()]),
        lastName: t.Union([t.String(), t.Null()]),
      }),
      t.Null(),
    ]),
  },
  { additionalProperties: true }
);

const executionDetailSchema = t.Object(
  {
    ...executionSchema.properties,
    workflow: t.Union([t.Object({ name: t.String() }), t.Null()]),
    stepExecutions: t.Array(
      t.Object(
        {
          id: t.String(),
          executionId: t.String(),
          stepId: t.String(),
          stepType: t.String(),
          status: t.String(),
          createdAt: t.String(),
        },
        { additionalProperties: true }
      )
    ),
    stepEngagement: t.Optional(t.Record(t.String(), t.Any())),
  },
  { additionalProperties: true }
);

type WorkflowRecord = typeof workflowSchema.static;
type ExecutionRecord = typeof executionSchema.static;
type ExecutionDetailRecord = typeof executionDetailSchema.static;

/**
 * Convert Dates to ISO strings, recursively. Elysia validates the response
 * before serialising it, so a raw Date checked against `t.String` would fail.
 */
function toJsonSafe(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(toJsonSafe);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, toJsonSafe(v)])
    );
  }
  return value;
}

export const workflowsReadRoutes = createAuthenticatedRoutes("/v1/workflows")
  .use(rateLimitMiddleware)

  /**
   * List workflows
   *
   * GET /v1/workflows
   */
  .get(
    "/",
    async (ctx) => {
      const gate = await requirePermission(ctx, "workflows", ["read"]);
      if (!gate.ok) {
        return gate.body;
      }
      const authContext = getAuth(ctx);
      const { page = 1, pageSize = 50, search, status } = ctx.query;

      const { workflows, total } = await listWorkflowsForOrg(
        authContext.organizationId,
        { page, pageSize, search, status }
      );

      return toJsonSafe({ workflows, total, page, pageSize }) as {
        workflows: WorkflowRecord[];
        total: number;
        page: number;
        pageSize: number;
      };
    },
    {
      query: t.Object({
        ...pageQuery,
        search: t.Optional(t.String({ maxLength: 255 })),
        status: t.Optional(t.Union(WORKFLOW_STATUSES)),
      }),
      response: {
        200: t.Object({
          workflows: t.Array(workflowSchema),
          total: t.Number(),
          page: t.Number(),
          pageSize: t.Number(),
        }),
        403: errorResponse,
      },
      detail: {
        tags: ["workflows"],
        summary: "List workflows",
        description:
          "Paginated workflows for the org, newest first. Optional `search` matches the name (case-insensitive) and `status` filters by status. Requires the `workflows` read permission.",
      },
    }
  )

  /**
   * Get one workflow
   *
   * GET /v1/workflows/:workflowId
   */
  .get(
    "/:workflowId",
    async (ctx) => {
      const gate = await requirePermission(ctx, "workflows", ["read"]);
      if (!gate.ok) {
        return gate.body;
      }
      const { params, set } = ctx;
      const authContext = getAuth(ctx);

      const row = await getWorkflowForOrg(
        authContext.organizationId,
        params.workflowId
      );
      if (!row) {
        set.status = 404;
        return { error: "Workflow not found" };
      }
      return toJsonSafe(row) as WorkflowRecord;
    },
    {
      params: t.Object({ workflowId: t.String({ maxLength: 64 }) }),
      response: {
        200: workflowSchema,
        403: errorResponse,
        404: errorResponse,
      },
      detail: {
        tags: ["workflows"],
        summary: "Get a workflow",
        description:
          "One workflow by id, scoped to the org. 404 if it does not exist or belongs to another org. Requires the `workflows` read permission.",
      },
    }
  )

  /**
   * List a workflow's executions
   *
   * GET /v1/workflows/:workflowId/executions
   */
  .get(
    "/:workflowId/executions",
    async (ctx) => {
      const gate = await requirePermission(ctx, "workflows", ["read"]);
      if (!gate.ok) {
        return gate.body;
      }
      const { params, query, set } = ctx;
      const authContext = getAuth(ctx);
      const { page = 1, pageSize = 50, status } = query;

      if (
        !(await workflowExistsForOrg(
          authContext.organizationId,
          params.workflowId
        ))
      ) {
        set.status = 404;
        return { error: "Workflow not found" };
      }

      const { executions, total } = await listExecutionsForWorkflow(
        authContext.organizationId,
        params.workflowId,
        { page, pageSize, status }
      );

      return toJsonSafe({ executions, total, page, pageSize }) as {
        executions: ExecutionRecord[];
        total: number;
        page: number;
        pageSize: number;
      };
    },
    {
      params: t.Object({ workflowId: t.String({ maxLength: 64 }) }),
      query: t.Object({
        ...pageQuery,
        status: t.Optional(t.Union(EXECUTION_STATUSES)),
      }),
      response: {
        200: t.Object({
          executions: t.Array(executionSchema),
          total: t.Number(),
          page: t.Number(),
          pageSize: t.Number(),
        }),
        403: errorResponse,
        404: errorResponse,
      },
      detail: {
        tags: ["workflows"],
        summary: "List workflow executions",
        description:
          "Paginated executions of one workflow, newest first, each with its contact. 404 if the workflow is not in the org. Requires the `workflows` read permission.",
      },
    }
  )

  /**
   * Get one execution with its step trace
   *
   * GET /v1/workflows/executions/:executionId
   */
  .get(
    "/executions/:executionId",
    async (ctx) => {
      const gate = await requirePermission(ctx, "workflows", ["read"]);
      if (!gate.ok) {
        return gate.body;
      }
      const { params, set } = ctx;
      const authContext = getAuth(ctx);

      const exec = await getExecutionForOrg(
        authContext.organizationId,
        params.executionId
      );
      if (!exec) {
        set.status = 404;
        return { error: "Execution not found" };
      }
      return toJsonSafe(exec) as ExecutionDetailRecord;
    },
    {
      params: t.Object({ executionId: t.String({ maxLength: 64 }) }),
      response: {
        200: executionDetailSchema,
        403: errorResponse,
        404: errorResponse,
      },
      detail: {
        tags: ["workflows"],
        summary: "Get a workflow execution",
        description:
          "One execution with its step trace, contact, workflow name and per-step engagement. 404 if it does not exist or belongs to another org. Requires the `workflows` read permission.",
      },
    }
  );
