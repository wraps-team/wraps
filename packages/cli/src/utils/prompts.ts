import * as clack from "@clack/prompts";
import pc from "picocolors";
import type { ArchiveRetention } from "../types/index.js";

/**
 * Hosting provider type
 */
export type Provider = "vercel" | "aws" | "railway" | "other";

/**
 * Prompt for hosting provider
 */
export async function promptProvider(): Promise<Provider> {
  const provider = await clack.select({
    message: "Where is your app hosted?",
    options: [
      {
        value: "vercel",
        label: "Vercel",
        hint: "Uses OIDC (no AWS credentials needed)",
      },
      {
        value: "aws",
        label: "AWS (Lambda/ECS/EC2)",
        hint: "Uses IAM roles automatically",
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
  const { getAllPresetInfo } = await import("./presets.js");
  const presets = getAllPresetInfo();

  const preset = await clack.select({
    message: "Choose a configuration preset:",
    options: presets.map((p) => ({
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
    return { enabled: false, retention: "3months" };
  }

  const retention = await clack.select({
    message: "Email archive retention period:",
    options: [
      { value: "7days", label: "7 days", hint: "~$1-2/mo for 10k emails" },
      { value: "30days", label: "30 days", hint: "~$2-4/mo for 10k emails" },
      {
        value: "3months",
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
    initialValue: "3months",
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

export async function promptCustomConfig(): Promise<any> {
  clack.log.info("Custom configuration builder");
  clack.log.info("Configure each feature individually");

  // Tracking
  const trackingEnabled = await clack.confirm({
    message: "Enable open & click tracking?",
    initialValue: true,
  });

  if (clack.isCancel(trackingEnabled)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  // Event tracking
  const eventTrackingEnabled = await clack.confirm({
    message: "Enable real-time event tracking (EventBridge)?",
    initialValue: true,
  });

  if (clack.isCancel(eventTrackingEnabled)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  let dynamoDBHistory: boolean | symbol = false;
  let archiveRetention: string | symbol = "3months";

  if (eventTrackingEnabled) {
    dynamoDBHistory = await clack.confirm({
      message: "Store email history in DynamoDB?",
      initialValue: true,
    });

    if (clack.isCancel(dynamoDBHistory)) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }

    if (dynamoDBHistory) {
      archiveRetention = await clack.select({
        message: "Email history retention period:",
        options: [
          { value: "7days", label: "7 days", hint: "Minimal storage cost" },
          { value: "30days", label: "30 days", hint: "Development/testing" },
          {
            value: "3months",
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
      });

      if (clack.isCancel(archiveRetention)) {
        clack.cancel("Operation cancelled.");
        process.exit(0);
      }
    }
  }

  // Security
  const tlsRequired = await clack.confirm({
    message: "Require TLS encryption for all emails?",
    initialValue: true,
  });

  if (clack.isCancel(tlsRequired)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  // Reputation metrics
  const reputationMetrics = await clack.confirm({
    message: "Enable reputation metrics dashboard?",
    initialValue: true,
  });

  if (clack.isCancel(reputationMetrics)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  // Dedicated IP
  const dedicatedIp = await clack.confirm({
    message: "Request dedicated IP address? (requires 100k+ emails/day)",
    initialValue: false,
  });

  if (clack.isCancel(dedicatedIp)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  // Email Archiving
  const emailArchivingEnabled = await clack.confirm({
    message:
      "Enable email archiving? (Store full email content with HTML for viewing)",
    initialValue: false,
  });

  if (clack.isCancel(emailArchivingEnabled)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  let emailArchiveRetention: string | symbol = "3months";

  if (emailArchivingEnabled) {
    emailArchiveRetention = await clack.select({
      message: "Email archive retention period:",
      options: [
        { value: "7days", label: "7 days", hint: "~$1-2/mo for 10k emails" },
        { value: "30days", label: "30 days", hint: "~$2-4/mo for 10k emails" },
        {
          value: "3months",
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
      initialValue: "3months",
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
    suppressionList: {
      enabled: true,
      reasons: ["BOUNCE", "COMPLAINT"],
    },
    eventTracking: eventTrackingEnabled
      ? {
          enabled: true,
          eventBridge: true,
          events: [
            "SEND",
            "DELIVERY",
            "OPEN",
            "CLICK",
            "BOUNCE",
            "COMPLAINT",
            "REJECT",
            "RENDERING_FAILURE",
          ],
          dynamoDBHistory: Boolean(dynamoDBHistory),
          archiveRetention:
            typeof archiveRetention === "string" ? archiveRetention : "3months",
        }
      : { enabled: false },
    emailArchiving: emailArchivingEnabled
      ? {
          enabled: true,
          retention:
            typeof emailArchiveRetention === "string"
              ? emailArchiveRetention
              : "3months",
        }
      : { enabled: false, retention: "3months" },
    dedicatedIp,
    sendingEnabled: true,
  };
}
