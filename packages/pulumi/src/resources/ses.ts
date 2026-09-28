import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import {
  ALL_EVENT_TYPES,
  DEFAULT_CONFIG_SET_NAME,
  MANAGED_DEDICATED_IP_POOL_NAME,
} from "@wraps/core";
import type {
  ResolvedConfig,
  SESEventType,
  TransformFunctions,
} from "../types.js";

/**
 * SES resources result
 */
export type SESResourcesResult = {
  configSet: aws.ses.ConfigurationSet;
  eventDestination?: aws.sesv2.ConfigurationSetEventDestination;
  domainIdentity?: aws.ses.DomainIdentity;
  domainDkim?: aws.ses.DomainDkim;
  mailFromAttributes?: aws.sesv2.EmailIdentityMailFromAttributes;
  dkimTokens: pulumi.Output<string[]>;
  dedicatedIpPool?: aws.sesv2.DedicatedIpPool;
};

/**
 * Create SES configuration set
 */
export function createConfigSet(
  name: string,
  _config: ResolvedConfig,
  _tags: Record<string, string>,
  transform?: TransformFunctions["configSet"],
  opts?: pulumi.ComponentResourceOptions
): aws.ses.ConfigurationSet {
  let args: aws.ses.ConfigurationSetArgs = {
    name: DEFAULT_CONFIG_SET_NAME,
    // Using basic ses.ConfigurationSet - advanced options via sesv2
    // are added separately
  };

  // Apply transform if provided
  if (transform) {
    args = transform(args);
  }

  return new aws.ses.ConfigurationSet(`${name}-config-set`, args, opts);
}

/**
 * Build the configuration set's `deliveryOptions` from resolved TLS and
 * dedicated-IP-pool inputs. Returns undefined when neither is set, so an
 * account with no opinion on either gets SES's own defaults rather than an
 * explicit empty object. Mirrors `packages/cli`'s `buildDeliveryOptions` —
 * see `cli-pulumi-parity.test.ts`.
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
 * Create SES configuration set with v2 API (supports more options)
 */
export function createConfigSetV2(
  name: string,
  config: ResolvedConfig,
  tags: Record<string, string>,
  opts?: pulumi.ComponentResourceOptions
): aws.sesv2.ConfigurationSet {
  const args: aws.sesv2.ConfigurationSetArgs = {
    configurationSetName: DEFAULT_CONFIG_SET_NAME,
    deliveryOptions: buildDeliveryOptions({
      tlsRequired: config.tlsRequired,
      sendingPoolName: config.managedDedicatedIps
        ? MANAGED_DEDICATED_IP_POOL_NAME
        : undefined,
    }),
    suppressionOptions: config.suppressionList.enabled
      ? { suppressedReasons: config.suppressionList.reasons }
      : undefined,
    reputationOptions: config.reputationMetrics
      ? { reputationMetricsEnabled: true }
      : undefined,
    sendingOptions: {
      sendingEnabled: config.sendingEnabled,
    },
    trackingOptions: config.tracking.customRedirectDomain
      ? {
          customRedirectDomain: config.tracking.customRedirectDomain,
          httpsPolicy: config.tracking.httpsEnabled ? "REQUIRE" : "OPTIONAL",
        }
      : undefined,
    tags,
  };

  return new aws.sesv2.ConfigurationSet(`${name}-config-set-v2`, args, opts);
}

/**
 * Resolve the `matchingEventTypes` for the SES EventBridge event destination
 * from `events.types`. An empty array (or undefined) means "all", matching
 * `packages/cli`'s `resolveMatchingEventTypes` — see plan 183. Extracted
 * from the two-step `config.events.types || ALL_EVENT_TYPES` (here) plus
 * `eventTypes.length > 0 ? eventTypes : ALL_EVENT_TYPES` (previously inline
 * in `createEventDestination`) so the composed default-set derivation is a
 * single pure function, testable without constructing any Pulumi resource.
 */
export function resolveMatchingEventTypes(
  eventTypes?: SESEventType[]
): SESEventType[] {
  const provided = eventTypes || ALL_EVENT_TYPES;
  return provided.length > 0 ? provided : ALL_EVENT_TYPES;
}

/**
 * Create EventBridge event destination for SES events
 */
export function createEventDestination(
  name: string,
  configSetName: pulumi.Input<string>,
  eventTypes: SESEventType[],
  opts?: pulumi.ComponentResourceOptions
): aws.sesv2.ConfigurationSetEventDestination {
  // SES requires the default EventBridge bus
  const defaultEventBus = aws.cloudwatch.getEventBusOutput({ name: "default" });

  return new aws.sesv2.ConfigurationSetEventDestination(
    `${name}-event-destination`,
    {
      configurationSetName: configSetName,
      eventDestinationName: "wraps-email-eventbridge",
      eventDestination: {
        enabled: true,
        matchingEventTypes:
          eventTypes.length > 0 ? eventTypes : ALL_EVENT_TYPES,
        eventBridgeDestination: {
          eventBusArn: defaultEventBus.arn,
        },
      },
    },
    opts
  );
}

/**
 * Create SES domain identity
 */
export function createDomainIdentity(
  name: string,
  domain: string,
  _tags: Record<string, string>,
  transform?: TransformFunctions["domainIdentity"],
  opts?: pulumi.ComponentResourceOptions
): { domainIdentity: aws.ses.DomainIdentity; domainDkim: aws.ses.DomainDkim } {
  let args: aws.ses.DomainIdentityArgs = {
    domain,
  };

  // Apply transform if provided
  if (transform) {
    args = transform(args);
  }

  const domainIdentity = new aws.ses.DomainIdentity(
    `${name}-domain-identity`,
    args,
    opts
  );

  // Create DKIM verification
  const domainDkim = new aws.ses.DomainDkim(
    `${name}-domain-dkim`,
    {
      domain,
    },
    { ...opts, dependsOn: [domainIdentity] }
  );

  return { domainIdentity, domainDkim };
}

/**
 * Create SES domain identity with v2 API (supports configuration set linking)
 */
export function createDomainIdentityV2(
  name: string,
  domain: string,
  configSetName: pulumi.Input<string>,
  tags: Record<string, string>,
  opts?: pulumi.ComponentResourceOptions
): aws.sesv2.EmailIdentity {
  return new aws.sesv2.EmailIdentity(
    `${name}-domain-identity-v2`,
    {
      emailIdentity: domain,
      configurationSetName: configSetName,
      dkimSigningAttributes: {
        nextSigningKeyLength: "RSA_2048_BIT",
      },
      tags,
    },
    opts
  );
}

/**
 * Configure MAIL FROM domain for better deliverability
 */
export function createMailFromAttributes(
  name: string,
  domain: string,
  mailFromDomain: string,
  domainIdentity: aws.ses.DomainIdentity | aws.sesv2.EmailIdentity,
  opts?: pulumi.ComponentResourceOptions
): aws.sesv2.EmailIdentityMailFromAttributes {
  return new aws.sesv2.EmailIdentityMailFromAttributes(
    `${name}-mail-from`,
    {
      emailIdentity: domain,
      mailFromDomain,
      behaviorOnMxFailure: "USE_DEFAULT_VALUE",
    },
    { ...opts, dependsOn: [domainIdentity] }
  );
}

/**
 * Create all SES resources based on configuration
 */
export function createSESResources(
  name: string,
  config: ResolvedConfig,
  tags: Record<string, string>,
  _transform?: TransformFunctions,
  opts?: pulumi.ComponentResourceOptions
): SESResourcesResult {
  // Managed dedicated IP pool (plan 374). Pulumi has no way to read live AWS
  // state at deploy time — unlike the CLI's own Pulumi program, which checks
  // for a foreign pool before attaching — so this always creates and owns
  // its own pool under Pulumi state.
  const dedicatedIpPool = config.managedDedicatedIps
    ? new aws.sesv2.DedicatedIpPool(
        `${name}-managed-ip-pool`,
        {
          poolName: MANAGED_DEDICATED_IP_POOL_NAME,
          scalingMode: "MANAGED",
          tags,
        },
        opts
      )
    : undefined;

  // Create configuration set with v2 API for full feature support
  const configSet = createConfigSetV2(
    name,
    config,
    tags,
    dedicatedIpPool ? { ...opts, dependsOn: [dedicatedIpPool] } : opts
  );

  // Create event destination if events are configured
  let eventDestination: aws.sesv2.ConfigurationSetEventDestination | undefined;
  if (config.events) {
    eventDestination = createEventDestination(
      name,
      configSet.configurationSetName,
      resolveMatchingEventTypes(config.events.types),
      opts
    );
  }

  // Create domain identity if domain is provided
  let domainIdentityV2: aws.sesv2.EmailIdentity | undefined;
  let mailFromAttributes: aws.sesv2.EmailIdentityMailFromAttributes | undefined;
  let dkimTokens: pulumi.Output<string[]> = pulumi.output([]);

  if (config.domain) {
    // Use v2 API for domain identity — supports config set linking and DKIM
    domainIdentityV2 = createDomainIdentityV2(
      name,
      config.domain,
      configSet.configurationSetName,
      tags,
      { ...opts, dependsOn: [configSet] }
    );

    // Extract DKIM tokens from v2 identity
    dkimTokens = domainIdentityV2.dkimSigningAttributes.apply(
      (attrs) => attrs.tokens ?? []
    );

    // Configure MAIL FROM if domain is provided
    if (config.mailFromSubdomain) {
      const mailFromDomain = `${config.mailFromSubdomain}.${config.domain}`;
      mailFromAttributes = createMailFromAttributes(
        name,
        config.domain,
        mailFromDomain,
        domainIdentityV2,
        opts
      );
    }
  }

  return {
    configSet: configSet as unknown as aws.ses.ConfigurationSet,
    eventDestination,
    domainIdentity: undefined,
    domainDkim: undefined,
    mailFromAttributes,
    dkimTokens,
    dedicatedIpPool,
  };
}
