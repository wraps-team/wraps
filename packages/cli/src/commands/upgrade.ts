import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import { deployEmailStack } from "../infrastructure/email-stack.js";
import type { EmailStackConfig, UpgradeOptions } from "../types/index.js";
import { getAWSRegion, validateAWSCredentials } from "../utils/aws.js";
import { ensurePulumiWorkDir, getPulumiWorkDir } from "../utils/fs.js";
import {
  type FeatureConfig,
  loadConnectionMetadata,
  saveConnectionMetadata,
  updateFeatureMetadata,
} from "../utils/metadata.js";
import { DeploymentProgress, displaySuccess } from "../utils/output.js";
import {
  getAvailableFeatures,
  promptConflictResolution,
  promptVercelConfig,
} from "../utils/prompts.js";
import { ensurePulumiInstalled } from "../utils/pulumi.js";
import { scanAWSResources } from "../utils/scanner.js";

/**
 * Upgrade command - Add features to existing BYO connection
 */
export async function upgrade(options: UpgradeOptions): Promise<void> {
  clack.intro(pc.bold("BYO Upgrade - Add Features to Existing Connection"));

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
      `No BYO connection found for account ${pc.cyan(identity.accountId)} in region ${pc.cyan(region)}`
    );
    clack.log.info(
      `Use ${pc.cyan("byo init")} to create new infrastructure or ${pc.cyan("byo connect")} to connect existing.`
    );
    process.exit(1);
  }

  progress.info(`Found existing connection created: ${metadata.timestamp}`);

  // 5. Determine currently enabled features
  const enabledFeatures: string[] = [];
  const featureMap = metadata.features;

  if (featureMap.configSet?.enabled) {
    enabledFeatures.push("configSet");
  }
  if (featureMap.bounceHandling?.enabled) {
    enabledFeatures.push("bounceHandling");
  }
  if (featureMap.complaintHandling?.enabled) {
    enabledFeatures.push("complaintHandling");
  }
  if (featureMap.emailHistory?.enabled) {
    enabledFeatures.push("emailHistory");
  }
  if (featureMap.eventProcessor?.enabled) {
    enabledFeatures.push("eventProcessor");
  }
  if (featureMap.dashboardAccess?.enabled) {
    enabledFeatures.push("dashboardAccess");
  }

  if (enabledFeatures.length > 0) {
    console.log(`\n${pc.bold("Currently enabled features:")}`);
    const allFeatures = getAvailableFeatures();
    for (const feature of enabledFeatures) {
      const featureDef = allFeatures.find((f) => f.value === feature);
      if (featureDef) {
        console.log(`  ${pc.green("✓")} ${featureDef.label}`);
      }
    }
    console.log("");
  }

  // 6. Get available features to add
  const availableFeatures = getAvailableFeatures().filter(
    (f) => !enabledFeatures.includes(f.value)
  );

  if (availableFeatures.length === 0) {
    clack.log.info("All features are already enabled. Nothing to upgrade.");
    process.exit(0);
  }

  console.log(`${pc.bold("Available features to add:")}`);
  for (const feature of availableFeatures) {
    console.log(`  ${pc.dim("○")} ${feature.label} - ${pc.dim(feature.hint)}`);
  }
  console.log("");

  // 7. Prompt for additional features
  const additionalFeatures = await clack.multiselect({
    message: "Select features to add:",
    options: availableFeatures,
    required: true,
  });

  if (clack.isCancel(additionalFeatures)) {
    clack.cancel("Upgrade cancelled.");
    process.exit(0);
  }

  const selectedFeatures = additionalFeatures as string[];

  if (selectedFeatures.length === 0) {
    clack.log.info("No features selected. Nothing to upgrade.");
    process.exit(0);
  }

  // 8. Scan existing AWS resources for conflict detection
  const scan = await progress.execute(
    "Scanning existing AWS resources",
    async () => scanAWSResources(region)
  );

  // 9. Conflict detection for new features
  const featureConfigs: Record<string, FeatureConfig> = {
    ...metadata.features,
  };

  // Check for configuration set conflict
  if (selectedFeatures.includes("configSet")) {
    const existingConfigSets = scan.configurationSets.filter(
      (cs) => !cs.name.startsWith("byo-")
    );

    if (existingConfigSets.length > 0) {
      const action = await promptConflictResolution(
        "configuration set",
        existingConfigSets[0].name
      );

      featureConfigs.configSet = {
        enabled: action !== "skip",
        action:
          action === "replace"
            ? "replace"
            : action === "skip"
              ? "skip"
              : "deploy-new",
        originalValue: action === "replace" ? existingConfigSets[0].name : null,
        currentValue: "byo-tracking",
      };
    } else {
      featureConfigs.configSet = {
        enabled: true,
        action: "deploy-new",
        originalValue: null,
        currentValue: "byo-tracking",
      };
    }

    updateFeatureMetadata(metadata, "configSet", featureConfigs.configSet);
  }

  // Check for SNS topic conflicts (bounce handling)
  if (selectedFeatures.includes("bounceHandling")) {
    const existingSNS = scan.snsTopics.filter(
      (t) =>
        !t.name.startsWith("byo-") && t.name.toLowerCase().includes("bounce")
    );

    if (existingSNS.length > 0) {
      const action = await promptConflictResolution(
        "SNS topic (bounces)",
        existingSNS[0].name
      );

      featureConfigs.bounceHandling = {
        enabled: action !== "skip",
        action:
          action === "replace"
            ? "replace"
            : action === "skip"
              ? "skip"
              : "deploy-new",
        originalValue: action === "replace" ? existingSNS[0].arn : null,
        currentValue: "byo-bounce-complaints",
      };
    } else {
      featureConfigs.bounceHandling = {
        enabled: true,
        action: "deploy-new",
        originalValue: null,
        currentValue: "byo-bounce-complaints",
      };
    }

    updateFeatureMetadata(
      metadata,
      "bounceHandling",
      featureConfigs.bounceHandling
    );
  }

  // Complaint handling
  if (selectedFeatures.includes("complaintHandling")) {
    featureConfigs.complaintHandling = {
      enabled: true,
      action: "deploy-new",
      originalValue: null,
      currentValue: "byo-bounce-complaints",
    };
    updateFeatureMetadata(
      metadata,
      "complaintHandling",
      featureConfigs.complaintHandling
    );
  }

  // Email history
  if (selectedFeatures.includes("emailHistory")) {
    const existingTables = scan.dynamoTables.filter(
      (t) =>
        !t.name.startsWith("byo-") && t.name.toLowerCase().includes("email")
    );

    if (existingTables.length > 0) {
      const action = await promptConflictResolution(
        "DynamoDB table (email history)",
        existingTables[0].name
      );

      featureConfigs.emailHistory = {
        enabled: action !== "skip",
        action:
          action === "replace"
            ? "replace"
            : action === "skip"
              ? "skip"
              : "deploy-new",
        originalValue: action === "replace" ? existingTables[0].name : null,
        currentValue: "byo-email-history",
      };
    } else {
      featureConfigs.emailHistory = {
        enabled: true,
        action: "deploy-new",
        originalValue: null,
        currentValue: "byo-email-history",
      };
    }

    updateFeatureMetadata(
      metadata,
      "emailHistory",
      featureConfigs.emailHistory
    );
  }

  // Event processor
  if (selectedFeatures.includes("eventProcessor")) {
    featureConfigs.eventProcessor = {
      enabled: true,
      action: "deploy-new",
      originalValue: null,
      currentValue: "byo-event-processor",
    };
    updateFeatureMetadata(
      metadata,
      "eventProcessor",
      featureConfigs.eventProcessor
    );
  }

  // Dashboard access
  if (selectedFeatures.includes("dashboardAccess")) {
    featureConfigs.dashboardAccess = {
      enabled: true,
      action: "deploy-new",
      originalValue: null,
      currentValue: "byo-email-role",
    };
    updateFeatureMetadata(
      metadata,
      "dashboardAccess",
      featureConfigs.dashboardAccess
    );
  }

  // 10. Confirm upgrade
  if (!options.yes) {
    const confirmed = await clack.confirm({
      message: "Proceed with upgrade?",
      initialValue: true,
    });

    if (clack.isCancel(confirmed) || !confirmed) {
      clack.cancel("Upgrade cancelled.");
      process.exit(0);
    }
  }

  // 11. Get Vercel config if needed and not already stored
  let vercelConfig;
  if (metadata.provider === "vercel" && !metadata.vercel) {
    vercelConfig = await promptVercelConfig();
  } else if (metadata.provider === "vercel") {
    vercelConfig = metadata.vercel;
  }

  // 12. Determine integration level based on enabled features
  const allEnabledFeatures = [...enabledFeatures, ...selectedFeatures];
  const integrationLevel =
    allEnabledFeatures.includes("emailHistory") ||
    allEnabledFeatures.includes("eventProcessor")
      ? "enhanced"
      : "dashboard-only";

  // 13. Build stack configuration
  const stackConfig: EmailStackConfig = {
    provider: metadata.provider as any,
    region,
    vercel: vercelConfig,
    integrationLevel,
  };

  // 14. Update Pulumi stack (incremental update)
  let outputs;
  try {
    outputs = await progress.execute(
      "Updating BYO infrastructure (this may take 2-3 minutes)",
      async () => {
        await ensurePulumiWorkDir();

        const stack =
          await pulumi.automation.LocalWorkspace.createOrSelectStack(
            {
              stackName:
                metadata.pulumiStackName ||
                `byo-${identity.accountId}-${region}`,
              projectName: "byo-email",
              program: async () => {
                const result = await deployEmailStack(stackConfig);

                return {
                  roleArn: result.roleArn,
                  configSetName: result.configSetName,
                  tableName: result.tableName,
                  region: result.region,
                  lambdaFunctions: result.lambdaFunctions,
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
          metadata.pulumiStackName || `byo-${identity.accountId}-${region}`
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
        };
      }
    );
  } catch (error: any) {
    clack.log.error("Infrastructure upgrade failed");
    throw new Error(`Pulumi upgrade failed: ${error.message}`);
  }

  // 15. Update metadata with timestamp
  metadata.timestamp = new Date().toISOString();
  await saveConnectionMetadata(metadata);

  progress.info("Connection metadata updated");

  // 16. Display success message
  displaySuccess({
    roleArn: outputs.roleArn,
    configSetName: outputs.configSetName,
    region: outputs.region!,
    tableName: outputs.tableName,
  });

  // Show what was added
  console.log(`\n${pc.green("✓")} ${pc.bold("Upgrade complete!")}\n`);
  console.log(`${pc.bold("Added features:")}`);
  const allFeatures = getAvailableFeatures();
  for (const feature of selectedFeatures) {
    const featureDef = allFeatures.find((f) => f.value === feature);
    if (featureDef) {
      console.log(`  ${pc.green("✓")} ${featureDef.label}`);
    }
  }
  console.log("");

  // Show next steps for replaced resources
  const replacedFeatures = Object.entries(featureConfigs).filter(
    ([_, config]) => config.action === "replace"
  );

  if (replacedFeatures.length > 0) {
    console.log(`${pc.yellow("⚠ Resources were replaced:")}\n`);
    for (const [_feature, config] of replacedFeatures) {
      console.log(
        `  ${pc.cyan(config.originalValue!)} → ${pc.green(config.currentValue!)}`
      );
    }
    console.log(`\n${pc.dim("To restore: ")}${pc.cyan("byo restore")}\n`);
  }
}
