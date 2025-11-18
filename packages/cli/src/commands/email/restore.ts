import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import { getPulumiWorkDir } from "../../utils/shared/fs.js";
import {
  deleteConnectionMetadata,
  loadConnectionMetadata,
} from "../../utils/shared/metadata.js";
import { DeploymentProgress } from "../../utils/shared/output.js";

/**
 * Restore command options
 */
export type RestoreOptions = {
  region?: string;
  yes?: boolean;
};

/**
 * Restore command - Remove Wraps infrastructure (alias for destroy)
 *
 * Note: This command removes all Wraps-managed resources.
 * Since Wraps always creates NEW resources (wraps- prefix) and never modifies
 * existing infrastructure, there's nothing to "restore" - only to remove.
 */
export async function restore(options: RestoreOptions): Promise<void> {
  clack.intro(pc.bold("Wraps Restore - Remove Wraps Infrastructure"));

  clack.log.info(
    `${pc.yellow("Note:")} This will remove all Wraps-managed infrastructure.`
  );
  clack.log.info(
    "Your original AWS resources remain untouched (Wraps never modifies them).\n"
  );

  const progress = new DeploymentProgress();

  // 1. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  progress.info(`Connected to AWS account: ${pc.cyan(identity.accountId)}`);

  // 2. Get region
  let region = options.region;
  if (!region) {
    const defaultRegion = await getAWSRegion();
    region = defaultRegion;
  }

  // 3. Load connection metadata
  const metadata = await loadConnectionMetadata(identity.accountId, region);

  if (!metadata) {
    clack.log.error(
      `No Wraps connection found for account ${pc.cyan(identity.accountId)} in region ${pc.cyan(region)}`
    );
    clack.log.info(
      `Use ${pc.cyan("wraps init")} or ${pc.cyan("wraps connect")} to create a connection first.`
    );
    process.exit(1);
  }

  progress.info(`Found connection created: ${metadata.timestamp}`);

  // 4. Display what will be removed
  console.log(
    `\n${pc.bold("The following Wraps resources will be removed:")}\n`
  );

  if (metadata.services.email!.config.tracking?.enabled) {
    console.log(`  ${pc.cyan("✓")} Configuration Set (wraps-email-tracking)`);
  }
  if (metadata.services.email!.config.eventTracking?.dynamoDBHistory) {
    console.log(`  ${pc.cyan("✓")} DynamoDB Table (wraps-email-history)`);
  }
  if (metadata.services.email!.config.eventTracking?.enabled) {
    console.log(`  ${pc.cyan("✓")} EventBridge Rules`);
    console.log(`  ${pc.cyan("✓")} SQS Queues`);
    console.log(`  ${pc.cyan("✓")} Lambda Functions`);
  }
  console.log(`  ${pc.cyan("✓")} IAM Role (wraps-email-role)`);
  console.log("");

  // 5. Confirm removal
  if (!options.yes) {
    const confirmed = await clack.confirm({
      message: "Proceed with removal? This cannot be undone.",
      initialValue: false,
    });

    if (clack.isCancel(confirmed) || !confirmed) {
      clack.cancel("Removal cancelled.");
      process.exit(0);
    }
  }

  // 6. Destroy Pulumi stack
  if (metadata.services.email?.pulumiStackName) {
    await progress.execute("Removing Wraps infrastructure", async () => {
      try {
        const stack = await pulumi.automation.LocalWorkspace.selectStack(
          {
            stackName: metadata.services.email?.pulumiStackName!,
            projectName: "wraps-email",
            program: async () => {}, // Empty program
          },
          {
            workDir: getPulumiWorkDir(),
            envVars: {
              PULUMI_CONFIG_PASSPHRASE: "",
            },
            secretsProvider: "passphrase",
          }
        );

        // Destroy the stack
        await stack.destroy({ onOutput: () => {} });

        // Remove the stack
        await stack.workspace.removeStack(
          metadata.services.email?.pulumiStackName!
        );
      } catch (error: any) {
        throw new Error(`Failed to destroy Pulumi stack: ${error.message}`);
      }
    });
  }

  // 7. Delete connection metadata
  await deleteConnectionMetadata(identity.accountId, region);

  progress.info("Connection metadata deleted");

  // 8. Success message
  console.log(
    `\n${pc.green("✓")} ${pc.bold("Infrastructure removed successfully!")}\n`
  );
  console.log(
    `${pc.dim("All Wraps resources have been deleted from your AWS account.")}`
  );
  console.log(`${pc.dim("Your original AWS resources remain unchanged.")}\n`);
}
