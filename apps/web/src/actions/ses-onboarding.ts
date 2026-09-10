"use server";

import {
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { awsAccount, db, organizationExtension } from "@wraps/db";
import { resolveConfigurationSetName, sendEmail } from "@wraps/email-send";
import { eq } from "drizzle-orm";
import { trackFirstEmailSent } from "@/lib/activation-tracking";
import { AssumeRoleError } from "@/lib/aws/assume-role";
import { getOrAssumeRole } from "@/lib/aws/credential-cache";
import { orgAction } from "./shared/org-action";

// Mirrors SES_SIMULATOR_ADDRESSES.SUCCESS in
// packages/cli/src/utils/email/ses-simulator.ts. AWS pre-verifies this
// address, so it is deliverable from a sandbox account with no recipient
// verification.
const SES_SIMULATOR_SUCCESS = "success@simulator.amazonses.com";

type AwsAccountRow = typeof awsAccount.$inferSelect;

async function sesClientForOrg(organizationId: string): Promise<{
  account: AwsAccountRow;
  client: SESv2Client;
} | null> {
  const account = await db.query.awsAccount.findFirst({
    where: eq(awsAccount.organizationId, organizationId),
  });
  if (!account) {
    return null;
  }

  const credentials = await getOrAssumeRole({
    roleArn: account.roleArn,
    externalId: account.externalId,
    region: account.region,
  });

  return {
    account,
    client: new SESv2Client({
      region: account.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    }),
  };
}

/** True when an AWS SDK v3 error is a "not found" for the identity lookup. */
function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "NotFoundException" ||
    error.message.includes("NotFoundException")
  );
}

/** True when an AWS SDK v3 error is an access-denied response. */
function isAccessDeniedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "AccessDeniedException" ||
    error.message.includes("AccessDeniedException")
  );
}

/** True when SES rejected the send/verification because of the recipient/sender. */
function isMessageRejectedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "MessageRejected" ||
    error.message.includes("MessageRejected")
  );
}

/**
 * Map the AWS SDK v3 error shapes shared by every SES call in this file
 * (access denied, failed assume-role) to a user-facing message. Returns
 * `null` when the error is something else — the caller should check its
 * own specific cases first, then fall back to this, then rethrow on `null`.
 */
function mapCommonAwsError(
  error: unknown,
  permissionAction: string
): string | null {
  if (isAccessDeniedError(error)) {
    return `Wraps doesn't have permission to ${permissionAction} on this account. Run \`wraps platform update-role\` to refresh permissions.`;
  }
  if (error instanceof AssumeRoleError) {
    return error.message;
  }
  return null;
}

/** Maps errors from an SES send attempt (simulator or welcome test). */
function mapSendEmailError(
  error: unknown,
  rejectedMessage: string
): string | null {
  if (isMessageRejectedError(error)) {
    return rejectedMessage;
  }
  if (
    error instanceof Error &&
    (error.name === "NotFoundException" ||
      error.message.includes("Configuration set"))
  ) {
    return "Your tracking configuration set is missing. Run a feature scan and try again.";
  }
  return mapCommonAwsError(error, "send from this account");
}

function verifiedDomainsOf(account: AwsAccountRow): string[] {
  return (account.features?.email?.identities ?? [])
    .filter((identity) => identity.type === "DOMAIN")
    .map((identity) => identity.identity);
}

type ResolvedSender = { senderEmail: string } | { error: string };

/**
 * Resolve the FROM address for a test send: the org's configured default
 * sender, else a wraps-test@ address on the first verified domain. Both
 * simulator and welcome sends need a verified sender identity even though
 * the simulator recipient itself needs no verification.
 */
async function resolveDefaultSender(
  organizationId: string,
  account: AwsAccountRow
): Promise<ResolvedSender> {
  const orgExtension = await db.query.organizationExtension.findFirst({
    where: eq(organizationExtension.organizationId, organizationId),
  });

  if (orgExtension?.defaultFrom) {
    return { senderEmail: orgExtension.defaultFrom };
  }

  const [firstVerifiedDomain] = verifiedDomainsOf(account);
  if (firstVerifiedDomain) {
    return { senderEmail: `wraps-test@${firstVerifiedDomain}` };
  }

  return {
    error:
      "Verify a domain or configure a sender in Settings > Sender Defaults first.",
  };
}

function resolveConfigSetFor(
  account: AwsAccountRow,
  senderEmail: string
): string {
  return resolveConfigurationSetName({
    fromDomain: senderEmail.split("@").at(-1),
    storedConfigSetName: account.features?.email?.configSetName,
    identities: account.features?.email?.identities,
  });
}

type VerificationCheck =
  | { status: "verified" }
  | { status: "not-verified" }
  | { status: "error"; error: string };

/**
 * Check whether `email` is currently a verified-for-sending SES identity.
 * Shared by the status check, the verify-start flow (skip if already
 * verified), and the welcome-send sender fallback.
 */
async function checkIdentityVerified(
  client: SESv2Client,
  email: string
): Promise<VerificationCheck> {
  try {
    const existing = await client.send(
      new GetEmailIdentityCommand({ EmailIdentity: email })
    );
    return existing.VerifiedForSendingStatus
      ? { status: "verified" }
      : { status: "not-verified" };
  } catch (error) {
    if (isNotFoundError(error)) {
      return { status: "not-verified" };
    }
    const mapped = mapCommonAwsError(error, "check SES identities");
    if (mapped) {
      return { status: "error", error: mapped };
    }
    throw error;
  }
}

export type GetOwnEmailVerificationStatusResult =
  | { success: true; verified: boolean }
  | { success: false; error: string };

/**
 * Check whether the authenticated user's own email address is a verified SES
 * identity on the org's connected AWS account. This is the ONLY reliable
 * verification signal — a self-verified email identity has no Wraps config
 * set, so `features.email.identities` (populated by the feature scan) will
 * never list it.
 */
export const getOwnEmailVerificationStatus = orgAction(
  {
    name: "getOwnEmailVerificationStatus",
    resource: "awsAccounts",
    permission: ["read"],
    orgId: (organizationId: string) => organizationId,
    onError: "Failed to check email verification status",
  },
  async (
    ctx,
    organizationId: string
  ): Promise<GetOwnEmailVerificationStatusResult> => {
    const sesConn = await sesClientForOrg(organizationId);
    if (!sesConn) {
      return { success: false, error: "No AWS account connected" };
    }

    const check = await checkIdentityVerified(
      sesConn.client,
      ctx.access.userEmail
    );
    if (check.status === "error") {
      return { success: false, error: check.error };
    }
    return { success: true, verified: check.status === "verified" };
  }
);

export type VerifyOwnEmailIdentityResult =
  | { success: true; alreadyVerified: boolean; email: string }
  | { success: false; error: string };

/**
 * Start SES verification for the authenticated user's own email address.
 * AWS emails a verification link to that address; the identity stays
 * unverified until the user clicks it.
 */
export const verifyOwnEmailIdentity = orgAction(
  {
    name: "verifyOwnEmailIdentity",
    resource: "awsAccounts",
    permission: ["write"],
    orgId: (organizationId: string) => organizationId,
    onError: "Failed to start email verification",
  },
  async (
    ctx,
    organizationId: string
  ): Promise<VerifyOwnEmailIdentityResult> => {
    const sesConn = await sesClientForOrg(organizationId);
    if (!sesConn) {
      return { success: false, error: "No AWS account connected" };
    }

    const check = await checkIdentityVerified(
      sesConn.client,
      ctx.access.userEmail
    );
    if (check.status === "error") {
      return { success: false, error: check.error };
    }
    if (check.status === "verified") {
      return {
        success: true,
        alreadyVerified: true,
        email: ctx.access.userEmail,
      };
    }

    try {
      await sesConn.client.send(
        new CreateEmailIdentityCommand({ EmailIdentity: ctx.access.userEmail })
      );
      return {
        success: true,
        alreadyVerified: false,
        email: ctx.access.userEmail,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AlreadyExistsException") {
        // AWS re-sends the verification mail when this is called again.
        return {
          success: true,
          alreadyVerified: false,
          email: ctx.access.userEmail,
        };
      }
      const mapped = mapCommonAwsError(error, "verify identities");
      if (mapped) {
        return { success: false, error: mapped };
      }
      throw error;
    }
  }
);

export type SendSimulatorTestEmailResult =
  | { success: true; messageId: string }
  | { success: false; error: string };

/**
 * Send a test email to the SES mailbox simulator's success address. AWS
 * pre-verifies this address, so it is deliverable from a sandbox account
 * with zero recipient verification — this is the primary, zero-friction
 * activation aha for the dashboard.
 */
export const sendSimulatorTestEmail = orgAction(
  {
    name: "sendSimulatorTestEmail",
    resource: "broadcasts",
    permission: ["send"],
    orgId: (organizationId: string) => organizationId,
    onError: "Failed to send the test email",
  },
  async (
    ctx,
    organizationId: string
  ): Promise<SendSimulatorTestEmailResult> => {
    const sesConn = await sesClientForOrg(organizationId);
    if (!sesConn) {
      return { success: false, error: "No AWS account connected" };
    }
    const { account, client } = sesConn;

    const sender = await resolveDefaultSender(organizationId, account);
    if ("error" in sender) {
      return { success: false, error: sender.error };
    }

    const configurationSetName = resolveConfigSetFor(
      account,
      sender.senderEmail
    );

    try {
      const result = await sendEmail({
        client,
        from: sender.senderEmail,
        to: SES_SIMULATOR_SUCCESS,
        subject: "Your Wraps test email",
        html: "<p>This is a test email sent through your Wraps infrastructure. It worked!</p>",
        text: "This is a test email sent through your Wraps infrastructure. It worked!",
        configurationSetName,
        tags: [
          { name: "source", value: "simulator_test" },
          { name: "organizationId", value: organizationId },
        ],
      });

      await trackFirstEmailSent(ctx.access.userId, organizationId, {
        channel: "email",
        source: "simulator_test",
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      const mapped = mapSendEmailError(
        error,
        "Your sender domain isn't verified yet. DNS changes can take up to 48 hours to propagate — check back soon."
      );
      if (mapped) {
        return { success: false, error: mapped };
      }
      throw error;
    }
  }
);

export type SendWelcomeTestEmailResult =
  | { success: true; messageId: string }
  | { success: false; error: string };

/**
 * Resolve the sender for the welcome (real-inbox) send: the org default
 * sender first, else fall back to the user's own email if it is itself a
 * verified SES identity — a verified identity is valid as both sender and
 * recipient in sandbox.
 */
async function resolveWelcomeSender(
  client: SESv2Client,
  organizationId: string,
  account: AwsAccountRow,
  userEmail: string
): Promise<ResolvedSender> {
  const defaultSender = await resolveDefaultSender(organizationId, account);
  if (!("error" in defaultSender)) {
    return defaultSender;
  }

  const check = await checkIdentityVerified(client, userEmail);
  if (check.status === "error") {
    return { error: check.error };
  }
  if (check.status === "verified") {
    return { senderEmail: userEmail };
  }
  return { error: defaultSender.error };
}

/**
 * Send a test email to the authenticated user's own inbox — the secondary,
 * more visceral "see it land in my inbox" aha. Requires either a verified
 * domain sender, an org default sender, or the user's own email verified as
 * an SES identity (verified identities can send AND receive in sandbox).
 */
export const sendWelcomeTestEmail = orgAction(
  {
    name: "sendWelcomeTestEmail",
    resource: "broadcasts",
    permission: ["send"],
    orgId: (organizationId: string) => organizationId,
    onError: "Failed to send the test email",
  },
  async (ctx, organizationId: string): Promise<SendWelcomeTestEmailResult> => {
    const sesConn = await sesClientForOrg(organizationId);
    if (!sesConn) {
      return { success: false, error: "No AWS account connected" };
    }
    const { account, client } = sesConn;

    const sender = await resolveWelcomeSender(
      client,
      organizationId,
      account,
      ctx.access.userEmail
    );
    if ("error" in sender) {
      return { success: false, error: sender.error };
    }

    const configurationSetName = resolveConfigSetFor(
      account,
      sender.senderEmail
    );

    try {
      const result = await sendEmail({
        client,
        from: sender.senderEmail,
        to: ctx.access.userEmail,
        subject: "Welcome to Wraps — your first email",
        html: "<p>This is a test email sent through your Wraps infrastructure, straight to your inbox. It worked!</p>",
        text: "This is a test email sent through your Wraps infrastructure, straight to your inbox. It worked!",
        configurationSetName,
        tags: [
          { name: "source", value: "welcome_test" },
          { name: "organizationId", value: organizationId },
        ],
      });

      await trackFirstEmailSent(ctx.access.userId, organizationId, {
        channel: "email",
        source: "welcome_test",
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      const mapped = mapSendEmailError(
        error,
        "Your email isn't verified yet. Verify your email first, then try again."
      );
      if (mapped) {
        return { success: false, error: mapped };
      }
      throw error;
    }
  }
);
