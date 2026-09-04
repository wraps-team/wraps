/**
 * Templates Routes
 *
 * CRUD, publish, and duplicate for email/SMS templates over the public API.
 *
 * GET    /v1/templates              - List templates (paginated)
 * GET    /v1/templates/:id          - Get one template
 * POST   /v1/templates              - Create a template
 * PATCH  /v1/templates/:id          - Partial update
 * POST   /v1/templates/:id/publish  - Publish to SES
 * POST   /v1/templates/:id/duplicate - Duplicate a template
 *
 * No DELETE — templates are referenced by messageSend.emailTemplateId and
 * batchSend.emailTemplateId (onDelete: "set null"), so a delete silently
 * detaches send history. Deliberately not in this plan.
 *
 * The API does not compile TSX. `compiledHtml`/`compiledText` must be
 * supplied by the caller (the CLI renders locally; the dashboard compiles in
 * the editor) — publish refuses a template with no `compiledHtml`, exactly
 * as the dashboard does.
 */

import { createHash } from "node:crypto";
import { toPlainText } from "@react-email/render";
import {
  and,
  awsAccount,
  db,
  decodeCursor,
  desc,
  encodeCursor,
  eq,
  escapeIlike,
  or,
  template,
  templateVersion,
} from "@wraps/db";
import {
  deleteSESTemplate,
  generateSESTemplateName,
  transformVariablesForSes,
  upsertSESTemplate,
} from "@wraps/email";
import { normalizePlainTextForSes } from "@wraps/template-render";
import { ilike, lt } from "drizzle-orm";
import { t } from "elysia";
import { trackFirstResourceCreated } from "../lib/activation-tracking";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rate-limit";
import { getCredentials } from "../services/credentials";

function sha256hex(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

async function slugTakenInOrg(
  slug: string,
  organizationId: string
): Promise<boolean> {
  const [existing] = await db
    .select({ id: template.id })
    .from(template)
    .where(
      and(eq(template.organizationId, organizationId), eq(template.slug, slug))
    )
    .limit(1);
  return existing !== undefined;
}

type CreateBody = {
  name: string;
  slug?: string;
  subject?: string;
  previewText?: string;
  description?: string;
  emailType?: "marketing" | "transactional";
  channel?: "email" | "sms";
  source?: string;
  compiledHtml?: string;
  compiledText?: string;
  variables?: Array<{ name: string; fallback?: string }>;
};

function buildCreateValues(
  id: string,
  body: CreateBody,
  organizationId: string,
  userId: string | null
) {
  const channel = body.channel ?? "email";
  return {
    id,
    organizationId,
    name: body.name,
    slug: body.slug ?? null,
    description: body.description ?? null,
    subject: body.subject ?? null,
    previewText: body.previewText ?? null,
    emailType: body.emailType ?? ("marketing" as const),
    channel,
    content: channel === "sms" ? { type: "doc", content: [] } : {},
    source: body.source ?? null,
    sourceFormat: "react-email" as const,
    sourceHash: body.source ? sha256hex(body.source) : null,
    compiledHtml: body.compiledHtml ?? null,
    compiledText: body.compiledText ?? null,
    variables: (body.variables ?? []) as Record<string, unknown>[],
    status: "DRAFT" as const,
    pushedFromCli: false,
    lastEditedFrom: "api" as const,
    lastEditedBy: userId,
    createdBy: userId,
  };
}

// ── Response shapes ──────────────────────────────────────────────────────

const LIST_ITEM = t.Object({
  id: t.String(),
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  subject: t.Union([t.String(), t.Null()]),
  previewText: t.Union([t.String(), t.Null()]),
  emailType: t.String(),
  channel: t.String(),
  status: t.String(),
  slug: t.Union([t.String(), t.Null()]),
  publishedAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

const DETAIL_ITEM = t.Object({
  id: t.String(),
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  subject: t.Union([t.String(), t.Null()]),
  previewText: t.Union([t.String(), t.Null()]),
  emailType: t.String(),
  channel: t.String(),
  status: t.String(),
  slug: t.Union([t.String(), t.Null()]),
  publishedAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
  sourceHash: t.Union([t.String(), t.Null()]),
  variables: t.Array(t.Unknown()),
  lastEditedFrom: t.Union([t.String(), t.Null()]),
  source: t.Optional(t.Union([t.String(), t.Null()])),
  compiledHtml: t.Optional(t.Union([t.String(), t.Null()])),
  compiledText: t.Optional(t.Union([t.String(), t.Null()])),
});

const CONFLICT_RESPONSE = t.Object({
  error: t.String(),
  message: t.String(),
});

const PATCH_CONFLICT_RESPONSE = t.Object({
  error: t.String(),
  message: t.String(),
  lastEditedFrom: t.Union([t.String(), t.Null()]),
  updatedAt: t.String(),
});

// ── Shared read path (id, org-scoped) ────────────────────────────────────

const DETAIL_COLUMNS = {
  id: template.id,
  name: template.name,
  description: template.description,
  subject: template.subject,
  previewText: template.previewText,
  emailType: template.emailType,
  channel: template.channel,
  status: template.status,
  slug: template.slug,
  publishedAt: template.publishedAt,
  createdAt: template.createdAt,
  updatedAt: template.updatedAt,
  source: template.source,
  sourceHash: template.sourceHash,
  variables: template.variables,
  compiledHtml: template.compiledHtml,
  compiledText: template.compiledText,
  lastEditedFrom: template.lastEditedFrom,
  sesTemplateName: template.sesTemplateName,
  content: template.content,
} as const;

type PatchBody = {
  name?: string;
  subject?: string;
  previewText?: string;
  description?: string;
  emailType?: "marketing" | "transactional";
  channel?: "email" | "sms";
  source?: string;
  compiledHtml?: string;
  compiledText?: string;
  variables?: Array<{ name: string; fallback?: string }>;
  ifUnmodifiedSince?: string;
};

const PATCH_OPTIONAL_FIELDS = [
  "name",
  "description",
  "subject",
  "previewText",
  "emailType",
  "channel",
  "compiledHtml",
  "compiledText",
  "variables",
] as const;

function buildPatchUpdates(
  body: PatchBody,
  userId: string | null
): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    lastEditedFrom: "api",
    lastEditedBy: userId,
    updatedAt: new Date(),
  };
  for (const field of PATCH_OPTIONAL_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }
  if (body.source !== undefined) {
    updates.source = body.source;
    updates.sourceFormat = "react-email";
    updates.sourceHash = sha256hex(body.source);
  }
  return updates;
}

/** Mirrors save-source's version-write: skip when the source is unchanged
 *  from the latest recorded version. */
async function maybeWriteTemplateVersion(
  templateId: string,
  source: string,
  updated: { content: unknown; compiledHtml: string | null },
  userId: string | null
): Promise<void> {
  const latest = await db.query.templateVersion.findFirst({
    where: eq(templateVersion.templateId, templateId),
    orderBy: [desc(templateVersion.version)],
    columns: { version: true, source: true },
  });
  if (latest && latest.source === source) {
    return;
  }
  await db.insert(templateVersion).values({
    templateId,
    content: updated.content as Record<string, unknown>,
    source,
    compiledHtml: updated.compiledHtml,
    version: latest ? latest.version + 1 : 1,
    createdBy: userId,
    changeNote: null,
  });
}

type DetailRow = Awaited<ReturnType<typeof findOrgTemplate>>;

async function findOrgTemplate(id: string, organizationId: string) {
  const [row] = await db
    .select(DETAIL_COLUMNS)
    .from(template)
    .where(
      and(eq(template.id, id), eq(template.organizationId, organizationId))
    )
    .limit(1);
  return row ?? null;
}

function toDetailResponse(row: NonNullable<DetailRow>, includeSource: boolean) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    subject: row.subject,
    previewText: row.previewText,
    emailType: row.emailType,
    channel: row.channel,
    status: row.status,
    slug: row.slug,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sourceHash: row.sourceHash,
    variables: row.variables ?? [],
    lastEditedFrom: row.lastEditedFrom,
    ...(includeSource
      ? {
          source: row.source,
          compiledHtml: row.compiledHtml,
          compiledText: row.compiledText,
        }
      : {}),
  };
}

function toListItem(row: {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  previewText: string | null;
  emailType: string;
  channel: string;
  status: string;
  slug: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    subject: row.subject,
    previewText: row.previewText,
    emailType: row.emailType,
    channel: row.channel,
    status: row.status,
    slug: row.slug,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const templatesRoutes = createAuthenticatedRoutes("/v1/templates")
  .use(rateLimitMiddleware)
  .get(
    "/",
    async (ctx) => {
      const authContext = getAuth(ctx);
      const { cursor, status, channel, search } = ctx.query;
      const limit = ctx.query.limit ?? 20;

      const conditions = [
        eq(template.organizationId, authContext.organizationId),
      ];
      if (status) {
        conditions.push(eq(template.status, status));
      }
      if (channel) {
        conditions.push(eq(template.channel, channel));
      }
      if (search) {
        conditions.push(ilike(template.name, `%${escapeIlike(search)}%`));
      }
      const decoded = cursor ? decodeCursor(cursor) : null;
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
      const rows = await db
        .select({
          id: template.id,
          name: template.name,
          description: template.description,
          subject: template.subject,
          previewText: template.previewText,
          emailType: template.emailType,
          channel: template.channel,
          status: template.status,
          slug: template.slug,
          publishedAt: template.publishedAt,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
        })
        .from(template)
        .where(and(...conditions))
        .orderBy(desc(template.updatedAt), desc(template.id))
        .limit(limit + 1);

      const hasNextPage = rows.length > limit;
      const page = hasNextPage ? rows.slice(0, limit) : rows;
      const last = page.at(-1);
      const nextCursor =
        hasNextPage && last ? encodeCursor(last.updatedAt, last.id) : null;

      return { data: page.map(toListItem), nextCursor };
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number({ default: 20, minimum: 1, maximum: 100 })),
        cursor: t.Optional(t.String()),
        status: t.Optional(
          t.Union([
            t.Literal("DRAFT"),
            t.Literal("PUBLISHED"),
            t.Literal("ARCHIVED"),
          ])
        ),
        channel: t.Optional(t.Union([t.Literal("email"), t.Literal("sms")])),
        search: t.Optional(t.String({ maxLength: 200 })),
      }),
      response: {
        200: t.Object({
          data: t.Array(LIST_ITEM),
          nextCursor: t.Union([t.String(), t.Null()]),
        }),
      },
      detail: {
        tags: ["templates"],
        summary: "List templates",
        description:
          "Lists templates for the organization, paginated (cursor-based) and optionally filtered by status, channel, or a name search. Never returns source, content, compiledHtml, compiledText, createdBy, or lastEditedBy — use GET /:id for the full record.",
      },
    }
  )
  .get(
    "/:id",
    async (ctx) => {
      const authContext = getAuth(ctx);
      const { params, query, set } = ctx;

      const row = await findOrgTemplate(params.id, authContext.organizationId);
      if (!row) {
        set.status = 404;
        throw new Error("Template not found");
      }

      const includeSource = query.source ?? true;
      return toDetailResponse(row, includeSource);
    },
    {
      params: t.Object({ id: t.String({ maxLength: 36 }) }),
      query: t.Object({
        source: t.Optional(t.Boolean({ default: true })),
      }),
      response: { 200: DETAIL_ITEM },
      detail: {
        tags: ["templates"],
        summary: "Get a template",
        description:
          "Returns full template detail, org-scoped. `source=false` omits source, compiledHtml, and compiledText — sourceHash is still returned so a caller can tell whether the source changed.",
      },
    }
  )
  .post(
    "/",
    async (ctx) => {
      const authContext = getAuth(ctx);
      const { body, set } = ctx;

      if (
        body.slug &&
        (await slugTakenInOrg(body.slug, authContext.organizationId))
      ) {
        set.status = 409;
        return { error: "conflict", message: "slug already exists" };
      }

      const id = crypto.randomUUID();
      await db
        .insert(template)
        .values(
          buildCreateValues(
            id,
            body,
            authContext.organizationId,
            authContext.userId ?? null
          )
        );

      await trackFirstResourceCreated(
        authContext.organizationId,
        "template",
        "api",
        authContext.userId,
        body.name
      );

      const row = await findOrgTemplate(id, authContext.organizationId);
      set.status = 201;
      return toDetailResponse(row as NonNullable<DetailRow>, true);
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 200 }),
        slug: t.Optional(t.String({ pattern: "^[a-z0-9-]{1,100}$" })),
        subject: t.Optional(t.String()),
        previewText: t.Optional(t.String()),
        description: t.Optional(t.String()),
        emailType: t.Optional(
          t.Union([t.Literal("marketing"), t.Literal("transactional")])
        ),
        channel: t.Optional(t.Union([t.Literal("email"), t.Literal("sms")])),
        source: t.Optional(t.String({ description: "React Email TSX source" })),
        compiledHtml: t.Optional(t.String()),
        compiledText: t.Optional(t.String()),
        variables: t.Optional(
          t.Array(
            t.Object({
              name: t.String(),
              fallback: t.Optional(t.String()),
            })
          )
        ),
      }),
      response: { 201: DETAIL_ITEM, 409: CONFLICT_RESPONSE },
      detail: {
        tags: ["templates"],
        summary: "Create a template",
        description:
          "Creates a DRAFT template. The API does not compile TSX — pass compiledHtml/compiledText if you have them, or publish will refuse the template until it's compiled. Always created as react-email format.",
      },
    }
  )
  .patch(
    "/:id",
    async (ctx) => {
      const authContext = getAuth(ctx);
      const { params, body, set } = ctx;

      const existing = await findOrgTemplate(
        params.id,
        authContext.organizationId
      );
      if (!existing) {
        set.status = 404;
        throw new Error("Template not found");
      }

      if (body.ifUnmodifiedSince) {
        const ifUnmodifiedSince = new Date(body.ifUnmodifiedSince);
        if (existing.updatedAt.getTime() > ifUnmodifiedSince.getTime()) {
          set.status = 409;
          return {
            error: "conflict",
            message: "Template was modified after ifUnmodifiedSince",
            lastEditedFrom: existing.lastEditedFrom,
            updatedAt: existing.updatedAt.toISOString(),
          };
        }
      }

      const sourceProvided = body.source !== undefined;
      const updates = buildPatchUpdates(body, authContext.userId ?? null);

      const [updated] = await db
        .update(template)
        .set(updates)
        .where(
          and(
            eq(template.id, params.id),
            eq(template.organizationId, authContext.organizationId)
          )
        )
        .returning();

      if (sourceProvided && updated) {
        await maybeWriteTemplateVersion(
          params.id,
          body.source as string,
          updated,
          authContext.userId ?? null
        );
      }

      const row = await findOrgTemplate(params.id, authContext.organizationId);
      return toDetailResponse(row as NonNullable<DetailRow>, true);
    },
    {
      params: t.Object({ id: t.String({ maxLength: 36 }) }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        subject: t.Optional(t.String()),
        previewText: t.Optional(t.String()),
        description: t.Optional(t.String()),
        emailType: t.Optional(
          t.Union([t.Literal("marketing"), t.Literal("transactional")])
        ),
        channel: t.Optional(t.Union([t.Literal("email"), t.Literal("sms")])),
        source: t.Optional(t.String({ description: "React Email TSX source" })),
        compiledHtml: t.Optional(t.String()),
        compiledText: t.Optional(t.String()),
        variables: t.Optional(
          t.Array(
            t.Object({
              name: t.String(),
              fallback: t.Optional(t.String()),
            })
          )
        ),
        ifUnmodifiedSince: t.Optional(
          t.String({
            format: "date-time",
            description:
              "Optimistic-concurrency guard. When present and the stored updatedAt is later, the update is rejected with 409 instead of overwriting.",
          })
        ),
      }),
      response: { 200: DETAIL_ITEM, 409: PATCH_CONFLICT_RESPONSE },
      detail: {
        tags: ["templates"],
        summary: "Update a template",
        description:
          "Partial update, org-scoped. Last-write-wins unless ifUnmodifiedSince is sent. When source changes, a new templateVersion row is written (skipped if the source is unchanged from the latest version).",
      },
    }
  )
  .post(
    "/:id/publish",
    async (ctx) => {
      const authContext = getAuth(ctx);
      const { params, body, set } = ctx;

      // 1. Load the template, org-scoped.
      const tmpl = await findOrgTemplate(params.id, authContext.organizationId);
      if (!tmpl) {
        set.status = 404;
        throw new Error("Template not found");
      }

      // 2. Subject is required to publish.
      if (!tmpl.subject) {
        set.status = 400;
        throw new Error(
          "Template subject is required for publishing. Please set a subject line."
        );
      }

      // 3. Pick the AWS account (explicit, org-scoped, or the org's only one).
      let account: { id: string; region: string } | undefined;
      if (body?.awsAccountId) {
        const [row] = await db
          .select({ id: awsAccount.id, region: awsAccount.region })
          .from(awsAccount)
          .where(
            and(
              eq(awsAccount.id, body.awsAccountId),
              eq(awsAccount.organizationId, authContext.organizationId)
            )
          )
          .limit(1);
        if (!row) {
          set.status = 404;
          throw new Error("AWS account not found");
        }
        account = row;
      } else {
        const [row] = await db
          .select({ id: awsAccount.id, region: awsAccount.region })
          .from(awsAccount)
          .where(eq(awsAccount.organizationId, authContext.organizationId))
          .limit(1);
        if (!row) {
          set.status = 400;
          throw new Error(
            "No AWS account connected. Please connect an AWS account first."
          );
        }
        account = row;
      }

      // 4. compiledHtml is required — cheap checks before assuming the role.
      if (!tmpl.compiledHtml) {
        set.status = 400;
        throw new Error(
          "Template must be compiled before publishing. Provide compiledHtml."
        );
      }

      const credentials = await getCredentials(
        account.id,
        authContext.organizationId
      );

      // 5. Transform variables for SES compatibility.
      const rawHtml = tmpl.compiledHtml;
      const rawText = tmpl.compiledText ?? toPlainText(rawHtml);
      const sesHtml = transformVariablesForSes(rawHtml);
      // normalizePlainTextForSes: html-to-text uppercases heading content,
      // corrupting {{#if firstName}} into {{#IF FIRSTNAME}} — SES rejects the
      // text part at send time.
      const sesText = transformVariablesForSes(
        normalizePlainTextForSes(rawText, rawHtml)
      );
      const sesSubject = transformVariablesForSes(tmpl.subject);

      // 6. Generate the SES template name; clean up the old one on rename.
      const sesTemplateName = generateSESTemplateName(tmpl.id, tmpl.name);
      if (tmpl.sesTemplateName && tmpl.sesTemplateName !== sesTemplateName) {
        await deleteSESTemplate(
          credentials,
          account.region,
          tmpl.sesTemplateName
        ).catch(() => {
          // Best-effort cleanup — an orphaned old-name SES template is not
          // fatal to publishing under the new name.
        });
      }

      // 7. Create or update the SES template.
      await upsertSESTemplate(credentials, account.region, {
        templateName: sesTemplateName,
        subject: sesSubject,
        htmlPart: sesHtml,
        textPart: sesText,
      });

      // 8. Update the row. SES already succeeded — DB is the source of truth.
      const now = new Date();
      await db
        .update(template)
        .set({
          status: "PUBLISHED",
          sesTemplateName,
          publishedAt: now,
          compiledHtml: sesHtml,
          compiledText: sesText,
          updatedAt: now,
        })
        .where(
          and(
            eq(template.id, params.id),
            eq(template.organizationId, authContext.organizationId)
          )
        );

      return {
        success: true,
        sesTemplateName,
        publishedAt: now.toISOString(),
      };
    },
    {
      params: t.Object({ id: t.String({ maxLength: 36 }) }),
      body: t.Optional(
        t.Object({
          awsAccountId: t.Optional(
            t.String({ description: "AWS account row id", maxLength: 36 })
          ),
        })
      ),
      response: {
        200: t.Object({
          success: t.Boolean(),
          sesTemplateName: t.String(),
          publishedAt: t.String(),
        }),
      },
      detail: {
        tags: ["templates"],
        summary: "Publish a template to SES",
        description:
          "Creates or updates the SES email template for this template's compiledHtml/compiledText, then marks it PUBLISHED. Requires compiledHtml — the API does not compile TSX, so provide it via PATCH first if it isn't already set.",
      },
    }
  )
  .post(
    "/:id/duplicate",
    async (ctx) => {
      const authContext = getAuth(ctx);
      const { params, set } = ctx;

      const [original] = await db
        .select({
          name: template.name,
          description: template.description,
          subject: template.subject,
          emailType: template.emailType,
          channel: template.channel,
          previewText: template.previewText,
          content: template.content,
          variables: template.variables,
          testData: template.testData,
          source: template.source,
          sourceFormat: template.sourceFormat,
          compiledHtml: template.compiledHtml,
          compiledText: template.compiledText,
          aiGenerated: template.aiGenerated,
        })
        .from(template)
        .where(
          and(
            eq(template.id, params.id),
            eq(template.organizationId, authContext.organizationId)
          )
        )
        .limit(1);

      if (!original) {
        set.status = 404;
        throw new Error("Template not found");
      }

      const id = crypto.randomUUID();
      await db.insert(template).values({
        id,
        organizationId: authContext.organizationId,
        name: `${original.name} (Copy)`,
        description: original.description,
        subject: original.subject,
        emailType: original.emailType,
        channel: original.channel,
        previewText: original.previewText,
        content: original.content,
        variables: original.variables,
        testData: original.testData,
        source: original.source,
        sourceFormat: original.sourceFormat,
        compiledHtml: original.compiledHtml,
        compiledText: original.compiledText,
        aiGenerated: original.aiGenerated,
        status: "DRAFT",
        lastEditedFrom: "api",
        lastEditedBy: authContext.userId ?? null,
        createdBy: authContext.userId ?? null,
      });

      const row = await findOrgTemplate(id, authContext.organizationId);
      set.status = 201;
      return toDetailResponse(row as NonNullable<DetailRow>, true);
    },
    {
      params: t.Object({ id: t.String({ maxLength: 36 }) }),
      response: { 201: DETAIL_ITEM },
      detail: {
        tags: ["templates"],
        summary: "Duplicate a template",
        description:
          'Copies name (with " (Copy)" appended), content, and channel/previewText (the dashboard\'s duplicate route omits these two — fixed here). slug, sesTemplateName, and publishedAt are never copied; the duplicate is always a DRAFT.',
      },
    }
  );
