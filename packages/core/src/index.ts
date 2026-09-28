/**
 * @wraps/core - Shared types, utilities, and Lambda code for Wraps IaC packages
 *
 * This package provides common functionality used by @wraps.dev/pulumi and @wraps.dev/cdk:
 * - Shared types (SESEventType, ArchiveRetention, config interfaces)
 * - Constants (default event types, resource naming)
 * - Utilities (SMTP password derivation, retention conversion)
 * - Lambda source code for event processing
 *
 * @packageDocumentation
 */

// Agent enforcer contract (Lambda ↔ API ↔ MCP)
export {
  type AgentConfigItem,
  type AgentEmailPayload,
  type AgentPolicy,
  configItemKey,
  dayCounterKey,
  type EnforcerAction,
  type EnforcerRequest,
  type EnforcerResponse,
  type EnforcerStatus,
  hourCounterKey,
  type ItemKey,
  isoDateWindow,
  isoHourWindow,
  type OutcomeRecord,
  outcomeItemKey,
} from "./agent-enforcer-contract.js";
// Constants
export {
  ALL_EVENT_TYPES,
  CONSOLE_ACCESS_ROLE_NAME,
  DEFAULT_CONFIG_SET_NAME,
  DEFAULT_EVENT_TYPES,
  DEFAULT_HISTORY_RETENTION,
  DEFAULT_MAIL_FROM_SUBDOMAIN,
  DEFAULT_SUPPRESSION_REASONS,
  DEFAULT_TAGS,
  EMAIL_ROLE_NAME,
  EVENTBRIDGE_RULE_NAME,
  EVENTS_ARCHIVE_NAME,
  EVENTS_DLQ_NAME,
  EVENTS_QUEUE_NAME,
  EXTERNAL_ID_PREFIX,
  HISTORY_TABLE_NAME,
  MANAGED_DEDICATED_IP_POOL_NAME,
  RESOURCE_PREFIX,
  SELFHOST_CONSOLE_ACCESS_ROLE_NAME,
  SES_EVENT_PATTERN,
  VERCEL_OIDC_THUMBPRINT,
  VERCEL_OIDC_URL,
} from "./constants.js";
// Reply-token codec
export {
  type DecodedReplyToken,
  decodeReplyToken,
  type EncodeReplyTokenInput,
  encodeReplyToken,
  generateConversationId,
  generateSendId,
  REPLY_TOKEN_VERSION,
  type ReplyTokenStatus,
  type VerifiedReplyToken,
  verifyReplyToken,
} from "./reply-token.js";
// Retention utilities
export {
  calculateTTL,
  retentionToAWSPeriod,
  retentionToDays,
} from "./retention.js";
// SES configuration-set suppression options (Auto Validation, plan 373) —
// the single builder every writer (CLI, CDK, Pulumi) shares.
export {
  AUTO_VALIDATION_THRESHOLDS,
  buildSuppressionOptions,
  DEFAULT_AUTO_VALIDATION_THRESHOLD,
  type SesSuppressionOptions,
} from "./ses-suppression.js";
// SMTP utilities
export {
  convertToSMTPPassword,
  getSMTPConnectionDetails,
  getSMTPEndpoint,
  type SMTPConnectionDetails,
} from "./smtp.js";
// Types
export type {
  ArchiveRetention,
  ArchivingConfig,
  AutoValidationConfig,
  AutoValidationThreshold,
  // DNS provider types
  CloudflareDNSConfig,
  DNSConfig,
  DNSProvider,
  DNSRecord,
  EventsConfig,
  OIDCConfig,
  // Resolved config types
  ResolvedTrackingConfig,
  Route53DNSConfig,
  // Event types
  SESEventType,
  SMTPConfig,
  SuppressionListConfig,
  SuppressionReason,
  // Feature config types
  TrackingConfig,
  VercelDNSConfig,
  // OIDC config types
  VercelOIDCConfig,
  WebhookConfig,
} from "./types.js";

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve a path relative to this package, compatible with both ESM and CJS.
 * In CJS (when bundled by tsup), __dirname is available.
 * In ESM, derive from import.meta.url.
 */
function resolvePackagePath(relativePath: string): string {
  const dir =
    typeof __dirname !== "undefined"
      ? __dirname
      : dirname(fileURLToPath(import.meta.url));
  return join(dir, "..", relativePath);
}

/**
 * Path to the pre-bundled email event processor Lambda code directory.
 * Use this when configuring Lambda functions in Pulumi or CDK.
 *
 * @example
 * ```typescript
 * import { LAMBDA_EVENT_PROCESSOR_PATH } from "@wraps/core";
 * import * as lambda from "aws-cdk-lib/aws-lambda";
 *
 * new lambda.Function(this, "Processor", {
 *   code: lambda.Code.fromAsset(LAMBDA_EVENT_PROCESSOR_PATH),
 *   // ...
 * });
 * ```
 */
export const LAMBDA_EVENT_PROCESSOR_PATH = resolvePackagePath(
  "lambda/event-processor"
);

/**
 * Path to the pre-bundled SMS event processor Lambda code directory.
 * Use this when configuring Lambda functions in Pulumi or CDK.
 *
 * @example
 * ```typescript
 * import { LAMBDA_SMS_EVENT_PROCESSOR_PATH } from "@wraps/core";
 * import * as lambda from "aws-cdk-lib/aws-lambda";
 *
 * new lambda.Function(this, "SMSProcessor", {
 *   code: lambda.Code.fromAsset(LAMBDA_SMS_EVENT_PROCESSOR_PATH),
 *   // ...
 * });
 * ```
 */
export const LAMBDA_SMS_EVENT_PROCESSOR_PATH = resolvePackagePath(
  "lambda/sms-event-processor"
);

// Auth email SES templates, and the publisher both self-hosted deploy paths use
export type { AuthSesTemplate } from "./auth-templates.js";
export { AUTH_SES_TEMPLATES } from "./auth-templates.js";
export type { ProvisionOutcome } from "./provision-auth-templates.js";
export {
  describeProvisionOutcomes,
  provisionAuthTemplates,
} from "./provision-auth-templates.js";
