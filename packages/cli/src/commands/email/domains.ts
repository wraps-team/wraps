import { Resolver } from "node:dns/promises";
import { GetEmailIdentityCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import type { EmailVerifyOptions } from "../../types/index.js";
import { getAWSRegion } from "../../utils/shared/aws.js";
import { DeploymentProgress } from "../../utils/shared/output.js";

/**
 * Verify domain DNS records and verification status
 */
export async function verifyDomain(options: EmailVerifyOptions): Promise<void> {
  clack.intro(pc.bold(`Verifying ${options.domain}`));

  const progress = new DeploymentProgress();
  const region = await getAWSRegion();

  // 1. Check SES verification status
  const sesClient = new SESv2Client({ region });
  let identity;
  let dkimTokens: string[] = [];
  let mailFromDomain: string | undefined;

  try {
    identity = await progress.execute(
      "Checking SES verification status",
      async () => {
        const response = await sesClient.send(
          new GetEmailIdentityCommand({ EmailIdentity: options.domain })
        );
        return response;
      }
    );

    dkimTokens = identity.DkimAttributes?.Tokens || [];
    mailFromDomain = identity.MailFromAttributes?.MailFromDomain;
  } catch (_error: any) {
    progress.stop();
    clack.log.error(`Domain ${options.domain} not found in SES`);
    console.log(
      `\nRun ${pc.cyan(`wraps email init --domain ${options.domain}`)} to add this domain.\n`
    );
    process.exit(1);
    return; // Return after process.exit for testing
  }

  // 2. Check DNS records
  const resolver = new Resolver();
  // Use public DNS servers for more reliable results
  resolver.setServers(["8.8.8.8", "1.1.1.1"]);
  const dnsResults: Array<{
    name: string;
    type: string;
    status: string;
    records?: string[];
  }> = [];

  // Check DKIM records
  for (const token of dkimTokens) {
    const dkimRecord = `${token}._domainkey.${options.domain}`;
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
    } catch (_error) {
      dnsResults.push({
        name: dkimRecord,
        type: "CNAME",
        status: "missing",
      });
    }
  }

  // Check SPF record
  try {
    const records = await resolver.resolveTxt(options.domain);
    const spfRecord = records.flat().find((r) => r.startsWith("v=spf1"));
    const hasAmazonSES = spfRecord?.includes("include:amazonses.com");
    dnsResults.push({
      name: options.domain,
      type: "TXT (SPF)",
      status: hasAmazonSES ? "verified" : spfRecord ? "incorrect" : "missing",
      records: spfRecord ? [spfRecord] : undefined,
    });
  } catch (_error) {
    dnsResults.push({
      name: options.domain,
      type: "TXT (SPF)",
      status: "missing",
    });
  }

  // Check DMARC record
  try {
    const records = await resolver.resolveTxt(`_dmarc.${options.domain}`);
    const dmarcRecord = records.flat().find((r) => r.startsWith("v=DMARC1"));
    dnsResults.push({
      name: `_dmarc.${options.domain}`,
      type: "TXT (DMARC)",
      status: dmarcRecord ? "verified" : "missing",
      records: dmarcRecord ? [dmarcRecord] : undefined,
    });
  } catch (_error) {
    dnsResults.push({
      name: `_dmarc.${options.domain}`,
      type: "TXT (DMARC)",
      status: "missing",
    });
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
    } catch (_error) {
      dnsResults.push({
        name: mailFromDomain,
        type: "MX",
        status: "missing",
      });
    }

    // Check SPF record for MAIL FROM domain
    try {
      const records = await resolver.resolveTxt(mailFromDomain);
      const spfRecord = records.flat().find((r) => r.startsWith("v=spf1"));
      const hasAmazonSES = spfRecord?.includes("include:amazonses.com");
      dnsResults.push({
        name: mailFromDomain,
        type: "TXT (SPF)",
        status: hasAmazonSES ? "verified" : spfRecord ? "incorrect" : "missing",
        records: spfRecord ? [spfRecord] : undefined,
      });
    } catch (_error) {
      dnsResults.push({
        name: mailFromDomain,
        type: "TXT (SPF)",
        status: "missing",
      });
    }
  }

  progress.stop();

  // 3. Display results
  const verificationStatus = identity.VerifiedForSendingStatus
    ? "verified"
    : "pending";
  const dkimStatus = identity.DkimAttributes?.Status || "PENDING";
  const mailFromStatus =
    identity.MailFromAttributes?.MailFromDomainStatus || "NOT_CONFIGURED";

  const statusLines = [
    `${pc.bold("Domain:")} ${options.domain}`,
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

  // Summary
  const allVerified = dnsResults.every((r) => r.status === "verified");
  const someIncorrect = dnsResults.some((r) => r.status === "incorrect");

  if (verificationStatus === "verified" && allVerified) {
    clack.outro(
      pc.green("✓ Domain is fully verified and ready to send emails!")
    );
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
      "SES verification usually completes within 72 hours after DNS propagation.\n"
    );
  }
}

/**
 * Add a domain to SES for email sending
 */
export async function addDomain(options: { domain: string }): Promise<void> {
  clack.intro(pc.bold(`Adding domain ${options.domain} to SES`));

  const progress = new DeploymentProgress();
  const region = await getAWSRegion();
  const sesClient = new SESv2Client({ region });

  try {
    // Check if domain already exists
    try {
      await sesClient.send(
        new GetEmailIdentityCommand({ EmailIdentity: options.domain })
      );
      progress.stop();
      clack.log.warn(`Domain ${options.domain} already exists in SES`);
      console.log(
        `\nRun ${pc.cyan(`wraps email domains verify --domain ${options.domain}`)} to check verification status.\n`
      );
      return;
    } catch (error: any) {
      // Domain doesn't exist, continue with creation
      if (error.name !== "NotFoundException") {
        throw error;
      }
    }

    // Create the email identity
    const { CreateEmailIdentityCommand } = await import(
      "@aws-sdk/client-sesv2"
    );
    await progress.execute("Adding domain to SES", async () => {
      await sesClient.send(
        new CreateEmailIdentityCommand({
          EmailIdentity: options.domain,
          DkimSigningAttributes: {
            NextSigningKeyLength: "RSA_2048_BIT",
          },
        })
      );
    });

    // Get the DKIM tokens
    const identity = await sesClient.send(
      new GetEmailIdentityCommand({ EmailIdentity: options.domain })
    );
    const dkimTokens = identity.DkimAttributes?.Tokens || [];

    progress.stop();

    clack.outro(pc.green(`✓ Domain ${options.domain} added successfully!`));

    // Show next steps
    console.log(`\n${pc.bold("Next steps:")}\n`);
    console.log("1. Add the following DKIM records to your DNS:\n");

    for (const token of dkimTokens) {
      console.log(`   ${pc.cyan(`${token}._domainkey.${options.domain}`)}`);
      console.log(
        `   ${pc.dim("Type:")} CNAME  ${pc.dim("Value:")} ${token}.dkim.amazonses.com\n`
      );
    }

    console.log(
      `2. Verify DNS propagation: ${pc.cyan(`wraps email domains verify --domain ${options.domain}`)}`
    );
    console.log(`3. Check status: ${pc.cyan("wraps email status")}\n`);
  } catch (error: any) {
    progress.stop();
    throw error;
  }
}

/**
 * List all domains configured in SES
 */
export async function listDomains(): Promise<void> {
  clack.intro(pc.bold("SES Email Domains"));

  const progress = new DeploymentProgress();
  const region = await getAWSRegion();
  const sesClient = new SESv2Client({ region });

  try {
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
    const domains = identities.filter(
      (identity) =>
        identity.IdentityType === "DOMAIN" ||
        (identity.IdentityName && !identity.IdentityName.includes("@"))
    );

    progress.stop();

    if (domains.length === 0) {
      clack.outro("No domains found in SES");
      console.log(
        `\nRun ${pc.cyan("wraps email domains add <domain>")} to add a domain.\n`
      );
      return;
    }

    // Get detailed info for each domain
    const domainDetails = await Promise.all(
      domains.map(async (domain) => {
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
        } catch {
          return {
            name: domain.IdentityName!,
            verified: false,
            dkimStatus: "UNKNOWN",
          };
        }
      })
    );

    // Display domains in a formatted table
    const domainLines = domainDetails.map((domain) => {
      const statusIcon = domain.verified ? pc.green("✓") : pc.yellow("⏱");
      const dkimIcon =
        domain.dkimStatus === "SUCCESS" ? pc.green("✓") : pc.yellow("⏱");
      return `  ${statusIcon} ${pc.bold(domain.name)}  DKIM: ${dkimIcon} ${domain.dkimStatus}`;
    });

    clack.note(
      domainLines.join("\n"),
      `${domains.length} domain(s) in ${region}`
    );
    clack.outro(
      pc.dim(
        `Run ${pc.cyan("wraps email domains verify --domain <domain>")} for details`
      )
    );
  } catch (error: any) {
    progress.stop();
    throw error;
  }
}

/**
 * Get DKIM tokens for a domain
 */
export async function getDkim(options: { domain: string }): Promise<void> {
  clack.intro(pc.bold(`DKIM Tokens for ${options.domain}`));

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
  } catch (error: any) {
    progress.stop();
    if (error.name === "NotFoundException") {
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
 * Remove a domain from SES
 */
export async function removeDomain(options: {
  domain: string;
  force?: boolean; // Destructive operation
}): Promise<void> {
  clack.intro(pc.bold(`Remove domain ${options.domain} from SES`));

  const progress = new DeploymentProgress();
  const region = await getAWSRegion();
  const sesClient = new SESv2Client({ region });

  try {
    // Check if domain exists
    await progress.execute("Checking if domain exists", async () => {
      await sesClient.send(
        new GetEmailIdentityCommand({ EmailIdentity: options.domain })
      );
    });

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

    progress.stop();
    clack.outro(pc.green(`✓ Domain ${options.domain} removed successfully`));
  } catch (error: any) {
    progress.stop();
    if (error.name === "NotFoundException") {
      clack.log.error(`Domain ${options.domain} not found in SES`);
      process.exit(1);
      return; // Return after process.exit for testing
    }
    throw error;
  }
}
