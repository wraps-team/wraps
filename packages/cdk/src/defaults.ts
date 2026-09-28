import {
  type ArchiveRetention,
  DEFAULT_AUTO_VALIDATION_THRESHOLD,
  DEFAULT_EVENT_TYPES,
  DEFAULT_SUPPRESSION_REASONS,
} from "@wraps/core";
import * as cdk from "aws-cdk-lib";
import type { ResolvedConfig, WrapsEmailProps } from "./types.js";

// Re-export retentionToDays from core for convenience
export { retentionToDays } from "@wraps/core";

/**
 * Apply default values to WrapsEmailProps
 */
export function applyDefaults(props: WrapsEmailProps): ResolvedConfig {
  const suppressionList = {
    enabled: props.suppressionList?.enabled ?? true,
    reasons: props.suppressionList?.reasons ?? DEFAULT_SUPPRESSION_REASONS,
  };
  const autoValidation = props.autoValidation
    ? {
        enabled: props.autoValidation.enabled ?? true,
        threshold:
          props.autoValidation.threshold ?? DEFAULT_AUTO_VALIDATION_THRESHOLD,
      }
    : undefined;

  // SES stores Auto Validation inside the configuration set's suppression
  // options, so writing it without suppression reasons would cancel
  // suppression for this configuration set — fail fast rather than deploy
  // that silently.
  if (autoValidation?.enabled && !suppressionList.enabled) {
    throw new Error(
      "autoValidation requires suppressionList.enabled: true — SES stores Auto Validation inside the configuration set's suppression options, and writing it without suppression reasons would cancel suppression for this configuration set."
    );
  }

  return {
    vercel: props.vercel,
    oidc: props.oidc,
    domain: props.domain,
    hostedZoneId: props.hostedZoneId,
    mailFromSubdomain: props.mailFromSubdomain ?? "mail",
    tracking: {
      enabled: props.tracking?.enabled ?? true,
      opens: props.tracking?.opens ?? true,
      clicks: props.tracking?.clicks ?? true,
      customRedirectDomain: props.tracking?.customRedirectDomain,
      httpsEnabled: props.tracking?.httpsEnabled ?? false,
      wafEnabled: props.tracking?.wafEnabled ?? false,
    },
    events: props.events
      ? {
          types: props.events.types ?? DEFAULT_EVENT_TYPES,
          storeHistory: props.events.storeHistory ?? true,
          retention: (props.events.retention ?? "90days") as ArchiveRetention,
        }
      : undefined,
    archiving: props.archiving,
    smtp: props.smtp,
    suppressionList,
    autoValidation,
    reputationMetrics: props.reputationMetrics ?? true,
    tlsRequired: props.tlsRequired ?? false,
    dedicatedIp: props.dedicatedIp ?? false,
    managedDedicatedIps: props.managedDedicatedIps ?? false,
    sendingEnabled: props.sendingEnabled ?? true,
    webhook: props.webhook,
    removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.RETAIN,
  };
}
