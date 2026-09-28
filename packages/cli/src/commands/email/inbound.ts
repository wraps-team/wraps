import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import { deployEmailStack } from "../../infrastructure/email-stack.js";
import type {
  EmailInboundAddOptions,
  EmailInboundDestroyOptions,
  EmailInboundInitOptions,
  EmailInboundRemoveOptions,
  EmailInboundStatusOptions,
  EmailInboundTestOptions,
  EmailInboundVerifyOptions,
  InboundDomain,
} from "../../types/index.js";
import { SES_RECEIVING_REGIONS } from "../../types/index.js";
import {
  addDomainToReceiptRule,
  createReceiptRule,
  createReceiptRuleSet,
  deleteReceiptRule,
  deleteReceiptRuleSet,
  getActiveReceiptRuleSet,
  RULE_SET_NAME,
  removeDomainFromReceiptRule,
  setActiveReceiptRuleSet,
} from "../../utils/email/receipt-rules.js";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import { errors, WrapsError } from "../../utils/shared/errors.js";
import {
  ensurePulumiWorkDir,
  getPulumiWorkDir,
} from "../../utils/shared/fs.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import {
  addInboundDomainToMetadata,
  buildEmailStackConfig,
  type ConnectionMetadata,
  getAllTrackedDomains,
  loadConnectionMetadata,
  removeInboundDomainFromMetadata,
  saveConnectionMetadata,
} from "../../utils/shared/metadata.js";
import {
  DeploymentProgress,
  displayPreview,
} from "../../utils/shared/output.js";
import {
  ensureInteractive,
  promptInboundSubdomain,
  promptWebhookUrl,
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

/** Outcome of trying to delete the DNS records `inbound add` created for one domain. */
type InboundDNSCleanupOutcome = {
  deleted: string[];
  skipped: Array<{ record: string; reason: string }>;
  supported: boolean;
  errors: string[];
};

const UNSUPPORTED_DNS_CLEANUP: InboundDNSCleanupOutcome = {
  deleted: [],
  skipped: [],
  supported: false,
  errors: [],
};

/**
 * Delete the DNS records `inbound add` created for one receiving domain,
 * resolving the provider/credentials from metadata. Never throws — a DNS
 * failure here must not abort `remove`/`destroy`, because the SES-side
 * change (receipt rule update, or the stack redeploy) has already happened
 * and aborting would strand the user worse than a warning does.
 *
 * Absent or "manual" `dnsProvider` is treated as unsupported without
 * prompting or probing providers — teardown is not the moment to ask
 * someone to connect a DNS provider.
 */
async function cleanUpInboundDNS(params: {
  metadata: ConnectionMetadata;
  domainToRemove: string;
  inboundDomains: InboundDomain[];
  parentDomainFallback: string;
  region: string;
}): Promise<InboundDNSCleanupOutcome> {
  const {
    metadata,
    domainToRemove,
    inboundDomains,
    parentDomainFallback,
    region,
  } = params;

  const dnsProvider = metadata.services.email?.dnsProvider;
  if (!dnsProvider || dnsProvider === "manual") {
    return UNSUPPORTED_DNS_CLEANUP;
  }

  const removedEntry = inboundDomains.find(
    (d) => d.receivingDomain === domainToRemove
  );
  const parentDomain = removedEntry?.parentDomain || parentDomainFallback;
  if (!parentDomain) {
    return UNSUPPORTED_DNS_CLEANUP;
  }

  try {
    const { getDNSCredentials, deleteInboundDNSRecordsForProvider } =
      await import("../../utils/dns/index.js");
    const credentialResult = await getDNSCredentials(
      dnsProvider,
      parentDomain,
      region
    );

    if (!(credentialResult.valid && credentialResult.credentials)) {
      clack.log.warn(
        `Could not validate ${dnsProvider} credentials to delete DNS records for ${domainToRemove}: ${credentialResult.error || "unknown error"}`
      );
      return UNSUPPORTED_DNS_CLEANUP;
    }

    return await deleteInboundDNSRecordsForProvider(
      credentialResult.credentials,
      domainToRemove,
      region,
      parentDomain
    );
  } catch (error) {
    clack.log.warn(
      `Failed to delete DNS records for ${domainToRemove}: ${error instanceof Error ? error.message : String(error)}`
    );
    return UNSUPPORTED_DNS_CLEANUP;
  }
}

/**
 * Print the result of `cleanUpInboundDNS` — deleted/skipped/errored records,
 * and the legacy manual-cleanup reminder only when cleanup was unsupported
 * (no DNS provider on file, invalid credentials, or a thrown error).
 */
function reportInboundDNSCleanup(
  result: InboundDNSCleanupOutcome,
  domain: string
): void {
  for (const label of result.deleted) {
    clack.log.success(`Deleted DNS record: ${label}`);
  }
  for (const skip of result.skipped) {
    clack.log.warn(`Left DNS record in place: ${skip.record} (${skip.reason})`);
  }
  for (const err of result.errors) {
    clack.log.warn(`DNS cleanup error: ${err}`);
  }
  if (!result.supported) {
    console.log(
      `  ${pc.dim("Remember to remove the MX and SPF DNS records for")} ${pc.cyan(domain)}`
    );
    console.log();
  }
}

/**
 * Inbound Init command - Deploy inbound email infrastructure
 */
export async function inboundInit(
  options: EmailInboundInitOptions
): Promise<void> {
  if (!isJsonMode()) {
    clack.intro(
      pc.bold(
        options.preview
          ? "Inbound Email Infrastructure Preview"
          : "Inbound Email Infrastructure Setup"
      )
    );
  }

  const progress = new DeploymentProgress();

  // 1. Check Pulumi CLI is installed
  await progress.execute("Checking prerequisites", async () =>
    ensurePulumiInstalled()
  );

  // 2. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  // 3. Get region
  const region = options.region || (await getAWSRegion());

  // 4. Validate region supports SES receiving
  if (
    !SES_RECEIVING_REGIONS.includes(
      region as (typeof SES_RECEIVING_REGIONS)[number]
    )
  ) {
    throw errors.inboundRegionNotSupported(region);
  }

  // 5. Load existing metadata - require outbound email setup first
  const metadata = await loadConnectionMetadata(identity.accountId, region);

  if (!metadata?.services?.email) {
    throw errors.inboundRequiresOutbound();
  }

  const trackedDomains = getAllTrackedDomains(metadata);

  if (trackedDomains.length === 0) {
    throw errors.inboundRequiresOutbound();
  }

  let domain: string;
  if (trackedDomains.length === 1) {
    domain = trackedDomains[0].domain;
  } else if (options.yes || isJsonMode()) {
    const primaryTrackedDomain =
      trackedDomains.find((trackedDomain) => trackedDomain.isPrimary) ||
      trackedDomains[0];
    domain = primaryTrackedDomain.domain;
  } else {
    ensureInteractive("Domain selection", "--yes");
    const selected = await clack.select({
      message: "Which domain do you want to receive email on?",
      options: trackedDomains.map((d) => ({
        value: d.domain,
        label: d.domain,
        hint: d.isPrimary ? "primary" : d.purpose,
      })),
    });

    if (clack.isCancel(selected)) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }

    domain = selected as string;
  }

  const emailService = metadata.services.email;
  const emailConfig = emailService.config;

  // 6. Prompt for subdomain (or root domain)
  const subdomain = options.root
    ? ""
    : (options.subdomain ??
      (options.yes ? "inbound" : await promptInboundSubdomain(domain)));
  const receivingDomain = subdomain ? `${subdomain}.${domain}` : domain;

  clack.log.info(`Receiving domain: ${pc.cyan(receivingDomain)}`);

  // 7. Prompt for webhook URL
  const webhookUrl =
    options.webhookUrl || (options.yes ? undefined : await promptWebhookUrl());

  // 8. Generate webhook secret
  const webhookSecret = randomBytes(32).toString("hex");

  // 9. Show cost estimate
  clack.log.info(
    `${pc.bold("Estimated cost:")} ~$0.05/mo for 10K emails (S3 + Lambda)`
  );

  // 10. Confirm deployment
  if (!(options.yes || options.preview)) {
    ensureInteractive("Deployment confirmation", "--yes");
    const confirmed = await clack.confirm({
      message: "Deploy inbound email infrastructure?",
      initialValue: true,
    });

    if (clack.isCancel(confirmed) || !confirmed) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }
  }

  // 11. Ensure Pulumi work directory
  await progress.execute("Preparing deployment workspace", async () =>
    ensurePulumiWorkDir({
      accountId: identity.accountId,
      region,
    })
  );

  const pulumiWorkDir = getPulumiWorkDir();
  const stackName =
    emailService.pulumiStackName || `wraps-${identity.accountId}-${region}`;

  // 12. Update email config with inbound settings
  const updatedEmailConfig = {
    ...emailConfig,
    inbound: {
      enabled: true,
      subdomain,
      receivingDomain,
      bucketName: `wraps-inbound-${identity.accountId}-${region}`,
      webhookUrl,
      webhookSecret,
    },
    inboundDomains: [
      {
        subdomain,
        receivingDomain,
        parentDomain: domain,
        addedAt: new Date().toISOString(),
      },
    ],
  };

  const stackConfig = buildEmailStackConfig(metadata, region, {
    emailConfig: updatedEmailConfig,
  });

  // 13. Deploy Pulumi stack
  await progress.execute("Deploying inbound email infrastructure", async () => {
    const stack = await pulumi.automation.LocalWorkspace.createOrSelectStack(
      {
        stackName,
        projectName: "wraps-email",
        program: async () => {
          const result = await deployEmailStack(stackConfig);
          return result as Record<string, unknown>;
        },
      },
      {
        workDir: pulumiWorkDir,
      }
    );

    await stack.setConfig("aws:region", { value: region });

    const pulumiOutput: string[] = [];
    await withLockRetry(
      () =>
        withTimeout(
          stack.up({
            onOutput: (msg) => {
              pulumiOutput.push(msg);
            },
          }),
          DEFAULT_PULUMI_TIMEOUT_MS,
          "Pulumi deployment"
        ).catch((error: unknown) => {
          // Log full Pulumi output for debugging
          if (pulumiOutput.length > 0) {
            const fullOutput = pulumiOutput.join("");
            clack.log.error("Pulumi deployment output:");
            console.error(fullOutput);
          }
          throw error;
        }),
      { accountId: identity.accountId, region, autoConfirm: options.yes }
    );
  });

  // 14. Create SES Receipt Rules via AWS SDK
  await progress.execute("Creating SES receipt rules", async () => {
    await createReceiptRuleSet(region);
    await createReceiptRule(
      region,
      receivingDomain,
      `wraps-inbound-${identity.accountId}-${region}`
    );

    // Activate rule set (warn if another is active)
    const previousActive = await setActiveReceiptRuleSet(region, RULE_SET_NAME);
    if (previousActive && previousActive !== RULE_SET_NAME) {
      clack.log.warn(
        `Deactivated previous receipt rule set: ${pc.yellow(previousActive)}`
      );
    }
  });

  // 15. DNS Configuration - auto-create or show manual records
  let dnsAutoCreated = false;

  const {
    detectAvailableDNSProviders,
    getDNSCredentials,
    createInboundDNSRecordsForProvider,
    getDNSProviderDisplayName,
    buildInboundDNSRecords: buildRecords,
    formatManualDNSInstructions,
    guardInboundDNSWrite,
  } = await import("../../utils/dns/index.js");
  const { promptDNSProvider, promptContinueManualDNS } = await import(
    "../../utils/shared/prompts.js"
  );

  // Use existing DNS provider from metadata, or detect available ones
  const existingDnsProvider = emailService.dnsProvider;
  let dnsProvider = existingDnsProvider;

  if (!dnsProvider || dnsProvider === "manual") {
    progress.start("Detecting DNS providers");
    const availableProviders = await detectAvailableDNSProviders(
      domain,
      region
    );
    progress.stop();

    if (options.yes || isJsonMode()) {
      // Non-interactive: auto-pick first detected provider, else manual.
      const first = availableProviders.find(
        (p) => p.provider !== "manual" && p.detected
      );
      dnsProvider = first?.provider ?? "manual";
    } else {
      dnsProvider = await promptDNSProvider(domain, availableProviders);
    }
  }

  if (dnsProvider !== "manual") {
    progress.start(
      `Validating ${getDNSProviderDisplayName(dnsProvider)} credentials`
    );
    const credentialResult = await getDNSCredentials(
      dnsProvider,
      domain,
      region
    );
    progress.stop();

    if (credentialResult.valid && credentialResult.credentials) {
      // Show what will be created
      const records = buildRecords(receivingDomain, region);
      clack.log.info(pc.bold("DNS records to create:"));
      for (const record of records) {
        const value = record.priority
          ? `${record.priority} ${record.value}`
          : record.value;
        clack.log.info(pc.dim(`  ${record.type} ${record.name} → ${value}`));
      }

      await guardInboundDNSWrite({
        credentials: credentialResult.credentials,
        receivingDomain,
        region,
        parentDomain: domain,
        yes: options.yes ?? false,
      });

      progress.start(
        `Creating DNS records in ${getDNSProviderDisplayName(dnsProvider)}`
      );
      const result = await createInboundDNSRecordsForProvider(
        credentialResult.credentials,
        receivingDomain,
        region,
        domain
      );

      if (result.success) {
        progress.succeed(
          result.recordsCreated > 0
            ? `Created ${result.recordsCreated} DNS records in ${getDNSProviderDisplayName(dnsProvider)}`
            : `DNS already configured for ${receivingDomain}`
        );
        dnsAutoCreated = true;
      } else {
        progress.fail("Failed to create some DNS records");
      }
      // Printed regardless of success: a skipped SPF write (e.g. an
      // existing v=spf1 record) still reports `success: true` with the
      // MX created, and `errors` is the only place the "add
      // include:amazonses.com yourself" guidance is carried.
      if (result.errors) {
        for (const err of result.errors) {
          clack.log.warn(err);
        }
      }
    } else {
      clack.log.warn(
        credentialResult.error || "Could not validate credentials"
      );

      if (options.yes || isJsonMode()) {
        // Non-interactive: fall back to manual, caller handles DNS externally.
        dnsProvider = "manual";
      } else {
        const continueManual = await promptContinueManualDNS();
        if (continueManual) {
          dnsProvider = "manual";
        }
      }
    }
  }

  // Show manual DNS instructions if auto-creation was skipped or failed
  if (!dnsAutoCreated) {
    const dnsRecords = buildRecords(receivingDomain, region);

    console.log();
    clack.note(
      formatManualDNSInstructions(dnsRecords),
      "DNS Records — Add these to your DNS provider"
    );
  }

  // 16. Save metadata
  await progress.execute("Saving configuration", async () => {
    metadata.services.email = {
      ...emailService,
      config: updatedEmailConfig,
      dnsProvider,
      deployedAt: new Date().toISOString(),
    };
    metadata.timestamp = new Date().toISOString();
    await saveConnectionMetadata(metadata);
  });

  // 17. Display success
  if (isJsonMode()) {
    jsonSuccess("email.inbound.init", {
      receivingDomain,
      subdomain,
      bucketName: `wraps-inbound-${identity.accountId}-${region}`,
      webhookUrl: webhookUrl || null,
      webhookSecret: webhookUrl ? webhookSecret : null,
      webhookHeader: webhookUrl ? "X-Wraps-Inbound-Key" : null,
      dnsAutoCreated,
      region,
    });
    return;
  }

  console.log();
  clack.log.success(pc.bold("Inbound email infrastructure deployed!"));
  console.log();
  console.log(`  ${pc.dim("Receiving domain:")} ${pc.cyan(receivingDomain)}`);
  console.log(
    `  ${pc.dim("S3 bucket:")}        ${pc.cyan(`wraps-inbound-${identity.accountId}-${region}`)}`
  );
  if (webhookUrl) {
    console.log(`  ${pc.dim("Webhook URL:")}      ${pc.cyan(webhookUrl)}`);
  }
  if (dnsAutoCreated) {
    console.log(`  ${pc.dim("DNS:")}              ${pc.green("Auto-created")}`);
  }

  if (webhookUrl) {
    const setupLines = [
      `EventBridge will POST every ${pc.cyan("email.received")} event to:`,
      `  ${pc.cyan(webhookUrl)}`,
      "",
      "Verify the request by checking this header on every POST:",
      `  ${pc.bold("X-Wraps-Inbound-Key")}: ${pc.yellow(webhookSecret)}`,
      "",
      pc.bold("Save this secret now — it is only shown once."),
      `Retrieve it later with: ${pc.cyan("wraps email inbound status --reveal-secret")}`,
      "",
      "Body shape (JSON):",
      pc.dim(
        '  { "emailId", "from", "to", "subject", "html", "text", "attachments", "headers", ... }'
      ),
      "",
      `Docs: ${pc.cyan("https://wraps.dev/docs/quickstart/email/inbound")}`,
    ].join("\n");
    console.log();
    clack.note(setupLines, "Webhook setup");
  }

  console.log();
  console.log(pc.bold("Next steps:"));
  if (dnsAutoCreated) {
    console.log(`  1. Verify DNS: ${pc.cyan("wraps email inbound verify")}`);
  } else {
    console.log("  1. Add the DNS records above to your DNS provider");
    console.log(`  2. Verify DNS: ${pc.cyan("wraps email inbound verify")}`);
  }
  console.log(
    `  ${dnsAutoCreated ? "2" : "3"}. Test: ${pc.cyan("wraps email inbound test")}`
  );
  console.log();
}

/**
 * Inbound Destroy command - Remove inbound email infrastructure
 */
export async function inboundDestroy(
  options: EmailInboundDestroyOptions
): Promise<void> {
  if (!isJsonMode()) {
    clack.intro(pc.bold("Inbound Email Infrastructure Teardown"));
  }

  const progress = new DeploymentProgress();

  // 0. Ensure Pulumi CLI is installed
  await ensurePulumiInstalled();

  // 1. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  // 2. Get region
  const region = options.region || (await getAWSRegion());

  // 3. Load metadata
  const metadata = await loadConnectionMetadata(identity.accountId, region);

  if (!metadata?.services?.email?.config?.inbound?.enabled) {
    clack.log.error("No inbound email infrastructure found.");
    console.log(`\nDeploy first: ${pc.cyan("wraps email inbound init")}\n`);
    process.exit(1);
  }

  const emailService = metadata.services.email;
  // biome-ignore lint/style/noNonNullAssertion: validated by enabled check above
  const inboundConfig = emailService.config.inbound!;
  // Captured before step 5 clears `inboundDomains` on the config copy used to
  // redeploy the stack — this is the list DNS cleanup iterates below.
  const allInboundDomains = emailService.config.inboundDomains ?? [];

  // 4. Confirm (skip with --force or --preview)
  if (!(options.force || options.preview)) {
    clack.log.warn(
      `This will remove inbound email for ${pc.cyan(inboundConfig.receivingDomain || "")}`
    );

    // Reply-threading routes through the same receipt rule set this command
    // tears down (deleteReceiptRule/deleteReceiptRuleSet below), so
    // destroying inbound silently breaks signed reply addresses for every
    // domain reply-threading is configured on. Warn — but this command
    // never deletes r.mail records itself; that belongs to `email reply
    // destroy` alone, per this plan's ownership rule.
    const replyThreading = emailService.config.replyThreading;
    if (replyThreading?.enabled && replyThreading.domains.length > 0) {
      clack.log.warn(
        `Reply threading will stop working for ${replyThreading.domains.map((d) => pc.cyan(d.domain)).join(", ")} once inbound infrastructure is removed. Run ${pc.cyan("wraps email reply destroy")} to clean those up.`
      );
    }

    if (allInboundDomains.length > 0) {
      const { buildInboundDNSRecords: buildRecordsForDisplay } = await import(
        "../../utils/dns/index.js"
      );
      clack.log.info(pc.bold("DNS records that will be deleted:"));
      for (const domain of allInboundDomains) {
        const records = buildRecordsForDisplay(domain.receivingDomain, region);
        for (const record of records) {
          const value = record.priority
            ? `${record.priority} ${record.value}`
            : record.value;
          clack.log.info(pc.dim(`  ${record.type} ${record.name} → ${value}`));
        }
      }
    }

    ensureInteractive("Destroy confirmation", "--force");
    const confirmed = await clack.confirm({
      message: "Are you sure you want to destroy inbound email infrastructure?",
      initialValue: false,
    });

    if (clack.isCancel(confirmed) || !confirmed) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }
  }

  const pulumiWorkDir = getPulumiWorkDir();
  const stackName =
    emailService.pulumiStackName || `wraps-${identity.accountId}-${region}`;

  // 5. Build updated config (inbound removed)
  const updatedEmailConfig = {
    ...emailService.config,
    inbound: undefined,
    inboundDomains: undefined,
  };

  const stackConfig = buildEmailStackConfig(metadata, region, {
    emailConfig: updatedEmailConfig,
  });

  const createStack = async () => {
    await ensurePulumiWorkDir({ accountId: identity.accountId, region });
    const stack = await pulumi.automation.LocalWorkspace.createOrSelectStack(
      {
        stackName,
        projectName: "wraps-email",
        program: async () => {
          const result = await deployEmailStack(stackConfig);
          return result as Record<string, unknown>;
        },
      },
      {
        workDir: pulumiWorkDir,
      }
    );
    await stack.setConfig("aws:region", { value: region });
    return stack;
  };

  // 6. Preview mode — show what would be removed without deploying
  if (options.preview) {
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
      commandName: "wraps email inbound destroy",
    });
    clack.outro(
      pc.green("Preview complete. Run without --preview to destroy.")
    );
    return;
  }

  // 7. Delete SES receipt rules
  await progress.execute("Removing SES receipt rules", async () => {
    await deleteReceiptRule(region);
    await deleteReceiptRuleSet(region);
  });

  // 8. Ensure Pulumi work directory
  await progress.execute("Preparing workspace", async () =>
    ensurePulumiWorkDir({
      accountId: identity.accountId,
      region,
    })
  );

  // 9. Redeploy with inbound disabled
  await progress.execute("Removing inbound infrastructure", async () => {
    const stack = await createStack();

    await withLockRetry(
      () =>
        withTimeout(
          stack.up({ onOutput: () => {} }),
          DEFAULT_PULUMI_TIMEOUT_MS,
          "Pulumi deployment"
        ),
      { accountId: identity.accountId, region, autoConfirm: options.force }
    );
  });

  // 9b. Delete the DNS records `inbound add` created, for every configured
  // domain, before metadata is saved — a DNS failure here must not leave
  // metadata claiming inbound is gone while DNS still points at SES.
  const dnsCleanupByDomain: Array<{
    domain: string;
    result: InboundDNSCleanupOutcome;
  }> = [];
  for (const domain of allInboundDomains) {
    const result = await cleanUpInboundDNS({
      metadata,
      domainToRemove: domain.receivingDomain,
      inboundDomains: allInboundDomains,
      parentDomainFallback: emailService.config.domain || "",
      region,
    });
    dnsCleanupByDomain.push({ domain: domain.receivingDomain, result });
  }

  // 10. Save metadata
  await progress.execute("Saving configuration", async () => {
    metadata.services.email = {
      ...emailService,
      config: updatedEmailConfig,
      deployedAt: new Date().toISOString(),
    };
    metadata.timestamp = new Date().toISOString();
    await saveConnectionMetadata(metadata);
  });

  if (isJsonMode()) {
    jsonSuccess("email.inbound.destroy", {
      destroyed: true,
      receivingDomain: inboundConfig.receivingDomain || "",
      dnsDeleted: dnsCleanupByDomain.flatMap((d) => d.result.deleted),
      dnsSkipped: dnsCleanupByDomain.flatMap((d) => d.result.skipped),
      dnsSupported: dnsCleanupByDomain.some((d) => d.result.supported),
    });
    return;
  }

  console.log();
  clack.log.success(pc.bold("Inbound email infrastructure removed."));
  console.log();
  for (const { domain, result } of dnsCleanupByDomain) {
    reportInboundDNSCleanup(result, domain);
  }
}

/**
 * Inbound Status command - Show inbound email setup details
 */
export async function inboundStatus(
  options: EmailInboundStatusOptions
): Promise<void> {
  if (!isJsonMode()) {
    clack.intro(pc.bold("Inbound Email Status"));
  }

  const progress = new DeploymentProgress();

  // 1. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  // 2. Get region
  const region = options.region || (await getAWSRegion());

  // 3. Load metadata
  const metadata = await loadConnectionMetadata(identity.accountId, region);

  if (!metadata?.services?.email?.config?.inbound?.enabled) {
    clack.log.warn("Inbound email is not configured.");
    console.log(`\nEnable it: ${pc.cyan("wraps email inbound init")}\n`);
    return;
  }

  const emailConfig = metadata.services.email.config;
  // biome-ignore lint/style/noNonNullAssertion: validated by enabled check above
  const inbound = emailConfig.inbound!;
  const inboundDomains = emailConfig.inboundDomains ?? [];

  // 4. Check receipt rule status
  const activeRuleSet = await getActiveReceiptRuleSet(region);

  // Build domain list — prefer inboundDomains, fallback to single domain
  const domainList =
    inboundDomains.length > 0
      ? inboundDomains.map((d) => d.receivingDomain)
      : [
          inbound.receivingDomain ||
            (inbound.subdomain
              ? `${inbound.subdomain}.${emailConfig.domain}`
              : emailConfig.domain || ""),
        ];

  if (isJsonMode()) {
    jsonSuccess("email.inbound.status", {
      enabled: true,
      receivingDomains: domainList,
      receivingDomain: domainList[0],
      bucketName: inbound.bucketName || "",
      region,
      webhookUrl: inbound.webhookUrl || null,
      webhookHeader: inbound.webhookUrl ? "X-Wraps-Inbound-Key" : null,
      webhookSecret:
        options.revealSecret && inbound.webhookUrl
          ? inbound.webhookSecret || null
          : null,
      receiptRuleSetActive: activeRuleSet === RULE_SET_NAME,
      retention: inbound.retention || null,
    });
    return;
  }

  console.log();
  console.log(pc.bold("  Inbound Email Configuration"));
  console.log();
  if (domainList.length === 1) {
    console.log(`  ${pc.dim("Receiving domain:")}  ${pc.cyan(domainList[0])}`);
  } else {
    console.log(`  ${pc.dim("Receiving domains:")}`);
    for (const d of domainList) {
      console.log(`    ${pc.cyan(d)}`);
    }
  }
  console.log(
    `  ${pc.dim("S3 bucket:")}         ${pc.cyan(inbound.bucketName || "")}`
  );
  console.log(`  ${pc.dim("Region:")}            ${pc.cyan(region)}`);
  console.log(
    `  ${pc.dim("Webhook URL:")}       ${inbound.webhookUrl ? pc.cyan(inbound.webhookUrl) : pc.dim("not configured")}`
  );
  if (inbound.webhookUrl) {
    console.log(
      `  ${pc.dim("Webhook header:")}    ${pc.cyan("X-Wraps-Inbound-Key")}`
    );
    if (options.revealSecret) {
      console.log(
        `  ${pc.dim("Webhook secret:")}    ${inbound.webhookSecret ? pc.yellow(inbound.webhookSecret) : pc.dim("not set")}`
      );
    } else {
      console.log(
        `  ${pc.dim("Webhook secret:")}    ${pc.dim("hidden — pass --reveal-secret to show")}`
      );
    }
  }
  console.log(
    `  ${pc.dim("Receipt rule set:")}  ${activeRuleSet === RULE_SET_NAME ? pc.green("active") : pc.yellow("inactive")}`
  );
  console.log(
    `  ${pc.dim("Retention:")}         ${inbound.retention ? pc.cyan(inbound.retention) : pc.dim("indefinite")}`
  );
  console.log();
}

/**
 * Inbound Verify command - Check DNS records for receiving domain
 */
export async function inboundVerify(
  options: EmailInboundVerifyOptions
): Promise<void> {
  if (!isJsonMode()) {
    clack.intro(pc.bold("Inbound Email DNS Verification"));
  }

  const progress = new DeploymentProgress();

  // 1. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  // 2. Get region
  const region = options.region || (await getAWSRegion());

  // 3. Load metadata
  const metadata = await loadConnectionMetadata(identity.accountId, region);

  if (!metadata?.services?.email?.config?.inbound?.enabled) {
    clack.log.error("Inbound email is not configured.");
    console.log(`\nEnable it: ${pc.cyan("wraps email inbound init")}\n`);
    process.exit(1);
  }

  const emailConfig = metadata.services.email.config;
  // biome-ignore lint/style/noNonNullAssertion: validated by enabled check above
  const inbound = emailConfig.inbound!;
  const inboundDomains = emailConfig.inboundDomains ?? [];

  // Build domain list — prefer inboundDomains, fallback to single domain
  const domainList =
    inboundDomains.length > 0
      ? inboundDomains.map((d) => d.receivingDomain)
      : [
          inbound.receivingDomain ||
            (inbound.subdomain
              ? `${inbound.subdomain}.${emailConfig.domain}`
              : emailConfig.domain || ""),
        ];

  let allPassed = true;
  const domainChecks: Record<
    string,
    {
      mx: { found: boolean; verified: boolean };
      spf: { found: boolean; verified: boolean };
    }
  > = {};

  // 4. Check MX + SPF for each domain
  console.log();
  for (const receivingDomain of domainList) {
    if (domainList.length > 1) {
      clack.log.info(pc.bold(`Checking ${pc.cyan(receivingDomain)}`));
    }

    const mxResult = await progress.execute(
      `Checking MX record for ${receivingDomain}`,
      async () => {
        try {
          const records = await dns.resolveMx(receivingDomain);
          const hasSES = records.some((r) =>
            r.exchange.includes("inbound-smtp")
          );
          return { found: true, hasSES, records };
          // baseline:allow-next-line no-swallowed-errors — DNS failure means record not found
        } catch {
          return { found: false, hasSES: false, records: [] };
        }
      }
    );

    if (mxResult.hasSES) {
      clack.log.success(
        `MX record: ${pc.green("verified")} → inbound-smtp.${region}.amazonaws.com`
      );
    } else if (mxResult.found) {
      clack.log.warn(
        `MX record found but not pointing to SES. Expected: ${pc.cyan(`10 inbound-smtp.${region}.amazonaws.com`)}`
      );
      allPassed = false;
    } else {
      clack.log.error(
        `MX record: ${pc.red("not found")}. Add: ${pc.cyan(`${receivingDomain} MX 10 inbound-smtp.${region}.amazonaws.com`)}`
      );
      allPassed = false;
    }

    const spfResult = await progress.execute(
      `Checking SPF record for ${receivingDomain}`,
      async () => {
        try {
          const records = await dns.resolveTxt(receivingDomain);
          const flat = records.map((r) => r.join(""));
          const spf = flat.find((r) => r.startsWith("v=spf1"));
          const hasSES = spf?.includes("amazonses.com") ?? false;
          return { found: !!spf, hasSES, value: spf };
          // baseline:allow-next-line no-swallowed-errors — DNS failure means record not found
        } catch {
          return { found: false, hasSES: false, value: null };
        }
      }
    );

    if (spfResult.hasSES) {
      clack.log.success(`SPF record: ${pc.green("verified")}`);
    } else if (spfResult.found) {
      clack.log.warn("SPF record exists but missing amazonses.com include");
      allPassed = false;
    } else {
      clack.log.error(
        `SPF record: ${pc.red("not found")}. Add TXT: ${pc.cyan("v=spf1 include:amazonses.com ~all")}`
      );
      allPassed = false;
    }

    domainChecks[receivingDomain] = {
      mx: { found: mxResult.found, verified: mxResult.hasSES },
      spf: { found: spfResult.found, verified: spfResult.hasSES },
    };
  }

  // 5. Check receipt rule is active
  const activeRuleSet = await getActiveReceiptRuleSet(region);
  if (activeRuleSet === RULE_SET_NAME) {
    clack.log.success(`Receipt rule set: ${pc.green("active")}`);
  } else {
    clack.log.error(
      `Receipt rule set: ${pc.red("inactive")}. Run ${pc.cyan("wraps email inbound init")} to reactivate.`
    );
    allPassed = false;
  }

  if (isJsonMode()) {
    jsonSuccess("email.inbound.verify", {
      receivingDomains: domainList,
      receivingDomain: domainList[0],
      allPassed,
      domainChecks,
      receiptRuleSet: { active: activeRuleSet === RULE_SET_NAME },
    });
    return;
  }

  console.log();
  if (allPassed) {
    clack.log.success(pc.bold("All checks passed! Inbound email is ready."));
  } else {
    clack.log.warn(pc.bold("Some checks failed. Review the issues above."));
  }
  console.log();
}

// Hoisted: SES "Email address not verified" / "Domain not verified" messages
// can arrive under several exception names; we also pattern-match the message.
const NOT_VERIFIED_PATTERN = /not verified/i;

/**
 * Map an SES SendEmail error from the inbound test flow to a WrapsError with
 * command-specific context. Wraps the generic Layer 1 error mapping with
 * "you ran inbound test, here is what to check next" guidance.
 *
 * Exported for unit testing.
 */
export function mapInboundTestSendError(
  error: unknown,
  ctx: {
    source: string;
    recipient: string;
    domain: string;
    receivingDomain: string;
    region: string;
  }
): Error {
  // Already a WrapsError (e.g., wrapped upstream) — pass through
  if (error instanceof WrapsError) {
    return error;
  }

  if (!(error instanceof Error)) {
    return new WrapsError(
      `Failed to send inbound test email to ${ctx.recipient}`,
      "INBOUND_TEST_SEND_FAILED",
      "An unexpected error occurred while sending the test email.\n\nCheck infrastructure status:\n  wraps email status\n  wraps email doctor",
      "https://wraps.dev/docs/guides/aws-setup/troubleshooting"
    );
  }

  const name = error.name;
  const message = error.message || "";

  // Check the more specific MAIL FROM error BEFORE the generic "not verified"
  // pattern, since its message also contains "not verified".
  if (name === "MailFromDomainNotVerifiedException") {
    return new WrapsError(
      `Custom MAIL FROM domain is not verified for ${ctx.domain}`,
      "INBOUND_TEST_MAIL_FROM_NOT_VERIFIED",
      `The MAIL FROM domain configured for "${ctx.domain}" is not fully verified.\n\nVerify DNS records:\n  wraps email verify\n\nOr remove the custom MAIL FROM domain in the SES console and retry.`,
      "https://docs.aws.amazon.com/ses/latest/dg/mail-from.html"
    );
  }

  // SES sandbox or unverified identity — most common failure mode
  if (
    name === "MessageRejected" ||
    name === "InvalidParameterValue" ||
    NOT_VERIFIED_PATTERN.test(message)
  ) {
    return new WrapsError(
      `SES rejected the inbound test send: ${message || name}`,
      "INBOUND_TEST_MESSAGE_REJECTED",
      [
        `Tried to send: ${ctx.source} → ${ctx.recipient} (region ${ctx.region})`,
        "",
        "Most likely causes:",
        `  • Your SES account is in the sandbox and ${ctx.recipient} is not a verified address`,
        `  • The sender domain "${ctx.domain}" is not verified for sending in ${ctx.region}`,
        `  • The receiving domain "${ctx.receivingDomain}" is verified for receiving (MX) but not for sending`,
        "",
        "Check status:",
        "  wraps email status",
        "  wraps email doctor",
        "",
        "Exit the SES sandbox to send to any address:",
        "  https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html",
      ].join("\n"),
      "https://wraps.dev/docs/guides/aws-setup/troubleshooting"
    );
  }

  if (
    name === "AccountSendingPausedException" ||
    name === "ConfigurationSetSendingPausedException"
  ) {
    return new WrapsError(
      "SES sending is paused for this account",
      "INBOUND_TEST_SENDING_PAUSED",
      "Your SES account or configuration set has sending paused, usually due to a high bounce or complaint rate.\n\nCheck the SES Reputation Dashboard in the AWS console and resume sending once the issue is resolved.",
      "https://docs.aws.amazon.com/ses/latest/dg/reputationdashboard.html"
    );
  }

  if (name === "AccessDeniedException" || name === "AccessDenied") {
    return new WrapsError(
      `IAM permission denied: ses:SendEmail in ${ctx.region}`,
      "INBOUND_TEST_PERMISSION_DENIED",
      `Your AWS credentials lack the "ses:SendEmail" permission in region ${ctx.region}.\n\nView required SES permissions:\n  wraps permissions --service email --json`,
      "https://wraps.dev/docs/guides/aws-setup/permissions"
    );
  }

  // Anything else — re-throw the original so the global handler (Layer 1)
  // surfaces the real AWS error name and message instead of lying.
  return error;
}

/**
 * Inbound Test command - Send a test email and verify it's received
 */
export async function inboundTest(
  options: EmailInboundTestOptions
): Promise<void> {
  if (!isJsonMode()) {
    clack.intro(pc.bold("Inbound Email Test"));
  }

  const progress = new DeploymentProgress();

  // 1. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  // 2. Get region
  const region = options.region || (await getAWSRegion());

  // 3. Load metadata
  const metadata = await loadConnectionMetadata(identity.accountId, region);

  if (!metadata?.services?.email?.config?.inbound?.enabled) {
    clack.log.error("Inbound email is not configured.");
    console.log(`\nEnable it: ${pc.cyan("wraps email inbound init")}\n`);
    process.exit(1);
  }

  const emailConfig = metadata.services.email.config;
  // biome-ignore lint/style/noNonNullAssertion: validated by enabled check above
  const inbound = emailConfig.inbound!;
  const receivingDomain =
    inbound.receivingDomain ||
    (inbound.subdomain
      ? `${inbound.subdomain}.${emailConfig.domain}`
      : emailConfig.domain || "");
  const bucketName =
    inbound.bucketName || `wraps-inbound-${identity.accountId}-${region}`;

  // 4. Send test email via SES
  const testRecipient = `test@${receivingDomain}`;
  const testSource = `test@${emailConfig.domain}`;
  const testSubject = `Wraps Inbound Test - ${new Date().toISOString()}`;

  await progress.execute(`Sending test email to ${testRecipient}`, async () => {
    const { SESClient, SendEmailCommand } = await import("@aws-sdk/client-ses");
    const ses = new SESClient({ region });

    try {
      await ses.send(
        new SendEmailCommand({
          Source: testSource,
          Destination: {
            ToAddresses: [testRecipient],
          },
          Message: {
            Subject: { Data: testSubject },
            Body: {
              Text: {
                Data: "This is a test email from Wraps CLI to verify inbound email processing.",
              },
              Html: {
                Data: "<h1>Wraps Inbound Test</h1><p>This email was sent to verify inbound email processing is working correctly.</p>",
              },
            },
          },
        })
      );
    } catch (error) {
      throw mapInboundTestSendError(error, {
        source: testSource,
        recipient: testRecipient,
        domain: emailConfig.domain || "",
        receivingDomain,
        region,
      });
    }
  });

  // 5. Poll S3 for the parsed email (up to 30s)
  // Import S3 client BEFORE starting the spinner so a dynamic-import or
  // client-construction failure cannot orphan the spinner.
  const { S3Client, ListObjectsV2Command, GetObjectCommand } = await import(
    "@aws-sdk/client-s3"
  );
  const s3 = new S3Client({ region });

  const spinner = clack.spinner();
  spinner.start("Waiting for email to be processed...");

  let found = false;
  const startTime = Date.now();
  const timeout = 30_000;

  while (Date.now() - startTime < timeout) {
    try {
      const response = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: "parsed/",
          MaxKeys: 10,
        })
      );

      if (response.Contents && response.Contents.length > 0) {
        // Check the most recent parsed email
        const sortedKeys = response.Contents.sort(
          (a, b) =>
            (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0)
        );

        for (const obj of sortedKeys) {
          if (!obj.Key) {
            continue;
          }
          const getResult = await s3.send(
            new GetObjectCommand({
              Bucket: bucketName,
              Key: obj.Key,
            })
          );
          if (!getResult.Body) {
            continue;
          }
          const body = await getResult.Body.transformToString();
          const parsed = JSON.parse(body);

          if (parsed.subject === testSubject) {
            found = true;
            spinner.stop("Email received and processed!");

            console.log();
            console.log(`  ${pc.dim("Email ID:")}  ${pc.cyan(parsed.emailId)}`);
            console.log(
              `  ${pc.dim("From:")}      ${pc.cyan(parsed.from?.address || "")}`
            );
            console.log(
              `  ${pc.dim("To:")}        ${pc.cyan(parsed.to?.[0]?.address || "")}`
            );
            console.log(`  ${pc.dim("Subject:")}   ${pc.cyan(parsed.subject)}`);
            console.log(
              `  ${pc.dim("Received:")}  ${pc.cyan(parsed.receivedAt)}`
            );
            break;
          }
        }
      }
      // baseline:allow-next-line no-swallowed-errors — S3 polling retries on error
    } catch {
      // S3 error, keep polling
    }

    if (found) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  if (!found) {
    spinner.stop("Timed out waiting for email.");

    if (isJsonMode()) {
      jsonSuccess("email.inbound.test", {
        sent: true,
        received: false,
        recipient: testRecipient,
        receivingDomain,
      });
      return;
    }

    console.log();
    clack.log.warn(
      "The test email was sent but not received within 30 seconds."
    );
    console.log(`\n  ${pc.dim("This could mean:")}`);
    console.log("  1. DNS records (MX) are not configured yet");
    console.log("  2. DNS propagation is still in progress");
    console.log("  3. Receipt rule set is not active\n");
    console.log(`  Run ${pc.cyan("wraps email inbound verify")} to check.\n`);
    return;
  }

  if (isJsonMode()) {
    jsonSuccess("email.inbound.test", {
      sent: true,
      received: true,
      recipient: testRecipient,
      receivingDomain,
    });
    return;
  }

  console.log();
  clack.log.success(pc.bold("Inbound email is working correctly!"));
  console.log();
}

/**
 * Inbound Add command - Add an inbound receiving domain
 */
export async function inboundAdd(
  options: EmailInboundAddOptions
): Promise<void> {
  if (!isJsonMode()) {
    clack.intro(pc.bold("Add Inbound Receiving Domain"));
  }

  const progress = new DeploymentProgress();

  // 1. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  // 2. Get region
  const region = options.region || (await getAWSRegion());

  // 3. Validate region supports SES receiving
  if (
    !SES_RECEIVING_REGIONS.includes(
      region as (typeof SES_RECEIVING_REGIONS)[number]
    )
  ) {
    throw errors.inboundRegionNotSupported(region);
  }

  // 4. Load metadata — require inbound infra deployed
  const metadata = await loadConnectionMetadata(identity.accountId, region);

  if (!metadata?.services?.email?.config?.inbound?.enabled) {
    clack.log.error("Inbound email infrastructure is not deployed.");
    console.log(`\nDeploy first: ${pc.cyan("wraps email inbound init")}\n`);
    process.exit(1);
  }

  const emailConfig = metadata.services.email.config;
  const primaryDomain = emailConfig.domain || "";

  // 5. Build list of verified parent domains to offer
  const allDomains = [primaryDomain];
  for (const d of emailConfig.additionalDomains ?? []) {
    if (!allDomains.includes(d.domain)) {
      allDomains.push(d.domain);
    }
  }

  // 6. Prompt for parent domain
  let parentDomain = options.domain;
  if (!parentDomain) {
    if (options.yes) {
      parentDomain = primaryDomain;
    } else if (allDomains.length === 1) {
      parentDomain = allDomains[0];
    } else {
      ensureInteractive(
        "Parent domain selection",
        "--domain <domain> (or --yes)"
      );
      const selected = await clack.select({
        message: "Which domain should the inbound subdomain be under?",
        options: allDomains.map((d) => ({
          value: d,
          label: d,
          hint: d === primaryDomain ? "primary" : undefined,
        })),
      });
      if (clack.isCancel(selected)) {
        clack.cancel("Operation cancelled.");
        process.exit(0);
      }
      parentDomain = selected as string;
    }
  }

  // 7. Prompt for subdomain (or root domain)
  const subdomain = options.root
    ? ""
    : (options.subdomain ??
      (options.yes ? "inbound" : await promptInboundSubdomain(parentDomain)));
  const receivingDomain = subdomain
    ? `${subdomain}.${parentDomain}`
    : parentDomain;

  // 8. Check not already tracked
  const existingDomains = emailConfig.inboundDomains ?? [];
  if (existingDomains.some((d) => d.receivingDomain === receivingDomain)) {
    clack.log.warn(
      `${pc.cyan(receivingDomain)} is already configured as an inbound domain.`
    );
    return;
  }

  clack.log.info(`Adding receiving domain: ${pc.cyan(receivingDomain)}`);

  // 9. Update SES receipt rule
  const bucketName =
    emailConfig.inbound?.bucketName ||
    `wraps-inbound-${identity.accountId}-${region}`;

  const replyThreadingEnabled =
    emailConfig.replyThreading?.enabled === true &&
    (emailConfig.replyThreading?.domains?.length ?? 0) > 0;

  await progress.execute("Updating SES receipt rule", async () => {
    await addDomainToReceiptRule(region, receivingDomain, bucketName);
    // If reply-threading is enabled globally, also register r.mail.{parent}
    // as a catch-all recipient so signed-reply addresses route into the same
    // Lambda pipeline.
    if (replyThreadingEnabled) {
      await addDomainToReceiptRule(
        region,
        `r.mail.${parentDomain}`,
        bucketName
      );
    }
  });

  // 10. DNS automation
  let dnsAutoCreated = false;

  const {
    detectAvailableDNSProviders,
    getDNSCredentials,
    createInboundDNSRecordsForProvider,
    getDNSProviderDisplayName,
    buildInboundDNSRecords: buildRecords,
    formatManualDNSInstructions,
    guardInboundDNSWrite,
  } = await import("../../utils/dns/index.js");
  const { promptDNSProvider, promptContinueManualDNS } = await import(
    "../../utils/shared/prompts.js"
  );

  const existingDnsProvider = metadata.services.email.dnsProvider;
  let dnsProvider = existingDnsProvider;

  if (!dnsProvider || dnsProvider === "manual") {
    progress.start("Detecting DNS providers");
    const availableProviders = await detectAvailableDNSProviders(
      parentDomain,
      region
    );
    progress.stop();

    dnsProvider = options.yes
      ? "manual"
      : await promptDNSProvider(parentDomain, availableProviders);
  }

  if (dnsProvider !== "manual") {
    progress.start(
      `Validating ${getDNSProviderDisplayName(dnsProvider)} credentials`
    );
    const credentialResult = await getDNSCredentials(
      dnsProvider,
      parentDomain,
      region
    );
    progress.stop();

    if (credentialResult.valid && credentialResult.credentials) {
      const records = buildRecords(receivingDomain, region);
      clack.log.info(pc.bold("DNS records to create:"));
      for (const record of records) {
        const value = record.priority
          ? `${record.priority} ${record.value}`
          : record.value;
        clack.log.info(pc.dim(`  ${record.type} ${record.name} → ${value}`));
      }

      await guardInboundDNSWrite({
        credentials: credentialResult.credentials,
        receivingDomain,
        region,
        parentDomain,
        yes: options.yes ?? false,
      });

      progress.start(
        `Creating DNS records in ${getDNSProviderDisplayName(dnsProvider)}`
      );
      const result = await createInboundDNSRecordsForProvider(
        credentialResult.credentials,
        receivingDomain,
        region,
        parentDomain
      );

      if (result.success) {
        progress.succeed(
          result.recordsCreated > 0
            ? `Created ${result.recordsCreated} DNS records in ${getDNSProviderDisplayName(dnsProvider)}`
            : `DNS already configured for ${receivingDomain}`
        );
        dnsAutoCreated = true;

        // If reply threading is enabled, also publish r.mail.{parent} MX+SPF
        // via the same provider credentials.
        if (replyThreadingEnabled) {
          try {
            const replyDomain = `r.mail.${parentDomain}`;
            await guardInboundDNSWrite({
              credentials: credentialResult.credentials,
              receivingDomain: replyDomain,
              region,
              parentDomain,
              yes: options.yes ?? false,
            });
            const replyResult = await createInboundDNSRecordsForProvider(
              credentialResult.credentials,
              replyDomain,
              region,
              parentDomain
            );
            if (replyResult.success && replyResult.recordsCreated > 0) {
              progress.succeed(
                `Created ${replyResult.recordsCreated} DNS records for r.mail.${parentDomain}`
              );
            }
            if (replyResult.errors) {
              for (const err of replyResult.errors) {
                clack.log.warn(err);
              }
            }
          } catch (error) {
            clack.log.warn(
              `Failed to create DNS for r.mail.${parentDomain}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      } else {
        progress.fail("Failed to create some DNS records");
      }
      // Printed regardless of success: a skipped SPF write (e.g. an
      // existing v=spf1 record) still reports `success: true` with the
      // MX created, and `errors` is the only place the "add
      // include:amazonses.com yourself" guidance is carried.
      if (result.errors) {
        for (const err of result.errors) {
          clack.log.warn(err);
        }
      }
    } else {
      clack.log.warn(
        credentialResult.error || "Could not validate credentials"
      );

      if (!options.yes) {
        const continueManual = await promptContinueManualDNS();
        if (continueManual) {
          dnsProvider = "manual";
        }
      }
    }
  }

  // Show manual DNS instructions if auto-creation was skipped or failed
  if (!dnsAutoCreated) {
    const dnsRecords = buildRecords(receivingDomain, region);

    console.log();
    clack.note(
      formatManualDNSInstructions(dnsRecords),
      "DNS Records — Add these to your DNS provider"
    );

    // Also show manual DNS for r.mail.{parent} when reply threading is on.
    if (replyThreadingEnabled) {
      const replyRecords = buildRecords(`r.mail.${parentDomain}`, region);
      console.log();
      clack.note(
        formatManualDNSInstructions(replyRecords),
        `DNS Records for r.mail.${parentDomain} — Add these to your DNS provider`
      );
    }
  }

  // 11. Save to metadata
  await progress.execute("Saving configuration", async () => {
    addInboundDomainToMetadata(metadata, {
      subdomain,
      receivingDomain,
      parentDomain,
      addedAt: new Date().toISOString(),
    });
    await saveConnectionMetadata(metadata);
  });

  if (isJsonMode()) {
    jsonSuccess("email.inbound.add", {
      receivingDomain,
      subdomain,
      parentDomain,
      dnsAutoCreated,
      region,
    });
    return;
  }

  console.log();
  clack.log.success(
    `${pc.bold("Added inbound domain:")} ${pc.cyan(receivingDomain)}`
  );
  console.log();
  if (dnsAutoCreated) {
    console.log(`  Verify: ${pc.cyan("wraps email inbound verify")}`);
  } else {
    console.log(`  ${pc.dim("1.")} Add DNS records above to your DNS provider`);
    console.log(
      `  ${pc.dim("2.")} Verify: ${pc.cyan("wraps email inbound verify")}`
    );
  }
  console.log();
}

/**
 * Inbound Remove command - Remove an inbound receiving domain
 */
export async function inboundRemove(
  options: EmailInboundRemoveOptions
): Promise<void> {
  if (!isJsonMode()) {
    clack.intro(pc.bold("Remove Inbound Receiving Domain"));
  }

  const progress = new DeploymentProgress();

  // 1. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  // 2. Get region
  const region = options.region || (await getAWSRegion());

  // 3. Load metadata
  const metadata = await loadConnectionMetadata(identity.accountId, region);

  if (!metadata?.services?.email?.config?.inbound?.enabled) {
    clack.log.error("Inbound email infrastructure is not deployed.");
    console.log(`\nDeploy first: ${pc.cyan("wraps email inbound init")}\n`);
    process.exit(1);
  }

  const emailConfig = metadata.services.email.config;
  const inboundDomains = emailConfig.inboundDomains ?? [];

  if (inboundDomains.length === 0) {
    clack.log.warn("No inbound domains configured.");
    return;
  }

  // 4. Select domain to remove
  let domainToRemove = options.domain;

  if (!domainToRemove) {
    if (inboundDomains.length === 1) {
      domainToRemove = inboundDomains[0].receivingDomain;
    } else {
      ensureInteractive(
        "Inbound domain selection",
        "--domain <receiving-domain>"
      );
      const selected = await clack.select({
        message: "Which inbound domain do you want to remove?",
        options: inboundDomains.map((d) => ({
          value: d.receivingDomain,
          label: d.receivingDomain,
          hint: `added ${d.addedAt.split("T")[0]}`,
        })),
      });
      if (clack.isCancel(selected)) {
        clack.cancel("Operation cancelled.");
        process.exit(0);
      }
      domainToRemove = selected as string;
    }
  }

  // 5. Validate domain exists
  if (!inboundDomains.some((d) => d.receivingDomain === domainToRemove)) {
    clack.log.error(
      `${pc.cyan(domainToRemove)} is not in the inbound domains list.`
    );
    return;
  }

  // 6. Guard: can't remove last domain
  if (inboundDomains.length === 1) {
    clack.log.error(
      "Cannot remove the last inbound domain. Use " +
        pc.cyan("wraps email inbound destroy") +
        " to remove all inbound infrastructure."
    );
    return;
  }

  // 7. Confirm
  if (!options.yes) {
    const { buildInboundDNSRecords: buildRecordsForDisplay } = await import(
      "../../utils/dns/index.js"
    );
    const candidateRecords = buildRecordsForDisplay(domainToRemove, region);
    if (candidateRecords.length > 0) {
      clack.log.info(pc.bold("DNS records that will be deleted:"));
      for (const record of candidateRecords) {
        const value = record.priority
          ? `${record.priority} ${record.value}`
          : record.value;
        clack.log.info(pc.dim(`  ${record.type} ${record.name} → ${value}`));
      }
    }

    ensureInteractive("Removal confirmation", "--yes");
    const confirmed = await clack.confirm({
      message: `Remove inbound domain ${pc.cyan(domainToRemove)}?`,
      initialValue: false,
    });

    if (clack.isCancel(confirmed) || !confirmed) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }
  }

  // 8. Remove from SES receipt rule
  await progress.execute("Updating SES receipt rule", async () => {
    await removeDomainFromReceiptRule(region, domainToRemove);
  });

  // 8b. Delete the DNS records `inbound add` created for this domain, before
  // metadata is saved — a DNS failure here must not leave metadata claiming
  // the domain is gone while DNS still points at SES.
  const dnsCleanup = await cleanUpInboundDNS({
    metadata,
    domainToRemove,
    inboundDomains,
    parentDomainFallback: emailConfig.domain || "",
    region,
  });

  // 9. Remove from metadata
  await progress.execute("Saving configuration", async () => {
    removeInboundDomainFromMetadata(metadata, domainToRemove);
    await saveConnectionMetadata(metadata);
  });

  if (isJsonMode()) {
    jsonSuccess("email.inbound.remove", {
      removedDomain: domainToRemove,
      remainingDomains: (emailConfig.inboundDomains ?? []).map(
        (d) => d.receivingDomain
      ),
      region,
      dnsDeleted: dnsCleanup.deleted,
      dnsSkipped: dnsCleanup.skipped,
      dnsSupported: dnsCleanup.supported,
    });
    return;
  }

  console.log();
  clack.log.success(
    `${pc.bold("Removed inbound domain:")} ${pc.cyan(domainToRemove)}`
  );
  console.log();
  reportInboundDNSCleanup(dnsCleanup, domainToRemove);
}
