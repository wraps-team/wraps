import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import { trackError, trackServiceRemoved } from "../../telemetry/events.js";
import type { DestroyOptions } from "../../types/index.js";
import { deleteDNSRecords, findHostedZone } from "../../utils/route53.js";
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
  deleteConnectionMetadata,
  findConnectionsWithService,
  loadConnectionMetadata,
} from "../../utils/shared/metadata.js";
import {
  DeploymentProgress,
  displayPreview,
} from "../../utils/shared/output.js";
import { previewWithResourceChanges } from "../../utils/shared/pulumi.js";

/**
 * Get DKIM tokens and MAIL FROM domain for a domain from SES
 */
async function getEmailIdentityInfo(
  domain: string,
  region: string
): Promise<{ dkimTokens: string[]; mailFromDomain?: string }> {
  try {
    const { SESv2Client, GetEmailIdentityCommand } = await import(
      "@aws-sdk/client-sesv2"
    );
    const ses = new SESv2Client({ region });

    const response = await ses.send(
      new GetEmailIdentityCommand({ EmailIdentity: domain })
    );

    return {
      dkimTokens: response.DkimAttributes?.Tokens || [],
      mailFromDomain: response.MailFromAttributes?.MailFromDomain,
    };
  } catch (_error) {
    return { dkimTokens: [] };
  }
}

/**
 * Email Destroy command - Remove email infrastructure
 */
export async function emailDestroy(options: DestroyOptions): Promise<void> {
  const startTime = Date.now();

  clack.intro(
    pc.bold(
      options.preview
        ? "Email Infrastructure Destruction Preview"
        : "Email Infrastructure Teardown"
    )
  );

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
    const emailConnections = await findConnectionsWithService(
      identity.accountId,
      "email"
    );

    if (emailConnections.length === 1) {
      // Auto-select the only available region
      region = emailConnections[0].region;
    } else if (emailConnections.length > 1) {
      // Multiple regions found - prompt user to select
      const selectedRegion = await clack.select({
        message: "Multiple email deployments found. Which region to destroy?",
        options: emailConnections.map((conn) => ({
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

  // 3. Load connection metadata to get domain info and stack name
  const metadata = await loadConnectionMetadata(identity.accountId, region);
  const emailService = metadata?.services?.email;
  const emailConfig = emailService?.config;
  const domain = emailConfig?.domain;
  const storedStackName = emailService?.pulumiStackName;

  // 4. Confirm destruction (skip if --force or --preview)
  if (!(options.force || options.preview)) {
    const confirmed = await clack.confirm({
      message: pc.red(
        "Are you sure you want to destroy all email infrastructure?"
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
  let dkimTokens: string[] = [];
  // Get mailFromDomain from metadata, or fall back to querying SES
  let mailFromDomain = emailConfig?.mailFromDomain;

  if (domain && !options.preview) {
    hostedZone = await findHostedZone(domain, region);

    if (hostedZone) {
      // Get DKIM tokens and MAIL FROM domain from SES before we destroy
      const identityInfo = await getEmailIdentityInfo(domain, region);
      dkimTokens = identityInfo.dkimTokens;
      // Use MAIL FROM from SES if not in metadata (handles legacy deployments)
      if (!mailFromDomain && identityInfo.mailFromDomain) {
        mailFromDomain = identityInfo.mailFromDomain;
      }

      if (options.force) {
        shouldCleanDNS = true; // Auto-clean with --force
      } else {
        const cleanDNS = await clack.confirm({
          message: `Found Route53 hosted zone for ${pc.cyan(domain)}. Delete DNS records (DKIM, DMARC, MAIL FROM)?`,
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
    try {
      const previewResult = await progress.execute(
        "Generating destruction preview",
        async () => {
          await ensurePulumiWorkDir();

          // Use stored stack name from metadata, fallback to generated name
          const stackName =
            storedStackName || `wraps-email-${identity.accountId}-${region}`;

          // Try to select the stack
          let stack;
          try {
            stack = await pulumi.automation.LocalWorkspace.selectStack({
              stackName,
              workDir: getPulumiWorkDir(),
            });
          } catch (_error) {
            throw new Error("No email infrastructure found to preview");
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
        commandName: "wraps email destroy",
      });

      // Show DNS cleanup info
      if (domain) {
        const previewHostedZone = await findHostedZone(domain, region);
        if (previewHostedZone) {
          clack.log.info(
            `DNS records in Route53 for ${pc.cyan(domain)} will also be deleted`
          );
        }
      }

      clack.outro(
        pc.green("Preview complete. Run without --preview to destroy.")
      );

      // Track preview completion
      trackServiceRemoved("email", {
        preview: true,
        region,
        duration_ms: Date.now() - startTime,
      });
      return;
    } catch (error: any) {
      progress.stop();
      if (error.message.includes("No email infrastructure found")) {
        clack.log.warn("No email infrastructure found to preview");
        process.exit(0);
      }
      trackError("PREVIEW_FAILED", "email destroy", { step: "preview" });
      throw new Error(`Preview failed: ${error.message}`);
    }
  }

  // DESTROY MODE - actually remove infrastructure

  // 7. Clean up DNS records first (before destroying SES identity)
  if (shouldCleanDNS && hostedZone && domain && dkimTokens.length > 0) {
    try {
      await progress.execute(`Deleting DNS records for ${domain}`, async () => {
        await deleteDNSRecords(
          hostedZone.id,
          domain,
          dkimTokens,
          region,
          emailConfig?.tracking?.customRedirectDomain,
          mailFromDomain
        );
      });
    } catch (error: any) {
      clack.log.warn(`Could not delete DNS records: ${error.message}`);
      clack.log.info("You may need to delete them manually from Route53");
    }
  }

  // 8. Destroy Pulumi infrastructure
  try {
    await progress.execute(
      "Destroying email infrastructure (this may take 2-3 minutes)",
      async () => {
        // Ensure Pulumi workspace directory exists
        await ensurePulumiWorkDir();

        // Use stored stack name from metadata, fallback to generated name
        const stackName =
          storedStackName || `wraps-email-${identity.accountId}-${region}`;

        // Try to select the stack
        let stack;
        try {
          stack = await pulumi.automation.LocalWorkspace.selectStack({
            stackName,
            workDir: getPulumiWorkDir(),
          });
        } catch (_error) {
          throw new Error("No email infrastructure found to destroy");
        }

        // Run destroy
        await stack.destroy({ onOutput: () => {} }); // Suppress Pulumi output

        // Remove the stack from workspace
        await stack.workspace.removeStack(stackName);
      }
    );
  } catch (error: any) {
    progress.stop();
    if (error.message.includes("No email infrastructure found")) {
      clack.log.warn("No email infrastructure found");
      // Still delete metadata if it exists
      await deleteConnectionMetadata(identity.accountId, region);
      process.exit(0);
    }
    // Check if it's a lock file error
    if (error.message?.includes("stack is currently locked")) {
      trackError("STACK_LOCKED", "email destroy", { step: "destroy" });
      throw errors.stackLocked();
    }
    trackError("DESTROY_FAILED", "email destroy", { step: "destroy" });
    clack.log.error("Email infrastructure destruction failed");
    throw error;
  }

  // 9. Delete connection metadata
  await deleteConnectionMetadata(identity.accountId, region);

  // 10. Display success message
  progress.stop();

  const deletedItems = ["AWS infrastructure"];
  if (shouldCleanDNS && hostedZone) {
    deletedItems.push("Route53 DNS records");
  }

  clack.outro(pc.green("Email infrastructure has been removed"));

  if (domain) {
    console.log(`\n${pc.bold("Cleaned up:")}`);
    for (const item of deletedItems) {
      console.log(`  ${pc.green("✓")} ${item}`);
    }

    // Remind about SPF record
    console.log(
      `\n${pc.dim("Note: SPF record was not deleted. Remove 'include:amazonses.com' manually if needed.")}`
    );
  }

  console.log(
    `\nRun ${pc.cyan("wraps email init")} to deploy infrastructure again.\n`
  );

  // 11. Track successful destruction
  trackServiceRemoved("email", {
    reason: "user_initiated",
    region,
    duration_ms: Date.now() - startTime,
    dns_cleaned: shouldCleanDNS,
  });
}
