import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import {
  createSMSEventDestinationWithSDK,
  createSMSPhonePoolWithSDK,
  createSMSProtectConfigurationWithSDK,
  deploySMSStack,
} from "../../infrastructure/sms-stack.js";
import {
  trackError,
  trackServiceDeployed,
  trackServiceInit,
} from "../../telemetry/events.js";
import type {
  Provider,
  SMSConfigPreset,
  SMSInitOptions,
  SMSStackConfig,
  SMSStackOutputs,
  WrapsSMSConfig,
} from "../../types/index.js";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import {
  ensurePulumiWorkDir,
  getPulumiWorkDir,
} from "../../utils/shared/fs.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import {
  addServiceToConnection,
  loadConnectionMetadata,
  saveConnectionMetadata,
} from "../../utils/shared/metadata.js";
import {
  DeploymentProgress,
  displayPreview,
} from "../../utils/shared/output.js";
import {
  confirmDeploy,
  promptProvider,
  promptRegion,
  promptVercelConfig,
} from "../../utils/shared/prompts.js";
import {
  ensurePulumiInstalled,
  previewWithResourceChanges,
  withLockRetry,
} from "../../utils/shared/pulumi.js";
import { getSMSCostSummary } from "../../utils/sms/costs.js";
import { displaySMSSDKUsage } from "../../utils/sms/output.js";
import { getSMSPreset, validateSMSConfig } from "../../utils/sms/presets.js";

/**
 * Prompt for phone number type
 */
async function promptPhoneNumberType(): Promise<
  "simulator" | "toll-free" | "10dlc"
> {
  const result = await clack.select({
    message: "Select phone number type:",
    options: [
      {
        value: "simulator",
        label: "Simulator ($1/mo)",
        hint: "Testing only, 100 msg/day, no registration",
      },
      {
        value: "toll-free",
        label: "Toll-free ($2/mo)",
        hint: "Production, 3 MPS, requires registration (~15 days)",
      },
      {
        value: "10dlc",
        label: "10DLC ($2/mo + fees)",
        hint: "High volume, up to 75 MPS, requires brand + campaign registration",
      },
    ],
  });

  if (clack.isCancel(result)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return result as "simulator" | "toll-free" | "10dlc";
}

/**
 * Prompt for SMS configuration preset
 */
async function promptSMSPreset(): Promise<SMSConfigPreset> {
  const result = await clack.select({
    message: "Choose configuration preset:",
    options: [
      {
        value: "starter",
        label: "Starter (~$1/mo)",
        hint: "Simulator for testing, basic tracking",
      },
      {
        value: "production",
        label: "Production (~$2-10/mo)",
        hint: "Toll-free, event tracking, message history (RECOMMENDED)",
      },
      {
        value: "enterprise",
        label: "Enterprise (~$10-50/mo)",
        hint: "Full features, link tracking, 1-year history",
      },
      {
        value: "custom",
        label: "Custom",
        hint: "Configure each feature individually",
      },
    ],
  });

  if (clack.isCancel(result)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return result as SMSConfigPreset;
}

/**
 * Common countries for SMS delivery
 */
const COMMON_COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "IN", name: "India" },
] as const;

/**
 * Prompt for allowed countries (fraud protection)
 */
async function promptAllowedCountries(): Promise<string[]> {
  const result = await clack.multiselect({
    message: "Select countries to allow SMS delivery (blocks all others):",
    options: COMMON_COUNTRIES.map((c) => ({
      value: c.code,
      label: `${c.name} (${c.code})`,
    })),
    initialValues: ["US"],
    required: true,
  });

  if (clack.isCancel(result)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return result as string[];
}

/**
 * Prompt for estimated message volume
 */
async function promptEstimatedSMSVolume(): Promise<number> {
  const result = await clack.select({
    message: "Estimated messages per month:",
    options: [
      { value: 100, label: "< 100 (Testing)" },
      { value: 1000, label: "100 - 1,000" },
      { value: 10_000, label: "1,000 - 10,000" },
      { value: 50_000, label: "10,000 - 50,000" },
      { value: 100_000, label: "50,000+" },
    ],
  });

  if (clack.isCancel(result)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return result as number;
}

/**
 * Init command - Deploy new SMS infrastructure
 */
export async function init(options: SMSInitOptions): Promise<void> {
  const startTime = Date.now();

  if (!isJsonMode()) {
    clack.intro(pc.bold("Wraps SMS Infrastructure Setup"));
  }

  const progress = new DeploymentProgress();

  // 1. Validate AWS credentials first — missing credentials is the most
  // common getting-started failure, so surface it before the Pulumi install
  // check (which can auto-download Pulumi and take ~30s)
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  progress.info(`Connected to AWS account: ${pc.cyan(identity.accountId)}`);

  // 2. Check Pulumi CLI is installed
  const wasAutoInstalled = await progress.execute(
    "Checking Pulumi CLI installation",
    async () => await ensurePulumiInstalled()
  );

  if (wasAutoInstalled) {
    progress.info("Pulumi CLI was automatically installed");
  }

  // 3. Get configuration (from options or prompts)
  const provider: Provider = options.provider || (await promptProvider());
  const region = options.region || (await promptRegion(await getAWSRegion()));

  // Get Vercel config if needed
  let vercelConfig;
  if (provider === "vercel") {
    vercelConfig = await promptVercelConfig();
  }

  // 4. Check if SMS service already exists
  const existingConnection = await loadConnectionMetadata(
    identity.accountId,
    region
  );
  if (existingConnection?.services?.sms) {
    clack.log.warn(
      `SMS already configured for account ${pc.cyan(identity.accountId)} in region ${pc.cyan(region)}`
    );
    clack.log.info(`Use ${pc.cyan("wraps sms status")} to view current setup`);
    process.exit(0);
  }

  // 5. Configuration selection
  let preset = options.preset;
  if (!preset) {
    preset = await promptSMSPreset();
  }

  let smsConfig: WrapsSMSConfig;
  if (preset === "custom") {
    // Custom config - prompt for phone number type
    const phoneNumberType = await promptPhoneNumberType();
    smsConfig = {
      phoneNumberType,
      tracking: { enabled: true, deliveryReports: true },
      eventTracking: { enabled: false },
      optOutManagement: true,
      sendingEnabled: true,
    };

    // Ask about event tracking
    const enableEventTracking = await clack.confirm({
      message: "Enable event tracking (EventBridge + DynamoDB)?",
      initialValue: false,
    });

    if (clack.isCancel(enableEventTracking)) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }

    if (enableEventTracking) {
      smsConfig.eventTracking = {
        enabled: true,
        eventBridge: true,
        events: ["SENT", "DELIVERED", "FAILED", "OPTED_OUT"],
        dynamoDBHistory: true,
        archiveRetention: "90days",
      };
    }
  } else {
    smsConfig = getSMSPreset(preset)!;

    // If starter preset, override to simulator for testing
    if (preset === "starter") {
      smsConfig.phoneNumberType = "simulator";
    }
  }

  // Prompt for allowed countries (fraud protection)
  progress.info(
    `\n${pc.bold("Fraud Protection")} - Block SMS to countries where you don't do business`
  );
  const allowedCountries = await promptAllowedCountries();

  // Ask about AIT filtering for production use (adds per-message cost)
  let aitFiltering = false;
  if (smsConfig.phoneNumberType !== "simulator") {
    const enableAIT = await clack.confirm({
      message:
        "Enable AIT (Artificially Inflated Traffic) filtering? (adds per-message cost)",
      initialValue: false,
    });

    if (clack.isCancel(enableAIT)) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }

    aitFiltering = enableAIT;
  }

  // Set protect configuration
  smsConfig.protectConfiguration = {
    enabled: true,
    allowedCountries,
    aitFiltering,
  };

  // Get estimated volume for cost calculation
  const estimatedVolume = await promptEstimatedSMSVolume();

  // Display cost summary
  progress.info(`\n${pc.bold("Cost Estimate:")}`);
  const costSummary = getSMSCostSummary(smsConfig, estimatedVolume);
  clack.log.info(costSummary);

  // Validate configuration and show warnings
  const warnings = validateSMSConfig(smsConfig);
  if (warnings.length > 0) {
    progress.info(`\n${pc.yellow(pc.bold("Important Notes:"))}`);
    for (const warning of warnings) {
      clack.log.warn(warning);
    }
  }

  // Confirm deployment (skip if --yes or --preview)
  if (!(options.yes || options.preview)) {
    const confirmed = await confirmDeploy();
    if (!confirmed) {
      clack.cancel("Deployment cancelled.");
      process.exit(0);
    }
  }

  // 6. Build stack configuration
  const stackConfig: SMSStackConfig = {
    provider,
    region,
    vercel: vercelConfig,
    smsConfig,
  };

  // 6a. Helper to create the Pulumi stack (shared between preview and deploy)
  const createStack = async () => {
    await ensurePulumiWorkDir({ accountId: identity.accountId, region });
    const stack = await pulumi.automation.LocalWorkspace.createOrSelectStack(
      {
        stackName: `wraps-sms-${identity.accountId}-${region}`,
        projectName: "wraps-sms",
        program: async () => {
          const result = await deploySMSStack(stackConfig);
          return {
            roleArn: result.roleArn,
            phoneNumber: result.phoneNumber,
            phoneNumberArn: result.phoneNumberArn,
            configSetName: result.configSetName,
            tableName: result.tableName,
            region: result.region,
            lambdaFunctions: result.lambdaFunctions,
            snsTopicArn: result.snsTopicArn,
            queueUrl: result.queueUrl,
            dlqUrl: result.dlqUrl,
            optOutListArn: result.optOutListArn,
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
    return stack;
  };

  // 7. Preview mode — show what would be created without deploying
  if (options.preview) {
    try {
      const previewResult = await progress.execute(
        "Generating infrastructure preview",
        async () => {
          const stack = await createStack();
          return previewWithResourceChanges(stack, { diff: true });
        }
      );
      displayPreview({
        changeSummary: previewResult.changeSummary,
        resourceChanges: previewResult.resourceChanges,
        costEstimate: getSMSCostSummary(smsConfig, 0),
        commandName: "wraps sms init",
      });
      clack.outro(
        pc.green("Preview complete. Run without --preview to deploy.")
      );
      trackServiceInit("sms", true, {
        provider,
        region,
        preview: true,
        duration_ms: Date.now() - startTime,
      });
    } catch (error) {
      trackError("PREVIEW_FAILED", "sms:init", { step: "preview" });
      throw error;
    }
    return;
  }

  // 7. Deploy infrastructure using Pulumi
  let outputs: SMSStackOutputs;
  try {
    outputs = await progress.execute(
      "Deploying SMS infrastructure (this may take 2-3 minutes)",
      async () => {
        const stack = await createStack();
        const upResult = await withLockRetry(
          () => stack.up({ onOutput: console.log }),
          { accountId: identity.accountId, region, autoConfirm: options.yes }
        );
        const pulumiOutputs = upResult.outputs;

        return {
          roleArn: pulumiOutputs.roleArn?.value as string,
          phoneNumber: pulumiOutputs.phoneNumber?.value as string | undefined,
          phoneNumberArn: pulumiOutputs.phoneNumberArn?.value as
            | string
            | undefined,
          configSetName: pulumiOutputs.configSetName?.value as
            | string
            | undefined,
          tableName: pulumiOutputs.tableName?.value as string | undefined,
          region: pulumiOutputs.region?.value as string,
          lambdaFunctions: pulumiOutputs.lambdaFunctions?.value as
            | string[]
            | undefined,
          snsTopicArn: pulumiOutputs.snsTopicArn?.value as string | undefined,
          queueUrl: pulumiOutputs.queueUrl?.value as string | undefined,
          dlqUrl: pulumiOutputs.dlqUrl?.value as string | undefined,
          optOutListArn: pulumiOutputs.optOutListArn?.value as
            | string
            | undefined,
        };
      }
    );

    // 7a. Create phone pool via SDK (after Pulumi deployment)
    let sdkResourceWarning = false;
    if (outputs.phoneNumberArn) {
      try {
        await progress.execute("Creating phone pool", async () => {
          await createSMSPhonePoolWithSDK(outputs.phoneNumberArn!, region);
        });
      } catch (sdkError: unknown) {
        sdkResourceWarning = true;
        const msg =
          sdkError instanceof Error ? sdkError.message : String(sdkError);
        clack.log.warn(`Phone pool creation failed: ${msg}`);
        clack.log.info(
          `Run ${pc.cyan("wraps sms sync")} to retry SDK resource creation.`
        );
      }
    }

    // 7b. Create event destination via SDK (after Pulumi deployment)
    if (
      smsConfig.eventTracking?.enabled &&
      outputs.configSetName &&
      outputs.snsTopicArn
    ) {
      try {
        await progress.execute("Configuring event destination", async () => {
          await createSMSEventDestinationWithSDK(
            outputs.configSetName!,
            outputs.snsTopicArn!,
            region
          );
        });
      } catch (sdkError: unknown) {
        sdkResourceWarning = true;
        const msg =
          sdkError instanceof Error ? sdkError.message : String(sdkError);
        clack.log.warn(`Event destination creation failed: ${msg}`);
        clack.log.info(
          `Run ${pc.cyan("wraps sms sync")} to retry SDK resource creation.`
        );
      }
    }

    // 7c. Create protect configuration via SDK (fraud protection)
    if (smsConfig.protectConfiguration?.enabled && outputs.configSetName) {
      try {
        await progress.execute("Configuring fraud protection", async () => {
          await createSMSProtectConfigurationWithSDK(
            outputs.configSetName!,
            region,
            {
              allowedCountries:
                smsConfig.protectConfiguration?.allowedCountries,
              aitFiltering: smsConfig.protectConfiguration?.aitFiltering,
            }
          );
        });
      } catch (sdkError: unknown) {
        sdkResourceWarning = true;
        const msg =
          sdkError instanceof Error ? sdkError.message : String(sdkError);
        clack.log.warn(`Protect configuration creation failed: ${msg}`);
        clack.log.info(
          `Run ${pc.cyan("wraps sms sync")} to retry SDK resource creation.`
        );
      }
    }

    if (sdkResourceWarning) {
      clack.log.warn(
        "Some SDK resources failed to create. Core infrastructure is deployed."
      );
    }
  } catch (error: unknown) {
    trackServiceInit("sms", false, {
      preset,
      provider,
      duration_ms: Date.now() - startTime,
    });

    const errorMessage = error instanceof Error ? error.message : String(error);

    trackError("DEPLOYMENT_FAILED", "sms:init", { step: "deploy" });
    throw new Error(`SMS deployment failed: ${errorMessage}`);
  }

  // 8. Save metadata
  const metadata = addServiceToConnection(
    identity.accountId,
    region,
    provider,
    "sms",
    smsConfig,
    preset === "custom" ? undefined : preset,
    existingConnection || undefined
  );
  if (vercelConfig) {
    metadata.vercel = vercelConfig;
  }
  if (metadata.services.sms) {
    metadata.services.sms.pulumiStackName = `wraps-sms-${identity.accountId}-${region}`;
  }
  await saveConnectionMetadata(metadata);

  progress.info("Connection metadata saved");

  // JSON mode: output results and skip interactive display
  if (isJsonMode()) {
    jsonSuccess("sms.init", {
      roleArn: outputs.roleArn,
      region: outputs.region,
      phoneNumber: outputs.phoneNumber,
    });
    trackServiceDeployed("sms", {
      duration_ms: Date.now() - startTime,
      features: [],
      preset,
    });
    return;
  }

  // 9. Display success message
  console.log("\n");
  clack.log.success(pc.green(pc.bold("SMS infrastructure deployed!")));
  console.log("\n");

  // Show deployed resources
  clack.note(
    [
      `${pc.bold("Phone Number:")} ${pc.cyan(outputs.phoneNumber || "Provisioning...")}`,
      `${pc.bold("Phone Type:")} ${pc.cyan(smsConfig.phoneNumberType || "simulator")}`,
      `${pc.bold("Config Set:")} ${pc.cyan(outputs.configSetName || "wraps-sms-config")}`,
      `${pc.bold("Region:")} ${pc.cyan(outputs.region)}`,
      outputs.tableName
        ? `${pc.bold("History Table:")} ${pc.cyan(outputs.tableName)}`
        : "",
      "",
      pc.dim("IAM Role:"),
      pc.dim(`  ${outputs.roleArn}`),
    ]
      .filter(Boolean)
      .join("\n"),
    "SMS Infrastructure"
  );

  // Show next steps based on phone number type
  const nextSteps = [];
  if (smsConfig.phoneNumberType === "toll-free") {
    nextSteps.push(
      `${pc.cyan("wraps sms register")} - Submit toll-free registration (required before sending)`
    );
  }
  nextSteps.push(
    `${pc.cyan("wraps sms test --to +1234567890")} - Send a test message`
  );
  nextSteps.push(`${pc.cyan("wraps sms status")} - View SMS configuration`);

  console.log("\n");
  clack.log.info(pc.bold("Next steps:"));
  for (const step of nextSteps) {
    console.log(`  ${step}`);
  }

  // Show SDK usage example
  console.log("\n");
  clack.log.info(pc.bold("SDK Usage:"));
  displaySMSSDKUsage(region);

  clack.outro(pc.green("Setup complete!"));

  // Track successful deployment
  const duration = Date.now() - startTime;
  const enabledFeatures: string[] = [];
  if (smsConfig.tracking?.enabled) {
    enabledFeatures.push("tracking");
  }
  if (smsConfig.eventTracking?.enabled) {
    enabledFeatures.push("event_tracking");
  }
  if (smsConfig.eventTracking?.dynamoDBHistory) {
    enabledFeatures.push("dynamodb_history");
  }
  if (smsConfig.optOutManagement) {
    enabledFeatures.push("opt_out_management");
  }

  trackServiceInit("sms", true, {
    preset,
    provider,
    phoneNumberType: smsConfig.phoneNumberType,
    features: enabledFeatures,
    duration_ms: duration,
  });

  trackServiceDeployed("sms", {
    duration_ms: duration,
    features: enabledFeatures,
    preset,
  });
}
