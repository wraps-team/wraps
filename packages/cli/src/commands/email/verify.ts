import { Resolver } from "node:dns/promises";
import { GetEmailIdentityCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import type { VerifyOptions } from "../../types/index.js";
import { getAWSRegion } from "../../utils/shared/aws.js";
import { DeploymentProgress } from "../../utils/shared/output.js";

/**
 * Verify command - Check domain DNS records and verification status
 */
export async function verify(options: VerifyOptions): Promise<void> {
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
      `\nRun ${pc.cyan(`wraps init --domain ${options.domain}`)} to add this domain.\n`
    );
    process.exit(1);
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
      `\nRun ${pc.cyan("wraps status")} to see the correct DNS records.\n`
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
