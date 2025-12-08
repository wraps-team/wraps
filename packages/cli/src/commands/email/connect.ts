import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import { deployEmailStack } from "../../infrastructure/email-stack.js";
import type { ConnectOptions, EmailStackConfig } from "../../types/index.js";
import { getPreset } from "../../utils/email/presets.js";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import {
  ensurePulumiWorkDir,
  getPulumiWorkDir,
} from "../../utils/shared/fs.js";
import {
  createConnectionMetadata,
  loadConnectionMetadata,
  saveConnectionMetadata,
} from "../../utils/shared/metadata.js";
import {
  DeploymentProgress,
  displaySuccess,
} from "../../utils/shared/output.js";
import {
  confirmConnect,
  promptConfigPreset,
  promptProvider,
  promptRegion,
  promptSelectIdentities,
  promptVercelConfig,
} from "../../utils/shared/prompts.js";
import { ensurePulumiInstalled } from "../../utils/shared/pulumi.js";
import { scanAWSResources } from "../../utils/shared/scanner.js";

/**
 * Connect command - Connect to existing AWS SES infrastructure
 */
export async function connect(options: ConnectOptions): Promise<void> {
  clack.intro(pc.bold("Wraps Connect - Link Existing Infrastructure"));

  const progress = new DeploymentProgress();

  // 1. Check Pulumi CLI is installed
  const wasAutoInstalled = await progress.execute(
    "Checking Pulumi CLI installation",
    async () => await ensurePulumiInstalled()
  );

  if (wasAutoInstalled) {
    progress.info("Pulumi CLI was automatically installed");
  }

  // 2. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  progress.info(`Connected to AWS account: ${pc.cyan(identity.accountId)}`);

  // 3. Get region
  let region = options.region;
  if (!region) {
    const defaultRegion = await getAWSRegion();
    region = await promptRegion(defaultRegion);
  }

  // 4. Check if connection already exists
  const existingConnection = await loadConnectionMetadata(
    identity.accountId,
    region
  );
  if (existingConnection) {
    clack.log.warn(
      `Connection already exists for account ${pc.cyan(identity.accountId)} in region ${pc.cyan(region)}`
    );
    clack.log.info(`Created: ${existingConnection.timestamp}`);
    clack.log.info(`Use ${pc.cyan("wraps status")} to view current setup`);
    clack.log.info(`Use ${pc.cyan("wraps upgrade")} to add more features`);
    process.exit(0);
  }

  // 5. Scan existing AWS resources
  const scan = await progress.execute(
    "Scanning existing AWS resources",
    async () => scanAWSResources(region)
  );

  // Display what we found
  progress.info(
    `Found: ${scan.identities.length} identities, ${scan.configurationSets.length} config sets`
  );

  // Check if any identities exist
  if (scan.identities.length === 0) {
    clack.log.warn("No SES identities found in this region.");
    clack.log.info(
      `Use ${pc.cyan("wraps email init")} to create new email infrastructure instead.`
    );
    process.exit(0);
  }

  // Show verified identities
  const verifiedIdentities = scan.identities.filter((id) => id.verified);
  if (verifiedIdentities.length > 0) {
    progress.info(
      `Verified identities: ${verifiedIdentities.map((id) => pc.cyan(id.name)).join(", ")}`
    );
  }

  // 6. Get provider configuration
  let provider = options.provider;
  if (!provider) {
    provider = await promptProvider();
  }

  // Get Vercel config if needed
  let vercelConfig;
  if (provider === "vercel") {
    vercelConfig = await promptVercelConfig();
  }

  // 7. Select identities to connect
  const selectedIdentities = await promptSelectIdentities(
    scan.identities.map((id) => ({
      name: id.name,
      verified: id.verified,
    }))
  );

  if (selectedIdentities.length === 0) {
    clack.log.warn("No identities selected. Nothing to connect.");
    process.exit(0);
  }

  // 8. Select configuration preset
  const preset = await promptConfigPreset();
  const emailConfig =
    preset === "custom"
      ? await import("../../utils/shared/prompts.js").then((m) =>
          m.promptCustomConfig()
        )
      : getPreset(preset)!;

  // 8a. Set the domain from the first selected identity (if it's a domain, not an email)
  // Filter to only domains (exclude email addresses)
  const domainIdentities = selectedIdentities.filter((id) => !id.includes("@"));
  if (domainIdentities.length > 0) {
    emailConfig.domain = domainIdentities[0];
  }

  // 9. Confirm deployment
  if (!options.yes) {
    const confirmed = await confirmConnect();
    if (!confirmed) {
      clack.cancel("Connection cancelled.");
      process.exit(0);
    }
  }

  // 10. Build stack configuration
  const stackConfig: EmailStackConfig = {
    provider,
    region,
    vercel: vercelConfig,
    emailConfig,
  };

  // 11. Deploy infrastructure using Pulumi
  let outputs;
  try {
    outputs = await progress.execute(
      "Deploying Wraps infrastructure (this may take 2-3 minutes)",
      async () => {
        await ensurePulumiWorkDir();

        const stack =
          await pulumi.automation.LocalWorkspace.createOrSelectStack(
            {
              stackName: `wraps-${identity.accountId}-${region}`,
              projectName: "wraps-email",
              program: async () => {
                const result = await deployEmailStack(stackConfig);

                return {
                  roleArn: result.roleArn,
                  configSetName: result.configSetName,
                  tableName: result.tableName,
                  region: result.region,
                  lambdaFunctions: result.lambdaFunctions,
                  domain: result.domain,
                  dkimTokens: result.dkimTokens,
                  customTrackingDomain: result.customTrackingDomain,
                };
              },
            },
            {
              workDir: getPulumiWorkDir(),
              envVars: {
                PULUMI_CONFIG_PASSPHRASE: "",
                AWS_REGION: region,
              },
              secretsProvider: "passphrase",
            }
          );

        await stack.workspace.selectStack(
          `wraps-${identity.accountId}-${region}`
        );
        await stack.setConfig("aws:region", { value: region });

        const upResult = await stack.up({ onOutput: () => {} });
        const pulumiOutputs = upResult.outputs;

        return {
          roleArn: pulumiOutputs.roleArn?.value as string,
          configSetName: pulumiOutputs.configSetName?.value as
            | string
            | undefined,
          tableName: pulumiOutputs.tableName?.value as string | undefined,
          region: pulumiOutputs.region?.value as string,
          lambdaFunctions: pulumiOutputs.lambdaFunctions?.value as
            | string[]
            | undefined,
          domain: pulumiOutputs.domain?.value as string | undefined,
          dkimTokens: pulumiOutputs.dkimTokens?.value as string[] | undefined,
          customTrackingDomain: pulumiOutputs.customTrackingDomain?.value as
            | string
            | undefined,
        };
      }
    );
  } catch (error: any) {
    clack.log.error("Infrastructure deployment failed");

    // Check if it's a lock file error
    if (error.message?.includes("stack is currently locked")) {
      clack.log.warn("\nThe Pulumi stack is locked from a previous run.");
      clack.log.info("To fix this, run:");
      clack.log.info(`  ${pc.cyan("rm -rf ~/.wraps/pulumi/.pulumi/locks")}`);
      clack.log.info("\nThen try running wraps email connect again.");
    }

    throw new Error(`Pulumi deployment failed: ${error.message}`);
  }

  // 12. Create DNS records in Route53 (if hosted zone exists)
  if (outputs.domain && outputs.dkimTokens && outputs.dkimTokens.length > 0) {
    const { findHostedZone, createDNSRecords } = await import(
      "../../utils/email/route53.js"
    );
    const hostedZone = await findHostedZone(outputs.domain, region);

    if (hostedZone) {
      try {
        progress.start("Creating DNS records in Route53");

        // Determine mailFromDomain - use outputs if available, otherwise construct default
        const mailFromDomain =
          emailConfig.mailFromDomain || `mail.${outputs.domain}`;

        await createDNSRecords(
          hostedZone.id,
          outputs.domain,
          outputs.dkimTokens,
          region,
          outputs.customTrackingDomain,
          mailFromDomain
        );
        progress.succeed("DNS records created in Route53");
      } catch (error: any) {
        progress.fail(
          `Failed to create DNS records automatically: ${error.message}`
        );
        progress.info(
          "You can manually add the required DNS records shown below"
        );
      }
    }
  }

  // 13. Save metadata
  const metadata = createConnectionMetadata(
    identity.accountId,
    region,
    provider,
    emailConfig,
    preset === "custom" ? undefined : preset
  );
  if (metadata.services.email) {
    metadata.services.email.pulumiStackName = `wraps-${identity.accountId}-${region}`;
  }
  if (vercelConfig) {
    metadata.vercel = vercelConfig;
  }
  await saveConnectionMetadata(metadata);

  progress.info("Connection metadata saved");

  // 14. Display success message
  displaySuccess({
    roleArn: outputs.roleArn,
    configSetName: outputs.configSetName,
    region: outputs.region!,
    tableName: outputs.tableName,
  });

  // Show next steps
  if (selectedIdentities.length > 0 && emailConfig.tracking?.enabled) {
    console.log(`\n${pc.bold("Next Steps:")}\n`);
    console.log(
      `Update your code to use configuration set: ${pc.cyan("wraps-email-tracking")}`
    );
    console.log(`\n${pc.dim("Example:")}`);
    console.log(
      pc.gray(`  await ses.sendEmail({
    ConfigurationSetName: 'wraps-email-tracking',
    // ... other parameters
  });`)
    );
    console.log("");
  }
}
