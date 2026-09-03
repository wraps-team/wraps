/**
 * Email-specific types for Wraps
 */

import type { ArchiveRetention, FeatureCost, Provider } from "./shared.js";

/**
 * Purpose label for an additional domain (informational only)
 */
export type DomainPurpose =
  | "transactional"
  | "marketing"
  | "notifications"
  | "other";

/**
 * An additional domain managed via `wraps email domains add`
 * (as opposed to the primary domain managed by Pulumi)
 */
export type AdditionalDomain = {
  domain: string;
  mailFromDomain?: string;
  purpose?: DomainPurpose;
  configSetName?: string;
  trackingConfig?: { opens: boolean; clicks: boolean };
  /** Custom redirect domain for open/click links, e.g. "track.news.example.com". */
  trackingDomain?: string;
  /** ISO time SES accepted `trackingDomain`; absent while the sending domain is unverified. */
  trackingDomainAppliedAt?: string;
  /** HTTPS tracking resources, present once the user opted in. */
  trackingHttps?: {
    certificateArn: string;
    /** pending = cert not yet ISSUED; active = distribution created + HttpsPolicy REQUIRE. */
    status: "pending" | "active";
    distributionId?: string;
    distributionDomain?: string;
    validationRecord?: { name: string; type: string; value: string };
  };
  tlsRequired?: boolean;
  reputationMetrics?: boolean;
  suppressionReasons?: ("BOUNCE" | "COMPLAINT")[];
  sendingEnabled?: boolean;
  archiveEnabled?: boolean;
  archiveArn?: string;
  vdmEngagement?: boolean;
  vdmInbox?: boolean;
  addedAt: string;
};

export type EmailDomainsConfigOptions = {
  domain?: string;
  opens?: boolean;
  clicks?: boolean;
  /** A hostname to set, or the literal "none" to clear. */
  trackingDomain?: string;
  /** Enable/disable CloudFront+ACM HTTPS for the tracking domain. */
  trackingHttps?: boolean;
  tlsRequired?: boolean;
  reputationMetrics?: boolean;
  suppressBounce?: boolean;
  suppressComplaint?: boolean;
  archive?: boolean;
  sendingEnabled?: boolean;
  vdmEngagement?: boolean;
  vdmInbox?: boolean;
  region?: string;
  json?: boolean;
};

/**
 * An inbound receiving domain managed via `wraps email inbound add`
 */
export type InboundDomain = {
  subdomain: string; // e.g., "inbound", "support", or "" for root domain
  receivingDomain: string; // e.g., "inbound.example.com" or "example.com" for root
  parentDomain: string; // e.g., "example.com"
  addedAt: string; // ISO timestamp
};

/**
 * AWS regions that support SES email receiving (Receipt Rules)
 */
export const SES_RECEIVING_REGIONS = [
  "us-east-1",
  "us-west-2",
  "eu-west-1",
] as const;

export type SESReceivingRegion = (typeof SES_RECEIVING_REGIONS)[number];

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
  mailFromSubdomain?: string; // Subdomain for MAIL FROM (e.g., "mail" -> mail.domain.com)

  // Tracking configuration
  tracking?: {
    enabled: boolean;
    opens?: boolean;
    clicks?: boolean;
    customRedirectDomain?: string;
    httpsEnabled?: boolean; // Enable HTTPS with CloudFront + ACM
    wafEnabled?: boolean; // Enable WAF with rate limiting for HTTPS tracking CDN
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

  // SMTP credentials for legacy systems (PHP, WordPress, etc.)
  smtpCredentials?: {
    enabled: boolean;
    createdAt?: string; // Track when credentials were created
  };

  // Alerting configuration
  alerts?: AlertConfig;

  // Inbound email receiving
  inbound?: {
    enabled: boolean;
    subdomain: string; // e.g., "inbound" → inbound.domain.com
    receivingDomain?: string; // computed: subdomain.domain
    bucketName?: string; // wraps-inbound-{accountId}-{region}
    retention?: ArchiveRetention;
    webhookUrl?: string; // user's webhook endpoint for email.received
    webhookSecret?: string; // generated API key for webhook auth
  };

  // Agent mailboxes: per-agent scoped send credentials behind an enforcer Lambda
  agents?: {
    enabled: boolean;
    webhookSecret?: string; // shared secret for the enforcer→API webhook
    agents: Array<{
      id: string; // Neon agent UUID — pins the per-agent enforcer alias qualifier
      name: string;
      emailAddress: string;
      domain: string;
      aliasArn?: string; // qualified enforcer alias ARN (set after deploy)
    }>;
  };

  // Inbound receiving domains (multi-domain support)
  inboundDomains?: InboundDomain[];

  // Reply-threading signed-address feature: one SSM SecureString parameter
  // per sending domain. `initialSecret` is transient (base64, supplied by
  // the CLI, stripped from metadata after the first successful deploy).
  replyThreading?: {
    enabled: boolean;
    domains: Array<{
      domain: string;
      parameterArn?: string;
      parameterName?: string;
      currentKid?: number;
      previousKid?: number;
      rotatedAt?: string;
      createdAt?: string;
      initialSecret?: string; // base64, transient — stripped after deploy
    }>;
  };

  // Additional domains managed via `wraps email domains add`
  additionalDomains?: AdditionalDomain[];

  // User webhook endpoint for SES events
  userWebhook?: {
    enabled: boolean;
    url?: string;
    secret?: string;
  };

  // Advanced options
  ipPool?: string;
  dedicatedIp?: boolean;
  sendingEnabled?: boolean;
  vdmOptions?: {
    engagementTrackingEnabled?: boolean;
    optimizedSharedDeliveryEnabled?: boolean;
  };
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
  waf?: FeatureCost;
  smtpCredentials?: FeatureCost;
  alerts?: FeatureCost;
  userWebhook?: FeatureCost;
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
  // Webhook configuration for Wraps platform integration
  webhook?: {
    awsAccountNumber: string; // The user's 12-digit AWS account ID
    webhookSecret: string; // API key for webhook authentication
    webhookUrl?: string; // Override webhook URL (defaults to api.wraps.dev)
  };
  // Second webhook target for a self-hosted control plane running in the same
  // AWS account. Delivered in addition to `webhook`, not instead of it.
  // `webhookUrl` is required here — unlike the platform webhook there is no
  // sensible default endpoint to fall back to.
  selfhostWebhook?: {
    awsAccountNumber: string; // The user's 12-digit AWS account ID
    webhookSecret: string; // API key issued by the self-hosted control plane
    webhookUrl: string; // BASE url of the self-hosted API
  };
  // Skip Pulumi import flags when resources already exist in Pulumi state.
  // Prevents import collisions when redeploying an existing stack (e.g., platform connect after email init).
  skipResourceImports?: boolean;
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
  httpsTrackingPending?: boolean; // True if HTTPS requested but cert not yet validated
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
  // SMTP credentials (shown once, not stored)
  smtpUserArn?: string;
  smtpUsername?: string;
  smtpPassword?: string;
  smtpEndpoint?: string;
  // Alerting outputs
  alertsEnabled?: boolean;
  alertTopicArn?: string;
  // Inbound email outputs
  inboundBucketName?: string;
  inboundBucketArn?: string;
  inboundLambdaArn?: string;
  inboundReceivingDomain?: string;
  // Reply-threading outputs: one SSM parameter per sending domain. Keyed by
  // the sending domain (e.g., "support.foo.com"), not `r.mail.X`.
  replySecrets?: Record<
    string,
    { parameterArn: string; parameterName: string }
  >;
  // User webhook outputs
  userWebhookUrl?: string;
  userWebhookSecret?: string;
  // Agent enforcement outputs
  agentEnforcerArn?: string;
  agentPolicyTableName?: string;
  agentCredentials?: Record<
    string,
    { accessKeyId: string; secretAccessKey: string; userArn: string }
  >;
  // Per-agent qualified enforcer alias ARNs (keyed by agent name). The agent's
  // credential can only invoke its own alias, so this is what the MCP client
  // uses as WRAPS_AGENT_ENFORCER_ARN.
  agentAliasArns?: Record<string, string>;
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
  preview?: boolean;
  quick?: boolean;
  json?: boolean;
  /** Continue past the pre-flight resource-conflict check without prompting. */
  force?: boolean;
};

/**
 * Command options for email test
 */
export type EmailTestOptions = {
  region?: string;
  to?: string;
  scenario?: "success" | "bounce" | "complaint" | "ooto" | "suppression_list";
  isSandbox?: boolean;
  postDeploy?: boolean;
  json?: boolean;
};

/**
 * Alert severity levels
 */
export type AlertSeverity = "warning" | "critical";

/**
 * Alert threshold configuration
 * All rates are expressed as decimals (e.g., 0.02 = 2%)
 */
export type AlertThresholds = {
  /** Bounce rate warning threshold (default: 0.02 = 2%) */
  bounceRateWarning?: number;
  /** Bounce rate critical threshold (default: 0.04 = 4%) */
  bounceRateCritical?: number;
  /** Complaint rate warning threshold (default: 0.0005 = 0.05%) */
  complaintRateWarning?: number;
  /** Complaint rate critical threshold (default: 0.0008 = 0.08%) */
  complaintRateCritical?: number;
  /** DLQ message count to trigger alarm (default: 1) */
  dlqMessageThreshold?: number;
};

/**
 * Default alert thresholds - designed to warn BEFORE AWS/Gmail take action
 *
 * AWS thresholds: Bounce 5% warning, 10% suspend | Complaint 0.1% warning, 0.5% suspend
 * Gmail: Blocks at 0.3% complaint rate
 *
 * Our thresholds give you time to fix issues before hitting these limits.
 */
export const DEFAULT_ALERT_THRESHOLDS: Required<AlertThresholds> = {
  bounceRateWarning: 0.02, // 2% - gives time before AWS 5% warning
  bounceRateCritical: 0.04, // 4% - urgent, approaching AWS warning
  complaintRateWarning: 0.0005, // 0.05% - half of AWS warning threshold
  complaintRateCritical: 0.0008, // 0.08% - urgent, approaching AWS 0.1% warning
  dlqMessageThreshold: 1, // Any failed message processing
};

/**
 * Alerting configuration
 */
export type AlertConfig = {
  /** Enable alerting (default: true for production/enterprise presets) */
  enabled: boolean;
  /** Email address for alert notifications */
  notificationEmail?: string;
  /** Webhook URL for alert notifications (Slack, Discord, PagerDuty, etc.) */
  webhookUrl?: string;
  /** Custom thresholds (uses sensible defaults if not specified) */
  thresholds?: AlertThresholds;
  /** Alert on DLQ messages (event processing failures) */
  dlqAlerts?: boolean;
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
  preview?: boolean;
  json?: boolean;
};

/**
 * Command options for email verify
 */
export type EmailVerifyOptions = {
  domain: string;
  wait?: boolean;
  interval?: number;
  json?: boolean;
};

/**
 * Command options for email upgrade
 */
export type EmailUpgradeOptions = {
  region?: string;
  yes?: boolean;
  preview?: boolean;
  json?: boolean;
  action?: string;
  preset?: string;
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
  preview?: boolean;
  json?: boolean;
};

/** @deprecated Use EmailConfigOptions instead */
export type EmailUpdateOptions = EmailConfigOptions;

/**
 * Command options for email restore
 */
export type EmailRestoreOptions = {
  region?: string;
  force?: boolean; // Destructive operation - restores previous configuration
  preview?: boolean;
  json?: boolean;
};

/**
 * Command options for email inbound init
 */
export type EmailInboundInitOptions = {
  region?: string;
  subdomain?: string;
  root?: boolean;
  webhookUrl?: string;
  yes?: boolean;
  preview?: boolean;
  json?: boolean;
};

/**
 * Command options for email inbound destroy
 */
export type EmailInboundDestroyOptions = {
  region?: string;
  force?: boolean;
  preview?: boolean;
  json?: boolean;
};

/**
 * Command options for email inbound status
 */
export type EmailInboundStatusOptions = {
  region?: string;
  json?: boolean;
  revealSecret?: boolean;
};

/**
 * Command options for email inbound verify
 */
export type EmailInboundVerifyOptions = {
  region?: string;
  json?: boolean;
};

/**
 * Command options for email inbound add
 */
export type EmailInboundAddOptions = {
  region?: string;
  subdomain?: string;
  root?: boolean;
  domain?: string; // parent domain
  yes?: boolean;
  json?: boolean;
};

/**
 * Command options for email inbound remove
 */
export type EmailInboundRemoveOptions = {
  region?: string;
  domain?: string; // receiving domain to remove
  yes?: boolean;
  json?: boolean;
};

/**
 * Command options for email inbound test
 */
export type EmailInboundTestOptions = {
  region?: string;
  json?: boolean;
};

/**
 * Command options for email agent create
 */
export type EmailAgentCreateOptions = {
  region?: string;
  name?: string;
  domain?: string;
  token?: string;
  yes?: boolean;
  json?: boolean;
};

/**
 * Command options for email agent list
 */
export type EmailAgentListOptions = {
  token?: string;
  json?: boolean;
};

/**
 * Command options for email agent kill
 */
export type EmailAgentKillOptions = {
  name?: string; // agent name or id
  token?: string;
  yes?: boolean;
  json?: boolean;
};

/**
 * Command options for email reply init
 */
export type EmailReplyInitOptions = {
  region?: string;
  domain?: string;
  all?: boolean;
  yes?: boolean;
  preview?: boolean;
  json?: boolean;
};

/**
 * Command options for email reply rotate
 */
export type EmailReplyRotateOptions = {
  region?: string;
  domain?: string;
  yes?: boolean;
  json?: boolean;
};

/**
 * Command options for email reply status
 */
export type EmailReplyStatusOptions = {
  region?: string;
  json?: boolean;
};

/**
 * Command options for email reply destroy
 */
export type EmailReplyDestroyOptions = {
  region?: string;
  domain?: string;
  all?: boolean;
  force?: boolean;
  preview?: boolean;
  json?: boolean;
};

/**
 * Command options for email reply decode (local-only)
 */
export type EmailReplyDecodeOptions = {
  address?: string;
  json?: boolean;
};
