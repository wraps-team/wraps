import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import {
  deleteSMSEventDestinationWithSDK,
  deleteSMSPhonePoolWithSDK,
  deleteSMSProtectConfigurationWithSDK,
} from "../../infrastructure/sms-stack.js";
import { trackError, trackServiceRemoved } from "../../telemetry/events.js";
import type { SMSDestroyOptions } from "../../types/index.js";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import { errors } from "../../utils/shared/errors.js";
import {
  ensurePulumiWorkDir,
  getPulumiWorkDir,
} from "../../utils/shared/fs.js";
import {
  loadConnectionMetadata,
  removeServiceFromConnection,
  saveConnectionMetadata,
} from "../../utils/shared/metadata.js";
import {
  DeploymentProgress,
  displayPreview,
} from "../../utils/shared/output.js";
import { previewWithResourceChanges } from "../../utils/shared/pulumi.js";

/**
 * SMS Destroy command - Remove SMS infrastructure
 */
export async function smsDestroy(options: SMSDestroyOptions): Promise<void> {
  const startTime = Date.now();

  clack.intro(
    pc.bold(
      options.preview
        ? "SMS Infrastructure Destruction Preview"
        : "SMS Infrastructure Teardown"
    )
  );

  const progress = new DeploymentProgress();

  // 1. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  // 2. Get region
  const region = await getAWSRegion();

  // 3. Load connection metadata to get stack name
  const metadata = await loadConnectionMetadata(identity.accountId, region);
  const smsService = metadata?.services?.sms;
  const storedStackName = smsService?.pulumiStackName;

  if (!smsService) {
    progress.stop();
    clack.log.warn("No SMS infrastructure found");
    process.exit(0);
  }

  // 4. Confirm destruction (skip if --force or --preview)
  if (!(options.force || options.preview)) {
    const confirmed = await clack.confirm({
      message: pc.red(
        "Are you sure you want to destroy all SMS infrastructure?"
      ),
      initialValue: false,
    });

    if (clack.isCancel(confirmed) || !confirmed) {
      clack.cancel("Destruction cancelled.");
      process.exit(0);
    }
  }

  // 5. Preview or Destroy infrastructure using Pulumi
  if (options.preview) {
    // PREVIEW MODE - show what would be destroyed without actually destroying
    try {
      const previewResult = await progress.execute(
        "Generating destruction preview",
        async () => {
          await ensurePulumiWorkDir();

          // Use stored stack name from metadata, fallback to generated name
          const stackName =
            storedStackName || `wraps-sms-${identity.accountId}-${region}`;

          // Try to select the stack
          let stack;
          try {
            stack = await pulumi.automation.LocalWorkspace.selectStack({
              stackName,
              workDir: getPulumiWorkDir(),
            });
          } catch (_error) {
            throw new Error("No SMS infrastructure found to preview");
          }

          // Run preview with resource change capture
          const result = await previewWithResourceChanges(stack, { diff: true });
          return result;
        }
      );

      // Display preview results with detailed resource changes
      displayPreview({
        changeSummary: previewResult.changeSummary,
        resourceChanges: previewResult.resourceChanges,
        costEstimate: "Monthly cost after destruction: $0.00",
        commandName: "wraps sms destroy",
      });

      clack.outro(
        pc.green("Preview complete. Run without --preview to destroy.")
      );

      // Track preview completion
      trackServiceRemoved("sms", {
        preview: true,
        duration_ms: Date.now() - startTime,
      });
      return;
    } catch (error: unknown) {
      progress.stop();
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (errorMessage.includes("No SMS infrastructure found")) {
        clack.log.warn("No SMS infrastructure found to preview");
        process.exit(0);
      }
      trackError("PREVIEW_FAILED", "sms destroy", { step: "preview" });
      throw new Error(`Preview failed: ${errorMessage}`);
    }
  }

  // DESTROY MODE - actually remove infrastructure

  // 6. Clean up SDK-created resources (phone pool and event destination)
  await progress.execute("Cleaning up phone pool", async () => {
    await deleteSMSPhonePoolWithSDK(region);
  });

  if (smsService.config?.eventTracking?.enabled) {
    await progress.execute("Cleaning up event destination", async () => {
      await deleteSMSEventDestinationWithSDK("wraps-sms-config", region);
    });
  }

  // Clean up protect configuration
  await progress.execute("Cleaning up protect configuration", async () => {
    await deleteSMSProtectConfigurationWithSDK(region);
  });

  // 7. Destroy Pulumi infrastructure
  try {
    await progress.execute(
      "Destroying SMS infrastructure (this may take 2-3 minutes)",
      async () => {
        await ensurePulumiWorkDir();

        // Use stored stack name from metadata, fallback to generated name
        const stackName =
          storedStackName || `wraps-sms-${identity.accountId}-${region}`;

        // Try to select the stack
        let stack;
        try {
          stack = await pulumi.automation.LocalWorkspace.selectStack({
            stackName,
            workDir: getPulumiWorkDir(),
          });
        } catch (_error) {
          throw new Error("No SMS infrastructure found to destroy");
        }

        // Run destroy
        await stack.destroy({ onOutput: () => {} }); // Suppress Pulumi output

        // Remove the stack from workspace
        await stack.workspace.removeStack(stackName);
      }
    );
  } catch (error: unknown) {
    progress.stop();
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes("No SMS infrastructure found")) {
      clack.log.warn("No SMS infrastructure found");
      // Still delete metadata if it exists
      if (metadata) {
        removeServiceFromConnection(metadata, "sms");
        await saveConnectionMetadata(metadata);
      }
      process.exit(0);
    }

    // Check if it's a lock file error
    if (errorMessage.includes("stack is currently locked")) {
      trackError("STACK_LOCKED", "sms destroy", { step: "destroy" });
      throw errors.stackLocked();
    }

    trackError("DESTROY_FAILED", "sms destroy", { step: "destroy" });
    clack.log.error("SMS infrastructure destruction failed");
    throw new Error(`SMS destruction failed: ${errorMessage}`);
  }

  // 7. Remove SMS service from connection metadata
  if (metadata) {
    removeServiceFromConnection(metadata, "sms");
    await saveConnectionMetadata(metadata);
  }

  // 8. Display success message
  progress.stop();

  clack.outro(pc.green("SMS infrastructure has been removed"));

  console.log(`\n${pc.bold("Cleaned up:")}`);
  console.log(`  ${pc.green("✓")} Phone number released`);
  console.log(`  ${pc.green("✓")} Configuration set deleted`);
  console.log(`  ${pc.green("✓")} Event processing infrastructure removed`);
  console.log(`  ${pc.green("✓")} IAM role deleted`);

  console.log(
    `\nRun ${pc.cyan("wraps sms init")} to deploy infrastructure again.\n`
  );

  // 9. Track successful destruction
  trackServiceRemoved("sms", {
    reason: "user_initiated",
    duration_ms: Date.now() - startTime,
  });
}
