import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import { ALL_EVENT_TYPES } from "@wraps/core";
import pc from "picocolors";
import { deployEmailStack } from "../../infrastructure/email-stack.js";
import { trackError, trackServiceUpgrade } from "../../telemetry/events.js";
import type { UpgradeOptions, WrapsEmailConfig } from "../../types/index.js";
import {
  buildEmailDNSRecords,
  createDNSRecordsForProvider,
  formatManualDNSInstructions,
  getDNSProviderDisplayName,
} from "../../utils/dns/create-records.js";
import {
  detectAvailableDNSProviders,
  getDNSCredentials,
} from "../../utils/dns/credentials.js";
import { calculateCosts, formatCost } from "../../utils/email/costs.js";
import { checkEventPipeline } from "../../utils/email/event-pipeline-check.js";
import { getAllPresetInfo, getPreset } from "../../utils/email/presets.js";
import { resolveDashboardUrl } from "../../utils/selfhost/dashboard-url.js";
import { validateAWSCredentials } from "../../utils/shared/aws.js";
import {
  errors,
  extractPulumiErrorSummary,
  redactSensitiveValues,
} from "../../utils/shared/errors.js";
import {
  ensurePulumiWorkDir,
  getPulumiWorkDir,
} from "../../utils/shared/fs.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import {
  applyConfigUpdates,
  buildEmailStackConfig,
  generateWebhookSecret,
  getAllTrackedDomains,
  loadConnectionMetadata,
  saveConnectionMetadata,
  updateEmailConfig,
} from "../../utils/shared/metadata.js";
import {
  DeploymentProgress,
  displayPreview,
  displaySuccess,
} from "../../utils/shared/output.js";
import {
  type DNSProviderType,
  OPTIONAL_EVENT_TYPE_LABELS,
  promptDNSProvider,
  promptVercelConfig,
  REQUIRED_SUPPRESSION_EVENT_TYPES,
} from "../../utils/shared/prompts.js";
import {
  ensurePulumiInstalled,
  previewWithResourceChanges,
} from "../../utils/shared/pulumi.js";
import { resolveRegionForCommand } from "../../utils/shared/region-resolver.js";

/**
 * Upgrade command - Enhance existing Wraps infrastructure
 */
export async function upgrade(options: UpgradeOptions): Promise<void> {
  const startTime = Date.now();
  let upgradeAction: string | symbol = "";

  if (!isJsonMode()) {
    clack.intro(
      pc.bold(
        options.preview
          ? "Wraps Upgrade Preview"
          : "Wraps Upgrade - Enhance Your Email Infrastructure"
      )
    );
  }

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

  // 3. Get region — option → env → saved metadata. Errors if ambiguous and
  // non-interactive so the command never silently upgrades the wrong region.
  const region = await resolveRegionForCommand({
    accountId: identity.accountId,
    optionRegion: options.region,
    service: "email",
    label: "email deployment",
  });

  // 4. Load existing connection metadata
  const metadata = await loadConnectionMetadata(identity.accountId, region);

  if (!metadata) {
    clack.log.error(
      `No Wraps connection found for account ${pc.cyan(identity.accountId)} in region ${pc.cyan(region)}`
    );
    clack.log.info(
      `Use ${pc.cyan("wraps email init")} to create new infrastructure or ${pc.cyan("wraps email connect")} to connect existing.`
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

  const config = metadata.services.email?.config;

  if (!config) {
    clack.log.error("No email configuration found in metadata");
    clack.log.info(
      `Use ${pc.cyan("wraps email init")} to create new infrastructure.`
    );
    process.exit(1);
  }

  // Show sending domain if configured
  if (config.domain) {
    console.log(`  Sending Domain: ${pc.cyan(config.domain)}`);
  }

  // Detect if HTTPS tracking setup may be pending (certificate not yet validated / CloudFront not yet created)
  // We check this by looking for httpsEnabled + customRedirectDomain in saved config.
  // The actual certificate status is verified during the "finish" flow via checkCertificateValidation().
  const hasHttpsTrackingPending =
    config.tracking?.httpsEnabled && config.tracking?.customRedirectDomain;

  if (config.tracking?.enabled) {
    console.log(`  ${pc.green("✓")} Open & Click Tracking`);
    if (config.tracking.customRedirectDomain) {
      if (hasHttpsTrackingPending) {
        console.log(
          `    ${pc.dim("└─")} Custom domain: ${pc.cyan(config.tracking.customRedirectDomain)} ${pc.yellow("(HTTPS pending - certificate validation required)")}`
        );
      } else {
        console.log(
          `    ${pc.dim("└─")} Custom domain: ${pc.cyan(config.tracking.customRedirectDomain)}`
        );
      }
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
        "3months": "3 months",
        "6months": "6 months",
        "9months": "9 months",
        "1year": "1 year",
        "18months": "18 months",
        "2years": "2 years",
        "30months": "30 months",
        "3years": "3 years",
        "4years": "4 years",
        "5years": "5 years",
        "6years": "6 years",
        "7years": "7 years",
        "8years": "8 years",
        "9years": "9 years",
        "10years": "10 years",
        indefinite: "indefinite",
        permanent: "permanent",
      }[config.emailArchiving.retention] || "90 days";
    console.log(`  ${pc.green("✓")} Email Archiving (${retentionLabel})`);
  }

  if (config.alerts?.enabled) {
    console.log(`  ${pc.green("✓")} Reputation Alerts`);
    if (config.alerts.notificationEmail) {
      console.log(
        `    ${pc.dim("└─")} Email: ${pc.cyan(config.alerts.notificationEmail)}`
      );
    }
  }

  if (config.userWebhook?.enabled) {
    console.log(`  ${pc.green("✓")} Webhook Endpoint`);
    console.log(`    ${pc.dim("└─")} URL: ${pc.cyan(config.userWebhook.url)}`);
  }

  // Calculate current cost
  const currentCostData = calculateCosts(config, 50_000); // Assume 50k emails/mo for estimate
  console.log(
    `\n  Estimated Cost: ${pc.cyan(`~${formatCost(currentCostData.total.monthly)}/mo`)}`
  );

  console.log("");

  // 6. Prompt for upgrade action
  const upgradeOptions: Array<{
    value: string;
    label: string;
    hint?: string;
  }> = [];

  // Show "finish tracking" option at the top if HTTPS tracking setup is pending
  if (hasHttpsTrackingPending) {
    upgradeOptions.push({
      value: "finish-tracking-domain",
      label: "Finish setting up custom tracking domain",
      hint: `Complete HTTPS setup for ${config.tracking?.customRedirectDomain}`,
    });
  }

  upgradeOptions.push(
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
      value: "alerts",
      label: config.alerts?.enabled
        ? "Manage reputation alerts"
        : "Enable reputation alerts",
      hint: config.alerts?.enabled
        ? "Update thresholds or notification settings"
        : "Get notified before AWS suspends your account",
    },
    {
      value: "custom",
      label: "Custom configuration",
      hint: "Modify multiple settings at once",
    },
    {
      value: "wraps-dashboard",
      label: metadata.services.email?.webhookSecret
        ? "Manage Wraps Dashboard connection"
        : "Connect to Wraps Dashboard",
      hint: metadata.services.email?.webhookSecret
        ? "Regenerate secret or disconnect"
        : "Send events to dashboard for analytics",
    },
    {
      value: "user-webhook",
      label: config.userWebhook?.enabled
        ? "Manage webhook endpoint"
        : "Configure webhook endpoint",
      hint: config.userWebhook?.enabled
        ? `Sending events to ${config.userWebhook.url}`
        : "Send SES events to your own URL",
    },
    {
      value: "smtp-credentials",
      label: metadata.services.email?.smtpCredentials?.enabled
        ? "Manage SMTP credentials"
        : "Enable SMTP credentials",
      hint: metadata.services.email?.smtpCredentials?.enabled
        ? "Rotate or disable credentials"
        : "Generate credentials for PHP, WordPress, etc.",
    },
    {
      value: "hosting-provider",
      label: "Change hosting provider",
      hint:
        metadata.provider === "vercel"
          ? `Currently: Vercel (${metadata.vercel?.teamSlug || "configured"})`
          : `Currently: ${metadata.provider} → Switch to Vercel OIDC, etc.`,
    }
  );

  const unmigratedCount = (
    metadata.services.email?.config.additionalDomains ?? []
  ).filter((d) => !d.configSetName).length;
  if (unmigratedCount > 0) {
    upgradeOptions.push({
      value: "per-domain-config-sets",
      label: "Per-domain configuration sets",
      hint: `Migrate ${unmigratedCount} additional domain(s) to dedicated SES config sets`,
    });
  }

  if (options.action) {
    upgradeAction = options.action;
  } else {
    upgradeAction = await clack.select({
      message: "What would you like to do?",
      options: upgradeOptions,
    });

    if (clack.isCancel(upgradeAction)) {
      clack.cancel("Upgrade cancelled.");
      process.exit(0);
    }
  }

  let updatedConfig: WrapsEmailConfig = { ...config };
  let newPreset: string | undefined = metadata.services.email?.preset;

  // 7. Handle upgrade action
  switch (upgradeAction) {
    case "finish-tracking-domain": {
      // Skip all prompts — use the existing config as-is to re-run deployment
      // The email-stack will check if the ACM certificate is now validated
      // and create the CloudFront distribution if it is
      clack.log.info(
        `Checking certificate status for ${pc.cyan(config.tracking?.customRedirectDomain ?? "")}...`
      );
      updatedConfig = { ...config };
      newPreset = metadata.services.email?.preset;
      break;
    }

    case "preset": {
      // Show available presets (exclude "custom" since it's not a tier upgrade)
      const presets = getAllPresetInfo().filter(
        (p) => p.name.toLowerCase() !== "custom"
      );
      const currentPresetIdx = presets.findIndex(
        (p) => p.name.toLowerCase() === metadata.services.email?.preset
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

      let selectedPreset: string | symbol;
      if (options.preset) {
        selectedPreset = options.preset;
      } else {
        selectedPreset = await clack.select({
          message: "Select new preset:",
          options: availablePresets,
        });

        if (clack.isCancel(selectedPreset)) {
          clack.cancel("Upgrade cancelled.");
          process.exit(0);
        }
      }

      // Get preset config but preserve user-customized fields from existing config
      const presetConfig = getPreset(selectedPreset as any)!;

      // Apply preset updates to existing config (preserves user customizations)
      updatedConfig = applyConfigUpdates(config, presetConfig);
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
          `Use ${pc.cyan("wraps email init")} to set up a sending domain first.`
        );
        process.exit(1);
      }

      // Verify that the sending identity is verified
      const { listSESDomains } = await import("../../utils/shared/aws.js");
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
          `Use ${pc.cyan("wraps email verify")} to check DNS records and complete verification.`
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

      // Ask if HTTPS tracking should be enabled
      const enableHttps = await clack.confirm({
        message: "Enable HTTPS tracking with CloudFront + SSL certificate?",
        initialValue: true,
      });

      if (clack.isCancel(enableHttps)) {
        clack.cancel("Upgrade cancelled.");
        process.exit(0);
      }

      if (enableHttps) {
        clack.log.info(
          pc.dim(
            "HTTPS tracking creates a CloudFront distribution with an SSL certificate."
          )
        );
        clack.log.info(
          pc.dim(
            "This ensures all tracking links use secure HTTPS connections."
          )
        );

        // Check DNS provider - use stored provider or detect available providers
        let trackingDnsProvider: DNSProviderType | undefined =
          metadata.services.email?.dnsProvider;
        let canAutomateDNS = false;

        if (trackingDnsProvider) {
          // Use stored DNS provider
          canAutomateDNS = trackingDnsProvider !== "manual";
          if (canAutomateDNS) {
            progress.info(
              `Will use ${pc.cyan(getDNSProviderDisplayName(trackingDnsProvider))} for DNS records ${pc.green("✓")}`
            );
          }
        } else {
          // No stored DNS provider, detect available providers
          const availableProviders = await progress.execute(
            "Detecting available DNS providers",
            async () =>
              await detectAvailableDNSProviders(
                trackingDomain || config.domain!,
                region
              )
          );

          const detectedProvider = availableProviders.find(
            (p) => p.detected && p.provider !== "manual"
          );
          if (detectedProvider) {
            trackingDnsProvider = detectedProvider.provider;
            canAutomateDNS = true;
            progress.info(
              `Found ${pc.cyan(getDNSProviderDisplayName(detectedProvider.provider))} ${pc.green("✓")}`
            );
            clack.log.info(
              pc.dim(
                "DNS records (SSL certificate validation + CloudFront) will be created automatically."
              )
            );
          } else {
            canAutomateDNS = false;
            clack.log.warn(
              `No automatic DNS provider detected for ${pc.cyan(trackingDomain || config.domain!)}`
            );
            clack.log.info(
              pc.dim(
                "You'll need to manually create DNS records for SSL certificate validation and CloudFront."
              )
            );
            clack.log.info(
              pc.dim("DNS record details will be shown after deployment.")
            );
          }
        }

        const confirmHttps = await clack.confirm({
          message: canAutomateDNS
            ? "Proceed with automatic HTTPS setup?"
            : "Proceed with manual HTTPS setup (requires DNS configuration)?",
          initialValue: true,
        });

        if (clack.isCancel(confirmHttps) || !confirmHttps) {
          clack.log.info("HTTPS tracking not enabled. Using HTTP tracking.");
          updatedConfig = {
            ...config,
            tracking: {
              ...config.tracking,
              enabled: true,
              customRedirectDomain: trackingDomain || undefined,
              httpsEnabled: false,
            },
          };
        } else {
          updatedConfig = {
            ...config,
            tracking: {
              ...config.tracking,
              enabled: true,
              customRedirectDomain: trackingDomain || undefined,
              httpsEnabled: true,
            },
          };
        }
      } else {
        clack.log.info(
          pc.dim(
            "Using HTTP tracking (standard). Links will use http:// protocol."
          )
        );
        updatedConfig = {
          ...config,
          tracking: {
            ...config.tracking,
            enabled: true,
            customRedirectDomain: trackingDomain || undefined,
            httpsEnabled: false,
          },
        };
      }

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
      const optionalEventTypes = ALL_EVENT_TYPES.filter(
        (type) => !REQUIRED_SUPPRESSION_EVENT_TYPES.includes(type)
      );
      const existingEventTypes = config.eventTracking?.events;

      const selectedEvents = await clack.multiselect({
        message:
          "Select optional SES event types to track (BOUNCE and COMPLAINT are always included):",
        options: optionalEventTypes.map((type) => ({
          value: type,
          label: OPTIONAL_EVENT_TYPE_LABELS[type] ?? type,
        })),
        initialValues: existingEventTypes
          ? optionalEventTypes.filter((type) =>
              existingEventTypes.includes(type)
            )
          : optionalEventTypes,
        required: false,
      });

      if (clack.isCancel(selectedEvents)) {
        clack.cancel("Upgrade cancelled.");
        process.exit(0);
      }

      clack.log.info(
        pc.dim(
          "BOUNCE and COMPLAINT are always included — dropping them would leave your pipeline blind to bounces and complaints, and your domain reputation would degrade."
        )
      );

      const events = ALL_EVENT_TYPES.filter(
        (type) =>
          REQUIRED_SUPPRESSION_EVENT_TYPES.includes(type) ||
          (selectedEvents as string[]).includes(type)
      );

      updatedConfig = {
        ...config,
        eventTracking: {
          ...config.eventTracking,
          enabled: true,
          events,
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

    case "alerts": {
      // Check if reputation metrics are enabled (required for alerts)
      if (!config.reputationMetrics) {
        clack.log.warn("Reputation metrics must be enabled to use alerting.");
        clack.log.info(
          "This requires the Production or Enterprise preset, or enabling reputation metrics manually."
        );

        const enableReputationMetrics = await clack.confirm({
          message: "Enable reputation metrics now?",
          initialValue: true,
        });

        if (
          clack.isCancel(enableReputationMetrics) ||
          !enableReputationMetrics
        ) {
          clack.cancel("Alerting not enabled.");
          process.exit(0);
        }

        // Enable reputation metrics
        updatedConfig = {
          ...config,
          reputationMetrics: true,
        };
      }

      if (config.alerts?.enabled) {
        // Already enabled - allow modifying or disabling
        clack.log.info(`Alerting is currently ${pc.green("enabled")}`);
        if (config.alerts.notificationEmail) {
          clack.log.info(
            `  Notification email: ${pc.cyan(config.alerts.notificationEmail)}`
          );
        }

        const alertsAction = await clack.select({
          message: "What would you like to do?",
          options: [
            {
              value: "change-email",
              label: "Change notification email",
              hint: config.alerts.notificationEmail || "Not set",
            },
            {
              value: "change-thresholds",
              label: "Customize alert thresholds",
              hint: "Adjust bounce/complaint rate thresholds",
            },
            {
              value: "disable",
              label: "Disable alerting",
              hint: "Remove CloudWatch alarms and SNS topic",
            },
          ],
        });

        if (clack.isCancel(alertsAction)) {
          clack.cancel("Upgrade cancelled.");
          process.exit(0);
        }

        if (alertsAction === "disable") {
          const confirmDisable = await clack.confirm({
            message:
              "Are you sure? You won't be notified if your reputation degrades.",
            initialValue: false,
          });

          if (clack.isCancel(confirmDisable) || !confirmDisable) {
            clack.log.info("Alerting not disabled.");
            process.exit(0);
          }

          updatedConfig = {
            ...config,
            alerts: { enabled: false },
          };
        } else if (alertsAction === "change-email") {
          const notificationEmail = await clack.text({
            message: "Notification email address:",
            placeholder: "alerts@yourcompany.com",
            initialValue: config.alerts.notificationEmail || "",
            validate: (value) => {
              if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                return "Please enter a valid email address";
              }
            },
          });

          if (clack.isCancel(notificationEmail)) {
            clack.cancel("Upgrade cancelled.");
            process.exit(0);
          }

          updatedConfig = {
            ...config,
            alerts: {
              ...config.alerts,
              enabled: true,
              notificationEmail: notificationEmail || undefined,
            },
          };
        } else if (alertsAction === "change-thresholds") {
          // Show current thresholds and allow customization
          clack.log.info(`\n${pc.bold("Alert Thresholds")}`);
          clack.log.info(
            pc.dim("These thresholds warn you BEFORE AWS takes action:")
          );
          clack.log.info(pc.dim("  AWS warns at 5% bounce, 0.1% complaint"));
          clack.log.info(pc.dim("  Gmail blocks at 0.3% complaint rate\n"));

          const thresholdPreset = await clack.select({
            message: "Choose threshold sensitivity:",
            options: [
              {
                value: "standard",
                label: "Standard (recommended)",
                hint: "Bounce: 2%/4%, Complaint: 0.05%/0.08%",
              },
              {
                value: "strict",
                label: "Strict (enterprise)",
                hint: "Bounce: 1%/2%, Complaint: 0.03%/0.05%",
              },
              {
                value: "relaxed",
                label: "Relaxed",
                hint: "Bounce: 3%/5%, Complaint: 0.08%/0.1%",
              },
            ],
          });

          if (clack.isCancel(thresholdPreset)) {
            clack.cancel("Upgrade cancelled.");
            process.exit(0);
          }

          const thresholdConfigs = {
            standard: {
              bounceRateWarning: 0.02,
              bounceRateCritical: 0.04,
              complaintRateWarning: 0.0005,
              complaintRateCritical: 0.0008,
            },
            strict: {
              bounceRateWarning: 0.01,
              bounceRateCritical: 0.02,
              complaintRateWarning: 0.0003,
              complaintRateCritical: 0.0005,
            },
            relaxed: {
              bounceRateWarning: 0.03,
              bounceRateCritical: 0.05,
              complaintRateWarning: 0.0008,
              complaintRateCritical: 0.001,
            },
          };

          updatedConfig = {
            ...config,
            alerts: {
              ...config.alerts,
              enabled: true,
              thresholds:
                thresholdConfigs[
                  thresholdPreset as keyof typeof thresholdConfigs
                ],
            },
          };
        }
      } else {
        // Not enabled - prompt to enable
        clack.log.info(`\n${pc.bold("Reputation Alerts")}\n`);
        clack.log.info(
          pc.dim("Get notified when your email reputation is at risk:")
        );
        clack.log.info(pc.dim("  - Bounce rate warnings (before AWS review)"));
        clack.log.info(
          pc.dim("  - Complaint rate warnings (before Gmail blocks you)")
        );
        clack.log.info(pc.dim("  - DLQ alerts (event processing failures)"));
        clack.log.info(pc.dim("\nCost: ~$0.50/mo (5 CloudWatch alarms)\n"));

        const enableAlerts = await clack.confirm({
          message: "Enable reputation alerts?",
          initialValue: true,
        });

        if (clack.isCancel(enableAlerts) || !enableAlerts) {
          clack.log.info("Alerting not enabled.");
          process.exit(0);
        }

        const notificationEmail = await clack.text({
          message: "Notification email address:",
          placeholder: "alerts@yourcompany.com",
          validate: (value) => {
            if (!value) {
              return "Email address is required for alerts";
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
              return "Please enter a valid email address";
            }
          },
        });

        if (clack.isCancel(notificationEmail)) {
          clack.cancel("Upgrade cancelled.");
          process.exit(0);
        }

        clack.log.info(
          pc.dim("\nYou'll receive an email to confirm your subscription.")
        );

        updatedConfig = {
          ...config,
          reputationMetrics: true, // Required for alerts
          alerts: {
            enabled: true,
            notificationEmail: notificationEmail as string,
            dlqAlerts: true,
            // Uses default thresholds
          },
        };
      }
      newPreset = undefined; // Custom config
      break;
    }

    case "custom": {
      // Full custom configuration
      const { promptCustomConfig } = await import(
        "../../utils/shared/prompts.js"
      );

      // Pass existing config to preserve values
      const customConfig = await promptCustomConfig(config);

      // Apply custom config updates to existing config (preserves user-customized fields)
      updatedConfig = applyConfigUpdates(config, customConfig);
      newPreset = undefined;
      break;
    }

    case "wraps-dashboard": {
      // Check if event tracking is enabled (required for webhook)
      if (!config.eventTracking?.enabled) {
        clack.log.warn(
          "Event tracking must be enabled to connect to Wraps Dashboard."
        );
        clack.log.info(
          "Enabling event tracking will allow SES events to be sent to the dashboard."
        );

        const enableEventTracking = await clack.confirm({
          message: "Enable event tracking now?",
          initialValue: true,
        });

        if (clack.isCancel(enableEventTracking) || !enableEventTracking) {
          clack.cancel("Dashboard connection cancelled.");
          process.exit(0);
        }

        // Enable event tracking
        updatedConfig = {
          ...config,
          eventTracking: {
            enabled: true,
            eventBridge: true,
            events: [...ALL_EVENT_TYPES],
            dynamoDBHistory: config.eventTracking?.dynamoDBHistory ?? false,
            archiveRetention:
              config.eventTracking?.archiveRetention ?? "90days",
          },
        };
      }

      // Check if already connected
      const existingSecret = metadata.services.email?.webhookSecret;

      if (existingSecret) {
        clack.log.info(
          `Currently connected to Wraps Dashboard (AWS Account: ${pc.cyan(metadata.accountId)})`
        );

        const action = await clack.select({
          message: "What would you like to do?",
          options: [
            {
              value: "regenerate",
              label: "Regenerate webhook secret",
              hint: "Create new secret (requires update in dashboard)",
            },
            {
              value: "disconnect",
              label: "Disconnect from dashboard",
              hint: "Stop sending events to Wraps",
            },
            {
              value: "cancel",
              label: "Cancel",
              hint: "Keep current settings",
            },
          ],
        });

        if (clack.isCancel(action) || action === "cancel") {
          clack.log.info("No changes made.");
          process.exit(0);
        }

        if (action === "disconnect") {
          const confirmDisconnect = await clack.confirm({
            message:
              "Are you sure? Events will no longer be sent to the Wraps Dashboard.",
            initialValue: false,
          });

          if (clack.isCancel(confirmDisconnect) || !confirmDisconnect) {
            clack.log.info("Disconnect cancelled.");
            process.exit(0);
          }

          // Clear webhook config in metadata
          if (metadata.services.email) {
            metadata.services.email.webhookSecret = undefined;
          }

          // Note: The EventBridge API Destination resources will be cleaned up
          // by Pulumi since we won't pass webhook config to deployEmailStack
          updatedConfig = { ...config };
          newPreset = undefined;
          break;
        }

        // Regenerating secret - fall through to generate new secret
      }

      // Generate webhook secret
      const webhookSecret = generateWebhookSecret();

      clack.log.info(`\n${pc.bold("Webhook Configuration:")}`);
      clack.log.info(
        pc.dim("A secure webhook secret has been generated for authentication.")
      );
      clack.log.info(
        pc.dim(
          "After deployment, you'll need to register this secret in the dashboard.\n"
        )
      );

      // Store in metadata for later (AWS account number is already in metadata.accountId)
      if (metadata.services.email) {
        metadata.services.email.webhookSecret = webhookSecret;
      }

      // Ensure event tracking is in the updated config
      if (updatedConfig.eventTracking?.enabled) {
        updatedConfig = { ...config };
      } else {
        updatedConfig = {
          ...config,
          eventTracking: {
            ...config.eventTracking,
            enabled: true,
            eventBridge: true,
            events: config.eventTracking?.events || [...ALL_EVENT_TYPES],
          },
        };
      }

      newPreset = undefined;
      break;
    }

    case "user-webhook": {
      const validateWebhookUrl = (value: string) => {
        try {
          const url = new URL(value);
          if (url.protocol !== "https:") {
            return "Webhook URL must use HTTPS";
          }
          if (!url.hostname.includes(".")) {
            return "Webhook URL must use a public hostname";
          }
          // baseline:allow-next-line no-swallowed-errors — URL parse failure means invalid input
        } catch {
          return "Please enter a valid URL";
        }
      };

      // Check if event tracking is enabled (required for webhook)
      if (!config.eventTracking?.enabled) {
        clack.log.warn(
          "Event tracking must be enabled to configure a webhook endpoint."
        );
        clack.log.info(
          "Enabling event tracking will allow SES events to be sent to your endpoint."
        );

        const enableEventTracking = await clack.confirm({
          message: "Enable event tracking now?",
          initialValue: true,
        });

        if (clack.isCancel(enableEventTracking) || !enableEventTracking) {
          clack.cancel("Webhook configuration cancelled.");
          process.exit(0);
        }

        // Enable event tracking
        updatedConfig = {
          ...config,
          eventTracking: {
            enabled: true,
            eventBridge: true,
            events: [...ALL_EVENT_TYPES],
            dynamoDBHistory: config.eventTracking?.dynamoDBHistory ?? false,
            archiveRetention:
              config.eventTracking?.archiveRetention ?? "90days",
          },
        };
      }

      if (config.userWebhook?.enabled) {
        // Already configured - manage existing webhook
        clack.log.info(
          `Webhook endpoint currently sending events to: ${pc.cyan(config.userWebhook.url)}`
        );

        const action = await clack.select({
          message: "What would you like to do?",
          options: [
            {
              value: "change-url",
              label: "Change webhook URL",
              hint: config.userWebhook.url,
            },
            {
              value: "regenerate-secret",
              label: "Regenerate webhook secret",
              hint: "Create new secret (update your endpoint)",
            },
            {
              value: "disable",
              label: "Disable webhook",
              hint: "Stop sending events to your endpoint",
            },
            {
              value: "cancel",
              label: "Cancel",
              hint: "Keep current settings",
            },
          ],
        });

        if (clack.isCancel(action) || action === "cancel") {
          clack.log.info("No changes made.");
          process.exit(0);
        }

        if (action === "disable") {
          const confirmDisable = await clack.confirm({
            message:
              "Are you sure? Events will no longer be sent to your webhook endpoint.",
            initialValue: false,
          });

          if (clack.isCancel(confirmDisable) || !confirmDisable) {
            clack.log.info("Webhook not disabled.");
            process.exit(0);
          }

          updatedConfig = {
            ...updatedConfig,
            userWebhook: { enabled: false },
          };
          newPreset = undefined;
          break;
        }

        if (action === "change-url") {
          const newUrl = await clack.text({
            message: "New webhook URL:",
            placeholder: "https://your-app.com/webhooks/email-events",
            validate: validateWebhookUrl,
          });

          if (clack.isCancel(newUrl)) {
            clack.cancel("Webhook configuration cancelled.");
            process.exit(0);
          }

          updatedConfig = {
            ...updatedConfig,
            userWebhook: {
              enabled: true,
              url: newUrl as string,
              secret: config.userWebhook.secret,
            },
          };
          newPreset = undefined;
          break;
        }

        if (action === "regenerate-secret") {
          const newSecret = generateWebhookSecret();
          updatedConfig = {
            ...updatedConfig,
            userWebhook: {
              enabled: true,
              url: config.userWebhook.url,
              secret: newSecret,
            },
          };
          newPreset = undefined;
          break;
        }
      } else {
        // New webhook setup
        clack.log.info(`\n${pc.bold("Webhook Endpoint")}\n`);
        clack.log.info(
          pc.dim("Send SES events (send, delivery, open, click, bounce, etc.)")
        );
        clack.log.info(pc.dim("to your own HTTP endpoint in real-time.\n"));

        const webhookUrl = await clack.text({
          message: "Webhook URL (must be HTTPS):",
          placeholder: "https://your-app.com/webhooks/email-events",
          validate: validateWebhookUrl,
        });

        if (clack.isCancel(webhookUrl)) {
          clack.cancel("Webhook configuration cancelled.");
          process.exit(0);
        }

        const secret = generateWebhookSecret();

        updatedConfig = {
          ...updatedConfig,
          userWebhook: {
            enabled: true,
            url: webhookUrl as string,
            secret,
          },
        };
        newPreset = undefined;
      }
      break;
    }

    case "smtp-credentials": {
      // Check if already has SMTP credentials
      if (metadata.services.email?.smtpCredentials?.enabled) {
        clack.log.info(
          `SMTP credentials are currently ${pc.green("enabled")} (created ${metadata.services.email.smtpCredentials.createdAt})`
        );

        const smtpAction = await clack.select({
          message: "What would you like to do?",
          options: [
            {
              value: "rotate",
              label: "Rotate credentials",
              hint: "Generate new credentials (invalidates old ones)",
            },
            {
              value: "disable",
              label: "Disable SMTP credentials",
              hint: "Delete IAM user and credentials",
            },
            {
              value: "cancel",
              label: "Cancel",
              hint: "Keep current credentials",
            },
          ],
        });

        if (clack.isCancel(smtpAction) || smtpAction === "cancel") {
          clack.log.info("No changes made.");
          process.exit(0);
        }

        if (smtpAction === "disable") {
          const confirmDisable = await clack.confirm({
            message:
              "Are you sure? Any systems using these credentials will stop working immediately.",
            initialValue: false,
          });

          if (clack.isCancel(confirmDisable) || !confirmDisable) {
            clack.log.info("SMTP credentials not disabled.");
            process.exit(0);
          }

          // Set enabled to false - Pulumi will delete resources
          updatedConfig = {
            ...config,
            smtpCredentials: { enabled: false },
          };

          // Clear metadata after deployment will succeed
          if (metadata.services.email) {
            metadata.services.email.smtpCredentials = undefined;
          }

          newPreset = undefined;
          break;
        }

        // For rotation, we'll generate new credentials by setting enabled: true
        // Pulumi will create a new access key
        clack.log.info(
          "\nRotating credentials will invalidate your current SMTP password."
        );
        clack.log.warn(
          "You will need to update all systems using the old credentials."
        );

        const confirmRotate = await clack.confirm({
          message: "Generate new SMTP credentials?",
          initialValue: false,
        });

        if (clack.isCancel(confirmRotate) || !confirmRotate) {
          clack.log.info("Credential rotation cancelled.");
          process.exit(0);
        }

        // Continue with rotation
      }

      // Show info about SMTP
      clack.log.info(`\n${pc.bold("SMTP Credentials for Legacy Systems")}\n`);
      clack.log.info(
        pc.dim("Generate SMTP username/password that works with:")
      );
      clack.log.info(pc.dim("  - PHP mail() and PHPMailer"));
      clack.log.info(pc.dim("  - WordPress (WP Mail SMTP plugin)"));
      clack.log.info(pc.dim("  - Nodemailer and other SMTP libraries"));
      clack.log.info(pc.dim("  - Any SMTP-compatible email client"));
      console.log("");

      clack.log.warn(
        "Credentials will be shown ONCE after deployment - save them immediately!"
      );
      console.log("");

      if (!options.yes) {
        const confirmCreate = await clack.confirm({
          message: "Create SMTP credentials?",
          initialValue: true,
        });

        if (clack.isCancel(confirmCreate) || !confirmCreate) {
          clack.log.info("SMTP credentials not created.");
          process.exit(0);
        }
      }

      updatedConfig = {
        ...config,
        smtpCredentials: {
          enabled: true,
          createdAt: new Date().toISOString(),
        },
      };
      newPreset = undefined;
      break;
    }

    case "hosting-provider": {
      const newProvider = await clack.select({
        message: "Where is your app hosted?",
        options: [
          {
            value: "aws",
            label: "AWS (Lambda/ECS/EC2)",
            hint: "Uses IAM roles automatically",
          },
          {
            value: "vercel",
            label: "Vercel",
            hint: "Uses OIDC (no AWS credentials needed)",
          },
          {
            value: "railway",
            label: "Railway",
            hint: "Requires AWS credentials",
          },
          {
            value: "other",
            label: "Other",
            hint: "Will use AWS access keys",
          },
        ],
      });

      if (clack.isCancel(newProvider)) {
        clack.cancel("Upgrade cancelled.");
        process.exit(0);
      }

      if (newProvider === metadata.provider) {
        clack.log.info("Provider unchanged — no changes needed.");
        process.exit(0);
      }

      metadata.provider = newProvider as typeof metadata.provider;

      if (newProvider === "vercel") {
        metadata.vercel = await promptVercelConfig();
      } else {
        metadata.vercel = undefined;
      }

      break;
    }

    case "per-domain-config-sets": {
      const {
        SESv2Client,
        CreateConfigurationSetCommand,
        CreateConfigurationSetEventDestinationCommand,
        PutEmailIdentityConfigurationSetAttributesCommand,
        EventType,
      } = await import("@aws-sdk/client-sesv2");
      const { domainToConfigSetName } = await import(
        "../../utils/email/config-set-slug.js"
      );

      const sesClient = new SESv2Client({ region });
      const accountId = identity.accountId;

      const additionalDomains =
        metadata.services.email?.config.additionalDomains ?? [];
      const unmigratedDomains = additionalDomains.filter(
        (d) => !d.configSetName
      );

      if (unmigratedDomains.length === 0) {
        clack.log.info(
          "All additional domains are already migrated to per-domain config sets."
        );
        clack.outro(pc.green("✓ Nothing to migrate"));
        trackServiceUpgrade("email", {
          action: "per-domain-config-sets",
          duration_ms: Date.now() - startTime,
        });
        return;
      }

      clack.log.info(
        `Migrating ${unmigratedDomains.length} domain(s) to per-domain configuration sets...`
      );

      const eventBusArn = `arn:aws:events:${region}:${accountId}:event-bus/default`;

      for (let i = 0; i < unmigratedDomains.length; i++) {
        const d = unmigratedDomains[i];
        const configSetName = domainToConfigSetName(d.domain);

        clack.log.step(
          `Migrating ${pc.cyan(d.domain)} → ${pc.dim(configSetName)}`
        );

        await progress.execute(
          `Creating config set for ${d.domain}`,
          async () => {
            try {
              await sesClient.send(
                new CreateConfigurationSetCommand({
                  ConfigurationSetName: configSetName,
                  SuppressionOptions: {
                    SuppressedReasons: ["BOUNCE", "COMPLAINT"],
                  },
                })
              );
            } catch (err) {
              if ((err as { name?: string }).name !== "AlreadyExistsException")
                throw err;
            }
          }
        );

        const matchingEventTypes = [
          EventType.SEND,
          EventType.DELIVERY,
          EventType.OPEN,
          EventType.CLICK,
          EventType.BOUNCE,
          EventType.COMPLAINT,
          EventType.REJECT,
          EventType.RENDERING_FAILURE,
          EventType.DELIVERY_DELAY,
          EventType.SUBSCRIPTION,
        ];

        await progress.execute(
          `Adding EventBridge destination for ${d.domain}`,
          async () => {
            try {
              await sesClient.send(
                new CreateConfigurationSetEventDestinationCommand({
                  ConfigurationSetName: configSetName,
                  EventDestinationName: "wraps-email-eventbridge",
                  EventDestination: {
                    Enabled: true,
                    MatchingEventTypes: matchingEventTypes,
                    EventBridgeDestination: { EventBusArn: eventBusArn },
                  },
                })
              );
            } catch (err) {
              if ((err as { name?: string }).name !== "AlreadyExistsException")
                throw err;
            }
          }
        );

        // Persist configSetName BEFORE identity reassignment (resumable on failure)
        d.configSetName = configSetName;
        await saveConnectionMetadata(metadata); // baseline:allow-early-save — migration checkpoint; Pulumi re-deploy comes later

        try {
          await progress.execute(
            `Reassigning identity ${d.domain}`,
            async () => {
              await sesClient.send(
                new PutEmailIdentityConfigurationSetAttributesCommand({
                  EmailIdentity: d.domain,
                  ConfigurationSetName: configSetName,
                })
              );
            }
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          clack.log.warn(
            `Failed to reassign identity for ${pc.cyan(d.domain)}: ${msg}`
          );
          clack.log.info(
            pc.dim(
              `Config set was saved — re-run to retry identity reassignment for ${d.domain}`
            )
          );
        }

        // Rate limit: 1-second delay between domains
        if (i < unmigratedDomains.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      clack.log.info(
        `For the primary domain (${pc.cyan(config.domain ?? "")}) config set rename: re-run ${pc.cyan("wraps email upgrade")} with a Pulumi stack update.`
      );

      clack.outro(
        pc.green(
          `✓ Per-domain config sets migration complete (${unmigratedDomains.length} domain(s))`
        )
      );

      trackServiceUpgrade("email", {
        action: "per-domain-config-sets",
        duration_ms: Date.now() - startTime,
      });
      return;
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

  // 9. Confirm upgrade (skip if --yes or --preview)
  if (!(options.yes || options.preview)) {
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
  if (metadata.provider === "vercel" && !metadata.vercel) {
    metadata.vercel = await promptVercelConfig();
  }

  // 11. Build stack configuration (webhook automatically included from metadata)
  const stackConfig = buildEmailStackConfig(metadata, region, {
    emailConfig: updatedConfig,
  });

  // 11.5. Ensure CAA records allow Amazon to issue certificates (for HTTPS tracking)
  if (
    updatedConfig.tracking?.httpsEnabled &&
    updatedConfig.tracking.customRedirectDomain
  ) {
    // Get the parent domain for DNS operations
    const trackingDomainParts =
      updatedConfig.tracking.customRedirectDomain.split(".");
    const parentDomain =
      trackingDomainParts.length > 2
        ? trackingDomainParts.slice(-2).join(".")
        : updatedConfig.tracking.customRedirectDomain;

    // Get stored DNS provider or detect one
    let dnsProvider: DNSProviderType | undefined =
      metadata.services.email?.dnsProvider;

    // If no DNS provider stored, try to detect one
    if (!dnsProvider) {
      const availableProviders = await progress.execute(
        "Detecting DNS provider for CAA check",
        async () => await detectAvailableDNSProviders(parentDomain, region)
      );

      const detectedProvider = availableProviders.find(
        (p) => p.detected && p.provider !== "manual"
      );
      if (detectedProvider) {
        dnsProvider = detectedProvider.provider;
        // Store for future use
        if (metadata.services.email) {
          metadata.services.email.dnsProvider = dnsProvider;
        }
      }
    }

    if (dnsProvider && dnsProvider !== "manual" && dnsProvider !== "route53") {
      const credResult = await getDNSCredentials(
        dnsProvider,
        parentDomain,
        region
      );

      if (credResult.valid && credResult.credentials) {
        const { ensureAmazonCAAAllowed } = await import(
          "../../utils/dns/caa.js"
        );

        const caaResult = await progress.execute(
          "Checking CAA records for certificate issuance",
          async () =>
            await ensureAmazonCAAAllowed(credResult.credentials!, parentDomain)
        );

        if (caaResult.recordCreated) {
          progress.info(
            `Added CAA record to allow Amazon certificate issuance for ${pc.cyan(parentDomain)}`
          );
          // Small delay for DNS propagation
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } else if (!caaResult.success) {
          clack.log.warn(
            `Could not verify CAA records: ${caaResult.error || "Unknown error"}`
          );
          clack.log.info(
            pc.dim(
              "If certificate issuance fails, you may need to add a CAA record manually:"
            )
          );
          clack.log.info(pc.dim(`  ${parentDomain} CAA 0 issue "amazon.com"`));
        }
      }
    }
  }

  // 12. Preview or Update Pulumi stack
  if (options.preview) {
    // PREVIEW MODE - show what would be changed without deploying
    try {
      const previewResult = await progress.execute(
        "Generating upgrade preview",
        async () => {
          await ensurePulumiWorkDir({ accountId: identity.accountId, region });

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
                    httpsTrackingEnabled: result.httpsTrackingEnabled,
                    cloudFrontDomain: result.cloudFrontDomain,
                    acmCertificateValidationRecords:
                      result.acmCertificateValidationRecords,
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

          // Refresh state to sync with AWS before previewing
          await stack.refresh({ onOutput: () => {} });

          // Run preview with resource change capture
          const result = await previewWithResourceChanges(stack, {
            diff: true,
          });
          return result;
        }
      );

      // Build cost comparison string
      const costComparison = [
        `Current: ${formatCost(currentCostData.total.monthly)}/mo`,
        `After upgrade: ${formatCost(newCostData.total.monthly)}/mo`,
        costDiff > 0
          ? `Change: +${formatCost(costDiff)}/mo`
          : costDiff < 0
            ? `Change: -${formatCost(Math.abs(costDiff))}/mo`
            : "Change: No cost difference",
      ].join("\n");

      // Display preview results with detailed resource changes
      displayPreview({
        changeSummary: previewResult.changeSummary,
        resourceChanges: previewResult.resourceChanges,
        costEstimate: costComparison,
        commandName: "wraps email upgrade",
      });

      clack.outro(
        pc.green("Preview complete. Run without --preview to upgrade.")
      );

      // Track preview completion
      trackServiceUpgrade("email", {
        from_preset: metadata.services.email?.preset,
        to_preset: newPreset,
        preview: true,
        action: typeof upgradeAction === "string" ? upgradeAction : undefined,
        duration_ms: Date.now() - startTime,
      });
      return;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      trackError("PREVIEW_FAILED", "email:upgrade", { step: "preview" });
      if (msg.includes("stack is currently locked")) {
        throw errors.stackLocked();
      }
      throw new Error(`Preview failed: ${msg}`);
    }
  }

  // DEPLOY MODE - actually update infrastructure
  let outputs;
  try {
    outputs = await progress.execute(
      "Updating Wraps infrastructure (this may take 2-3 minutes)",
      async () => {
        await ensurePulumiWorkDir({ accountId: identity.accountId, region });

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
                  httpsTrackingEnabled: result.httpsTrackingEnabled,
                  httpsTrackingPending: result.httpsTrackingPending,
                  cloudFrontDomain: result.cloudFrontDomain,
                  acmCertificateValidationRecords:
                    result.acmCertificateValidationRecords,
                  archiveArn: result.archiveArn,
                  archivingEnabled: result.archivingEnabled,
                  archiveRetention: result.archiveRetention,
                  // SMTP credentials (shown once)
                  smtpUserArn: result.smtpUserArn,
                  smtpUsername: result.smtpUsername,
                  smtpPassword: result.smtpPassword,
                  smtpEndpoint: result.smtpEndpoint,
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

        await stack.workspace.selectStack(
          metadata.services.email?.pulumiStackName ||
            `wraps-${identity.accountId}-${region}`
        );
        await stack.setConfig("aws:region", { value: region });

        // Refresh state to sync with AWS before upgrading
        // This ensures Pulumi knows about resources that already exist
        await stack.refresh({ onOutput: () => {} });

        // Skip import flags — the stack already exists so resources are tracked in state
        stackConfig.skipResourceImports = true;

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
          httpsTrackingEnabled: pulumiOutputs.httpsTrackingEnabled?.value as
            | boolean
            | undefined,
          httpsTrackingPending: pulumiOutputs.httpsTrackingPending?.value as
            | boolean
            | undefined,
          cloudFrontDomain: pulumiOutputs.cloudFrontDomain?.value as
            | string
            | undefined,
          acmCertificateValidationRecords: pulumiOutputs
            .acmCertificateValidationRecords?.value as
            | Array<{ name: string; type: string; value: string }>
            | undefined,
          archiveArn: pulumiOutputs.archiveArn?.value as string | undefined,
          archivingEnabled: pulumiOutputs.archivingEnabled?.value as
            | boolean
            | undefined,
          archiveRetention: pulumiOutputs.archiveRetention?.value as
            | string
            | undefined,
          // SMTP credentials (shown once)
          smtpUserArn: pulumiOutputs.smtpUserArn?.value as string | undefined,
          smtpUsername: pulumiOutputs.smtpUsername?.value as string | undefined,
          smtpPassword: pulumiOutputs.smtpPassword?.value as string | undefined,
          smtpEndpoint: pulumiOutputs.smtpEndpoint?.value as string | undefined,
        };
      }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Track upgrade failure
    trackServiceUpgrade("email", {
      from_preset: metadata.services.email?.preset,
      to_preset: newPreset,
      action: typeof upgradeAction === "string" ? upgradeAction : undefined,
      duration_ms: Date.now() - startTime,
    });

    // Check if it's a lock file error
    if (msg.includes("stack is currently locked")) {
      trackError("STACK_LOCKED", "email:upgrade", { step: "deploy" });
      throw errors.stackLocked();
    }

    trackError("UPGRADE_FAILED", "email:upgrade", {
      step: "deploy",
      error_detail: redactSensitiveValues(msg).slice(0, 3000),
    });
    throw new Error(`Pulumi upgrade failed: ${extractPulumiErrorSummary(msg)}`);
  }

  // 13. Create DNS records using stored provider (or detect if not stored)
  // Skip DNS management in JSON mode — non-interactive
  let dnsAutoCreated = false;
  if (
    !isJsonMode() &&
    outputs.domain &&
    outputs.dkimTokens &&
    outputs.dkimTokens.length > 0
  ) {
    // Use stored DNS provider or detect available providers
    let dnsProvider: DNSProviderType | undefined =
      metadata.services.email?.dnsProvider;

    if (!dnsProvider) {
      // No stored DNS provider, detect available providers
      const availableProviders = await progress.execute(
        "Detecting available DNS providers",
        async () => await detectAvailableDNSProviders(outputs.domain!, region)
      );

      // Check if any provider is available (auto-detected)
      const detectedProvider = availableProviders.find(
        (p) => p.detected && p.provider !== "manual"
      );
      if (detectedProvider) {
        // Prompt for DNS provider selection
        dnsProvider = await promptDNSProvider(
          outputs.domain!,
          availableProviders
        );

        // Store the provider for future upgrades
        if (
          dnsProvider &&
          dnsProvider !== "manual" &&
          metadata.services.email
        ) {
          metadata.services.email.dnsProvider = dnsProvider;
        }
      }
    }

    if (dnsProvider && dnsProvider !== "manual") {
      // Get credentials for the DNS provider
      const credResult = await progress.execute(
        `Validating ${getDNSProviderDisplayName(dnsProvider)} credentials`,
        async () =>
          await getDNSCredentials(dnsProvider!, outputs.domain!, region)
      );

      if (credResult.valid && credResult.credentials) {
        // Determine mailFromDomain
        const mailFromDomain =
          updatedConfig.mailFromDomain || `mail.${outputs.domain}`;

        // Build DNS record data
        const dnsData = {
          domain: outputs.domain!,
          dkimTokens: outputs.dkimTokens!,
          mailFromDomain,
          customTrackingDomain: outputs.customTrackingDomain,
          region,
        };

        try {
          progress.start(
            `Creating DNS records in ${getDNSProviderDisplayName(dnsProvider)}`
          );

          const result = await createDNSRecordsForProvider(
            credResult.credentials,
            dnsData
          );

          if (result.success) {
            progress.succeed(
              `Created ${result.recordsCreated} DNS records in ${getDNSProviderDisplayName(dnsProvider)}`
            );
            dnsAutoCreated = true;
          } else {
            progress.fail(
              `Failed to create some DNS records: ${result.errors?.join(", ")}`
            );
            progress.info(
              "You can manually add the required DNS records shown below"
            );
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          progress.fail(`Failed to create DNS records automatically: ${msg}`);
          progress.info(
            "You can manually add the required DNS records shown below"
          );
        }
      } else {
        // Credential validation failed
        clack.log.warn(
          credResult.error ||
            `Unable to validate ${getDNSProviderDisplayName(dnsProvider)} credentials`
        );
      }
    }

    // Show manual DNS records if not auto-created
    if (!dnsAutoCreated) {
      const mailFromDomain =
        updatedConfig.mailFromDomain || `mail.${outputs.domain}`;
      const dnsData = {
        domain: outputs.domain!,
        dkimTokens: outputs.dkimTokens!,
        mailFromDomain,
        customTrackingDomain: outputs.customTrackingDomain,
        region,
      };
      const dnsRecords = buildEmailDNSRecords(dnsData);

      console.log();
      clack.note(
        formatManualDNSInstructions(dnsRecords),
        "DNS Records — Add these to your DNS provider"
      );
    }
  }

  // 14. Update metadata
  updateEmailConfig(metadata, updatedConfig);
  if (metadata.services.email) {
    metadata.services.email.preset = newPreset as any;
  }
  await saveConnectionMetadata(metadata);

  progress.info("Connection metadata updated");

  // 15. Format tracking domain DNS records if custom tracking domain was added
  const trackingDomainDnsRecords = [];
  const acmValidationRecords = [];

  if (outputs.customTrackingDomain) {
    // For HTTPS tracking, only show CNAME if CloudFront exists
    // For HTTP tracking, point to SES tracking endpoint
    if (outputs.httpsTrackingEnabled) {
      // Only add tracking domain CNAME if CloudFront is created
      if (outputs.cloudFrontDomain) {
        trackingDomainDnsRecords.push({
          name: outputs.customTrackingDomain,
          type: "CNAME",
          value: outputs.cloudFrontDomain,
        });
      }
    } else {
      // HTTP tracking - use SES tracking endpoint
      trackingDomainDnsRecords.push({
        name: outputs.customTrackingDomain,
        type: "CNAME",
        value: `r.${outputs.region}.awstrack.me`,
      });
    }
  }

  // Add ACM certificate validation records if HTTPS tracking is enabled
  if (outputs.httpsTrackingEnabled && outputs.acmCertificateValidationRecords) {
    acmValidationRecords.push(...outputs.acmCertificateValidationRecords);
  }

  // Fallback: fetch ACM validation records directly from AWS if Pulumi output was empty
  if (
    acmValidationRecords.length === 0 &&
    outputs.httpsTrackingPending &&
    outputs.customTrackingDomain
  ) {
    const { getCertificateValidationRecords } = await import(
      "../../infrastructure/resources/acm.js"
    );
    const directRecords = await getCertificateValidationRecords(
      outputs.customTrackingDomain
    );
    acmValidationRecords.push(...directRecords);
  }

  // Try to create ACM validation DNS records automatically via DNS provider
  let acmDnsAutoCreated = false;
  if (
    outputs.httpsTrackingPending &&
    acmValidationRecords.length > 0 &&
    outputs.customTrackingDomain
  ) {
    // Get DNS provider for the tracking domain
    const trackingDnsProvider: DNSProviderType | undefined =
      metadata.services.email?.dnsProvider;

    if (trackingDnsProvider && trackingDnsProvider !== "manual") {
      // Get the parent domain for Vercel DNS (e.g., lilikoi.io from link.lilikoi.io)
      const trackingDomainParts = outputs.customTrackingDomain.split(".");
      const parentDomain =
        trackingDomainParts.length > 2
          ? trackingDomainParts.slice(-2).join(".")
          : outputs.customTrackingDomain;

      const credResult = await progress.execute(
        `Validating ${getDNSProviderDisplayName(trackingDnsProvider)} credentials for ACM validation`,
        async () =>
          await getDNSCredentials(trackingDnsProvider!, parentDomain, region)
      );

      if (credResult.valid && credResult.credentials) {
        try {
          progress.start(
            `Creating ACM validation DNS record in ${getDNSProviderDisplayName(trackingDnsProvider)}`
          );

          // Create the ACM validation CNAME record
          if (credResult.credentials.provider === "vercel") {
            const { VercelDNSClient } = await import(
              "../../utils/dns/vercel.js"
            );
            const client = new VercelDNSClient(
              parentDomain,
              credResult.credentials.token,
              credResult.credentials.teamId
            );

            const result = await client.createRecords(
              acmValidationRecords.map((r) => ({
                name: r.name,
                type: r.type,
                value: r.value,
              }))
            );

            if (result.success) {
              progress.succeed(
                `Created ACM validation DNS record in ${getDNSProviderDisplayName(trackingDnsProvider)}`
              );
              acmDnsAutoCreated = true;
              progress.info(
                "Certificate validation usually takes 5-30 minutes. Run this command again after validation completes."
              );
            } else {
              progress.fail(
                `Failed to create ACM validation record: ${result.errors?.join(", ")}`
              );
            }
          } else if (credResult.credentials.provider === "cloudflare") {
            const { CloudflareDNSClient } = await import(
              "../../utils/dns/cloudflare.js"
            );
            const client = new CloudflareDNSClient(
              credResult.credentials.zoneId,
              credResult.credentials.token
            );

            const result = await client.createRecords(
              acmValidationRecords.map((r) => ({
                name: r.name,
                type: r.type,
                value: r.value,
              }))
            );

            if (result.success) {
              progress.succeed(
                `Created ACM validation DNS record in ${getDNSProviderDisplayName(trackingDnsProvider)}`
              );
              acmDnsAutoCreated = true;
              progress.info(
                "Certificate validation usually takes 5-30 minutes. Run this command again after validation completes."
              );
            } else {
              progress.fail(
                `Failed to create ACM validation record: ${result.errors?.join(", ")}`
              );
            }
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          progress.fail(`Failed to create ACM validation record: ${msg}`);
        }
      }
    }
  }

  // Check if HTTPS tracking was enabled but CloudFront wasn't created (certificate not yet validated)
  const needsCertificateValidation =
    outputs.httpsTrackingPending ||
    (outputs.httpsTrackingEnabled &&
      acmValidationRecords.length > 0 &&
      !outputs.cloudFrontDomain);

  // 15. Display success message
  displaySuccess({
    dashboardUrl: await resolveDashboardUrl(
      identity.accountId,
      outputs.region!
    ),
    roleArn: outputs.roleArn,
    configSetName: outputs.configSetName,
    region: outputs.region!,
    tableName: outputs.tableName,
    trackingDomainDnsRecords:
      trackingDomainDnsRecords.length > 0
        ? trackingDomainDnsRecords
        : undefined,
    // Only show ACM validation records if they weren't auto-created
    acmValidationRecords:
      acmValidationRecords.length > 0 && !acmDnsAutoCreated
        ? acmValidationRecords
        : undefined,
    customTrackingDomain: outputs.customTrackingDomain,
    httpsTrackingEnabled: outputs.httpsTrackingEnabled,
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

  // Show next steps for HTTPS tracking if certificate validation is pending
  if (needsCertificateValidation) {
    console.log(pc.bold("⚠️  HTTPS Tracking - Next Steps:\n"));
    if (acmDnsAutoCreated) {
      // DNS record was auto-created, just wait for validation
      console.log(
        `  1. ${pc.green("✓")} ACM validation DNS record created automatically`
      );
      console.log("  2. Wait for certificate validation (5-30 minutes)");
      console.log(
        `  3. Run ${pc.cyan("wraps email upgrade")} again to complete CloudFront setup\n`
      );
    } else {
      // User needs to manually add DNS record
      console.log(
        "  1. Add the SSL certificate validation DNS record shown above to your DNS provider"
      );
      console.log(
        "  2. Wait for DNS propagation and certificate validation (5-30 minutes)"
      );
      console.log(
        `  3. Run ${pc.cyan("wraps email upgrade")} again to complete CloudFront setup\n`
      );
    }
    console.log(
      pc.dim(
        "  Note: CloudFront distribution will be created once the certificate is validated.\n"
      )
    );
  } else if (outputs.httpsTrackingEnabled && outputs.cloudFrontDomain) {
    console.log(
      pc.green("✓") +
        " " +
        pc.bold("HTTPS tracking is fully configured and ready to use!\n")
    );
  }

  // Show Wraps Dashboard connection details if configured
  if (
    upgradeAction === "wraps-dashboard" &&
    metadata.services.email?.webhookSecret
  ) {
    console.log(pc.bold("🔗 Wraps Dashboard Connection\n"));
    console.log(`  ${pc.green("✓")} EventBridge API Destination created`);
    console.log(
      `  ${pc.green("✓")} Events will be sent to: ${pc.cyan("api.wraps.dev")}\n`
    );

    console.log(pc.bold("  Next Step: Register webhook secret in dashboard\n"));
    console.log(
      `  1. Go to ${pc.cyan("https://dashboard.wraps.dev/settings/aws")}`
    );
    console.log(`  2. Find your AWS account: ${pc.cyan(metadata.accountId)}`);
    console.log(`  3. Click "Add Webhook Secret" and paste this value:\n`);
    console.log(
      `     ${pc.bgBlack(pc.white(` ${metadata.services.email.webhookSecret} `))}\n`
    );
    console.log(
      pc.dim(
        "  Note: Keep this secret safe! It authenticates your webhook requests.\n"
      )
    );
  }

  // Show user webhook configuration details
  if (upgradeAction === "user-webhook" && updatedConfig.userWebhook?.enabled) {
    console.log(pc.bold("Webhook Endpoint Configuration\n"));
    console.log(`  ${pc.green("✓")} EventBridge API Destination created`);
    console.log(
      `  ${pc.green("✓")} Events will be sent to: ${pc.cyan(updatedConfig.userWebhook.url)}\n`
    );

    // Only show secret on first setup or regeneration (not URL change)
    if (updatedConfig.userWebhook.secret !== config.userWebhook?.secret) {
      console.log(pc.bold("  Webhook Secret (save this now!):\n"));
      console.log(
        `     ${pc.bgBlack(pc.white(` ${updatedConfig.userWebhook.secret} `))}\n`
      );
      console.log(
        pc.dim("  Include this in the X-Wraps-Signature header validation")
      );
      console.log(
        pc.dim("  to verify requests are from your Wraps deployment.\n")
      );
    }
  }

  // Show SMTP credentials if enabled
  if (
    upgradeAction === "smtp-credentials" &&
    outputs.smtpUsername &&
    outputs.smtpPassword
  ) {
    console.log(pc.bold("\n📧 SMTP Connection Details\n"));

    console.log(`  ${pc.cyan("Server:")}     ${outputs.smtpEndpoint}`);
    console.log(`  ${pc.cyan("Port:")}       587 (STARTTLS) or 465 (TLS)`);
    console.log(`  ${pc.cyan("Username:")}   ${outputs.smtpUsername}`);
    console.log(`  ${pc.cyan("Password:")}   ${outputs.smtpPassword}`);
    console.log(`  ${pc.cyan("Encryption:")} TLS/STARTTLS required\n`);

    console.log(pc.yellow("⚠️  IMPORTANT: Save these credentials NOW!"));
    console.log(pc.yellow("   They cannot be retrieved later.\n"));

    // Show as copiable env vars
    console.log(pc.bold("  Environment Variables:\n"));
    console.log(pc.dim(`  SMTP_HOST=${outputs.smtpEndpoint}`));
    console.log(pc.dim("  SMTP_PORT=587"));
    console.log(pc.dim(`  SMTP_USER=${outputs.smtpUsername}`));
    console.log(pc.dim(`  SMTP_PASS=${outputs.smtpPassword}\n`));

    // Update metadata with SMTP credentials info (not the actual credentials)
    if (metadata.services.email && outputs.smtpUserArn) {
      metadata.services.email.smtpCredentials = {
        enabled: true,
        iamUserArn: outputs.smtpUserArn,
        createdAt: new Date().toISOString(),
      };
    }
  }

  // Always persist metadata after all upgrade actions
  await saveConnectionMetadata(metadata);

  // Post-deploy pipeline check (warn-only): verify SES events can actually
  // reach the event log/dashboard after this deploy. Never fails the
  // command — a checker crash or slow AWS call must not undo a successful
  // upgrade.
  try {
    const domains = getAllTrackedDomains(metadata).map((d) => ({
      domain: d.domain,
      isPrimary: d.isPrimary,
      configSetName: d.configSetName,
    }));
    const pipelineChecks = await checkEventPipeline({
      region: outputs.region ?? region,
      domains,
      expectPlatformWebhook: Boolean(metadata.services.email?.webhookSecret),
    });
    const issues = pipelineChecks.filter((check) => check.status !== "pass");
    if (issues.length > 0 && !isJsonMode()) {
      for (const issue of issues) {
        const remedy = issue.remediation?.command
          ? ` Fix: ${issue.remediation.command}`
          : "";
        clack.log.warn(
          `Post-deploy pipeline check: ${issue.hop} — ${issue.details}.${remedy}`
        );
      }
    }
  } catch (error) {
    if (!isJsonMode()) {
      clack.log.warn(
        `Post-deploy pipeline check failed to run: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (isJsonMode()) {
    jsonSuccess("email.upgrade", {
      upgraded: true,
      region: outputs.region!,
      action: typeof upgradeAction === "string" ? upgradeAction : undefined,
      preset: newPreset,
      roleArn: outputs.roleArn,
      configSetName: outputs.configSetName,
      customTrackingDomain: outputs.customTrackingDomain,
      httpsTrackingEnabled: outputs.httpsTrackingEnabled,
    });
    trackServiceUpgrade("email", {
      from_preset: metadata.services.email?.preset,
      to_preset: newPreset,
      action: typeof upgradeAction === "string" ? upgradeAction : undefined,
      duration_ms: Date.now() - startTime,
    });
    return;
  }

  // 16. Track successful upgrade
  const enabledFeatures: string[] = [];
  if (updatedConfig.tracking?.enabled) {
    enabledFeatures.push("tracking");
  }
  if (updatedConfig.suppressionList?.enabled) {
    enabledFeatures.push("suppression_list");
  }
  if (updatedConfig.eventTracking?.enabled) {
    enabledFeatures.push("event_tracking");
  }
  if (updatedConfig.eventTracking?.dynamoDBHistory) {
    enabledFeatures.push("dynamodb_history");
  }
  if (updatedConfig.dedicatedIp) {
    enabledFeatures.push("dedicated_ip");
  }
  if (updatedConfig.emailArchiving?.enabled) {
    enabledFeatures.push("email_archiving");
  }
  if (updatedConfig.smtpCredentials?.enabled) {
    enabledFeatures.push("smtp_credentials");
  }
  if (updatedConfig.alerts?.enabled) {
    enabledFeatures.push("alerts");
  }
  if (updatedConfig.userWebhook?.enabled) {
    enabledFeatures.push("user_webhook");
  }

  trackServiceUpgrade("email", {
    from_preset: metadata.services.email?.preset,
    to_preset: newPreset,
    added_features: enabledFeatures,
    action: typeof upgradeAction === "string" ? upgradeAction : undefined,
    duration_ms: Date.now() - startTime,
  });
}
