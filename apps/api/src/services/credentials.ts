/**
 * AWS Credentials Service
 *
 * Uses STS AssumeRole to get temporary credentials for customer AWS accounts.
 * Reuses credential patterns from apps/web.
 */

import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { db, awsAccount, eq } from "@wraps/db";

const stsClient = new STSClient({});

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

// Cache credentials by account ID
const credentialCache = new Map<
  string,
  { credentials: AwsCredentials; expiresAt: number }
>();

export async function getCredentials(
  awsAccountId: string
): Promise<AwsCredentials> {
  // Check cache first
  const cached = credentialCache.get(awsAccountId);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    // 1 minute buffer
    return cached.credentials;
  }

  // Look up AWS account to get role ARN
  const [account] = await db
    .select({
      roleArn: awsAccount.roleArn,
      externalId: awsAccount.externalId,
    })
    .from(awsAccount)
    .where(eq(awsAccount.id, awsAccountId))
    .limit(1);

  if (!account?.roleArn) {
    throw new Error(`AWS account ${awsAccountId} not found or not configured`);
  }

  // Assume role
  const result = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: account.roleArn,
      RoleSessionName: `wraps-api-${Date.now()}`,
      ExternalId: account.externalId ?? undefined,
      DurationSeconds: 3600, // 1 hour
    })
  );

  if (!result.Credentials) {
    throw new Error("Failed to assume role");
  }

  const credentials: AwsCredentials = {
    accessKeyId: result.Credentials.AccessKeyId!,
    secretAccessKey: result.Credentials.SecretAccessKey!,
    sessionToken: result.Credentials.SessionToken!,
    expiration: result.Credentials.Expiration!,
  };

  // Cache credentials
  credentialCache.set(awsAccountId, {
    credentials,
    expiresAt: credentials.expiration.getTime(),
  });

  return credentials;
}
