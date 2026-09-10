"use server";

import {
  GetEmailIdentityCommand,
  ListEmailIdentitiesCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { awsAccount, db, eq } from "@wraps/db";
import { getOrAssumeRole } from "@/lib/aws/credential-cache";
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
  | { success: true; domains: SendingDomain[]; unreachableAccountIds: string[] }
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

        const listResponse = await client.send(
          new ListEmailIdentitiesCommand({ PageSize: 100 })
        );
        const identities = listResponse.EmailIdentities ?? [];

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

    return { success: true, domains, unreachableAccountIds };
  }
);
