import { SESClient } from "@aws-sdk/client-ses";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { WrapsEmail } from "@wraps.dev/email";

const ROLE_SESSION_NAME = "wraps-email-session";

/**
 * Create SES client for production (Vercel):
 * Uses Vercel OIDC to assume the email role directly.
 * The dogfood account's wraps-email-role trusts the Vercel OIDC provider
 * via AssumeRoleWithWebIdentity — no intermediary backend role needed.
 */
function createProductionSESClient(roleArn: string): SESClient {
  const region = process.env.AWS_REGION || "us-east-1";

  return new SESClient({
    region,
    credentials: awsCredentialsProvider({ roleArn }),
  });
}

/**
 * Create SES client for callers that already hold AWS credentials — a Lambda
 * execution role, an ECS task role, or a developer's profile — and need to
 * assume the email role from them via plain sts:AssumeRole.
 *
 * The SDK's own `roleArn` option cannot serve these: off Vercel it resolves
 * credentials with `fromTokenFile`, which requires AWS_WEB_IDENTITY_TOKEN_FILE
 * and throws "Web identity configuration not specified" without it.
 */
function createAssumedRoleSESClient(roleArn: string): SESClient {
  const region = process.env.AWS_REGION || "us-east-1";

  return new SESClient({
    region,
    credentials: fromTemporaryCredentials({
      params: { RoleArn: roleArn, RoleSessionName: ROLE_SESSION_NAME },
      clientConfig: { region },
    }),
  });
}

/**
 * Get a properly configured WrapsEmail client instance
 *
 * Credentials are chosen by how the caller can prove its identity to STS:
 *   - Vercel: OIDC web-identity exchange for the email role.
 *   - A projected web identity token file (EKS, GitHub Actions): the SDK's
 *     own roleArn path exchanges it.
 *   - Anything else holding credentials (Lambda, ECS, a dev profile):
 *     sts:AssumeRole from the ambient chain.
 *   - No role configured: the standard AWS credential chain.
 *
 * @example
 * ```ts
 * const wraps = await getWrapsClient();
 * await wraps.send({ from, to, subject, html, text });
 * await wraps.sendTemplate({ from, to, template, templateData });
 * ```
 */
export async function getWrapsClient(): Promise<WrapsEmail> {
  const region = process.env.AWS_REGION || "us-east-1";
  const roleArn = process.env.WRAPS_EMAIL_ROLE_ARN;

  if (!roleArn) {
    return new WrapsEmail({ region });
  }

  if (process.env.VERCEL === "1") {
    return new WrapsEmail({ client: createProductionSESClient(roleArn) });
  }

  if (process.env.AWS_WEB_IDENTITY_TOKEN_FILE) {
    return new WrapsEmail({ region, roleArn });
  }

  return new WrapsEmail({ client: createAssumedRoleSESClient(roleArn) });
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
 * In production: Uses Vercel OIDC to assume the email role directly
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
  const from = process.env.EMAIL_FROM || "Wraps <hello@wraps.dev>";

  const wraps = await getWrapsClient();

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
