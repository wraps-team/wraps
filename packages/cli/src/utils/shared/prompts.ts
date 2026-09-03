import * as clack from "@clack/prompts";
import { ALL_EVENT_TYPES } from "@wraps/core";
import pc from "picocolors";
import type {
  ArchiveRetention,
  DomainPurpose,
  SESEventType,
} from "../../types/index.js";
import { errors } from "./errors.js";
import { isJsonMode } from "./json-output.js";

/**
 * BOUNCE and COMPLAINT are never offered as choices in the event-type
 * prompts (here and in `commands/email/upgrade.ts`) — they're always
 * included in the result. See `validateEventTypes` in
 * `infrastructure/resources/ses.ts` for the deploy-time backstop; the
 * prompts just make the invalid combination impossible to select in the
 * first place. Exported so every event-type prompt shares one list rather
 * than each keeping its own copy.
 */
export const REQUIRED_SUPPRESSION_EVENT_TYPES: SESEventType[] = [
  "BOUNCE",
  "COMPLAINT",
];

/**
 * Display labels for the optional (non-suppression) SES event types offered
 * in event-type prompts.
 */
export const OPTIONAL_EVENT_TYPE_LABELS: Partial<Record<SESEventType, string>> =
  {
    SEND: "Send — email accepted by SES",
    DELIVERY: "Delivery — delivered to recipient's mail server",
    OPEN: "Open — recipient opened the email",
    CLICK: "Click — recipient clicked a tracked link",
    REJECT: "Reject — SES rejected the email (virus, policy)",
    RENDERING_FAILURE: "Rendering Failure — template rendering failed",
    DELIVERY_DELAY: "Delivery Delay — temporary delivery issue, SES will retry",
    SUBSCRIPTION: "Subscription — recipient changed subscription preferences",
  };

/**
 * Is the current process attached to an interactive terminal?
 *
 * Clack's `select()` hangs silently when called without a TTY (e.g., CI,
 * scripted pipes). Call this before any interactive prompt and throw a
 * region-required error instead of hanging. The CI env var catches cases
 * where TTYs are inherited through wrappers.
 */
export function isInteractive(): boolean {
  return (
    process.stdin.isTTY === true &&
    process.stdout.isTTY === true &&
    !process.env.CI
  );
}

/**
 * Guard for every interactive prompt in this file (and any raw `clack.*`
 * call in a command file). Throws a machine-readable `NON_INTERACTIVE_INPUT`
 * error naming the flag that supplies the value instead of letting Clack
 * hang silently without a TTY, or corrupting `--json` stdout with prompt
 * output. Call this BEFORE any spinner/log output so JSON stdout stays
 * clean, and before the `clack.*` call itself.
 */
export function ensureInteractive(what: string, flagHint: string): void {
  if (!isInteractive() || isJsonMode()) {
    throw errors.nonInteractiveInput(what, flagHint);
  }
}

/**
 * Hosting provider type
 */
export type Provider = "vercel" | "aws" | "railway" | "other";

/**
 * DNS provider type for automatic DNS record management
 */
export type DNSProviderType = "route53" | "vercel" | "cloudflare" | "manual";

/**
 * Prompt for hosting provider
 */
export async function promptProvider(): Promise<Provider> {
  ensureInteractive("Provider", "--provider <vercel|aws|railway|other>");

  const provider = await clack.select({
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

  if (clack.isCancel(provider)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return provider as Provider;
}

/**
 * Prompt for AWS region
 */
export async function promptRegion(defaultRegion: string): Promise<string> {
  ensureInteractive("Region", "--region <aws-region>");

  const region = await clack.select({
    message: "Select AWS region:",
    options: [
      { value: "us-east-1", label: "US East (N. Virginia)", hint: "us-east-1" },
      { value: "us-east-2", label: "US East (Ohio)", hint: "us-east-2" },
      {
        value: "us-west-1",
        label: "US West (N. California)",
        hint: "us-west-1",
      },
      { value: "us-west-2", label: "US West (Oregon)", hint: "us-west-2" },
      { value: "af-south-1", label: "Africa (Cape Town)", hint: "af-south-1" },
      {
        value: "ap-east-1",
        label: "Asia Pacific (Hong Kong)",
        hint: "ap-east-1",
      },
      {
        value: "ap-south-1",
        label: "Asia Pacific (Mumbai)",
        hint: "ap-south-1",
      },
      {
        value: "ap-northeast-1",
        label: "Asia Pacific (Tokyo)",
        hint: "ap-northeast-1",
      },
      {
        value: "ap-northeast-2",
        label: "Asia Pacific (Seoul)",
        hint: "ap-northeast-2",
      },
      {
        value: "ap-northeast-3",
        label: "Asia Pacific (Osaka)",
        hint: "ap-northeast-3",
      },
      {
        value: "ap-southeast-1",
        label: "Asia Pacific (Singapore)",
        hint: "ap-southeast-1",
      },
      {
        value: "ap-southeast-2",
        label: "Asia Pacific (Sydney)",
        hint: "ap-southeast-2",
      },
      {
        value: "ap-southeast-3",
        label: "Asia Pacific (Jakarta)",
        hint: "ap-southeast-3",
      },
      {
        value: "ca-central-1",
        label: "Canada (Central)",
        hint: "ca-central-1",
      },
      {
        value: "eu-central-1",
        label: "Europe (Frankfurt)",
        hint: "eu-central-1",
      },
      { value: "eu-west-1", label: "Europe (Ireland)", hint: "eu-west-1" },
      { value: "eu-west-2", label: "Europe (London)", hint: "eu-west-2" },
      { value: "eu-west-3", label: "Europe (Paris)", hint: "eu-west-3" },
      { value: "eu-south-1", label: "Europe (Milan)", hint: "eu-south-1" },
      { value: "eu-north-1", label: "Europe (Stockholm)", hint: "eu-north-1" },
      {
        value: "me-south-1",
        label: "Middle East (Bahrain)",
        hint: "me-south-1",
      },
      {
        value: "sa-east-1",
        label: "South America (São Paulo)",
        hint: "sa-east-1",
      },
    ],
    initialValue: defaultRegion || "us-east-1",
  });

  if (clack.isCancel(region)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return region as string;
}

/**
 * Prompt for domain to verify (optional)
 */
export async function promptDomain(): Promise<string> {
  ensureInteractive("Domain", "--domain <domain>");

  const domain = await clack.text({
    message: "Domain to verify (optional):",
    placeholder: "myapp.com",
    validate: (value) => {
      if (!value) {
        return; // Optional
      }
      if (!value.includes(".")) {
        return "Please enter a valid domain (e.g., myapp.com)";
      }
    },
  });

  if (clack.isCancel(domain)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return domain || "";
}

/**
 * Vercel configuration
 */
export type VercelConfig = {
  teamSlug: string;
  projectName: string;
};

/**
 * Prompt for Vercel configuration
 */
export async function promptVercelConfig(): Promise<VercelConfig> {
  ensureInteractive(
    "Vercel configuration",
    "--provider aws (or interactive run)"
  );

  const config = await clack.group(
    {
      teamSlug: () =>
        clack.text({
          message: "Vercel team slug:",
          placeholder: "my-team",
          validate: (value) => {
            if (!value) {
              return "Team slug is required for Vercel integration";
            }
          },
        }),
      projectName: () =>
        clack.text({
          message: "Vercel project name:",
          placeholder: "my-project",
          validate: (value) => {
            if (!value) {
              return "Project name is required";
            }
          },
        }),
    },
    {
      onCancel: () => {
        clack.cancel("Operation cancelled.");
        process.exit(0);
      },
    }
  );

  return config as VercelConfig;
}

/**
 * Prompt for integration level
 */
export async function promptIntegrationLevel(): Promise<
  "dashboard-only" | "enhanced"
> {
  ensureInteractive("Integration level", "run interactively");

  const level = await clack.select({
    message: "Integration level:",
    options: [
      {
        value: "enhanced",
        label: "Enhanced (full email tracking)",
        hint: "Creates SES config, DynamoDB, Lambda functions",
      },
      {
        value: "dashboard-only",
        label: "Dashboard-only (read-only)",
        hint: "Only creates IAM role for dashboard access",
      },
    ],
  });

  if (clack.isCancel(level)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return level as "dashboard-only" | "enhanced";
}

/**
 * Confirm deployment
 */
export async function confirmDeploy(): Promise<boolean> {
  ensureInteractive("Deployment confirmation", "--yes");

  const confirmed = await clack.confirm({
    message: "Deploy infrastructure to your AWS account?",
    initialValue: true,
  });

  if (clack.isCancel(confirmed)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return confirmed;
}

/**
 * Feature definition for multi-select
 */
export type FeatureOption = {
  value: string;
  label: string;
  hint: string;
};

/**
 * Get available features
 */
export function getAvailableFeatures(): FeatureOption[] {
  return [
    {
      value: "configSet",
      label: "Configuration Set",
      hint: "Track opens, clicks, bounces, and complaints",
    },
    {
      value: "bounceHandling",
      label: "Bounce Handling",
      hint: "Automatically process bounce notifications",
    },
    {
      value: "complaintHandling",
      label: "Complaint Handling",
      hint: "Automatically process spam complaints",
    },
    {
      value: "emailHistory",
      label: "Email History",
      hint: "Store sent emails in DynamoDB (90-day retention)",
    },
    {
      value: "eventProcessor",
      label: "Event Processor",
      hint: "Advanced analytics and webhook forwarding",
    },
    {
      value: "dashboardAccess",
      label: "Dashboard Access",
      hint: "Read-only IAM role for web dashboard",
    },
  ];
}

/**
 * Prompt for feature selection (multi-select)
 */
export async function promptFeatureSelection(
  preselected?: string[]
): Promise<string[]> {
  ensureInteractive("Feature selection", "run interactively");

  const features = getAvailableFeatures();

  const selected = await clack.multiselect({
    message: "Select features to deploy:",
    options: features,
    initialValues: preselected || [
      "configSet",
      "bounceHandling",
      "complaintHandling",
      "dashboardAccess",
    ],
    required: true,
  });

  if (clack.isCancel(selected)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return selected as string[];
}

/**
 * Conflict resolution action
 */
export type ConflictAction = "deploy-alongside" | "replace" | "skip";

/**
 * Prompt for conflict resolution
 */
export async function promptConflictResolution(
  resourceType: string,
  existingResourceName: string
): Promise<ConflictAction> {
  ensureInteractive("Conflict resolution", "run interactively");

  const action = await clack.select({
    message: `Found existing ${resourceType}: ${pc.cyan(existingResourceName)}. How should we handle this?`,
    options: [
      {
        value: "deploy-alongside",
        label: "Deploy alongside (no changes)",
        hint: "Create our resources without modifying yours",
      },
      {
        value: "replace",
        label: "Replace with Wraps version",
        hint: "Save original for restore, use ours",
      },
      {
        value: "skip",
        label: "Skip this feature",
        hint: "Keep your setup, skip Wraps deployment",
      },
    ],
  });

  if (clack.isCancel(action)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return action as ConflictAction;
}

/**
 * Prompt to select identities to track
 */
export async function promptSelectIdentities(
  identities: Array<{ name: string; verified: boolean }>
): Promise<string[]> {
  ensureInteractive("Identity selection", "run interactively");

  const selected = await clack.multiselect({
    message: "Select identities to connect with Wraps:",
    options: identities.map((id) => ({
      value: id.name,
      label: id.name,
      hint: id.verified ? "Verified" : "Pending verification",
    })),
    required: false,
  });

  if (clack.isCancel(selected)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return selected as string[];
}

/**
 * Confirm connection deployment
 */
export async function confirmConnect(): Promise<boolean> {
  ensureInteractive("Connection confirmation", "--yes");

  const confirmed = await clack.confirm({
    message: "Connect to existing AWS infrastructure?",
    initialValue: true,
  });

  if (clack.isCancel(confirmed)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return confirmed;
}

/**
 * Prompt for configuration preset
 */
export async function promptConfigPreset(): Promise<
  "starter" | "production" | "enterprise" | "custom"
> {
  ensureInteractive("Preset", "--preset <starter|production|enterprise>");

  const { getAllPresetInfo } = await import("../email/presets.js");
  const presets = getAllPresetInfo();

  const preset = await clack.select({
    message: "Choose a configuration preset:",
    options: presets.map((p: any) => ({
      value: p.name.toLowerCase() as
        | "starter"
        | "production"
        | "enterprise"
        | "custom",
      label: `${p.name} - ${p.description}`,
      hint: `${p.volume} | Est. ${p.estimatedCost}/mo`,
    })),
  });

  if (clack.isCancel(preset)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return preset as "starter" | "production" | "enterprise" | "custom";
}

/**
 * Prompt for estimated monthly email volume
 */
export async function promptEstimatedVolume(): Promise<number> {
  ensureInteractive("Estimated volume", "--quick");

  const volume = await clack.select({
    message: "Estimated monthly email volume:",
    options: [
      { value: 1000, label: "< 1k emails/month", hint: "Hobby/Development" },
      { value: 10_000, label: "1k-10k emails/month", hint: "Side Project" },
      {
        value: 50_000,
        label: "10k-100k emails/month",
        hint: "Growing Startup",
      },
      {
        value: 250_000,
        label: "100k-500k emails/month",
        hint: "Production SaaS",
      },
      { value: 1_000_000, label: "500k+ emails/month", hint: "High Volume" },
    ],
  });

  if (clack.isCancel(volume)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return volume as number;
}

/**
 * Prompt for custom configuration
 */
/**
 * Prompt for email archiving configuration (for presets)
 */
export async function promptEmailArchiving(): Promise<{
  enabled: boolean;
  retention: ArchiveRetention;
}> {
  ensureInteractive("Email archiving", "--quick");

  const enabled = await clack.confirm({
    message:
      "Enable email archiving? (Store full email content with HTML for viewing in dashboard)",
    initialValue: false,
  });

  if (clack.isCancel(enabled)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  if (!enabled) {
    return { enabled: false, retention: "90days" };
  }

  const retention = await clack.select({
    message: "Email archive retention period:",
    options: [
      { value: "7days", label: "7 days", hint: "~$1-2/mo for 10k emails" },
      { value: "30days", label: "30 days", hint: "~$2-4/mo for 10k emails" },
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
      { value: "1year", label: "1 year", hint: "~$25-40/mo for 10k emails" },
      {
        value: "18months",
        label: "18 months",
        hint: "~$35-60/mo for 10k emails",
      },
    ],
    initialValue: "90days",
  });

  if (clack.isCancel(retention)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  clack.log.info(
    pc.dim(
      "Archiving stores full RFC 822 emails with HTML, attachments, and headers"
    )
  );
  clack.log.info(
    pc.dim("Cost: $2/GB ingestion + $0.19/GB/month storage (~50KB per email)")
  );

  return {
    enabled: true,
    retention: retention as ArchiveRetention,
  };
}

export async function promptCustomConfig(existingConfig?: any): Promise<any> {
  ensureInteractive(
    "Custom configuration",
    "--preset starter|production|enterprise (custom requires an interactive terminal)"
  );

  clack.log.info("Custom configuration builder");
  clack.log.info("Configure each feature individually");

  // Reputation tracking (first, as it's recommended)
  const reputationMetrics = await clack.confirm({
    message: "Enable reputation tracking (recommended)?",
    initialValue: existingConfig?.reputationMetrics ?? true,
  });

  if (clack.isCancel(reputationMetrics)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  // Tracking
  const trackingEnabled = await clack.confirm({
    message: "Enable open & click tracking?",
    initialValue: existingConfig?.tracking?.enabled ?? true,
  });

  if (clack.isCancel(trackingEnabled)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  // Event tracking (combined - EventBridge + DynamoDB)
  const eventTrackingEnabled = await clack.confirm({
    message: "Store email events in DynamoDB?",
    initialValue: existingConfig?.eventTracking?.enabled ?? true,
  });

  if (clack.isCancel(eventTrackingEnabled)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  let archiveRetention: string | symbol = "90days";
  let selectedEventTypes: SESEventType[] = [...ALL_EVENT_TYPES];

  if (eventTrackingEnabled) {
    archiveRetention = await clack.select({
      message: "Event history retention period:",
      options: [
        { value: "7days", label: "7 days", hint: "Minimal storage cost" },
        { value: "30days", label: "30 days", hint: "Development/testing" },
        {
          value: "90days",
          label: "90 days (recommended)",
          hint: "Standard retention",
        },
        { value: "1year", label: "1 year", hint: "Compliance requirements" },
        {
          value: "indefinite",
          label: "Indefinite",
          hint: "Higher storage cost",
        },
      ],
      initialValue: existingConfig?.eventTracking?.archiveRetention || "90days",
    });

    if (clack.isCancel(archiveRetention)) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }

    const optionalEventTypes = ALL_EVENT_TYPES.filter(
      (type) => !REQUIRED_SUPPRESSION_EVENT_TYPES.includes(type)
    );
    const existingEventTypes = existingConfig?.eventTracking?.events as
      | SESEventType[]
      | undefined;

    const eventTypeSelection = await clack.multiselect({
      message:
        "Which event types should reach your EventBridge bus and DynamoDB history?",
      options: optionalEventTypes.map((type) => ({
        value: type,
        label: OPTIONAL_EVENT_TYPE_LABELS[type] ?? type,
      })),
      initialValues: existingEventTypes
        ? optionalEventTypes.filter((type) => existingEventTypes.includes(type))
        : optionalEventTypes,
      required: false,
    });

    if (clack.isCancel(eventTypeSelection)) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }

    clack.log.info(
      pc.dim(
        "BOUNCE and COMPLAINT are always included — dropping them would leave your pipeline blind to bounces and complaints, and your domain reputation would degrade."
      )
    );

    const selected = eventTypeSelection as SESEventType[];
    selectedEventTypes = ALL_EVENT_TYPES.filter(
      (type) =>
        REQUIRED_SUPPRESSION_EVENT_TYPES.includes(type) ||
        selected.includes(type)
    );
  }

  // Security
  const tlsRequired = await clack.confirm({
    message: "Require TLS encryption for all emails?",
    initialValue: existingConfig?.tlsRequired ?? true,
  });

  if (clack.isCancel(tlsRequired)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  // Custom MAIL FROM domain (for DMARC alignment)
  const customMailFrom = await clack.confirm({
    message: "Configure custom MAIL FROM domain? (improves DMARC alignment)",
    initialValue: existingConfig?.mailFromDomain !== undefined,
  });

  if (clack.isCancel(customMailFrom)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  let mailFromSubdomain: string | symbol = "mail";

  if (customMailFrom) {
    mailFromSubdomain = await clack.text({
      message: "MAIL FROM subdomain:",
      placeholder: "mail",
      initialValue: existingConfig?.mailFromDomain?.split(".")[0] || "mail",
      validate: (value) => {
        if (!value || value.trim() === "") {
          return "Subdomain is required";
        }
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(value)) {
          return "Invalid subdomain format";
        }
        return;
      },
    });

    if (clack.isCancel(mailFromSubdomain)) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }

    clack.log.info(
      pc.dim(`MAIL FROM will be set to ${mailFromSubdomain}.yourdomain.com`)
    );
  }

  // Dedicated IP
  const dedicatedIp = await clack.confirm({
    message: "Request dedicated IP address? (requires 100k+ emails/day)",
    initialValue: existingConfig?.dedicatedIp ?? false,
  });

  if (clack.isCancel(dedicatedIp)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  // Email Archiving
  const emailArchivingEnabled = await clack.confirm({
    message:
      "Enable email archiving? (Store full email content with HTML for viewing)",
    initialValue: existingConfig?.emailArchiving?.enabled ?? false,
  });

  if (clack.isCancel(emailArchivingEnabled)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  let emailArchiveRetention: string | symbol = "90days";

  if (emailArchivingEnabled) {
    emailArchiveRetention = await clack.select({
      message: "Email archive retention period:",
      options: [
        { value: "7days", label: "7 days", hint: "~$1-2/mo for 10k emails" },
        { value: "30days", label: "30 days", hint: "~$2-4/mo for 10k emails" },
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
        { value: "1year", label: "1 year", hint: "~$25-40/mo for 10k emails" },
        {
          value: "18months",
          label: "18 months",
          hint: "~$35-60/mo for 10k emails",
        },
      ],
      initialValue: existingConfig?.emailArchiving?.retention || "90days",
    });

    if (clack.isCancel(emailArchiveRetention)) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }

    clack.log.info(
      pc.dim(
        "Note: Archiving stores full RFC 822 emails with HTML, attachments, and headers"
      )
    );
    clack.log.info(
      pc.dim("Cost: $2/GB ingestion + $0.19/GB/month storage (~50KB per email)")
    );
  }

  return {
    tracking: trackingEnabled
      ? {
          enabled: true,
          opens: true,
          clicks: true,
        }
      : { enabled: false },
    tlsRequired,
    reputationMetrics,
    mailFromSubdomain: customMailFrom
      ? typeof mailFromSubdomain === "string"
        ? mailFromSubdomain
        : "mail"
      : undefined,
    suppressionList: {
      enabled: true,
      reasons: ["BOUNCE", "COMPLAINT"],
    },
    eventTracking: eventTrackingEnabled
      ? {
          enabled: true,
          eventBridge: true,
          events: selectedEventTypes,
          dynamoDBHistory: true,
          archiveRetention:
            typeof archiveRetention === "string" ? archiveRetention : "90days",
        }
      : { enabled: false },
    emailArchiving: emailArchivingEnabled
      ? {
          enabled: true,
          retention:
            typeof emailArchiveRetention === "string"
              ? emailArchiveRetention
              : "90days",
        }
      : { enabled: false, retention: "90days" },
    dedicatedIp,
    sendingEnabled: true,
  };
}

/**
 * DNS record category labels for display
 */
const DNS_CATEGORY_LABELS: Record<string, string> = {
  dkim: "DKIM (Email Authentication)",
  spf: "SPF (Sender Policy Framework)",
  dmarc: "DMARC (Email Policy)",
  tracking: "Tracking Domain",
  mailfrom_mx: "MAIL FROM (MX Record)",
  mailfrom_spf: "MAIL FROM (SPF Record)",
};

/**
 * Status symbols for DNS records
 */
const DNS_STATUS_SYMBOLS: Record<string, string> = {
  new: pc.green("+ NEW"),
  update: pc.yellow("~ UPDATE"),
  conflict: pc.red("! CONFLICT"),
  no_change: pc.dim("✓ OK"),
};

/**
 * Display a DNS record for review
 */
function formatDNSRecord(record: {
  name: string;
  type: string;
  proposedValue: string;
  existingValue: string | null;
  status: string;
  category: string;
  conflictReason?: string;
}): string {
  const lines: string[] = [];
  const statusSymbol =
    DNS_STATUS_SYMBOLS[record.status] || pc.dim(record.status);
  const categoryLabel = DNS_CATEGORY_LABELS[record.category] || record.category;

  lines.push(`  ${statusSymbol} ${pc.bold(categoryLabel)}`);
  lines.push(`     ${pc.dim("Name:")} ${record.name}`);
  lines.push(`     ${pc.dim("Type:")} ${record.type}`);

  if (record.existingValue && record.status !== "no_change") {
    lines.push(`     ${pc.dim("Current:")} ${pc.red(record.existingValue)}`);
    lines.push(`     ${pc.dim("New:")}     ${pc.green(record.proposedValue)}`);
  } else if (record.status === "new") {
    lines.push(`     ${pc.dim("Value:")} ${pc.green(record.proposedValue)}`);
  } else {
    lines.push(`     ${pc.dim("Value:")} ${record.proposedValue}`);
  }

  if (record.conflictReason) {
    lines.push(`     ${pc.red(`⚠ ${record.conflictReason}`)}`);
  }

  return lines.join("\n");
}

/**
 * Prompt for DNS record confirmation with conflict detection
 * Shows all proposed records and lets user select which to create
 */
export async function promptDNSConfirmation(preview: {
  records: Array<{
    name: string;
    type: string;
    proposedValue: string;
    existingValue: string | null;
    status: string;
    category: string;
    conflictReason?: string;
  }>;
  hasConflicts: boolean;
  conflictCount: number;
  newCount: number;
  updateCount: number;
  noChangeCount: number;
}): Promise<{
  shouldCreate: boolean;
  selectedCategories: Set<string>;
}> {
  console.log();
  clack.log.info(pc.bold("DNS Record Review"));
  console.log();

  // Show summary
  const summaryParts: string[] = [];
  if (preview.newCount > 0) {
    summaryParts.push(pc.green(`${preview.newCount} new`));
  }
  if (preview.updateCount > 0) {
    summaryParts.push(pc.yellow(`${preview.updateCount} updates`));
  }
  if (preview.conflictCount > 0) {
    summaryParts.push(pc.red(`${preview.conflictCount} conflicts`));
  }
  if (preview.noChangeCount > 0) {
    summaryParts.push(pc.dim(`${preview.noChangeCount} unchanged`));
  }
  console.log(`  ${summaryParts.join(" | ")}\n`);

  // Display all records
  for (const record of preview.records) {
    console.log(formatDNSRecord(record));
    console.log();
  }

  // If there are conflicts, show a warning
  if (preview.hasConflicts) {
    clack.log.warn(
      pc.yellow(
        "Some records have conflicts. Creating them will overwrite existing values."
      )
    );
    console.log();
  }

  // If everything is unchanged, skip the prompt
  if (
    preview.newCount === 0 &&
    preview.updateCount === 0 &&
    preview.conflictCount === 0
  ) {
    clack.log.success("All DNS records are already configured correctly.");
    return { shouldCreate: false, selectedCategories: new Set() };
  }

  // Ask if user wants to create DNS records
  ensureInteractive("DNS record confirmation", "run interactively");
  const shouldCreate = await clack.confirm({
    message: "Create DNS records in Route53?",
    initialValue: !preview.hasConflicts, // Default to no if there are conflicts
  });

  if (clack.isCancel(shouldCreate) || !shouldCreate) {
    return { shouldCreate: false, selectedCategories: new Set() };
  }

  // If there are conflicts or updates, let user select which records to create
  if (preview.hasConflicts || preview.updateCount > 0) {
    const recordsToSelect = preview.records.filter(
      (r) => r.status !== "no_change"
    );

    // Group by category to avoid duplicate entries (e.g., multiple DKIM records)
    const categories = new Map<
      string,
      { status: string; hasConflict: boolean }
    >();
    for (const record of recordsToSelect) {
      const existing = categories.get(record.category);
      if (!existing || record.status === "conflict") {
        categories.set(record.category, {
          status: record.status,
          hasConflict: record.status === "conflict",
        });
      }
    }

    const options = Array.from(categories.entries()).map(([category, info]) => {
      const label = DNS_CATEGORY_LABELS[category] || category;
      let hint =
        info.status === "new"
          ? "New"
          : info.status === "update"
            ? "Will merge with existing"
            : "Will replace existing";
      if (info.hasConflict) {
        hint = pc.red(`${hint} ⚠`);
      }
      return {
        value: category,
        label,
        hint,
      };
    });

    // Pre-select non-conflict records
    const initialValues = Array.from(categories.entries())
      .filter(([_, info]) => !info.hasConflict)
      .map(([category]) => category);

    const selected = await clack.multiselect({
      message: "Select which records to create:",
      options,
      initialValues,
      required: false,
    });

    if (clack.isCancel(selected)) {
      return { shouldCreate: false, selectedCategories: new Set() };
    }

    return {
      shouldCreate: true,
      selectedCategories: new Set(selected as string[]),
    };
  }

  // No conflicts - select all new/update records
  const allCategories = new Set(
    preview.records
      .filter((r) => r.status !== "no_change")
      .map((r) => r.category)
  );

  return { shouldCreate: true, selectedCategories: allCategories };
}

/**
 * Ask user if they want to manage DNS records via Route53
 */
export async function promptDNSManagement(domain: string): Promise<boolean> {
  ensureInteractive("DNS management confirmation", "run interactively");

  const manage = await clack.confirm({
    message: `Manage DNS records for ${pc.cyan(domain)} via Route53?`,
    initialValue: true,
  });

  if (clack.isCancel(manage)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return manage;
}

/**
 * DNS provider option with detection info
 */
export type DNSProviderOption = {
  provider: DNSProviderType;
  detected: boolean;
  hint?: string;
};

/**
 * Prompt for DNS provider selection
 * @param domain The domain being configured
 * @param availableProviders List of providers with detection info
 */
export async function promptDNSProvider(
  domain: string,
  availableProviders: DNSProviderOption[]
): Promise<DNSProviderType> {
  ensureInteractive("DNS provider", "run interactively");

  const options = availableProviders.map((p) => {
    let label: string;
    let hint: string;

    switch (p.provider) {
      case "route53":
        label = "AWS Route53";
        hint = p.detected
          ? "Hosted zone detected"
          : "Requires Route53 hosted zone";
        break;
      case "vercel":
        label = "Vercel DNS";
        hint = p.detected
          ? "Token detected"
          : "Enter token or set VERCEL_TOKEN";
        break;
      case "cloudflare":
        label = "Cloudflare";
        hint = p.detected
          ? "Token detected"
          : "Enter token or set CLOUDFLARE_API_TOKEN";
        break;
      case "manual":
        label = "Manual";
        hint = "I'll add DNS records myself";
        break;
    }

    // Add recommended tag if detected
    if (p.detected && p.provider !== "manual") {
      label = `${label} (Recommended)`;
    }

    return {
      value: p.provider,
      label,
      hint: p.hint || hint,
    };
  });

  const provider = await clack.select({
    message: `Where do you manage DNS for ${pc.cyan(domain)}?`,
    options,
  });

  if (clack.isCancel(provider)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return provider as DNSProviderType;
}

/**
 * Prompt for inbound email subdomain (or root domain)
 * Returns "" for root domain, or a subdomain string like "inbound"
 */
export async function promptInboundSubdomain(domain: string): Promise<string> {
  ensureInteractive("Inbound subdomain", "--subdomain <subdomain>");

  const choice = await clack.select({
    message: `Where should ${pc.cyan(domain)} receive inbound email?`,
    options: [
      {
        value: "",
        label: `${domain} (root domain)`,
        hint: `e.g., support@${domain}`,
      },
      {
        value: "__subdomain__",
        label: "Use a subdomain",
        hint: `e.g., inbound.${domain}`,
      },
    ],
  });

  if (clack.isCancel(choice)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  if (choice === "") {
    return "";
  }

  const subdomain = await clack.text({
    message: `Subdomain for receiving emails (e.g., inbound → inbound.${domain}):`,
    placeholder: "inbound",
    defaultValue: "inbound",
    validate: (value) => {
      const v = value || "inbound";
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(v)) {
        return "Subdomain must contain only lowercase letters, numbers, and hyphens";
      }
      if (v.length > 63) {
        return "Subdomain must be 63 characters or less";
      }
      return;
    },
  });

  if (clack.isCancel(subdomain)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return (subdomain as string) || "inbound";
}

/**
 * Prompt for webhook URL for inbound email events
 */
export async function promptWebhookUrl(): Promise<string | undefined> {
  ensureInteractive("Webhook URL confirmation", "run interactively");

  const wantsWebhook = await clack.confirm({
    message: "Send inbound email events to a webhook URL?",
    initialValue: false,
  });

  if (clack.isCancel(wantsWebhook)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  if (!wantsWebhook) {
    return;
  }

  const url = await clack.text({
    message: "Webhook URL (must be HTTPS):",
    placeholder: "https://your-app.com/api/inbound-email",
    validate: (value) => {
      if (!value) {
        return "URL is required";
      }
      try {
        const parsed = new URL(value);
        if (parsed.protocol !== "https:") {
          return "Webhook URL must use HTTPS";
        }
      } catch {
        return "Invalid URL";
      }
      return;
    },
  });

  if (clack.isCancel(url)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return url as string;
}

/**
 * Display DNS records grouped by category and let user select which to create.
 * Used for Vercel/Cloudflare where we don't have existing-record preview from Route53.
 */
export async function promptDNSRecordSelection(
  records: Array<{
    name: string;
    type: string;
    value: string;
    priority?: number;
    category: string;
  }>,
  providerName: string
): Promise<{ shouldCreate: boolean; selectedCategories: Set<string> }> {
  ensureInteractive("DNS record selection", "run interactively");

  // Import descriptions here to avoid circular deps
  const { DNS_RECORD_DESCRIPTIONS } = await import("../dns/create-records.js");

  // Group records by category
  const categories = new Map<
    string,
    Array<{ name: string; type: string; value: string; priority?: number }>
  >();
  for (const record of records) {
    const existing = categories.get(record.category) || [];
    existing.push(record);
    categories.set(record.category, existing);
  }

  // Display all records grouped by category
  console.log();
  clack.log.info(pc.bold("DNS records to create:"));
  console.log();

  for (const [category, catRecords] of categories) {
    const desc =
      DNS_RECORD_DESCRIPTIONS[category as keyof typeof DNS_RECORD_DESCRIPTIONS];
    const label = desc?.label || DNS_CATEGORY_LABELS[category] || category;

    console.log(`  ${pc.bold(label)}`);
    if (desc) {
      console.log(`  ${pc.dim(desc.purpose)}`);
    }
    for (const record of catRecords) {
      const value = record.priority
        ? `${record.priority} ${record.value}`
        : record.value;
      console.log(`    ${pc.cyan(record.type.padEnd(6))} ${record.name}`);
      console.log(`    ${pc.dim("→")}      ${value}`);
    }
    console.log();
  }

  // Let user select which categories to create
  const options = Array.from(categories.keys()).map((category) => {
    const desc =
      DNS_RECORD_DESCRIPTIONS[category as keyof typeof DNS_RECORD_DESCRIPTIONS];
    return {
      value: category,
      label: desc?.label || DNS_CATEGORY_LABELS[category] || category,
      hint: desc?.impact || "",
    };
  });

  const selected = await clack.multiselect({
    message: `Select records to create in ${providerName}:`,
    options,
    initialValues: options.map((o) => o.value),
    required: false,
  });

  if (clack.isCancel(selected) || (selected as string[]).length === 0) {
    return { shouldCreate: false, selectedCategories: new Set() };
  }

  return {
    shouldCreate: true,
    selectedCategories: new Set(selected as string[]),
  };
}

/**
 * Prompt to continue with manual DNS setup when credentials are missing
 */
export async function promptContinueManualDNS(): Promise<boolean> {
  ensureInteractive(
    "Manual DNS continuation confirmation",
    "run interactively"
  );

  const continueManual = await clack.confirm({
    message: "Continue with manual DNS setup?",
    initialValue: true,
  });

  if (clack.isCancel(continueManual)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return continueManual;
}

/**
 * Suggest subdomains for reputation isolation when a primary domain exists.
 * Returns the chosen domain (subdomain.primary or custom entry).
 */
export async function promptSubdomainSuggestions(
  primaryDomain: string
): Promise<string> {
  ensureInteractive("Subdomain suggestion", "--domain <subdomain.domain>");

  clack.log.info(
    pc.dim(
      "Using subdomains isolates sender reputation — a bounce spike on marketing won't affect transactional mail."
    )
  );

  const choice = await clack.select({
    message: `Add a subdomain of ${pc.cyan(primaryDomain)}?`,
    options: [
      {
        value: `mail.${primaryDomain}`,
        label: `mail.${primaryDomain}`,
        hint: "Transactional emails",
      },
      {
        value: `news.${primaryDomain}`,
        label: `news.${primaryDomain}`,
        hint: "Newsletters & marketing",
      },
      {
        value: `notify.${primaryDomain}`,
        label: `notify.${primaryDomain}`,
        hint: "Notifications & alerts",
      },
      {
        value: "__custom__",
        label: "Enter a custom domain",
        hint: "Any domain or subdomain",
      },
    ],
  });

  if (clack.isCancel(choice)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  if (choice === "__custom__") {
    const custom = await clack.text({
      message: "Domain to add:",
      placeholder: `billing.${primaryDomain}`,
      validate: (value) => {
        if (!value?.includes(".")) {
          return "Please enter a valid domain (e.g., billing.myapp.com)";
        }
        return;
      },
    });

    if (clack.isCancel(custom)) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }

    return custom as string;
  }

  return choice as string;
}

/**
 * Prompt for the purpose of a domain (informational label).
 */
export async function promptDomainPurpose(): Promise<DomainPurpose> {
  ensureInteractive("Domain purpose", "--quick");

  const purpose = await clack.select({
    message: "What will this domain be used for?",
    options: [
      {
        value: "transactional",
        label: "Transactional",
        hint: "Password resets, receipts, confirmations",
      },
      {
        value: "marketing",
        label: "Marketing",
        hint: "Newsletters, promotions, campaigns",
      },
      {
        value: "notifications",
        label: "Notifications",
        hint: "Alerts, digests, system updates",
      },
      {
        value: "other",
        label: "Other",
        hint: "General purpose",
      },
    ],
  });

  if (clack.isCancel(purpose)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return purpose as DomainPurpose;
}

/**
 * Prompt for the MAIL FROM subdomain (defaults to `mail.{domain}`).
 */
export async function promptMailFromSubdomain(domain: string): Promise<string> {
  ensureInteractive("MAIL FROM subdomain", "--preset (non-custom)");

  const subdomain = await clack.text({
    message: `MAIL FROM subdomain for ${pc.cyan(domain)}:`,
    placeholder: "mail",
    defaultValue: "mail",
    validate: (value) => {
      const v = value || "mail";
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(v)) {
        return "Invalid subdomain format";
      }
      return;
    },
  });

  if (clack.isCancel(subdomain)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  const sub = (subdomain as string) || "mail";
  return `${sub}.${domain}`;
}

/**
 * Prompt for the tracking subdomain (defaults to `track.{domain}`). Returns
 * undefined when the user opts out.
 */
export async function promptTrackingSubdomain(
  domain: string
): Promise<string | undefined> {
  ensureInteractive("Tracking domain", "--tracking-domain <host|none>");

  const wants = await clack.confirm({
    message: `Use a custom tracking domain for open & click links on ${pc.cyan(domain)}? ${pc.dim("(recommended — links show your brand, not awstrack.me)")}`,
    initialValue: true,
  });
  if (clack.isCancel(wants)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }
  if (!wants) return;

  const sub = await clack.text({
    message: `Tracking subdomain for ${pc.cyan(domain)}:`,
    placeholder: "track",
    defaultValue: "track",
    validate: (value) => {
      const v = value || "track";
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(v)) {
        return "Invalid subdomain format";
      }
      return;
    },
  });
  if (clack.isCancel(sub)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }
  return `${(sub as string) || "track"}.${domain}`;
}
