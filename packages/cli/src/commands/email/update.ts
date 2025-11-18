import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import { deployEmailStack } from "../../infrastructure/email-stack.js";
import type { EmailStackConfig, UpdateOptions } from "../../types/index.js";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import {
  ensurePulumiWorkDir,
  getPulumiWorkDir,
} from "../../utils/shared/fs.js";
import {
  loadConnectionMetadata,
  saveConnectionMetadata,
} from "../../utils/shared/metadata.js";
import {
  DeploymentProgress,
  displaySuccess,
} from "../../utils/shared/output.js";
import { ensurePulumiInstalled } from "../../utils/shared/pulumi.js";

/**
 * Update command - Redeploy infrastructure to apply CLI updates
 * This command updates Lambda functions and other managed resources
 * without requiring configuration changes from the user.
 */
export async function update(options: UpdateOptions): Promise<void> {
  clack.intro(pc.bold("Wraps Update - Apply CLI Updates to Infrastructure"));

  const progress = new DeploymentProgress();

  // 1. Check Pulumi CLI is installed
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

  // 3. Get region
  let region = options.region;
  if (!region) {
    const defaultRegion = await getAWSRegion();
    region = defaultRegion;
  }

  // 4. Load existing connection metadata
  const metadata = await loadConnectionMetadata(identity.accountId, region);

  if (!metadata) {
    clack.log.error(
      `No Wraps connection found for account ${pc.cyan(identity.accountId)} in region ${pc.cyan(region)}`
    );
    clack.log.info(
      `Use ${pc.cyan("wraps init")} to create new infrastructure or ${pc.cyan("wraps connect")} to connect existing.`
    );
    process.exit(1);
  }

  progress.info(`Found existing connection created: ${metadata.timestamp}`);

  // 5. Display current configuration
  console.log(`\n${pc.bold("Current Configuration:")}\n`);

  if (metadata.services.email?.preset) {
    console.log(`  Preset: ${pc.cyan(metadata.services.email?.preset)}`);
  } else {
    console.log(`  Preset: ${pc.cyan("custom")}`);
  }

  const config = metadata.services.email!.config;

  // Show sending domain if configured
  if (config.domain) {
    console.log(`  Sending Domain: ${pc.cyan(config.domain)}`);
  }

  if (config.tracking?.enabled) {
    console.log(`  ${pc.green("✓")} Open & Click Tracking`);
  }

  if (config.suppressionList?.enabled) {
    console.log(`  ${pc.green("✓")} Bounce/Complaint Suppression`);
  }

  if (config.eventTracking?.enabled) {
    console.log(`  ${pc.green("✓")} Event Tracking (EventBridge)`);
  }

  if (config.dedicatedIp) {
    console.log(`  ${pc.green("✓")} Dedicated IP Address`);
  }

  console.log("");

  // 6. Show what will be updated
  console.log(`${pc.bold("What will be updated:")}\n`);
  console.log(
    `  ${pc.cyan("•")} Lambda function code (if event tracking enabled)`
  );
  console.log(
    `  ${pc.cyan("•")} EventBridge rules (if event tracking enabled)`
  );
  console.log(`  ${pc.cyan("•")} IAM policies (security improvements)`);
  console.log(`  ${pc.cyan("•")} SES configuration set (feature updates)`);
  console.log("");

  progress.info(
    "Your current configuration will be preserved - no features will be added or removed"
  );
  console.log("");

  // 7. Confirm update
  if (!options.yes) {
    const confirmed = await clack.confirm({
      message: "Proceed with update?",
      initialValue: true,
    });

    if (clack.isCancel(confirmed) || !confirmed) {
      clack.cancel("Update cancelled.");
      process.exit(0);
    }
  }

  // 8. Get Vercel config if needed
  let vercelConfig;
  if (metadata.provider === "vercel" && metadata.vercel) {
    vercelConfig = metadata.vercel;
  }

  // 9. Build stack configuration (reuse existing config)
  const stackConfig: EmailStackConfig = {
    provider: metadata.provider,
    region,
    vercel: vercelConfig,
    emailConfig: config,
  };

  // 10. Update Pulumi stack
  let outputs;
  try {
    outputs = await progress.execute(
      "Updating Wraps infrastructure (this may take 2-3 minutes)",
      async () => {
        await ensurePulumiWorkDir();

        const stack =
          await pulumi.automation.LocalWorkspace.createOrSelectStack(
            {
              stackName:
                metadata.services.email?.pulumiStackName ||
                `wraps-${identity.accountId}-${region}`,
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
                };
              },
            },
            {
              workDir: getPulumiWorkDir(),
              envVars: {
                PULUMI_CONFIG_PASSPHRASE: "",
              },
              secretsProvider: "passphrase",
            }
          );

        await stack.workspace.selectStack(
          metadata.services.email?.pulumiStackName ||
            `wraps-${identity.accountId}-${region}`
        );
        await stack.setConfig("aws:region", { value: region });

        // Pulumi will automatically detect changes and only update what's needed
        const upResult = await stack.up({ onOutput: () => {} });
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
        };
      }
    );
  } catch (error: any) {
    clack.log.error("Infrastructure update failed");

    // Check if it's a lock file error
    if (error.message?.includes("stack is currently locked")) {
      clack.log.warn("\nThe Pulumi stack is locked from a previous run.");
      clack.log.info("To fix this, run:");
      clack.log.info(`  ${pc.cyan("rm -rf ~/.wraps/pulumi/.pulumi/locks")}`);
      clack.log.info("\nThen try running wraps update again.");
    }

    throw new Error(`Pulumi update failed: ${error.message}`);
  }

  // 11. Update metadata timestamp (config stays the same)
  metadata.timestamp = new Date().toISOString();
  await saveConnectionMetadata(metadata);

  progress.info("Connection metadata updated");

  // 12. Display success message
  displaySuccess({
    roleArn: outputs.roleArn,
    configSetName: outputs.configSetName,
    region: outputs.region!,
    tableName: outputs.tableName,
    customTrackingDomain: outputs.customTrackingDomain,
  });

  // Show what was updated
  console.log(`\n${pc.green("✓")} ${pc.bold("Update complete!")}\n`);
  console.log(
    "Infrastructure has been updated with the latest CLI improvements.\n"
  );
  console.log(`${pc.bold("Next steps:")}\n`);
  console.log(
    `  ${pc.cyan("1.")} No code changes needed - your existing SDK integration continues to work`
  );
  console.log(
    `  ${pc.cyan("2.")} Check ${pc.cyan("wraps status")} to verify all resources are healthy`
  );
  console.log(
    `  ${pc.cyan("3.")} View analytics at ${pc.cyan("wraps console")}\n`
  );
}
