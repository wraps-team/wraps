// Core email client

// Broadcast quota-stuck escalation
export type {
  BroadcastStuckContent,
  SendBroadcastStuckEmailParams,
} from "./emails/broadcast-stuck";
export {
  buildBroadcastStuckEmail,
  sendBroadcastStuckEmail,
} from "./emails/broadcast-stuck";
// Event feed staleness alert
export type {
  EventFeedStaleContent,
  SendEventFeedStaleEmailParams,
} from "./emails/event-feed-stale";
export {
  buildEventFeedStaleEmail,
  sendEventFeedStaleEmail,
} from "./emails/event-feed-stale";
// AWS Marketplace subscription confirmation
export type {
  MarketplaceWelcomeContent,
  SendMarketplaceWelcomeEmailParams,
} from "./emails/marketplace-welcome";
export {
  buildMarketplaceWelcomeEmail,
  sendMarketplaceWelcomeEmail,
} from "./emails/marketplace-welcome";
export { resolveAppUrl } from "./lib/app-url";
export type { SendEmailParams } from "./lib/client";
export { getWrapsClient, sendEmail } from "./lib/client";
// Confirmation tokens
export type { ConfirmationTokenPayload } from "./lib/confirmation-token";
export {
  generateConfirmationToken,
  generateConfirmationUrl,
  verifyConfirmationToken,
} from "./lib/confirmation-token";
export { escapeHtml } from "./lib/escape-html";
// AWS Marketplace signed link tokens
export type { MarketplaceLinkTokenPayload } from "./lib/marketplace-link-token";
export {
  generateMarketplaceLinkToken,
  verifyMarketplaceLinkToken,
} from "./lib/marketplace-link-token";
// SES templates
export type {
  SESCredentials,
  SESTemplateParams,
  SESTestRenderOutcome,
} from "./lib/ses-templates";
export {
  deleteSESTemplate,
  generateSESTemplateName,
  templateExists,
  testRenderSESTemplate,
  upsertSESTemplate,
} from "./lib/ses-templates";
// SES variable transformation
export {
  flattenVariablesForSes,
  toSesVariableName,
  transformVariablesForSes,
} from "./lib/ses-variables";
// Subscription service
export type {
  CreateSubscriptionParams,
  CreateSubscriptionResult,
} from "./lib/subscription-service";
export {
  determineSubscriptionStatus,
  sendTopicConfirmationEmail,
} from "./lib/subscription-service";
