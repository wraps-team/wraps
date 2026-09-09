import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import { getTelemetryClient } from "../../telemetry/client.js";
import { trackCommand } from "../../telemetry/events.js";
import type { StatusOptions } from "../../types/index.js";
import { resolveDashboardUrl } from "../../utils/selfhost/dashboard-url.js";
import {
  getAWSRegion,
  getSESAccountStatus,
  listSESDomains,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import { findWrapsCloudFormationStacks } from "../../utils/shared/cloudformation.js";
import { isAWSNotFoundError } from "../../utils/shared/errors.js";
import {
  ensurePulumiWorkDir,
  getPulumiWorkDir,
} from "../../utils/shared/fs.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import {
  findConnectionsWithService,
  getAllTrackedDomains,
  loadConnectionMetadata,
} from "../../utils/shared/metadata.js";
import {
  DeploymentProgress,
  displayStatus,
} from "../../utils/shared/output.js";
import { ensurePulumiInstalled } from "../../utils/shared/pulumi.js";

/**
 * Email Status command - Show current email infrastructure setup
 */
export async function emailStatus(options: StatusOptions): Promise<void> {
  await ensurePulumiInstalled();
  const startTime = Date.now();
  const progress = new DeploymentProgress();

  if (!isJsonMode()) {
    clack.intro(pc.bold("Wraps Email Status"));
  }

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
  let cloudFormationStacks: string[] | undefined;
  try {
    // Ensure Pulumi workspace is configured (sets backend URL)
    await ensurePulumiWorkDir({ accountId: identity.accountId, region });

    const stack = await pulumi.automation.LocalWorkspace.selectStack({
      stackName: `wraps-${identity.accountId}-${region}`,
      workDir: getPulumiWorkDir(),
    });

    stackOutputs = await stack.outputs();
    // baseline:allow-next-line no-swallowed-errors — stack may not exist, Pulumi may not be installed
  } catch (_error) {
    // No Pulumi stack. That is not the same thing as "no infrastructure" —
    // a customer who deployed through the dashboard's CloudFormation path
    // has real, working infrastructure this CLI has never looked for.
    const cfCheck = await findWrapsCloudFormationStacks(region);

    if (cfCheck.checked && cfCheck.stacks.length > 0) {
      // Dashboard-managed deployment: continue with empty stackOutputs.
      // integrationLevel below naturally resolves to "dashboard-only".
      cloudFormationStacks = cfCheck.stacks;
    } else {
      progress.stop();
      clack.log.error("No email infrastructure found");
      if (!cfCheck.checked) {
        // "checked: false" means we could not look — never claim we looked
        // and found nothing when we simply lacked the permission to check.
        console.log(
          pc.dim(
            "\nCould not check for CloudFormation stacks (missing cloudformation:DescribeStacks).\n"
          )
        );
      }
      console.log(
        `\nRun ${pc.cyan("wraps email init")} to deploy email infrastructure.\n`
      );
      process.exit(1);
      return; // Return after process.exit for testing
    }
  }

  // 4. Get SES domains with DKIM tokens, and SES account sending state, in
  // parallel — both depend only on `region`, not on the Pulumi/CFN outcome.
  const [domains, sesAccountStatus] = await Promise.all([
    listSESDomains(region),
    getSESAccountStatus(region),
  ]);

  // 4a. Fetch DKIM tokens for each domain
  const { SESv2Client, GetEmailIdentityCommand } = await import(
    "@aws-sdk/client-sesv2"
  );
  const sesv2Client = new SESv2Client({ region });

  // 4b. Load metadata for managed/purpose labels
  const metadata = await loadConnectionMetadata(identity.accountId, region);
  const trackedDomains = metadata ? getAllTrackedDomains(metadata) : [];
  const trackedMap = new Map(trackedDomains.map((d) => [d.domain, d]));

  const domainsWithTokens = await Promise.all(
    domains.map(async (d) => {
      const tracked = trackedMap.get(d.domain);
      try {
        const sesIdentity = await sesv2Client.send(
          new GetEmailIdentityCommand({ EmailIdentity: d.domain })
        );
        return {
          domain: d.domain,
          status: d.verified ? ("verified" as const) : ("pending" as const),
          dkimTokens: sesIdentity.DkimAttributes?.Tokens || [],
          mailFromDomain: sesIdentity.MailFromAttributes?.MailFromDomain,
          mailFromStatus: sesIdentity.MailFromAttributes?.MailFromDomainStatus,
          managed: tracked?.managed,
          isPrimary: tracked?.isPrimary,
          purpose: tracked?.purpose,
          trackingConfig: tracked?.trackingConfig,
        };
      } catch (error) {
        // Non-fatal: return partial info if individual domain detail fetch fails
        if (isAWSNotFoundError(error)) {
          return {
            domain: d.domain,
            status: d.verified ? ("verified" as const) : ("pending" as const),
            dkimTokens: undefined,
            mailFromDomain: undefined,
            mailFromStatus: undefined,
            managed: tracked?.managed,
            isPrimary: tracked?.isPrimary,
            purpose: tracked?.purpose,
            trackingConfig: tracked?.trackingConfig,
          };
        }
        throw error;
      }
    })
  );

  // 5. Determine integration level
  const integrationLevel = stackOutputs.configSetName
    ? "enhanced"
    : "dashboard-only";

  // 6. Display status
  progress.stop();

  const statusData = {
    integrationLevel: integrationLevel as "dashboard-only" | "enhanced",
    region,
    dashboardUrl: await resolveDashboardUrl(identity.accountId, region),
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
    sending: {
      sandbox: sesAccountStatus.isSandbox,
      sandboxUncertain: sesAccountStatus.sandboxUncertain ?? false,
      max24HourSend: sesAccountStatus.sendQuota?.max24HourSend,
      maxSendRate: sesAccountStatus.sendQuota?.maxSendRate,
      sentLast24Hours: sesAccountStatus.sendQuota?.sentLast24Hours,
      enforcementStatus: sesAccountStatus.enforcementStatus,
    },
    cloudFormationStacks,
  };

  if (isJsonMode()) {
    jsonSuccess("email.status", statusData);
    return;
  }

  displayStatus(statusData);

  // 7. Track status command
  trackCommand("email:status", {
    success: true,
    region,
    domain_count: domainsWithTokens.length,
    integration_level: integrationLevel,
    duration_ms: Date.now() - startTime,
  });

  // 8. Show promotional footer (once per session)
  getTelemetryClient().showFooterOnce();
}
