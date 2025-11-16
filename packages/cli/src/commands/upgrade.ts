import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import { deployEmailStack } from "../infrastructure/email-stack.js";
import type {
  EmailStackConfig,
  UpgradeOptions,
  WrapsEmailConfig,
} from "../types/index.js";
import { getAWSRegion, validateAWSCredentials } from "../utils/aws.js";
import { calculateCosts, formatCost } from "../utils/costs.js";
import { ensurePulumiWorkDir, getPulumiWorkDir } from "../utils/fs.js";
import {
  loadConnectionMetadata,
  saveConnectionMetadata,
  updateEmailConfig,
} from "../utils/metadata.js";
import { DeploymentProgress, displaySuccess } from "../utils/output.js";
import { getAllPresetInfo, getPreset } from "../utils/presets.js";
import { promptVercelConfig } from "../utils/prompts.js";
import { ensurePulumiInstalled } from "../utils/pulumi.js";

/**
 * Upgrade command - Enhance existing Wraps infrastructure
 */
export async function upgrade(options: UpgradeOptions): Promise<void> {
  clack.intro(pc.bold("Wraps Upgrade - Enhance Your Email Infrastructure"));

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

  if (metadata.preset) {
    console.log(`  Preset: ${pc.cyan(metadata.preset)}`);
  } else {
    console.log(`  Preset: ${pc.cyan("custom")}`);
  }

  const config = metadata.emailConfig;

  // Show sending domain if configured
  if (config.domain) {
    console.log(`  Sending Domain: ${pc.cyan(config.domain)}`);
  }

  if (config.tracking?.enabled) {
    console.log(`  ${pc.green("✓")} Open & Click Tracking`);
    if (config.tracking.customRedirectDomain) {
      console.log(
        `    ${pc.dim("└─")} Custom domain: ${pc.cyan(config.tracking.customRedirectDomain)}`
      );
    }
  }

  if (config.suppressionList?.enabled) {
    console.log(`  ${pc.green("✓")} Bounce/Complaint Suppression`);
  }

  if (config.eventTracking?.enabled) {
    console.log(`  ${pc.green("✓")} Event Tracking (EventBridge)`);
    if (config.eventTracking.dynamoDBHistory) {
      console.log(
        `    ${pc.dim("└─")} Email History: ${pc.cyan(config.eventTracking.archiveRetention || "90days")}`
      );
    }
  }

  if (config.dedicatedIp) {
    console.log(`  ${pc.green("✓")} Dedicated IP Address`);
  }

  if (config.emailArchiving?.enabled) {
    const retentionLabel =
      {
        "7days": "7 days",
        "30days": "30 days",
        "90days": "90 days",
        "6months": "6 months",
        "1year": "1 year",
        "18months": "18 months",
        indefinite: "indefinite",
      }[config.emailArchiving.retention] || "90 days";
    console.log(`  ${pc.green("✓")} Email Archiving (${retentionLabel})`);
  }

  // Calculate current cost
  const currentCostData = calculateCosts(config, 50_000); // Assume 50k emails/mo for estimate
  console.log(
    `\n  Estimated Cost: ${pc.cyan(`~${formatCost(currentCostData.total.monthly)}/mo`)}`
  );

  console.log("");

  // 6. Prompt for upgrade action
  const upgradeAction = await clack.select({
    message: "What would you like to do?",
    options: [
      {
        value: "preset",
        label: "Upgrade to a different preset",
        hint: "Starter → Production → Enterprise",
      },
      {
        value: "archiving",
        label: config.emailArchiving?.enabled
          ? "Change email archiving settings"
          : "Enable email archiving",
        hint: config.emailArchiving?.enabled
          ? "Update retention or disable"
          : "Store full email content with HTML",
      },
      {
        value: "tracking-domain",
        label: "Add/change custom tracking domain",
        hint: "Use your own domain for email links",
      },
      {
        value: "retention",
        label: "Change email history retention",
        hint: "7 days, 30 days, 90 days, 6 months, 1 year, 18 months",
      },
      {
        value: "events",
        label: "Customize tracked event types",
        hint: "Choose which SES events to track",
      },
      {
        value: "dedicated-ip",
        label: "Enable dedicated IP address",
        hint: "Requires 100k+ emails/day ($50-100/mo)",
      },
      {
        value: "custom",
        label: "Custom configuration",
        hint: "Modify multiple settings at once",
      },
    ],
  });

  if (clack.isCancel(upgradeAction)) {
    clack.cancel("Upgrade cancelled.");
    process.exit(0);
  }

  let updatedConfig: WrapsEmailConfig = { ...config };
  let newPreset: string | undefined = metadata.preset;

  // 7. Handle upgrade action
  switch (upgradeAction) {
    case "preset": {
      // Show available presets
      const presets = getAllPresetInfo();
      const currentPresetIdx = presets.findIndex(
        (p) => p.name.toLowerCase() === metadata.preset
      );

      const availablePresets = presets
        .map((p, idx) => ({
          value: p.name.toLowerCase(),
          label: `${p.name} - ${p.description}`,
          hint: `${p.volume} | Est. ${p.estimatedCost}/mo`,
          disabled:
            currentPresetIdx >= 0 && idx <= currentPresetIdx
              ? "Current or lower tier"
              : undefined,
        }))
        .filter((p) => !p.disabled);

      if (availablePresets.length === 0) {
        clack.log.warn("Already on highest preset (Enterprise)");
        process.exit(0);
      }

      const selectedPreset = await clack.select({
        message: "Select new preset:",
        options: availablePresets,
      });

      if (clack.isCancel(selectedPreset)) {
        clack.cancel("Upgrade cancelled.");
        process.exit(0);
      }

      // Get preset config but preserve domain from existing config
      const presetConfig = getPreset(selectedPreset as any)!;
      updatedConfig = {
        ...presetConfig,
        domain: config.domain, // Preserve original domain
      };
      newPreset = selectedPreset as string;
      break;
    }

    case "archiving": {
      if (config.emailArchiving?.enabled) {
        // Already enabled - allow changing retention or disabling
        const archivingAction = await clack.select({
          message: "What would you like to do with email archiving?",
          options: [
            {
              value: "change-retention",
              label: "Change retention period",
              hint: `Current: ${config.emailArchiving.retention}`,
            },
            {
              value: "disable",
              label: "Disable email archiving",
              hint: "Stop storing full email content",
            },
          ],
        });

        if (clack.isCancel(archivingAction)) {
          clack.cancel("Upgrade cancelled.");
          process.exit(0);
        }

        if (archivingAction === "disable") {
          const confirmDisable = await clack.confirm({
            message:
              "Are you sure? Existing archived emails will remain, but new emails won't be archived.",
            initialValue: false,
          });

          if (clack.isCancel(confirmDisable) || !confirmDisable) {
            clack.cancel("Archiving not disabled.");
            process.exit(0);
          }

          updatedConfig = {
            ...config,
            emailArchiving: {
              enabled: false,
              retention: config.emailArchiving.retention,
            },
          };
        } else {
          // Change retention
          const retention = await clack.select({
            message: "Email archive retention period:",
            options: [
              {
                value: "7days",
                label: "7 days",
                hint: "~$1-2/mo for 10k emails",
              },
              {
                value: "30days",
                label: "30 days",
                hint: "~$2-4/mo for 10k emails",
              },
              {
                value: "90days",
                label: "90 days (recommended)",
                hint: "~$5-10/mo for 10k emails",
              },
              {
                value: "6months",
                label: "6 months",
                hint: "~$15-25/mo for 10k emails",
              },
              {
                value: "1year",
                label: "1 year",
                hint: "~$25-40/mo for 10k emails",
              },
              {
                value: "18months",
                label: "18 months",
                hint: "~$35-60/mo for 10k emails",
              },
            ],
            initialValue: config.emailArchiving.retention,
          });

          if (clack.isCancel(retention)) {
            clack.cancel("Upgrade cancelled.");
            process.exit(0);
          }

          updatedConfig = {
            ...config,
            emailArchiving: {
              enabled: true,
              retention: retention as any,
            },
          };
        }
      } else {
        // Not enabled - prompt to enable with retention selection
        const enableArchiving = await clack.confirm({
          message:
            "Enable email archiving? (Store full email content with HTML for viewing)",
          initialValue: true,
        });

        if (clack.isCancel(enableArchiving)) {
          clack.cancel("Upgrade cancelled.");
          process.exit(0);
        }

        if (!enableArchiving) {
          clack.log.info("Email archiving not enabled.");
          process.exit(0);
        }

        const retention = await clack.select({
          message: "Email archive retention period:",
          options: [
            {
              value: "7days",
              label: "7 days",
              hint: "~$1-2/mo for 10k emails",
            },
            {
              value: "30days",
              label: "30 days",
              hint: "~$2-4/mo for 10k emails",
            },
            {
              value: "90days",
              label: "90 days (recommended)",
              hint: "~$5-10/mo for 10k emails",
            },
            {
              value: "6months",
              label: "6 months",
              hint: "~$15-25/mo for 10k emails",
            },
            {
              value: "1year",
              label: "1 year",
              hint: "~$25-40/mo for 10k emails",
            },
            {
              value: "18months",
              label: "18 months",
              hint: "~$35-60/mo for 10k emails",
            },
          ],
          initialValue: "90days",
        });

        if (clack.isCancel(retention)) {
          clack.cancel("Upgrade cancelled.");
          process.exit(0);
        }

        clack.log.info(
          pc.dim(
            "Archiving stores full RFC 822 emails with HTML, attachments, and headers"
          )
        );
        clack.log.info(
          pc.dim(
            "Cost: $2/GB ingestion + $0.19/GB/month storage (~50KB per email)"
          )
        );

        updatedConfig = {
          ...config,
          emailArchiving: {
            enabled: true,
            retention: retention as any,
          },
        };
      }
      newPreset = undefined; // Custom config
      break;
    }

    case "tracking-domain": {
      // First, check if a sending identity (domain) is configured and verified
      if (!config.domain) {
        clack.log.error(
          "No sending domain configured. You must configure a sending domain before adding a custom tracking domain."
        );
        clack.log.info(
          `Use ${pc.cyan("wraps init")} to set up a sending domain first.`
        );
        process.exit(1);
      }

      // Verify that the sending identity is verified
      const { listSESDomains } = await import("../utils/aws.js");
      const domains = await progress.execute(
        "Checking domain verification status",
        async () => await listSESDomains(region)
      );

      const sendingDomain = domains.find((d) => d.domain === config.domain);

      if (!sendingDomain?.verified) {
        clack.log.error(
          `Sending domain ${pc.cyan(config.domain)} is not verified.`
        );
        clack.log.info(
          "You must verify your sending domain before adding a custom tracking domain."
        );
        clack.log.info(
          `Use ${pc.cyan("wraps verify")} to check DNS records and complete verification.`
        );
        process.exit(1);
      }

      progress.info(
        `Sending domain ${pc.cyan(config.domain)} is verified ${pc.green("✓")}`
      );

      const trackingDomain = await clack.text({
        message: "Custom tracking redirect domain:",
        placeholder: "track.yourdomain.com",
        initialValue: config.tracking?.customRedirectDomain || "",
        validate: (value) => {
          if (value && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(value)) {
            return "Please enter a valid domain";
          }
        },
      });

      if (clack.isCancel(trackingDomain)) {
        clack.cancel("Upgrade cancelled.");
        process.exit(0);
      }

      updatedConfig = {
        ...config,
        tracking: {
          ...config.tracking,
          enabled: true,
          customRedirectDomain: trackingDomain || undefined,
        },
      };
      newPreset = undefined; // Custom config
      break;
    }

    case "retention": {
      const retention = await clack.select({
        message: "Email history retention period (event data in DynamoDB):",
        options: [
          { value: "7days", label: "7 days", hint: "Minimal storage cost" },
          { value: "30days", label: "30 days", hint: "Development/testing" },
          {
            value: "90days",
            label: "90 days (recommended)",
            hint: "Standard retention",
          },
          {
            value: "6months",
            label: "6 months",
            hint: "Extended retention",
          },
          { value: "1year", label: "1 year", hint: "Compliance requirements" },
          {
            value: "18months",
            label: "18 months",
            hint: "Long-term retention",
          },
        ],
        initialValue: config.eventTracking?.archiveRetention || "90days",
      });

      if (clack.isCancel(retention)) {
        clack.cancel("Upgrade cancelled.");
        process.exit(0);
      }

      clack.log.info(
        pc.dim(
          "Note: This is for event data (sent, delivered, opened, etc.) stored in DynamoDB."
        )
      );
      clack.log.info(
        pc.dim(
          "For full email content storage, use 'Enable email archiving' option."
        )
      );

      updatedConfig = {
        ...config,
        eventTracking: {
          ...config.eventTracking,
          enabled: true,
          dynamoDBHistory: true,
          archiveRetention: retention as any,
        },
      };
      newPreset = undefined; // Custom config
      break;
    }

    case "events": {
      const selectedEvents = await clack.multiselect({
        message: "Select SES event types to track:",
        options: [
          { value: "SEND", label: "Send", hint: "Email sent to SES" },
          {
            value: "DELIVERY",
            label: "Delivery",
            hint: "Email delivered successfully",
          },
          { value: "OPEN", label: "Open", hint: "Recipient opened email" },
          { value: "CLICK", label: "Click", hint: "Recipient clicked link" },
          { value: "BOUNCE", label: "Bounce", hint: "Email bounced" },
          {
            value: "COMPLAINT",
            label: "Complaint",
            hint: "Spam complaint received",
          },
          { value: "REJECT", label: "Reject", hint: "Email rejected by SES" },
          {
            value: "RENDERING_FAILURE",
            label: "Rendering Failure",
            hint: "Template rendering failed",
          },
          {
            value: "DELIVERY_DELAY",
            label: "Delivery Delay",
            hint: "Temporary delivery delay",
          },
          {
            value: "SUBSCRIPTION",
            label: "Subscription",
            hint: "List subscription event",
          },
        ],
        initialValues: config.eventTracking?.events || [
          "SEND",
          "DELIVERY",
          "OPEN",
          "CLICK",
          "BOUNCE",
          "COMPLAINT",
        ],
        required: true,
      });

      if (clack.isCancel(selectedEvents)) {
        clack.cancel("Upgrade cancelled.");
        process.exit(0);
      }

      updatedConfig = {
        ...config,
        eventTracking: {
          ...config.eventTracking,
          enabled: true,
          events: selectedEvents as any,
        },
      };
      newPreset = undefined; // Custom config
      break;
    }

    case "dedicated-ip": {
      const confirmed = await clack.confirm({
        message:
          "Enable dedicated IP? (Requires 100k+ emails/day, adds ~$50-100/mo)",
        initialValue: false,
      });

      if (clack.isCancel(confirmed)) {
        clack.cancel("Upgrade cancelled.");
        process.exit(0);
      }

      if (!confirmed) {
        clack.log.info("Dedicated IP not enabled.");
        process.exit(0);
      }

      updatedConfig = {
        ...config,
        dedicatedIp: true,
      };
      newPreset = undefined; // Custom config
      break;
    }

    case "custom": {
      // Full custom configuration
      const { promptCustomConfig } = await import("../utils/prompts.js");
      const customConfig = await promptCustomConfig();
      // Preserve domain from existing config
      updatedConfig = {
        ...customConfig,
        domain: config.domain,
      };
      newPreset = undefined;
      break;
    }
  }

  // 8. Show cost comparison
  const newCostData = calculateCosts(updatedConfig, 50_000);
  const costDiff = newCostData.total.monthly - currentCostData.total.monthly;

  console.log(`\n${pc.bold("Cost Impact:")}`);
  console.log(
    `  Current: ${pc.cyan(`${formatCost(currentCostData.total.monthly)}/mo`)}`
  );
  console.log(
    `  New:     ${pc.cyan(`${formatCost(newCostData.total.monthly)}/mo`)}`
  );
  if (costDiff > 0) {
    console.log(`  Change:  ${pc.yellow(`+${formatCost(costDiff)}/mo`)}`);
  } else if (costDiff < 0) {
    console.log(
      `  Change:  ${pc.green(`${formatCost(Math.abs(costDiff))}/mo`)}`
    );
  }
  console.log("");

  // 9. Confirm upgrade
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

  // 10. Get Vercel config if needed and not already stored
  let vercelConfig;
  if (metadata.provider === "vercel" && !metadata.vercel) {
    vercelConfig = await promptVercelConfig();
  } else if (metadata.provider === "vercel") {
    vercelConfig = metadata.vercel;
  }

  // 11. Build stack configuration
  const stackConfig: EmailStackConfig = {
    provider: metadata.provider,
    region,
    vercel: vercelConfig,
    emailConfig: updatedConfig,
  };

  // 12. Update Pulumi stack (incremental update)
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
                metadata.pulumiStackName ||
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
              },
              secretsProvider: "passphrase",
            }
          );

        await stack.workspace.selectStack(
          metadata.pulumiStackName || `wraps-${identity.accountId}-${region}`
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
    clack.log.error("Infrastructure upgrade failed");

    // Check if it's a lock file error
    if (error.message?.includes("stack is currently locked")) {
      clack.log.warn("\nThe Pulumi stack is locked from a previous run.");
      clack.log.info("To fix this, run:");
      clack.log.info(`  ${pc.cyan("rm -rf ~/.wraps/pulumi/.pulumi/locks")}`);
      clack.log.info("\nThen try running wraps upgrade again.");
    }

    throw new Error(`Pulumi upgrade failed: ${error.message}`);
  }

  // 13. Update metadata
  updateEmailConfig(metadata, updatedConfig);
  metadata.preset = newPreset as any;
  await saveConnectionMetadata(metadata);

  progress.info("Connection metadata updated");

  // 14. Format tracking domain DNS records if custom tracking domain was added
  const trackingDomainDnsRecords = [];
  if (outputs.customTrackingDomain) {
    // Custom tracking domains need a CNAME pointing to the regional tracking endpoint
    // This is different from DKIM verification - it's for redirect tracking
    trackingDomainDnsRecords.push({
      name: outputs.customTrackingDomain,
      type: "CNAME",
      value: `r.${outputs.region}.awstrack.me`,
    });
  }

  // 15. Display success message
  displaySuccess({
    roleArn: outputs.roleArn,
    configSetName: outputs.configSetName,
    region: outputs.region!,
    tableName: outputs.tableName,
    trackingDomainDnsRecords:
      trackingDomainDnsRecords.length > 0
        ? trackingDomainDnsRecords
        : undefined,
    customTrackingDomain: outputs.customTrackingDomain,
  });

  // Show what was upgraded
  console.log(`\n${pc.green("✓")} ${pc.bold("Upgrade complete!")}\n`);

  if (upgradeAction === "preset" && newPreset) {
    console.log(
      `Upgraded to ${pc.cyan(newPreset)} preset (${pc.green(`${formatCost(newCostData.total.monthly)}/mo`)})\n`
    );
  } else {
    console.log(
      `Updated configuration (${pc.green(`${formatCost(newCostData.total.monthly)}/mo`)})\n`
    );
  }
}
