import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";

export interface AssumeRoleParams {
  roleArn: string;
  externalId: string;
  sessionName?: string;
}

export interface AssumedRoleCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

/**
 * Assumes an IAM role in a customer's AWS account using STS AssumeRole.
 * This is the core security mechanism for accessing customer AWS resources
 * without storing their credentials.
 *
 * @param params - Role ARN, external ID, and optional session name
 * @returns Temporary AWS credentials valid for 1 hour
 * @throws Error if role assumption fails
 */
export async function assumeRole(
  params: AssumeRoleParams
): Promise<AssumedRoleCredentials> {
  const { roleArn, externalId, sessionName = "wraps-console-session" } = params;

  // Create STS client using backend credentials
  // Credential resolution order:
  // 1. Explicit env vars (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
  // 2. Web Identity Token (OIDC) - used by Vercel via AWS_ROLE_ARN + AWS_WEB_IDENTITY_TOKEN_FILE
  // 3. AWS_PROFILE env var - used for local development
  // 4. Default credentials chain (EC2 instance metadata, etc.)
  const stsConfig: {
    region: string;
    credentials?: { accessKeyId: string; secretAccessKey: string };
  } = {
    region: process.env.AWS_REGION || "us-east-1",
  };

  // Only set explicit credentials if both env vars are present
  // Otherwise, AWS SDK will automatically handle OIDC, profiles, or instance credentials
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    stsConfig.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }

  const sts = new STSClient(stsConfig);

  // Assume the role with external ID for security
  const command = new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: sessionName,
    ExternalId: externalId,
    DurationSeconds: 3600, // 1 hour
  });

  try {
    const response = await sts.send(command);

    if (!response.Credentials) {
      throw new Error("Failed to assume role: No credentials returned");
    }

    if (
      !(
        response.Credentials.AccessKeyId &&
        response.Credentials.SecretAccessKey &&
        response.Credentials.SessionToken &&
        response.Credentials.Expiration
      )
    ) {
      throw new Error("Failed to assume role: Incomplete credentials returned");
    }

    return {
      accessKeyId: response.Credentials.AccessKeyId,
      secretAccessKey: response.Credentials.SecretAccessKey,
      sessionToken: response.Credentials.SessionToken,
      expiration: response.Credentials.Expiration,
    };
  } catch (error) {
    // Enhance error message for common failures
    if (error instanceof Error) {
      if (error.message.includes("AccessDenied")) {
        throw new Error(
          "Access denied when assuming role. Check that the IAM role trust policy allows your backend account and that the external ID matches."
        );
      }
      if (error.message.includes("InvalidClientTokenId")) {
        throw new Error(
          "Invalid AWS credentials. Check your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables."
        );
      }
      throw new Error(`Failed to assume role: ${error.message}`);
    }
    throw error;
  }
}
