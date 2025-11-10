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
  customTrackingDomain?: string;
};

/**
 * Create SES resources (configuration set, EventBridge event bus, domain identity)
 */
export async function createSESResources(
  config: SESResourcesConfig
): Promise<SESResources> {
  // Configuration set for tracking (using SESv2 which supports tags)
  const configSetOptions: aws.sesv2.ConfigurationSetArgs = {
    configurationSetName: "wraps-email-tracking",
    tags: {
      ManagedBy: "wraps-cli",
      Description: "Wraps email tracking configuration set",
    },
  };

  // Add custom tracking domain if provided
  if (config.trackingConfig?.customRedirectDomain) {
    configSetOptions.trackingOptions = {
      customRedirectDomain: config.trackingConfig.customRedirectDomain,
      httpsPolicy: "REQUIRE", // Always require HTTPS for security
    };
  }

  const configSet = new aws.sesv2.ConfigurationSet(
    "wraps-email-tracking",
    configSetOptions
  );

  // SES can only send to the default EventBridge bus
  // We'll use EventBridge rules to route from default bus to SQS
  // Get the default event bus (it always exists)
  const defaultEventBus = aws.cloudwatch.getEventBusOutput({
    name: "default",
  });

  // Event destination for all SES events -> EventBridge (default bus)
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
        // SES requires default bus - cannot use custom bus
        eventBusArn: defaultEventBus.arn,
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
    eventBus: defaultEventBus as any, // Return default bus reference
    domainIdentity,
    dkimTokens,
    dnsAutoCreated: false, // Will be set after deployment
    customTrackingDomain: config.trackingConfig?.customRedirectDomain,
  };
}
