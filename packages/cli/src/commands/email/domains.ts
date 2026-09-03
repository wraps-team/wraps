import { Resolver } from "node:dns/promises";
import {
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  type EventType,
  GetEmailIdentityCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { getTelemetryClient } from "../../telemetry/client.js";
import { trackCommand, trackFeature } from "../../telemetry/events.js";
import type {
  AdditionalDomain,
  DomainPurpose,
  EmailVerifyOptions,
} from "../../types/index.js";
import {
  buildEmailDNSRecords,
  createDNSRecordsForProvider,
  detectAvailableDNSProviders,
  formatDNSRecordsForDisplay,
  getDNSCredentials,
  getDNSProviderDisplayName,
} from "../../utils/dns/index.js";
import { domainToConfigSetName } from "../../utils/email/config-set-slug.js";
import {
  defaultTrackingDomain,
  isTrackingDomainNotReady,
  putTrackingDomain,
  TRACKING_DOMAIN_NONE,
  validateTrackingDomain,
} from "../../utils/email/tracking-domain.js";
import {
  describeTrackingHttpsError,
  disableDistribution,
  provisionTrackingHttps,
} from "../../utils/email/tracking-https.js";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import {
  classifyDNSError,
  isAWSNotFoundError,
  WrapsError,
} from "../../utils/shared/errors.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import {
  addDomainToMetadata,
  findConnectionsWithService,
  getAllTrackedDomains,
  getDomainFromMetadata,
  loadConnectionMetadata,
  removeDomainFromMetadata,
  saveConnectionMetadata,
} from "../../utils/shared/metadata.js";
import { DeploymentProgress } from "../../utils/shared/output.js";
import {
  promptDNSProvider,
  promptDomainPurpose,
  promptMailFromSubdomain,
  promptSubdomainSuggestions,
  promptTrackingSubdomain,
} from "../../utils/shared/prompts.js";

type DNSResult = {
  name: string;
  type: string;
  status: "verified" | "incorrect" | "missing";
  records?: string[];
};

type VerifyCheckResult = {
  dnsResults: DNSResult[];
  verificationStatus: "verified" | "pending";
  dkimStatus: string;
  mailFromDomain?: string;
  mailFromStatus: string;
  allVerified: boolean;
};

/**
 * Check DNS records and SES verification status for a domain.
 * Extracted for reuse in --wait polling loop.
 */
async function checkVerification(
  domain: string,
  sesClient: SESv2Client,
  region: string,
  trackingDomain?: string
): Promise<VerifyCheckResult> {
  const identity = await sesClient.send(
    new GetEmailIdentityCommand({ EmailIdentity: domain })
  );

  const dkimTokens = identity.DkimAttributes?.Tokens || [];
  const mailFromDomain = identity.MailFromAttributes?.MailFromDomain;

  // Check DNS records
  const resolver = new Resolver();
  resolver.setServers(["8.8.8.8", "1.1.1.1"]);
  const dnsResults: DNSResult[] = [];

  // Check DKIM records
  for (const token of dkimTokens) {
    const dkimRecord = `${token}._domainkey.${domain}`;
    try {
      const records = await resolver.resolveCname(dkimRecord);
      const expected = `${token}.dkim.amazonses.com`;
      const found = records.some((r) => r === expected || r === `${expected}.`);
      dnsResults.push({
        name: dkimRecord,
        type: "CNAME",
        status: found ? "verified" : "incorrect",
        records,
      });
    } catch (error) {
      const dnsClass = classifyDNSError(error);
      if (dnsClass === "missing") {
        dnsResults.push({
          name: dkimRecord,
          type: "CNAME",
          status: "missing",
        });
      } else if (dnsClass === "network") {
        dnsResults.push({
          name: dkimRecord,
          type: "CNAME",
          status: "missing",
          records: ["DNS lookup failed (network issue)"],
        });
      } else {
        throw error;
      }
    }
  }

  // Check SPF record
  try {
    const records = await resolver.resolveTxt(domain);
    const spfRecord = records
      .map((c) => c.join(""))
      .find((r) => r.startsWith("v=spf1"));
    const hasAmazonSES = spfRecord?.includes("include:amazonses.com");
    dnsResults.push({
      name: domain,
      type: "TXT (SPF)",
      status: hasAmazonSES ? "verified" : spfRecord ? "incorrect" : "missing",
      records: spfRecord ? [spfRecord] : undefined,
    });
  } catch (error) {
    const dnsClass = classifyDNSError(error);
    if (dnsClass === "missing") {
      dnsResults.push({
        name: domain,
        type: "TXT (SPF)",
        status: "missing",
      });
    } else if (dnsClass === "network") {
      dnsResults.push({
        name: domain,
        type: "TXT (SPF)",
        status: "missing",
        records: ["DNS lookup failed (network issue)"],
      });
    } else {
      throw error;
    }
  }

  // Check DMARC record
  try {
    const records = await resolver.resolveTxt(`_dmarc.${domain}`);
    const dmarcRecord = records
      .map((c) => c.join(""))
      .find((r) => r.startsWith("v=DMARC1"));
    dnsResults.push({
      name: `_dmarc.${domain}`,
      type: "TXT (DMARC)",
      status: dmarcRecord ? "verified" : "missing",
      records: dmarcRecord ? [dmarcRecord] : undefined,
    });
  } catch (error) {
    const dnsClass = classifyDNSError(error);
    if (dnsClass === "missing") {
      dnsResults.push({
        name: `_dmarc.${domain}`,
        type: "TXT (DMARC)",
        status: "missing",
      });
    } else if (dnsClass === "network") {
      dnsResults.push({
        name: `_dmarc.${domain}`,
        type: "TXT (DMARC)",
        status: "missing",
        records: ["DNS lookup failed (network issue)"],
      });
    } else {
      throw error;
    }
  }

  // Check MAIL FROM domain records (if configured)
  if (mailFromDomain) {
    // Check MX record for MAIL FROM domain
    try {
      const mxRecords = await resolver.resolveMx(mailFromDomain);
      const expectedMx = `feedback-smtp.${region}.amazonses.com`;
      const hasMx = mxRecords.some(
        (r) => r.exchange === expectedMx || r.exchange === `${expectedMx}.`
      );
      dnsResults.push({
        name: mailFromDomain,
        type: "MX",
        status: hasMx
          ? "verified"
          : mxRecords.length > 0
            ? "incorrect"
            : "missing",
        records: mxRecords.map((r) => `${r.priority} ${r.exchange}`),
      });
    } catch (error) {
      const dnsClass = classifyDNSError(error);
      if (dnsClass === "missing") {
        dnsResults.push({
          name: mailFromDomain,
          type: "MX",
          status: "missing",
        });
      } else if (dnsClass === "network") {
        dnsResults.push({
          name: mailFromDomain,
          type: "MX",
          status: "missing",
          records: ["DNS lookup failed (network issue)"],
        });
      } else {
        throw error;
      }
    }

    // Check SPF record for MAIL FROM domain
    try {
      const records = await resolver.resolveTxt(mailFromDomain);
      const spfRecord = records
        .map((c) => c.join(""))
        .find((r) => r.startsWith("v=spf1"));
      const hasAmazonSES = spfRecord?.includes("include:amazonses.com");
      dnsResults.push({
        name: mailFromDomain,
        type: "TXT (SPF)",
        status: hasAmazonSES ? "verified" : spfRecord ? "incorrect" : "missing",
        records: spfRecord ? [spfRecord] : undefined,
      });
    } catch (error) {
      const dnsClass = classifyDNSError(error);
      if (dnsClass === "missing") {
        dnsResults.push({
          name: mailFromDomain,
          type: "TXT (SPF)",
          status: "missing",
        });
      } else if (dnsClass === "network") {
        dnsResults.push({
          name: mailFromDomain,
          type: "TXT (SPF)",
          status: "missing",
          records: ["DNS lookup failed (network issue)"],
        });
      } else {
        throw error;
      }
    }
  }

  const verificationStatus = identity.VerifiedForSendingStatus
    ? "verified"
    : "pending";
  const dkimStatus = identity.DkimAttributes?.Status || "PENDING";
  const mailFromStatus =
    identity.MailFromAttributes?.MailFromDomainStatus || "NOT_CONFIGURED";
  // A missing tracking CNAME must not block "ready to send" — compute
  // allVerified before adding its row to dnsResults.
  const allVerified =
    verificationStatus === "verified" &&
    dnsResults.every((r) => r.status === "verified");

  // Check custom tracking domain CNAME (if configured) — informational only.
  if (trackingDomain) {
    try {
      const records = await resolver.resolveCname(trackingDomain);
      const expected = `r.${region}.awstrack.me`;
      const found = records.some((r) => r === expected || r === `${expected}.`);
      dnsResults.push({
        name: trackingDomain,
        type: "CNAME",
        status: found ? "verified" : "incorrect",
        records,
      });
    } catch (error) {
      const dnsClass = classifyDNSError(error);
      if (dnsClass === "missing") {
        dnsResults.push({
          name: trackingDomain,
          type: "CNAME",
          status: "missing",
        });
      } else if (dnsClass === "network") {
        dnsResults.push({
          name: trackingDomain,
          type: "CNAME",
          status: "missing",
          records: ["DNS lookup failed (network issue)"],
        });
      } else {
        throw error;
      }
    }
  }

  return {
    dnsResults,
    verificationStatus,
    dkimStatus,
    mailFromDomain,
    mailFromStatus,
    allVerified,
  };
}

/**
 * Display verification results. Returns true if fully verified.
 */
function displayVerifyResults(
  domain: string,
  result: VerifyCheckResult
): boolean {
  const {
    dnsResults,
    verificationStatus,
    dkimStatus,
    mailFromDomain,
    mailFromStatus,
  } = result;

  const statusLines = [
    `${pc.bold("Domain:")} ${domain}`,
    `${pc.bold("Verification Status:")} ${
      verificationStatus === "verified"
        ? pc.green("✓ Verified")
        : pc.yellow("⏱ Pending")
    }`,
    `${pc.bold("DKIM Status:")} ${
      dkimStatus === "SUCCESS"
        ? pc.green("✓ Success")
        : pc.yellow(`⏱ ${dkimStatus}`)
    }`,
  ];

  if (mailFromDomain) {
    statusLines.push(
      `${pc.bold("MAIL FROM Domain:")} ${mailFromDomain}`,
      `${pc.bold("MAIL FROM Status:")} ${
        mailFromStatus === "SUCCESS"
          ? pc.green("✓ Success")
          : mailFromStatus === "NOT_CONFIGURED"
            ? pc.yellow("⏱ Not Configured")
            : pc.yellow(`⏱ ${mailFromStatus}`)
      }`
    );
  }

  clack.note(statusLines.join("\n"), "SES Status");

  // DNS Records
  const dnsLines = dnsResults.map((record) => {
    let statusIcon: string;
    let statusColor: (s: string) => string;

    if (record.status === "verified") {
      statusIcon = "✓";
      statusColor = pc.green;
    } else if (record.status === "incorrect") {
      statusIcon = "✗";
      statusColor = pc.red;
    } else {
      statusIcon = "✗";
      statusColor = pc.red;
    }

    const recordInfo = record.records ? ` → ${record.records.join(", ")}` : "";
    return `  ${statusColor(statusIcon)} ${record.name} (${record.type}) ${statusColor(
      record.status
    )}${recordInfo}`;
  });

  clack.note(dnsLines.join("\n"), "DNS Records");

  return result.allVerified;
}

const DEFAULT_POLL_INTERVAL_S = 30;
const MAX_POLL_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Verify domain DNS records and verification status
 */
export async function verifyDomain(options: EmailVerifyOptions): Promise<void> {
  if (!isJsonMode()) {
    clack.intro(pc.bold(`Verifying ${options.domain}`));
  }

  const progress = new DeploymentProgress();
  const region = await getAWSRegion();
  const sesClient = new SESv2Client({ region });

  // Load metadata to find a pending tracking domain (non-fatal if unavailable)
  let metadata: Awaited<ReturnType<typeof loadConnectionMetadata>> = null;
  try {
    const awsIdentity = await validateAWSCredentials();
    metadata = await loadConnectionMetadata(awsIdentity.accountId, region);
    // baseline:allow-next-line no-swallowed-errors — metadata unavailable is non-fatal, verify proceeds without a tracking domain check
  } catch {}

  const domainInfo = metadata
    ? getDomainFromMetadata(metadata, options.domain)
    : null;
  const trackedEntry =
    domainInfo?.isPrimary === false ? domainInfo.entry : undefined;

  async function applyPendingTrackingDomain(): Promise<void> {
    if (
      !(metadata && trackedEntry?.trackingDomain) ||
      trackedEntry.trackingDomainAppliedAt
    ) {
      return;
    }
    const targetConfigSetName =
      trackedEntry.configSetName ?? domainToConfigSetName(options.domain);
    await progress.execute("Applying tracking domain", async () => {
      try {
        await putTrackingDomain(
          sesClient,
          targetConfigSetName,
          trackedEntry.trackingDomain!
        );
        trackedEntry.trackingDomainAppliedAt = new Date().toISOString();
        addDomainToMetadata(metadata!, trackedEntry);
        await saveConnectionMetadata(metadata!);
      } catch (error) {
        if (!isTrackingDomainNotReady(error)) throw error;
        if (!isJsonMode()) {
          clack.log.warn(
            `Tracking domain ${trackedEntry.trackingDomain} not yet applied — ${options.domain} isn't fully verified in SES yet.`
          );
        }
      }
    });
  }

  // 1. Initial check — also validates domain exists in SES
  let result: VerifyCheckResult;
  try {
    result = await progress.execute(
      "Checking SES verification status",
      async () =>
        checkVerification(
          options.domain,
          sesClient,
          region,
          trackedEntry?.trackingDomain
        )
    );
  } catch (error) {
    if (isAWSNotFoundError(error)) {
      progress.stop();
      clack.log.error(`Domain ${options.domain} not found in SES`);
      console.log(
        `\nRun ${pc.cyan(`wraps email init --domain ${options.domain}`)} to add this domain.\n`
      );
      process.exit(1);
      return; // Return after process.exit for testing
    }
    throw error;
  }

  progress.stop();

  // 2. Display results
  const allVerified = isJsonMode()
    ? result.allVerified
    : displayVerifyResults(options.domain, result);

  // JSON mode: output and return (no --wait polling in JSON mode)
  if (isJsonMode()) {
    if (result.allVerified) {
      await applyPendingTrackingDomain();
    }
    jsonSuccess("email.domains.verify", {
      domain: options.domain,
      verified: result.allVerified,
      verificationStatus: result.verificationStatus,
      dkimStatus: result.dkimStatus,
      mailFromDomain: result.mailFromDomain,
      mailFromStatus: result.mailFromStatus,
      dnsRecords: result.dnsResults.map((r) => ({
        name: r.name,
        type: r.type,
        status: r.status,
        records: r.records,
      })),
    });
    return;
  }

  // 3. Handle --wait polling
  if (options.wait && !allVerified) {
    const intervalS = options.interval ?? DEFAULT_POLL_INTERVAL_S;
    const startTime = Date.now();
    let attempt = 1;

    console.log(
      `\n${pc.dim(`Polling every ${intervalS}s until verified (timeout: 30 min). Press Ctrl+C to stop.`)}\n`
    );

    while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
      // Wait for the interval
      await new Promise((resolve) => setTimeout(resolve, intervalS * 1000));
      attempt++;

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const elapsedStr =
        elapsed >= 60
          ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
          : `${elapsed}s`;

      try {
        result = await progress.execute(
          `Check #${attempt} (${elapsedStr} elapsed)`,
          async () =>
            checkVerification(
              options.domain,
              sesClient,
              region,
              trackedEntry?.trackingDomain
            )
        );
        // baseline:allow-next-line no-swallowed-errors — DNS/SES check failure during polling is non-fatal, will retry
      } catch {
        progress.stop();
        clack.log.warn(`Check #${attempt} failed, will retry...`);
        continue;
      }

      progress.stop();

      if (result.allVerified) {
        await applyPendingTrackingDomain();
        displayVerifyResults(options.domain, result);
        clack.outro(
          pc.green("✓ Domain is fully verified and ready to send emails!")
        );
        trackFeature("domain_verified", { dns_auto_detected: true });
        trackCommand("email:domains:verify", {
          success: true,
          verified: true,
          dkim_status: result.dkimStatus,
          wait: true,
          attempts: attempt,
          elapsed_s: elapsed,
        });
        return;
      }

      // Show compact progress
      const verified = result.dnsResults.filter(
        (r) => r.status === "verified"
      ).length;
      const total = result.dnsResults.length;
      clack.log.info(
        pc.dim(
          `${verified}/${total} records verified, ${result.verificationStatus === "verified" ? "SES verified" : "SES pending"}. Next check in ${intervalS}s...`
        )
      );
    }

    // Timeout reached
    displayVerifyResults(options.domain, result);
    clack.outro(
      pc.yellow("⏱ Timeout reached. Domain is not yet fully verified.")
    );
    console.log(
      `\nRe-run ${pc.cyan(`wraps email verify --domain ${options.domain} --wait`)} to continue polling.\n`
    );
    trackCommand("email:domains:verify", {
      success: true,
      verified: false,
      dkim_status: result.dkimStatus,
      wait: true,
      timed_out: true,
    });
    return;
  }

  // 4. Non-wait summary
  const someIncorrect = result.dnsResults.some((r) => r.status === "incorrect");

  if (allVerified) {
    await applyPendingTrackingDomain();
    clack.outro(
      pc.green("✓ Domain is fully verified and ready to send emails!")
    );
    trackFeature("domain_verified", { dns_auto_detected: true });
  } else if (someIncorrect) {
    clack.outro(
      pc.red("✗ Some DNS records are incorrect. Please update them.")
    );
    console.log(
      `\nRun ${pc.cyan("wraps email status")} to see the correct DNS records.\n`
    );
  } else {
    clack.outro(
      pc.yellow("⏱ Waiting for DNS propagation and SES verification")
    );
    console.log("\nDNS records can take up to 48 hours to propagate.");
    console.log(
      "SES verification usually completes within 72 hours after DNS propagation."
    );
    console.log(
      `\n${pc.dim("Tip:")} Run ${pc.cyan(`wraps email verify --domain ${options.domain} --wait`)} to poll automatically.\n`
    );
  }

  // Track verify command
  trackCommand("email:domains:verify", {
    success: true,
    verified: allVerified,
    dkim_status: result.dkimStatus,
  });
}

/**
 * Add a domain to SES for email sending.
 *
 * Enhanced flow:
 * 1. Validate AWS creds, load metadata (require email service)
 * 2. Subdomain suggestions when primary domain exists
 * 3. Prompt for purpose
 * 4. Create SES identity with ConfigurationSetName
 * 5. Set up MAIL FROM
 * 6. DNS automation (reuse cached provider or detect fresh)
 * 7. Save to metadata
 * 8. Display success
 */
export async function addDomain(options: {
  domain?: string;
  region?: string;
  yes?: boolean;
  trackingDomain?: string;
  trackingHttps?: boolean;
}): Promise<void> {
  if (!isJsonMode()) {
    clack.intro(pc.bold("Add Email Domain"));
  }

  const progress = new DeploymentProgress();

  try {
    // 1. Validate AWS credentials and load metadata
    const identity = await progress.execute(
      "Validating AWS credentials",
      async () => validateAWSCredentials()
    );

    let region = options.region || (await getAWSRegion());

    // Find existing email deployment
    const emailConnections = await findConnectionsWithService(
      identity.accountId,
      "email"
    );

    if (emailConnections.length === 0) {
      progress.stop();
      clack.log.error("No email infrastructure found");
      console.log(
        `\nRun ${pc.cyan("wraps email init")} first to deploy email infrastructure.\n`
      );
      process.exit(1);
      return;
    }

    // Auto-select region if only one deployment
    if (emailConnections.length === 1) {
      region = emailConnections[0].region;
    }

    const metadata = await loadConnectionMetadata(identity.accountId, region);
    if (!metadata?.services.email) {
      progress.stop();
      clack.log.error(`No email service found in ${region}`);
      process.exit(1);
      return;
    }

    const primaryDomain = metadata.services.email.config.domain;

    // 2. Determine domain to add
    let domain = options.domain;

    if (!domain && isJsonMode()) {
      throw new WrapsError(
        "The --domain flag is required in JSON mode",
        "MISSING_REQUIRED_FLAG",
        "Provide --domain <domain>"
      );
    }

    if (!domain) {
      progress.stop();
      if (primaryDomain) {
        domain = await promptSubdomainSuggestions(primaryDomain);
      } else {
        const entered = await clack.text({
          message: "Domain to add:",
          placeholder: "myapp.com",
          validate: (value) => {
            if (!value?.includes(".")) {
              return "Please enter a valid domain (e.g., myapp.com)";
            }
            return;
          },
        });

        if (clack.isCancel(entered)) {
          clack.cancel("Operation cancelled.");
          process.exit(0);
        }

        domain = entered as string;
      }
    }

    clack.log.step(`Adding ${pc.cyan(domain)}`);

    const sesClient = new SESv2Client({ region });

    // Check if domain already exists in SES
    let domainAlreadyExists = false;
    let dkimTokens: string[] = [];

    try {
      const existing = await sesClient.send(
        new GetEmailIdentityCommand({ EmailIdentity: domain })
      );
      domainAlreadyExists = true;
      dkimTokens = existing.DkimAttributes?.Tokens || [];
      clack.log.info(
        `Domain ${pc.cyan(domain)} already exists in SES — adopting into Wraps`
      );
    } catch (error) {
      if (!isAWSNotFoundError(error)) {
        throw error;
      }
    }

    // 3. Prompt for purpose (skip in non-interactive mode)
    let purpose: DomainPurpose = "other";
    if (!options.yes) {
      purpose = await promptDomainPurpose();
    }

    // 4. Create per-domain config set + event destination, then create/associate the SES identity
    const configSetName = domainToConfigSetName(domain);
    const trackingConfig = {
      opens: purpose === "marketing" || purpose === "notifications",
      clicks: purpose === "marketing" || purpose === "notifications",
    };
    const matchingEventTypes: EventType[] = [
      "SEND",
      "DELIVERY",
      "OPEN",
      "CLICK",
      "BOUNCE",
      "COMPLAINT",
      "REJECT",
      "RENDERING_FAILURE",
      "DELIVERY_DELAY",
      "SUBSCRIPTION",
    ];

    const eventBusArn = `arn:aws:events:${region}:${identity.accountId}:event-bus/default`;

    await progress.execute("Creating tracking configuration", async () => {
      try {
        await sesClient.send(
          new CreateConfigurationSetCommand({
            ConfigurationSetName: configSetName,
            SuppressionOptions: { SuppressedReasons: ["BOUNCE", "COMPLAINT"] },
          })
        );
      } catch (err) {
        if ((err as { name?: string }).name !== "AlreadyExistsException")
          throw err;
      }
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
    });

    if (domainAlreadyExists) {
      const { PutEmailIdentityConfigurationSetAttributesCommand } =
        await import("@aws-sdk/client-sesv2");
      await progress.execute("Associating tracking configuration", async () => {
        await sesClient.send(
          new PutEmailIdentityConfigurationSetAttributesCommand({
            EmailIdentity: domain,
            ConfigurationSetName: configSetName,
          })
        );
      });
    } else {
      const { CreateEmailIdentityCommand } = await import(
        "@aws-sdk/client-sesv2"
      );
      await progress.execute("Creating SES identity", async () => {
        await sesClient.send(
          new CreateEmailIdentityCommand({
            EmailIdentity: domain,
            ConfigurationSetName: configSetName,
            DkimSigningAttributes: {
              NextSigningKeyLength: "RSA_2048_BIT",
            },
          })
        );
      });

      // Get DKIM tokens for newly created identity
      const sesIdentity = await sesClient.send(
        new GetEmailIdentityCommand({ EmailIdentity: domain })
      );
      dkimTokens = sesIdentity.DkimAttributes?.Tokens || [];
    }

    // 5. Set up MAIL FROM
    let mailFromDomain: string | undefined;
    if (options.yes) {
      // Non-interactive: default to mail.{domain}
      mailFromDomain = `mail.${domain}`;
    } else {
      const wantsMailFrom = await clack.confirm({
        message: `Configure MAIL FROM for ${pc.cyan(domain)}? ${pc.dim("(improves DMARC alignment)")}`,
        initialValue: true,
      });

      if (clack.isCancel(wantsMailFrom)) {
        clack.cancel("Operation cancelled.");
        process.exit(0);
      }

      if (wantsMailFrom) {
        mailFromDomain = await promptMailFromSubdomain(domain);
      }
    }

    if (mailFromDomain) {
      const { PutEmailIdentityMailFromAttributesCommand } = await import(
        "@aws-sdk/client-sesv2"
      );
      await progress.execute("Setting up MAIL FROM", async () => {
        await sesClient.send(
          new PutEmailIdentityMailFromAttributesCommand({
            EmailIdentity: domain,
            MailFromDomain: mailFromDomain,
            BehaviorOnMxFailure: "USE_DEFAULT_VALUE",
          })
        );
      });
    }

    // 5b. Tracking domain (custom redirect domain on this domain's config set)
    let trackingDomain: string | undefined;
    if (options.trackingDomain) {
      if (options.trackingDomain !== TRACKING_DOMAIN_NONE) {
        const problem = validateTrackingDomain(options.trackingDomain, domain);
        if (problem) {
          throw new WrapsError(
            `Invalid --tracking-domain: ${problem}`,
            "INVALID_TRACKING_DOMAIN",
            `Use a subdomain of ${domain}, e.g. ${defaultTrackingDomain(domain)}`
          );
        }
        trackingDomain = options.trackingDomain.toLowerCase();
      }
    } else if (options.yes) {
      // Non-interactive: same default posture as MAIL FROM above.
      trackingDomain = defaultTrackingDomain(domain);
    } else {
      trackingDomain = await promptTrackingSubdomain(domain);
    }

    let trackingDomainAppliedAt: string | undefined;
    if (trackingDomain) {
      await progress.execute("Setting custom tracking domain", async () => {
        try {
          await putTrackingDomain(sesClient, configSetName, trackingDomain!);
          trackingDomainAppliedAt = new Date().toISOString();
        } catch (error) {
          if (!isTrackingDomainNotReady(error)) throw error;
          // SES refuses a redirect domain under an unverified identity. The
          // CNAME still gets created below; `domains verify` applies it once
          // the domain verifies.
        }
      });
      if (!(trackingDomainAppliedAt || isJsonMode())) {
        clack.log.info(
          pc.dim(
            `SES will accept ${trackingDomain} once ${domain} is verified — run ${pc.cyan(`wraps email domains verify --domain ${domain}`)} afterwards.`
          )
        );
      }
    }

    // 5c. HTTPS for the tracking domain (CloudFront + ACM)
    let trackingHttpsResult:
      | Awaited<ReturnType<typeof provisionTrackingHttps>>
      | undefined;
    if (trackingDomain) {
      let wantsHttps: boolean;
      if (process.argv.includes("--no-tracking-https")) {
        wantsHttps = false;
      } else if (options.trackingHttps !== undefined) {
        wantsHttps = options.trackingHttps;
      } else if (options.yes) {
        wantsHttps = true;
      } else {
        const confirmed = await clack.confirm({
          message: `Enable HTTPS for tracking links? ${pc.dim("(creates a CloudFront distribution + certificate in your account)")}`,
          initialValue: true,
        });
        if (clack.isCancel(confirmed)) {
          clack.cancel("Operation cancelled.");
          process.exit(0);
        }
        wantsHttps = confirmed;
      }

      if (wantsHttps) {
        try {
          trackingHttpsResult = await provisionTrackingHttps({
            domain,
            trackingDomain,
            configSetName,
            sesRegion: region,
            sesv2: sesClient,
            metadataDnsProvider: metadata.services.email.dnsProvider,
            progress,
          });
        } catch (error) {
          // Never abort the domain add over HTTPS: the SES identity, config
          // set, and tracking domain are already created by this point, and
          // failing here would leave them orphaned with nothing saved to
          // metadata. Degrade to 238's plain HTTP tracking behavior instead
          // — trackingHttpsResult stays undefined, so the tracking CNAME
          // falls back to r.<region>.awstrack.me below.
          if (!isJsonMode()) {
            clack.log.warn(
              `Could not enable HTTPS for tracking links: ${describeTrackingHttpsError(error)}`
            );
            clack.log.info(
              pc.dim(
                `Retry later with: ${pc.cyan(`wraps email domains config --domain ${domain} --tracking-https`)}`
              )
            );
          }
        }

        if (
          trackingHttpsResult?.trackingHttps.status === "pending" &&
          !isJsonMode()
        ) {
          clack.log.info(
            pc.dim(
              `Certificate validation usually takes 5–30 minutes. Then run: ${pc.cyan(`wraps email domains config --domain ${domain} --tracking-https`)}`
            )
          );
        }
      }
    }

    // 6. DNS automation
    const cachedDnsProvider = metadata.services.email.dnsProvider;
    let dnsAutoCreated = false;

    // Determine the root domain for DNS zone lookups
    // e.g., "mail.myapp.com" → "myapp.com"
    const domainParts = domain.split(".");
    const rootDomain =
      domainParts.length > 2 ? domainParts.slice(-2).join(".") : domain;

    if (!options.yes || cachedDnsProvider) {
      // Try DNS automation
      let dnsProvider = cachedDnsProvider;

      if (!dnsProvider) {
        progress.stop();
        const availableProviders = await detectAvailableDNSProviders(
          rootDomain,
          region
        );
        dnsProvider = await promptDNSProvider(rootDomain, availableProviders);
      }

      if (dnsProvider && dnsProvider !== "manual") {
        const credResult = await getDNSCredentials(
          dnsProvider,
          rootDomain,
          region
        );

        if (credResult.valid && credResult.credentials) {
          const dnsData = {
            domain,
            dkimTokens,
            mailFromDomain,
            customTrackingDomain: trackingDomain,
            trackingCnameTarget: trackingHttpsResult?.cnameTarget,
            region,
          };

          const result = await progress.execute(
            `Creating DNS records via ${getDNSProviderDisplayName(dnsProvider)}`,
            async () =>
              createDNSRecordsForProvider(credResult.credentials!, dnsData)
          );

          if (result.success && result.recordsCreated > 0) {
            dnsAutoCreated = true;
            clack.log.success(
              `${result.recordsCreated} DNS records created via ${getDNSProviderDisplayName(dnsProvider)}`
            );
          } else if (!result.success) {
            clack.log.warn(
              `DNS auto-creation failed: ${result.errors?.join(", ") || "unknown error"}`
            );
          }

          // Cache the dns provider in metadata for future use
          if (!metadata.services.email.dnsProvider) {
            metadata.services.email.dnsProvider = dnsProvider;
          }
        } else {
          clack.log.warn(`DNS credentials not available: ${credResult.error}`);
        }
      }
    }

    // Show manual DNS records if auto-creation was not done
    if (!dnsAutoCreated) {
      const dnsRecords = buildEmailDNSRecords({
        domain,
        dkimTokens,
        mailFromDomain,
        customTrackingDomain: trackingDomain,
        trackingCnameTarget: trackingHttpsResult?.cnameTarget,
        region,
      });
      const displayRecords = formatDNSRecordsForDisplay(dnsRecords);

      progress.stop();
      console.log();
      clack.log.info(pc.bold("Add these DNS records:"));
      console.log();
      for (const record of displayRecords) {
        console.log(`  ${pc.cyan(record.name)}`);
        console.log(
          `    ${pc.dim("Type:")} ${record.type}  ${pc.dim("Value:")} ${record.value}`
        );
        console.log();
      }
    }

    // ACM certificate validation record (pending HTTPS only) — separate from
    // the DNS automation above since it may not have been pushed automatically.
    if (
      trackingHttpsResult &&
      trackingHttpsResult.dnsRecordsToShow.length > 0
    ) {
      progress.stop();
      console.log();
      clack.log.info(
        pc.bold("Add this DNS record to validate the certificate:")
      );
      console.log();
      for (const record of trackingHttpsResult.dnsRecordsToShow) {
        console.log(`  ${pc.cyan(record.name)}`);
        console.log(
          `    ${pc.dim("Type:")} ${record.type}  ${pc.dim("Value:")} ${record.value}`
        );
        console.log();
      }
    }

    // 7. Save to metadata
    const entry: AdditionalDomain = {
      domain,
      mailFromDomain,
      purpose,
      configSetName,
      trackingConfig,
      trackingDomain,
      trackingDomainAppliedAt,
      trackingHttps: trackingHttpsResult?.trackingHttps,
      addedAt: new Date().toISOString(),
    };
    addDomainToMetadata(metadata, entry);
    await saveConnectionMetadata(metadata);

    // 8. Display success
    progress.stop();

    // Track success
    trackCommand("email:domains:add", {
      success: true,
      dns_auto_created: dnsAutoCreated,
      has_mail_from: !!mailFromDomain,
      has_tracking_domain: !!trackingDomain,
      tracking_https: !!trackingHttpsResult,
      purpose,
    });
    trackFeature("domain_added", {
      purpose,
      subdomain: domain !== primaryDomain,
    });

    if (isJsonMode()) {
      jsonSuccess("email.domains.add", {
        domain,
        mailFromDomain,
        purpose,
        dnsAutoCreated,
        trackingDomain,
        trackingDomainApplied: !!trackingDomainAppliedAt,
        trackingHttps: trackingHttpsResult?.trackingHttps.status ?? null,
      });
      return;
    }

    clack.outro(pc.green(`✓ Domain ${domain} added successfully!`));

    if (dnsAutoCreated) {
      console.log(
        `\n${pc.dim("DNS records were created automatically. Verification should complete within a few minutes.")}`
      );
    }

    console.log(`\n${pc.bold("Next steps:")}`);
    console.log(
      `  Verify: ${pc.cyan(`wraps email domains verify --domain ${domain}`)}`
    );
    console.log(`  Status: ${pc.cyan("wraps email status")}`);
    if (trackingDomain && !trackingDomainAppliedAt) {
      console.log(
        `  Tracking: applied automatically by ${pc.cyan("wraps email domains verify")}`
      );
    }
    console.log();
  } catch (error) {
    progress.stop();
    trackCommand("email:domains:add", { success: false });
    throw error;
  }
}

/**
 * Purpose label map for display
 */
const PURPOSE_LABELS: Record<string, string> = {
  transactional: "Transactional",
  marketing: "Marketing",
  notifications: "Notifications",
  other: "General",
};

/**
 * List all domains configured in SES, cross-referenced with metadata.
 */
export async function listDomains(): Promise<void> {
  if (!isJsonMode()) {
    clack.intro(pc.bold("SES Email Domains"));
  }

  const progress = new DeploymentProgress();
  const region = await getAWSRegion();
  const sesClient = new SESv2Client({ region });

  try {
    // Load SES domains
    const { ListEmailIdentitiesCommand } = await import(
      "@aws-sdk/client-sesv2"
    );

    const identities = await progress.execute(
      "Loading domains from SES",
      async () => {
        const response = await sesClient.send(
          new ListEmailIdentitiesCommand({})
        );
        return response.EmailIdentities || [];
      }
    );

    // Filter to only domains (not email addresses)
    const sesDomains = identities.filter(
      (identity) =>
        identity.IdentityType === "DOMAIN" ||
        (identity.IdentityName && !identity.IdentityName.includes("@"))
    );

    // Load metadata to cross-reference managed vs unmanaged
    let trackedDomains: ReturnType<typeof getAllTrackedDomains> = [];
    try {
      const awsIdentity = await validateAWSCredentials();
      const metadata = await loadConnectionMetadata(
        awsIdentity.accountId,
        region
      );
      if (metadata) {
        trackedDomains = getAllTrackedDomains(metadata);
      }
      // baseline:allow-next-line no-swallowed-errors — metadata unavailable is non-fatal, domains show as unmanaged
    } catch {}

    const trackedSet = new Map(trackedDomains.map((d) => [d.domain, d]));

    progress.stop();

    if (sesDomains.length === 0) {
      clack.outro("No domains found in SES");
      console.log(
        `\nRun ${pc.cyan("wraps email domains add")} to add a domain.\n`
      );
      return;
    }

    // Get detailed info for each domain
    const domainDetails = await Promise.all(
      sesDomains.map(async (domain) => {
        try {
          const details = await sesClient.send(
            new GetEmailIdentityCommand({
              EmailIdentity: domain.IdentityName!,
            })
          );
          return {
            name: domain.IdentityName!,
            verified: details.VerifiedForSendingStatus,
            dkimStatus: details.DkimAttributes?.Status || "PENDING",
          };
        } catch (error) {
          // Non-fatal: return partial info if individual domain detail fetch fails
          return {
            name: domain.IdentityName!,
            verified: false,
            dkimStatus: isAWSNotFoundError(error) ? "UNKNOWN" : "ERROR",
          };
        }
      })
    );

    // Split into managed and unmanaged
    const managed = domainDetails.filter((d) => trackedSet.has(d.name));
    const unmanaged = domainDetails.filter((d) => !trackedSet.has(d.name));

    if (isJsonMode()) {
      trackCommand("email:domains:list", {
        success: true,
        domain_count: sesDomains.length,
        managed_count: managed.length,
      });
      jsonSuccess("email.domains.list", {
        domains: domainDetails.map((d) => {
          const tracked = trackedSet.get(d.name);
          return {
            domain: d.name,
            verified: d.verified,
            dkimStatus: d.dkimStatus,
            managed: !!tracked,
            isPrimary: tracked?.isPrimary ?? false,
            purpose: tracked?.purpose,
            trackingDomain: tracked?.trackingDomain ?? null,
          };
        }),
        totalCount: sesDomains.length,
        managedCount: managed.length,
      });
      return;
    }

    // Format managed domains
    if (managed.length > 0) {
      const managedLines = managed.map((d) => {
        const tracked = trackedSet.get(d.name)!;
        const statusIcon = d.verified ? pc.green("✓") : pc.yellow("⏱");
        const dkimIcon =
          d.dkimStatus === "SUCCESS"
            ? pc.green("✓ SUCCESS")
            : pc.yellow(`⏱ ${d.dkimStatus}`);
        const label = tracked.isPrimary
          ? pc.dim("Primary")
          : pc.dim(PURPOSE_LABELS[tracked.purpose || "other"] || "General");
        const trackingSuffix = tracked.trackingDomain
          ? ` ${pc.dim("→")} ${tracked.trackingDomain}`
          : "";
        return `  ${statusIcon} ${pc.bold(d.name.padEnd(30))} ${label.padEnd(24)} DKIM: ${dkimIcon}${trackingSuffix}`;
      });

      clack.note(managedLines.join("\n"), "Managed by Wraps");
    }

    // Format unmanaged domains
    if (unmanaged.length > 0) {
      const unmanagedLines = unmanaged.map((d) => {
        const statusIcon = d.verified ? pc.green("✓") : pc.yellow("⏱");
        const dkimIcon =
          d.dkimStatus === "SUCCESS"
            ? pc.green("✓ SUCCESS")
            : pc.yellow(`⏱ ${d.dkimStatus}`);
        return `  ${statusIcon} ${pc.bold(d.name.padEnd(30))} ${pc.dim("".padEnd(16))} DKIM: ${dkimIcon}`;
      });

      clack.note(unmanagedLines.join("\n"), "Other SES domains");
    }

    clack.outro(
      pc.dim(
        `Run ${pc.cyan("wraps email domains verify --domain <domain>")} for details`
      )
    );

    // Track list domains success
    trackCommand("email:domains:list", {
      success: true,
      domain_count: sesDomains.length,
      managed_count: managed.length,
    });

    // Show promotional footer (once per session)
    getTelemetryClient().showFooterOnce();
  } catch (error) {
    progress.stop();
    trackCommand("email:domains:list", { success: false });
    throw error;
  }
}

/**
 * Get DKIM tokens for a domain
 */
export async function getDkim(options: { domain: string }): Promise<void> {
  if (!isJsonMode()) {
    clack.intro(pc.bold(`DKIM Tokens for ${options.domain}`));
  }

  const progress = new DeploymentProgress();
  const region = await getAWSRegion();
  const sesClient = new SESv2Client({ region });

  try {
    const identity = await progress.execute(
      "Fetching DKIM configuration",
      async () => {
        const response = await sesClient.send(
          new GetEmailIdentityCommand({ EmailIdentity: options.domain })
        );
        return response;
      }
    );

    const dkimTokens = identity.DkimAttributes?.Tokens || [];
    const dkimStatus = identity.DkimAttributes?.Status || "PENDING";

    progress.stop();

    if (isJsonMode()) {
      trackCommand("email:domains:get-dkim", {
        success: true,
        dkim_status: dkimStatus,
      });
      jsonSuccess("email.domains.get-dkim", {
        domain: options.domain,
        dkimStatus,
        tokens: dkimTokens,
        records: dkimTokens.map((token) => ({
          name: `${token}._domainkey.${options.domain}`,
          type: "CNAME",
          value: `${token}.dkim.amazonses.com`,
        })),
      });
      return;
    }

    if (dkimTokens.length === 0) {
      clack.outro(pc.yellow("No DKIM tokens found for this domain"));
      return;
    }

    // Display DKIM status
    const statusLine = `${pc.bold("DKIM Status:")} ${
      dkimStatus === "SUCCESS"
        ? pc.green("✓ Verified")
        : pc.yellow(`⏱ ${dkimStatus}`)
    }`;
    clack.note(statusLine, "Status");

    // Display DKIM records
    console.log(`\n${pc.bold("DNS Records to add:")}\n`);
    for (const token of dkimTokens) {
      console.log(`${pc.cyan(`${token}._domainkey.${options.domain}`)}`);
      console.log(`  ${pc.dim("Type:")} CNAME`);
      console.log(`  ${pc.dim("Value:")} ${token}.dkim.amazonses.com\n`);
    }

    if (dkimStatus !== "SUCCESS") {
      console.log(
        `${pc.dim("After adding these records, run:")} ${pc.cyan(`wraps email domains verify --domain ${options.domain}`)}\n`
      );
    }

    // Track get-dkim success
    trackCommand("email:domains:get-dkim", {
      success: true,
      dkim_status: dkimStatus,
    });
  } catch (error) {
    progress.stop();
    trackCommand("email:domains:get-dkim", { success: false });
    if (isAWSNotFoundError(error)) {
      clack.log.error(`Domain ${options.domain} not found in SES`);
      console.log(
        `\nRun ${pc.cyan(`wraps email domains add ${options.domain}`)} to add this domain.\n`
      );
      process.exit(1);
      return; // Return after process.exit for testing
    }
    throw error;
  }
}

/**
 * Remove a domain from SES and metadata.
 * Guards against removing the primary (Pulumi-managed) domain without --force.
 */
export async function removeDomain(options: {
  domain: string;
  force?: boolean;
}): Promise<void> {
  if (!isJsonMode()) {
    clack.intro(pc.bold(`Remove domain ${options.domain} from SES`));
  }

  const progress = new DeploymentProgress();
  const region = await getAWSRegion();
  const sesClient = new SESv2Client({ region });

  try {
    // Check if domain exists in SES
    await progress.execute("Checking if domain exists", async () => {
      await sesClient.send(
        new GetEmailIdentityCommand({ EmailIdentity: options.domain })
      );
    });

    // Check metadata to see if this is the primary domain
    let metadata: Awaited<ReturnType<typeof loadConnectionMetadata>> = null;
    try {
      const awsIdentity = await validateAWSCredentials();
      metadata = await loadConnectionMetadata(awsIdentity.accountId, region);
      // baseline:allow-next-line no-swallowed-errors — metadata unavailable is non-fatal, proceed without guard
    } catch {}

    let domainInfo: ReturnType<typeof getDomainFromMetadata> = null;
    if (metadata) {
      domainInfo = getDomainFromMetadata(metadata, options.domain);

      if (domainInfo?.isPrimary && !options.force) {
        progress.stop();
        clack.log.error(
          `${options.domain} is the primary domain (managed by Pulumi).`
        );
        console.log(
          `\nUse ${pc.cyan(`wraps email domains remove --domain ${options.domain} --force`)} to remove it,`
        );
        console.log(
          `or ${pc.cyan("wraps email destroy")} to remove all email infrastructure.\n`
        );
        process.exit(1);
        return;
      }
    }

    const trackingDistributionId =
      domainInfo?.entry?.trackingHttps?.distributionId;
    if (trackingDistributionId) {
      try {
        await progress.execute(
          "Disabling tracking CloudFront distribution",
          async () => disableDistribution(trackingDistributionId)
        );
        if (!isJsonMode()) {
          console.log(
            `\n${pc.dim(`Distribution ${trackingDistributionId} is disabled; delete it from the CloudFront console once it shows Deployed (10-15 min). Certificate ${domainInfo?.entry?.trackingHttps?.certificateArn} can then be deleted in ACM (us-east-1).`)}`
          );
        }
        // baseline:allow-next-line no-swallowed-errors — a CloudFront disable failure must not block domain removal
      } catch (error) {
        clack.log.warn(
          `Could not disable the tracking CloudFront distribution: ${describeTrackingHttpsError(error)}`
        );
      }
    }

    progress.stop();

    // Confirm deletion
    if (!options.force) {
      const shouldContinue = await clack.confirm({
        message: `Are you sure you want to remove ${pc.red(options.domain)} from SES?`,
        initialValue: false,
      });

      if (clack.isCancel(shouldContinue) || !shouldContinue) {
        clack.cancel("Operation cancelled");
        process.exit(0);
      }
    }

    // Delete the identity
    const { DeleteEmailIdentityCommand } = await import(
      "@aws-sdk/client-sesv2"
    );
    await progress.execute("Removing domain from SES", async () => {
      await sesClient.send(
        new DeleteEmailIdentityCommand({
          EmailIdentity: options.domain,
        })
      );
    });

    // Remove from metadata
    if (metadata) {
      removeDomainFromMetadata(metadata, options.domain);
      await saveConnectionMetadata(metadata);
    }

    progress.stop();

    // Track remove domain success
    trackCommand("email:domains:remove", {
      success: true,
    });
    trackFeature("domain_removed", {});

    if (isJsonMode()) {
      jsonSuccess("email.domains.remove", {
        domain: options.domain,
        removed: true,
      });
      return;
    }

    clack.outro(pc.green(`✓ Domain ${options.domain} removed successfully`));
  } catch (error) {
    progress.stop();
    trackCommand("email:domains:remove", { success: false });
    if (isAWSNotFoundError(error)) {
      clack.log.error(`Domain ${options.domain} not found in SES`);
      process.exit(1);
      return;
    }
    throw error;
  }
}

export { configDomain } from "./config-domain.js";
