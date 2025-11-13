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

  // Validate environment variables
  if (!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)) {
    throw new Error(
      "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set in environment variables"
    );
  }

  // Create STS client using backend credentials
  const sts = new STSClient({
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

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
