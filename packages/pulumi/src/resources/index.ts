// OIDC providers

// Re-export SMTP utilities from core
export { convertToSMTPPassword, getSMTPEndpoint } from "@wraps/core";
// ACM certificate resources
export { type ACMResult, createACMCertificate } from "./acm.js";
// SES Auto Validation resources
export { createConfigSetAutoValidation } from "./auto-validation.js";
// CloudFront resources
export {
  type CloudFrontResult,
  createCloudFrontTracking,
  createHTTPSTracking,
} from "./cloudfront.js";
// DNS provider resources
export { createDNSRecords, type EmailDNSRecords } from "./dns.js";

// Event tracking resources (DynamoDB, SQS, EventBridge)
export {
  createEventBridgeRule,
  createEventQueues,
  createEventTracking,
  createHistoryTable,
  type DynamoDBResult,
  type EventBridgeResult,
  type SQSResult,
} from "./events.js";
// IAM resources
export {
  createIAMRole,
  type IAMRoleConfig,
  type IAMRoleResult,
} from "./iam.js";
// Lambda resources
export { createEventProcessor, type LambdaResult } from "./lambda.js";
// Mail Manager archive resources
export {
  createMailManagerArchive,
  type MailManagerResult,
} from "./mail-manager.js";
export {
  createCustomOIDCProvider,
  createVercelOIDCProvider,
  type OIDCProviderResult,
} from "./oidc.js";
// SES resources
export {
  createConfigSet,
  createConfigSetV2,
  createDomainIdentity,
  createDomainIdentityV2,
  createEventDestination,
  createMailFromAttributes,
  createSESResources,
  resolveMatchingEventTypes,
  type SESResourcesResult,
} from "./ses.js";
// SMTP credentials resources
export { createSMTPCredentials, type SMTPResult } from "./smtp.js";
