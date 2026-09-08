import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { DEFAULT_CONFIG_SET_NAME, retentionToDays } from "@wraps/core";
import { applyDefaults } from "./defaults.js";
import {
  createCustomOIDCProvider,
  createDNSRecords,
  createEventProcessor,
  createEventTracking,
  createHTTPSTracking,
  createIAMRole,
  createMailManagerArchive,
  createSESResources,
  createSMTPCredentials,
  createVercelOIDCProvider,
} from "./resources/index.js";
import type { WrapsEmailArgs, WrapsEmailNodes } from "./types.js";

/**
 * WrapsEmail - Pulumi component for deploying Wraps email infrastructure
 *
 * Following SST's pattern of composition over presets:
 * - Minimal required config - just provide what you need
 * - Sensible defaults for everything else
 * - Transform functions for resource customization
 * - `.nodes` exposure for underlying resource access
 *
 * @example
 * ```typescript
 * // Minimal - just Vercel OIDC for sending
 * const email = new WrapsEmail("email", {
 *   vercel: { teamSlug: "my-team", projectName: "my-app" },
 * });
 *
 * // With domain and event tracking
 * const email = new WrapsEmail("email", {
 *   vercel: { teamSlug: "my-team", projectName: "my-app" },
 *   domain: "example.com",
 *   events: {
 *     types: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "OPEN", "CLICK"],
 *     storeHistory: true,
 *     retention: "SIX_MONTHS",
 *   },
 * });
 *
 * // Access underlying resources
 * email.nodes.table?.arn; // For custom IAM policies
 * email.nodes.queue?.url; // For custom consumers
 * ```
 */
export class WrapsEmail extends pulumi.ComponentResource {
  /**
   * Underlying resources exposed for advanced use cases
   */
  public readonly nodes: WrapsEmailNodes;

  // ============================================
  // CORE OUTPUTS
  // ============================================

  /** IAM role ARN for SDK authentication */
  public readonly roleArn: pulumi.Output<string>;

  /** AWS region */
  public readonly region: pulumi.Output<string>;

  /** SES configuration set name */
  public readonly configSetName: pulumi.Output<string>;

  // ============================================
  // DOMAIN OUTPUTS
  // ============================================

  /** Primary domain (if configured) */
  public readonly domain: pulumi.Output<string | undefined>;

  /** DKIM tokens for DNS configuration */
  public readonly dkimTokens: pulumi.Output<string[]>;

  /** MAIL FROM domain (if configured) */
  public readonly mailFromDomain: pulumi.Output<string | undefined>;

  // ============================================
  // EVENT TRACKING OUTPUTS
  // ============================================

  /** DynamoDB table name for email history */
  public readonly tableName: pulumi.Output<string | undefined>;

  /** SQS queue URL for events */
  public readonly queueUrl: pulumi.Output<string | undefined>;

  /** SQS dead letter queue URL */
  public readonly dlqUrl: pulumi.Output<string | undefined>;

  /** Lambda function ARN */
  public readonly lambdaArn: pulumi.Output<string | undefined>;

  // ============================================
  // TRACKING OUTPUTS
  // ============================================

  /** Custom tracking domain (if configured) */
  public readonly customTrackingDomain: pulumi.Output<string | undefined>;

  /** Whether HTTPS tracking is enabled */
  public readonly httpsTrackingEnabled: pulumi.Output<boolean>;

  /** CloudFront distribution domain (if HTTPS tracking enabled) */
  public readonly cloudFrontDomain: pulumi.Output<string | undefined>;

  /** ACM certificate validation records (if HTTPS tracking enabled) */
  public readonly acmCertificateValidationRecords: pulumi.Output<
    Array<{ name: string; type: string; value: string }> | undefined
  >;

  // ============================================
  // ARCHIVING OUTPUTS
  // ============================================

  /** Mail Manager Archive ARN (if archiving enabled) */
  public readonly archiveArn: pulumi.Output<string | undefined>;

  /** Whether archiving is enabled */
  public readonly archivingEnabled: pulumi.Output<boolean>;

  // ============================================
  // SMTP OUTPUTS
  // ============================================

  /** SMTP IAM user ARN (if SMTP enabled) */
  public readonly smtpUserArn: pulumi.Output<string | undefined>;

  /** SMTP username (IAM access key ID) - shown once! */
  public readonly smtpUsername: pulumi.Output<string | undefined>;

  /** SMTP password (derived from secret key) - shown once! */
  public readonly smtpPassword: pulumi.Output<string | undefined>;

  /** SMTP endpoint */
  public readonly smtpEndpoint: pulumi.Output<string | undefined>;

  // ============================================
  // CONVENIENCE OUTPUTS
  // ============================================

  /** Environment variables to set in your application */
  public readonly envVars: pulumi.Output<{
    WRAPS_AWS_ROLE_ARN: string;
    WRAPS_AWS_REGION: string;
    WRAPS_CONFIG_SET?: string;
  }>;

  constructor(
    name: string,
    args: WrapsEmailArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("wraps:email:WrapsEmail", name, args, opts);

    // Apply defaults to configuration
    const config = applyDefaults(args);
    const tags = config.tags;

    // Get current AWS region and account
    const region = aws.getRegionOutput({}, { parent: this });
    const identity = aws.getCallerIdentityOutput({}, { parent: this });

    // Initialize nodes object
    const nodes: Partial<WrapsEmailNodes> = {};

    // ============================================
    // 1. CREATE OIDC PROVIDER (if Vercel or custom OIDC)
    // ============================================
    let oidcProvider: aws.iam.OpenIdConnectProvider | undefined;

    if (config.vercel) {
      const oidcResult = createVercelOIDCProvider(
        name,
        config.vercel,
        tags,
        args.transform?.oidcProvider,
        { parent: this }
      );
      oidcProvider = oidcResult.provider;
      nodes.oidcProvider = oidcProvider;
    } else if (config.oidc) {
      const oidcResult = createCustomOIDCProvider(
        name,
        config.oidc,
        tags,
        args.transform?.oidcProvider,
        { parent: this }
      );
      oidcProvider = oidcResult.provider;
      nodes.oidcProvider = oidcProvider;
    }

    // ============================================
    // 2. CREATE IAM ROLE
    // ============================================
    const iamResult = createIAMRole(
      name,
      {
        vercel: config.vercel,
        oidc: config.oidc,
        oidcProvider,
        config,
      },
      tags,
      args.transform?.role,
      { parent: this }
    );
    nodes.role = iamResult.role;

    // ============================================
    // 3. CREATE SES RESOURCES
    // ============================================
    const sesResult = createSESResources(name, config, tags, args.transform, {
      parent: this,
    });
    nodes.configSet = sesResult.configSet;
    nodes.domainIdentity = sesResult.domainIdentity;
    nodes.domainDkim = sesResult.domainDkim;

    // ============================================
    // 3.5. CREATE DNS RECORDS (if DNS provider configured)
    // ============================================
    if (config.dns && config.domain) {
      const mailFromDomain =
        config.domain && config.mailFromSubdomain
          ? `${config.mailFromSubdomain}.${config.domain}`
          : undefined;

      createDNSRecords(
        name,
        config.dns,
        {
          domain: config.domain,
          dkimTokens: sesResult.dkimTokens,
          mailFromDomain,
          region: region.name,
        },
        tags,
        { parent: this }
      );
    }

    // ============================================
    // 4. CREATE EVENT TRACKING (if configured)
    // ============================================
    let eventTrackingResult: ReturnType<typeof createEventTracking> | undefined;
    let lambdaResult:
      | Awaited<ReturnType<typeof createEventProcessor>>
      | undefined;

    if (config.events) {
      eventTrackingResult = createEventTracking(
        name,
        config,
        tags,
        args.transform,
        {
          parent: this,
        }
      );
      nodes.table = eventTrackingResult.table;
      nodes.queue = eventTrackingResult.queue;
      nodes.dlq = eventTrackingResult.dlq;
      nodes.eventRule = eventTrackingResult.eventRule;

      // Create Lambda if history storage is enabled
      if (config.events.storeHistory && eventTrackingResult.table) {
        const retentionDays = retentionToDays(
          config.events.retention ?? "90days"
        );
        lambdaResult = createEventProcessor(
          name,
          eventTrackingResult.table.name,
          eventTrackingResult.queue.arn,
          identity.accountId,
          retentionDays,
          tags,
          args.transform?.lambda,
          { parent: this }
        );
        nodes.lambda = lambdaResult.lambda;
      }
    }

    // ============================================
    // 5. CREATE HTTPS TRACKING (if configured)
    // ============================================
    if (config.tracking.customRedirectDomain && !config.tracking.httpsEnabled) {
      pulumi.log.warn(
        `tracking.customRedirectDomain is set to "${config.tracking.customRedirectDomain}" with tracking.httpsEnabled=false. ` +
          "The configuration set will use SES's OPTIONAL HTTPS policy, which wraps click links in the original link's protocol — " +
          "so https:// links in your emails will resolve against a domain with no matching certificate and show recipients a warning. " +
          "Set tracking.httpsEnabled: true to deploy CloudFront + ACM for this domain.",
        this
      );
    }

    let httpsTrackingResult: ReturnType<typeof createHTTPSTracking> | undefined;

    if (config.tracking.httpsEnabled && config.tracking.customRedirectDomain) {
      httpsTrackingResult = createHTTPSTracking(
        name,
        {
          customTrackingDomain: config.tracking.customRedirectDomain,
          region: region.name,
          hostedZoneId: undefined, // TODO: Add hostedZoneId config option
          wafEnabled: config.tracking.wafEnabled ?? false,
        },
        tags,
        args.transform,
        { parent: this }
      );
      nodes.certificate = httpsTrackingResult.cloudfront.distribution
        ? undefined
        : undefined; // TODO: expose certificate
      nodes.distribution = httpsTrackingResult.cloudfront.distribution;
    }

    // ============================================
    // 6. CREATE SMTP CREDENTIALS (if configured)
    // ============================================
    let smtpResult: ReturnType<typeof createSMTPCredentials> | undefined;

    if (config.smtp?.enabled) {
      smtpResult = createSMTPCredentials(
        name,
        sesResult.configSet.name ?? DEFAULT_CONFIG_SET_NAME,
        region.name,
        tags,
        { parent: this }
      );
      nodes.smtpUser = smtpResult.iamUser;
      nodes.smtpAccessKey = smtpResult.accessKey;
    }

    // Store nodes
    this.nodes = nodes as WrapsEmailNodes;

    // ============================================
    // SET OUTPUT VALUES
    // ============================================

    // Core outputs
    this.roleArn = iamResult.role.arn;
    this.region = region.name;
    this.configSetName = pulumi.output(
      sesResult.configSet.name ?? DEFAULT_CONFIG_SET_NAME
    );

    // Domain outputs
    this.domain = pulumi.output(config.domain);
    this.dkimTokens = sesResult.dkimTokens;
    this.mailFromDomain = pulumi.output(
      config.domain && config.mailFromSubdomain
        ? `${config.mailFromSubdomain}.${config.domain}`
        : undefined
    );

    // Event tracking outputs
    this.tableName = eventTrackingResult?.table
      ? eventTrackingResult.table.name
      : pulumi.output(undefined);
    this.queueUrl = eventTrackingResult
      ? eventTrackingResult.queue.url
      : pulumi.output(undefined);
    this.dlqUrl = eventTrackingResult
      ? eventTrackingResult.dlq.url
      : pulumi.output(undefined);
    this.lambdaArn = lambdaResult
      ? lambdaResult.lambda.arn
      : pulumi.output(undefined);

    // Tracking outputs
    this.customTrackingDomain = pulumi.output(
      config.tracking.customRedirectDomain
    );
    this.httpsTrackingEnabled = pulumi.output(
      config.tracking.httpsEnabled ?? false
    );
    this.cloudFrontDomain = httpsTrackingResult
      ? httpsTrackingResult.cloudfront.domainName
      : pulumi.output(undefined);
    this.acmCertificateValidationRecords = httpsTrackingResult
      ? httpsTrackingResult.acmValidationRecords.apply(
          (records) => records || undefined
        )
      : pulumi.output(undefined);

    // ============================================
    // 7. CREATE MAIL MANAGER ARCHIVE (if configured)
    // ============================================
    let archiveResult: ReturnType<typeof createMailManagerArchive> | undefined;

    if (config.archiving?.enabled) {
      archiveResult = createMailManagerArchive(
        name,
        config,
        sesResult.configSet.name ?? DEFAULT_CONFIG_SET_NAME,
        region.name,
        tags,
        { parent: this }
      );
    }

    // Archiving outputs
    this.archiveArn = archiveResult
      ? archiveResult.archiveArn
      : pulumi.output(undefined);
    this.archivingEnabled = pulumi.output(config.archiving?.enabled ?? false);

    // SMTP outputs
    this.smtpUserArn = smtpResult
      ? smtpResult.iamUser.arn
      : pulumi.output(undefined);
    this.smtpUsername = smtpResult
      ? smtpResult.smtpUsername
      : pulumi.output(undefined);
    this.smtpPassword = smtpResult
      ? smtpResult.smtpPassword
      : pulumi.output(undefined);
    this.smtpEndpoint = smtpResult
      ? smtpResult.smtpEndpoint
      : pulumi.output(undefined);

    // Convenience outputs
    this.envVars = pulumi
      .all([this.roleArn, this.region, this.configSetName])
      .apply(([roleArn, region, configSetName]) => ({
        WRAPS_AWS_ROLE_ARN: roleArn,
        WRAPS_AWS_REGION: region,
        WRAPS_CONFIG_SET: configSetName,
      }));

    // Register outputs
    this.registerOutputs({
      roleArn: this.roleArn,
      region: this.region,
      configSetName: this.configSetName,
      domain: this.domain,
      dkimTokens: this.dkimTokens,
      tableName: this.tableName,
      queueUrl: this.queueUrl,
      envVars: this.envVars,
    });
  }
}
