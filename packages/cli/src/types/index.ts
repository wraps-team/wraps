/**
 * Hosting provider type
 */
export type Provider = "vercel" | "aws" | "railway" | "other";

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
 * Archive retention periods for email data and email archiving
 */
export type ArchiveRetention =
  | "7days"
  | "30days"
  | "90days"
  | "6months"
  | "1year"
  | "18months"
  | "indefinite";

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
 * Configuration preset types
 */
export type ConfigPreset = "starter" | "production" | "enterprise" | "custom";

/**
 * Cost information for a feature
 */
export type FeatureCost = {
  monthly: number; // Base monthly cost in USD
  perEmail?: number; // Additional cost per email
  perEvent?: number; // Additional cost per event
  description: string;
};

/**
 * Feature cost breakdown
 */
export type FeatureCostBreakdown = {
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
 * Pulumi stack outputs
 */
export type StackOutputs = {
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
  mailFromDomain?: string;
  archiveArn?: string;
  archivingEnabled?: boolean;
  archiveRetention?: ArchiveRetention;
};

/**
 * Command options for init
 */
export type InitOptions = {
  provider?: Provider;
  region?: string;
  domain?: string;
  preset?: ConfigPreset;
  yes?: boolean;
};

/**
 * Available features for Wraps email infrastructure
 */
export type WrapsFeature =
  | "configSet"
  | "bounceHandling"
  | "complaintHandling"
  | "emailHistory"
  | "eventProcessor"
  | "dashboardAccess";

/**
 * Feature metadata
 */
export type WrapsFeatureMetadata = {
  id: WrapsFeature;
  name: string;
  description: string;
  requires?: WrapsFeature[];
  resources: string[];
};

/**
 * Command options for connect
 */
export type ConnectOptions = {
  provider?: Provider;
  region?: string;
  yes?: boolean;
};

/**
 * Command options for status
 */
export type StatusOptions = {
  account?: string;
};

/**
 * Command options for verify
 */
export type VerifyOptions = {
  domain: string;
};

/**
 * Command options for upgrade
 */
export type UpgradeOptions = {
  region?: string;
  yes?: boolean;
};

/**
 * Command options for update
 */
export type UpdateOptions = {
  region?: string;
  yes?: boolean;
};

/**
 * Command options for destroy
 */
export type DestroyOptions = {
  yes?: boolean;
};

/**
 * Command options for console
 */
export type ConsoleOptions = {
  port?: number;
  noOpen?: boolean;
};
