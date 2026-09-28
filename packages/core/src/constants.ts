import type { SESEventType, SuppressionReason } from "./types.js";

/**
 * Default SES event types to track
 */
export const DEFAULT_EVENT_TYPES: SESEventType[] = [
  "SEND",
  "DELIVERY",
  "BOUNCE",
  "COMPLAINT",
  "OPEN",
  "CLICK",
];

/**
 * All available SES event types
 */
export const ALL_EVENT_TYPES: SESEventType[] = [
  "SEND",
  "DELIVERY",
  "OPEN",
  "CLICK",
  "BOUNCE",
  "COMPLAINT",
  "REJECT",
  "RENDERING_FAILURE",
  "DELIVERY_DELAY",
  "SUBSCRIPTION",
];

/**
 * Default suppression reasons
 */
export const DEFAULT_SUPPRESSION_REASONS: SuppressionReason[] = [
  "BOUNCE",
  "COMPLAINT",
];

/**
 * Default configuration set name
 */
export const DEFAULT_CONFIG_SET_NAME = "wraps-email-tracking";

/**
 * Default MAIL FROM subdomain
 */
export const DEFAULT_MAIL_FROM_SUBDOMAIN = "mail";

/**
 * Default retention period for email history
 */
export const DEFAULT_HISTORY_RETENTION = "90days";

/**
 * Vercel OIDC provider URL
 */
export const VERCEL_OIDC_URL = "https://oidc.vercel.com";

/**
 * Vercel OIDC thumbprint
 */
export const VERCEL_OIDC_THUMBPRINT =
  "a031c46782e6e6c662c2c87c76da9aa62ccabd8e";

/**
 * Resource naming prefix
 */
export const RESOURCE_PREFIX = "wraps-email";

/**
 * Physical AWS resource names shared by both email-stack implementations
 * (`packages/cli/src/infrastructure/resources/` and `packages/pulumi/src/resources/`).
 * A customer using either must see the same names in their AWS account —
 * `wraps email status`, the dashboard's feature detection, and every IAM
 * policy scoped to `wraps-email-*` all key off these strings. Defined once
 * here so divergence between the two implementations is impossible for
 * these values; see plan 183.
 */

/** EventBridge rule that routes all SES events to SQS */
export const EVENTBRIDGE_RULE_NAME = "wraps-email-events-to-sqs";

/** SQS queue that buffers SES events for the event-processor Lambda */
export const EVENTS_QUEUE_NAME = "wraps-email-events";

/** Dead letter queue for the events queue */
export const EVENTS_DLQ_NAME = "wraps-email-events-dlq";

/** IAM role the customer's own app/SDK assumes to send via SES */
export const EMAIL_ROLE_NAME = "wraps-email-role";

/** DynamoDB table storing email delivery history */
export const HISTORY_TABLE_NAME = "wraps-email-history";

/** 30-day EventBridge archive of raw SES events, for outage replay */
export const EVENTS_ARCHIVE_NAME = "wraps-email-events-archive";

/** SES managed dedicated IP pool Wraps creates when managedDedicatedIps is on */
export const MANAGED_DEDICATED_IP_POOL_NAME = "wraps-email-managed";

/**
 * EventBridge rule pattern matching all SES events on the default bus. No
 * `detail-type` filter — SES emits different detail-types per event type,
 * and both implementations deliberately capture all of them rather than
 * filtering, so a customer's own pipeline sees the full stream.
 */
export const SES_EVENT_PATTERN = { source: ["aws.ses"] } as const;

/**
 * Tags applied to all resources
 */
export const DEFAULT_TAGS = {
  ManagedBy: "wraps",
} as const;

/**
 * Prefix for ExternalId values baked into customer IAM trust policies.
 * NEVER change this — existing customer roles depend on it for sts:AssumeRole.
 */
export const EXTERNAL_ID_PREFIX = "wraps_";

/**
 * IAM role the Wraps platform assumes in a customer's AWS account for console
 * access (CloudWatch metrics, SES data). Trusts the Wraps platform account.
 * NEVER change this — every existing platform customer's deployed role uses it.
 */
export const CONSOLE_ACCESS_ROLE_NAME = "wraps-console-access-role";

/**
 * IAM role a SELF-HOSTED control plane assumes in the same account. Deliberately
 * distinct from CONSOLE_ACCESS_ROLE_NAME: an IAM trust policy names one
 * principal, so sharing one role forces the platform and a self-hosted install
 * to overwrite each other's trust policy and break the loser's dashboard.
 *
 * Both the API (which stores the role ARN) and the CLI (which creates the role)
 * must agree on this string — hence a shared constant rather than two literals.
 */
export const SELFHOST_CONSOLE_ACCESS_ROLE_NAME =
  "wraps-selfhost-console-access-role";
