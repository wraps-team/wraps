import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import type { DestroyOptions } from "../../types/index.js";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import {
  ensurePulumiWorkDir,
  getPulumiWorkDir,
} from "../../utils/shared/fs.js";
import { deleteConnectionMetadata } from "../../utils/shared/metadata.js";
import { DeploymentProgress } from "../../utils/shared/output.js";

/**
 * Destroy command - Remove all deployed infrastructure
 */
export async function destroy(options: DestroyOptions): Promise<void> {
  clack.intro(pc.bold("Wraps Email Infrastructure Teardown"));

  const progress = new DeploymentProgress();

  // 1. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  // 2. Get region
  const region = await getAWSRegion();

  // 3. Confirm destruction
  if (!options.force) {
    const confirmed = await clack.confirm({
      message: pc.red(
        "Are you sure you want to destroy all Wraps infrastructure?"
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

        const stackName = `wraps-${identity.accountId}-${region}`;

        // Try to select the stack
        let stack;
        try {
          stack = await pulumi.automation.LocalWorkspace.selectStack({
            stackName,
            workDir: getPulumiWorkDir(),
          });
        } catch (_error) {
          throw new Error("No Wraps infrastructure found to destroy");
        }

        // Run destroy
        await stack.destroy({ onOutput: () => {} }); // Suppress Pulumi output

        // Remove the stack from workspace
        await stack.workspace.removeStack(stackName);
      }
    );
  } catch (error: any) {
    progress.stop();
    if (error.message.includes("No Wraps infrastructure found")) {
      clack.log.warn("No Wraps infrastructure found");
      // Still delete metadata if it exists
      await deleteConnectionMetadata(identity.accountId, region);
      process.exit(0);
    }
    clack.log.error("Infrastructure destruction failed");
    throw error;
  }

  // 5. Delete connection metadata
  await deleteConnectionMetadata(identity.accountId, region);

  // 6. Display success message
  progress.stop();
  clack.outro(pc.green("All Wraps infrastructure has been removed"));
  console.log(
    `\nRun ${pc.cyan("wraps email init")} to deploy infrastructure again.\n`
  );
}
