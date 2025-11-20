import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

// Types for AWS credentials - compatible with AWS SDK v3
type AwsCredentialIdentity = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
};

type AwsCredentialIdentityProvider = () => Promise<AwsCredentialIdentity>;

export type AssumeRoleParams = {
  roleArn: string;
  externalId: string;
  sessionName?: string;
};

export type AssumedRoleCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
};

/**
 * Parameters for getOrAssumeRole - used in dev mode when skipping role assumption
 */
export type GetOrAssumeRoleParams = {
  roleArn?: string;
  externalId?: string;
  region?: string;
  sessionName?: string;
};

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
  // 1. Vercel OIDC (AWS_ROLE_ARN) - uses @vercel/functions awsCredentialsProvider
  // 2. Explicit env vars (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
  // 3. AWS_PROFILE env var - used for local development
  // 4. Default credentials chain (EC2 instance metadata, etc.)

  const region = process.env.AWS_REGION || "us-east-1";
  const isUsingVercelOIDC = !!process.env.AWS_ROLE_ARN;

  let stsConfig: ConstructorParameters<typeof STSClient>[0];

  if (isUsingVercelOIDC) {
    // Use Vercel's OIDC credentials provider
    stsConfig = {
      region,
      credentials: awsCredentialsProvider({
        roleArn: process.env.AWS_ROLE_ARN!,
      }),
    };
  } else if (
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  ) {
    // Use explicit credentials (local development)
    stsConfig = {
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    };
  } else {
    // Use default credential provider chain (local development with AWS_PROFILE)
    stsConfig = { region };
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

/**
 * Gets ambient AWS credentials (for dev mode).
 * Returns a credential provider that resolves to the current AWS SDK credentials.
 *
 * Credential resolution order:
 * 1. Vercel OIDC (AWS_ROLE_ARN)
 * 2. Explicit env vars (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 * 3. AWS_PROFILE env var
 * 4. Default credentials chain
 */
async function getAmbientCredentials(
  region: string
): Promise<AwsCredentialIdentity> {
  const isUsingVercelOIDC = !!process.env.AWS_ROLE_ARN;

  let credentialProvider: AwsCredentialIdentityProvider;

  if (isUsingVercelOIDC) {
    // Use Vercel's OIDC credentials provider
    credentialProvider = awsCredentialsProvider({
      roleArn: process.env.AWS_ROLE_ARN!,
    });
  } else if (
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  ) {
    // Use explicit credentials
    const creds: AwsCredentialIdentity = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
    if (process.env.AWS_SESSION_TOKEN) {
      creds.sessionToken = process.env.AWS_SESSION_TOKEN;
    }
    return creds;
  } else {
    // Use default credential provider chain (AWS_PROFILE or instance metadata)
    // We need to create a temporary STS client to resolve the default credentials
    const sts = new STSClient({ region });
    const resolvedConfig = await sts.config.credentials();
    return resolvedConfig;
  }

  // Resolve the credential provider
  return await credentialProvider();
}

/**
 * Gets AWS credentials for accessing customer resources.
 *
 * In production (DEV_MODE_SKIP_ROLE_ASSUMPTION=false):
 * - Assumes the customer's IAM role using STS AssumeRole
 * - Returns temporary credentials with 1-hour expiration
 *
 * In development (DEV_MODE_SKIP_ROLE_ASSUMPTION=true):
 * - Skips role assumption
 * - Returns ambient credentials from AWS_PROFILE or environment
 * - Useful for local testing without setting up IAM role trust relationships
 *
 * @param params - Role ARN, external ID, region, and session name
 * @returns Credentials object compatible with AWS SDK clients
 */
export async function getCredentials(
  params: GetOrAssumeRoleParams
): Promise<AssumedRoleCredentials> {
  // Dev mode is enabled by setting DEV_MODE_SKIP_ROLE_ASSUMPTION=true
  // We don't check NODE_ENV because Next.js manages that automatically
  const isDev = process.env.DEV_MODE_SKIP_ROLE_ASSUMPTION === "true";

  const region = params.region || process.env.AWS_REGION || "us-east-1";

  if (isDev) {
    // Dev mode: use ambient credentials
    console.warn(
      "[DEV MODE] Skipping role assumption, using ambient AWS credentials"
    );

    if (process.env.AWS_PROFILE) {
      console.warn(`[DEV MODE] Using AWS_PROFILE: ${process.env.AWS_PROFILE}`);
    }

    const credentials = await getAmbientCredentials(region);

    // Return in AssumedRoleCredentials format
    // In dev mode, credentials don't expire (or use a far future date)
    return {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken || "",
      expiration: credentials.expiration || new Date(Date.now() + 3_600_000), // 1 hour from now
    };
  }

  // Production mode: assume the customer's IAM role
  if (!(params.roleArn && params.externalId)) {
    throw new Error("roleArn and externalId are required when not in dev mode");
  }

  return await assumeRole({
    roleArn: params.roleArn,
    externalId: params.externalId,
    sessionName: params.sessionName,
  });
}
