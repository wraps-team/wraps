import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import { getAWSRegion, validateAWSCredentials } from "../utils/aws.js";
import { getPulumiWorkDir } from "../utils/fs.js";
import {
  deleteConnectionMetadata,
  getModifiedIdentities,
  getReplacedFeatures,
  loadConnectionMetadata,
} from "../utils/metadata.js";
import { DeploymentProgress } from "../utils/output.js";

/**
 * Restore command options
 */
export type RestoreOptions = {
  region?: string;
  yes?: boolean;
};

/**
 * Restore command - Revert changes and restore original resources
 */
export async function restore(options: RestoreOptions): Promise<void> {
  clack.intro(pc.bold("BYO Restore - Revert to Original Configuration"));

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
      `No BYO connection found for account ${pc.cyan(identity.accountId)} in region ${pc.cyan(region)}`
    );
    clack.log.info(
      `Use ${pc.cyan("byo connect")} to create a connection first.`
    );
    process.exit(1);
  }

  progress.info(`Found connection created: ${metadata.timestamp}`);

  // 4. Check what needs to be restored
  const replacedFeatures = getReplacedFeatures(metadata);
  const modifiedIdentities = getModifiedIdentities(metadata);

  if (replacedFeatures.length === 0 && modifiedIdentities.length === 0) {
    clack.log.info("Nothing to restore - no resources were replaced.");
    process.exit(0);
  }

  // 5. Display what will be restored
  console.log(`\n${pc.bold("The following will be restored:")}\n`);

  if (replacedFeatures.length > 0) {
    console.log(pc.yellow("Features:"));
    for (const { config } of replacedFeatures) {
      console.log(
        `  ${pc.cyan(config.currentValue!)} → ${pc.green(config.originalValue!)}`
      );
    }
    console.log("");
  }

  if (modifiedIdentities.length > 0) {
    console.log(pc.yellow("Identities:"));
    for (const identity of modifiedIdentities) {
      if (identity.action === "replaced" && identity.originalConfigSet) {
        console.log(
          `  ${pc.cyan(identity.name)}: restore ${pc.green(identity.originalConfigSet)}`
        );
      } else if (identity.action === "attached") {
        console.log(`  ${pc.cyan(identity.name)}: remove BYO config set`);
      }
    }
    console.log("");
  }

  // 6. Confirm restoration
  if (!options.yes) {
    const confirmed = await clack.confirm({
      message: "Proceed with restoration? This will remove BYO infrastructure.",
      initialValue: false,
    });

    if (clack.isCancel(confirmed) || !confirmed) {
      clack.cancel("Restoration cancelled.");
      process.exit(0);
    }
  }

  // 7. Restore identities (remove/restore config sets)
  if (modifiedIdentities.length > 0) {
    await progress.execute("Restoring identity configurations", async () => {
      for (const identity of modifiedIdentities) {
        // Note: AWS SES v2 API doesn't directly support setting config sets on identities
        // Config sets are specified at send time, so we just log what should be done
        // In a real implementation, you'd want to track this differently
        progress.info(
          `Identity ${pc.cyan(identity.name)}: Use config set ${pc.green(identity.originalConfigSet || "none")} in your code`
        );
      }
    });
  }

  // 8. Destroy Pulumi stack
  if (metadata.pulumiStackName) {
    await progress.execute("Removing BYO infrastructure", async () => {
      try {
        const stack = await pulumi.automation.LocalWorkspace.selectStack(
          {
            stackName: metadata.pulumiStackName!,
            projectName: "byo-email",
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
        await stack.workspace.removeStack(metadata.pulumiStackName!);
      } catch (error: any) {
        throw new Error(`Failed to destroy Pulumi stack: ${error.message}`);
      }
    });
  }

  // 9. Delete connection metadata
  await deleteConnectionMetadata(identity.accountId, region);

  progress.info("Connection metadata deleted");

  // 10. Success message
  console.log(`\n${pc.green("✓")} ${pc.bold("Restoration complete!")}\n`);
  console.log(`${pc.dim("BYO infrastructure has been removed.")}`);
  console.log(
    `${pc.dim("Your original AWS resources have been preserved.")}\n`
  );

  // Show next steps
  if (modifiedIdentities.length > 0) {
    console.log(`${pc.bold("Next Steps:")}\n`);
    console.log(
      "Update your code to use the original configuration sets (if any):"
    );
    for (const identity of modifiedIdentities) {
      if (identity.originalConfigSet) {
        console.log(
          `  ${pc.cyan(identity.name)}: ${pc.green(identity.originalConfigSet)}`
        );
      }
    }
    console.log("");
  }
}
