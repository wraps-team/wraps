import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import { deployEmailStack } from "../../infrastructure/email-stack.js";
import {
  trackError,
  trackServiceDeployed,
  trackServiceInit,
} from "../../telemetry/events.js";
import type {
  EmailStackConfig,
  InitOptions,
  WrapsEmailConfig,
} from "../../types/index.js";
import { getCostSummary } from "../../utils/email/costs.js";
import { getPreset, validateConfig } from "../../utils/email/presets.js";
import { resolveDashboardUrl } from "../../utils/selfhost/dashboard-url.js";
import {
  getAWSRegion,
  getSESAccountStatus,
  validateAWSCredentialsWithDetails,
} from "../../utils/shared/aws.js";
import {
  errors,
  isPulumiError,
  parsePulumiError,
} from "../../utils/shared/errors.js";
import {
  ensurePulumiWorkDir,
  getPulumiWorkDir,
} from "../../utils/shared/fs.js";
import {
  checkIAMPermissions,
  formatDeniedActions,
  getRequiredActions,
} from "../../utils/shared/iam-check.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import {
  createConnectionMetadata,
  loadConnectionMetadata,
  saveConnectionMetadata,
} from "../../utils/shared/metadata.js";
import {
  DeploymentProgress,
  displayPreview,
  displaySuccess,
} from "../../utils/shared/output.js";
import {
  confirmDeploy,
  isInteractive,
  promptConfigPreset,
  promptCustomConfig,
  promptDomain,
  promptDomainPurpose,
  promptEstimatedVolume,
  promptMailFromSubdomain,
  promptProvider,
  promptRegion,
  promptVercelConfig,
} from "../../utils/shared/prompts.js";
import {
  ensurePulumiInstalled,
  previewWithResourceChanges,
  withLockRetry,
} from "../../utils/shared/pulumi.js";
import {
  DEFAULT_PULUMI_TIMEOUT_MS,
  withTimeout,
} from "../../utils/shared/timeout.js";

/**
 * Init command - Deploy new email infrastructure
 */
export async function init(options: InitOptions): Promise<void> {
  const startTime = Date.now();

  if (!isJsonMode()) {
    clack.intro(
      pc.bold(
        options.preview
          ? "Wraps Email Infrastructure Preview"
          : "Wraps Email Infrastructure Setup"
      )
    );
  }

  const progress = new DeploymentProgress();

  // 1. Validate AWS credentials first — missing credentials is the most
  // common getting-started failure, so surface it before the Pulumi install
  // check (which can auto-download Pulumi and take ~30s)
  const credentialResult = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentialsWithDetails()
  );

  const identity = credentialResult.identity;
  progress.info(`Connected to AWS account: ${pc.cyan(identity.accountId)}`);

  // Display any credential warnings (e.g., SSO expiring soon)
  for (const warning of credentialResult.warnings) {
    clack.log.warn(warning);
  }

  // Show credential source for transparency
  if (credentialResult.credentialSource) {
    progress.info(
      `Using credentials from: ${pc.dim(credentialResult.credentialSource)}`
    );
  }

  // 2. Check Pulumi CLI is installed (auto-install if missing)
  const wasAutoInstalled = await progress.execute(
    "Checking Pulumi CLI installation",
    async () => await ensurePulumiInstalled()
  );

  if (wasAutoInstalled) {
    progress.info("Pulumi CLI was automatically installed");
  }

  // 3. Get configuration (from options or prompts)
  let provider = options.provider;
  if (!provider) {
    provider = options.quick ? "other" : await promptProvider();
  }

  let region = options.region;
  if (!region) {
    const defaultRegion = await getAWSRegion();
    region = options.quick ? defaultRegion : await promptRegion(defaultRegion);
  }

  if (options.quick) {
    progress.info(`Using region: ${pc.cyan(region)}`);
  }

  // 4. Check if connection already exists (before prompting for domain/Vercel config)
  const existingConnection = await loadConnectionMetadata(
    identity.accountId,
    region
  );
  if (existingConnection) {
    if (isJsonMode()) {
      jsonSuccess("email.init", {
        alreadyDeployed: true,
        accountId: identity.accountId,
        region,
        createdAt: existingConnection.timestamp,
      });
      process.exit(0);
    }

    clack.log.warn(
      `Connection already exists for account ${pc.cyan(identity.accountId)} in region ${pc.cyan(region)}`
    );
    clack.log.info(`Created: ${existingConnection.timestamp}`);
    const domainHint = options.domain ? ` ${options.domain}` : " <domain>";
    clack.log.info(
      `To add another sending domain: ${pc.cyan(`wraps email domains add${domainHint}`)}`
    );
    clack.log.info(`Use ${pc.cyan("wraps status")} to view current setup`);
    clack.log.info(`Use ${pc.cyan("wraps upgrade")} to add more features`);
    process.exit(0);
  }

  let domain = options.domain;
  if (!domain) {
    domain = await promptDomain();
  }

  // Get Vercel config if needed
  let vercelConfig;
  if (provider === "vercel") {
    vercelConfig = await promptVercelConfig();
  }

  // 5. Configuration selection
  let preset = options.preset;
  if (!preset) {
    preset = options.quick ? "starter" : await promptConfigPreset();
  }

  if (options.quick) {
    progress.info(`Using preset: ${pc.cyan(preset)}`);
  }

  let emailConfig: WrapsEmailConfig;
  if (preset === "custom") {
    emailConfig = await promptCustomConfig();
  } else {
    emailConfig = getPreset(preset)!;

    // Prompt for email archiving (skip in quick mode)
    if (!options.quick) {
      const { promptEmailArchiving } = await import(
        "../../utils/shared/prompts.js"
      );
      const archivingConfig = await promptEmailArchiving();
      emailConfig.emailArchiving = archivingConfig;
    }
  }

  // Set domain if provided
  if (domain) {
    emailConfig.domain = domain;
  }

  // Prompt for MAIL FROM subdomain (skip in quick mode and custom preset which already prompts)
  if (domain && !options.quick && preset !== "custom") {
    const wantsMailFrom = await clack.confirm({
      message: `Configure MAIL FROM for ${pc.cyan(domain)}? ${pc.dim("(improves DMARC alignment)")}`,
      initialValue: true,
    });

    if (clack.isCancel(wantsMailFrom)) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }

    if (wantsMailFrom) {
      const mailFromFull = await promptMailFromSubdomain(domain);
      // promptMailFromSubdomain returns "mail.example.com" — extract the subdomain part
      const suffix = `.${domain}`;
      emailConfig.mailFromSubdomain = mailFromFull.endsWith(suffix)
        ? mailFromFull.slice(0, -suffix.length) || "mail"
        : "mail";
    }
  }

  // Prompt for domain purpose and adjust tracking defaults (skip in quick mode and custom preset)
  if (!options.quick && preset !== "custom" && emailConfig.tracking?.enabled) {
    const purpose = await promptDomainPurpose();
    if (purpose === "transactional") {
      emailConfig.tracking = {
        ...emailConfig.tracking,
        opens: false,
        clicks: false,
      };
    } else if (purpose === "marketing" || purpose === "notifications") {
      emailConfig.tracking = {
        ...emailConfig.tracking,
        opens: true,
        clicks: true,
      };
    } else {
      const trackOpens = await clack.confirm({
        message: "Track email opens?",
        initialValue: emailConfig.tracking.opens ?? true,
      });
      if (clack.isCancel(trackOpens)) {
        clack.cancel("Operation cancelled.");
        process.exit(0);
      }
      const trackClicks = await clack.confirm({
        message: "Track link clicks?",
        initialValue: emailConfig.tracking.clicks ?? true,
      });
      if (clack.isCancel(trackClicks)) {
        clack.cancel("Operation cancelled.");
        process.exit(0);
      }
      emailConfig.tracking = {
        ...emailConfig.tracking,
        opens: trackOpens as boolean,
        clicks: trackClicks as boolean,
      };
    }
  }

  // Get estimated volume for cost calculation (skip in quick mode)
  let costSummary: string | undefined;
  if (!options.quick) {
    const estimatedVolume = await promptEstimatedVolume();

    // Display cost summary
    progress.info(`\n${pc.bold("Cost Estimate:")}`);
    costSummary = getCostSummary(emailConfig, estimatedVolume);
    clack.log.info(costSummary);

    // Validate configuration and show warnings
    const warnings = validateConfig(emailConfig);
    if (warnings.length > 0) {
      progress.info(`\n${pc.yellow(pc.bold("Configuration Warnings:"))}`);
      for (const warning of warnings) {
        clack.log.warn(warning);
      }
    }
  }

  // 6. Create metadata to track deployment
  const metadata = createConnectionMetadata(
    identity.accountId,
    region,
    provider,
    emailConfig,
    preset === "custom" ? undefined : preset
  );
  if (vercelConfig) {
    metadata.vercel = vercelConfig;
  }

  // Confirm deployment (skip if --yes, --quick, or --preview flag)
  if (!(options.yes || options.quick || options.preview)) {
    const confirmed = await confirmDeploy();
    if (!confirmed) {
      clack.cancel("Deployment cancelled.");
      process.exit(0);
    }
  }

  // 7. Pre-flight IAM permission check (non-blocking)
  if (!options.preview) {
    const iamCheckResult = await progress.execute(
      "Checking IAM permissions",
      async () => {
        const requiredActions = getRequiredActions(emailConfig);
        return checkIAMPermissions(identity.arn, requiredActions, region);
      }
    );

    if (iamCheckResult.skipped && iamCheckResult.skipReason) {
      progress.info(pc.dim(iamCheckResult.skipReason));
    } else if (!iamCheckResult.success) {
      // Show warning but don't block - let Pulumi give the definitive error
      clack.log.warn(
        pc.yellow("Some IAM permissions may be missing. Deployment may fail.")
      );
      clack.log.info(formatDeniedActions(iamCheckResult.deniedActions));
    }
  }

  // 7b. Pre-flight resource scan (non-blocking)
  if (!options.preview) {
    const { runPreflightScan } = await import(
      "../../utils/shared/preflight.js"
    );
    const preflight = await progress.execute(
      "Scanning for existing resources",
      async () => runPreflightScan(region, domain, { force: options.force })
    );

    if (!preflight.shouldContinue) {
      clack.cancel("Deployment cancelled.");
      process.exit(0);
    }
  }

  // 8. Build stack configuration
  // Fresh deployment — no existing metadata to preserve.
  // For redeployments of existing infrastructure, always use
  // buildEmailStackConfig() to prevent silent resource destruction.
  const stackConfig: EmailStackConfig = {
    provider,
    region,
    vercel: vercelConfig,
    emailConfig,
  };

  // 8. Preview or Deploy infrastructure using Pulumi
  if (options.preview) {
    // PREVIEW MODE - show what would be created without deploying
    try {
      const previewResult = await progress.execute(
        "Generating infrastructure preview",
        async () => {
          await ensurePulumiWorkDir({ accountId: identity.accountId, region });

          const stack =
            await pulumi.automation.LocalWorkspace.createOrSelectStack(
              {
                stackName: `wraps-${identity.accountId}-${region}`,
                projectName: "wraps-email",
                program: async () => {
                  const result = await deployEmailStack(stackConfig);
                  return {
                    roleArn: result.roleArn,
                    configSetName: result.configSetName,
                    tableName: result.tableName,
                    region: result.region,
                    lambdaFunctions: result.lambdaFunctions,
                    domain: result.domain,
                    dkimTokens: result.dkimTokens,
                    customTrackingDomain: result.customTrackingDomain,
                    mailFromDomain: result.mailFromDomain,
                    archiveArn: result.archiveArn,
                    archivingEnabled: result.archivingEnabled,
                    archiveRetention: result.archiveRetention,
                  };
                },
              },
              {
                workDir: getPulumiWorkDir(),
                envVars: {
                  PULUMI_CONFIG_PASSPHRASE: "",
                  AWS_REGION: region,
                },
                secretsProvider: "passphrase",
              }
            );

          await stack.setConfig("aws:region", { value: region });

          // Run preview with resource change capture
          const result = await previewWithResourceChanges(stack, {
            diff: true,
          });
          return result;
        }
      );

      // Display preview results with detailed resource changes
      displayPreview({
        changeSummary: previewResult.changeSummary,
        resourceChanges: previewResult.resourceChanges,
        costEstimate: costSummary,
        commandName: "wraps email init",
      });

      clack.outro(
        pc.green("Preview complete. Run without --preview to deploy.")
      );

      // Track preview completion
      trackServiceInit("email", true, {
        preset,
        provider,
        region,
        preview: true,
        duration_ms: Date.now() - startTime,
      });
      return;
    } catch (error) {
      trackError("PREVIEW_FAILED", "email:init", { step: "preview" });
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("stack is currently locked")) {
        throw errors.stackLocked();
      }
      throw new Error(`Preview failed: ${msg}`);
    }
  }

  // DEPLOY MODE - actually create infrastructure
  let outputs;
  try {
    outputs = await progress.execute(
      "Deploying infrastructure (this may take 2-3 minutes)",
      async () => {
        // Ensure Pulumi workspace directory exists
        await ensurePulumiWorkDir({ accountId: identity.accountId, region });

        // Run Pulumi inline program with local backend (no cloud required)
        const stack =
          await pulumi.automation.LocalWorkspace.createOrSelectStack(
            {
              stackName: `wraps-${identity.accountId}-${region}`,
              projectName: "wraps-email",
              program: async () => {
                const result = await deployEmailStack(stackConfig);

                // Export outputs
                return {
                  roleArn: result.roleArn,
                  configSetName: result.configSetName,
                  tableName: result.tableName,
                  region: result.region,
                  lambdaFunctions: result.lambdaFunctions,
                  domain: result.domain,
                  dkimTokens: result.dkimTokens,
                  customTrackingDomain: result.customTrackingDomain,
                  mailFromDomain: result.mailFromDomain,
                  archiveArn: result.archiveArn,
                  archivingEnabled: result.archivingEnabled,
                  archiveRetention: result.archiveRetention,
                };
              },
            },
            {
              workDir: getPulumiWorkDir(),
              // Use local file-based backend (no Pulumi Cloud login required)
              envVars: {
                PULUMI_CONFIG_PASSPHRASE: "", // Use empty passphrase for local state
                AWS_REGION: region,
              },
              secretsProvider: "passphrase",
            }
          );

        // Set backend to local file system
        await stack.workspace.selectStack(
          `wraps-${identity.accountId}-${region}`
        );

        // Set AWS region
        await stack.setConfig("aws:region", { value: region });

        // Run the deployment with timeout protection and lock retry
        const upResult = await withLockRetry(
          () =>
            withTimeout(
              stack.up({ onOutput: () => {} }), // Suppress Pulumi output
              DEFAULT_PULUMI_TIMEOUT_MS,
              "Pulumi deployment"
            ),
          {
            accountId: identity.accountId,
            region,
            autoConfirm: options.yes || options.quick,
          }
        );

        // Get outputs
        const pulumiOutputs = upResult.outputs;

        return {
          roleArn: pulumiOutputs.roleArn?.value as string,
          configSetName: pulumiOutputs.configSetName?.value as
            | string
            | undefined,
          tableName: pulumiOutputs.tableName?.value as string | undefined,
          region: pulumiOutputs.region?.value as string,
          lambdaFunctions: pulumiOutputs.lambdaFunctions?.value as
            | string[]
            | undefined,
          domain: pulumiOutputs.domain?.value as string | undefined,
          dkimTokens: pulumiOutputs.dkimTokens?.value as string[] | undefined,
          customTrackingDomain: pulumiOutputs.customTrackingDomain?.value as
            | string
            | undefined,
          mailFromDomain: pulumiOutputs.mailFromDomain?.value as
            | string
            | undefined,
          archiveArn: pulumiOutputs.archiveArn?.value as string | undefined,
          archivingEnabled: pulumiOutputs.archivingEnabled?.value as
            | boolean
            | undefined,
          archiveRetention: pulumiOutputs.archiveRetention?.value as
            | string
            | undefined,
        };
      }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Track deployment failure
    trackServiceInit("email", false, {
      preset,
      provider,
      region,
      duration_ms: Date.now() - startTime,
    });

    // Check for IAM permission errors in Pulumi deployment
    if (isPulumiError(error)) {
      const { code, iamAction, service, resourceName, resourceType } =
        parsePulumiError(error as Error);

      trackError(`PULUMI_${code}`, "email:init", {
        step: "deploy",
        iamAction,
        service,
      });

      // Throw specific errors based on the service that failed
      switch (code) {
        case "RESOURCE_CONFLICT":
          throw errors.resourceConflict(
            resourceName || "unknown resource",
            resourceType
          );
        case "SES_PERMISSION_DENIED":
          throw errors.sesPermissionDenied(iamAction || "unknown");
        case "DYNAMODB_PERMISSION_DENIED":
          throw errors.dynamoDBPermissionDenied();
        case "LAMBDA_PERMISSION_DENIED":
          throw errors.lambdaPermissionDenied();
        case "EVENTBRIDGE_PERMISSION_DENIED":
          throw errors.eventBridgePermissionDenied();
        case "SQS_PERMISSION_DENIED":
          throw errors.sqsPermissionDenied();
        case "IAM_PERMISSION_DENIED":
          throw errors.iamPermissionDenied(
            iamAction || "unknown",
            "AWS resource",
            service
              ? `Your IAM user/role needs ${service.toUpperCase()} permissions.`
              : "Ensure your IAM user/role has the required permissions."
          );
      }
    }

    trackError("DEPLOYMENT_FAILED", "email:init", { step: "deploy" });
    throw new Error(`Pulumi deployment failed: ${msg}`);
  }

  // 9. Save metadata for future upgrades and restore
  if (metadata.services.email) {
    metadata.services.email.pulumiStackName = `wraps-${identity.accountId}-${region}`;
    // Save computed values from Pulumi outputs back to config
    // These may have been computed during deployment (e.g., mailFromDomain from mailFromSubdomain)
    if (outputs.mailFromDomain) {
      metadata.services.email.config.mailFromDomain = outputs.mailFromDomain;
    }
    if (
      outputs.customTrackingDomain &&
      metadata.services.email.config.tracking
    ) {
      metadata.services.email.config.tracking.customRedirectDomain =
        outputs.customTrackingDomain;
    }
  }
  // Note: dnsProvider will be set after DNS configuration step below
  await saveConnectionMetadata(metadata);

  progress.info("Connection metadata saved for upgrade and restore capability");

  // JSON mode: output results and skip interactive DNS/test steps
  if (isJsonMode()) {
    jsonSuccess("email.init", {
      roleArn: outputs.roleArn,
      configSetName: outputs.configSetName,
      region: outputs.region!,
      domain: outputs.domain,
      dkimTokens: outputs.dkimTokens,
    });
    trackServiceDeployed("email", {
      duration_ms: Date.now() - startTime,
      region,
      features: [],
      preset,
    });
    return;
  }

  // 10. DNS Configuration - Support multiple DNS providers (skip in quick mode)
  let dnsAutoCreated = false;
  let dnsProvider: "route53" | "vercel" | "cloudflare" | "manual" | undefined;

  if (
    !options.quick &&
    outputs.domain &&
    outputs.dkimTokens &&
    outputs.dkimTokens.length > 0
  ) {
    const {
      detectAvailableDNSProviders,
      getDNSCredentials,
      createDNSRecordsForProvider,
      getDNSProviderDisplayName,
      buildEmailDNSRecords,
    } = await import("../../utils/dns/index.js");
    const {
      promptDNSProvider,
      promptDNSConfirmation,
      promptDNSRecordSelection,
      promptContinueManualDNS,
    } = await import("../../utils/shared/prompts.js");
    const { previewDNSChanges } = await import("../../utils/route53.js");

    // Detect available DNS providers
    progress.start("Detecting DNS providers");
    const availableProviders = await detectAvailableDNSProviders(
      outputs.domain,
      region
    );
    progress.stop();

    // Prompt user to select DNS provider
    const selectedProvider = await promptDNSProvider(
      outputs.domain,
      availableProviders
    );
    dnsProvider = selectedProvider;

    if (selectedProvider !== "manual") {
      // Get and validate credentials for selected provider
      progress.start(
        `Validating ${getDNSProviderDisplayName(selectedProvider)} credentials`
      );
      const credentialResult = await getDNSCredentials(
        selectedProvider,
        outputs.domain,
        region
      );
      progress.stop();

      if (credentialResult.valid && credentialResult.credentials) {
        const credentials = credentialResult.credentials;

        // For Route53, use the existing preview/confirmation flow
        if (credentials.provider === "route53") {
          try {
            progress.start("Checking existing DNS records");
            const dnsPreview = await previewDNSChanges(
              credentials.hostedZoneId,
              outputs.domain,
              outputs.dkimTokens,
              region,
              outputs.customTrackingDomain,
              outputs.mailFromDomain
            );
            progress.stop();

            // Show preview and get user confirmation
            const { shouldCreate, selectedCategories } =
              await promptDNSConfirmation(dnsPreview);

            if (shouldCreate && selectedCategories.size > 0) {
              progress.start("Creating selected DNS records in Route53");
              const result = await createDNSRecordsForProvider(
                credentials,
                {
                  domain: outputs.domain,
                  dkimTokens: outputs.dkimTokens,
                  mailFromDomain: outputs.mailFromDomain,
                  customTrackingDomain: outputs.customTrackingDomain,
                  region,
                },
                selectedCategories as Set<any>
              );
              if (result.success) {
                progress.succeed(
                  `Created ${selectedCategories.size} DNS record group(s) in Route53`
                );
                dnsAutoCreated = true;
              } else {
                progress.fail("Failed to create some DNS records");
                if (result.errors) {
                  for (const error of result.errors) {
                    clack.log.warn(error);
                  }
                }
              }
            } else {
              clack.log.info(
                "Skipping DNS record creation. You can add them manually."
              );
            }
          } catch (error) {
            progress.stop();
            const msg = error instanceof Error ? error.message : String(error);
            clack.log.warn(`Could not manage DNS records: ${msg}`);
          }
        } else {
          // For Vercel and Cloudflare, show records and let user select
          const recordData = {
            domain: outputs.domain,
            dkimTokens: outputs.dkimTokens,
            mailFromDomain: outputs.mailFromDomain,
            customTrackingDomain: outputs.customTrackingDomain,
            region,
          };

          const records = buildEmailDNSRecords(recordData);
          const providerDisplayName = getDNSProviderDisplayName(
            credentials.provider
          );
          const { shouldCreate, selectedCategories } =
            await promptDNSRecordSelection(records, providerDisplayName);

          if (shouldCreate && selectedCategories.size > 0) {
            progress.start(`Creating DNS records in ${providerDisplayName}`);
            const result = await createDNSRecordsForProvider(
              credentials,
              recordData,
              selectedCategories as Set<any>
            );
            if (result.success) {
              progress.succeed(
                `Created ${result.recordsCreated} DNS records in ${providerDisplayName}`
              );
              dnsAutoCreated = true;
            } else {
              progress.fail("Failed to create some DNS records");
              if (result.errors) {
                for (const error of result.errors) {
                  clack.log.warn(error);
                }
              }
            }
          } else {
            clack.log.info(
              "Skipping DNS record creation. You can add them manually."
            );
          }
        }
      } else {
        // Credentials invalid or domain not found
        clack.log.warn(
          credentialResult.error || "Could not validate credentials"
        );

        // Ask if user wants to continue with manual setup
        const continueManual = await promptContinueManualDNS();
        if (continueManual) {
          dnsProvider = "manual";
        }
      }
    }

    // Save DNS provider to metadata for future upgrades
    if (dnsProvider && metadata.services.email) {
      metadata.services.email.dnsProvider = dnsProvider;
      await saveConnectionMetadata(metadata);
    }
  }

  // 11. Show manual DNS instructions if DNS wasn't auto-created
  if (
    outputs.domain &&
    outputs.dkimTokens &&
    outputs.dkimTokens.length > 0 &&
    !dnsAutoCreated
  ) {
    const {
      buildEmailDNSRecords: buildRecords,
      formatManualDNSInstructions: formatManual,
    } = await import("../../utils/dns/index.js");
    const allRecords = buildRecords({
      domain: outputs.domain,
      dkimTokens: outputs.dkimTokens,
      mailFromDomain: outputs.mailFromDomain,
      customTrackingDomain: outputs.customTrackingDomain,
      region,
    });

    console.log();
    clack.note(
      formatManual(allRecords),
      "DNS Records — Add these to your DNS provider"
    );
  }

  // 12. Display success message
  displaySuccess({
    dashboardUrl: await resolveDashboardUrl(
      identity.accountId,
      outputs.region!
    ),
    roleArn: outputs.roleArn,
    configSetName: outputs.configSetName,
    region: outputs.region!,
    tableName: outputs.tableName,
    dnsRecords: undefined,
    dnsAutoCreated,
    dnsProvider,
    domain: outputs.domain,
    mailFromDomain: outputs.mailFromDomain,
  });

  // 13. Sandbox detection (non-blocking)
  let isSandbox = false;
  try {
    const sesStatus = await getSESAccountStatus(region);
    isSandbox = sesStatus.isSandbox;
    if (sesStatus.isSandbox) {
      console.log("");
      if (sesStatus.sandboxUncertain) {
        clack.log.info(
          `Could not confirm SES account status — assuming ${pc.yellow("sandbox mode")} for safety.`
        );
      } else {
        clack.note(
          [
            `Your SES account is in ${pc.yellow("sandbox mode")}.`,
            "",
            "In sandbox mode you can only send to verified email addresses",
            "or the SES mailbox simulator. To send to any recipient,",
            "request production access in the AWS console:",
            "",
            pc.cyan(
              `https://${region}.console.aws.amazon.com/ses/home?region=${region}#/account`
            ),
            "",
            pc.dim(
              "Sandbox is normal for new accounts. Production access typically takes 24 hours."
            ),
          ].join("\n"),
          "SES Sandbox Mode"
        );
      }
    }
    // baseline:allow-next-line no-swallowed-errors — sandbox detection is non-fatal, skip notice if API fails
  } catch {}

  // 14. Post-deploy: offer to send a test email (skip in preview mode).
  // Optional flourish, not required input — skip silently rather than throw
  // when there's no one to answer it.
  if (
    !(options.preview || options.quick || options.yes) &&
    isInteractive() &&
    !isJsonMode()
  ) {
    console.log("");
    const wantTest = await clack.confirm({
      message: "Send a test email to verify everything works?",
      initialValue: true,
    });

    if (!clack.isCancel(wantTest) && wantTest) {
      const { emailTest } = await import("./test.js");
      await emailTest({ region, isSandbox, postDeploy: true });
    }
  }

  // 15. Track successful deployment
  const duration = Date.now() - startTime;
  const enabledFeatures: string[] = [];
  if (emailConfig.tracking?.enabled) {
    enabledFeatures.push("tracking");
  }
  if (emailConfig.suppressionList?.enabled) {
    enabledFeatures.push("suppression_list");
  }
  if (emailConfig.eventTracking?.enabled) {
    enabledFeatures.push("event_tracking");
  }
  if (emailConfig.eventTracking?.dynamoDBHistory) {
    enabledFeatures.push("dynamodb_history");
  }
  if (emailConfig.managedDedicatedIps) {
    enabledFeatures.push("managed_dedicated_ips");
  }
  if (emailConfig.emailArchiving?.enabled) {
    enabledFeatures.push("email_archiving");
  }

  trackServiceInit("email", true, {
    preset,
    provider,
    region,
    features: enabledFeatures,
    duration_ms: duration,
    is_sandbox: isSandbox,
  });

  trackServiceDeployed("email", {
    duration_ms: duration,
    region,
    features: enabledFeatures,
    preset,
    is_sandbox: isSandbox,
  });
}
