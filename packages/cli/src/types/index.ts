/**
 * Central type exports for Wraps CLI
 * This file maintains backwards compatibility while supporting multi-service architecture
 */

// Re-export email types
export type {
  EmailConfigPreset,
  EmailConnectOptions,
  EmailFeatureCostBreakdown,
  EmailInitOptions,
  EmailRestoreOptions,
  EmailStackConfig,
  EmailStackOutputs,
  EmailUpdateOptions,
  EmailUpgradeOptions,
  EmailVerifyOptions,
  SESEventType,
  SuppressionReason,
  WrapsEmailConfig,
  WrapsEmailFeature,
  WrapsEmailFeatureMetadata,
} from "./email.js";
// Re-export shared types
export type {
  ArchiveRetention,
  ConsoleOptions,
  DestroyOptions,
  FeatureCost,
  Provider,
  ServiceType,
  StatusOptions,
} from "./shared.js";

// Re-export SMS types
export type {
  PhoneNumberType,
  SMSConfigPreset,
  SMSConnectOptions,
  SMSEventType,
  SMSFeatureCostBreakdown,
  SMSInitOptions,
  SMSStackConfig,
  SMSStackOutputs,
  SMSUpdateOptions,
  SMSUpgradeOptions,
  SMSVerifyOptions,
  WrapsSMSConfig,
  WrapsSMSFeature,
  WrapsSMSFeatureMetadata,
} from "./sms.js";

// Backwards compatibility aliases (deprecated, use specific types instead)
// Import specific types for legacy aliases
import type {
  EmailConfigPreset,
  EmailConnectOptions,
  EmailFeatureCostBreakdown,
  EmailInitOptions,
  EmailStackOutputs,
  EmailUpdateOptions,
  EmailUpgradeOptions,
  EmailVerifyOptions,
  WrapsEmailFeature,
  WrapsEmailFeatureMetadata,
} from "./email.js";

/** @deprecated Use EmailConfigPreset instead */
export type ConfigPreset = EmailConfigPreset;

/** @deprecated Use EmailFeatureCostBreakdown instead */
export type FeatureCostBreakdown = EmailFeatureCostBreakdown;

/** @deprecated Use EmailStackOutputs instead */
export type StackOutputs = EmailStackOutputs;

/** @deprecated Use EmailInitOptions instead */
export type InitOptions = EmailInitOptions;

/** @deprecated Use WrapsEmailFeature instead */
export type WrapsFeature = WrapsEmailFeature;

/** @deprecated Use WrapsEmailFeatureMetadata instead */
export type WrapsFeatureMetadata = WrapsEmailFeatureMetadata;

/** @deprecated Use EmailConnectOptions instead */
export type ConnectOptions = EmailConnectOptions;

/** @deprecated Use EmailVerifyOptions instead */
export type VerifyOptions = EmailVerifyOptions;

/** @deprecated Use EmailUpgradeOptions instead */
export type UpgradeOptions = EmailUpgradeOptions;

/** @deprecated Use EmailUpdateOptions instead */
export type UpdateOptions = EmailUpdateOptions;
