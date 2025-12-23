import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import { trackError, trackServiceRemoved } from "../../telemetry/events.js";
import type { EmailRestoreOptions } from "../../types/index.js";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import { getPulumiWorkDir } from "../../utils/shared/fs.js";
import {
  deleteConnectionMetadata,
  loadConnectionMetadata,
} from "../../utils/shared/metadata.js";
import {
  DeploymentProgress,
  displayPreview,
} from "../../utils/shared/output.js";
import { previewWithResourceChanges } from "../../utils/shared/pulumi.js";

/**
 * Restore command - Remove Wraps infrastructure (alias for destroy)
 *
 * Note: This command removes all Wraps-managed resources.
 * Since Wraps always creates NEW resources (wraps- prefix) and never modifies
 * existing infrastructure, there's nothing to "restore" - only to remove.
 */
export async function restore(options: EmailRestoreOptions): Promise<void> {
  const startTime = Date.now();

  clack.intro(
    pc.bold(
      options.preview
        ? "Wraps Restore Preview"
        : "Wraps Restore - Remove Wraps Infrastructure"
    )
  );

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
      `Use ${pc.cyan("wraps email init")} or ${pc.cyan("wraps email connect")} to create a connection first.`
    );
    process.exit(1);
  }

  progress.info(`Found connection created: ${metadata.timestamp}`);

  // 4. Display what will be removed
  console.log(
    `\n${pc.bold("The following Wraps resources will be removed:")}\n`
  );

  if (metadata.services.email?.config.tracking?.enabled) {
    console.log(`  ${pc.cyan("✓")} Configuration Set (wraps-email-tracking)`);
  }
  if (metadata.services.email?.config.eventTracking?.dynamoDBHistory) {
    console.log(`  ${pc.cyan("✓")} DynamoDB Table (wraps-email-history)`);
  }
  if (metadata.services.email?.config.eventTracking?.enabled) {
    console.log(`  ${pc.cyan("✓")} EventBridge Rules`);
    console.log(`  ${pc.cyan("✓")} SQS Queues`);
    console.log(`  ${pc.cyan("✓")} Lambda Functions`);
  }
  console.log(`  ${pc.cyan("✓")} IAM Role (wraps-email-role)`);
  console.log("");

  // 5. Confirm removal (skip if --force or --preview)
  if (!(options.force || options.preview)) {
    const confirmed = await clack.confirm({
      message: "Proceed with removal? This cannot be undone.",
      initialValue: false,
    });

    if (clack.isCancel(confirmed) || !confirmed) {
      clack.cancel("Removal cancelled.");
      process.exit(0);
    }
  }

  // 6. Preview or Destroy Pulumi stack
  if (options.preview) {
    // PREVIEW MODE - show what would be destroyed without actually destroying
    if (metadata.services.email?.pulumiStackName) {
      try {
        const previewResult = await progress.execute(
          "Generating removal preview",
          async () => {
            const stack = await pulumi.automation.LocalWorkspace.selectStack(
              {
                stackName: metadata.services.email!.pulumiStackName!,
                projectName: "wraps-email",
                program: async () => {}, // Empty program for destroy
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

            // Run preview with resource change capture
            const result = await previewWithResourceChanges(stack, { diff: true });
            return result;
          }
        );

        // Display preview results with detailed resource changes
        displayPreview({
          changeSummary: previewResult.changeSummary,
          resourceChanges: previewResult.resourceChanges,
          costEstimate: "Monthly cost after removal: $0.00",
          commandName: "wraps email restore",
        });

        clack.outro(
          pc.green(
            "Preview complete. Run without --preview to remove infrastructure."
          )
        );

        // Track preview completion
        trackServiceRemoved("email", {
          preview: true,
          duration_ms: Date.now() - startTime,
        });
        return;
      } catch (error: any) {
        trackError("PREVIEW_FAILED", "email:restore", { step: "preview" });
        throw new Error(`Preview failed: ${error.message}`);
      }
    }
    return;
  }

  // DESTROY MODE - actually remove infrastructure
  if (metadata.services.email?.pulumiStackName) {
    await progress.execute("Removing Wraps infrastructure", async () => {
      try {
        if (!metadata.services.email?.pulumiStackName) {
          throw new Error("No Pulumi stack name found in metadata");
        }

        const stack = await pulumi.automation.LocalWorkspace.selectStack(
          {
            stackName: metadata.services.email.pulumiStackName,
            projectName: "wraps-email",
            program: async () => {}, // Empty program
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

        // Destroy the stack
        await stack.destroy({ onOutput: () => {} });

        // Remove the stack
        await stack.workspace.removeStack(
          metadata.services.email.pulumiStackName
        );
      } catch (error: any) {
        trackError("DESTROY_FAILED", "email:restore", { step: "destroy" });
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

  // 9. Track successful removal
  trackServiceRemoved("email", {
    reason: "user_initiated",
    duration_ms: Date.now() - startTime,
  });
}
