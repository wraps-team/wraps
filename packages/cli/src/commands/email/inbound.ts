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
import { errors } from "../../utils/shared/errors.js";
import {
  ensurePulumiWorkDir,
  getPulumiWorkDir,
} from "../../utils/shared/fs.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import {
  addInboundDomainToMetadata,
  buildEmailStackConfig,
  getAllTrackedDomains,
  loadConnectionMetadata,
  removeInboundDomainFromMetadata,
  saveConnectionMetadata,
} from "../../utils/shared/metadata.js";
import { DeploymentProgress } from "../../utils/shared/output.js";
import {
  promptInboundSubdomain,
  promptWebhookUrl,
} from "../../utils/shared/prompts.js";
import {
  ensurePulumiInstalled,
  withLockRetry,
} from "../../utils/shared/pulumi.js";
import {
  DEFAULT_PULUMI_TIMEOUT_MS,
  withTimeout,
} from "../../utils/shared/timeout.js";

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

    dnsProvider = await promptDNSProvider(domain, availableProviders);
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

      progress.start(
        `Creating DNS records in ${getDNSProviderDisplayName(dnsProvider)}`
      );
      const result = await createInboundDNSRecordsForProvider(
        credentialResult.credentials,
        receivingDomain,
        region,
        domain
      );

      if (result.success && result.recordsCreated > 0) {
        progress.succeed(
          `Created ${result.recordsCreated} DNS records in ${getDNSProviderDisplayName(dnsProvider)}`
        );
        dnsAutoCreated = true;
      } else {
        progress.fail("Failed to create some DNS records");
        if (result.errors) {
          for (const err of result.errors) {
            clack.log.warn(err);
          }
        }
      }
    } else {
      clack.log.warn(
        credentialResult.error || "Could not validate credentials"
      );

      const continueManual = await promptContinueManualDNS();
      if (continueManual) {
        dnsProvider = "manual";
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

  // 4. Confirm
  if (!options.force) {
    clack.log.warn(
      `This will remove inbound email for ${pc.cyan(inboundConfig.receivingDomain || "")}`
    );
    const confirmed = await clack.confirm({
      message: "Are you sure you want to destroy inbound email infrastructure?",
      initialValue: false,
    });

    if (clack.isCancel(confirmed) || !confirmed) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }
  }

  // 5. Delete SES receipt rules
  await progress.execute("Removing SES receipt rules", async () => {
    await deleteReceiptRule(region);
    await deleteReceiptRuleSet(region);
  });

  // 6. Ensure Pulumi work directory
  await progress.execute("Preparing workspace", async () =>
    ensurePulumiWorkDir({
      accountId: identity.accountId,
      region,
    })
  );

  const pulumiWorkDir = getPulumiWorkDir();
  const stackName =
    emailService.pulumiStackName || `wraps-${identity.accountId}-${region}`;

  // 7. Redeploy with inbound disabled
  const updatedEmailConfig = {
    ...emailService.config,
    inbound: undefined,
    inboundDomains: undefined,
  };

  const stackConfig = buildEmailStackConfig(metadata, region, {
    emailConfig: updatedEmailConfig,
  });

  await progress.execute("Removing inbound infrastructure", async () => {
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

  // 8. Save metadata
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
    });
    return;
  }

  console.log();
  clack.log.success(pc.bold("Inbound email infrastructure removed."));
  console.log();
  console.log(
    `  ${pc.dim("Remember to remove the MX and SPF DNS records for")} ${pc.cyan(inboundConfig.receivingDomain || "")}`
  );
  console.log();
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
  const testSubject = `Wraps Inbound Test - ${new Date().toISOString()}`;

  await progress.execute(`Sending test email to ${testRecipient}`, async () => {
    const { SESClient, SendEmailCommand } = await import("@aws-sdk/client-ses");
    const ses = new SESClient({ region });

    await ses.send(
      new SendEmailCommand({
        Source: `test@${emailConfig.domain}`,
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
  });

  // 5. Poll S3 for the parsed email (up to 30s)
  const spinner = clack.spinner();
  spinner.start("Waiting for email to be processed...");

  const { S3Client, ListObjectsV2Command, GetObjectCommand } = await import(
    "@aws-sdk/client-s3"
  );
  const s3 = new S3Client({ region });

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

  await progress.execute("Updating SES receipt rule", async () => {
    await addDomainToReceiptRule(region, receivingDomain, bucketName);
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

      progress.start(
        `Creating DNS records in ${getDNSProviderDisplayName(dnsProvider)}`
      );
      const result = await createInboundDNSRecordsForProvider(
        credentialResult.credentials,
        receivingDomain,
        region,
        parentDomain
      );

      if (result.success && result.recordsCreated > 0) {
        progress.succeed(
          `Created ${result.recordsCreated} DNS records in ${getDNSProviderDisplayName(dnsProvider)}`
        );
        dnsAutoCreated = true;
      } else {
        progress.fail("Failed to create some DNS records");
        if (result.errors) {
          for (const err of result.errors) {
            clack.log.warn(err);
          }
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
    });
    return;
  }

  console.log();
  clack.log.success(
    `${pc.bold("Removed inbound domain:")} ${pc.cyan(domainToRemove)}`
  );
  console.log();
  console.log(
    `  ${pc.dim("Remember to remove the MX and SPF DNS records for")} ${pc.cyan(domainToRemove)}`
  );
  console.log();
}
