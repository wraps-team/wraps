import * as aws from "@pulumi/aws";
import type { SESEventType } from "../../types/index.js";

/**
 * SES resources configuration
 */
export type SESResourcesConfig = {
  domain?: string;
  mailFromDomain?: string;
  region: string;
  trackingConfig?: {
    enabled: boolean;
    opens?: boolean;
    clicks?: boolean;
    customRedirectDomain?: string;
    httpsEnabled?: boolean;
  };
  eventTypes?: SESEventType[];
  eventTrackingEnabled?: boolean; // NEW: Whether to create EventBridge event destination
  tlsRequired?: boolean; // Require TLS encryption for all emails
};

/**
 * Check if SES configuration set exists
 */
async function configurationSetExists(
  configSetName: string,
  region: string
): Promise<boolean> {
  try {
    const { SESv2Client, GetConfigurationSetCommand } = await import(
      "@aws-sdk/client-sesv2"
    );
    const ses = new SESv2Client({ region });

    await ses.send(
      new GetConfigurationSetCommand({ ConfigurationSetName: configSetName })
    );
    return true;
  } catch (error: any) {
    if (error.name === "NotFoundException") {
      return false;
    }
    console.error("Error checking for existing configuration set:", error);
    return false;
  }
}

/**
 * Check if email identity exists
 */
async function emailIdentityExists(
  emailIdentity: string,
  region: string
): Promise<boolean> {
  try {
    const { SESv2Client, GetEmailIdentityCommand } = await import(
      "@aws-sdk/client-sesv2"
    );
    const ses = new SESv2Client({ region });

    await ses.send(
      new GetEmailIdentityCommand({ EmailIdentity: emailIdentity })
    );
    return true;
  } catch (error: any) {
    if (error.name === "NotFoundException") {
      return false;
    }
    console.error("Error checking for existing email identity:", error);
    return false;
  }
}

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
  mailFromDomain?: string;
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
    deliveryOptions: config.tlsRequired
      ? {
          tlsPolicy: "REQUIRE", // Require TLS 1.2+ for all emails
        }
      : undefined,
    tags: {
      ManagedBy: "wraps-cli",
      Description: "Wraps email tracking configuration set",
    },
  };

  // Add custom tracking domain if provided
  // Note: The tracking domain only needs a CNAME DNS record
  // - Without HTTPS: CNAME points to r.{region}.awstrack.me
  // - With HTTPS: CNAME points to CloudFront distribution domain
  if (config.trackingConfig?.customRedirectDomain) {
    configSetOptions.trackingOptions = {
      customRedirectDomain: config.trackingConfig.customRedirectDomain,
      // HTTPS policy depends on whether HTTPS tracking is enabled
      // - REQUIRE: When using CloudFront with SSL certificate
      // - OPTIONAL: When using direct SES tracking endpoint (no SSL)
      httpsPolicy: config.trackingConfig.httpsEnabled ? "REQUIRE" : "OPTIONAL",
    };
  }

  // Check if configuration set already exists
  const configSetName = "wraps-email-tracking";
  const exists = await configurationSetExists(configSetName, config.region);

  const configSet = exists
    ? new aws.sesv2.ConfigurationSet(configSetName, configSetOptions, {
        import: configSetName, // Import existing configuration set
      })
    : new aws.sesv2.ConfigurationSet(configSetName, configSetOptions);

  // SES can only send to the default EventBridge bus
  // We'll use EventBridge rules to route from default bus to SQS
  // Get the default event bus (it always exists)
  const defaultEventBus = aws.cloudwatch.getEventBusOutput({
    name: "default",
  });

  // Event destination for all SES events -> EventBridge (default bus)
  // Only create if event tracking is enabled
  if (config.eventTrackingEnabled) {
    const eventDestName = "wraps-email-eventbridge";

    new aws.sesv2.ConfigurationSetEventDestination("wraps-email-all-events", {
      configurationSetName: configSet.configurationSetName,
      eventDestinationName: eventDestName,
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
  }

  // Optional: Verify domain if provided
  let domainIdentity: aws.sesv2.EmailIdentity | undefined;
  let dkimTokens: string[] | undefined;
  let mailFromDomain: string | undefined;

  if (config.domain) {
    // Check if email identity already exists
    const identityExists = await emailIdentityExists(
      config.domain,
      config.region
    );

    // Use SES v2 API to create email identity with configuration set
    domainIdentity = identityExists
      ? new aws.sesv2.EmailIdentity(
          "wraps-email-domain",
          {
            emailIdentity: config.domain,
            configurationSetName: configSet.configurationSetName, // Link configuration set to domain
            dkimSigningAttributes: {
              nextSigningKeyLength: "RSA_2048_BIT",
            },
            tags: {
              ManagedBy: "wraps-cli",
            },
          },
          {
            import: config.domain, // Import existing identity
          }
        )
      : new aws.sesv2.EmailIdentity("wraps-email-domain", {
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

    // Configure MAIL FROM domain for better DMARC alignment
    // Uses subdomain convention (mail.example.com) to avoid DNS conflicts
    mailFromDomain = config.mailFromDomain || `mail.${config.domain}`;

    // Always create/update MAIL FROM attributes
    // Note: This resource doesn't support import, but it will update existing config
    new aws.sesv2.EmailIdentityMailFromAttributes(
      "wraps-email-mail-from",
      {
        emailIdentity: config.domain,
        mailFromDomain,
        behaviorOnMxFailure: "USE_DEFAULT_VALUE", // Fallback to amazonses.com if MX record fails
      },
      {
        dependsOn: [domainIdentity], // Ensure domain identity exists first
      }
    );
  }

  return {
    configSet,
    eventBus: defaultEventBus as any, // Return default bus reference
    domainIdentity,
    dkimTokens,
    dnsAutoCreated: false, // Will be set after deployment
    customTrackingDomain: config.trackingConfig?.customRedirectDomain,
    mailFromDomain,
  };
}
