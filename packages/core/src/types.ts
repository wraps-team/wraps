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
 * Archive retention periods
 */
export type ArchiveRetention =
  | "7days"
  | "30days"
  | "90days"
  | "3months"
  | "6months"
  | "9months"
  | "1year"
  | "18months"
  | "2years"
  | "30months"
  | "3years"
  | "4years"
  | "5years"
  | "6years"
  | "7years"
  | "8years"
  | "9years"
  | "10years"
  | "indefinite"
  | "permanent";

/**
 * Vercel OIDC configuration for role assumption
 */
export type VercelOIDCConfig = {
  /** Vercel team slug (e.g., "my-team") */
  teamSlug: string;
  /** Vercel project name (e.g., "my-app") */
  projectName: string;
};

/**
 * Alternative OIDC provider configuration (GitHub Actions, GitLab, etc.)
 */
export type OIDCConfig = {
  /** OIDC provider URL (e.g., "https://token.actions.githubusercontent.com") */
  providerUrl: string;
  /** Audience/client ID for the OIDC provider */
  audience: string;
  /** Subject claim pattern for role assumption */
  subjectPattern: string;
};

/**
 * Open/click tracking configuration
 */
export type TrackingConfig = {
  /** Enable tracking (creates SES configuration set) @default true */
  enabled?: boolean;
  /** Track email opens @default true */
  opens?: boolean;
  /** Track link clicks @default true */
  clicks?: boolean;
  /**
   * Custom redirect domain for tracking links (e.g., "track.example.com").
   *
   * Requires `httpsEnabled: true` in practice. Without it the configuration
   * set is written with SES's `OPTIONAL` HTTPS policy, which wraps click links
   * in the original link's protocol — so an `https://` link resolves against
   * this domain, which CNAMEs to `r.<region>.awstrack.me` and presents a
   * certificate covering only `*.r.<region>.awstrack.me`. Recipients get a
   * certificate warning instead of the destination.
   */
  customRedirectDomain?: string;
  /**
   * Enable HTTPS for the custom tracking domain (deploys CloudFront + ACM).
   *
   * @default false — but set it to `true` whenever `customRedirectDomain` is
   * set, unless every link you send is plain, unencrypted HTTP.
   */
  httpsEnabled?: boolean;
  /** Enable AWS WAF with rate limiting for HTTPS tracking CDN */
  wafEnabled?: boolean;
};

/**
 * Event tracking and history storage configuration
 */
export type EventsConfig = {
  /** Event types to track @default ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "OPEN", "CLICK"] */
  types?: SESEventType[];
  /** Store events in DynamoDB for history queries @default true */
  storeHistory?: boolean;
  /** History retention period @default "90days" */
  retention?: ArchiveRetention;
};

/**
 * Email archiving configuration (AWS Mail Manager)
 */
export type ArchivingConfig = {
  /** Enable email archiving @default false */
  enabled?: boolean;
  /** Retention period for archived emails @default "1year" */
  retention?: ArchiveRetention;
};

/**
 * SMTP credentials configuration
 */
export type SMTPConfig = {
  /** Enable SMTP credential creation @default false */
  enabled?: boolean;
};

/**
 * Suppression list configuration
 */
export type SuppressionListConfig = {
  /** Enable suppression list @default true */
  enabled?: boolean;
  /** Reasons to add to suppression list @default ["BOUNCE", "COMPLAINT"] */
  reasons?: SuppressionReason[];
};

/**
 * Webhook configuration for Wraps platform integration
 */
export type WebhookConfig = {
  /** Your 12-digit AWS account ID */
  awsAccountNumber: string;
  /** API key for webhook authentication */
  webhookSecret: string;
  /** Override webhook URL (defaults to api.wraps.dev) */
  webhookUrl?: string;
};

/**
 * Resolved tracking configuration (with defaults applied)
 */
export type ResolvedTrackingConfig = {
  enabled: boolean;
  opens: boolean;
  clicks: boolean;
  customRedirectDomain?: string;
  httpsEnabled: boolean;
  wafEnabled: boolean;
};

// ============================================
// DNS PROVIDER TYPES
// ============================================

/**
 * Supported DNS providers
 */
export type DNSProvider = "route53" | "cloudflare" | "vercel";

/**
 * AWS Route53 DNS configuration
 */
export type Route53DNSConfig = {
  provider: "route53";
  /** Route53 hosted zone ID */
  hostedZoneId: string;
};

/**
 * Cloudflare DNS configuration
 */
export type CloudflareDNSConfig = {
  provider: "cloudflare";
  /** Cloudflare zone ID */
  zoneId: string;
  /** Cloudflare API token with DNS edit permissions */
  apiToken: string;
};

/**
 * Vercel DNS configuration
 */
export type VercelDNSConfig = {
  provider: "vercel";
  /** Vercel team ID (optional, uses personal account if not provided) */
  teamId?: string;
  /** Vercel API token */
  apiToken: string;
};

/**
 * DNS configuration - union of all provider configs
 */
export type DNSConfig =
  | Route53DNSConfig
  | CloudflareDNSConfig
  | VercelDNSConfig;

/**
 * DNS record to be created
 */
export type DNSRecord = {
  /** Record name (e.g., "_domainkey.example.com") */
  name: string;
  /** Record type */
  type: "CNAME" | "TXT" | "MX";
  /** Record value */
  value: string;
  /** TTL in seconds @default 1800 */
  ttl?: number;
  /** Priority (for MX records) */
  priority?: number;
};
