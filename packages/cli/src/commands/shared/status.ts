import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
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
import {
  DeploymentProgress,
  displayStatus,
} from "../../utils/shared/output.js";

/**
 * Status command - Show current infrastructure setup
 */
export async function status(_options: StatusOptions): Promise<void> {
  const progress = new DeploymentProgress();

  // 1. Validate AWS credentials
  const identity = await progress.execute(
    "Loading infrastructure status",
    async () => validateAWSCredentials()
  );

  // 2. Get region
  const region = await getAWSRegion();

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
    clack.log.error("No Wraps infrastructure found");
    console.log(`\nRun ${pc.cyan("wraps init")} to deploy infrastructure.\n`);
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
  });
}
