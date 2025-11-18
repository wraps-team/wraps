import * as clack from "@clack/prompts";
import pc from "picocolors";

/**
 * Deployment progress tracker with spinners using clack
 */
export class DeploymentProgress {
  private currentSpinner: ReturnType<typeof clack.spinner> | null = null;

  /**
   * Start a spinner with a message
   */
  start(message: string) {
    this.currentSpinner = clack.spinner();
    this.currentSpinner.start(message);
  }

  /**
   * Mark current step as succeeded
   */
  succeed(message: string) {
    if (this.currentSpinner) {
      this.currentSpinner.stop(message);
    }
    clack.log.success(message);
  }

  /**
   * Mark current step as failed
   */
  fail(message: string) {
    if (this.currentSpinner) {
      this.currentSpinner.stop(message);
    }
    clack.log.error(message);
  }

  /**
   * Show info message
   */
  info(message: string) {
    clack.log.info(message);
  }

  /**
   * Show step message
   */
  step(message: string) {
    clack.log.step(message);
  }

  /**
   * Execute a step with automatic spinner handling
   */
  async execute<T>(message: string, fn: () => Promise<T>): Promise<T> {
    this.start(message);
    try {
      const result = await fn();
      this.succeed(message);
      return result;
    } catch (error) {
      this.fail(message);
      throw error;
    }
  }

  /**
   * Stop the spinner
   */
  stop(message?: string) {
    if (this.currentSpinner) {
      this.currentSpinner.stop(message || "");
    }
  }
}

/**
 * DNS record type
 */
export type DNSRecord = {
  name: string;
  type: string;
  value: string;
};

/**
 * Success output configuration
 */
export type SuccessOutputs = {
  roleArn: string;
  configSetName?: string;
  region: string;
  dnsRecords?: DNSRecord[];
  trackingDomainDnsRecords?: DNSRecord[];
  tableName?: string;
  dnsAutoCreated?: boolean;
  domain?: string;
  customTrackingDomain?: string;
  mailFromDomain?: string;
};

/**
 * Display success message with infrastructure outputs
 */
export function displaySuccess(outputs: SuccessOutputs) {
  const lines = [
    "",
    pc.bold("Role ARN:"),
    `  ${pc.cyan(outputs.roleArn)}`,
    "",
    `${pc.bold("Region:")} ${pc.cyan(outputs.region)}`,
  ];

  if (outputs.configSetName) {
    lines.push(`${pc.bold("Config Set:")} ${pc.cyan(outputs.configSetName)}`);
  }

  if (outputs.tableName) {
    lines.push(`${pc.bold("DynamoDB Table:")} ${pc.cyan(outputs.tableName)}`);
  }

  lines.push(
    "",
    pc.bold("Next steps:"),
    `  1. Install SDK: ${pc.yellow("npm install @wraps/sdk")}`,
    `  2. View dashboard: ${pc.blue("https://dashboard.wraps.dev")}`,
    ""
  );

  clack.outro(pc.green("Email infrastructure deployed successfully!"));
  console.log(lines.join("\n"));

  // Show DNS auto-creation message
  if (outputs.dnsAutoCreated && outputs.domain) {
    clack.note(
      `DNS records (DKIM, SPF, DMARC) were automatically created in Route53 for ${pc.cyan(
        outputs.domain
      )}.\n\nVerification should complete within a few minutes.`,
      pc.green("✓ DNS Auto-Configured")
    );
  }

  if (outputs.dnsRecords && outputs.dnsRecords.length > 0) {
    // Extract domain from first DKIM record
    const domain = outputs.dnsRecords[0]?.name.split("._domainkey.")[1];

    const dnsLines = [
      pc.bold("DKIM Records (CNAME):"),
      ...outputs.dnsRecords.map(
        (record) =>
          `  ${pc.cyan(record.name)} ${pc.dim(record.type)} "${record.value}"`
      ),
    ];

    if (domain) {
      dnsLines.push(
        "",
        pc.bold("SPF Record (TXT):"),
        `  ${pc.cyan(domain)} ${pc.dim("TXT")} "v=spf1 include:amazonses.com ~all"`,
        "",
        pc.bold("DMARC Record (TXT):"),
        `  ${pc.cyan(`_dmarc.${domain}`)} ${pc.dim("TXT")} "v=DMARC1; p=quarantine; rua=mailto:postmaster@${domain}"`
      );

      // Add MAIL FROM domain DNS records if configured
      if (outputs.mailFromDomain) {
        dnsLines.push(
          "",
          pc.bold("MAIL FROM Domain Records (for DMARC alignment):"),
          `  ${pc.cyan(outputs.mailFromDomain)} ${pc.dim("MX")} "10 feedback-smtp.${outputs.region}.amazonses.com"`,
          `  ${pc.cyan(outputs.mailFromDomain)} ${pc.dim("TXT")} "v=spf1 include:amazonses.com ~all"`
        );
      }
    }

    clack.note(dnsLines.join("\n"), "DNS Records to add:");
  }

  // Show tracking domain DNS records if custom tracking domain is configured
  if (
    outputs.trackingDomainDnsRecords &&
    outputs.trackingDomainDnsRecords.length > 0
  ) {
    const trackingDnsLines = [
      pc.bold("Custom Tracking Domain - Redirect CNAME:"),
      ...outputs.trackingDomainDnsRecords.map(
        (record) =>
          `  ${pc.cyan(record.name)} ${pc.dim(record.type)} "${record.value}"`
      ),
      "",
      pc.dim(
        "Note: This CNAME allows SES to rewrite links in your emails to use"
      ),
      pc.dim("your custom domain for open and click tracking."),
    ];

    clack.note(
      trackingDnsLines.join("\n"),
      "Custom Tracking Domain DNS Records:"
    );

    if (outputs.customTrackingDomain) {
      console.log(
        `\n${pc.dim("Run:")} ${pc.yellow(`wraps verify --domain ${outputs.customTrackingDomain}`)} ${pc.dim(
          "(after DNS propagates)"
        )}\n`
      );
    }
  }

  // Show tracking domain separately if we only have tracking domain (no other DNS records)
  if (
    outputs.customTrackingDomain &&
    !outputs.dnsAutoCreated &&
    (!outputs.dnsRecords || outputs.dnsRecords.length === 0) &&
    (!outputs.trackingDomainDnsRecords ||
      outputs.trackingDomainDnsRecords.length === 0)
  ) {
    const trackingLines = [
      pc.bold("Tracking Domain (CNAME):"),
      `  ${pc.cyan(outputs.customTrackingDomain)} ${pc.dim("CNAME")} "r.${outputs.region}.awstrack.me"`,
      "",
      pc.dim(
        "Note: This CNAME allows SES to rewrite links in your emails to use"
      ),
      pc.dim("your custom domain for open and click tracking."),
    ];

    clack.note(trackingLines.join("\n"), "DNS Record to add:");
  }
}

/**
 * Status output configuration
 */
export type StatusOutputs = {
  integrationLevel: "dashboard-only" | "enhanced";
  region: string;
  domains: Array<{
    domain: string;
    status: "verified" | "pending" | "failed";
    dkimTokens?: string[];
    mailFromDomain?: string;
    mailFromStatus?: string;
  }>;
  resources: {
    roleArn?: string;
    configSetName?: string;
    tableName?: string;
    lambdaFunctions?: number;
    snsTopics?: number;
    archiveArn?: string;
    archivingEnabled?: boolean;
    archiveRetention?: string;
  };
};

/**
 * Display status information
 */
export function displayStatus(status: StatusOutputs) {
  clack.intro(pc.bold("Wraps Email Infrastructure"));

  const infoLines = [
    `${pc.bold("Integration:")} ${pc.cyan(status.integrationLevel)}`,
    `${pc.bold("Region:")} ${pc.cyan(status.region)}`,
  ];

  if (status.domains.length > 0) {
    const domainStrings = status.domains.map((d) => {
      const statusIcon =
        d.status === "verified" ? "✓" : d.status === "pending" ? "⏱" : "✗";
      const statusColor =
        d.status === "verified"
          ? pc.green
          : d.status === "pending"
            ? pc.yellow
            : pc.red;

      let domainLine = `    ${d.domain} ${statusColor(`${statusIcon} ${d.status}`)}`;

      // Add MAIL FROM domain info if configured
      if (d.mailFromDomain) {
        const mailFromStatusIcon = d.mailFromStatus === "SUCCESS" ? "✓" : "⏱";
        const mailFromColor =
          d.mailFromStatus === "SUCCESS" ? pc.green : pc.yellow;
        domainLine += `\n      ${pc.dim("MAIL FROM:")} ${d.mailFromDomain} ${mailFromColor(mailFromStatusIcon)}`;
      }

      return domainLine;
    });
    infoLines.push(`${pc.bold("Domains:")}\n${domainStrings.join("\n")}`);
  }

  clack.note(infoLines.join("\n"), "Configuration");

  // Features
  const featureLines = [];
  featureLines.push(`  ${pc.green("✓")} Email Sending ${pc.dim("(via SES)")}`);

  if (status.resources.tableName) {
    featureLines.push(
      `  ${pc.green("✓")} Email Tracking ${pc.dim("(DynamoDB logs)")}`
    );
  } else {
    featureLines.push(
      `  ${pc.dim("○")} Email Tracking ${pc.dim("(run 'wraps upgrade' to enable)")}`
    );
  }

  if (
    status.resources.lambdaFunctions &&
    status.resources.lambdaFunctions > 0
  ) {
    featureLines.push(
      `  ${pc.green("✓")} Bounce/Complaint Handling ${pc.dim("(automated)")}`
    );
  } else {
    featureLines.push(
      `  ${pc.dim("○")} Bounce/Complaint Handling ${pc.dim("(run 'wraps upgrade' to enable)")}`
    );
  }

  // Email Archiving
  if (status.resources.archivingEnabled) {
    const retentionLabel =
      {
        "7days": "7 days",
        "30days": "30 days",
        "90days": "90 days",
        "6months": "6 months",
        "1year": "1 year",
        "18months": "18 months",
      }[status.resources.archiveRetention || "90days"] || "90 days";
    featureLines.push(
      `  ${pc.green("✓")} Email Archiving ${pc.dim(`(${retentionLabel} retention)`)}`
    );
  } else {
    featureLines.push(
      `  ${pc.dim("○")} Email Archiving ${pc.dim("(run 'wraps upgrade' to enable)")}`
    );
  }

  featureLines.push(
    `  ${pc.green("✓")} Console Dashboard ${pc.dim("(run 'wraps console')")}`
  );

  clack.note(featureLines.join("\n"), "Features");

  // Resources
  const resourceLines = [];

  if (status.resources.roleArn) {
    resourceLines.push(
      `  ${pc.green("✓")} IAM Role: ${pc.cyan(status.resources.roleArn)}`
    );
  }

  if (status.resources.configSetName) {
    resourceLines.push(
      `  ${pc.green("✓")} Configuration Set: ${pc.cyan(status.resources.configSetName)}`
    );
  }

  if (status.resources.tableName) {
    resourceLines.push(
      `  ${pc.green("✓")} DynamoDB Table: ${pc.cyan(status.resources.tableName)}`
    );
  }

  if (status.resources.lambdaFunctions) {
    resourceLines.push(
      `  ${pc.green("✓")} Lambda Functions: ${pc.cyan(
        `${status.resources.lambdaFunctions} deployed`
      )}`
    );
  }

  if (status.resources.snsTopics) {
    resourceLines.push(
      `  ${pc.green("✓")} SNS Topics: ${pc.cyan(`${status.resources.snsTopics} configured`)}`
    );
  }

  if (status.resources.archiveArn) {
    resourceLines.push(
      `  ${pc.green("✓")} Mail Manager Archive: ${pc.cyan(status.resources.archiveArn)}`
    );
  }

  clack.note(resourceLines.join("\n"), "Resources");

  // Show DNS records for pending domains OR domains with pending MAIL FROM
  const domainsNeedingDNS = status.domains.filter(
    (d) =>
      (d.status === "pending" && d.dkimTokens) ||
      (d.mailFromDomain && d.mailFromStatus !== "SUCCESS")
  );
  if (domainsNeedingDNS.length > 0) {
    for (const domain of domainsNeedingDNS) {
      const dnsLines = [];

      // DKIM records (only for pending domains)
      if (
        domain.status === "pending" &&
        domain.dkimTokens &&
        domain.dkimTokens.length > 0
      ) {
        dnsLines.push(
          pc.bold("DKIM Records (CNAME):"),
          ...domain.dkimTokens.map(
            (token) =>
              `  ${pc.cyan(`${token}._domainkey.${domain.domain}`)} ${pc.dim("CNAME")} "${token}.dkim.amazonses.com"`
          ),
          "",
          pc.bold("SPF Record (TXT):"),
          `  ${pc.cyan(domain.domain)} ${pc.dim("TXT")} "v=spf1 include:amazonses.com ~all"`,
          "",
          pc.bold("DMARC Record (TXT):"),
          `  ${pc.cyan(`_dmarc.${domain.domain}`)} ${pc.dim("TXT")} "v=DMARC1; p=quarantine; rua=mailto:postmaster@${domain.domain}"`
        );
      }

      // MAIL FROM records (if configured but not verified)
      if (domain.mailFromDomain && domain.mailFromStatus !== "SUCCESS") {
        if (dnsLines.length > 0) {
          dnsLines.push("");
        }
        dnsLines.push(
          pc.bold("MAIL FROM Domain Records (for DMARC alignment):"),
          `  ${pc.cyan(domain.mailFromDomain)} ${pc.dim("MX")} "10 feedback-smtp.${status.region}.amazonses.com"`,
          `  ${pc.cyan(domain.mailFromDomain)} ${pc.dim("TXT")} "v=spf1 include:amazonses.com ~all"`
        );
      }

      if (dnsLines.length > 0) {
        clack.note(dnsLines.join("\n"), `DNS Records for ${domain.domain}`);
      }
    }

    // Show verify command with first domain needing DNS as example
    const exampleDomain = domainsNeedingDNS[0].domain;
    console.log(
      `\n${pc.dim("Run:")} ${pc.yellow(`wraps verify --domain ${exampleDomain}`)} ${pc.dim(
        "(after DNS propagates)"
      )}\n`
    );
  }

  console.log(
    `\n${pc.bold("Dashboard:")} ${pc.blue("https://dashboard.wraps.dev")}`
  );
  console.log(`${pc.bold("Docs:")} ${pc.blue("https://docs.wraps.dev")}\n`);
}
