/**
 * @wraps.dev/pulumi - Pulumi component for deploying Wraps email infrastructure
 *
 * Following SST's pattern of composition over presets:
 * - Minimal required config - just provide what you need
 * - Sensible defaults for everything else
 * - Transform functions for resource customization
 * - `.nodes` exposure for underlying resource access
 *
 * @example
 * ```typescript
 * import { WrapsEmail } from "@wraps.dev/pulumi";
 *
 * // Minimal - just Vercel OIDC for sending
 * const email = new WrapsEmail("email", {
 *   vercel: { teamSlug: "my-team", projectName: "my-app" },
 * });
 *
 * // With domain and event tracking
 * const email = new WrapsEmail("email", {
 *   vercel: { teamSlug: "my-team", projectName: "my-app" },
 *   domain: "example.com",
 *   events: {
 *     types: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "OPEN", "CLICK"],
 *     storeHistory: true,
 *     retention: "SIX_MONTHS",
 *   },
 * });
 *
 * // Export outputs
 * export const roleArn = email.roleArn;
 * export const configSetName = email.configSetName;
 * export const envVars = email.envVars;
 * ```
 *
 * @packageDocumentation
 */

// Main component
export { WrapsEmail } from "./email.js";
// Resource functions (for advanced users who want to compose their own)
export {
  // SES
  buildDeliveryOptions,
  convertToSMTPPassword,
  // ACM
  createACMCertificate,
  // CloudFront
  createCloudFrontTracking,
  // SES
  createConfigSet,
  createConfigSetV2,
  createCustomOIDCProvider,
  createDomainIdentity,
  createDomainIdentityV2,
  createEventBridgeRule,
  createEventDestination,
  // Lambda
  createEventProcessor,
  createEventQueues,
  createEventTracking,
  // Events
  createHistoryTable,
  createHTTPSTracking,
  // IAM
  createIAMRole,
  createMailFromAttributes,
  // Mail Manager
  createMailManagerArchive,
  createSESResources,
  // SMTP
  createSMTPCredentials,
  // OIDC
  createVercelOIDCProvider,
  resolveMatchingEventTypes,
} from "./resources/index.js";
// Types
export type {
  ArchiveRetention,
  ArchivingConfig,
  EventsConfig,
  OIDCConfig,
  ResolvedConfig,
  ResolvedTrackingConfig,
  // Enum types
  SESEventType,
  SMTPConfig,
  SuppressionListConfig,
  SuppressionReason,
  TrackingConfig,
  TransformFunctions,
  // Sub-config types
  VercelOIDCConfig,
  WebhookConfig,
  // Args and config types
  WrapsEmailArgs,
  // Output types
  WrapsEmailNodes,
  WrapsEmailOutputs,
} from "./types.js";
