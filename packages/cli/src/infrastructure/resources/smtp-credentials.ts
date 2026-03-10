import { createHmac } from "node:crypto";
import * as aws from "@pulumi/aws";
import type * as pulumi from "@pulumi/pulumi";
import { getDefaultRegion } from "../../constants.js";

/**
 * SMTP credentials configuration
 */
export type SMTPCredentialsConfig = {
  configSetName: string;
  region: string;
};

/**
 * SMTP credentials resources output
 */
export type SMTPCredentialsResources = {
  iamUser: aws.iam.User;
  accessKey: aws.iam.AccessKey;
  smtpPassword: pulumi.Output<string>;
};

/**
 * Convert AWS IAM secret access key to SES SMTP password.
 *
 * AWS SES uses a specific algorithm to derive SMTP passwords from IAM credentials.
 * @see https://docs.aws.amazon.com/ses/latest/dg/smtp-credentials.html
 *
 * @param secretAccessKey - The IAM secret access key
 * @param region - The AWS region (e.g., "us-east-1")
 * @returns The derived SMTP password (base64 encoded)
 */
export function convertToSMTPPassword(
  secretAccessKey: string,
  region: string
): string {
  // AWS SMTP password derivation constants
  const DATE = "11111111";
  const SERVICE = "ses";
  const MESSAGE = "SendRawEmail";
  const TERMINAL = "aws4_request";
  const VERSION = 0x04;

  // Step 1: Create signing key using HMAC-SHA256 chain
  const kDate = createHmac("sha256", `AWS4${secretAccessKey}`)
    .update(DATE)
    .digest();
  const kRegion = createHmac("sha256", kDate).update(region).digest();
  const kService = createHmac("sha256", kRegion).update(SERVICE).digest();
  const kTerminal = createHmac("sha256", kService).update(TERMINAL).digest();
  const kMessage = createHmac("sha256", kTerminal).update(MESSAGE).digest();

  // Step 2: Prepend version byte and base64 encode
  const signatureWithVersion = Buffer.concat([
    Buffer.from([VERSION]),
    kMessage,
  ]);
  return signatureWithVersion.toString("base64");
}

/**
 * Check if IAM user exists
 */
async function userExists(userName: string): Promise<boolean> {
  try {
    const { IAMClient, GetUserCommand } = await import("@aws-sdk/client-iam");
    const iam = new IAMClient({
      region: getDefaultRegion(),
    });
    await iam.send(new GetUserCommand({ UserName: userName }));
    return true;
  } catch (error) {
    const iamError = error as Error & { Code?: string };
    if (
      error instanceof Error &&
      (iamError.name === "NoSuchEntityException" ||
        iamError.Code === "NoSuchEntity")
    ) {
      return false;
    }
    return false;
  }
}

/**
 * Create SMTP credentials resources.
 *
 * Creates an IAM user with ses:SendRawEmail permission scoped to the
 * specified SES configuration set, along with access keys that are
 * converted to SMTP credentials.
 *
 * @param config - The SMTP credentials configuration
 * @returns The created resources including the derived SMTP password
 */
export async function createSMTPCredentials(
  config: SMTPCredentialsConfig
): Promise<SMTPCredentialsResources> {
  const userName = "wraps-email-smtp-user";

  // Check if user already exists (for import)
  const userAlreadyExists = await userExists(userName);

  // Create or import IAM user for SMTP authentication
  const iamUser = userAlreadyExists
    ? new aws.iam.User(
        userName,
        {
          name: userName,
          tags: {
            ManagedBy: "wraps-cli",
            Service: "email",
            Purpose: "SES SMTP Authentication",
          },
        },
        { import: userName }
      )
    : new aws.iam.User(userName, {
        name: userName,
        tags: {
          ManagedBy: "wraps-cli",
          Purpose: "SES SMTP Authentication",
        },
      });

  // Attach SES send policy scoped to configuration set
  new aws.iam.UserPolicy("wraps-email-smtp-policy", {
    user: iamUser.name,
    policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "ses:SendRawEmail",
          Resource: "*",
          Condition: {
            StringEquals: {
              "ses:ConfigurationSetName": config.configSetName,
            },
          },
        },
      ],
    }),
  });

  // Create access key for the IAM user
  const accessKey = new aws.iam.AccessKey("wraps-email-smtp-key", {
    user: iamUser.name,
  });

  // Convert the secret access key to SMTP password
  const smtpPassword = accessKey.secret.apply((secret) =>
    convertToSMTPPassword(secret, config.region)
  );

  return {
    iamUser,
    accessKey,
    smtpPassword,
  };
}

/**
 * Delete SMTP credentials (IAM user and access keys).
 *
 * This is used when disabling SMTP credentials via the upgrade command.
 * Note: Pulumi will handle the actual deletion when the resources are
 * removed from the stack - this function just provides the resource names
 * for reference.
 */
export function getSMTPResourceNames(): { userName: string } {
  return {
    userName: "wraps-email-smtp-user",
  };
}
