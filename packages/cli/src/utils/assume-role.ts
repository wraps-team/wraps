import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";

/**
 * AWS credential identity type
 */
export type AwsCredentialIdentity = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
};

/**
 * Assume IAM role and return temporary credentials
 */
export async function assumeRole(
  roleArn: string,
  region: string,
  sessionName = "wraps-console"
): Promise<AwsCredentialIdentity> {
  const sts = new STSClient({ region });

  const response = await sts.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: sessionName,
      DurationSeconds: 3600, // 1 hour
    })
  );

  if (!response.Credentials) {
    throw new Error("Failed to assume role: No credentials returned");
  }

  return {
    accessKeyId: response.Credentials.AccessKeyId!,
    secretAccessKey: response.Credentials.SecretAccessKey!,
    sessionToken: response.Credentials.SessionToken!,
    expiration: response.Credentials.Expiration,
  };
}
