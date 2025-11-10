import * as aws from "@pulumi/aws";
import type { SESEventType } from "../../types/index.js";

/**
 * SES resources configuration
 */
export type SESResourcesConfig = {
  domain?: string;
  region: string;
  trackingConfig?: {
    enabled: boolean;
    opens?: boolean;
    clicks?: boolean;
    customRedirectDomain?: string;
  };
  eventTypes?: SESEventType[];
};

/**
 * SES resources output
 */
export type SESResources = {
  configSet: aws.sesv2.ConfigurationSet;
  eventBus: aws.cloudwatch.EventBus;
  domainIdentity?: aws.sesv2.EmailIdentity;
  dkimTokens?: string[];
  dnsAutoCreated?: boolean;
};

/**
 * Create SES resources (configuration set, EventBridge event bus, domain identity)
 */
export async function createSESResources(
  config: SESResourcesConfig
): Promise<SESResources> {
  // Configuration set for tracking (using SESv2 which supports tags)
  const configSet = new aws.sesv2.ConfigurationSet("wraps-email-tracking", {
    configurationSetName: "wraps-email-tracking",
    tags: {
      ManagedBy: "wraps-cli",
      Description: "Wraps email tracking configuration set",
    },
  });

  // Create custom EventBridge event bus for SES events
  const eventBus = new aws.cloudwatch.EventBus("wraps-email-events", {
    name: "wraps-email-events",
    tags: {
      ManagedBy: "wraps-cli",
      Description: "EventBridge bus for SES email events",
    },
  });

  // Event destination for all SES events -> EventBridge
  new aws.sesv2.ConfigurationSetEventDestination("wraps-email-all-events", {
    configurationSetName: configSet.configurationSetName,
    eventDestinationName: "wraps-email-eventbridge",
    eventDestination: {
      enabled: true,
      matchingEventTypes: [
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
      ],
      eventBridgeDestination: {
        eventBusArn: eventBus.arn,
      },
    },
  });

  // Optional: Verify domain if provided
  let domainIdentity: aws.sesv2.EmailIdentity | undefined;
  let dkimTokens: string[] | undefined;

  if (config.domain) {
    // Use SES v2 API to create email identity with configuration set
    domainIdentity = new aws.sesv2.EmailIdentity("wraps-email-domain", {
      emailIdentity: config.domain,
      configurationSetName: configSet.configurationSetName, // Link configuration set to domain
      dkimSigningAttributes: {
        nextSigningKeyLength: "RSA_2048_BIT",
      },
      tags: {
        ManagedBy: "wraps-cli",
      },
    });

    // Extract DKIM tokens for DNS configuration
    dkimTokens = domainIdentity.dkimSigningAttributes.apply(
      (attrs) => attrs?.tokens || []
    ) as any;
  }

  return {
    configSet,
    eventBus,
    domainIdentity,
    dkimTokens,
    dnsAutoCreated: false, // Will be set after deployment
  };
}
