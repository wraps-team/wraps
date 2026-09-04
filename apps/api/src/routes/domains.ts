/**
 * Domains Routes
 *
 * GET /v1/domains            - List sending identities (domains/emails), read live from SES
 * GET /v1/domains/:identity  - Full verification/DKIM detail for one identity
 *
 * There is no domain table — identity state is not persisted, only read live
 * from the customer's SES account through the wraps-console-access-role. No
 * new IAM permission is required: the role already grants
 * ses:ListEmailIdentities and ses:GetEmailIdentity.
 */

import {
  GetEmailIdentityCommand,
  ListEmailIdentitiesCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { and, awsAccount, db, eq } from "@wraps/db";
import { t } from "elysia";
import {
  type AuthContext,
  createAuthenticatedRoutes,
  getAuth,
} from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rate-limit";
import { getCredentials } from "../services/credentials";

/**
 * STS/SES codes that all mean the same thing operationally: the customer's
 * console-access role is gone, its trust policy no longer admits this Lambda,
 * or it no longer carries the SES read permissions this route needs.
 * Copied verbatim from apps/api/src/workers/account-health.ts:74-96 — not
 * exported from there (that module has Lambda-handler side effects on
 * import), and not worth a shared module for two call sites.
 */
const ROLE_ACCESS_ERROR_CODES = [
  "AccessDenied",
  "AccessDeniedException",
  "NoSuchEntity",
  "NoSuchEntityException",
  "InvalidClientTokenId",
  "ExpiredToken",
  "ExpiredTokenException",
  "UnrecognizedClientException",
] as const;

/**
 * AWS SDK v3 error names are unreliable — some errors arrive as `name: "Error"`
 * with the real code only in the message — so both are checked.
 */
function isRoleAccessError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return ROLE_ACCESS_ERROR_CODES.some(
    (code) => error.name === code || error.message.includes(code)
  );
}

const THROTTLE_ERROR_CODES = [
  "TooManyRequestsException",
  "Throttling",
  "ThrottlingException",
] as const;

function isThrottleError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return THROTTLE_ERROR_CODES.some(
    (code) => error.name === code || error.message.includes(code)
  );
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "NotFoundException" ||
    error.message.includes("NotFoundException")
  );
}

type OrgAccountRow = {
  id: string;
  accountId: string;
  region: string;
};

/**
 * The one org-scoped account select used by both routes below — so this file
 * selects `awsAccount` exactly once, with exactly one org predicate,
 * regardless of how many handlers need it. `getCredentials` re-reads
 * roleArn/externalId itself, so this select does not carry them.
 */
async function getOrgAwsAccounts(
  authContext: AuthContext,
  awsAccountId?: string
): Promise<OrgAccountRow[]> {
  const conditions = [
    eq(awsAccount.organizationId, authContext.organizationId),
  ];
  if (awsAccountId) {
    conditions.push(eq(awsAccount.id, awsAccountId));
  }
  return await db
    .select({
      id: awsAccount.id,
      accountId: awsAccount.accountId,
      region: awsAccount.region,
    })
    .from(awsAccount)
    // biome-ignore lint/plugin: the org predicate built above is always the first entry in `conditions` — the org-scope plugin can't trace it through the spread.
    .where(and(...conditions));
}

function sesClientFor(credentials: {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}): SESv2Client {
  return new SESv2Client({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
}

type ListedIdentity = {
  IdentityName?: string;
  IdentityType?: string;
  SendingEnabled?: boolean;
  VerificationStatus?: string;
};

/**
 * SES returns a NextToken on the LAST non-empty page too (verified live
 * 2026-08-18) — so `Boolean(NextToken)` is not "more exist". Stop on a
 * trailing empty page or a repeated token; hard-cap at 20 pages (2,000
 * identities) so a pathological account cannot hang the request.
 */
async function listIdentitiesForAccount(
  client: SESv2Client
): Promise<ListedIdentity[]> {
  const identities: ListedIdentity[] = [];
  let nextToken: string | undefined;
  let pages = 0;
  do {
    const page = await client.send(
      new ListEmailIdentitiesCommand({ PageSize: 100, NextToken: nextToken })
    );
    const items = page.EmailIdentities ?? [];
    if (items.length === 0) {
      break;
    }
    identities.push(...items);
    if (page.NextToken === nextToken) {
      break;
    }
    nextToken = page.NextToken;
    pages += 1;
  } while (nextToken && pages < 20);

  // De-duplicate by IdentityName within this one account (a last page can
  // overlap the previous one). Never de-duplicate across accounts — the same
  // domain verified in two accounts is legitimately two rows.
  const seen = new Set<string>();
  return identities.filter((identity) => {
    if (!identity.IdentityName || seen.has(identity.IdentityName)) {
      return false;
    }
    seen.add(identity.IdentityName);
    return true;
  });
}

// AWS's IdentityType is DOMAIN | EMAIL_ADDRESS | MANAGED_DOMAIN, but declared
// as a plain nullable string rather than a literal union — a new value SES
// adds later must not turn into a 500 validation failure on this route.
const IDENTITY_TYPE = t.Union([t.String(), t.Null()]);

const DOMAIN_RE = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const EMAIL_IDENTITY_RE = /^[^\s@/]{1,64}@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export const domainsRoutes = createAuthenticatedRoutes("/v1/domains")
  .use(rateLimitMiddleware)
  .get(
    "/",
    async (ctx) => {
      const { query, set } = ctx;
      const authContext = getAuth(ctx);

      const accounts = await getOrgAwsAccounts(authContext, query.awsAccountId);
      if (query.awsAccountId && accounts.length === 0) {
        set.status = 404;
        throw new Error("AWS account not found");
      }

      const data: Array<{
        identity: string;
        identityType: string | null;
        sendingEnabled: boolean | null;
        verificationStatus: string | null;
        awsAccountId: string;
        region: string;
      }> = [];
      const accountsSummary: Array<{
        id: string;
        accountId: string;
        region: string;
        reachable: boolean;
      }> = [];

      for (const account of accounts) {
        try {
          const credentials = await getCredentials(
            account.id,
            authContext.organizationId
          );
          const client = sesClientFor(credentials);
          const identities = await listIdentitiesForAccount(client);
          for (const identity of identities) {
            data.push({
              identity: identity.IdentityName ?? "",
              identityType: identity.IdentityType ?? null,
              sendingEnabled: identity.SendingEnabled ?? null,
              verificationStatus: identity.VerificationStatus ?? null,
              awsAccountId: account.id,
              region: account.region,
            });
          }
          accountsSummary.push({
            id: account.id,
            accountId: account.accountId,
            region: account.region,
            reachable: true,
          });
        } catch (error) {
          // A single unreachable account must not fail the whole request —
          // mark it and keep going. Any other error (network, throttling,
          // unknown) is rethrown so it surfaces as a 500 with Sentry.
          if (!isRoleAccessError(error)) {
            throw error;
          }
          accountsSummary.push({
            id: account.id,
            accountId: account.accountId,
            region: account.region,
            reachable: false,
          });
        }
      }

      return { data, accounts: accountsSummary };
    },
    {
      query: t.Object({
        awsAccountId: t.Optional(t.String({ maxLength: 36 })),
      }),
      response: {
        200: t.Object({
          data: t.Array(
            t.Object({
              identity: t.String(),
              identityType: IDENTITY_TYPE,
              sendingEnabled: t.Union([t.Boolean(), t.Null()]),
              verificationStatus: t.Union([t.String(), t.Null()]),
              awsAccountId: t.String(),
              region: t.String(),
            })
          ),
          accounts: t.Array(
            t.Object({
              id: t.String(),
              accountId: t.String(),
              region: t.String(),
              reachable: t.Boolean(),
            })
          ),
        }),
      },
      detail: {
        tags: ["domains"],
        summary: "List sending identities",
        description:
          "Lists SES sending identities (domains and email addresses) across the organization's connected AWS accounts, read live from SES. An account whose console-access role cannot be assumed is reported unreachable in `accounts` rather than failing the whole request.",
      },
    }
  )
  .get(
    "/:identity",
    async (ctx) => {
      const { params, query, set } = ctx;
      const authContext = getAuth(ctx);
      const { identity } = params;

      if (!(DOMAIN_RE.test(identity) || EMAIL_IDENTITY_RE.test(identity))) {
        set.status = 400;
        throw new Error("identity must be a domain or an email address");
      }

      const accounts = await getOrgAwsAccounts(authContext, query.awsAccountId);
      if (query.awsAccountId && accounts.length === 0) {
        set.status = 404;
        throw new Error("AWS account not found");
      }

      const unreachableAccountIds: string[] = [];
      let reachedAtLeastOne = false;

      for (const account of accounts) {
        let credentials: Awaited<ReturnType<typeof getCredentials>>;
        try {
          credentials = await getCredentials(
            account.id,
            authContext.organizationId
          );
        } catch (error) {
          if (isRoleAccessError(error)) {
            unreachableAccountIds.push(account.id);
            continue;
          }
          throw error;
        }

        const client = sesClientFor(credentials);
        try {
          const response = await client.send(
            new GetEmailIdentityCommand({ EmailIdentity: identity })
          );
          reachedAtLeastOne = true;
          return {
            identity,
            identityType: response.IdentityType ?? null,
            verifiedForSending: response.VerifiedForSendingStatus ?? false,
            verificationStatus: response.VerificationStatus ?? null,
            dkim: response.DkimAttributes
              ? {
                  status: response.DkimAttributes.Status ?? null,
                  signingAttributesOrigin:
                    response.DkimAttributes.SigningAttributesOrigin ?? null,
                  tokens: response.DkimAttributes.Tokens ?? [],
                }
              : null,
            mailFromDomain: response.MailFromAttributes?.MailFromDomain
              ? {
                  domain: response.MailFromAttributes.MailFromDomain,
                  status:
                    response.MailFromAttributes.MailFromDomainStatus ?? null,
                }
              : null,
            feedbackForwarding: response.FeedbackForwardingStatus ?? false,
            configurationSet: response.ConfigurationSetName ?? null,
            awsAccountId: account.id,
            region: account.region,
            unreachableAccountIds,
          };
        } catch (error) {
          if (isNotFoundError(error)) {
            // This account was reachable; the identity just isn't there —
            // keep searching the rest of the org's accounts.
            reachedAtLeastOne = true;
            continue;
          }
          if (isRoleAccessError(error)) {
            unreachableAccountIds.push(account.id);
            continue;
          }
          if (isThrottleError(error)) {
            set.status = 429;
            throw new Error(
              "SES throttled the request; retry after a short delay"
            );
          }
          throw error;
        }
      }

      if (!reachedAtLeastOne) {
        // Returned, not thrown: handleApiError masks a thrown 5xx message,
        // and this one names the fix the customer needs to run.
        set.status = 503;
        return {
          error: "aws_account_unreachable",
          message:
            "The wraps-console-access-role could not be assumed in any connected AWS account. Run `wraps platform update-role`.",
        };
      }

      set.status = 404;
      throw new Error("Identity not found in any connected AWS account");
    },
    {
      params: t.Object({
        identity: t.String({ maxLength: 253 }),
      }),
      query: t.Object({
        awsAccountId: t.Optional(t.String({ maxLength: 36 })),
      }),
      response: {
        200: t.Object({
          identity: t.String(),
          identityType: IDENTITY_TYPE,
          verifiedForSending: t.Boolean(),
          verificationStatus: t.Union([t.String(), t.Null()]),
          dkim: t.Union([
            t.Object({
              status: t.Union([t.String(), t.Null()]),
              signingAttributesOrigin: t.Union([t.String(), t.Null()]),
              tokens: t.Array(t.String()),
            }),
            t.Null(),
          ]),
          mailFromDomain: t.Union([
            t.Object({
              domain: t.String(),
              status: t.Union([t.String(), t.Null()]),
            }),
            t.Null(),
          ]),
          feedbackForwarding: t.Boolean(),
          configurationSet: t.Union([t.String(), t.Null()]),
          awsAccountId: t.String(),
          region: t.String(),
          unreachableAccountIds: t.Array(t.String()),
        }),
        503: t.Object({
          error: t.String(),
          message: t.String(),
          code: t.Optional(t.String()),
        }),
      },
      detail: {
        tags: ["domains"],
        summary: "Get sending identity detail",
        description:
          "Returns full verification and DKIM detail for one identity (domain or email address), searching the organization's connected AWS accounts and stopping at the first that has it. `unreachableAccountIds` lists accounts whose role could not be assumed while searching. Returns 503 only when every connected account is unreachable.",
      },
    }
  );
