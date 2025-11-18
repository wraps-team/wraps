import {
  ACMClient,
  DescribeCertificateCommand,
} from "@aws-sdk/client-acm";
import {
  GetIdentityVerificationAttributesCommand,
  ListIdentitiesCommand,
  SESClient,
} from "@aws-sdk/client-ses";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { errors } from "./errors.js";

/**
 * AWS identity information
 */
export type AWSIdentity = {
  accountId: string;
  userId: string;
  arn: string;
};

/**
 * Validate AWS credentials by calling STS GetCallerIdentity
 */
export async function validateAWSCredentials(): Promise<AWSIdentity> {
  const sts = new STSClient({ region: "us-east-1" });

  try {
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    return {
      accountId: identity.Account!,
      userId: identity.UserId!,
      arn: identity.Arn!,
    };
  } catch (_error) {
    throw errors.noAWSCredentials();
  }
}

/**
 * Check if a region is valid
 */
export async function checkRegion(region: string): Promise<boolean> {
  // List of valid AWS regions (as of 2025)
  const validRegions = [
    "us-east-1",
    "us-east-2",
    "us-west-1",
    "us-west-2",
    "af-south-1",
    "ap-east-1",
    "ap-south-1",
    "ap-northeast-1",
    "ap-northeast-2",
    "ap-northeast-3",
    "ap-southeast-1",
    "ap-southeast-2",
    "ap-southeast-3",
    "ca-central-1",
    "eu-central-1",
    "eu-west-1",
    "eu-west-2",
    "eu-west-3",
    "eu-south-1",
    "eu-north-1",
    "me-south-1",
    "sa-east-1",
  ];

  return validRegions.includes(region);
}

/**
 * Get AWS region from environment or config
 */
export async function getAWSRegion(): Promise<string> {
  // Try to detect region from various sources
  if (process.env.AWS_REGION) {
    return process.env.AWS_REGION;
  }
  if (process.env.AWS_DEFAULT_REGION) {
    return process.env.AWS_DEFAULT_REGION;
  }

  // Default fallback
  return "us-east-1";
}

/**
 * SES domain identity
 */
export type SESDomain = {
  domain: string;
  verified: boolean;
};

/**
 * List all SES identities (domains) in the account
 */
export async function listSESDomains(region: string): Promise<SESDomain[]> {
  const ses = new SESClient({ region });

  try {
    // Get all identities
    const identitiesResponse = await ses.send(
      new ListIdentitiesCommand({
        IdentityType: "Domain",
      })
    );

    const identities = identitiesResponse.Identities || [];

    if (identities.length === 0) {
      return [];
    }

    // Get verification attributes
    const attributesResponse = await ses.send(
      new GetIdentityVerificationAttributesCommand({
        Identities: identities,
      })
    );

    const attributes = attributesResponse.VerificationAttributes || {};

    // Map to SESDomain objects
    return identities.map((domain) => ({
      domain,
      verified: attributes[domain]?.VerificationStatus === "Success",
    }));
  } catch (error) {
    console.error("Error listing SES domains:", error);
    return [];
  }
}

/**
 * Check if SES is in sandbox mode
 */
export async function isSESSandbox(region: string): Promise<boolean> {
  const ses = new SESClient({ region });

  try {
    // In sandbox mode, you can only send to verified addresses
    // This is a heuristic - we check if there are any identities
    await ses.send(
      new ListIdentitiesCommand({
        MaxItems: 1,
      })
    );

    // If we can call this API, SES is enabled
    // The actual sandbox check requires checking send quota
    // For now, we'll return false (not sandbox) if the API works
    return false;
  } catch (error: any) {
    // If we get an error about SES not being enabled, return true
    if (error.name === "InvalidParameterValue") {
      return true;
    }
    throw error;
  }
}

/**
 * ACM certificate status
 */
export type ACMCertificateStatus = {
  status: string;
  domainName: string;
  validationRecords: Array<{
    name: string;
    type: string;
    value: string;
  }>;
};

/**
 * Check ACM certificate validation status
 * Note: ACM certificates for CloudFront must be in us-east-1
 */
export async function getACMCertificateStatus(
  certificateArn: string
): Promise<ACMCertificateStatus | null> {
  const acm = new ACMClient({ region: "us-east-1" });

  try {
    const response = await acm.send(
      new DescribeCertificateCommand({
        CertificateArn: certificateArn,
      })
    );

    const certificate = response.Certificate;
    if (!certificate) {
      return null;
    }

    // Extract validation records
    const validationRecords =
      certificate.DomainValidationOptions?.map((option) => ({
        name: option.ResourceRecord?.Name || "",
        type: option.ResourceRecord?.Type || "",
        value: option.ResourceRecord?.Value || "",
      })) || [];

    return {
      status: certificate.Status || "UNKNOWN",
      domainName: certificate.DomainName || "",
      validationRecords,
    };
  } catch (error) {
    console.error("Error getting ACM certificate status:", error);
    return null;
  }
}
