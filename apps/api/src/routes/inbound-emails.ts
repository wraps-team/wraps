/**
 * Inbound email read routes: the parsed emails the customer's inbound bucket
 * holds. Read-only; there are no write routes.
 *
 * GET /v1/email/inbound             - List inbound emails (paginated)
 * GET /v1/email/inbound/:emailId    - Get one inbound email
 *
 * Logic lifted from apps/web/src/lib/aws/s3-inbound.ts and the dashboard pages
 * apps/web/src/app/(dashboard)/[orgSlug]/emails/inbound/. See
 * services/inbound-s3.ts for what differs. The dashboard checks membership
 * only for these reads, so the routes check authentication and org scope and
 * no role permission.
 *
 * Every AWS account id from the client is checked against the caller's org
 * before any credential or S3 call. An account from another org is a 404, the
 * same as a missing one.
 */

import { t } from "elysia";
import { INVALID_CURSOR_MESSAGE } from "../lib/cursor";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";
import {
  decodeInboundCursor,
  findInboundEmail,
  listInboundEmailPage,
  loadInboundAccounts,
} from "../services/inbound-s3";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const errorResponse = t.Object({ error: t.String() });

const addressSchema = t.Object({
  address: t.String(),
  name: t.String(),
});

const nullableString = t.Union([t.String(), t.Null()]);

const summarySchema = t.Object({
  awsAccountId: t.String(),
  emailId: t.String(),
  from: addressSchema,
  to: t.Array(addressSchema),
  subject: t.String(),
  receivedAt: t.String(),
  hasAttachments: t.Boolean(),
  attachmentCount: t.Number(),
  spamVerdict: nullableString,
  virusVerdict: nullableString,
});

const listResponseSchema = t.Object({
  data: t.Array(summarySchema),
  nextCursor: nullableString,
  deniedAccountIds: t.Array(t.String()),
  unreachableAccountIds: t.Array(t.String()),
});

const attachmentSchema = t.Object({
  id: t.String(),
  filename: t.String(),
  contentType: t.String(),
  size: t.Number(),
  s3Key: t.String(),
  contentDisposition: nullableString,
  cid: nullableString,
});

const detailSchema = t.Object({
  awsAccountId: t.String(),
  emailId: t.String(),
  messageId: t.String(),
  from: addressSchema,
  to: t.Array(addressSchema),
  cc: t.Array(addressSchema),
  subject: t.String(),
  date: t.String(),
  html: nullableString,
  htmlTruncated: t.Boolean(),
  text: nullableString,
  headers: t.Record(t.String(), t.Any()),
  attachments: t.Array(attachmentSchema),
  spamVerdict: nullableString,
  virusVerdict: nullableString,
  rawS3Key: t.String(),
  receivedAt: t.String(),
});

export const inboundEmailsRoutes = createAuthenticatedRoutes(
  "/v1/email/inbound"
)
  .get(
    "",
    async (ctx) => {
      const { query, set } = ctx;
      const authContext = getAuth(ctx);
      const organizationId = authContext.organizationId;
      const limit = query.limit ?? DEFAULT_LIMIT;

      const lookup = await loadInboundAccounts({
        organizationId,
        awsAccountId: query.awsAccountId,
      });
      if (!lookup.ok) {
        set.status = 404;
        return { error: "AWS account not found" };
      }

      const cursor =
        query.cursor === undefined ? null : decodeInboundCursor(query.cursor);
      if (query.cursor !== undefined && cursor === null) {
        set.status = 400;
        return { error: INVALID_CURSOR_MESSAGE };
      }
      // A cursor must name an account in the list this request reads. That
      // also rejects a cursor for another org's account, and one whose
      // awsAccountId differs from the query.
      if (cursor && !lookup.accounts.some((a) => a.id === cursor.a)) {
        set.status = 400;
        return { error: INVALID_CURSOR_MESSAGE };
      }

      return listInboundEmailPage({
        organizationId,
        accounts: lookup.accounts,
        limit,
        cursor,
      });
    },
    {
      query: t.Object({
        awsAccountId: t.Optional(t.String({ maxLength: 128 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: MAX_LIMIT })),
        cursor: t.Optional(t.String({ maxLength: 8192 })),
      }),
      response: {
        200: listResponseSchema,
        400: errorResponse,
        404: errorResponse,
      },
      detail: {
        tags: ["Inbound"],
        summary: "List inbound emails",
        description:
          "Lists parsed inbound emails from the S3 inbound bucket in each connected AWS account. Emails are read live from the customer's account; nothing is stored in Wraps. Results come in S3 key order (by the email's storage key), not received time, so the newest email is not necessarily first. A page can span several accounts, and each entry carries its awsAccountId. limit defaults to 20 and is capped at 100. A page can hold fewer entries than limit, including none while nextCursor is set, because non-email objects are skipped. To get the next page, pass nextCursor back unchanged as cursor; it is null on the last page. Without awsAccountId every account with an inbound bucket is read; with it, only that account (404 if it is not in this org). Accounts that deny access are listed in deniedAccountIds and skipped; accounts that cannot be read are listed in unreachableAccountIds. Attachments are not downloadable through the API: the list carries only hasAttachments and attachmentCount. Requires authentication only.",
      },
    }
  )
  .get(
    "/:emailId",
    async (ctx) => {
      const { params, query, set } = ctx;
      const authContext = getAuth(ctx);
      const organizationId = authContext.organizationId;

      const lookup = await loadInboundAccounts({
        organizationId,
        awsAccountId: query.awsAccountId,
      });
      if (!lookup.ok) {
        set.status = 404;
        return { error: "AWS account not found" };
      }

      const email = await findInboundEmail({
        organizationId,
        accounts: lookup.accounts,
        emailId: params.emailId,
      });
      if (!email) {
        set.status = 404;
        return { error: "Inbound email not found" };
      }
      return email;
    },
    {
      params: t.Object({
        emailId: t.String({ pattern: "^[A-Za-z0-9_-]{1,64}$" }),
      }),
      query: t.Object({
        awsAccountId: t.Optional(t.String({ maxLength: 128 })),
      }),
      response: {
        200: detailSchema,
        404: errorResponse,
      },
      detail: {
        tags: ["Inbound"],
        summary: "Get an inbound email",
        description:
          "Returns one parsed inbound email by emailId, as listed by GET /v1/email/inbound. Without awsAccountId every account with an inbound bucket is tried in account id order and the first match is returned; with it, only that account. Returns 404 when the email is not in any account read, or when awsAccountId is not in this org. Accounts that deny access or cannot be read are skipped, so a 404 can also mean the email sits in an account this key could not read. htmlTruncated: true means the HTML body was longer than the 200 KB cap (204,800 characters, counted as JavaScript string length) when the email was received and was cut to that prefix, so html may be incomplete markup. html is null when the email had no HTML part. The response carries the message headers, text body and attachment metadata. Attachments are metadata only: each has an s3Key, but there is no endpoint that downloads attachment contents. Requires authentication only.",
      },
    }
  );
