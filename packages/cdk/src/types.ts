import type * as cdk from "aws-cdk-lib";
import type * as acm from "aws-cdk-lib/aws-certificatemanager";
import type * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import type * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import type * as events from "aws-cdk-lib/aws-events";
import type * as iam from "aws-cdk-lib/aws-iam";
import type * as lambda from "aws-cdk-lib/aws-lambda";
import type * as ses from "aws-cdk-lib/aws-ses";
import type * as sqs from "aws-cdk-lib/aws-sqs";

// Re-export shared types from core
export type {
  ArchiveRetention,
  ArchivingConfig,
  AutoValidationConfig,
  EventsConfig,
  OIDCConfig,
  ResolvedTrackingConfig,
  SESEventType,
  SMTPConfig,
  SuppressionListConfig,
  SuppressionReason,
  TrackingConfig,
  VercelOIDCConfig,
  WebhookConfig,
} from "@wraps/core";

// Import for local use
import type {
  ArchivingConfig,
  AutoValidationConfig,
  EventsConfig,
  OIDCConfig,
  ResolvedTrackingConfig,
  SMTPConfig,
  SuppressionListConfig,
  TrackingConfig,
  VercelOIDCConfig,
  WebhookConfig,
} from "@wraps/core";

/**
 * Props for creating a WrapsEmail construct.
 *
 * Following SST's pattern of composition over presets:
 * - Minimal required config - just provide what you need
 * - Sensible defaults for everything else
 * - Override props for resource customization
 * - Direct resource access for advanced use cases
 */
export type WrapsEmailProps = {
  /**
   * Vercel OIDC configuration for role assumption.
   * Required if deploying to Vercel.
   * Mutually exclusive with `oidc`.
   */
  vercel?: VercelOIDCConfig;

  /**
   * Alternative OIDC provider configuration (GitHub Actions, GitLab, etc.)
   * Use this if not deploying to Vercel.
   * Mutually exclusive with `vercel`.
   */
  oidc?: OIDCConfig;

  /**
   * Primary sending domain. If provided, creates SES domain identity with DKIM.
   * DKIM tokens will be output for DNS configuration.
   */
  domain?: string;

  /**
   * Route53 hosted zone ID for automatic DNS record creation.
   * If provided, automatically creates DKIM, SPF, DMARC, and MAIL FROM records.
   * If not provided, DNS records are output for manual creation.
   */
  hostedZoneId?: string;

  /**
   * MAIL FROM subdomain for improved deliverability.
   * Combined with domain: "mail" + "example.com" = "mail.example.com"
   * @default "mail" (if domain is provided)
   */
  mailFromSubdomain?: string;

  /**
   * Open/click tracking configuration.
   * @default { enabled: true, opens: true, clicks: true }
   */
  tracking?: TrackingConfig;

  /**
   * Event tracking and history storage.
   * When enabled, deploys EventBridge → SQS → Lambda → DynamoDB pipeline.
   */
  events?: EventsConfig;

  /**
   * Email archiving via AWS Mail Manager.
   * Stores full email content for compliance/debugging.
   */
  archiving?: ArchivingConfig;

  /**
   * SMTP credentials for legacy systems (WordPress, PHP, etc.)
   * Creates IAM user with SES send permissions.
   * Credentials are shown once at creation - store securely!
   */
  smtp?: SMTPConfig;

  /**
   * Suppression list configuration.
   * Automatically suppresses recipients who bounce or complain.
   * @default { enabled: true, reasons: ["BOUNCE", "COMPLAINT"] }
   */
  suppressionList?: SuppressionListConfig;

  /**
   * SES Auto Validation for the configuration set. Included on SES
   * Pro/Enterprise; an add-on otherwise. Stored inside the configuration
   * set's suppression options, so it requires `suppressionList.enabled`
   * (the default).
   */
  autoValidation?: AutoValidationConfig;

  /**
   * Enable SES reputation metrics dashboard.
   * @default true
   */
  reputationMetrics?: boolean;

  /**
   * Require TLS encryption for all outbound emails.
   * @default false
   */
  tlsRequired?: boolean;

  /**
   * @deprecated Has no effect — no dedicated IP is provisioned. Kept so
   * existing code still compiles.
   */
  dedicatedIp?: boolean;

  /**
   * Route the configuration set through an SES managed dedicated IP pool
   * named wraps-email-managed. Included on the SES Pro and Enterprise
   * plans; billed as an add-on otherwise.
   * @default false
   */
  managedDedicatedIps?: boolean;

  /**
   * Enable sending on the SES configuration set.
   * @default true
   */
  sendingEnabled?: boolean;

  /**
   * Webhook configuration for Wraps platform integration.
   * Forwards events to Wraps dashboard for unified analytics.
   * Only needed if using Wraps hosted dashboard.
   */
  webhook?: WebhookConfig;

  /**
   * Removal policy for stateful resources (DynamoDB table, etc.)
   * @default cdk.RemovalPolicy.RETAIN
   */
  removalPolicy?: cdk.RemovalPolicy;
};

/**
 * Resolved configuration after applying defaults
 */
export type ResolvedConfig = {
  vercel?: VercelOIDCConfig;
  oidc?: OIDCConfig;
  domain?: string;
  hostedZoneId?: string;
  mailFromSubdomain: string;
  tracking: ResolvedTrackingConfig;
  events?: EventsConfig;
  archiving?: ArchivingConfig;
  smtp?: SMTPConfig;
  suppressionList: Required<SuppressionListConfig>;
  autoValidation?: Required<AutoValidationConfig>;
  reputationMetrics: boolean;
  tlsRequired: boolean;
  dedicatedIp: boolean;
  managedDedicatedIps: boolean;
  sendingEnabled: boolean;
  webhook?: WebhookConfig;
  removalPolicy: cdk.RemovalPolicy;
};

/**
 * Resources exposed by the WrapsEmail construct
 */
export type WrapsEmailResources = {
  /** IAM role for SDK authentication */
  role: iam.IRole;
  /** OIDC provider (if Vercel or custom OIDC) */
  oidcProvider?: iam.IOpenIdConnectProvider;
  /** SES configuration set */
  configSet: ses.IConfigurationSet;
  /** SES email identity (if domain is provided) */
  emailIdentity?: ses.IEmailIdentity;
  /** DynamoDB table for email history (if events.storeHistory is true) */
  table?: dynamodb.ITable;
  /** SQS queue for events (if events is configured) */
  queue?: sqs.IQueue;
  /** SQS dead letter queue (if events is configured) */
  dlq?: sqs.IQueue;
  /** Lambda function for event processing (if events.storeHistory is true) */
  eventProcessor?: lambda.IFunction;
  /** EventBridge rule (if events is configured) */
  eventRule?: events.IRule;
  /** ACM certificate (if tracking.httpsEnabled is true) */
  certificate?: acm.ICertificate;
  /** CloudFront distribution (if tracking.httpsEnabled is true) */
  distribution?: cloudfront.IDistribution;
  /** SMTP IAM user (if smtp.enabled is true) */
  smtpUser?: iam.IUser;
  /** SMTP access key (if smtp.enabled is true) */
  smtpAccessKey?: iam.AccessKey;
  /** EventBridge Connection for webhook (if webhook is configured) */
  webhookConnection?: events.IConnection;
  /** EventBridge API Destination for webhook (if webhook is configured) */
  webhookApiDestination?: events.IApiDestination;
  /** SES managed dedicated IP pool (if managedDedicatedIps is true) */
  dedicatedIpPool?: ses.IDedicatedIpPool;
};
