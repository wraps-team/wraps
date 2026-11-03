/**
 * Templates Sync Routes
 *
 * CLI-to-platform template synchronization for "templates as code".
 *
 * POST /v1/templates/push       - Upsert a single template from CLI
 * POST /v1/templates/push/batch - Push multiple templates atomically
 * GET  /v1/templates/pull       - List all code-pushed templates with source
 */

import { and, db, desc, encodeCursor, eq, or, template } from "@wraps/db";
import { lt } from "drizzle-orm";
import { t } from "elysia";
import { trackFirstResourceCreated } from "../lib/activation-tracking";
import { parseCursorParam } from "../lib/cursor";
import { requirePermission } from "../lib/require-permission";
import type { AuthContext } from "../middleware/auth";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";

const errorResponse = t.Object({ error: t.String() });

const pushedTemplateStatus = t.Literal("PUBLISHED", {
  description: "Every template a push writes is published",
});

/** 200 body of `POST /push`, also declared as the 201 a first push answers. */
const pushResponse = t.Object(
  {
    id: t.String({ description: "Template id" }),
    slug: t.String({ description: "Template slug" }),
    status: pushedTemplateStatus,
    updatedAt: t.String({
      description: "ISO 8601 time the template was written",
    }),
    remoteHash: t.String({
      description: "The sourceHash that was pushed, echoed back",
    }),
  },
  { description: "Template written" }
);

/** 200 body of `POST /push/batch`: one result per pushed template, in request order. */
const pushBatchResponse = t.Object(
  {
    results: t.Array(
      t.Object({
        slug: t.String({ description: "Template slug" }),
        id: t.String({ description: "Template id" }),
        status: pushedTemplateStatus,
      }),
      {
        description: "One entry per pushed template (empty for an empty batch)",
      }
    ),
  },
  { description: "Every template in the batch written" }
);

/** One code-pushed template as `GET /pull` returns it. */
const pullTemplateRow = t.Object({
  id: t.String({ description: "Template id" }),
  slug: t.Union([t.String(), t.Null()], {
    description: "Template slug (filename without extension)",
  }),
  subject: t.Union([t.String(), t.Null()], {
    description: "Email subject line",
  }),
  emailType: t.Union([t.Literal("marketing"), t.Literal("transactional")], {
    description: "Email type for compliance",
  }),
  channel: t.String({ description: "Template channel: email or sms" }),
  variables: t.Union([t.Array(t.Unknown()), t.Null()], {
    description:
      "Template variables, each { name: string, fallback?: string }. Items are not validated: the column is unconstrained jsonb.",
  }),
  sourceHash: t.Union([t.String(), t.Null()], {
    description: "SHA256 hash of the pushed source file",
  }),
  status: t.Union(
    [t.Literal("DRAFT"), t.Literal("PUBLISHED"), t.Literal("ARCHIVED")],
    { description: "Template status" }
  ),
  updatedAt: t.String({ description: "ISO 8601 time of the last write" }),
  lastEditedFrom: t.Union([t.String(), t.Null()], {
    description: "Where the template was last edited: cli, dashboard or api",
  }),
  // Last on purpose: mapRow emits `source` after the other columns, and the
  // response is rebuilt in schema key order.
  source: t.Optional(
    t.Union([t.String(), t.Null()], {
      description:
        "React Email TSX source. Absent when `source=false`. Rows with no source are filtered out, so it is never null in practice.",
    })
  ),
});

/** 200 body of `GET /pull`. */
const pullResponse = t.Object(
  {
    templates: t.Array(pullTemplateRow, {
      description: "Code-pushed templates that have source",
    }),
    nextCursor: t.Optional(
      t.Union([t.String(), t.Null()], {
        description:
          "Cursor for the next page, null on the last page. Present only when `limit` is set.",
      })
    ),
  },
  { description: "Code-pushed templates" }
);

type DbOrTx =
  | typeof db
  | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

export const templatesSyncRoutes = createAuthenticatedRoutes("/v1/templates")
  // POST /push — Upsert a single template from CLI
  .post(
    "/push",
    async (ctx) => {
      const gate = await requirePermission(ctx, "templates", ["write"]);
      if (!gate.ok) {
        return gate.body;
      }
      const authContext = getAuth(ctx);
      const { body } = ctx;

      const result = await upsertTemplateFromCli(db, authContext, body);

      if (result.conflict) {
        ctx.set.status = 409;
        return {
          error: "conflict",
          message: "Template was edited on the dashboard since last push",
          lastEditedFrom: "dashboard",
          updatedAt: result.updatedAt,
        };
      }

      if (result.created) {
        await trackFirstResourceCreated(
          authContext.organizationId,
          "template",
          "cli",
          authContext.userId,
          body.slug
        );
      }

      ctx.set.status = result.created ? 201 : 200;
      return {
        id: result.id,
        slug: result.slug,
        status: "PUBLISHED",
        updatedAt: result.updatedAt,
        remoteHash: body.sourceHash,
      };
    },
    {
      body: t.Object({
        slug: t.String({
          description: "Template slug (filename without extension)",
        }),
        source: t.String({ description: "React Email TSX source code" }),
        compiledHtml: t.String({ description: "Compiled HTML output" }),
        compiledText: t.String({ description: "Compiled plain text output" }),
        subject: t.String({ description: "Email subject line" }),
        previewText: t.Optional(
          t.String({ description: "Preview/preheader text" })
        ),
        emailType: t.Union(
          [t.Literal("marketing"), t.Literal("transactional")],
          {
            description: "Email type for compliance",
          }
        ),
        channel: t.Optional(
          t.Union([t.Literal("email"), t.Literal("sms")], {
            description: "Template channel (default: email)",
          })
        ),
        variables: t.Array(
          t.Object({
            name: t.String(),
            fallback: t.Optional(t.String()),
          }),
          { description: "Template variables" }
        ),
        sourceHash: t.String({ description: "SHA256 hash of source file" }),
        sesTemplateName: t.String({ description: "SES template name" }),
        cliProjectPath: t.Optional(
          t.String({
            description: "Path in project (e.g. templates/welcome.tsx)",
          })
        ),
        force: t.Optional(
          t.Boolean({
            description: "Force overwrite even if edited on dashboard",
          })
        ),
      }),
      detail: {
        tags: ["templates"],
        summary: "Push a template from CLI",
        description:
          "Upserts a template compiled from React Email source. Used by `wraps push`.",
      },
      response: { 200: pushResponse, 201: pushResponse, 403: errorResponse },
    }
  )

  // POST /push/batch — Push multiple templates in a transaction
  .post(
    "/push/batch",
    async (ctx) => {
      const gate = await requirePermission(ctx, "templates", ["write"]);
      if (!gate.ok) {
        return gate.body;
      }
      const authContext = getAuth(ctx);
      const { body } = ctx;

      const results = await db.transaction(async (tx) => {
        const settled = await Promise.allSettled(
          body.templates.map((tmpl) =>
            upsertTemplateFromCli(tx, authContext, tmpl)
          )
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

      // Check if any had conflicts
      const conflicts = results.filter((r) => r.conflict);
      if (conflicts.length > 0) {
        ctx.set.status = 409;
        return {
          error: "conflict",
          conflicts: conflicts.map((c) => ({
            slug: c.slug,
            message: "Template was edited on the dashboard since last push",
            updatedAt: c.updatedAt,
          })),
          results: results
            .filter((r) => !r.conflict)
            .map((r) => ({
              slug: r.slug,
              id: r.id,
              status: "PUBLISHED" as const,
            })),
        };
      }

      const createdTemplate = results.find((r) => r.created);
      if (createdTemplate) {
        await trackFirstResourceCreated(
          authContext.organizationId,
          "template",
          "cli",
          authContext.userId,
          createdTemplate.slug
        );
      }

      return {
        results: results.map((r) => ({
          slug: r.slug,
          id: r.id,
          status: "PUBLISHED" as const,
        })),
      };
    },
    {
      body: t.Object({
        templates: t.Array(
          t.Object({
            slug: t.String(),
            source: t.String(),
            compiledHtml: t.String(),
            compiledText: t.String(),
            subject: t.String(),
            previewText: t.Optional(t.String()),
            emailType: t.Union([
              t.Literal("marketing"),
              t.Literal("transactional"),
            ]),
            channel: t.Optional(
              t.Union([t.Literal("email"), t.Literal("sms")])
            ),
            variables: t.Array(
              t.Object({
                name: t.String(),
                fallback: t.Optional(t.String()),
              })
            ),
            sourceHash: t.String(),
            sesTemplateName: t.String(),
            cliProjectPath: t.Optional(t.String()),
            force: t.Optional(t.Boolean()),
          })
        ),
      }),
      detail: {
        tags: ["templates"],
        summary: "Push multiple templates from CLI",
        description: "Batch upsert templates compiled from React Email source.",
      },
      response: { 200: pushBatchResponse, 403: errorResponse },
    }
  )

  // GET /pull — List all code-pushed templates with source
  .get(
    "/pull",
    async (ctx) => {
      const authContext = getAuth(ctx);
      const { limit, cursor, source } = ctx.query;
      const includeSource = source ?? true;
      // Validate before branching: a bad cursor is a 400 with or without `limit`.
      const decoded = parseCursorParam(cursor, ctx.set);

      type PullRow = {
        id: string;
        slug: string | null;
        source: string | null;
        subject: string | null;
        emailType: "marketing" | "transactional";
        channel: string;
        variables: Record<string, unknown>[] | null;
        sourceHash: string | null;
        status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
        updatedAt: Date;
        lastEditedFrom: string | null;
      };
      const mapRow = (row: PullRow) => {
        const { source: rowSource, ...rest } = row;
        return {
          ...rest,
          ...(includeSource ? { source: rowSource } : {}),
          updatedAt: row.updatedAt.toISOString(),
        };
      };

      if (limit === undefined) {
        // Unpaginated path — the CLI's only consumer. Same select, same
        // where, no orderBy, no limit: byte-for-byte today's query, so a
        // template-heavy org's `wraps push` still sees every slug.
        const templates = await db
          .select({
            id: template.id,
            slug: template.slug,
            source: template.source,
            subject: template.subject,
            emailType: template.emailType,
            channel: template.channel,
            variables: template.variables,
            sourceHash: template.sourceHash,
            status: template.status,
            updatedAt: template.updatedAt,
            lastEditedFrom: template.lastEditedFrom,
          })
          .from(template)
          .where(
            and(
              eq(template.organizationId, authContext.organizationId),
              eq(template.sourceFormat, "react-email")
            )
          );

        return {
          templates: templates
            .filter((row) => row.source != null)
            .map((row) => mapRow(row)),
        };
      }

      // Paginated path — opt-in only, for a template-heavy org that wants
      // bounded reads instead of one multi-MB response.
      const conditions = [
        eq(template.organizationId, authContext.organizationId),
        eq(template.sourceFormat, "react-email"),
      ];
      if (decoded) {
        const keyset = or(
          lt(template.updatedAt, decoded.createdAt),
          and(
            eq(template.updatedAt, decoded.createdAt),
            lt(template.id, decoded.id)
          )
        );
        if (keyset) {
          conditions.push(keyset);
        }
      }

      // biome-ignore lint/plugin: conditions' first entry is always the org predicate built above — the org-scope plugin can't trace it through the spread.
      const rawRows = await db
        .select({
          id: template.id,
          slug: template.slug,
          source: template.source,
          subject: template.subject,
          emailType: template.emailType,
          channel: template.channel,
          variables: template.variables,
          sourceHash: template.sourceHash,
          status: template.status,
          updatedAt: template.updatedAt,
          lastEditedFrom: template.lastEditedFrom,
        })
        .from(template)
        .where(and(...conditions))
        .orderBy(desc(template.updatedAt), desc(template.id))
        .limit(limit + 1);

      const hasNextPage = rawRows.length > limit;
      const page = hasNextPage ? rawRows.slice(0, limit) : rawRows;
      const lastRow = page.at(-1);
      const nextCursor =
        hasNextPage && lastRow
          ? encodeCursor(lastRow.updatedAt, lastRow.id)
          : null;

      return {
        templates: page
          .filter((row) => row.source != null)
          .map((row) => mapRow(row)),
        nextCursor,
      };
    },
    {
      query: t.Object({
        limit: t.Optional(
          t.Number({
            minimum: 1,
            maximum: 200,
            description:
              "Page size. Omit for the legacy unpaginated behaviour the CLI relies on — every template in one response, no nextCursor.",
          })
        ),
        cursor: t.Optional(
          t.String({
            description: "Opaque cursor from a previous page's nextCursor",
          })
        ),
        source: t.Optional(
          t.Boolean({
            default: true,
            description:
              "Set to false to omit the TSX source from every row (sourceHash still lets a caller diff).",
          })
        ),
      }),
      detail: {
        tags: ["templates"],
        summary: "Pull templates for CLI sync",
        description:
          "Returns code-pushed templates with their React Email source. With no `limit`, returns every template in one response (the CLI's push/pull protocol depends on this). Pass `limit` to opt into cursor pagination — the response then includes `nextCursor` (null on the last page). `source=false` omits the `source` field from every row.",
      },
      response: { 200: pullResponse },
    }
  );

// ── Helpers ──

export type PushBody = {
  slug: string;
  source: string;
  compiledHtml: string;
  compiledText: string;
  subject: string;
  previewText?: string;
  emailType: "marketing" | "transactional";
  channel?: "email" | "sms";
  variables: Array<{ name: string; fallback?: string }>;
  sourceHash: string;
  sesTemplateName: string;
  cliProjectPath?: string;
  force?: boolean;
};

type UpsertResult = {
  id: string;
  slug: string;
  updatedAt: string;
  created: boolean;
  conflict?: boolean;
};

export async function upsertTemplateFromCli(
  tx: DbOrTx,
  authContext: AuthContext,
  body: PushBody
): Promise<UpsertResult> {
  const now = new Date();

  // Check for existing template by (organizationId, slug)
  const [existing] = await tx
    .select({
      id: template.id,
      lastEditedFrom: template.lastEditedFrom,
      updatedAt: template.updatedAt,
    })
    .from(template)
    .where(
      and(
        eq(template.organizationId, authContext.organizationId),
        eq(template.slug, body.slug)
      )
    )
    .limit(1);

  if (existing) {
    // Conflict check: if last edited from dashboard and not forcing, reject
    if (
      (existing.lastEditedFrom === "dashboard" ||
        existing.lastEditedFrom === "api") &&
      !body.force
    ) {
      return {
        id: existing.id,
        slug: body.slug,
        updatedAt: existing.updatedAt.toISOString(),
        created: false,
        conflict: true,
      };
    }

    // Update existing template
    await tx
      .update(template)
      .set({
        source: body.source,
        sourceFormat: "react-email",
        sourceHash: body.sourceHash,
        subject: body.subject,
        previewText: body.previewText ?? null,
        compiledHtml: body.compiledHtml,
        compiledText: body.compiledText,
        emailType: body.emailType,
        channel: body.channel ?? "email",
        variables: body.variables as Record<string, unknown>[],
        sesTemplateName: body.sesTemplateName,
        status: "PUBLISHED",
        pushedFromCli: true,
        lastPushedAt: now,
        cliProjectPath: body.cliProjectPath,
        lastEditedBy: authContext.userId,
        lastEditedFrom: "cli",
        updatedAt: now,
      })
      .where(
        and(
          eq(template.id, existing.id),
          eq(template.organizationId, authContext.organizationId)
        )
      );

    return {
      id: existing.id,
      slug: body.slug,
      updatedAt: now.toISOString(),
      created: false,
    };
  }

  // Insert new template
  const id = crypto.randomUUID();
  await tx.insert(template).values({
    id,
    organizationId: authContext.organizationId,
    name: body.slug,
    slug: body.slug,
    source: body.source,
    sourceFormat: "react-email",
    sourceHash: body.sourceHash,
    subject: body.subject,
    previewText: body.previewText ?? null,
    compiledHtml: body.compiledHtml,
    compiledText: body.compiledText,
    emailType: body.emailType,
    channel: body.channel ?? "email",
    variables: body.variables as Record<string, unknown>[],
    sesTemplateName: body.sesTemplateName,
    content: {}, // Empty content for code-pushed templates
    status: "PUBLISHED",
    pushedFromCli: true,
    lastPushedAt: now,
    cliProjectPath: body.cliProjectPath,
    lastEditedFrom: "cli",
    createdBy: authContext.userId ?? null,
  });

  return {
    id,
    slug: body.slug,
    updatedAt: now.toISOString(),
    created: true,
  };
}
