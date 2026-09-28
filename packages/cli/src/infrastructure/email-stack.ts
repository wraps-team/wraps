import * as aws from "@pulumi/aws";
import { DEFAULT_SUPPRESSION_REASONS, retentionToDays } from "@wraps/core";
import type { EmailStackConfig, StackOutputs } from "../types/index.js";
import { domainToConfigSetName } from "../utils/email/config-set-slug.js";
import { createAlertingResources } from "./resources/alerting.js";
import { createManagedDedicatedIpPool } from "./resources/dedicated-ip-pool.js";
import { createDynamoDBTables } from "./resources/dynamodb.js";
import { createEventBridgeResources } from "./resources/eventbridge.js";
import { createIAMRole } from "./resources/iam.js";
import { deployLambdaFunctions } from "./resources/lambda.js";
import { createSESResources, eventDestinationExists } from "./resources/ses.js";
import { createSMTPCredentials } from "./resources/smtp-credentials.js";
import { createSQSResources } from "./resources/sqs.js";
import { createVercelOIDC } from "./vercel-oidc.js";

/**
 * Deploy email infrastructure stack using Pulumi
 */
export async function deployEmailStack(
  config: EmailStackConfig
): Promise<StackOutputs> {
  // Get current AWS account
  const identity = await aws.getCallerIdentity();
  const accountId = identity.accountId;

  let oidcProvider: aws.iam.OpenIdConnectProvider | undefined;

  // 1. Create OIDC provider if Vercel
  if (config.provider === "vercel" && config.vercel) {
    oidcProvider = await createVercelOIDC({
      teamSlug: config.vercel.teamSlug,
      accountId,
    });
  }

  const emailConfig = config.emailConfig;

  // 2. Create IAM role
  const role = await createIAMRole({
    provider: config.provider,
    oidcProvider,
    vercelTeamSlug: config.vercel?.teamSlug,
    vercelProjectName: config.vercel?.projectName,
    emailConfig,
  });

  // 3. CloudFront + ACM (if HTTPS tracking enabled)
  let cloudFrontResources;
  let acmResources;
  let skipCloudFront = false;

  if (
    emailConfig.tracking?.enabled &&
    emailConfig.tracking.customRedirectDomain &&
    emailConfig.tracking.httpsEnabled
  ) {
    // Check for Route53 hosted zone (for automatic DNS validation)
    const { findHostedZone } = await import("../utils/route53.js");
    const hostedZone = await findHostedZone(
      emailConfig.tracking.customRedirectDomain,
      config.region
    );

    // Create ACM certificate (in us-east-1 for CloudFront)
    const { createACMCertificate } = await import("./resources/acm.js");
    acmResources = await createACMCertificate({
      domain: emailConfig.tracking.customRedirectDomain,
      hostedZoneId: hostedZone?.id,
    });

    // For non-Route53 DNS providers, check if the certificate is already validated
    // before attempting to create CloudFront (which requires a validated certificate)
    if (!hostedZone) {
      const { checkCertificateValidation } = await import("./resources/acm.js");
      const isValidated = await checkCertificateValidation(
        emailConfig.tracking.customRedirectDomain
      );
      if (!isValidated) {
        // Certificate not validated yet - skip CloudFront creation
        // User needs to add DNS validation records and run upgrade again
        skipCloudFront = true;
      }
    }

    if (!skipCloudFront) {
      // Create CloudFront distribution with SSL certificate
      // Import CloudFront creation function
      const { createCloudFrontTracking } = await import(
        "./resources/cloudfront.js"
      );

      // Determine which certificate ARN to use:
      // - Route53: Use certificateValidation.certificateArn (waits for validation)
      // - Manual DNS: Use certificate.arn directly (only after we verified it's validated)
      const certificateArn = acmResources.certificateValidation
        ? acmResources.certificateValidation.certificateArn
        : acmResources.certificate.arn;

      cloudFrontResources = await createCloudFrontTracking({
        customTrackingDomain: emailConfig.tracking.customRedirectDomain,
        region: config.region,
        certificateArn,
        hostedZoneId: hostedZone?.id, // Pass hosted zone ID for automatic DNS record creation
        wafEnabled: emailConfig.tracking.wafEnabled,
      });
    }
  }

  // 4. SES resources (if tracking or event tracking enabled)
  let sesResources;
  if (emailConfig.tracking?.enabled || emailConfig.eventTracking?.enabled) {
    // Check if the event destination already exists in AWS but not in Pulumi state.
    // Skip this check when skipResourceImports is true (resources already in state).
    const shouldImportEventDest =
      !config.skipResourceImports &&
      emailConfig.eventTracking?.enabled &&
      (await eventDestinationExists(
        domainToConfigSetName(emailConfig.domain ?? ""),
        "wraps-email-eventbridge",
        config.region
      ));

    // Compute mailFromDomain from mailFromSubdomain if provided
    let mailFromDomain = emailConfig.mailFromDomain;
    if (
      !mailFromDomain &&
      emailConfig.mailFromSubdomain &&
      emailConfig.domain
    ) {
      mailFromDomain = `${emailConfig.mailFromSubdomain}.${emailConfig.domain}`;
    }

    // If we're skipping CloudFront creation (cert not validated), also skip HTTPS requirement
    // This prevents SES from failing when the tracking domain doesn't have HTTPS set up yet
    const effectiveTrackingConfig =
      skipCloudFront && emailConfig.tracking
        ? {
            enabled: emailConfig.tracking.enabled,
            opens: emailConfig.tracking.opens,
            clicks: emailConfig.tracking.clicks,
            customRedirectDomain: emailConfig.tracking.customRedirectDomain,
            httpsEnabled: false, // Use OPTIONAL until CloudFront is ready
          }
        : emailConfig.tracking;

    const dedicatedIpPool = emailConfig.managedDedicatedIps
      ? await createManagedDedicatedIpPool({
          region: config.region,
          skipResourceImports: config.skipResourceImports,
        })
      : undefined;

    sesResources = await createSESResources({
      domain: emailConfig.domain,
      mailFromDomain,
      region: config.region,
      trackingConfig: effectiveTrackingConfig,
      eventTypes: emailConfig.eventTracking?.events,
      eventTrackingEnabled: emailConfig.eventTracking?.enabled,
      tlsRequired: emailConfig.tlsRequired,
      reputationMetrics: emailConfig.reputationMetrics,
      sendingEnabled: emailConfig.sendingEnabled,
      suppressionReasons: emailConfig.suppressionList?.reasons,
      importExistingEventDestination: shouldImportEventDest,
      skipResourceImports: config.skipResourceImports,
      managedDedicatedIps: emailConfig.managedDedicatedIps,
      dedicatedIpPool,
    });
  }

  // 5. DynamoDB tables (if history storage enabled)
  let dynamoTables;
  if (emailConfig.eventTracking?.dynamoDBHistory) {
    dynamoTables = await createDynamoDBTables({
      region: config.region,
      retention: emailConfig.eventTracking.archiveRetention,
    });
  }

  // 6. SQS queues (if event tracking enabled)
  let sqsResources;
  if (emailConfig.eventTracking?.enabled) {
    sqsResources = await createSQSResources({
      region: config.region,
      accountId,
    });
  }

  // 7. Alerting resources (if enabled) — created before EventBridge so its
  // SNS topic ARN can be wired into the FailedInvocations alarm below.
  let alertingResources;
  if (emailConfig.alerts?.enabled) {
    alertingResources = await createAlertingResources({
      alertConfig: emailConfig.alerts,
      configSetName: sesResources?.configSet.configurationSetName,
      dlqName: sqsResources ? "wraps-email-events-dlq" : undefined,
      region: config.region,
    });
  }

  // 8. EventBridge rule to route SES events to SQS (if event tracking enabled)
  if (emailConfig.eventTracking?.enabled && sesResources && sqsResources) {
    await createEventBridgeResources({
      eventBusArn: sesResources.eventBus.arn,
      queueArn: sqsResources.queue.arn,
      queueUrl: sqsResources.queue.url,
      dlqArn: sqsResources.dlq.arn,
      alertTopicArn: alertingResources?.topic.arn,
      // Include webhook config if provided (for Wraps platform integration)
      webhook: config.webhook,
      // Include self-hosted control-plane webhook if configured (dual feed:
      // the platform target above still receives the same events)
      selfhostWebhook: config.selfhostWebhook,
      // Include user webhook config if provided
      userWebhook:
        emailConfig.userWebhook?.enabled &&
        emailConfig.userWebhook.url &&
        emailConfig.userWebhook.secret
          ? {
              url: emailConfig.userWebhook.url,
              secret: emailConfig.userWebhook.secret,
            }
          : undefined,
    });
  }

  // 9. Lambda functions (if event tracking and DynamoDB enabled)
  let lambdaFunctions;
  if (
    emailConfig.eventTracking?.dynamoDBHistory &&
    dynamoTables &&
    sqsResources
  ) {
    const retentionDays = retentionToDays(
      emailConfig.eventTracking?.archiveRetention ?? "90days"
    );
    lambdaFunctions = await deployLambdaFunctions({
      roleArn: role.arn,
      tableName: dynamoTables.emailHistory.name,
      queueArn: sqsResources.queue.arn,
      accountId,
      region: config.region,
      retentionDays,
    });
  }

  // 10. Mail Manager Archive (if email archiving enabled)
  let archiveResources;
  if (emailConfig.emailArchiving?.enabled && sesResources) {
    const { createMailManagerArchive } = await import(
      "./resources/mail-manager.js"
    );
    archiveResources = await createMailManagerArchive({
      name: "email",
      retention: emailConfig.emailArchiving.retention,
      configSetName: sesResources.configSet.configurationSetName,
      region: config.region,
    });
  }

  // 10.5. SES Auto Validation (if configured). Imperative, like the archive
  // link above, so it re-applies on every deploy — which is what heals the
  // suppression-options PUT hazard if a later deploy changes suppressionList
  // without knowing about Auto Validation.
  if (emailConfig.autoValidation && sesResources) {
    const { applyConfigSetAutoValidation } = await import(
      "./resources/auto-validation.js"
    );
    await applyConfigSetAutoValidation({
      configSetName: sesResources.configSet.configurationSetName,
      region: config.region,
      suppressedReasons:
        emailConfig.suppressionList?.reasons ?? DEFAULT_SUPPRESSION_REASONS,
      autoValidation: emailConfig.autoValidation,
    });
  }

  // 11. SMTP credentials (if enabled)
  let smtpResources;
  if (emailConfig.smtpCredentials?.enabled && sesResources) {
    smtpResources = await createSMTPCredentials({
      configSetName: domainToConfigSetName(emailConfig.domain ?? ""),
      region: config.region,
    });
  }

  // 12. Inbound email resources (if enabled)
  let inboundResources:
    | {
        bucketName: string;
        bucketArn: import("@pulumi/pulumi").Output<string>;
        lambdaArn: import("@pulumi/pulumi").Output<string>;
      }
    | undefined;

  // Per-domain reply-threading SSM parameter ARNs, returned as a stack output
  // so the CLI can persist each domain's `parameterArn` / `parameterName` into
  // local metadata.
  let replySecretsOutput:
    | Record<
        string,
        {
          parameterArn: import("@pulumi/pulumi").Output<string>;
          parameterName: string;
        }
      >
    | undefined;

  if (emailConfig.inbound?.enabled) {
    // S3 bucket for inbound email storage
    const { createS3InboundResources } = await import(
      "./resources/s3-inbound.js"
    );
    const s3Inbound = await createS3InboundResources({
      accountId,
      region: config.region,
      retention: emailConfig.inbound.retention,
    });

    // SQS queues for DLQ
    const { createSQSInboundResources } = await import(
      "./resources/sqs-inbound.js"
    );
    const sqsInbound = await createSQSInboundResources();

    // 12a. Reply-threading SSM parameters (one per sending domain).
    // Reply threading requires inbound — only run this block inside the
    // `inbound.enabled` branch. Silent no-op if the feature isn't enabled.
    const replyDomains = emailConfig.replyThreading?.enabled
      ? (emailConfig.replyThreading.domains ?? [])
      : [];
    if (replyDomains.length > 0) {
      const { createReplySecret } = await import("./resources/reply-secret.js");
      replySecretsOutput = {};
      for (const entry of replyDomains) {
        if (!entry.initialSecret) {
          // No initial secret supplied on this apply — the parameter already
          // exists in SSM (previous deploy), and `ignoreChanges: ["value"]`
          // preserves its current rotated value. Skip recreation.
          continue;
        }
        const secret = createReplySecret({
          domain: entry.domain,
          accountId,
          region: config.region,
          initialSecret: Buffer.from(entry.initialSecret, "base64"),
        });
        replySecretsOutput[entry.domain] = {
          parameterArn: secret.parameterArn,
          parameterName: secret.parameterName,
        };
      }
    }

    const replyThreadingEnabled = replyDomains.length > 0;

    // Lambda function for MIME parsing
    const { deployInboundLambda } = await import(
      "./resources/lambda-inbound.js"
    );
    const lambdaInbound = await deployInboundLambda({
      bucketName: s3Inbound.bucketName,
      bucketArn: s3Inbound.bucket.arn,
      accountId,
      region: config.region,
      dlqArn: sqsInbound.dlq.arn,
      replyThreadingEnabled,
    });

    // S3 bucket notification to trigger Lambda on raw/ uploads
    // Must depend on the Lambda permission so S3 can validate the destination
    new aws.s3.BucketNotification(
      "wraps-inbound-s3-notification",
      {
        bucket: s3Inbound.bucket.id,
        lambdaFunctions: [
          {
            lambdaFunctionArn: lambdaInbound.lambdaFunction.arn,
            events: ["s3:ObjectCreated:*"],
            filterPrefix: "raw/",
          },
        ],
      },
      { dependsOn: [lambdaInbound.s3InvokePermission] }
    );

    // EventBridge rule + optional webhook
    if (emailConfig.inbound.webhookUrl) {
      const { createEventBridgeInboundResources } = await import(
        "./resources/eventbridge-inbound.js"
      );
      await createEventBridgeInboundResources({
        webhookUrl: emailConfig.inbound.webhookUrl,
        webhookSecret: emailConfig.inbound.webhookSecret,
      });
    }

    inboundResources = {
      bucketName: s3Inbound.bucketName,
      bucketArn: s3Inbound.bucket.arn,
      lambdaArn: lambdaInbound.lambdaFunction.arn,
    };
  }

  // 13. Agent enforcement resources (if enabled)
  let agentEnforcerArnOut: import("@pulumi/pulumi").Output<string> | undefined;
  let agentPolicyTableNameOut:
    | import("@pulumi/pulumi").Output<string>
    | undefined;
  let agentCredentials:
    | Record<
        string,
        { accessKeyId: string; secretAccessKey: string; userArn: string }
      >
    | undefined;
  let agentAliasArns: Record<string, string> | undefined;

  if (emailConfig.agents?.enabled) {
    const { getApiBaseUrl } = await import("../utils/shared/config.js");

    // Policy/counter/outcome table
    const { createAgentPolicyTable } = await import(
      "./resources/dynamodb-agent-policy.js"
    );
    const policyTable = await createAgentPolicyTable({
      region: config.region,
    });

    // Enforcer Lambda (the leash: only thing agent creds can invoke)
    const { deployAgentEnforcerLambda } = await import(
      "./resources/lambda-agent-enforcer.js"
    );
    const enforcer = await deployAgentEnforcerLambda({
      region: config.region,
      accountId,
      policyTableName: policyTable.name,
      policyTableArn: policyTable.arn,
      configSet: domainToConfigSetName(emailConfig.domain ?? ""),
      wrapsApiUrl: getApiBaseUrl(),
      webhookSecret: emailConfig.agents.webhookSecret ?? "",
    });

    // Grant the platform-connect role invoke on the enforcer (skips with a
    // warning when the role is absent — never fails the stack).
    const { createAgentUser, attachConsoleRoleInvoke } = await import(
      "./resources/iam-agent-user.js"
    );
    await attachConsoleRoleInvoke({
      enforcerArn: enforcer.lambdaFunction.arn,
      policyTableArn: policyTable.arn,
    });

    // Per-agent alias + scoped IAM users + access keys. Each agent gets its own
    // `agent-<agentId>` alias on the shared enforcer; the credential is pinned
    // to that alias so the enforcer can derive the caller identity from the
    // invoked qualifier (SEC-2). The console role keeps invoke on the
    // unqualified function for the execute path (attachConsoleRoleInvoke above).
    agentCredentials = {};
    agentAliasArns = {};
    for (const agent of emailConfig.agents.agents) {
      const alias = new aws.lambda.Alias(`wraps-agent-alias-${agent.name}`, {
        name: `agent-${agent.id}`,
        functionName: enforcer.lambdaFunction.name,
        functionVersion: "$LATEST",
      });

      const userRes = await createAgentUser({
        name: agent.name,
        enforcerArn: alias.arn,
      });
      agentCredentials[agent.name] = {
        accessKeyId: userRes.accessKey.id as unknown as string,
        secretAccessKey: userRes.accessKey.secret as unknown as string,
        userArn: userRes.iamUser.arn as unknown as string,
      };
      agentAliasArns[agent.name] = alias.arn as unknown as string;
    }

    agentEnforcerArnOut = enforcer.lambdaFunction.arn;
    agentPolicyTableNameOut = policyTable.name;
  }

  // Return outputs
  return {
    roleArn: role.arn as any as string,
    configSetName: sesResources?.configSet.configurationSetName as any as
      | string
      | undefined,
    tableName: dynamoTables?.emailHistory.name as any as string | undefined,
    region: config.region,
    lambdaFunctions: lambdaFunctions
      ? [lambdaFunctions.eventProcessor.arn as any as string]
      : undefined,
    domain: emailConfig.domain,
    dkimTokens: sesResources?.dkimTokens as any as string[] | undefined,
    dnsAutoCreated: sesResources?.dnsAutoCreated,
    eventBusName: sesResources?.eventBus.name as any as string | undefined,
    queueUrl: sqsResources?.queue.url as any as string | undefined,
    dlqUrl: sqsResources?.dlq.url as any as string | undefined,
    customTrackingDomain: sesResources?.customTrackingDomain,
    httpsTrackingEnabled: emailConfig.tracking?.httpsEnabled,
    httpsTrackingPending: skipCloudFront, // True if HTTPS requested but cert not validated yet
    cloudFrontDomain: cloudFrontResources?.domainName as any as
      | string
      | undefined,
    acmCertificateValidationRecords: acmResources?.validationRecords as any as
      | Array<{ name: string; type: string; value: string }>
      | undefined,
    mailFromDomain: sesResources?.mailFromDomain,
    archiveArn: archiveResources?.archiveArn,
    archivingEnabled: emailConfig.emailArchiving?.enabled,
    archiveRetention: emailConfig.emailArchiving?.enabled
      ? emailConfig.emailArchiving.retention
      : undefined,
    // SMTP credentials (shown once, not stored)
    smtpUserArn: smtpResources?.iamUser.arn as any as string | undefined,
    smtpUsername: smtpResources?.accessKey.id as any as string | undefined,
    smtpPassword: smtpResources?.smtpPassword as any as string | undefined,
    smtpEndpoint: smtpResources
      ? `email-smtp.${config.region}.amazonaws.com`
      : undefined,
    // Alerting outputs
    alertsEnabled: emailConfig.alerts?.enabled,
    alertTopicArn: alertingResources?.topic.arn as any as string | undefined,
    // Inbound email outputs
    inboundBucketName: inboundResources?.bucketName,
    inboundBucketArn: inboundResources?.bucketArn as any as string | undefined,
    inboundLambdaArn: inboundResources?.lambdaArn as any as string | undefined,
    inboundReceivingDomain: emailConfig.inbound?.receivingDomain,
    // User webhook outputs
    userWebhookUrl: emailConfig.userWebhook?.enabled
      ? emailConfig.userWebhook.url
      : undefined,
    userWebhookSecret: emailConfig.userWebhook?.enabled
      ? emailConfig.userWebhook.secret
      : undefined,
    // Reply-threading: per-domain SSM parameter ARNs. Pulumi `Output<string>`
    // values are unwrapped at the stack-output boundary (mirrors the existing
    // `as any as string` pattern used throughout this file).
    replySecrets: replySecretsOutput
      ? (Object.fromEntries(
          Object.entries(replySecretsOutput).map(
            ([domain, { parameterArn, parameterName }]) => [
              domain,
              {
                parameterArn: parameterArn as unknown as string,
                parameterName,
              },
            ]
          )
        ) as Record<string, { parameterArn: string; parameterName: string }>)
      : undefined,
    // Agent enforcement outputs
    agentEnforcerArn: agentEnforcerArnOut as unknown as string | undefined,
    agentPolicyTableName: agentPolicyTableNameOut as unknown as
      | string
      | undefined,
    agentCredentials,
    agentAliasArns,
  };
}
