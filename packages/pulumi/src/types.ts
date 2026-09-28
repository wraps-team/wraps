import type * as aws from "@pulumi/aws";
import type * as pulumi from "@pulumi/pulumi";

// Re-export shared types from core
export type {
  ArchiveRetention,
  ArchivingConfig,
  AutoValidationConfig,
  CloudflareDNSConfig,
  DNSConfig,
  DNSProvider,
  DNSRecord,
  EventsConfig,
  OIDCConfig,
  ResolvedTrackingConfig,
  Route53DNSConfig,
  SESEventType,
  SMTPConfig,
  SuppressionListConfig,
  SuppressionReason,
  TrackingConfig,
  VercelDNSConfig,
  VercelOIDCConfig,
  WebhookConfig,
} from "@wraps/core";

// Import for local use
import type {
  ArchivingConfig,
  AutoValidationConfig,
  DNSConfig,
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
 * Transform functions to customize underlying resources before creation.
 * Each function receives the default resource args and returns modified args.
 */
export type TransformFunctions = {
  /** Transform the IAM role resource */
  role?: (args: aws.iam.RoleArgs) => aws.iam.RoleArgs;
  /** Transform the OIDC provider resource */
  oidcProvider?: (
    args: aws.iam.OpenIdConnectProviderArgs
  ) => aws.iam.OpenIdConnectProviderArgs;
  /** Transform the SES configuration set resource */
  configSet?: (
    args: aws.ses.ConfigurationSetArgs
  ) => aws.ses.ConfigurationSetArgs;
  /** Transform the SES domain identity resource */
  domainIdentity?: (
    args: aws.ses.DomainIdentityArgs
  ) => aws.ses.DomainIdentityArgs;
  /** Transform the DynamoDB table resource */
  table?: (args: aws.dynamodb.TableArgs) => aws.dynamodb.TableArgs;
  /** Transform the SQS queue resource */
  queue?: (args: aws.sqs.QueueArgs) => aws.sqs.QueueArgs;
  /** Transform the SQS dead letter queue resource */
  dlq?: (args: aws.sqs.QueueArgs) => aws.sqs.QueueArgs;
  /** Transform the Lambda function resource */
  lambda?: (args: aws.lambda.FunctionArgs) => aws.lambda.FunctionArgs;
  /** Transform the EventBridge rule resource */
  eventRule?: (
    args: aws.cloudwatch.EventRuleArgs
  ) => aws.cloudwatch.EventRuleArgs;
  /** Transform the ACM certificate resource */
  certificate?: (args: aws.acm.CertificateArgs) => aws.acm.CertificateArgs;
  /** Transform the CloudFront distribution resource */
  distribution?: (
    args: aws.cloudfront.DistributionArgs
  ) => aws.cloudfront.DistributionArgs;
};

/**
 * Arguments for creating a WrapsEmail component.
 *
 * Following SST's pattern of composition over presets:
 * - Minimal required config - just provide what you need
 * - Sensible defaults for everything else
 * - Transform functions for resource customization
 * - `.nodes` exposure for underlying resource access
 */
export type WrapsEmailArgs = {
  /**
   * Vercel OIDC configuration for role assumption.
   * Required if deploying to Vercel.
   * Mutually exclusive with `oidc`.
   */
  vercel?: pulumi.Input<VercelOIDCConfig>;

  /**
   * Alternative OIDC provider configuration (GitHub Actions, GitLab, etc.)
   * Use this if not deploying to Vercel.
   * Mutually exclusive with `vercel`.
   */
  oidc?: pulumi.Input<OIDCConfig>;

  /**
   * Primary sending domain. If provided, creates SES domain identity with DKIM.
   * DKIM tokens will be output for DNS configuration.
   */
  domain?: pulumi.Input<string>;

  /**
   * DNS provider configuration for automatic DNS record creation.
   * Supports Route53, Cloudflare, and Vercel.
   * If not provided, DNS records are output for manual creation.
   *
   * @example Route53
   * ```typescript
   * dns: { provider: "route53", hostedZoneId: "Z1234567890" }
   * ```
   *
   * @example Cloudflare
   * ```typescript
   * dns: { provider: "cloudflare", zoneId: "abc123", apiToken: pulumi.secret("token") }
   * ```
   *
   * @example Vercel
   * ```typescript
   * dns: { provider: "vercel", apiToken: pulumi.secret("token"), teamId: "team_xxx" }
   * ```
   */
  dns?: pulumi.Input<DNSConfig>;

  /**
   * MAIL FROM subdomain for improved deliverability.
   * Combined with domain: "mail" + "example.com" = "mail.example.com"
   * @default "mail" (if domain is provided)
   */
  mailFromSubdomain?: pulumi.Input<string>;

  /**
   * Open/click tracking configuration.
   * @default { enabled: true, opens: true, clicks: true }
   */
  tracking?: pulumi.Input<TrackingConfig>;

  /**
   * Event tracking and history storage.
   * When enabled, deploys EventBridge → SQS → Lambda → DynamoDB pipeline.
   */
  events?: pulumi.Input<EventsConfig>;

  /**
   * Email archiving via AWS Mail Manager.
   * Stores full email content for compliance/debugging.
   */
  archiving?: pulumi.Input<ArchivingConfig>;

  /**
   * SMTP credentials for legacy systems (WordPress, PHP, etc.)
   * Creates IAM user with SES send permissions.
   * Credentials are shown once at creation - store securely!
   */
  smtp?: pulumi.Input<SMTPConfig>;

  /**
   * Suppression list configuration.
   * Automatically suppresses recipients who bounce or complain.
   * @default { enabled: true, reasons: ["BOUNCE", "COMPLAINT"] }
   */
  suppressionList?: pulumi.Input<SuppressionListConfig>;

  /**
   * SES Auto Validation for the configuration set. Included on SES
   * Pro/Enterprise; an add-on otherwise. Stored inside the configuration
   * set's suppression options, so it requires `suppressionList.enabled`
   * (the default).
   */
  autoValidation?: pulumi.Input<AutoValidationConfig>;

  /**
   * Enable SES reputation metrics dashboard.
   * @default true
   */
  reputationMetrics?: pulumi.Input<boolean>;

  /**
   * Require TLS encryption for all outbound emails.
   * @default false
   */
  tlsRequired?: pulumi.Input<boolean>;

  /**
   * Enable dedicated IP address.
   * Adds ~$25/month to AWS costs.
   * @default false
   */
  dedicatedIp?: pulumi.Input<boolean>;

  /**
   * Enable sending on the SES configuration set.
   * @default true
   */
  sendingEnabled?: pulumi.Input<boolean>;

  /**
   * Webhook configuration for Wraps platform integration.
   * Forwards events to Wraps dashboard for unified analytics.
   * Only needed if using Wraps hosted dashboard.
   */
  webhook?: pulumi.Input<WebhookConfig>;

  /**
   * Tags to apply to all resources.
   */
  tags?: pulumi.Input<Record<string, string>>;

  /**
   * Transform functions to customize underlying resources.
   * Receives the resource args before creation, return modified args.
   */
  transform?: TransformFunctions;
};

/**
 * Resolved configuration after applying defaults
 */
export type ResolvedConfig = {
  vercel?: VercelOIDCConfig;
  oidc?: OIDCConfig;
  domain?: string;
  dns?: DNSConfig;
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
  sendingEnabled: boolean;
  webhook?: WebhookConfig;
  tags: Record<string, string>;
};

/**
 * Nodes exposed by the WrapsEmail component
 */
export type WrapsEmailNodes = {
  /** IAM role for SDK authentication */
  role: aws.iam.Role;
  /** OIDC provider (if Vercel or custom OIDC) */
  oidcProvider?: aws.iam.OpenIdConnectProvider;
  /** SES configuration set */
  configSet: aws.ses.ConfigurationSet;
  /** SES domain identity (if domain is provided) */
  domainIdentity?: aws.ses.DomainIdentity;
  /** DKIM records (if domain is provided) */
  domainDkim?: aws.ses.DomainDkim;
  /** DynamoDB table for email history (if events.storeHistory is true) */
  table?: aws.dynamodb.Table;
  /** SQS queue for events (if events is configured) */
  queue?: aws.sqs.Queue;
  /** SQS dead letter queue (if events is configured) */
  dlq?: aws.sqs.Queue;
  /** Lambda function for event processing (if events.storeHistory is true) */
  lambda?: aws.lambda.Function;
  /** EventBridge rule (if events is configured) */
  eventRule?: aws.cloudwatch.EventRule;
  /** ACM certificate (if tracking.httpsEnabled is true) */
  certificate?: aws.acm.Certificate;
  /** CloudFront distribution (if tracking.httpsEnabled is true) */
  distribution?: aws.cloudfront.Distribution;
  /** SMTP IAM user (if smtp.enabled is true) */
  smtpUser?: aws.iam.User;
  /** SMTP access key (if smtp.enabled is true) */
  smtpAccessKey?: aws.iam.AccessKey;
};

/**
 * Outputs from the WrapsEmail component
 */
export type WrapsEmailOutputs = {
  /** IAM role ARN for SDK authentication */
  roleArn: pulumi.Output<string>;
  /** AWS region */
  region: pulumi.Output<string>;
  /** SES configuration set name */
  configSetName: pulumi.Output<string>;
  /** Primary domain (if configured) */
  domain: pulumi.Output<string | undefined>;
  /** DKIM tokens for DNS configuration */
  dkimTokens: pulumi.Output<string[] | undefined>;
  /** MAIL FROM domain (if configured) */
  mailFromDomain: pulumi.Output<string | undefined>;
  /** DynamoDB table name for email history */
  tableName: pulumi.Output<string | undefined>;
  /** SQS queue URL for events */
  queueUrl: pulumi.Output<string | undefined>;
  /** SQS dead letter queue URL */
  dlqUrl: pulumi.Output<string | undefined>;
  /** Lambda function ARN */
  lambdaArn: pulumi.Output<string | undefined>;
  /** Custom tracking domain (if configured) */
  customTrackingDomain: pulumi.Output<string | undefined>;
  /** Whether HTTPS tracking is enabled */
  httpsTrackingEnabled: pulumi.Output<boolean>;
  /** CloudFront distribution domain (if HTTPS tracking enabled) */
  cloudFrontDomain: pulumi.Output<string | undefined>;
  /** ACM certificate validation records (if HTTPS tracking enabled) */
  acmCertificateValidationRecords: pulumi.Output<
    Array<{ name: string; type: string; value: string }> | undefined
  >;
  /** Mail Manager Archive ARN (if archiving enabled) */
  archiveArn: pulumi.Output<string | undefined>;
  /** Whether archiving is enabled */
  archivingEnabled: pulumi.Output<boolean>;
  /** SMTP IAM user ARN (if SMTP enabled) */
  smtpUserArn: pulumi.Output<string | undefined>;
  /** SMTP username (IAM access key ID) - shown once! */
  smtpUsername: pulumi.Output<string | undefined>;
  /** SMTP password (derived from secret key) - shown once! */
  smtpPassword: pulumi.Output<string | undefined>;
  /** SMTP endpoint */
  smtpEndpoint: pulumi.Output<string | undefined>;
  /** Environment variables to set in your application */
  envVars: pulumi.Output<{
    WRAPS_AWS_ROLE_ARN: string;
    WRAPS_AWS_REGION: string;
    WRAPS_CONFIG_SET?: string;
  }>;
};
