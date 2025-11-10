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
  tableName?: string;
  dnsAutoCreated?: boolean;
  domain?: string;
  customTrackingDomain?: string;
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
    }

    // Add custom tracking domain CNAME if provided and not auto-created
    if (outputs.customTrackingDomain && !outputs.dnsAutoCreated) {
      dnsLines.push(
        "",
        pc.bold("Tracking Domain (CNAME):"),
        `  ${pc.cyan(outputs.customTrackingDomain)} ${pc.dim("CNAME")} "feedback-id.${outputs.region}.amazonses.com"`
      );
    }

    clack.note(dnsLines.join("\n"), "DNS Records to add:");

    console.log(
      `\n${pc.dim("Run:")} ${pc.yellow(`wraps verify --domain ${domain}`)} ${pc.dim(
        "(after DNS propagates)"
      )}\n`
    );
  }

  // Show tracking domain separately if we only have tracking domain (no other DNS records)
  if (
    outputs.customTrackingDomain &&
    !outputs.dnsAutoCreated &&
    (!outputs.dnsRecords || outputs.dnsRecords.length === 0)
  ) {
    const trackingLines = [
      pc.bold("Tracking Domain (CNAME):"),
      `  ${pc.cyan(outputs.customTrackingDomain)} ${pc.dim("CNAME")} "feedback-id.${outputs.region}.amazonses.com"`,
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
  }>;
  resources: {
    roleArn?: string;
    configSetName?: string;
    tableName?: string;
    lambdaFunctions?: number;
    snsTopics?: number;
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
      return `    ${d.domain} ${statusColor(`${statusIcon} ${d.status}`)}`;
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

  clack.note(resourceLines.join("\n"), "Resources");

  // Show DNS records for pending domains
  const pendingDomains = status.domains.filter(
    (d) => d.status === "pending" && d.dkimTokens
  );
  if (pendingDomains.length > 0) {
    for (const domain of pendingDomains) {
      if (domain.dkimTokens && domain.dkimTokens.length > 0) {
        const dnsLines = [
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
          `  ${pc.cyan(`_dmarc.${domain.domain}`)} ${pc.dim("TXT")} "v=DMARC1; p=quarantine; rua=mailto:postmaster@${domain.domain}"`,
        ];

        clack.note(dnsLines.join("\n"), `DNS Records for ${domain.domain}`);
      }
    }

    // Show verify command with first pending domain as example
    const exampleDomain = pendingDomains[0].domain;
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
