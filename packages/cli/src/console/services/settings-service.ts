import {
  GetConfigurationSetCommand,
  GetEmailIdentityCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { assumeRole } from "../../utils/assume-role.js";

export type EmailSettings = {
  configurationSet?: ConfigurationSetDetails;
  identity?: EmailIdentityDetails;
};

export type ConfigurationSetDetails = {
  name: string;
  trackingOptions?: {
    customRedirectDomain?: string;
    httpsPolicy?: "REQUIRE" | "OPTIONAL";
  };
  deliveryOptions?: {
    tlsPolicy?: "REQUIRE" | "OPTIONAL";
    sendingPoolName?: string;
  };
  reputationOptions?: {
    reputationMetricsEnabled: boolean;
    lastFreshStart?: Date;
  };
  sendingOptions?: {
    sendingEnabled: boolean;
  };
  suppressionOptions?: {
    suppressedReasons?: ("BOUNCE" | "COMPLAINT")[];
  };
};

export type EmailIdentityDetails = {
  identityType: "EMAIL_ADDRESS" | "DOMAIN";
  identityName: string;
  verificationStatus:
    | "PENDING"
    | "SUCCESS"
    | "FAILED"
    | "TEMPORARY_FAILURE"
    | "NOT_STARTED";
  dkimAttributes?: {
    status: "SUCCESS" | "PENDING" | "FAILED" | "NOT_STARTED";
    tokens?: string[];
    signingEnabled: boolean;
    signingKeyLength?: "RSA_1024_BIT" | "RSA_2048_BIT";
  };
  mailFromAttributes?: {
    mailFromDomain?: string;
    mailFromDomainStatus?: "PENDING" | "SUCCESS" | "FAILED";
    behaviorOnMxFailure?: "USE_DEFAULT_VALUE" | "REJECT_MESSAGE";
  };
  configurationSetName?: string;
  verifiedForSendingStatus: boolean;
  tags?: Record<string, string>;
};

/**
 * Fetch configuration set details
 */
export async function fetchConfigurationSet(
  roleArn: string | undefined,
  region: string,
  configSetName: string
): Promise<ConfigurationSetDetails> {
  const credentials = roleArn ? await assumeRole(roleArn, region) : undefined;
  const sesv2 = new SESv2Client({ region, credentials });

  const response = await sesv2.send(
    new GetConfigurationSetCommand({
      ConfigurationSetName: configSetName,
    })
  );

  return {
    name: configSetName,
    trackingOptions: response.TrackingOptions
      ? {
          customRedirectDomain: response.TrackingOptions.CustomRedirectDomain,
          httpsPolicy: response.TrackingOptions.HttpsPolicy as
            | "REQUIRE"
            | "OPTIONAL",
        }
      : undefined,
    deliveryOptions: response.DeliveryOptions
      ? {
          tlsPolicy: response.DeliveryOptions.TlsPolicy as
            | "REQUIRE"
            | "OPTIONAL",
          sendingPoolName: response.DeliveryOptions.SendingPoolName,
        }
      : undefined,
    reputationOptions: response.ReputationOptions
      ? {
          reputationMetricsEnabled:
            response.ReputationOptions.ReputationMetricsEnabled ?? false,
          lastFreshStart: response.ReputationOptions.LastFreshStart,
        }
      : undefined,
    sendingOptions: response.SendingOptions
      ? {
          sendingEnabled: response.SendingOptions.SendingEnabled ?? true,
        }
      : undefined,
    suppressionOptions: response.SuppressionOptions
      ? {
          suppressedReasons: response.SuppressionOptions.SuppressedReasons as
            | ("BOUNCE" | "COMPLAINT")[]
            | undefined,
        }
      : undefined,
  };
}

/**
 * Fetch email identity details
 */
export async function fetchEmailIdentity(
  roleArn: string | undefined,
  region: string,
  identityName: string
): Promise<EmailIdentityDetails> {
  const credentials = roleArn ? await assumeRole(roleArn, region) : undefined;
  const sesv2 = new SESv2Client({ region, credentials });

  const response = await sesv2.send(
    new GetEmailIdentityCommand({
      EmailIdentity: identityName,
    })
  );

  return {
    identityType: response.IdentityType as "EMAIL_ADDRESS" | "DOMAIN",
    identityName,
    verificationStatus:
      response.VerificationStatus as EmailIdentityDetails["verificationStatus"],
    dkimAttributes: response.DkimAttributes
      ? {
          status: response.DkimAttributes.Status as
            | "SUCCESS"
            | "PENDING"
            | "FAILED"
            | "NOT_STARTED",
          tokens: response.DkimAttributes.Tokens,
          signingEnabled: response.DkimAttributes.SigningEnabled ?? false,
          signingKeyLength: response.DkimAttributes
            .NextSigningKeyLength as EmailIdentityDetails["dkimAttributes"]["signingKeyLength"],
        }
      : undefined,
    mailFromAttributes: response.MailFromAttributes
      ? {
          mailFromDomain: response.MailFromAttributes.MailFromDomain,
          mailFromDomainStatus: response.MailFromAttributes
            .MailFromDomainStatus as EmailIdentityDetails["mailFromAttributes"]["mailFromDomainStatus"],
          behaviorOnMxFailure: response.MailFromAttributes
            .BehaviorOnMxFailure as EmailIdentityDetails["mailFromAttributes"]["behaviorOnMxFailure"],
        }
      : undefined,
    configurationSetName: response.ConfigurationSetName,
    verifiedForSendingStatus: response.VerifiedForSendingStatus ?? false,
    tags: response.Tags?.reduce(
      (acc, tag) => {
        if (tag.Key) acc[tag.Key] = tag.Value || "";
        return acc;
      },
      {} as Record<string, string>
    ),
  };
}

/**
 * Fetch complete email settings
 */
export async function fetchEmailSettings(
  roleArn: string | undefined,
  region: string,
  configSetName?: string,
  domain?: string
): Promise<EmailSettings> {
  const settings: EmailSettings = {};

  if (configSetName) {
    try {
      settings.configurationSet = await fetchConfigurationSet(
        roleArn,
        region,
        configSetName
      );
    } catch (error) {
      console.error("Failed to fetch configuration set:", error);
    }
  }

  if (domain) {
    try {
      settings.identity = await fetchEmailIdentity(roleArn, region, domain);
    } catch (error) {
      console.error("Failed to fetch email identity:", error);
    }
  }

  return settings;
}
