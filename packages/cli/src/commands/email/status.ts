import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import { trackCommand } from "../../telemetry/events.js";
import type { StatusOptions } from "../../types/index.js";
import {
  getAWSRegion,
  listSESDomains,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import {
  ensurePulumiWorkDir,
  getPulumiWorkDir,
} from "../../utils/shared/fs.js";
import { findConnectionsWithService } from "../../utils/shared/metadata.js";
import {
  DeploymentProgress,
  displayStatus,
} from "../../utils/shared/output.js";

/**
 * Email Status command - Show current email infrastructure setup
 */
export async function emailStatus(options: StatusOptions): Promise<void> {
  const startTime = Date.now();
  const progress = new DeploymentProgress();

  clack.intro(pc.bold("Wraps Email Status"));

  // 1. Validate AWS credentials
  const identity = await progress.execute(
    "Loading email infrastructure status",
    async () => validateAWSCredentials()
  );

  // 2. Get region - check flag, then env, then metadata, then default
  let region = options.region || (await getAWSRegion());

  // If using default region (us-east-1), check if we have metadata for other regions
  if (
    !(
      options.region ||
      process.env.AWS_REGION ||
      process.env.AWS_DEFAULT_REGION
    )
  ) {
    const emailConnections = await findConnectionsWithService(
      identity.accountId,
      "email"
    );

    if (emailConnections.length === 1) {
      // Auto-select the only available region
      region = emailConnections[0].region;
    } else if (emailConnections.length > 1) {
      // Multiple regions found - prompt user to select
      const selectedRegion = await clack.select({
        message: "Multiple email deployments found. Which region?",
        options: emailConnections.map((conn) => ({
          value: conn.region,
          label: conn.region,
        })),
      });

      if (clack.isCancel(selectedRegion)) {
        clack.cancel("Operation cancelled");
        process.exit(0);
      }

      region = selectedRegion as string;
    }
  }

  // 3. Try to load Pulumi stack
  let stackOutputs: any = {};
  try {
    // Ensure Pulumi workspace is configured (sets backend URL)
    await ensurePulumiWorkDir();

    const stack = await pulumi.automation.LocalWorkspace.selectStack({
      stackName: `wraps-${identity.accountId}-${region}`,
      workDir: getPulumiWorkDir(),
    });

    stackOutputs = await stack.outputs();
  } catch (_error: any) {
    progress.stop();
    clack.log.error("No email infrastructure found");
    console.log(
      `\nRun ${pc.cyan("wraps email init")} to deploy email infrastructure.\n`
    );
    process.exit(1);
  }

  // 4. Get SES domains with DKIM tokens
  const domains = await listSESDomains(region);

  // 4a. Fetch DKIM tokens for each domain
  const { SESv2Client, GetEmailIdentityCommand } = await import(
    "@aws-sdk/client-sesv2"
  );
  const sesv2Client = new SESv2Client({ region });

  const domainsWithTokens = await Promise.all(
    domains.map(async (d) => {
      try {
        const identity = await sesv2Client.send(
          new GetEmailIdentityCommand({ EmailIdentity: d.domain })
        );
        return {
          domain: d.domain,
          status: d.verified ? ("verified" as const) : ("pending" as const),
          dkimTokens: identity.DkimAttributes?.Tokens || [],
          mailFromDomain: identity.MailFromAttributes?.MailFromDomain,
          mailFromStatus: identity.MailFromAttributes?.MailFromDomainStatus,
        };
      } catch (_error) {
        return {
          domain: d.domain,
          status: d.verified ? ("verified" as const) : ("pending" as const),
          dkimTokens: undefined,
          mailFromDomain: undefined,
          mailFromStatus: undefined,
        };
      }
    })
  );

  // 5. Determine integration level
  const integrationLevel = stackOutputs.configSetName
    ? "enhanced"
    : "dashboard-only";

  // 6. Display status
  progress.stop();
  displayStatus({
    integrationLevel: integrationLevel as "dashboard-only" | "enhanced",
    region,
    domains: domainsWithTokens,
    resources: {
      roleArn: stackOutputs.roleArn?.value,
      configSetName: stackOutputs.configSetName?.value,
      tableName: stackOutputs.tableName?.value,
      lambdaFunctions: stackOutputs.lambdaFunctions?.value?.length || 0,
      snsTopics: integrationLevel === "enhanced" ? 1 : 0,
      archiveArn: stackOutputs.archiveArn?.value,
      archivingEnabled: stackOutputs.archivingEnabled?.value,
      archiveRetention: stackOutputs.archiveRetention?.value,
    },
    tracking: stackOutputs.customTrackingDomain?.value
      ? {
          customTrackingDomain: stackOutputs.customTrackingDomain?.value,
          httpsEnabled: stackOutputs.httpsTrackingEnabled?.value,
          cloudFrontDomain: stackOutputs.cloudFrontDomain?.value,
        }
      : undefined,
  });

  // 7. Track status command
  trackCommand("email:status", {
    success: true,
    region,
    domain_count: domainsWithTokens.length,
    integration_level: integrationLevel,
    duration_ms: Date.now() - startTime,
  });
}
