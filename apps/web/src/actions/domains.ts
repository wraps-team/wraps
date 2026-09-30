"use server";

import {
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  CreateEmailIdentityCommand,
  type EventDestination,
  GetConfigurationSetCommand,
  GetConfigurationSetEventDestinationsCommand,
  GetEmailIdentityCommand,
  type IdentityInfo,
  ListEmailIdentitiesCommand,
  PutEmailIdentityConfigurationSetAttributesCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import {
  DOMAIN_CONFIG_SET_EVENT_TYPES,
  DOMAIN_EVENT_DESTINATION_NAME,
  domainToConfigSetName,
} from "@wraps/core/config-set-name";
import {
  and,
  awsAccount,
  type DomainAuthRecordState,
  db,
  eq,
  recordDomainAuthCheck,
} from "@wraps/db";
import { nodeDns } from "@wraps.dev/email-check";
import { revalidatePath } from "next/cache";
import { getOrAssumeRole } from "@/lib/aws/credential-cache";
import { checkDomainAuthRecords } from "@/lib/domain-auth-check";
import { probeTrackingTls, type TrackingTlsResult } from "@/lib/tracking-tls";
import { orgAction } from "./shared/org-action";

/**
 * STS/SES codes that all mean the same thing operationally: the customer's
 * console-access role is gone, its trust policy no longer admits this app,
 * or it no longer carries the SES read permissions this action needs.
 * Modelled on the shape of `apps/api/src/routes/domains.ts`'s
 * `isRoleAccessError` (not imported from there — different package, different
 * auth model). AWS SDK v3 error names are unreliable, so both `error.name`
 * and `error.message` are checked.
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

function isRoleAccessError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return ROLE_ACCESS_ERROR_CODES.some(
    (code) => error.name === code || error.message.includes(code)
  );
}

/**
 * True when an AWS SDK v3 error is an access-denied response to a single
 * command (as opposed to `isRoleAccessError` above, which classifies a whole
 * account as unreachable for the read fan-out). Mirrors `isAccessDeniedError`
 * in `apps/web/src/actions/ses-onboarding.ts:66-74` verbatim — not imported
 * from there, since that file carries `"use server"` and a non-async export
 * from it would break `next build`.
 */
function isAccessDeniedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "AccessDeniedException" ||
    error.message.includes("AccessDeniedException")
  );
}

function isAlreadyExistsError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AlreadyExistsException" ||
      error.message.includes("AlreadyExistsException"))
  );
}

/**
 * Creates the domain's per-domain Wraps config set and its EventBridge
 * destination, tolerating either already existing. Mirrors
 * `wraps email domains add`. Throws AccessDeniedException through on a role
 * that predates plan 376.
 */
async function ensureDomainConfigSet(
  client: SESv2Client,
  params: { configSetName: string; region: string; awsAccountNumber: string }
): Promise<void> {
  const { configSetName, region, awsAccountNumber } = params;
  try {
    await client.send(
      new CreateConfigurationSetCommand({
        ConfigurationSetName: configSetName,
        SuppressionOptions: { SuppressedReasons: ["BOUNCE", "COMPLAINT"] },
      })
    );
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }
  }
  try {
    await client.send(
      new CreateConfigurationSetEventDestinationCommand({
        ConfigurationSetName: configSetName,
        EventDestinationName: DOMAIN_EVENT_DESTINATION_NAME,
        EventDestination: {
          Enabled: true,
          MatchingEventTypes: [...DOMAIN_CONFIG_SET_EVENT_TYPES],
          EventBridgeDestination: {
            EventBusArn: `arn:aws:events:${region}:${awsAccountNumber}:event-bus/default`,
          },
        },
      })
    );
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }
  }
}

/**
 * Ceiling on identities listed per AWS account. The fan-out below issues one
 * GetEmailIdentityCommand per identity, so an unbounded list is an unbounded
 * number of AWS calls on a single page render. Not a placeholder — if a
 * customer ever reports hitting it, the fix is to stop fanning out
 * GetEmailIdentity per identity, not to raise this number.
 */
const MAX_IDENTITIES = 1000;

export type SendingDomain = {
  identity: string;
  identityType: string | null;
  verifiedForSending: boolean;
  verificationStatus: string | null;
  dkim: { status: string | null; tokens: string[] } | null;
  mailFromDomain: { domain: string; status: string | null } | null;
  configurationSet: string | null;
  awsAccountId: string;
  region: string;
};

export type ListSendingDomainsResult =
  | {
      success: true;
      domains: SendingDomain[];
      unreachableAccountIds: string[];
      truncatedAccountIds: string[];
    }
  | { success: false; error: string };

export const listSendingDomains = orgAction(
  {
    name: "listSendingDomains",
    resource: "awsAccounts",
    permission: ["read"],
    orgId: (organizationId: string) => organizationId,
    onError: "Failed to load sending domains",
  },
  async (ctx, organizationId: string): Promise<ListSendingDomainsResult> => {
    const accounts = await db
      .select({
        id: awsAccount.id,
        roleArn: awsAccount.roleArn,
        externalId: awsAccount.externalId,
        region: awsAccount.region,
      })
      .from(awsAccount)
      .where(eq(awsAccount.organizationId, organizationId));

    const domains: SendingDomain[] = [];
    const unreachableAccountIds: string[] = [];
    const truncatedAccountIds: string[] = [];

    for (const account of accounts) {
      try {
        const credentials = await getOrAssumeRole({
          roleArn: account.roleArn,
          externalId: account.externalId,
        });

        const client = new SESv2Client({
          region: account.region,
          credentials: {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            sessionToken: credentials.sessionToken,
          },
        });

        const identities: IdentityInfo[] = [];
        let nextToken: string | undefined;
        do {
          const listResponse = await client.send(
            new ListEmailIdentitiesCommand({
              PageSize: 100,
              NextToken: nextToken,
            })
          );
          identities.push(...(listResponse.EmailIdentities ?? []));
          const returned = listResponse.NextToken;
          // SES returns a NextToken on the last non-empty page; a token that
          // does not advance is how this becomes an infinite loop.
          nextToken = returned && returned !== nextToken ? returned : undefined;
        } while (nextToken && identities.length < MAX_IDENTITIES);

        if (nextToken) {
          truncatedAccountIds.push(account.id);
          ctx.log.warn(
            { awsAccountId: account.id, identityCount: identities.length },
            "Stopped listing SES identities at MAX_IDENTITIES; some identities were not returned"
          );
        }

        const details = await Promise.all(
          identities.map(async (identity) => {
            try {
              const response = await client.send(
                new GetEmailIdentityCommand({
                  EmailIdentity: identity.IdentityName,
                })
              );
              const domain: SendingDomain = {
                identity: identity.IdentityName ?? "",
                identityType: response.IdentityType ?? null,
                verifiedForSending: response.VerifiedForSendingStatus ?? false,
                verificationStatus: response.VerificationStatus ?? null,
                dkim: response.DkimAttributes
                  ? {
                      status: response.DkimAttributes.Status ?? null,
                      tokens: response.DkimAttributes.Tokens ?? [],
                    }
                  : null,
                mailFromDomain: response.MailFromAttributes?.MailFromDomain
                  ? {
                      domain: response.MailFromAttributes.MailFromDomain,
                      status:
                        response.MailFromAttributes.MailFromDomainStatus ??
                        null,
                    }
                  : null,
                configurationSet: response.ConfigurationSetName ?? null,
                awsAccountId: account.id,
                region: account.region,
              };
              return domain;
            } catch (err) {
              ctx.log.warn(
                {
                  identity: identity.IdentityName,
                  awsAccountId: account.id,
                  err,
                },
                "Failed to get email identity detail; omitting from sending domains"
              );
              return null;
            }
          })
        );

        for (const detail of details) {
          if (detail) {
            domains.push(detail);
          }
        }
      } catch (error) {
        // A single unreachable account must not fail the whole request —
        // mark it and keep going. Any other error (network, throttling,
        // unknown) is rethrown so orgAction's catch-all surfaces it as a
        // generic failure.
        if (!isRoleAccessError(error)) {
          throw error;
        }
        unreachableAccountIds.push(account.id);
      }
    }

    return {
      success: true,
      domains,
      unreachableAccountIds,
      truncatedAccountIds,
    };
  }
);

export type ConfigurationSetDetail = {
  name: string;
  trackingRedirectDomain: string | null;
  trackingHttpsPolicy: "REQUIRE" | "REQUIRE_OPEN_ONLY" | "OPTIONAL" | null;
  tlsPolicy: string | null;
  sendingEnabled: boolean | null;
  reputationMetricsEnabled: boolean | null;
  suppressedReasons: string[];
  eventDestinations: Array<{
    name: string;
    enabled: boolean;
    matchingEventTypes: string[];
    /** Which AWS target it writes to — "EventBridge", "SNS", "CloudWatch", "Firehose", or "Unknown". */
    destinationType: string;
  }>;
};

export type GetConfigurationSetDetailResult =
  | { success: true; detail: ConfigurationSetDetail }
  | { success: false; error: string; unreachable: boolean };

/**
 * Maps an EventDestination's AWS target to a short, human label. Checked in
 * this order because a destination carries exactly one of these fields.
 */
function destinationTypeFor(destination: EventDestination): string {
  if (destination.EventBridgeDestination) {
    return "EventBridge";
  }
  if (destination.SnsDestination) {
    return "SNS";
  }
  if (destination.CloudWatchDestination) {
    return "CloudWatch";
  }
  if (destination.KinesisFirehoseDestination) {
    return "Firehose";
  }
  return "Unknown";
}

/**
 * Lazily fetches a single configuration set's tracking, TLS, reputation,
 * suppression and event-destination settings. Deliberately separate from
 * `listSendingDomains` — that action already issues one GetEmailIdentity per
 * identity on every page render, and adding two more SES calls per identity
 * here would triple the request count for a page most customers open to
 * check one domain. Called only when a domain's detail sheet opens.
 */
export const getConfigurationSetDetail = orgAction(
  {
    name: "getConfigurationSetDetail",
    resource: "awsAccounts",
    permission: ["read"],
    orgId: (
      organizationId: string,
      _awsAccountId: string,
      _configurationSetName: string
    ) => organizationId,
    onError: "Failed to load configuration set",
  },
  async (
    _ctx,
    organizationId: string,
    awsAccountId: string,
    configurationSetName: string
  ): Promise<GetConfigurationSetDetailResult> => {
    // Never look up an AWS account by id alone — scope to the caller's org.
    const account = await db.query.awsAccount.findFirst({
      where: and(
        eq(awsAccount.id, awsAccountId),
        eq(awsAccount.organizationId, organizationId)
      ),
    });
    if (!account) {
      return {
        success: false,
        error: "AWS account not found",
        unreachable: false,
      };
    }

    try {
      const credentials = await getOrAssumeRole({
        roleArn: account.roleArn,
        externalId: account.externalId,
      });

      const client = new SESv2Client({
        region: account.region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
        },
      });

      const csResponse = await client.send(
        new GetConfigurationSetCommand({
          ConfigurationSetName: configurationSetName,
        })
      );

      const eventDestResponse = await client.send(
        new GetConfigurationSetEventDestinationsCommand({
          ConfigurationSetName: configurationSetName,
        })
      );

      const detail: ConfigurationSetDetail = {
        name: configurationSetName,
        trackingRedirectDomain:
          csResponse.TrackingOptions?.CustomRedirectDomain ?? null,
        trackingHttpsPolicy: csResponse.TrackingOptions?.HttpsPolicy ?? null,
        tlsPolicy: csResponse.DeliveryOptions?.TlsPolicy ?? null,
        sendingEnabled: csResponse.SendingOptions?.SendingEnabled ?? null,
        reputationMetricsEnabled:
          csResponse.ReputationOptions?.ReputationMetricsEnabled ?? null,
        suppressedReasons: csResponse.SuppressionOptions?.SuppressedReasons
          ? [...csResponse.SuppressionOptions.SuppressedReasons]
          : [],
        eventDestinations: (eventDestResponse.EventDestinations ?? []).map(
          (destination) => ({
            name: destination.Name ?? "",
            enabled: destination.Enabled ?? false,
            matchingEventTypes: destination.MatchingEventTypes
              ? [...destination.MatchingEventTypes]
              : [],
            destinationType: destinationTypeFor(destination),
          })
        ),
      };

      return { success: true, detail };
    } catch (error) {
      if (isRoleAccessError(error)) {
        return {
          success: false,
          error:
            "This AWS account could not be read. Check its connection under AWS Accounts settings.",
          unreachable: true,
        };
      }
      if (
        error instanceof Error &&
        (error.name === "NotFoundException" ||
          error.message.includes("NotFoundException"))
      ) {
        return {
          success: false,
          error: `Configuration set "${configurationSetName}" no longer exists.`,
          unreachable: false,
        };
      }
      throw error;
    }
  }
);

export type ProbeTrackingDomainResult =
  | { success: true; trackingDomain: string; result: TrackingTlsResult }
  | { success: true; trackingDomain: null }
  | { success: false; error: string; unreachable: boolean };

/**
 * Tells the caller whether anything actually serves this configuration
 * set's tracking domain over valid TLS — see `probeTrackingTls` in
 * `@/lib/tracking-tls` for the mechanism and plan 302 for why it exists.
 *
 * Deliberately takes no hostname argument. A server action that probes a
 * client-supplied host turns the dashboard into an SSRF proxy for any
 * authenticated user, so the tracking domain is re-derived here from SES
 * itself — the same account/org-scoping this file already uses for every
 * other action — rather than trusted from the caller. Returns the
 * no-tracking-domain case without ever calling the probe.
 */
export const probeTrackingDomain = orgAction(
  {
    name: "probeTrackingDomain",
    resource: "awsAccounts",
    permission: ["read"],
    orgId: (
      organizationId: string,
      _awsAccountId: string,
      _configurationSetName: string
    ) => organizationId,
    onError: "Failed to check tracking domain",
  },
  async (
    _ctx,
    organizationId: string,
    awsAccountId: string,
    configurationSetName: string
  ): Promise<ProbeTrackingDomainResult> => {
    // Never look up an AWS account by id alone — scope to the caller's org.
    const account = await db.query.awsAccount.findFirst({
      where: and(
        eq(awsAccount.id, awsAccountId),
        eq(awsAccount.organizationId, organizationId)
      ),
    });
    if (!account) {
      return {
        success: false,
        error: "AWS account not found",
        unreachable: false,
      };
    }

    try {
      const credentials = await getOrAssumeRole({
        roleArn: account.roleArn,
        externalId: account.externalId,
      });

      const client = new SESv2Client({
        region: account.region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
        },
      });

      const csResponse = await client.send(
        new GetConfigurationSetCommand({
          ConfigurationSetName: configurationSetName,
        })
      );

      const trackingDomain = csResponse.TrackingOptions?.CustomRedirectDomain;
      if (!trackingDomain) {
        return { success: true, trackingDomain: null };
      }

      const result = await probeTrackingTls(trackingDomain);
      return { success: true, trackingDomain, result };
    } catch (error) {
      if (isRoleAccessError(error)) {
        return {
          success: false,
          error:
            "This AWS account could not be read. Check its connection under AWS Accounts settings.",
          unreachable: true,
        };
      }
      if (
        error instanceof Error &&
        (error.name === "NotFoundException" ||
          error.message.includes("NotFoundException"))
      ) {
        return {
          success: false,
          error: `Configuration set "${configurationSetName}" no longer exists.`,
          unreachable: false,
        };
      }
      throw error;
    }
  }
);

export type CheckDomainAuthResult =
  | { success: true; records: DomainAuthRecordState[]; checkedAt: string }
  | { success: false; error: string; unreachable: boolean };

/**
 * Resolves the live DNS for one sending identity, compares it against what
 * SES expects (`dnsRecordsFor`), and records the result so a record that was
 * verified and has since regressed shows up as drift.
 *
 * Like `probeTrackingDomain`, takes no hostname: the identity is confirmed to
 * exist in the caller's own AWS account via `GetEmailIdentity`, and every DNS
 * name probed is derived from that response, never from the caller. A lookup
 * that fails comes back as `unknown` and is never persisted.
 *
 * No audit log entry: this is a read-permission health observation, not a
 * mutation of customer-visible configuration.
 */
export const checkDomainAuth = orgAction(
  {
    name: "checkDomainAuth",
    resource: "awsAccounts",
    permission: ["read"],
    orgId: (organizationId: string, _awsAccountId: string, _identity: string) =>
      organizationId,
    onError: "Failed to check DNS records",
  },
  async (
    _ctx,
    organizationId: string,
    awsAccountId: string,
    identity: string
  ): Promise<CheckDomainAuthResult> => {
    // Never look up an AWS account by id alone — scope to the caller's org.
    const account = await db.query.awsAccount.findFirst({
      where: and(
        eq(awsAccount.id, awsAccountId),
        eq(awsAccount.organizationId, organizationId)
      ),
    });
    if (!account) {
      return {
        success: false,
        error: "AWS account not found",
        unreachable: false,
      };
    }

    try {
      const credentials = await getOrAssumeRole({
        roleArn: account.roleArn,
        externalId: account.externalId,
      });

      const client = new SESv2Client({
        region: account.region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
        },
      });

      const response = await client.send(
        new GetEmailIdentityCommand({ EmailIdentity: identity })
      );
      const sendingDomain: SendingDomain = {
        identity,
        identityType: response.IdentityType ?? null,
        verifiedForSending: response.VerifiedForSendingStatus ?? false,
        verificationStatus: response.VerificationStatus ?? null,
        dkim: response.DkimAttributes
          ? {
              status: response.DkimAttributes.Status ?? null,
              tokens: response.DkimAttributes.Tokens ?? [],
            }
          : null,
        mailFromDomain: response.MailFromAttributes?.MailFromDomain
          ? {
              domain: response.MailFromAttributes.MailFromDomain,
              status: response.MailFromAttributes.MailFromDomainStatus ?? null,
            }
          : null,
        configurationSet: response.ConfigurationSetName ?? null,
        awsAccountId: account.id,
        region: account.region,
      };

      const results = await checkDomainAuthRecords(sendingDomain, nodeDns);
      const records = await recordDomainAuthCheck({
        organizationId,
        awsAccountId: account.id,
        identity,
        observations: results.map((r) => ({
          recordKind: r.kind,
          recordName: r.name,
          status: r.status,
          found: r.found,
        })),
      });

      return { success: true, records, checkedAt: new Date().toISOString() };
    } catch (error) {
      if (isRoleAccessError(error)) {
        return {
          success: false,
          error:
            "This AWS account could not be read. Check its connection under AWS Accounts settings.",
          unreachable: true,
        };
      }
      if (
        error instanceof Error &&
        (error.name === "NotFoundException" ||
          error.message.includes("NotFoundException"))
      ) {
        return {
          success: false,
          error: `"${identity}" is no longer an identity in this AWS account.`,
          unreachable: false,
        };
      }
      throw error;
    }
  }
);

/**
 * Attaches the domain's config set to an identity that already existed, unless
 * it already has one. Returns whether a Wraps set ends up attached. Never
 * replaces a set the identity already has (it is the customer's resource).
 * An access-denied response means the role predates plan 376: no tracking.
 */
async function attachToExistingIdentity(
  client: SESv2Client,
  domain: string,
  configSetName: string
): Promise<boolean> {
  try {
    const existing = await client.send(
      new GetEmailIdentityCommand({ EmailIdentity: domain })
    );
    if (existing.ConfigurationSetName) {
      return existing.ConfigurationSetName.startsWith("wraps-email-");
    }
    await client.send(
      new PutEmailIdentityConfigurationSetAttributesCommand({
        EmailIdentity: domain,
        ConfigurationSetName: configSetName,
      })
    );
    return true;
  } catch (error) {
    if (isAccessDeniedError(error)) {
      return false;
    }
    throw error;
  }
}

export type AddSendingDomainResult =
  | {
      success: true;
      domain: string;
      alreadyExisted: boolean;
      trackingAttached: boolean;
    }
  | { success: false; error: string };

const WHITESPACE_RE = /\s/;

/**
 * Reject a value that is clearly not a domain (an email address, something
 * with whitespace, a URL scheme, or a path) without a full domain regex — SES
 * itself rejects a malformed identity with a clear error, and a too-strict
 * regex that refuses a legitimate domain is the worse failure.
 */
function invalidDomainReason(domain: string): string | null {
  if (domain.length === 0) {
    return "Enter a domain.";
  }
  if (domain.includes("@")) {
    return "Enter a domain, not an email address.";
  }
  if (WHITESPACE_RE.test(domain)) {
    return "A domain cannot contain spaces.";
  }
  if (domain.includes("://")) {
    return "Enter a domain, not a URL — leave off the https://.";
  }
  if (domain.includes("/")) {
    return "Enter a domain, not a path.";
  }
  return null;
}

export const addSendingDomain = orgAction(
  {
    name: "addSendingDomain",
    resource: "awsAccounts",
    permission: ["write"],
    orgId: (organizationId: string, _awsAccountId: string, _domain: string) =>
      organizationId,
    onError: "Failed to add sending domain",
  },
  async (
    ctx,
    organizationId: string,
    awsAccountId: string,
    rawDomain: string
  ): Promise<AddSendingDomainResult> => {
    // Never look up an AWS account by id alone — scope to the caller's org.
    const account = await db.query.awsAccount.findFirst({
      where: and(
        eq(awsAccount.id, awsAccountId),
        eq(awsAccount.organizationId, organizationId)
      ),
    });
    if (!account) {
      return { success: false, error: "AWS account not found" };
    }

    const domain = rawDomain.trim().toLowerCase();
    const invalidReason = invalidDomainReason(domain);
    if (invalidReason) {
      return { success: false, error: invalidReason };
    }

    const credentials = await getOrAssumeRole({
      roleArn: account.roleArn,
      externalId: account.externalId,
    });

    const client = new SESv2Client({
      region: account.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });

    const configSetName = domainToConfigSetName(domain);
    let canAttach = true;
    try {
      await ensureDomainConfigSet(client, {
        configSetName,
        region: account.region,
        awsAccountNumber: account.accountId,
      });
    } catch (error) {
      // A role that predates plan 376 cannot create config sets. Still add
      // the domain, just without tracking.
      if (!isAccessDeniedError(error)) {
        throw error;
      }
      canAttach = false;
    }

    try {
      // No DkimSigningAttributes: omitting it selects SES-managed Easy DKIM,
      // the same default the CloudFormation path produces. MAIL FROM is not
      // configured here — the console role has no permission to set MAIL FROM
      // attributes on an identity, and granting a write action nothing else
      // calls would widen the cross-account trust boundary for nothing.
      // `wraps email domains add` is the path that sets one up.
      await client.send(
        new CreateEmailIdentityCommand({
          EmailIdentity: domain,
          ...(canAttach ? { ConfigurationSetName: configSetName } : {}),
        })
      );
      revalidatePath(`/${ctx.access.orgSlug}/emails/domains`, "page");
      return {
        success: true,
        domain,
        alreadyExisted: false,
        trackingAttached: canAttach,
      };
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        const trackingAttached =
          canAttach &&
          (await attachToExistingIdentity(client, domain, configSetName));
        revalidatePath(`/${ctx.access.orgSlug}/emails/domains`, "page");
        return {
          success: true,
          domain,
          alreadyExisted: true,
          trackingAttached,
        };
      }
      if (isAccessDeniedError(error)) {
        // Verbatim copy of the string `mapCommonAwsError` returns for an
        // access-denied error, from `ses-onboarding.ts:93-104` — see the
        // comment on `isAccessDeniedError` above for why this is duplicated
        // rather than imported.
        return {
          success: false,
          error:
            "Wraps doesn't have permission to create email identities on this account. Run `wraps platform update-role` to refresh permissions.",
        };
      }
      throw error;
    }
  }
);

export type AttachDomainTrackingResult =
  | { success: true; configSetName: string }
  | { success: false; error: string };

export const attachDomainTracking = orgAction(
  {
    name: "attachDomainTracking",
    resource: "awsAccounts",
    permission: ["write"],
    orgId: (organizationId: string, _awsAccountId: string, _identity: string) =>
      organizationId,
    onError: "Failed to attach tracking",
  },
  async (
    ctx,
    organizationId: string,
    awsAccountId: string,
    identity: string
  ): Promise<AttachDomainTrackingResult> => {
    // Never look up an AWS account by id alone — scope to the caller's org.
    const account = await db.query.awsAccount.findFirst({
      where: and(
        eq(awsAccount.id, awsAccountId),
        eq(awsAccount.organizationId, organizationId)
      ),
    });
    if (!account) {
      return { success: false, error: "AWS account not found" };
    }

    const credentials = await getOrAssumeRole({
      roleArn: account.roleArn,
      externalId: account.externalId,
    });

    const client = new SESv2Client({
      region: account.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });

    const configSetName = domainToConfigSetName(identity);
    try {
      const existing = await client.send(
        new GetEmailIdentityCommand({ EmailIdentity: identity })
      );
      if (existing.ConfigurationSetName?.startsWith("wraps-email-")) {
        return { success: true, configSetName: existing.ConfigurationSetName };
      }
      if (existing.ConfigurationSetName) {
        return {
          success: false,
          error: `This domain already has a configuration set (${existing.ConfigurationSetName}). Wraps won't replace it.`,
        };
      }
      await ensureDomainConfigSet(client, {
        configSetName,
        region: account.region,
        awsAccountNumber: account.accountId,
      });
      await client.send(
        new PutEmailIdentityConfigurationSetAttributesCommand({
          EmailIdentity: identity,
          ConfigurationSetName: configSetName,
        })
      );
    } catch (error) {
      if (isAccessDeniedError(error)) {
        return {
          success: false,
          error:
            "Wraps' role in this AWS account predates domain tracking. Run `wraps platform update-role`, or update your CloudFormation stack, then try again.",
        };
      }
      throw error;
    }

    revalidatePath(`/${ctx.access.orgSlug}/emails/domains`, "page");
    return { success: true, configSetName };
  }
);
