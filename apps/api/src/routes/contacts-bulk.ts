import { EMAIL_STATUSES } from "@wraps/db";
import { t } from "elysia";
import { requirePermission } from "../lib/require-permission";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";
import {
  contactsToCsv,
  exportContactsForOrg,
  importContactsForOrg,
  MAX_EXPORT_ROWS,
  MAX_IMPORT_SIZE,
  MAX_VALIDATE_ADDRESSES,
  validateEmailsForOrg,
} from "../services/contacts-bulk";

const errorResponse = t.Object({ error: t.String() });

const importRow = t.Object({
  email: t.Optional(t.String()),
  phone: t.Optional(t.String()),
  firstName: t.Optional(t.String()),
  lastName: t.Optional(t.String()),
  company: t.Optional(t.String()),
  jobTitle: t.Optional(t.String()),
  createdAt: t.Optional(
    t.String({
      description: "Any date string the row carries as its creation time",
    })
  ),
  smsStatus: t.Optional(
    t.String({
      description: "pending_consent | opted_in | opted_out | invalid",
    })
  ),
  smsConsentedAt: t.Optional(
    t.String({
      description: "Date consent was given; only used with smsStatus opted_in",
    })
  ),
  properties: t.Optional(t.Record(t.String(), t.String())),
});

const importResponse = t.Object({
  created: t.Number(),
  updated: t.Number(),
  skipped: t.Number(),
  invalid: t.Number({ description: "Number of rows listed in errors" }),
  errors: t.Array(t.Object({ row: t.Number(), error: t.String() })),
  duplicates: t.Array(
    t.Object({
      row: t.Number(),
      firstRow: t.Number(),
      field: t.Union([t.Literal("email"), t.Literal("phone")]),
      value: t.String(),
    })
  ),
});

const exportedContact = t.Object(
  {
    id: t.String(),
    email: t.Nullable(t.String()),
    phone: t.Nullable(t.String()),
    firstName: t.Nullable(t.String()),
    lastName: t.Nullable(t.String()),
    company: t.Nullable(t.String()),
    jobTitle: t.Nullable(t.String()),
    emailStatus: t.Nullable(t.String()),
    emailLastSoftBouncedAt: t.Unknown({ description: "ISO timestamp or null" }),
    emailSoftBounceCount: t.Number(),
    smsStatus: t.Nullable(t.String()),
    properties: t.Record(t.String(), t.Unknown()),
    createdAt: t.Unknown({ description: "ISO timestamp" }),
    updatedAt: t.Unknown({ description: "ISO timestamp" }),
    topics: t.Array(
      t.Object({
        topicId: t.String(),
        topicName: t.String(),
        status: t.String(),
        subscribedAt: t.Unknown(),
      })
    ),
  },
  { additionalProperties: true }
);

// Derived from EMAIL_STATUSES so a new status cannot be left out of the export
// filter (see emailStatusSchema in contacts.ts for how the list drifted before).
const emailStatusLiteral = t.Union(EMAIL_STATUSES.map((s) => t.Literal(s)));

const verdictLiteral = t.Union([
  t.Literal("LOW"),
  t.Literal("MEDIUM"),
  t.Literal("HIGH"),
  t.Literal("UNKNOWN"),
]);

export const contactsBulkRoutes = createAuthenticatedRoutes("/v1/contacts")
  // Static paths. Registered before any `/:id` sibling in the same prefix; see
  // registration.md for the mount order that the route test pins.
  .get(
    "/export",
    async (ctx) => {
      const { query, set } = ctx;
      const gate = await requirePermission(ctx, "contacts", ["export"]);
      if (!gate.ok) {
        return gate.body;
      }

      const authContext = getAuth(ctx);
      const result = await exportContactsForOrg(authContext.organizationId, {
        search: query.search || undefined,
        emailStatus: query.emailStatus,
        topicId: query.topicId || undefined,
      });

      set.headers["x-export-total"] = String(result.total);
      set.headers["x-export-truncated"] = String(result.truncated);

      if (query.format === "csv") {
        const date = new Date().toISOString().slice(0, 10);
        set.headers["content-type"] = "text/csv; charset=utf-8";
        set.headers["content-disposition"] =
          `attachment; filename="contacts-${date}.csv"`;
        return contactsToCsv(result.contacts);
      }

      return {
        contacts: result.contacts,
        total: result.total,
        truncated: result.truncated,
      };
    },
    {
      query: t.Object({
        search: t.Optional(t.String({ maxLength: 255 })),
        emailStatus: t.Optional(emailStatusLiteral),
        topicId: t.Optional(t.String({ maxLength: 36 })),
        format: t.Optional(t.Union([t.Literal("json"), t.Literal("csv")])),
      }),
      response: {
        200: t.Union([
          t.Object({
            contacts: t.Array(exportedContact),
            total: t.Number(),
            truncated: t.Boolean(),
          }),
          t.String({ description: "CSV document when format=csv" }),
        ]),
        403: errorResponse,
      },
      detail: {
        tags: ["contacts"],
        summary: "Export contacts",
        description: `Exports the org's contacts that match the filters, newest first, capped at ${MAX_EXPORT_ROWS} rows. Filters come only from the URL query (search, emailStatus, topicId), the same values the contacts list is filtered by. format=json (default) returns { contacts, total, truncated }; format=csv returns the dashboard's CSV. Response headers x-export-total and x-export-truncated report the real match count and whether the cap cut the file short. Requires contacts:export.`,
      },
    }
  )
  .post(
    "/import",
    async (ctx) => {
      const { body, set, request } = ctx;
      const gate = await requirePermission(ctx, "contacts", ["import"]);
      if (!gate.ok) {
        return gate.body;
      }

      const result = await importContactsForOrg({
        organizationId: getAuth(ctx).organizationId,
        userId: gate.userId,
        contacts: body.contacts,
        topicIds: body.topicIds,
        duplicateStrategy: body.duplicateStrategy ?? "skip",
        planId: getAuth(ctx).planId,
        sesValidation: body.sesValidation,
        ipAddress:
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
        userAgent: request.headers.get("user-agent"),
      });

      if (!result.ok) {
        set.status = result.status;
        return { error: result.error };
      }

      return {
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        invalid: result.errors.length,
        errors: result.errors,
        duplicates: result.duplicates,
      };
    },
    {
      body: t.Object({
        contacts: t.Array(importRow, {
          description: `Rows to import. At most ${MAX_IMPORT_SIZE} per request.`,
        }),
        topicIds: t.Optional(t.Array(t.String({ maxLength: 36 }))),
        duplicateStrategy: t.Optional(
          t.Union([t.Literal("skip"), t.Literal("update")], {
            description:
              "What to do with a row that matches an existing contact. Default skip.",
          })
        ),
        sesValidation: t.Optional(
          t.Object({
            awsAccountId: t.String({
              maxLength: 36,
              description:
                "An org AWS account whose SES plan is PRO or ENTERPRISE",
            }),
          })
        ),
      }),
      response: {
        200: importResponse,
        400: errorResponse,
        402: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
        429: errorResponse,
      },
      detail: {
        tags: ["contacts"],
        summary: "Import contacts",
        description: `Imports up to ${MAX_IMPORT_SIZE} contacts in one synchronous call and returns the counts (created, updated, skipped, invalid) plus per-row errors and duplicates. Rows match existing contacts by email or phone hash; duplicateStrategy decides whether a match is skipped or updated (update fills blank fields and merges properties, never overwrites consent). Optional sesValidation runs SES Email Address Insights and drops LOW-confidence addresses. Requires contacts:import. Returns 402 when the plan's contact limit is reached.`,
      },
    }
  )
  .post(
    "/validate",
    async (ctx) => {
      const { body, set } = ctx;
      const gate = await requirePermission(ctx, "contacts", ["import"]);
      if (!gate.ok) {
        return gate.body;
      }

      if (body.emails.length > MAX_VALIDATE_ADDRESSES) {
        set.status = 400;
        return {
          error: `Validation accepts at most ${MAX_VALIDATE_ADDRESSES} addresses per request. Split the list and call again.`,
        };
      }

      const result = await validateEmailsForOrg({
        organizationId: getAuth(ctx).organizationId,
        awsAccountId: body.awsAccountId,
        emails: body.emails,
      });

      if (!result.ok) {
        set.status = result.status;
        return { error: result.error };
      }

      return {
        verdicts: result.verdicts,
        validatedCount: result.validatedCount,
        stoppedEarly: result.stoppedEarly,
        invalid: result.invalid,
      };
    },
    {
      body: t.Object({
        awsAccountId: t.String({
          maxLength: 36,
          description: "An org AWS account whose SES plan is PRO or ENTERPRISE",
        }),
        emails: t.Array(t.String({ maxLength: 320 }), {
          minItems: 1,
          description: `Addresses to check, at most ${MAX_VALIDATE_ADDRESSES} per request.`,
        }),
      }),
      response: {
        200: t.Object({
          verdicts: t.Record(t.String(), verdictLiteral, {
            description:
              "SES confidence verdict per syntactically valid, de-duplicated address",
          }),
          validatedCount: t.Number(),
          stoppedEarly: t.Boolean({
            description:
              "True when SES throttled the run; verdicts cover only what was checked",
          }),
          invalid: t.Array(
            t.String({
              description: "Failed the syntax check; not sent to SES",
            })
          ),
        }),
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
      detail: {
        tags: ["contacts"],
        summary: "Validate email addresses",
        description: `Checks up to ${MAX_VALIDATE_ADDRESSES} addresses with SES Email Address Insights through an org AWS account whose SES plan is PRO or ENTERPRISE. Reads only that AWS account row (org-scoped); reads no contacts and writes nothing. Requires contacts:import, the permission the import uses for the same validation.`,
      },
    }
  );
