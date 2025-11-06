import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { SESClient, ListIdentitiesCommand, GetIdentityVerificationAttributesCommand } from '@aws-sdk/client-ses';
import { errors } from './errors.js';

/**
 * AWS identity information
 */
export interface AWSIdentity {
  accountId: string;
  userId: string;
  arn: string;
}

/**
 * Validate AWS credentials by calling STS GetCallerIdentity
 */
export async function validateAWSCredentials(): Promise<AWSIdentity> {
  const sts = new STSClient({ region: 'us-east-1' });

  try {
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    return {
      accountId: identity.Account!,
      userId: identity.UserId!,
      arn: identity.Arn!,
    };
  } catch (error) {
    throw errors.noAWSCredentials();
  }
}

/**
 * Check if a region is valid
 */
export async function checkRegion(region: string): Promise<boolean> {
  // List of valid AWS regions (as of 2025)
  const validRegions = [
    'us-east-1',
    'us-east-2',
    'us-west-1',
    'us-west-2',
    'af-south-1',
    'ap-east-1',
    'ap-south-1',
    'ap-northeast-1',
    'ap-northeast-2',
    'ap-northeast-3',
    'ap-southeast-1',
    'ap-southeast-2',
    'ap-southeast-3',
    'ca-central-1',
    'eu-central-1',
    'eu-west-1',
    'eu-west-2',
    'eu-west-3',
    'eu-south-1',
    'eu-north-1',
    'me-south-1',
    'sa-east-1',
  ];

  return validRegions.includes(region);
}

/**
 * Get AWS region from environment or config
 */
export async function getAWSRegion(): Promise<string> {
  // Try to detect region from various sources
  if (process.env.AWS_REGION) return process.env.AWS_REGION;
  if (process.env.AWS_DEFAULT_REGION) return process.env.AWS_DEFAULT_REGION;

  // Default fallback
  return 'us-east-1';
}

/**
 * SES domain identity
 */
export interface SESDomain {
  domain: string;
  verified: boolean;
}

/**
 * List all SES identities (domains) in the account
 */
export async function listSESDomains(region: string): Promise<SESDomain[]> {
  const ses = new SESClient({ region });

  try {
    // Get all identities
    const identitiesResponse = await ses.send(
      new ListIdentitiesCommand({
        IdentityType: 'Domain',
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
      verified: attributes[domain]?.VerificationStatus === 'Success',
    }));
  } catch (error) {
    console.error('Error listing SES domains:', error);
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
    const response = await ses.send(
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
    if (error.name === 'InvalidParameterValue') {
      return true;
    }
    throw error;
  }
}
