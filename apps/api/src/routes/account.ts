/**
 * Account Health Routes
 *
 * GET /v1/account/health                 - Org-wide SES health rollup
 * GET /v1/account/health/:awsAccountId   - Health for one connected AWS account
 *
 * Serves the verdict the hourly account-health worker
 * (apps/api/src/workers/account-health.ts) already persists on `aws_account`
 * — plan 205. This route reads Postgres only: zero AWS calls, zero new IAM.
 * A hosted ESP has no per-customer SES account to describe; this is the
 * queryable answer to "am I safe to send right now?" that only exists because
 * the customer owns their own infrastructure.
 */

import { SESv2Client } from "@aws-sdk/client-sesv2";
import { and, awsAccount, db, eq } from "@wraps/db";
import { t } from "elysia";
import {
  CURRENT_CONSOLE_POLICY_VERSION,
  probeConsolePolicyVersion,
} from "../lib/console-policy-version";
import { rollUpSesHealth, SES_THRESHOLDS } from "../lib/ses-health";
import {
  type AuthContext,
  createAuthenticatedRoutes,
  getAuth,
} from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rate-limit";
import { getCredentials } from "../services/credentials";

type HealthDetail = NonNullable<typeof awsAccount.$inferSelect.healthDetail>;

type OrgAccountHealthRow = {
  id: string;
  accountId: string;
  region: string;
  healthStatus: "healthy" | "at_risk" | "in_danger" | null;
  healthCheckedAt: Date | null;
  healthDetail: HealthDetail | null;
};

/**
 * The one org-scoped account+health select used by both routes below — so
 * this file selects `awsAccount` exactly once, with exactly one org
 * predicate, regardless of how many handlers need it. Only the columns named
 * in the projection below are ever read — nothing credential-shaped, since
 * this route has no reason to hold that.
 */
async function getOrgAwsAccountsWithHealth(
  authContext: AuthContext,
  awsAccountId?: string
): Promise<OrgAccountHealthRow[]> {
  const conditions = [
    eq(awsAccount.organizationId, authContext.organizationId),
  ];
  if (awsAccountId) {
    conditions.push(eq(awsAccount.id, awsAccountId));
  }
  // biome-ignore lint/plugin: the org predicate built above is always the first entry in `conditions` — the plugin can't trace `organizationId` through the `...conditions` spread.
  return await db
    .select({
      id: awsAccount.id,
      accountId: awsAccount.accountId,
      region: awsAccount.region,
      healthStatus: awsAccount.healthStatus,
      healthCheckedAt: awsAccount.healthCheckedAt,
      healthDetail: awsAccount.healthDetail,
    })
    .from(awsAccount)
    .where(and(...conditions));
}

/**
 * Maps one `aws_account` row to the public per-account view. Every field
 * except id/accountNumber/region/status/checkedAt comes straight out of
 * `healthDetail` — never computed here. A never-swept account (`healthDetail`
 * null) emits `null` for every one of those fields, never `0` or `false`: a
 * measured zero and an unmeasured account must never look the same.
 */
function toAccountHealthView(row: OrgAccountHealthRow) {
  const detail = row.healthDetail;
  const productionAccessEnabled = detail?.productionAccessEnabled ?? null;

  return {
    id: row.id,
    accountNumber: row.accountId,
    region: row.region,
    status: row.healthStatus ?? ("unknown" as const),
    checkedAt: row.healthCheckedAt ? row.healthCheckedAt.toISOString() : null,
    // Sandbox is the inverse of productionAccessEnabled, but only when that
    // is actually known — a never-swept account is unknown, not "in the
    // sandbox".
    sandbox: productionAccessEnabled === null ? null : !productionAccessEnabled,
    productionAccessEnabled,
    sendingEnabled: detail?.sendingEnabled ?? null,
    enforcementStatus: detail?.enforcementStatus ?? null,
    quota: {
      max24Hour: detail?.max24HourSend ?? null,
      sentLast24Hours: detail?.sentLast24Hours ?? null,
      usedRatio: detail?.quotaUsedRatio ?? null,
      maxSendRate: detail?.maxSendRate ?? null,
    },
    reputation: {
      bounceRate: detail?.bounceRate ?? null,
      complaintRate: detail?.complaintRate ?? null,
    },
    // Flattened by reference from SES_THRESHOLDS, never retyped — a
    // review/pause transposition here would silently mislead every caller
    // computing their own headroom.
    thresholds: {
      bounceReview: SES_THRESHOLDS.bounce.review,
      bouncePause: SES_THRESHOLDS.bounce.pause,
      complaintReview: SES_THRESHOLDS.complaint.review,
      complaintPause: SES_THRESHOLDS.complaint.pause,
      quotaWarn: SES_THRESHOLDS.quotaWarnRatio,
    },
    reasons: detail?.reasons ?? [],
  };
}

/**
 * Oldest `healthCheckedAt` among the accounts that have one, so the
 * freshness claim ("checked at this time") holds for every account the
 * rollup represents — matching apps/web's `/api/[orgSlug]/health` route.
 */
function oldestCheckedAt(rows: OrgAccountHealthRow[]): string | null {
  const timestamps = rows
    .map((r) => r.healthCheckedAt)
    .filter((d): d is Date => d !== null)
    .map((d) => d.getTime());
  if (timestamps.length === 0) {
    return null;
  }
  return new Date(Math.min(...timestamps)).toISOString();
}

const NULLABLE_NUMBER = t.Union([t.Number(), t.Null()]);
const NULLABLE_STRING = t.Union([t.String(), t.Null()]);
const NULLABLE_BOOLEAN = t.Union([t.Boolean(), t.Null()]);
const HEALTH_STATUS = t.Union([
  t.Literal("healthy"),
  t.Literal("at_risk"),
  t.Literal("in_danger"),
  t.Literal("unknown"),
]);

const ACCOUNT_HEALTH_VIEW = t.Object({
  id: t.String(),
  accountNumber: t.String(),
  region: t.String(),
  status: HEALTH_STATUS,
  checkedAt: NULLABLE_STRING,
  sandbox: NULLABLE_BOOLEAN,
  productionAccessEnabled: NULLABLE_BOOLEAN,
  sendingEnabled: NULLABLE_BOOLEAN,
  enforcementStatus: NULLABLE_STRING,
  quota: t.Object({
    max24Hour: NULLABLE_NUMBER,
    sentLast24Hours: NULLABLE_NUMBER,
    usedRatio: NULLABLE_NUMBER,
    maxSendRate: NULLABLE_NUMBER,
  }),
  reputation: t.Object({
    bounceRate: NULLABLE_NUMBER,
    complaintRate: NULLABLE_NUMBER,
  }),
  thresholds: t.Object({
    bounceReview: t.Number(),
    bouncePause: t.Number(),
    complaintReview: t.Number(),
    complaintPause: t.Number(),
    quotaWarn: t.Number(),
  }),
  reasons: t.Array(t.String()),
});

/**
 * Per-account cooldown on the re-probe below. The button this serves exists
 * because the hourly sweep will not re-probe a freshly repaired role for up
 * to a day; it does not need to answer faster than once a minute, and each
 * call costs an STS AssumeRole plus up to five SES calls in the customer's
 * account.
 */
const RECHECK_COOLDOWN_MS = 60_000;

const CONSOLE_POLICY_VIEW = t.Object({
  version: NULLABLE_NUMBER,
  currentVersion: t.Number(),
  upToDate: t.Boolean(),
  checkedAt: NULLABLE_STRING,
  /** False when the cooldown or an unreachable probe left the stored reading in place. */
  rechecked: t.Boolean(),
});

export const accountRoutes = createAuthenticatedRoutes("/v1/account")
  .use(rateLimitMiddleware)
  .post(
    "/console-policy/:awsAccountId/recheck",
    async (ctx) => {
      const { params, set } = ctx;
      const authContext = getAuth(ctx);

      // Org-scoped by both predicates: an account id alone is a cross-org
      // read, and this one hands back a credential-derived fact.
      const account = await db.query.awsAccount.findFirst({
        where: and(
          eq(awsAccount.id, params.awsAccountId),
          eq(awsAccount.organizationId, authContext.organizationId)
        ),
        columns: {
          id: true,
          organizationId: true,
          consolePolicyVersion: true,
          consolePolicyCheckedAt: true,
        },
      });

      if (!account) {
        set.status = 404;
        throw new Error("AWS account not found");
      }

      const storedView = (rechecked: boolean) => ({
        version: account.consolePolicyVersion,
        currentVersion: CURRENT_CONSOLE_POLICY_VERSION,
        upToDate:
          account.consolePolicyVersion !== null &&
          account.consolePolicyVersion >= CURRENT_CONSOLE_POLICY_VERSION,
        checkedAt: account.consolePolicyCheckedAt?.toISOString() ?? null,
        rechecked,
      });

      const checkedAt = account.consolePolicyCheckedAt;
      if (
        checkedAt !== null &&
        Date.now() - checkedAt.getTime() < RECHECK_COOLDOWN_MS
      ) {
        return storedView(false);
      }

      const credentials = await getCredentials(
        account.id,
        account.organizationId
      );
      const sesClient = new SESv2Client({
        region: credentials.region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
        },
      });

      const result = await probeConsolePolicyVersion(sesClient);

      // Throttled or transport-failed is not a policy-version fact. Returning
      // the stored reading is right: erasing a known-good version because SES
      // rate-limited one probe would put a healthy account into the stale
      // banner it just escaped.
      if (result.unreachable) {
        return storedView(false);
      }

      const now = new Date();
      await db
        .update(awsAccount)
        .set({
          consolePolicyVersion: result.version,
          consolePolicyCheckedAt: now,
        })
        .where(
          and(
            eq(awsAccount.id, account.id),
            eq(awsAccount.organizationId, account.organizationId)
          )
        );

      return {
        version: result.version,
        currentVersion: CURRENT_CONSOLE_POLICY_VERSION,
        upToDate: result.version >= CURRENT_CONSOLE_POLICY_VERSION,
        checkedAt: now.toISOString(),
        rechecked: true,
      };
    },
    {
      params: t.Object({
        awsAccountId: t.String({ maxLength: 36 }),
      }),
      response: {
        200: CONSOLE_POLICY_VIEW,
      },
      detail: {
        tags: ["account"],
        summary: "Re-probe one account's console-access policy version",
        description:
          "Assumes the account's wraps-console-access-role and probes which version of the Wraps console policy it carries, then persists the reading. Exists so a customer who has just repaired their role sees it reflected immediately rather than waiting for the hourly sweep, which does not re-probe an account it checked within the last day. Rate limited to one probe per account per minute; inside that window, or when SES throttles the probe, the stored reading is returned with `rechecked: false`.",
      },
    }
  )
  .get(
    "/health",
    async (ctx) => {
      const authContext = getAuth(ctx);
      const rows = await getOrgAwsAccountsWithHealth(authContext);
      const accounts = rows.map(toAccountHealthView);

      return {
        status: rollUpSesHealth(rows.map((r) => r.healthStatus)),
        checkedAt: oldestCheckedAt(rows),
        accounts,
      };
    },
    {
      response: {
        200: t.Object({
          status: HEALTH_STATUS,
          checkedAt: NULLABLE_STRING,
          accounts: t.Array(ACCOUNT_HEALTH_VIEW),
        }),
      },
      detail: {
        tags: ["account"],
        summary: "Org-wide SES health rollup",
        description:
          "Returns the SES health verdict the hourly account-health sweep last persisted for every AWS account connected to this organization, plus the org-wide rollup (worst status wins; `unknown` outranks `healthy`). Zero AWS calls — this is Postgres-only, bounded by the freshness of the last hourly sweep (`checkedAt`).",
      },
    }
  )
  .get(
    "/health/:awsAccountId",
    async (ctx) => {
      const { params, set } = ctx;
      const authContext = getAuth(ctx);
      const rows = await getOrgAwsAccountsWithHealth(
        authContext,
        params.awsAccountId
      );
      const [row] = rows;
      if (!row) {
        set.status = 404;
        throw new Error("AWS account not found");
      }
      return toAccountHealthView(row);
    },
    {
      params: t.Object({
        awsAccountId: t.String({ maxLength: 36 }),
      }),
      response: {
        200: ACCOUNT_HEALTH_VIEW,
      },
      detail: {
        tags: ["account"],
        summary: "SES health for one connected AWS account",
        description:
          "Returns the persisted SES health verdict for a single AWS account connected to this organization. 404 if the account does not exist or does not belong to the authenticated organization.",
      },
    }
  );
