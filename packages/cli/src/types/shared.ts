/**
 * Shared types used across all Wraps services
 */

/**
 * Hosting provider type
 */
export type Provider = "vercel" | "aws" | "railway" | "other";

/**
 * Archive retention periods for email data and email archiving
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
 * Cost information for a feature
 */
export type FeatureCost = {
  monthly: number; // Base monthly cost in USD
  perEmail?: number; // Additional cost per email
  perEvent?: number; // Additional cost per event
  perMessage?: number; // Additional cost per SMS/message
  description: string;
};

/**
 * Service type identifier
 */
export type ServiceType = "email" | "sms" | "cdn" | "queue" | "selfhost";

/**
 * Command options for console
 */
export type ConsoleOptions = {
  port?: number;
  noOpen?: boolean;
};

/**
 * Command options for destroy
 */
export type DestroyOptions = {
  force?: boolean; // Destructive operation
  region?: string;
  service?: ServiceType; // Destroy specific service or all
  preview?: boolean;
  json?: boolean;
};

/**
 * Command options for status
 */
export type StatusOptions = {
  account?: string;
  region?: string;
  service?: ServiceType; // Show specific service or all
  json?: boolean;
};

/**
 * Command options for dashboard
 */
export type DashboardOptions = {
  port?: number;
  noOpen?: boolean;
};

/**
 * Command options for updating dashboard access role
 */
export type UpdateRoleOptions = {
  region?: string;
  force?: boolean; // Skip confirmation prompt
  json?: boolean;
  selfhosted?: boolean; // Target the self-hosted console role instead of the platform's
};

/**
 * Command options for platform connect
 */
export type PlatformConnectOptions = {
  region?: string;
  force?: boolean; // Skip confirmation prompts
  yes?: boolean; // Auto-confirm non-destructive operations
  json?: boolean; // Output as JSON (suppress interactive output)
  selfhosted?: boolean; // Target the self-hosted instance instead of the Wraps Platform
};

/**
 * Command options for platform disconnect
 */
export type PlatformDisconnectOptions = {
  region?: string;
  force?: boolean; // Skip the confirmation prompt
  yes?: boolean; // Auto-confirm (same effect as force here; parity with connect)
  json?: boolean; // Output as JSON (suppress interactive output)
};
