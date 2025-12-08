import { SESClient } from "@aws-sdk/client-ses";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { WrapsEmail } from "@wraps.dev/email";

/**
 * Create SES client with two-step role assumption for production (Vercel):
 * 1. Vercel OIDC -> AWS_ROLE_ARN (backend account role)
 * 2. Backend role -> WRAPS_EMAIL_ROLE_ARN (email infrastructure role)
 */
async function createProductionSESClient(): Promise<SESClient> {
  const region = process.env.AWS_REGION || "us-east-1";

  // Step 1: Get base credentials from Vercel OIDC
  const baseCredentials = awsCredentialsProvider({
    roleArn: process.env.AWS_ROLE_ARN!,
  });

  // Step 2: Assume email infrastructure role
  const stsClient = new STSClient({
    region,
    credentials: baseCredentials,
  });

  const assumeRoleResponse = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: process.env.WRAPS_EMAIL_ROLE_ARN!,
      RoleSessionName: "wraps-email-session",
      DurationSeconds: 3600,
    })
  );

  if (!assumeRoleResponse.Credentials) {
    throw new Error("Failed to assume email role: No credentials returned");
  }

  // Step 3: Create SES client with assumed credentials
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
 * In development: Uses standard AWS credential chain (env vars, profiles, etc.)
 * In production: Uses two-step OIDC role assumption for Vercel
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
  const region = process.env.AWS_REGION || "us-east-1";

  // Check if we're in production (Vercel) and need two-step role assumption
  const isProduction =
    process.env.VERCEL === "1" &&
    process.env.AWS_ROLE_ARN &&
    process.env.WRAPS_EMAIL_ROLE_ARN;

  // Create Wraps SDK instance
  const wraps = isProduction
    ? // Production: Use custom SES client with two-step role assumption
      new WrapsEmail({ client: await createProductionSESClient() })
    : // Development: Let SDK handle credentials (env vars, AWS profiles, etc.)
      new WrapsEmail({
        region,
        roleArn: process.env.WRAPS_EMAIL_ROLE_ARN,
      });

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
