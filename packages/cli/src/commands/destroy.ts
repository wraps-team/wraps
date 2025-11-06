import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import type { DestroyOptions } from "../types/index.js";
import { getAWSRegion, validateAWSCredentials } from "../utils/aws.js";
import { ensurePulumiWorkDir, getPulumiWorkDir } from "../utils/fs.js";
import { DeploymentProgress } from "../utils/output.js";

/**
 * Destroy command - Remove all deployed infrastructure
 */
export async function destroy(options: DestroyOptions): Promise<void> {
  clack.intro(pc.bold("BYO Email Infrastructure Teardown"));

  const progress = new DeploymentProgress();

  // 1. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  // 2. Get region
  const region = await getAWSRegion();

  // 3. Confirm destruction
  if (!options.yes) {
    const confirmed = await clack.confirm({
      message: pc.red(
        "Are you sure you want to destroy all BYO infrastructure?"
      ),
      initialValue: false,
    });

    if (clack.isCancel(confirmed) || !confirmed) {
      clack.cancel("Destruction cancelled.");
      process.exit(0);
    }
  }

  // 4. Destroy infrastructure using Pulumi
  try {
    await progress.execute(
      "Destroying infrastructure (this may take 2-3 minutes)",
      async () => {
        // Ensure Pulumi workspace directory exists
        await ensurePulumiWorkDir();

        const stackName = `byo-${identity.accountId}-${region}`;

        // Try to select the stack
        let stack;
        try {
          stack = await pulumi.automation.LocalWorkspace.selectStack({
            stackName,
            workDir: getPulumiWorkDir(),
          });
        } catch (_error) {
          throw new Error("No BYO infrastructure found to destroy");
        }

        // Run destroy
        await stack.destroy({ onOutput: () => {} }); // Suppress Pulumi output

        // Remove the stack from workspace
        await stack.workspace.removeStack(stackName);
      }
    );
  } catch (error: any) {
    progress.stop();
    if (error.message.includes("No BYO infrastructure found")) {
      clack.log.warn("No BYO infrastructure found");
      process.exit(0);
    }
    clack.log.error("Infrastructure destruction failed");
    throw error;
  }

  // 5. Display success message
  progress.stop();
  clack.outro(pc.green("All BYO infrastructure has been removed"));
  console.log(`\nRun ${pc.cyan("byo init")} to deploy infrastructure again.\n`);
}
