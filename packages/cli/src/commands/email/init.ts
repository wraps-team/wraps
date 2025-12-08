import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import { deployEmailStack } from "../../infrastructure/email-stack.js";
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
import { ensurePulumiInstalled } from "../../utils/shared/pulumi.js";

/**
 * Init command - Deploy new email infrastructure
 */
export async function init(options: InitOptions): Promise<void> {
  clack.intro(pc.bold("Wraps Email Infrastructure Setup"));

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

  // Confirm deployment (skip if --yes flag)
  if (!options.yes) {
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

  // 8. Deploy infrastructure using Pulumi
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
    clack.log.error("Infrastructure deployment failed");

    // Check if it's a lock file error
    if (error.message?.includes("stack is currently locked")) {
      clack.log.warn("\nThe Pulumi stack is locked from a previous run.");
      clack.log.info("To fix this, run:");
      clack.log.info(`  ${pc.cyan("rm -rf ~/.wraps/pulumi/.pulumi/locks")}`);
      clack.log.info("\nThen try running wraps email init again.");
    }

    throw new Error(`Pulumi deployment failed: ${error.message}`);
  }

  // 9. Save metadata for future upgrades and restore
  if (metadata.services.email) {
    metadata.services.email.pulumiStackName = `wraps-${identity.accountId}-${region}`;
  }
  await saveConnectionMetadata(metadata);

  progress.info("Connection metadata saved for upgrade and restore capability");

  // 10. Check if Route53 hosted zone exists and create DNS records automatically
  let dnsAutoCreated = false;
  if (outputs.domain && outputs.dkimTokens && outputs.dkimTokens.length > 0) {
    const { findHostedZone, createDNSRecords } = await import(
      "../../utils/email/route53.js"
    );
    const hostedZone = await findHostedZone(outputs.domain, region);

    if (hostedZone) {
      try {
        progress.start("Creating DNS records in Route53");
        await createDNSRecords(
          hostedZone.id,
          outputs.domain,
          outputs.dkimTokens,
          region,
          outputs.customTrackingDomain,
          outputs.mailFromDomain
        );
        progress.succeed("DNS records created in Route53");
        dnsAutoCreated = true;
      } catch (error: any) {
        progress.fail("Failed to create DNS records in Route53");
        clack.log.warn(`Could not auto-create DNS records: ${error.message}`);
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
}
