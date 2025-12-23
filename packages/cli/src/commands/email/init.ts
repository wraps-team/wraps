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
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import { errors } from "../../utils/shared/errors.js";
import {
  ensurePulumiWorkDir,
  getPulumiWorkDir,
} from "../../utils/shared/fs.js";
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
  promptConfigPreset,
  promptCustomConfig,
  promptDomain,
  promptEstimatedVolume,
  promptProvider,
  promptRegion,
  promptVercelConfig,
} from "../../utils/shared/prompts.js";
import {
  ensurePulumiInstalled,
  previewWithResourceChanges,
} from "../../utils/shared/pulumi.js";

/**
 * Init command - Deploy new email infrastructure
 */
export async function init(options: InitOptions): Promise<void> {
  const startTime = Date.now();

  clack.intro(
    pc.bold(
      options.preview
        ? "Wraps Email Infrastructure Preview"
        : "Wraps Email Infrastructure Setup"
    )
  );

  const progress = new DeploymentProgress();

  // 1. Check Pulumi CLI is installed (auto-install if missing)
  const wasAutoInstalled = await progress.execute(
    "Checking Pulumi CLI installation",
    async () => await ensurePulumiInstalled()
  );

  if (wasAutoInstalled) {
    progress.info("Pulumi CLI was automatically installed");
  }

  // 2. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  progress.info(`Connected to AWS account: ${pc.cyan(identity.accountId)}`);

  // 3. Get configuration (from options or prompts)
  let provider = options.provider;
  if (!provider) {
    provider = await promptProvider();
  }

  let region = options.region;
  if (!region) {
    const defaultRegion = await getAWSRegion();
    region = await promptRegion(defaultRegion);
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

  // 4. Check if connection already exists
  const existingConnection = await loadConnectionMetadata(
    identity.accountId,
    region
  );
  if (existingConnection) {
    clack.log.warn(
      `Connection already exists for account ${pc.cyan(identity.accountId)} in region ${pc.cyan(region)}`
    );
    clack.log.info(`Created: ${existingConnection.timestamp}`);
    clack.log.info(`Use ${pc.cyan("wraps status")} to view current setup`);
    clack.log.info(`Use ${pc.cyan("wraps upgrade")} to add more features`);
    process.exit(0);
  }

  // 5. Configuration selection
  let preset = options.preset;
  if (!preset) {
    preset = await promptConfigPreset();
  }

  let emailConfig: WrapsEmailConfig;
  if (preset === "custom") {
    emailConfig = await promptCustomConfig();
  } else {
    emailConfig = getPreset(preset)!;

    // Prompt for email archiving (optional feature for presets)
    const { promptEmailArchiving } = await import(
      "../../utils/shared/prompts.js"
    );
    const archivingConfig = await promptEmailArchiving();
    emailConfig.emailArchiving = archivingConfig;
  }

  // Set domain if provided
  if (domain) {
    emailConfig.domain = domain;
  }

  // Get estimated volume for cost calculation
  const estimatedVolume = await promptEstimatedVolume();

  // Display cost summary
  progress.info(`\n${pc.bold("Cost Estimate:")}`);
  const costSummary = getCostSummary(emailConfig, estimatedVolume);
  clack.log.info(costSummary);

  // Validate configuration and show warnings
  const warnings = validateConfig(emailConfig);
  if (warnings.length > 0) {
    progress.info(`\n${pc.yellow(pc.bold("Configuration Warnings:"))}`);
    for (const warning of warnings) {
      clack.log.warn(warning);
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

  // Confirm deployment (skip if --yes flag or --preview flag)
  if (!(options.yes || options.preview)) {
    const confirmed = await confirmDeploy();
    if (!confirmed) {
      clack.cancel("Deployment cancelled.");
      process.exit(0);
    }
  }

  // 7. Build stack configuration
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
          await ensurePulumiWorkDir();

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
          const result = await previewWithResourceChanges(stack, { diff: true });
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
    } catch (error: any) {
      trackError("PREVIEW_FAILED", "email:init", { step: "preview" });
      if (error.message?.includes("stack is currently locked")) {
        throw errors.stackLocked();
      }
      throw new Error(`Preview failed: ${error.message}`);
    }
  }

  // DEPLOY MODE - actually create infrastructure
  let outputs;
  try {
    outputs = await progress.execute(
      "Deploying infrastructure (this may take 2-3 minutes)",
      async () => {
        // Ensure Pulumi workspace directory exists
        await ensurePulumiWorkDir();

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

        // Run the deployment
        const upResult = await stack.up({ onOutput: () => {} }); // Suppress Pulumi output

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
  } catch (error: any) {
    // Track deployment failure
    trackServiceInit("email", false, {
      preset,
      provider,
      region,
      duration_ms: Date.now() - startTime,
    });

    // Check if it's a lock file error
    if (error.message?.includes("stack is currently locked")) {
      trackError("STACK_LOCKED", "email:init", { step: "deploy" });
      throw errors.stackLocked();
    }

    trackError("DEPLOYMENT_FAILED", "email:init", { step: "deploy" });
    throw new Error(`Pulumi deployment failed: ${error.message}`);
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
  await saveConnectionMetadata(metadata);

  progress.info("Connection metadata saved for upgrade and restore capability");

  // 10. Check if Route53 hosted zone exists and offer to create DNS records
  let dnsAutoCreated = false;
  if (outputs.domain && outputs.dkimTokens && outputs.dkimTokens.length > 0) {
    const {
      findHostedZone,
      previewDNSChanges,
      createSelectedDNSRecords,
    } = await import("../../utils/route53.js");
    const { promptDNSManagement, promptDNSConfirmation } = await import(
      "../../utils/shared/prompts.js"
    );
    const hostedZone = await findHostedZone(outputs.domain, region);

    if (hostedZone) {
      // Ask if user wants to manage DNS via Route53
      const manageDNS = await promptDNSManagement(outputs.domain);

      if (manageDNS) {
        try {
          // Preview DNS changes and show conflicts
          progress.start("Checking existing DNS records");
          const dnsPreview = await previewDNSChanges(
            hostedZone.id,
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
            await createSelectedDNSRecords(
              hostedZone.id,
              outputs.domain,
              outputs.dkimTokens,
              region,
              selectedCategories as Set<any>,
              outputs.customTrackingDomain,
              outputs.mailFromDomain
            );
            progress.succeed(
              `Created ${selectedCategories.size} DNS record group(s) in Route53`
            );
            dnsAutoCreated = true;
          } else {
            clack.log.info("Skipping DNS record creation. You can add them manually.");
          }
        } catch (error: any) {
          progress.stop();
          clack.log.warn(`Could not manage DNS records: ${error.message}`);
        }
      }
    }
  }

  // 11. Format DNS records if domain was provided and DNS wasn't auto-created
  const dnsRecords = [];
  if (
    outputs.domain &&
    outputs.dkimTokens &&
    outputs.dkimTokens.length > 0 &&
    !dnsAutoCreated
  ) {
    // Add DKIM CNAME records
    for (const token of outputs.dkimTokens) {
      dnsRecords.push({
        name: `${token}._domainkey.${outputs.domain}`,
        type: "CNAME",
        value: `${token}.dkim.amazonses.com`,
      });
    }
  }

  // 12. Display success message
  displaySuccess({
    roleArn: outputs.roleArn,
    configSetName: outputs.configSetName,
    region: outputs.region!,
    tableName: outputs.tableName,
    dnsRecords: dnsRecords.length > 0 ? dnsRecords : undefined,
    dnsAutoCreated,
    domain: outputs.domain,
    mailFromDomain: outputs.mailFromDomain,
  });

  // 13. Track successful deployment
  const duration = Date.now() - startTime;
  const enabledFeatures: string[] = [];
  if (emailConfig.tracking?.enabled) enabledFeatures.push("tracking");
  if (emailConfig.suppressionList?.enabled)
    enabledFeatures.push("suppression_list");
  if (emailConfig.eventTracking?.enabled)
    enabledFeatures.push("event_tracking");
  if (emailConfig.eventTracking?.dynamoDBHistory)
    enabledFeatures.push("dynamodb_history");
  if (emailConfig.dedicatedIp) enabledFeatures.push("dedicated_ip");
  if (emailConfig.emailArchiving?.enabled)
    enabledFeatures.push("email_archiving");

  trackServiceInit("email", true, {
    preset,
    provider,
    region,
    features: enabledFeatures,
    duration_ms: duration,
  });

  trackServiceDeployed("email", {
    duration_ms: duration,
    region,
    features: enabledFeatures,
    preset,
  });
}
