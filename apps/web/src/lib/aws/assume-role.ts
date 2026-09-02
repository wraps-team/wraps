import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { logger } from "@/lib/logger";

export type AssumeRoleErrorCode =
  | "ACCESS_DENIED"
  | "INVALID_TRUST_POLICY"
  | "INVALID_BACKEND_CREDENTIALS"
  | "UNKNOWN";

export class AssumeRoleError extends Error {
  code: AssumeRoleErrorCode;
  constructor(code: AssumeRoleErrorCode, message: string) {
    super(message);
    this.name = "AssumeRoleError";
    this.code = code;
  }
}

// Classify on BOTH name and message — AWS SDK v3 error `name` is unreliable
// (it sometimes arrives as "Error" with the real code only in `.message`).
// Exported so unit tests can exercise it directly.
export function classifyAssumeRoleError(error: unknown): AssumeRoleErrorCode {
  if (!(error instanceof Error)) {
    return "UNKNOWN";
  }
  const name = error.name;
  const msg = error.message || "";
  if (name === "InvalidClientTokenId" || msg.includes("InvalidClientTokenId")) {
    return "INVALID_BACKEND_CREDENTIALS";
  }
  if (
    msg.includes("is not authorized to perform") ||
    msg.includes("not authorized to perform")
  ) {
    return "INVALID_TRUST_POLICY";
  }
  if (
    name === "AccessDenied" ||
    name === "AccessDeniedException" ||
    msg.includes("AccessDenied")
  ) {
    return "ACCESS_DENIED";
  }
  return "UNKNOWN";
}

/**
 * True when a failure means the customer's IAM role is unusable — a broken
 * trust policy, a mismatched External ID, or a role missing the permission.
 * These are customer-side misconfigurations: surface a remediation in the UI
 * rather than reporting them to Sentry as Wraps defects.
 *
 * `assumeRole` replaces the underlying AWS message with its own copy, so the
 * structured `code` is the only reliable signal for an assume-role failure —
 * matching on `.message` silently misses every one of them.
 */
export function isCustomerRoleAccessError(error: unknown): boolean {
  if (error instanceof AssumeRoleError) {
    return (
      error.code === "ACCESS_DENIED" || error.code === "INVALID_TRUST_POLICY"
    );
  }
  if (!(error instanceof Error)) {
    return false;
  }
  // A call made with successfully assumed credentials still carries the raw
  // AWS SDK error, where `name` is unreliable and `message` holds the signal.
  return (
    error.name === "AccessDeniedException" ||
    error.message.includes("is not authorized to perform")
  );
}

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
    const roleArn = process.env.AWS_ROLE_ARN;
    if (!roleArn) {
      throw new Error(
        "AWS_ROLE_ARN environment variable is required for Vercel OIDC credentials"
      );
    }
    // Use Vercel's OIDC credentials provider
    stsConfig = {
      region,
      credentials: awsCredentialsProvider({
        roleArn,
      }),
    };
  } else if (
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  ) {
    stsConfig = {
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        // AWS_SESSION_TOKEN is required for Lambda/STS temporary credentials
        ...(process.env.AWS_SESSION_TOKEN && {
          sessionToken: process.env.AWS_SESSION_TOKEN,
        }),
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
    const code = classifyAssumeRoleError(error);
    const original = error instanceof Error ? error.message : String(error);
    const message =
      code === "ACCESS_DENIED" || code === "INVALID_TRUST_POLICY"
        ? "Wraps could not assume the IAM role. Check that the CloudFormation stack deployed successfully and that the External ID matches the stack output."
        : code === "INVALID_BACKEND_CREDENTIALS"
          ? "Wraps could not authenticate to AWS to validate your connection. This is a Wraps-side issue — please try again shortly."
          : `Failed to assume role: ${original}`;
    throw new AssumeRoleError(code, message);
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
    const roleArn = process.env.AWS_ROLE_ARN;
    if (!roleArn) {
      throw new Error(
        "AWS_ROLE_ARN environment variable is required for Vercel OIDC credentials"
      );
    }
    // Use Vercel's OIDC credentials provider
    credentialProvider = awsCredentialsProvider({
      roleArn,
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
    logger.warn("Skipping role assumption, using ambient AWS credentials");

    if (process.env.AWS_PROFILE) {
      logger.warn({ profile: process.env.AWS_PROFILE }, "Using AWS_PROFILE");
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
