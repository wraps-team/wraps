/**
 * Suppression list routes: the SES account-level suppression list for the
 * AWS accounts an org has connected.
 *
 * GET    /v1/suppressions            - List suppressed addresses (paginated)
 * POST   /v1/suppressions            - Add one address (awsAccountId, email, reason)
 * POST   /v1/suppressions/bulk       - Add up to 100 addresses, one result each
 * DELETE /v1/suppressions/:email     - Remove one address (requires confirm=true)
 *
 * Lifted from apps/web/src/actions/suppressions.ts (listSuppressions,
 * addSuppression, addSuppressions, removeSuppression). List checks
 * awsAccounts: read; add and remove check awsAccounts: write. API keys need
 * contacts:read to list and contacts:write to add or remove.
 *
 * Every AWS account id from the client is checked against the caller's org
 * before any SES call. An account that belongs to another org is a 404, the
 * same as a missing one.
 */

import {
  and,
  auditLog,
  awsAccount,
  db,
  eq,
  suppressContactByEmail,
  user,
} from "@wraps/db";
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
  putSuppressedAddress,
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

// Add-side constants and helpers. Copied from apps/web/src/actions/suppressions.ts
// (ADDABLE_REASONS, EMAIL_SHAPE, MAX_EMAIL_LENGTH, suppressOne, addSuppressions).
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
// Same ceiling as the web bulk action.
const MAX_BULK_ENTRIES = 100;
// Same concurrency as the web bulk action, so SES sees the same fan-out.
const BULK_CONCURRENCY = 5;

type AddReason = "BOUNCE" | "COMPLAINT";

/** Who made the change, for the audit row. */
type AddAudit = {
  userId: string | null;
  actorEmail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

type AddOutcome =
  | { ok: true; email: string; alreadyPresent: boolean }
  | { ok: false; status: 400 | 403 | 404; error: string };

type BulkAddResult =
  | { email: string; success: true; alreadyPresent: boolean }
  | { email: string; success: false; error: string };

function isAddReason(value: string): value is AddReason {
  return value === "BOUNCE" || value === "COMPLAINT";
}

/** Trims and lowercases, then applies the web action's two checks. */
function normalizeAddress(
  raw: string
): { ok: true; address: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed.includes("@")) {
    return { ok: false, error: "Enter an email address." };
  }
  const address = trimmed.toLowerCase();
  if (address.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(address)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  return { ok: true, address };
}

async function actorEmailFor(userId: string | null): Promise<string | null> {
  if (!userId) {
    return null;
  }
  try {
    const [actor] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return actor?.email ?? null;
  } catch (error) {
    log.error("Failed to look up suppression actor email", error, { userId });
    return null;
  }
}

/**
 * Adds one address to one org AWS account's SES suppression list, with the
 * side effects of the web suppressOne: an address already suppressed is a
 * no-op apart from keeping the contact in step; otherwise PutSuppressedDestination,
 * then the contact row, then the audit row. The account is checked against the
 * org before any SES call. Throws on an unexpected SES failure.
 */
async function addOne(
  organizationId: string,
  input: { awsAccountId: string; email: string; reason: string },
  audit: AddAudit
): Promise<AddOutcome> {
  // Never trust a reason from the client: SES only accepts these two.
  if (!isAddReason(input.reason)) {
    return {
      ok: false,
      status: 400,
      error: "Reason must be BOUNCE or COMPLAINT.",
    };
  }
  const reason = input.reason;

  const normalized = normalizeAddress(input.email);
  if (!normalized.ok) {
    return { ok: false, status: 400, error: normalized.error };
  }
  const email = normalized.address;

  const account = await findOrgAccount(input.awsAccountId, organizationId);
  if (!account) {
    return { ok: false, status: 404, error: "AWS account not found" };
  }

  // A repeat add is a no-op, and a COMPLAINT is never weakened to a BOUNCE.
  // If the read is denied, fail closed.
  const current = await getSuppressedAddress({ account, email });
  if (current.status === "denied") {
    return { ok: false, status: 403, error: PERMISSION_DENIED_ERROR };
  }
  if (
    current.status === "found" &&
    (current.address.reason === reason ||
      current.address.reason === "COMPLAINT")
  ) {
    // SES already has it, but the contact may not. Idempotent.
    await suppressContactByEmail(organizationId, email);
    return { ok: true, email, alreadyPresent: true };
  }

  // AWS first: the write cannot be rolled back, so it runs before the audit row.
  const added = await putSuppressedAddress({ account, email, reason });
  if (added.status === "denied") {
    return { ok: false, status: 403, error: PERMISSION_DENIED_ERROR };
  }

  // Broadcasts choose recipients from the contact's status, not the SES list.
  const contactSuppressed = await suppressContactByEmail(organizationId, email);

  try {
    await db.insert(auditLog).values({
      organizationId,
      userId: audit.userId,
      actorEmail: audit.actorEmail,
      action: "suppression.added",
      resource: "suppression",
      resourceId: email,
      metadata: {
        email,
        reason,
        awsAccountId: account.id,
        source: "manual",
        contactSuppressed,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });
  } catch (auditError) {
    // The address really is suppressed at this point. Reporting failure
    // because the audit row did not write would be worse than a missing entry.
    log.error(
      "suppression.added audit log failed to write after SES put succeeded",
      auditError,
      { organizationId, awsAccountId: account.id }
    );
  }

  return { ok: true, email, alreadyPresent: false };
}

/** One bulk entry. An exception here is that entry's failure, never the batch's. */
async function addBulkEntry(
  organizationId: string,
  entry: { awsAccountId: string; email: string; reason: string },
  audit: AddAudit
): Promise<BulkAddResult> {
  try {
    const outcome = await addOne(organizationId, entry, audit);
    if (!outcome.ok) {
      return { email: entry.email, success: false, error: outcome.error };
    }
    return {
      email: entry.email,
      success: true,
      alreadyPresent: outcome.alreadyPresent,
    };
  } catch (error) {
    log.error("Failed to add suppression in bulk", error, {
      organizationId,
      awsAccountId: entry.awsAccountId,
    });
    return {
      email: entry.email,
      success: false,
      error: "Failed to add suppression",
    };
  }
}

const addEntrySchema = t.Object({
  awsAccountId: t.String({ minLength: 1, maxLength: 128 }),
  // Checked in the handler, so one bad address fails only its own entry.
  email: t.String({ description: "Email address to suppress." }),
  // Checked in the handler: anything but BOUNCE or COMPLAINT is refused.
  reason: t.String({ description: "BOUNCE or COMPLAINT." }),
});

const addResponseSchema = t.Object({
  success: t.Literal(true),
  email: t.String(),
  awsAccountId: t.String(),
  alreadyPresent: t.Boolean(),
});

const bulkResultSchema = t.Union([
  t.Object({
    email: t.String(),
    success: t.Literal(true),
    alreadyPresent: t.Boolean(),
  }),
  t.Object({
    email: t.String(),
    success: t.Literal(false),
    error: t.String(),
  }),
]);

const bulkAddResponseSchema = t.Object({
  results: t.Array(bulkResultSchema),
});

export const suppressionsRoutes = createAuthenticatedRoutes("/v1/suppressions")
  .get(
    "/",
    async (ctx) => {
      const { query, set, request } = ctx;
      const authContext = getAuth(ctx);
      const gate = await requirePermission(ctx, "awsAccounts", ["read"], {
        // A suppression is an address; for API keys it falls under Contacts.
        keyScopes: ["contacts:read"],
      });
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
  .post(
    "/",
    async (ctx) => {
      const { body, set, request } = ctx;
      const authContext = getAuth(ctx);
      const gate = await requirePermission(ctx, "awsAccounts", ["write"], {
        keyScopes: ["contacts:write"],
      });
      if (!gate.ok) {
        return gate.body;
      }
      const organizationId = authContext.organizationId;

      const audit: AddAudit = {
        userId: gate.userId,
        actorEmail: await actorEmailFor(gate.userId),
        ipAddress: clientIp(request),
        userAgent: request.headers.get("user-agent"),
      };

      let outcome: AddOutcome;
      try {
        outcome = await addOne(organizationId, body, audit);
      } catch (error) {
        log.error("Failed to add suppression", error, {
          organizationId,
          awsAccountId: body.awsAccountId,
        });
        set.status = 502;
        return { error: "Failed to add suppression" };
      }
      if (!outcome.ok) {
        set.status = outcome.status;
        return { error: outcome.error };
      }

      return {
        success: true as const,
        email: outcome.email,
        awsAccountId: body.awsAccountId,
        alreadyPresent: outcome.alreadyPresent,
      };
    },
    {
      body: addEntrySchema,
      response: {
        200: addResponseSchema,
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
        502: errorResponse,
      },
      detail: {
        tags: ["suppressions"],
        summary: "Add a suppressed address",
        description:
          "Adds one address to the SES suppression list of the given AWS account, so Wraps stops sending to it. The address is trimmed and lowercased. Repeat adds are idempotent: an address already suppressed (or already a COMPLAINT) returns alreadyPresent true and writes nothing new. A BOUNCE can be upgraded to COMPLAINT; a COMPLAINT is never downgraded. A matching contact is set to suppressed so broadcasts skip it. Undo with DELETE /v1/suppressions/:email?awsAccountId=...&confirm=true. Requires awsAccounts:write; API keys need contacts:write.",
      },
    }
  )
  .post(
    "/bulk",
    async (ctx) => {
      const { body, set, request } = ctx;
      const authContext = getAuth(ctx);
      const gate = await requirePermission(ctx, "awsAccounts", ["write"], {
        keyScopes: ["contacts:write"],
      });
      if (!gate.ok) {
        return gate.body;
      }
      const organizationId = authContext.organizationId;
      const { entries } = body;

      if (entries.length === 0) {
        set.status = 400;
        return { error: "Choose at least one address." };
      }
      if (entries.length > MAX_BULK_ENTRIES) {
        set.status = 400;
        return {
          error: `Suppress at most ${MAX_BULK_ENTRIES} addresses at a time.`,
        };
      }

      const audit: AddAudit = {
        userId: gate.userId,
        actorEmail: await actorEmailFor(gate.userId),
        ipAddress: clientIp(request),
        userAgent: request.headers.get("user-agent"),
      };

      // Results are written by request index, so the response keeps request order.
      const results: BulkAddResult[] = new Array(entries.length);
      let next = 0;
      const worker = async () => {
        while (next < entries.length) {
          const index = next;
          next += 1;
          results[index] = await addBulkEntry(
            organizationId,
            entries[index],
            audit
          );
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(BULK_CONCURRENCY, entries.length) }, () =>
          worker()
        )
      );

      return { results };
    },
    {
      body: t.Object({
        entries: t.Array(addEntrySchema, {
          description: `Between 1 and ${MAX_BULK_ENTRIES} entries. Each entry has its own awsAccountId.`,
        }),
      }),
      response: {
        200: bulkAddResponseSchema,
        400: errorResponse,
        403: errorResponse,
      },
      detail: {
        tags: ["suppressions"],
        summary: "Add many suppressed addresses",
        description: `Adds up to ${MAX_BULK_ENTRIES} addresses in one request, each with the same rules as POST /v1/suppressions. The response has one result per entry, in request order. An entry that fails (invalid address, an AWS account outside the org, SES denied, or an SES error) fails only itself; the rest still run. An empty list or more than ${MAX_BULK_ENTRIES} entries is refused with 400. Undo each address with DELETE /v1/suppressions/:email. Requires awsAccounts:write; API keys need contacts:write.`,
      },
    }
  )
  .delete(
    "/:email",
    async (ctx) => {
      const { params, query, set, request } = ctx;
      const authContext = getAuth(ctx);
      const gate = await requirePermission(ctx, "awsAccounts", ["write"], {
        keyScopes: ["contacts:write"],
      });
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
        const [actor] = gate.userId
          ? await db
              .select({ email: user.email })
              .from(user)
              .where(eq(user.id, gate.userId))
              .limit(1)
          : [];
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
