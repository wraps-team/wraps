/**
 * AWS SES Client for fetching email configuration
 *
 * NOTE: This should be replaced with API calls to your backend.
 * The backend should use AWS SDK with IAM role credentials.
 * Frontend should NEVER have direct AWS credentials.
 */

/**
 * Email identity verification status
 */
export type VerificationStatus =
  | "PENDING"
  | "SUCCESS"
  | "FAILED"
  | "TEMPORARY_FAILURE"
  | "NOT_STARTED";

/**
 * DKIM configuration
 */
export type DkimConfig = {
  status: "SUCCESS" | "PENDING" | "FAILED" | "NOT_STARTED";
  tokens?: string[];
  signingEnabled: boolean;
  signingKeyLength?: "RSA_1024_BIT" | "RSA_2048_BIT";
};

/**
 * Mail-From domain configuration
 */
export type MailFromConfig = {
  mailFromDomain?: string;
  mailFromDomainStatus?: "PENDING" | "SUCCESS" | "FAILED";
  behaviorOnMxFailure?: "USE_DEFAULT_VALUE" | "REJECT_MESSAGE";
};

/**
 * Tracking configuration
 */
export type TrackingConfig = {
  customRedirectDomain?: string;
  httpsPolicy?: "REQUIRE" | "OPTIONAL";
};

/**
 * Configuration set settings
 */
export type ConfigurationSetDetails = {
  name: string;
  trackingOptions?: TrackingConfig;
  deliveryOptions?: {
    tlsPolicy?: "REQUIRE" | "OPTIONAL";
    sendingPoolName?: string;
  };
  reputationOptions?: {
    reputationMetricsEnabled: boolean;
    lastFreshStart?: Date;
  };
  sendingOptions?: {
    sendingEnabled: boolean;
  };
  suppressionOptions?: {
    suppressedReasons?: ("BOUNCE" | "COMPLAINT")[];
  };
};

/**
 * Email identity details
 */
export type EmailIdentityDetails = {
  identityType: "EMAIL_ADDRESS" | "DOMAIN";
  identityName: string;
  verificationStatus: VerificationStatus;
  dkimAttributes?: DkimConfig;
  mailFromAttributes?: MailFromConfig;
  configurationSetName?: string;
  verifiedForSendingStatus: boolean;
  tags?: Record<string, string>;
};

/**
 * Complete email settings
 */
export type EmailSettings = {
  configurationSet?: ConfigurationSetDetails;
  identity?: EmailIdentityDetails;
  region?: string;
};

/**
 * Fetch complete email settings from API
 */
export async function getEmailSettings(): Promise<EmailSettings> {
  // Get token from sessionStorage
  const token = sessionStorage.getItem("wraps-auth-token");

  if (!token) {
    throw new Error("Authentication token not found");
  }

  const response = await fetch(`/api/settings?token=${token}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch settings: ${response.statusText}`);
  }

  return await response.json();
}
