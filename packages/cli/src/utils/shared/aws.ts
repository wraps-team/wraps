import { ACMClient, DescribeCertificateCommand } from "@aws-sdk/client-acm";
import {
  GetIdentityVerificationAttributesCommand,
  ListIdentitiesCommand,
  SESClient,
} from "@aws-sdk/client-ses";
import {
  GetAccountCommand,
  PutAccountDetailsCommand,
  PutAccountPricingAttributesCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { isSESPricingPlan, type SESPricingPlan } from "../email/ses-plans.js";
import {
  type AWSSetupState,
  detectAWSState,
  getConfiguredProfiles,
  getCurrentProfile,
  getSSOLoginCommand,
} from "./aws-detection.js";
import { errors, sanitizeErrorMessage, WrapsError } from "./errors.js";

/**
 * AWS identity information
 */
export type AWSIdentity = {
  accountId: string;
  userId: string;
  arn: string;
};

/**
 * Result of credential validation with additional context
 */
export type CredentialValidationResult = {
  /** AWS identity information */
  identity: AWSIdentity;
  /** Source of credentials (profile, environment, sso, instance) */
  credentialSource: AWSSetupState["credentialSource"];
  /** Warnings about credential state (e.g., SSO expiring soon) */
  warnings: string[];
};

/**
 * Validate AWS credentials with detailed error handling
 * Uses detectAWSState() for comprehensive environment detection
 * Maps specific errors to actionable WrapsError types
 */
export async function validateAWSCredentials(): Promise<AWSIdentity> {
  const result = await validateAWSCredentialsWithDetails();
  return result.identity;
}

/**
 * Validate AWS credentials and return detailed result with warnings
 * Provides additional context about credential state for better UX
 */
export async function validateAWSCredentialsWithDetails(): Promise<CredentialValidationResult> {
  // Get comprehensive AWS state
  const state = await detectAWSState();
  const warnings: string[] = [];

  // Static env credentials outrank SSO and profiles in the SDK credential
  // chain. When they are set, SSO/profile state is irrelevant to what STS
  // will actually use — pre-checking it misattributes failures (e.g. bad
  // access keys reported as "SSO session expired").
  const hasStaticEnvCredentials = Boolean(
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
  );

  if (!hasStaticEnvCredentials) {
    // Check if SSO is configured but token is expired
    if (state.sso.configured && state.sso.tokenStatus?.expired) {
      const profile = state.sso.activeProfile?.name;
      throw errors.ssoSessionExpired(profile);
    }

    // Check if SSO token is about to expire (within 15 minutes)
    if (
      state.sso.configured &&
      state.sso.tokenStatus?.valid &&
      state.sso.tokenStatus.minutesRemaining !== null &&
      state.sso.tokenStatus.minutesRemaining < 15
    ) {
      const minutes = state.sso.tokenStatus.minutesRemaining;
      const loginCmd = getSSOLoginCommand(state.sso.activeProfile?.name);
      warnings.push(
        `SSO session expires in ${minutes} minute${minutes !== 1 ? "s" : ""}. Run "${loginCmd}" to refresh.`
      );
    }

    // Check if specified profile exists
    const currentProfile = getCurrentProfile();
    if (currentProfile && currentProfile !== "default") {
      const availableProfiles = getConfiguredProfiles();
      if (!availableProfiles.includes(currentProfile)) {
        throw errors.profileNotFound(currentProfile, availableProfiles);
      }
    }
  }

  // Try to validate credentials with STS. GetCallerIdentity is identity-only,
  // but AWS SDK v3 requires a region to build the client. Pin to us-east-1 so
  // validation still works when the user has creds but no AWS_REGION set
  // (common on first run); command-level code uses resolveRegionForCommand
  // for the real deployment region.
  const sts = new STSClient({ region: "us-east-1" });

  try {
    const identity = await sts.send(new GetCallerIdentityCommand({}));

    return {
      identity: {
        accountId: identity.Account!,
        userId: identity.UserId!,
        arn: identity.Arn!,
      },
      credentialSource: state.credentialSource,
      warnings,
    };
  } catch (error: unknown) {
    // Map specific AWS errors to our error types
    if (error instanceof Error) {
      switch (error.name) {
        case "ExpiredTokenException":
        case "TokenRefreshRequired":
          throw errors.sessionTokenExpired();

        case "InvalidClientTokenId":
        case "InvalidAccessKeyId":
        case "SignatureDoesNotMatch":
          throw errors.accessKeyInvalid();

        case "CredentialsError":
        case "CredentialsProviderError":
          // Check if credentials file is missing
          if (error.message?.includes("Could not load credentials")) {
            throw errors.credentialsFileMissing();
          }
          break;

        case "UnrecognizedClientException":
          throw errors.accessKeyInvalid();
      }
    }

    // Default to generic credentials error
    throw errors.noAWSCredentials();
  }
}

/**
 * Resolve AWS credentials from the SDK provider chain and inject them into
 * process.env as static credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 * AWS_SESSION_TOKEN).
 *
 * Why this exists: Pulumi's S3 state backend uses gocloud.dev, which is built
 * on AWS Go SDK v1. v1 has no SSO support, so it cannot resolve credentials
 * from an SSO profile (the most common modern AWS auth setup). When the Go
 * subprocess tries to read state from S3, it fails with NoCredentialProviders.
 *
 * The fix: pre-resolve credentials in Node (where SDK v3 supports SSO natively)
 * and pass them through as static env vars before spawning Pulumi. The Go SDK v1
 * credential chain checks env vars first, so this works for any source the JS
 * SDK v3 chain can resolve (env, profile, SSO, EC2, ECS, web identity).
 *
 * Idempotent — safe to call multiple times. No-op if env vars are already set
 * (the SDK v3 chain would resolve to the same values anyway).
 *
 * Must be called AFTER validateAWSCredentials() so that an SSO session expiry
 * is surfaced as a clean WrapsError before we try to resolve.
 */
export async function resolveAWSCredentialsToEnv(): Promise<void> {
  // Already-resolved env credentials — the chain would just return these, so
  // skip the resolution step. Still clear AWS_PROFILE below to silence the
  // "Multiple credential sources detected" warning.
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    // biome-ignore lint/performance/noDelete: process.env coerces undefined assignment to the string "undefined"; we need actual key removal so the SDK credential chain doesn't pick up a phantom profile.
    delete process.env.AWS_PROFILE;
    return;
  }

  // Resolve credentials via the default chain WHILE AWS_PROFILE is still set —
  // otherwise the chain silently falls back to the `default` profile, which
  // may point to a different AWS account. That's a serious credential-swap
  // bug: the user sets AWS_PROFILE=foo (account A), Pulumi ends up deploying
  // to account B (the default profile) instead.
  const sts = new STSClient({});
  const provider = sts.config.credentials;
  if (!provider) {
    throw errors.noAWSCredentials();
  }

  let creds: Awaited<ReturnType<typeof provider>>;
  try {
    creds = typeof provider === "function" ? await provider() : provider;
  } catch (error) {
    // Match by error name first — substring matching on .message risks
    // picking up unrelated phrases like "the role expired its trust".
    if (error instanceof Error) {
      if (
        error.name === "ExpiredTokenException" ||
        error.name === "TokenRefreshRequired" ||
        error.name === "SSOTokenExpired"
      ) {
        throw errors.sessionTokenExpired();
      }
      // The credentials file path is the only place "Could not load
      // credentials" reliably appears in SDK v3 error messages, so the
      // substring match is precise enough.
      if (error.message?.includes("Could not load credentials")) {
        throw errors.credentialsFileMissing();
      }
    }
    throw errors.noAWSCredentials();
  }

  process.env.AWS_ACCESS_KEY_ID = creds.accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = creds.secretAccessKey;
  if (creds.sessionToken) {
    process.env.AWS_SESSION_TOKEN = creds.sessionToken;
  }

  // Now that static creds are in env, clear AWS_PROFILE so downstream SDK
  // callers (both our own clients and the AWS SDK v3 bundled inside Pulumi
  // providers) don't emit "Multiple credential sources detected" on every
  // call. Only affects this process; the user's shell env is unchanged.
  // biome-ignore lint/performance/noDelete: process.env coerces undefined assignment to the string "undefined"; we need actual key removal so the SDK credential chain doesn't pick up a phantom profile.
  delete process.env.AWS_PROFILE;
}

export const SES_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "af-south-1",
  "ap-east-1",
  "ap-south-1",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-northeast-3",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-southeast-3",
  "ca-central-1",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-south-1",
  "eu-north-1",
  "me-south-1",
  "sa-east-1",
] as const;

/**
 * Check if a region is valid
 */
export async function checkRegion(region: string): Promise<boolean> {
  return (SES_REGIONS as readonly string[]).includes(region);
}

/**
 * Get AWS region from environment or config
 */
export async function getAWSRegion(): Promise<string> {
  // Try to detect region from various sources
  if (process.env.AWS_REGION) {
    return process.env.AWS_REGION;
  }
  if (process.env.AWS_DEFAULT_REGION) {
    return process.env.AWS_DEFAULT_REGION;
  }

  // Default fallback
  return "us-east-1";
}

/**
 * SES domain identity
 */
export type SESDomain = {
  domain: string;
  verified: boolean;
};

/**
 * List all SES identities (domains) in the account
 */
export async function listSESDomains(region: string): Promise<SESDomain[]> {
  const ses = new SESClient({ region });

  try {
    // Get all identities
    const identitiesResponse = await ses.send(
      new ListIdentitiesCommand({
        IdentityType: "Domain",
      })
    );

    const identities = identitiesResponse.Identities || [];

    if (identities.length === 0) {
      return [];
    }

    // Get verification attributes
    const attributesResponse = await ses.send(
      new GetIdentityVerificationAttributesCommand({
        Identities: identities,
      })
    );

    const attributes = attributesResponse.VerificationAttributes || {};

    // Map to SESDomain objects
    return identities.map((domain) => ({
      domain,
      verified: attributes[domain]?.VerificationStatus === "Success",
    }));
    // baseline:allow-next-line no-swallowed-errors — listing SES domains may fail due to permissions, safe to return empty
  } catch {
    return [];
  }
}

/**
 * SES account status including sandbox mode and send quota
 */
export type SESAccountStatus = {
  isSandbox: boolean;
  sandboxUncertain?: boolean;
  sendQuota?: {
    max24HourSend: number;
    maxSendRate: number;
    sentLast24Hours: number;
  };
  enforcementStatus?: string;
  /** SES pricing plan currently in effect. `undefined` when SES didn't report a recognized value. */
  currentPlan?: SESPricingPlan;
  /** Pending pricing plan that takes effect next billing cycle, if any. */
  nextPlan?: SESPricingPlan;
};

/**
 * Get SES account status including sandbox mode detection
 * Uses SESv2 GetAccountCommand to check ProductionAccessEnabled
 */
export async function getSESAccountStatus(
  region: string
): Promise<SESAccountStatus> {
  const sesv2 = new SESv2Client({ region });

  try {
    const response = await sesv2.send(new GetAccountCommand({}));
    const currentPlanRaw = response.PricingAttributes?.CurrentPlan;
    const nextPlanRaw = response.PricingAttributes?.NextPlan;
    return {
      isSandbox: !response.ProductionAccessEnabled,
      sendQuota: response.SendQuota
        ? {
            max24HourSend: response.SendQuota.Max24HourSend ?? 0,
            maxSendRate: response.SendQuota.MaxSendRate ?? 0,
            sentLast24Hours: response.SendQuota.SentLast24Hours ?? 0,
          }
        : undefined,
      enforcementStatus: response.EnforcementStatus,
      // Narrow through isSESPricingPlan rather than casting — an unrecognized
      // future plan value becomes `undefined` instead of a lying assertion.
      currentPlan:
        currentPlanRaw && isSESPricingPlan(currentPlanRaw)
          ? currentPlanRaw
          : undefined,
      nextPlan:
        nextPlanRaw && isSESPricingPlan(nextPlanRaw) ? nextPlanRaw : undefined,
    };
    // baseline:allow-next-line no-swallowed-errors — SES GetAccount may fail due to permissions or throttling, default to sandbox (safer: offers extra help)
  } catch {
    return { isSandbox: true, sandboxUncertain: true };
  }
}

/**
 * Set the SES pricing plan for this account, in this Region.
 *
 * Mutating — the caller (`wraps email plan --set`) is responsible for
 * confirming with the user before invoking this. Unlike `getSESAccountStatus`,
 * this must NEVER swallow errors: a silent failure here would let a customer
 * believe their billing plan changed when it didn't.
 */
export async function setSESPricingPlan(
  region: string,
  plan: SESPricingPlan
): Promise<void> {
  const sesv2 = new SESv2Client({ region });

  try {
    await sesv2.send(new PutAccountPricingAttributesCommand({ Plan: plan }));
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    const name = error.name;
    const message = error.message || "";
    const mentions = (needle: string): boolean =>
      name === needle || message.includes(needle);

    // Request never reached the API, or was denied once it did.
    if (
      mentions("AccessDenied") ||
      mentions("AccessDeniedException") ||
      mentions("UnauthorizedAccess")
    ) {
      throw errors.iamPermissionDenied(
        "ses:PutAccountPricingAttributes",
        "SES account pricing settings",
        "Ensure your IAM user/role has the ses:PutAccountPricingAttributes permission."
      );
    }

    // Throttled — safe to retry.
    if (
      mentions("Throttling") ||
      mentions("ThrottlingException") ||
      mentions("TooManyRequestsException")
    ) {
      throw errors.awsThrottled("PutAccountPricingAttributes");
    }

    // Request reached SES but was rejected — e.g. a plan change already
    // pending, or the plan is invalid for this account's current state.
    if (
      mentions("ConflictException") ||
      mentions("BadRequestException") ||
      mentions("ValidationException")
    ) {
      throw new WrapsError(
        `SES rejected the pricing plan change: ${sanitizeErrorMessage(error)}`,
        "SES_PRICING_PLAN_CHANGE_REJECTED",
        "This can happen if a plan change is already pending, or the requested plan isn't valid for this account right now.\n\nCheck the current plan:\n  wraps email plan",
        "https://docs.aws.amazon.com/ses/latest/dg/sending-email-pricing.html"
      );
    }

    // Anything else — surface the real AWS error instead of swallowing it.
    throw error;
  }
}

export type SESProductionAccessReview = {
  /** `null` when GetAccount did not report the field. */
  productionAccessEnabled: boolean | null;
  /** AWS's latest review of the account, or `null` when AWS reported none. */
  review: {
    status: "PENDING" | "GRANTED" | "DENIED" | "FAILED";
    caseId: string | null;
  } | null;
  enforcementStatus: string | null;
  sendQuota: {
    max24HourSend: number;
    maxSendRate: number;
    sentLast24Hours: number;
  } | null;
};

/**
 * Production-access view of GetAccount. Unlike `getSESAccountStatus`, this
 * does NOT swallow errors: the caller is about to decide whether to file a
 * request on the strength of this read, so an unreadable account must surface
 * as an error, never as "sandbox".
 */
export async function getSESProductionAccessReview(
  region: string
): Promise<SESProductionAccessReview> {
  const sesv2 = new SESv2Client({ region });

  try {
    const response = await sesv2.send(new GetAccountCommand({}));
    const reviewDetails = response.Details?.ReviewDetails;

    return {
      productionAccessEnabled: response.ProductionAccessEnabled ?? null,
      review: reviewDetails?.Status
        ? {
            status: reviewDetails.Status,
            caseId: reviewDetails.CaseId ?? null,
          }
        : null,
      enforcementStatus: response.EnforcementStatus ?? null,
      sendQuota: response.SendQuota
        ? {
            max24HourSend: response.SendQuota.Max24HourSend ?? 0,
            maxSendRate: response.SendQuota.MaxSendRate ?? 0,
            sentLast24Hours: response.SendQuota.SentLast24Hours ?? 0,
          }
        : null,
    };
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    const name = error.name;
    const message = error.message || "";
    const mentions = (needle: string): boolean =>
      name === needle || message.includes(needle);

    if (
      mentions("AccessDenied") ||
      mentions("AccessDeniedException") ||
      mentions("UnauthorizedAccess")
    ) {
      throw errors.iamPermissionDenied(
        "ses:GetAccount",
        "SES account details",
        "Ensure your IAM user/role has the ses:GetAccount permission."
      );
    }

    if (
      mentions("Throttling") ||
      mentions("ThrottlingException") ||
      mentions("TooManyRequestsException")
    ) {
      throw errors.awsThrottled("GetAccount");
    }

    throw error;
  }
}

export type SESProductionAccessRequestInput = {
  mailType: "MARKETING" | "TRANSACTIONAL";
  websiteUrl: string;
  additionalContactEmails: string[];
};

/**
 * File the SES production-access request for this account, in this Region.
 *
 * Mutating — the caller (`wraps email production-access --request`) is
 * responsible for confirming with the user before invoking this. Never
 * swallow errors: a silent failure would let a customer believe AWS is
 * reviewing a request it never received.
 */
export async function requestSESProductionAccess(
  region: string,
  input: SESProductionAccessRequestInput
): Promise<void> {
  const sesv2 = new SESv2Client({ region });

  try {
    await sesv2.send(
      new PutAccountDetailsCommand({
        MailType: input.mailType,
        WebsiteURL: input.websiteUrl,
        ContactLanguage: "EN",
        AdditionalContactEmailAddresses: input.additionalContactEmails.length
          ? input.additionalContactEmails
          : undefined,
        ProductionAccessEnabled: true,
      })
    );
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    const name = error.name;
    const message = error.message || "";
    const mentions = (needle: string): boolean =>
      name === needle || message.includes(needle);

    // Request never reached the API, or was denied once it did.
    if (
      mentions("AccessDenied") ||
      mentions("AccessDeniedException") ||
      mentions("UnauthorizedAccess")
    ) {
      throw errors.iamPermissionDenied(
        "ses:PutAccountDetails",
        "SES account details",
        "Ensure your IAM user/role has the ses:PutAccountDetails permission."
      );
    }

    // Throttled — safe to retry.
    if (
      mentions("Throttling") ||
      mentions("ThrottlingException") ||
      mentions("TooManyRequestsException")
    ) {
      throw errors.awsThrottled("PutAccountDetails");
    }

    // Another request is already under review for this account.
    if (mentions("ConflictException")) {
      throw new WrapsError(
        "A production access request is already under review for this account.",
        "PRODUCTION_ACCESS_PENDING",
        "Wait for AWS to finish the current review before submitting another. Run wraps email production-access to see its status.",
        "https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html"
      );
    }

    // Request reached SES but was rejected for a validation reason.
    if (mentions("BadRequestException")) {
      throw new WrapsError(
        `AWS rejected the request: ${message}`,
        "PRODUCTION_ACCESS_REJECTED",
        "Check the website URL (must be a full https:// URL) and contact addresses, then retry.",
        "https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html"
      );
    }

    // Anything else — surface the real AWS error instead of swallowing it.
    throw error;
  }
}

/**
 * Check if SES is in sandbox mode
 */
export async function isSESSandbox(region: string): Promise<boolean> {
  const status = await getSESAccountStatus(region);
  return status.isSandbox;
}

/**
 * ACM certificate status
 */
export type ACMCertificateStatus = {
  status: string;
  domainName: string;
  validationRecords: Array<{
    name: string;
    type: string;
    value: string;
  }>;
};

/**
 * Check ACM certificate validation status
 * Note: ACM certificates for CloudFront must be in us-east-1
 */
export async function getACMCertificateStatus(
  certificateArn: string
): Promise<ACMCertificateStatus | null> {
  const acm = new ACMClient({ region: "us-east-1" });

  try {
    const response = await acm.send(
      new DescribeCertificateCommand({
        CertificateArn: certificateArn,
      })
    );

    const certificate = response.Certificate;
    if (!certificate) {
      return null;
    }

    // Extract validation records
    const validationRecords =
      certificate.DomainValidationOptions?.map((option) => ({
        name: option.ResourceRecord?.Name || "",
        type: option.ResourceRecord?.Type || "",
        value: option.ResourceRecord?.Value || "",
      })) || [];

    return {
      status: certificate.Status || "UNKNOWN",
      domainName: certificate.DomainName || "",
      validationRecords,
    };
  } catch (error) {
    console.error("Error getting ACM certificate status:", error);
    return null;
  }
}
