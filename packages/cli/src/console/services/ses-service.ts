import { GetSendQuotaCommand, SESClient } from "@aws-sdk/client-ses";
import { GetEmailIdentityCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { assumeRole } from "../../utils/assume-role.js";

export type SendQuota = {
  max24HourSend: number;
  maxSendRate: number;
  sentLast24Hours: number;
};

export type DomainInfo = {
  domain: string;
  verified: boolean;
  dkimStatus: string;
  dkimTokens: string[];
};

/**
 * Fetch SES send quota
 */
export async function fetchSendQuota(
  roleArn: string | undefined,
  region: string
): Promise<SendQuota> {
  // For console usage, use current credentials instead of assuming role
  const credentials = roleArn ? await assumeRole(roleArn, region) : undefined;
  const ses = new SESClient({ region, credentials });

  const response = await ses.send(new GetSendQuotaCommand({}));

  return {
    max24HourSend: response.Max24HourSend || 0,
    maxSendRate: response.MaxSendRate || 0,
    sentLast24Hours: response.SentLast24Hours || 0,
  };
}

/**
 * Fetch domain verification status
 */
export async function fetchDomainInfo(
  roleArn: string | undefined,
  region: string,
  domain: string
): Promise<DomainInfo> {
  // For console usage, use current credentials instead of assuming role
  const credentials = roleArn ? await assumeRole(roleArn, region) : undefined;
  const sesv2 = new SESv2Client({ region, credentials });

  const response = await sesv2.send(
    new GetEmailIdentityCommand({
      EmailIdentity: domain,
    })
  );

  return {
    domain,
    verified: response.VerifiedForSendingStatus ?? false,
    dkimStatus: response.DkimAttributes?.Status || "PENDING",
    dkimTokens: response.DkimAttributes?.Tokens || [],
  };
}
