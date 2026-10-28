/**
 * Suppression list routes: the SES account-level suppression list for the
 * AWS accounts an org has connected.
 *
 * GET    /v1/suppressions            - List suppressed addresses (paginated)
 * DELETE /v1/suppressions/:email     - Remove one address (requires confirm=true)
 *
 * Lifted from apps/web/src/actions/suppressions.ts (listSuppressions,
 * removeSuppression). Both check awsAccounts: read to list, write to remove.
 *
 * Every AWS account id from the client is checked against the caller's org
 * before any SES call. An account that belongs to another org is a 404, the
 * same as a missing one.
 */

import { and, auditLog, awsAccount, db, eq, user } from "@wraps/db";
import { t } from "elysia";
import { INVALID_CURSOR_MESSAGE } from "../lib/cursor";
import { log } from "../lib/logger";
import { requirePermission } from "../lib/require-permission";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";
import {
  decodeSuppressionCursor,
  deleteSuppressedAddress,
  getSuppressedAddress,
  listSuppressedAddresses,
} from "../services/ses-suppression";

type AwsAccountRow = typeof awsAccount.$inferSelect;

const errorResponse = t.Object({ error: t.String() });

// Verbatim copy of the string the web action returns when SES denies the
// call (apps/web/src/actions/suppressions.ts, PERMISSION_DENIED_ERROR). Keep
// the two in step.
const PERMISSION_DENIED_ERROR =
  "Wraps doesn't have permission to manage the suppression list on this account. Run `wraps platform update-role` to refresh permissions.";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const suppressedAddressSchema = t.Object({
  email: t.String(),
  reason: t.Union([t.Literal("BOUNCE"), t.Literal("COMPLAINT")]),
  lastUpdated: t.String(),
  awsAccountId: t.String(),
  region: t.String(),
});

const listResponseSchema = t.Object({
  entries: t.Array(suppressedAddressSchema),
  nextCursor: t.Optional(t.String()),
  hasMore: t.Boolean(),
  deniedAccountIds: t.Array(t.String()),
  unreachableAccountIds: t.Array(t.String()),
});

const removeResponseSchema = t.Object({
  success: t.Literal(true),
  email: t.String(),
  wasPresent: t.Boolean(),
});

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : null;
}

/** The AWS account, only if it belongs to `organizationId`. */
function findOrgAccount(awsAccountId: string, organizationId: string) {
  return db.query.awsAccount.findFirst({
    where: and(
      eq(awsAccount.id, awsAccountId),
      eq(awsAccount.organizationId, organizationId)
    ),
  });
}

export const suppressionsRoutes = createAuthenticatedRoutes("/v1/suppressions")
  .get(
    "/",
    async (ctx) => {
      const { query, set, request } = ctx;
      const authContext = getAuth(ctx);
      const gate = await requirePermission(ctx, "awsAccounts", ["read"]);
      if (!gate.ok) {
        return gate.body;
      }
      const organizationId = authContext.organizationId;

      const cursor =
        query.cursor === undefined ? {} : decodeSuppressionCursor(query.cursor);
      if (cursor === null) {
        set.status = 400;
        return { error: INVALID_CURSOR_MESSAGE };
      }

      let accounts: AwsAccountRow[];
      if (query.awsAccountId !== undefined) {
        const account = await findOrgAccount(
          query.awsAccountId,
          organizationId
        );
        if (!account) {
          set.status = 404;
          return { error: "AWS account not found" };
        }
        accounts = [account];
      } else {
        accounts = await db.query.awsAccount.findMany({
          where: eq(awsAccount.organizationId, organizationId),
        });
      }

      try {
        const page = await listSuppressedAddresses({
          accounts,
          limit: Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
          cursor,
          reason: query.reason,
        });
        return {
          entries: page.entries,
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          deniedAccountIds: page.deniedAccountIds,
          unreachableAccountIds: page.unreachableAccountIds,
        };
      } catch (error) {
        log.error("Failed to load suppressions", error, {
          organizationId,
          requestIp: clientIp(request),
        });
        set.status = 502;
        return { error: "Failed to load suppressions" };
      }
    },
    {
      query: t.Object({
        awsAccountId: t.Optional(t.String({ maxLength: 128 })),
        reason: t.Optional(
          t.Union([t.Literal("BOUNCE"), t.Literal("COMPLAINT")])
        ),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: MAX_LIMIT })),
        cursor: t.Optional(t.String({ maxLength: 8192 })),
      }),
      response: {
        200: listResponseSchema,
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
        502: errorResponse,
      },
      detail: {
        tags: ["suppressions"],
        summary: "List suppressed addresses",
        description:
          "Lists the SES account-level suppression list. Without awsAccountId it reads every AWS account connected to the org; with it, only that account (404 if the account is not in this org). Pass the nextCursor from a previous page unchanged to continue. Entries carry the AWS account they came from. Accounts that denied access or could not be reached are listed in deniedAccountIds and unreachableAccountIds. Requires awsAccounts:read.",
      },
    }
  )
  .delete(
    "/:email",
    async (ctx) => {
      const { params, query, set, request } = ctx;
      const authContext = getAuth(ctx);
      const gate = await requirePermission(ctx, "awsAccounts", ["write"]);
      if (!gate.ok) {
        return gate.body;
      }
      const organizationId = authContext.organizationId;

      if (query.confirm !== "true") {
        set.status = 400;
        return {
          error:
            "Confirmation required: pass confirm=true to remove this address from the suppression list. Removing it lets Wraps send to the address again.",
        };
      }

      const account = await findOrgAccount(query.awsAccountId, organizationId);
      if (!account) {
        set.status = 404;
        return { error: "AWS account not found" };
      }

      const email = params.email;

      // Re-read the reason server-side. Never trust a reason from the client.
      // If the re-read is denied, fail closed rather than remove on an
      // unverified reason.
      let current: Awaited<ReturnType<typeof getSuppressedAddress>>;
      try {
        current = await getSuppressedAddress({ account, email });
      } catch (error) {
        log.error("Failed to read suppression before removal", error, {
          organizationId,
          awsAccountId: account.id,
        });
        set.status = 502;
        return { error: "Failed to remove suppression" };
      }
      if (current.status === "denied") {
        set.status = 403;
        return { error: PERMISSION_DENIED_ERROR };
      }
      if (current.status === "not_found") {
        set.status = 404;
        return { error: "This address is not on the suppression list." };
      }
      if (
        current.address.reason === "COMPLAINT" &&
        query.acknowledgedComplaint !== "true"
      ) {
        set.status = 409;
        return {
          error:
            "This address was suppressed because of a spam complaint. Confirm you understand before removing it.",
        };
      }

      // AWS first: DeleteSuppressedDestination cannot be rolled back, so the
      // audit row is written after it, not in a transaction around it.
      let deleted: Awaited<ReturnType<typeof deleteSuppressedAddress>>;
      try {
        deleted = await deleteSuppressedAddress({ account, email });
      } catch (error) {
        log.error("Failed to delete suppression", error, {
          organizationId,
          awsAccountId: account.id,
        });
        set.status = 502;
        return { error: "Failed to remove suppression" };
      }
      if (deleted.status === "denied") {
        set.status = 403;
        return { error: PERMISSION_DENIED_ERROR };
      }

      try {
        const [actor] = await db
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, gate.userId))
          .limit(1);
        await db.insert(auditLog).values({
          organizationId,
          userId: gate.userId,
          actorEmail: actor?.email ?? null,
          action: "suppression.removed",
          resource: "suppression",
          resourceId: email,
          metadata: {
            email,
            reason: current.address.reason,
            awsAccountId: account.id,
          },
          ipAddress: clientIp(request),
          userAgent: request.headers.get("user-agent"),
        });
      } catch (auditError) {
        // The address is unsuppressed at this point. Reporting failure because
        // the audit row did not write would be worse than a missing entry.
        log.error(
          "suppression.removed audit log failed to write after AWS delete succeeded",
          auditError,
          { organizationId, awsAccountId: account.id }
        );
      }

      return {
        success: true as const,
        email,
        wasPresent: deleted.status === "removed",
      };
    },
    {
      // The email is a path segment, not a query value: a query string turns
      // "+" into a space, which would remove the wrong address. Clients must
      // encodeURIComponent() it.
      params: t.Object({
        email: t.String({ minLength: 1, maxLength: 320 }),
      }),
      query: t.Object({
        awsAccountId: t.String({ minLength: 1, maxLength: 128 }),
        confirm: t.Optional(t.String()),
        acknowledgedComplaint: t.Optional(t.String()),
      }),
      response: {
        200: removeResponseSchema,
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
        502: errorResponse,
      },
      detail: {
        tags: ["suppressions"],
        summary: "Remove a suppressed address",
        description:
          "Removes one address from the SES suppression list of the given AWS account. Destructive: pass confirm=true, or the request is refused with 400 before anything changes. Addresses suppressed for a spam complaint also need acknowledgedComplaint=true (409 otherwise). Percent-encode the email in the path. Requires awsAccounts:write.",
      },
    }
  );
