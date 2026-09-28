import * as aws from "@pulumi/aws";
import {
  ALL_EVENT_TYPES,
  DEFAULT_CONFIG_SET_NAME,
  MANAGED_DEDICATED_IP_POOL_NAME,
} from "@wraps/core";
import type { SESEventType } from "../../types/index.js";
import { domainToConfigSetName } from "../../utils/email/config-set-slug.js";
import { errors } from "../../utils/shared/errors.js";

/**
 * Event types that gate suppression visibility. BOUNCE and COMPLAINT are
 * required in `matchingEventTypes` — dropping either means the customer's
 * pipeline never learns about bounces/complaints (a `Suppressed` webhook
 * event arrives as a `Bounce` with `bounceSubType === "Suppressed"`, see
 * apps/api/src/routes/webhooks.ts), so bad addresses keep getting sent to
 * and domain reputation degrades. SUBSCRIPTION is unrelated — it tracks
 * recipient preference-center changes, not the suppression list — so it is
 * deliberately not required here.
 */
const REQUIRED_SUPPRESSION_EVENT_TYPES: SESEventType[] = [
  "BOUNCE",
  "COMPLAINT",
];

/**
 * Resolve the `matchingEventTypes` for the SES EventBridge event destination
 * from `eventTracking.events`. An empty array means "all", matching
 * `packages/pulumi`'s `eventTypes.length > 0 ? eventTypes : ALL_EVENT_TYPES`
 * — not "none", which would silently kill the customer's entire event
 * pipeline.
 */
export function resolveMatchingEventTypes(
  eventTypes?: SESEventType[]
): SESEventType[] {
  return eventTypes && eventTypes.length > 0 ? eventTypes : ALL_EVENT_TYPES;
}

/**
 * Build the configuration set's `deliveryOptions` from resolved TLS and
 * dedicated-IP-pool inputs. Returns undefined when neither is set, so an
 * account with no opinion on either gets SES's own defaults rather than an
 * explicit empty object.
 */
export function buildDeliveryOptions(opts: {
  tlsRequired?: boolean;
  sendingPoolName?: string;
}): aws.types.input.sesv2.ConfigurationSetDeliveryOptions | undefined {
  if (!(opts.tlsRequired || opts.sendingPoolName)) {
    return;
  }
  return {
    ...(opts.tlsRequired ? { tlsPolicy: "REQUIRE" } : {}),
    ...(opts.sendingPoolName ? { sendingPoolName: opts.sendingPoolName } : {}),
  };
}

/**
 * Which pool the stack's configuration set should send through.
 * - managed on:  ours; refuse if a different pool is already attached.
 * - managed off: keep a foreign pool; drop ours (the pool is being deleted).
 */
export function resolveSendingPoolName(opts: {
  managedDedicatedIps: boolean;
  existingPoolName?: string;
}): string | undefined {
  const { managedDedicatedIps, existingPoolName } = opts;
  if (managedDedicatedIps) {
    if (
      existingPoolName &&
      existingPoolName !== MANAGED_DEDICATED_IP_POOL_NAME
    ) {
      throw errors.sendingPoolConflict(existingPoolName);
    }
    return MANAGED_DEDICATED_IP_POOL_NAME;
  }
  return existingPoolName === MANAGED_DEDICATED_IP_POOL_NAME
    ? undefined
    : existingPoolName;
}

/**
 * Reject an explicit event type selection that drops BOUNCE or COMPLAINT.
 * Does nothing when `eventTypes` is undefined or empty — both mean "all"
 * and already include the required types.
 */
export function validateEventTypes(eventTypes?: SESEventType[]): void {
  if (!eventTypes || eventTypes.length === 0) {
    return;
  }

  const missing = REQUIRED_SUPPRESSION_EVENT_TYPES.filter(
    (required) => !eventTypes.includes(required)
  );

  if (missing.length > 0) {
    throw errors.eventTypesMissingSuppressionEvents(missing);
  }
}

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
  reputationMetrics?: boolean; // Enable CloudWatch reputation metrics
  sendingEnabled?: boolean; // Enable/disable sending through this config set
  suppressionReasons?: ("BOUNCE" | "COMPLAINT")[]; // Which event types trigger account suppression list
  importExistingEventDestination?: boolean; // Import existing event destination if it exists
  skipResourceImports?: boolean; // Skip import flags when resources already exist in Pulumi state
  managedDedicatedIps?: boolean; // Route this config set through the wraps-email-managed pool
  dedicatedIpPool?: aws.sesv2.DedicatedIpPool; // Created by createManagedDedicatedIpPool when managedDedicatedIps is on
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
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundException") {
      return false;
    }
    console.error("Error checking for existing configuration set:", error);
    return false;
  }
}

/**
 * Read the dedicated IP pool currently attached to a configuration set's
 * DeliveryOptions, if any. Used so a deploy never silently detaches a pool
 * the customer (or Wraps, on a prior deploy) already attached — see
 * resolveSendingPoolName.
 */
export async function getConfigurationSetSendingPoolName(
  configSetName: string,
  region: string
): Promise<string | undefined> {
  try {
    const { SESv2Client, GetConfigurationSetCommand } = await import(
      "@aws-sdk/client-sesv2"
    );
    const ses = new SESv2Client({ region });

    const response = await ses.send(
      new GetConfigurationSetCommand({ ConfigurationSetName: configSetName })
    );
    return response.DeliveryOptions?.SendingPoolName;
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundException") {
      return;
    }
    throw error;
  }
}

/**
 * Check if event destination exists for a configuration set
 */
export async function eventDestinationExists(
  configSetName: string,
  eventDestName: string,
  region: string
): Promise<boolean> {
  try {
    const { SESv2Client, GetConfigurationSetEventDestinationsCommand } =
      await import("@aws-sdk/client-sesv2");
    const ses = new SESv2Client({ region });

    const response = await ses.send(
      new GetConfigurationSetEventDestinationsCommand({
        ConfigurationSetName: configSetName,
      })
    );

    return (
      response.EventDestinations?.some((dest) => dest.Name === eventDestName) ??
      false
    );
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundException") {
      return false;
    }
    // Silently return false on other errors - we'll try to create and handle errors there
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
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundException") {
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
  const configSetName = config.domain
    ? domainToConfigSetName(config.domain)
    : DEFAULT_CONFIG_SET_NAME;

  // Read whatever pool (if any) the configuration set already sends
  // through, so a deploy never silently detaches a pool the customer — or
  // Wraps, on a prior deploy — already attached.
  // managedDedicatedIps on: fail closed on a read error, since guessing
  // "no pool" here could let this deploy attach ours over a customer's.
  // managedDedicatedIps off: today's behavior — a read failure never blocks
  // a deploy that doesn't use pools at all.
  let existingPoolName: string | undefined;
  if (config.managedDedicatedIps) {
    existingPoolName = await getConfigurationSetSendingPoolName(
      configSetName,
      config.region
    );
  } else {
    try {
      existingPoolName = await getConfigurationSetSendingPoolName(
        configSetName,
        config.region
      );
    } catch {
      existingPoolName = undefined;
    }
  }
  const sendingPoolName = resolveSendingPoolName({
    managedDedicatedIps: !!config.managedDedicatedIps,
    existingPoolName,
  });

  const configSetOptions: aws.sesv2.ConfigurationSetArgs = {
    configurationSetName: configSetName,
    deliveryOptions: buildDeliveryOptions({
      tlsRequired: config.tlsRequired,
      sendingPoolName,
    }),
    suppressionOptions: {
      suppressedReasons: config.suppressionReasons ?? ["BOUNCE", "COMPLAINT"],
    },
    reputationOptions:
      config.reputationMetrics !== undefined
        ? { reputationMetricsEnabled: config.reputationMetrics }
        : undefined,
    sendingOptions:
      config.sendingEnabled !== undefined
        ? { sendingEnabled: config.sendingEnabled }
        : undefined,
    tags: {
      ManagedBy: "wraps-cli",
      Service: "email",
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

  // Check if configuration set already exists in AWS
  const exists = await configurationSetExists(configSetName, config.region);

  // Only use import when the resource exists in AWS but not yet in Pulumi state.
  // When skipResourceImports is true, the resource is already tracked in state
  // (e.g., from a prior `wraps email init`), so import would cause a collision.
  const configSetResourceOpts = {
    ...(exists && !config.skipResourceImports ? { import: configSetName } : {}),
    ...(config.dedicatedIpPool ? { dependsOn: [config.dedicatedIpPool] } : {}),
  };
  const configSet = new aws.sesv2.ConfigurationSet(
    configSetName,
    configSetOptions,
    configSetResourceOpts
  );

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

    validateEventTypes(config.eventTypes);
    const matchingEventTypes = resolveMatchingEventTypes(config.eventTypes);

    new aws.sesv2.ConfigurationSetEventDestination(
      "wraps-email-all-events",
      {
        configurationSetName: configSet.configurationSetName,
        eventDestinationName: eventDestName,
        eventDestination: {
          enabled: true,
          matchingEventTypes,
          eventBridgeDestination: {
            // SES requires default bus - cannot use custom bus
            eventBusArn: defaultEventBus.arn,
          },
        },
      },
      {
        // Import existing resource if it already exists in AWS but not in Pulumi state.
        // Skip when skipResourceImports is true (resource already tracked in state).
        import:
          config.importExistingEventDestination && !config.skipResourceImports
            ? `${configSetName}|${eventDestName}`
            : undefined,
      }
    );
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
    domainIdentity =
      identityExists && !config.skipResourceImports
        ? new aws.sesv2.EmailIdentity(
            "wraps-email-domain",
            {
              emailIdentity: config.domain,
              configurationSetName: configSet.configurationSetName,
              dkimSigningAttributes: {
                nextSigningKeyLength: "RSA_2048_BIT",
              },
              tags: {
                ManagedBy: "wraps-cli",
              },
            },
            {
              import: config.domain,
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
              Service: "email",
            },
          });

    // Extract DKIM tokens for DNS configuration
    dkimTokens = domainIdentity.dkimSigningAttributes.apply(
      (attrs) => attrs?.tokens || []
    ) as any;

    // Configure MAIL FROM domain for better DMARC alignment (only if explicitly configured)
    if (config.mailFromDomain) {
      mailFromDomain = config.mailFromDomain;

      // Create/update MAIL FROM attributes
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
