// AWS Integration utilities for Wraps dashboard
// Handles secure credential management via IAM role assumption

export {
  type AssumedRoleCredentials,
  type AssumeRoleParams,
  assumeRole,
} from "./assume-role";
export {
  type CloudWatchErrorKind,
  classifyCloudWatchError,
  getCloudWatchErrorKind,
  getSESReputationMetrics,
  SES_METRICS,
} from "./cloudwatch";
export {
  clearCredentialCache,
  getOrAssumeRole,
  invalidateCredentials,
} from "./credential-cache";
export {
  getRecentSMSActivity,
  getSMSAccountAttributes,
  getSMSCloudWatchMetrics,
  getSMSConfigurationSets,
  getSMSMetricsSummary,
  getSMSPhoneNumbers,
  getSMSRegistrations,
  getSMSSpendLimits,
  querySMSEvents,
  SMS_METRICS,
  type SMSEvent,
} from "./sms-voice";
