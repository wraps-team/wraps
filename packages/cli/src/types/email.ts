/**
 * Email-specific types for Wraps
 */

import type { ArchiveRetention, FeatureCost, Provider } from "./shared.js";

/**
 * SES event types that can be tracked
 */
export type SESEventType =
  | "SEND"
  | "DELIVERY"
  | "OPEN"
  | "CLICK"
  | "BOUNCE"
  | "COMPLAINT"
  | "REJECT"
  | "RENDERING_FAILURE"
  | "DELIVERY_DELAY"
  | "SUBSCRIPTION";

/**
 * Suppression list reasons
 */
export type SuppressionReason = "BOUNCE" | "COMPLAINT";

/**
 * Feature-based email configuration
 */
export type WrapsEmailConfig = {
  // Domain configuration
  domain?: string;
  mailFromDomain?: string;

  // Tracking configuration
  tracking?: {
    enabled: boolean;
    opens?: boolean;
    clicks?: boolean;
    customRedirectDomain?: string;
    httpsEnabled?: boolean; // Enable HTTPS with CloudFront + ACM
  };

  // Security
  tlsRequired?: boolean;

  // Reputation and deliverability
  reputationMetrics?: boolean;
  suppressionList?: {
    enabled: boolean;
    reasons: SuppressionReason[];
  };

  // Event tracking and storage
  eventTracking?: {
    enabled: boolean;
    eventBridge?: boolean;
    events?: SESEventType[];
    dynamoDBHistory?: boolean;
    archiveRetention?: ArchiveRetention;
  };

  // Email archiving (full email content storage)
  emailArchiving?: {
    enabled: boolean;
    retention: ArchiveRetention;
  };

  // Advanced options
  ipPool?: string;
  dedicatedIp?: boolean;
  sendingEnabled?: boolean;
};

/**
 * Configuration preset types for email
 */
export type EmailConfigPreset =
  | "starter"
  | "production"
  | "enterprise"
  | "custom";

/**
 * Feature cost breakdown for email
 */
export type EmailFeatureCostBreakdown = {
  tracking?: FeatureCost;
  reputationMetrics?: FeatureCost;
  eventTracking?: FeatureCost;
  dynamoDBHistory?: FeatureCost;
  emailArchiving?: FeatureCost;
  dedicatedIp?: FeatureCost;
  total: FeatureCost;
};

/**
 * Email stack configuration (used by Pulumi)
 */
export type EmailStackConfig = {
  provider: Provider;
  region: string;
  vercel?: {
    teamSlug: string;
    projectName: string;
  };
  emailConfig: WrapsEmailConfig;
};

/**
 * Email stack outputs from Pulumi
 */
export type EmailStackOutputs = {
  roleArn: string;
  configSetName?: string;
  tableName?: string;
  region: string;
  lambdaFunctions?: string[];
  domain?: string;
  dkimTokens?: string[];
  dnsAutoCreated?: boolean;
  eventBusName?: string;
  queueUrl?: string;
  dlqUrl?: string;
  customTrackingDomain?: string;
  httpsTrackingEnabled?: boolean;
  cloudFrontDomain?: string;
  acmCertificateValidationRecords?: Array<{
    name: string;
    type: string;
    value: string;
  }>;
  mailFromDomain?: string;
  archiveArn?: string;
  archivingEnabled?: boolean;
  archiveRetention?: ArchiveRetention;
};

/**
 * Command options for email init
 */
export type EmailInitOptions = {
  provider?: Provider;
  region?: string;
  domain?: string;
  preset?: EmailConfigPreset;
  yes?: boolean;
};

/**
 * Available features for Wraps email infrastructure
 */
export type WrapsEmailFeature =
  | "configSet"
  | "bounceHandling"
  | "complaintHandling"
  | "emailHistory"
  | "eventProcessor"
  | "dashboardAccess";

/**
 * Email feature metadata
 */
export type WrapsEmailFeatureMetadata = {
  id: WrapsEmailFeature;
  name: string;
  description: string;
  requires?: WrapsEmailFeature[];
  resources: string[];
};

/**
 * Command options for email connect
 */
export type EmailConnectOptions = {
  provider?: Provider;
  region?: string;
  yes?: boolean;
};

/**
 * Command options for email verify
 */
export type EmailVerifyOptions = {
  domain: string;
};

/**
 * Command options for email upgrade
 */
export type EmailUpgradeOptions = {
  region?: string;
  yes?: boolean;
};

/**
 * Command options for email update
 */
/**
 * Command options for email config
 */
export type EmailConfigOptions = {
  region?: string;
  yes?: boolean;
};

/** @deprecated Use EmailConfigOptions instead */
export type EmailUpdateOptions = EmailConfigOptions;

/**
 * Command options for email restore
 */
export type EmailRestoreOptions = {
  region?: string;
  force?: boolean; // Destructive operation - restores previous configuration
};
