import { SESClient } from "@aws-sdk/client-ses";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { WrapsEmail } from "@wraps.dev/email";

// Validate WRAPS_EMAIL_ROLE_ARN is properly set
if (!process.env.WRAPS_EMAIL_ROLE_ARN) {
  throw new Error(
    "WRAPS_EMAIL_ROLE_ARN environment variable is required. " +
      "This should be the IAM role ARN created by 'wraps init' in your dogfood AWS account " +
      "(e.g., arn:aws:iam::123456789012:role/wraps-email-role)"
  );
}

// Validate ARN format
const roleArnPattern = /^arn:aws:iam::\d{12}:role\/.+$/;
if (!roleArnPattern.test(process.env.WRAPS_EMAIL_ROLE_ARN)) {
  throw new Error(
    `Invalid WRAPS_EMAIL_ROLE_ARN format: "${process.env.WRAPS_EMAIL_ROLE_ARN}". ` +
      "Expected format: arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME"
  );
}

/**
 * Create SES client with two-step role assumption for dogfooding:
 * 1. Vercel OIDC -> AWS_ROLE_ARN (backend account role)
 * 2. Backend role -> WRAPS_EMAIL_ROLE_ARN (dogfood account email role)
 *
 * This allows apps/web (running in backend account) to send emails
 * through the dogfood account's Wraps infrastructure.
 */
async function createDogfoodSESClient(): Promise<SESClient> {
  const region = process.env.AWS_REGION || "us-east-1";

  // Step 1: Get base credentials from Vercel OIDC (assumes AWS_ROLE_ARN in backend account)
  const baseCredentials = process.env.AWS_ROLE_ARN
    ? awsCredentialsProvider({
        roleArn: process.env.AWS_ROLE_ARN,
      })
    : undefined;

  // Step 2: Use backend account credentials to assume email role in dogfood account
  const stsClient = new STSClient({
    region,
    credentials: baseCredentials,
  });

  const assumeRoleResponse = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: process.env.WRAPS_EMAIL_ROLE_ARN,
      RoleSessionName: "wraps-dogfood-email-session",
      DurationSeconds: 3600,
    })
  );

  if (!assumeRoleResponse.Credentials) {
    throw new Error(
      "Failed to assume dogfood email role: No credentials returned"
    );
  }

  // Step 3: Create SES client with dogfood account credentials
  return new SESClient({
    region,
    credentials: {
      accessKeyId: assumeRoleResponse.Credentials.AccessKeyId!,
      secretAccessKey: assumeRoleResponse.Credentials.SecretAccessKey!,
      sessionToken: assumeRoleResponse.Credentials.SessionToken!,
    },
  });
}

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Send an email using the Wraps Email SDK
 *
 * This is the core email sending function that all other email functions use.
 * It demonstrates proper usage of @wraps.dev/email with custom SES client configuration.
 *
 * @example
 * ```ts
 * await sendEmail({
 *   to: "user@example.com",
 *   subject: "Welcome!",
 *   html: "<h1>Hello!</h1>",
 *   text: "Hello!"
 * });
 * ```
 */
export async function sendEmail({ to, subject, html, text }: SendEmailParams) {
  const from = process.env.EMAIL_FROM || "noreply@wraps.dev";

  // Create Wraps SDK instance with custom dogfood SES client
  const sesClient = await createDogfoodSESClient();
  const wraps = new WrapsEmail({ client: sesClient });

  // Send email using Wraps SDK
  const result = await wraps.send({
    from,
    to,
    subject,
    html,
    text,
  });

  return {
    success: true,
    messageId: result.messageId,
  };
}
