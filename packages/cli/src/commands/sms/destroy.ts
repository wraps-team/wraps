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
import { errors, WrapsError } from "../../utils/shared/errors.js";
import { getPulumiWorkDir } from "../../utils/shared/fs.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import {
  findConnectionsWithService,
  loadConnectionMetadata,
  removeServiceFromConnection,
  saveConnectionMetadata,
} from "../../utils/shared/metadata.js";
import {
  DeploymentProgress,
  displayPreview,
} from "../../utils/shared/output.js";
import {
  ensurePulumiInstalled,
  previewWithResourceChanges,
} from "../../utils/shared/pulumi.js";
import { requireAccountStateBackend } from "../../utils/shared/state-backend.js";
import {
  DEFAULT_PULUMI_TIMEOUT_MS,
  withTimeout,
} from "../../utils/shared/timeout.js";

/**
 * SMS Destroy command - Remove SMS infrastructure
 */
export async function smsDestroy(options: SMSDestroyOptions): Promise<void> {
  await ensurePulumiInstalled();
  const startTime = Date.now();

  // JSON mode requires --force for destructive operations
  if (isJsonMode() && !options.force) {
    throw new WrapsError(
      "--force flag is required in JSON mode for destructive operations",
      "JSON_REQUIRES_FORCE",
      "Add --force flag: wraps sms destroy --json --force"
    );
  }

  if (!isJsonMode()) {
    clack.intro(
      pc.bold(
        options.preview
          ? "SMS Infrastructure Destruction Preview"
          : "SMS Infrastructure Teardown"
      )
    );
  }

  const progress = new DeploymentProgress();

  // 1. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  // 2. Get region (honor --region flag, then multi-region discovery, then default)
  let region = options.region || (await getAWSRegion());

  // Multi-region discovery: if no explicit region, check for SMS deployments
  if (
    !(
      options.region ||
      process.env.AWS_REGION ||
      process.env.AWS_DEFAULT_REGION
    )
  ) {
    const smsConnections = await findConnectionsWithService(
      identity.accountId,
      "sms"
    );

    if (smsConnections.length === 1) {
      // Auto-select the only available region
      region = smsConnections[0].region;
    } else if (smsConnections.length > 1) {
      if (isJsonMode()) {
        throw new WrapsError(
          "Multiple SMS deployments found. Specify --region flag.",
          "REGION_REQUIRED",
          `Available regions: ${smsConnections.map((c) => c.region).join(", ")}`
        );
      }

      // Multiple regions found - prompt user to select
      const selectedRegion = await clack.select({
        message: "Multiple SMS deployments found. Which region to destroy?",
        options: smsConnections.map((conn) => ({
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
    // Outside the try below so STATE_BACKEND_UNREACHABLE reaches the user unwrapped.
    await progress.execute("Checking state backend", () =>
      requireAccountStateBackend(identity.accountId, region)
    );
    try {
      const previewResult = await progress.execute(
        "Generating destruction preview",
        async () => {
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
            // baseline:allow-next-line no-swallowed-errors — re-throws user-friendly message
          } catch (_error) {
            throw new Error("No SMS infrastructure found to preview");
          }

          // Run preview with resource change capture
          const result = await previewWithResourceChanges(stack, {
            diff: true,
          });
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

  // Fail closed before the first delete. The only prompt is behind us (the
  // guard may create the state bucket). Outside every try/catch below: the
  // destroy catch marks the run partly failed and still deletes metadata,
  // which must never happen on stale local state.
  await progress.execute("Checking state backend", () =>
    requireAccountStateBackend(identity.accountId, region)
  );

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
  let destroyFailed = false;
  try {
    await progress.execute(
      "Destroying SMS infrastructure (this may take 2-3 minutes)",
      async () => {
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
          // baseline:allow-next-line no-swallowed-errors — re-throws user-friendly message
        } catch (_error) {
          throw new Error("No SMS infrastructure found to destroy");
        }

        // Refresh state to sync with actual AWS resources before destroying.
        // This prevents failures when resources were manually deleted or drifted.
        await stack.refresh({ onOutput: () => {} });

        // Run destroy with timeout protection.
        // continueOnError ensures partial deletes don't abort the entire operation.
        await withTimeout(
          stack.destroy({ onOutput: () => {}, continueOnError: true }),
          DEFAULT_PULUMI_TIMEOUT_MS,
          "Pulumi destroy"
        );

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
    destroyFailed = true;
    clack.log.warn(
      "Some resources may not have been fully removed. You can re-run this command or clean up manually in the AWS console."
    );
  }

  // 8. Remove SMS service from connection metadata (even on partial failure)
  if (metadata) {
    removeServiceFromConnection(metadata, "sms");
    await saveConnectionMetadata(metadata);
  }

  // 9. Display success or partial failure message
  progress.stop();

  if (isJsonMode()) {
    jsonSuccess("sms.destroy", {
      destroyed: !destroyFailed,
      region,
      partial_failure: destroyFailed,
    });
    trackServiceRemoved("sms", {
      reason: "user_initiated",
      partial_failure: destroyFailed,
      duration_ms: Date.now() - startTime,
    });
    return;
  }

  if (destroyFailed) {
    clack.outro(
      pc.yellow("SMS infrastructure partially removed. Metadata cleaned up.")
    );
  } else {
    clack.outro(pc.green("SMS infrastructure has been removed"));

    console.log(`\n${pc.bold("Cleaned up:")}`);
    console.log(`  ${pc.green("✓")} Phone number released`);
    console.log(`  ${pc.green("✓")} Configuration set deleted`);
    console.log(`  ${pc.green("✓")} Event processing infrastructure removed`);
    console.log(`  ${pc.green("✓")} IAM role deleted`);
  }

  console.log(
    `\nRun ${pc.cyan("wraps sms init")} to deploy infrastructure again.\n`
  );

  // 10. Track destruction
  trackServiceRemoved("sms", {
    reason: "user_initiated",
    partial_failure: destroyFailed,
    duration_ms: Date.now() - startTime,
  });
}
