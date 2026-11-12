import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import { trackError, trackServiceRemoved } from "../../telemetry/events.js";
import { findHostedZone } from "../../utils/route53.js";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import { WrapsError } from "../../utils/shared/errors.js";
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
  withLockRetry,
} from "../../utils/shared/pulumi.js";
import { requireAccountStateBackend } from "../../utils/shared/state-backend.js";

/**
 * Storage destroy command options
 */
export type CdnDestroyOptions = {
  region?: string;
  force?: boolean;
  preview?: boolean;
  json?: boolean;
};

/**
 * Storage Destroy command - Remove CDN infrastructure
 */
export async function cdnDestroy(options: CdnDestroyOptions): Promise<void> {
  await ensurePulumiInstalled();
  const startTime = Date.now();

  // JSON mode requires --force for destructive operations
  if (isJsonMode() && !options.force) {
    throw new WrapsError(
      "--force flag is required in JSON mode for destructive operations",
      "JSON_REQUIRES_FORCE",
      "Add --force flag: wraps cdn destroy --json --force"
    );
  }

  if (!isJsonMode()) {
    clack.intro(
      pc.bold(
        options.preview
          ? "CDN Infrastructure Destruction Preview"
          : "CDN Infrastructure Teardown"
      )
    );
  }

  const progress = new DeploymentProgress();

  // 1. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
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
    const cdnConnections = await findConnectionsWithService(
      identity.accountId,
      "cdn"
    );

    if (cdnConnections.length === 1) {
      region = cdnConnections[0].region;
    } else if (cdnConnections.length > 1) {
      if (isJsonMode()) {
        throw new WrapsError(
          "Multiple CDN deployments found. Specify --region flag.",
          "REGION_REQUIRED",
          `Available regions: ${cdnConnections.map((c) => c.region).join(", ")}`
        );
      }

      const selectedRegion = await clack.select({
        message: "Multiple CDN deployments found. Which region to destroy?",
        options: cdnConnections.map((conn) => ({
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

  // 3. Load connection metadata to get custom domain and stack name
  const metadata = await loadConnectionMetadata(identity.accountId, region);
  const cdnService = metadata?.services?.cdn;
  const cdnConfig = cdnService?.config;
  const customDomain = cdnConfig?.cdn?.customDomain;
  const storedStackName = cdnService?.pulumiStackName;

  // 4. Confirm destruction (skip if --force or --preview)
  if (!(options.force || options.preview)) {
    clack.log.warn(
      pc.yellow("This will delete your S3 bucket and all files in it!")
    );

    const confirmed = await clack.confirm({
      message: pc.red(
        "Are you sure you want to destroy all CDN infrastructure?"
      ),
      initialValue: false,
    });

    if (clack.isCancel(confirmed) || !confirmed) {
      clack.cancel("Destruction cancelled.");
      process.exit(0);
    }
  }

  // 5. Check for Route53 hosted zone and offer to clean up DNS
  let shouldCleanDNS = false;
  let hostedZone: { id: string; name: string } | null = null;

  if (customDomain && !options.preview) {
    hostedZone = await findHostedZone(customDomain, region);

    if (hostedZone) {
      if (options.force) {
        shouldCleanDNS = true; // Auto-clean with --force
      } else {
        const cleanDNS = await clack.confirm({
          message: `Found Route53 hosted zone for ${pc.cyan(customDomain)}. Delete DNS records?`,
          initialValue: true,
        });

        if (clack.isCancel(cleanDNS)) {
          clack.cancel("Destruction cancelled.");
          process.exit(0);
        }

        shouldCleanDNS = cleanDNS;
      }
    }
  }

  // 6. Preview or Destroy infrastructure using Pulumi
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
            storedStackName || `wraps-cdn-${identity.accountId}-${region}`;

          // Try to select the stack
          let stack;
          try {
            stack = await pulumi.automation.LocalWorkspace.selectStack({
              stackName,
              workDir: getPulumiWorkDir(),
            });
            // baseline:allow-next-line no-swallowed-errors — re-throws user-friendly message
          } catch (_error) {
            throw new Error("No CDN infrastructure found to preview");
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
        commandName: "wraps cdn destroy",
      });

      // Show DNS cleanup info
      if (customDomain) {
        const previewHostedZone = await findHostedZone(customDomain, region);
        if (previewHostedZone) {
          clack.log.info(
            `DNS records in Route53 for ${pc.cyan(customDomain)} will also be deleted`
          );
        }
      }

      clack.outro(
        pc.green("Preview complete. Run without --preview to destroy.")
      );

      // Track preview completion
      trackServiceRemoved("cdn", {
        preview: true,
        region,
        duration_ms: Date.now() - startTime,
      });
      return;
    } catch (error) {
      progress.stop();
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("No CDN infrastructure found")) {
        clack.log.warn("No CDN infrastructure found to preview");
        process.exit(0);
      }
      trackError("PREVIEW_FAILED", "storage destroy", { step: "preview" });
      throw new Error(`Preview failed: ${msg}`);
    }
  }

  // DESTROY MODE - actually remove infrastructure

  // Fail closed before the first delete. Every prompt is behind us (the guard
  // may create the state bucket), and the DNS records and every object in the
  // CDN bucket go after this. Outside every try/catch below.
  await progress.execute("Checking state backend", () =>
    requireAccountStateBackend(identity.accountId, region)
  );

  // 7. Clean up DNS records first
  if (shouldCleanDNS && hostedZone && customDomain) {
    try {
      await progress.execute(
        `Deleting DNS records for ${customDomain}`,
        async () => {
          await deleteCdnDNSRecords(hostedZone?.id, customDomain);
        }
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      clack.log.warn(`Could not delete DNS records: ${msg}`);
      clack.log.info("You may need to delete them manually from Route53");
    }
  }

  // 8. Empty the S3 bucket first (required before deletion)
  const bucketName = `wraps-cdn-${identity.accountId}`;
  try {
    await progress.execute(
      "Emptying S3 bucket (this may take a while for large buckets)",
      async () => {
        await emptyS3Bucket(bucketName, region);
      }
    );
  } catch (error) {
    // Bucket might not exist or already be empty
    const msg = error instanceof Error ? error.message : String(error);
    clack.log.info(`Note: ${msg}`);
  }

  // 9. Destroy Pulumi infrastructure
  try {
    await progress.execute(
      "Destroying CDN infrastructure (this may take 2-3 minutes)",
      async () => {
        // Use stored stack name from metadata, fallback to generated name
        const stackName =
          storedStackName || `wraps-cdn-${identity.accountId}-${region}`;

        // Try to select the stack
        let stack;
        try {
          stack = await pulumi.automation.LocalWorkspace.selectStack({
            stackName,
            workDir: getPulumiWorkDir(),
          });
          // baseline:allow-next-line no-swallowed-errors — re-throws user-friendly message
        } catch (_error) {
          throw new Error("No CDN infrastructure found to destroy");
        }

        // Run destroy with lock retry
        await withLockRetry(() => stack.destroy({ onOutput: () => {} }), {
          accountId: identity.accountId,
          region,
          autoConfirm: options.force,
        });

        // Remove the stack from workspace
        await stack.workspace.removeStack(stackName);
      }
    );
  } catch (error) {
    progress.stop();
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("No CDN infrastructure found")) {
      clack.log.warn("No CDN infrastructure found");
      // Still update metadata if it exists
      if (metadata) {
        removeServiceFromConnection(metadata, "cdn");
        await saveConnectionMetadata(metadata);
      }
      process.exit(0);
    }
    trackError("DESTROY_FAILED", "storage destroy", { step: "destroy" });
    clack.log.error("CDN infrastructure destruction failed");
    throw error;
  }

  // 10. Update connection metadata (remove CDN service)
  if (metadata) {
    removeServiceFromConnection(metadata, "cdn");
    // Save or delete based on remaining services
    const hasOtherServices = Object.keys(metadata.services).length > 0;
    if (hasOtherServices) {
      await saveConnectionMetadata(metadata);
    } else {
      // Delete the entire metadata file if no services remain
      const { deleteConnectionMetadata } = await import(
        "../../utils/shared/metadata.js"
      );
      await deleteConnectionMetadata(identity.accountId, region);
    }
  }

  // 11. Display success message
  progress.stop();

  if (isJsonMode()) {
    jsonSuccess("cdn.destroy", {
      destroyed: true,
      region,
      dns_cleaned: shouldCleanDNS,
    });
    trackServiceRemoved("cdn", {
      reason: "user_initiated",
      region,
      duration_ms: Date.now() - startTime,
      dns_cleaned: shouldCleanDNS,
    });
    return;
  }

  const deletedItems = ["S3 bucket and all files", "CloudFront distribution"];
  if (shouldCleanDNS && hostedZone) {
    deletedItems.push("Route53 DNS records");
  }

  clack.outro(pc.green("CDN infrastructure has been removed"));

  console.log(`\n${pc.bold("Cleaned up:")}`);
  for (const item of deletedItems) {
    console.log(`  ${pc.green("OK")} ${item}`);
  }

  console.log(
    `\nRun ${pc.cyan("wraps cdn init")} to deploy CDN infrastructure again.\n`
  );

  // 12. Track successful destruction
  trackServiceRemoved("cdn", {
    reason: "user_initiated",
    region,
    duration_ms: Date.now() - startTime,
    dns_cleaned: shouldCleanDNS,
  });
}

/**
 * Empty all objects from an S3 bucket
 */
async function emptyS3Bucket(
  bucketName: string,
  region: string
): Promise<void> {
  const { S3Client, ListObjectVersionsCommand, DeleteObjectsCommand } =
    await import("@aws-sdk/client-s3");

  const s3 = new S3Client({ region });

  // List and delete all object versions (handles versioned buckets)
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;

  do {
    const listResponse = await s3.send(
      new ListObjectVersionsCommand({
        Bucket: bucketName,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      })
    );

    const objectsToDelete = [
      ...(listResponse.Versions || []),
      ...(listResponse.DeleteMarkers || []),
    ].map((obj) => ({
      Key: obj.Key!,
      VersionId: obj.VersionId,
    }));

    if (objectsToDelete.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: { Objects: objectsToDelete },
        })
      );
    }

    keyMarker = listResponse.NextKeyMarker;
    versionIdMarker = listResponse.NextVersionIdMarker;
  } while (keyMarker);
}

/**
 * Delete DNS records for storage custom domain
 */
async function deleteCdnDNSRecords(
  hostedZoneId: string,
  customDomain: string
): Promise<void> {
  const {
    Route53Client,
    ListResourceRecordSetsCommand,
    ChangeResourceRecordSetsCommand,
  } = await import("@aws-sdk/client-route-53");

  const route53 = new Route53Client({ region: "us-east-1" });

  // List all records that match the custom domain
  const listResponse = await route53.send(
    new ListResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
    })
  );

  const recordsToDelete = (listResponse.ResourceRecordSets || []).filter(
    (record) => {
      const name = record.Name?.replace(/\.$/, "");
      // Match the custom domain and any ACM validation records
      return (
        name === customDomain ||
        (name?.includes("_") && name?.includes(customDomain))
      );
    }
  );

  if (recordsToDelete.length === 0) {
    return;
  }

  const changes = recordsToDelete.map((record) => ({
    Action: "DELETE" as const,
    ResourceRecordSet: record,
  }));

  await route53.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      ChangeBatch: { Changes: changes },
    })
  );
}
