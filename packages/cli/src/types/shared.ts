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
  | "6months"
  | "1year"
  | "18months"
  | "indefinite";

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
export type ServiceType = "email" | "sms" | "queue";

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
  yes?: boolean;
  service?: ServiceType; // Destroy specific service or all
};

/**
 * Command options for status
 */
export type StatusOptions = {
  account?: string;
  service?: ServiceType; // Show specific service or all
};
