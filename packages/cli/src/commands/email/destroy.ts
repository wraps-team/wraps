import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import {
  EVENTBRIDGE_RULE_NAME,
  EVENTS_DLQ_NAME,
  EVENTS_QUEUE_NAME,
} from "@wraps/core";
import pc from "picocolors";
import { trackError, trackServiceRemoved } from "../../telemetry/events.js";
import type { WrapsEmailConfig } from "../../types/email.js";
import type { DestroyOptions } from "../../types/index.js";
import type { EmailDNSCleanupResult } from "../../utils/dns/index.js";
import {
  deleteReceiptRule,
  deleteReceiptRuleSet,
  RULE_NAME,
  RULE_SET_NAME,
} from "../../utils/email/receipt-rules.js";
import { deleteDNSRecords, findHostedZone } from "../../utils/route53.js";
import { createAgentApiClient } from "../../utils/shared/agent-api.js";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import { isAWSNotFoundError, WrapsError } from "../../utils/shared/errors.js";
import { getPulumiWorkDir } from "../../utils/shared/fs.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import {
  deleteConnectionMetadata,
  findConnectionsWithService,
  loadConnectionMetadata,
} from "../../utils/shared/metadata.js";
import {
  DeploymentProgress,
  displayPreview,
} from "../../utils/shared/output.js";
import {
  previewWithResourceChanges,
  withLockRetry,
} from "../../utils/shared/pulumi.js";
import { requireAccountStateBackend } from "../../utils/shared/state-backend.js";
import {
  DEFAULT_PULUMI_TIMEOUT_MS,
  withTimeout,
} from "../../utils/shared/timeout.js";

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
  } catch (error) {
    if (isAWSNotFoundError(error)) {
      return { dkimTokens: [] };
    }
    throw error;
  }
}

/**
 * Print the result of `deleteDNSRecords` — deleted/skipped/errored records.
 * Mirrors `reportInboundDNSCleanup` (`commands/email/inbound.ts`), the
 * inbound teardown's equivalent reporter.
 */
function reportEmailDNSCleanup(result: EmailDNSCleanupResult): void {
  for (const label of result.deleted) {
    clack.log.success(`Deleted DNS record: ${label}`);
  }
  for (const skip of result.skipped) {
    clack.log.warn(`Left DNS record in place: ${skip.record} (${skip.reason})`);
  }
  for (const err of result.errors) {
    clack.log.warn(`DNS cleanup error: ${err}`);
  }
}

export type DestroyAgentEntry = {
  id: string;
  name: string;
  emailAddress: string;
};

/**
 * Pick the agents that live in the email stack being torn down. Their scoped
 * credentials, the enforcer Lambda, and the policy table all live in this same
 * stack, so a destroy revokes them — the returned list drives both the consent
 * summary and the best-effort Neon status sync.
 */
export function selectAgentsToDestroy(
  emailConfig: WrapsEmailConfig | undefined
): DestroyAgentEntry[] {
  const agentsConfig = emailConfig?.agents;
  if (!agentsConfig?.enabled) {
    return [];
  }
  return (agentsConfig.agents ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    emailAddress: a.emailAddress,
  }));
}

/**
 * Build the "What will be destroyed" lines that spell out the agent blast
 * radius. Empty when the stack has no enabled agents.
 */
export function buildAgentDestroySummaryLines(
  agents: DestroyAgentEntry[]
): string[] {
  if (agents.length === 0) {
    return [];
  }
  const addresses = agents.map((a) => a.emailAddress).join(", ");
  return [
    "",
    `Agent mailboxes (${agents.length}): ${addresses}`,
    pc.yellow(
      "Agent scoped credentials are revoked (IAM users wraps-agent-* deleted), the wraps-agent-enforcer Lambda and wraps-email-agent-policy table are destroyed, and any pending approvals become undeliverable."
    ),
  ];
}

/**
 * Email Destroy command - Remove email infrastructure
 */
export async function emailDestroy(options: DestroyOptions): Promise<void> {
  const startTime = Date.now();

  // JSON mode requires --force for destructive operations
  if (isJsonMode() && !options.force) {
    throw new WrapsError(
      "--force flag is required in JSON mode for destructive operations",
      "JSON_REQUIRES_FORCE",
      "Add --force flag: wraps email destroy --json --force"
    );
  }

  if (!isJsonMode()) {
    clack.intro(
      pc.bold(
        options.preview
          ? "Email Infrastructure Destruction Preview"
          : "Email Infrastructure Teardown"
      )
    );
  }

  const progress = new DeploymentProgress();

  // 0. Ensure Pulumi CLI is installed
  await progress.execute("Checking Pulumi CLI installation", async () => {
    const { ensurePulumiInstalled } = await import(
      "../../utils/shared/pulumi.js"
    );
    await ensurePulumiInstalled();
  });

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
      if (isJsonMode()) {
        throw new WrapsError(
          "Multiple email deployments found. Specify --region flag.",
          "REGION_REQUIRED",
          `Available regions: ${emailConnections.map((c) => c.region).join(", ")}`
        );
      }

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
  const agentsToDestroy = selectAgentsToDestroy(emailConfig);
  const inboundEnabled = emailConfig?.inbound?.enabled === true;

  // 4. Confirm destruction (skip if --force or --preview)
  if (!(options.force || options.preview)) {
    const additionalDomainNames = (emailConfig?.additionalDomains ?? [])
      .map((d) => d.domain)
      .filter(Boolean);
    const domainList = [domain, ...additionalDomainNames].filter(Boolean);

    const summaryLines = [
      domainList.length > 0
        ? `Domain(s): ${domainList.join(", ")}`
        : "Domain(s): none configured",
      "SES configuration sets and event destinations for the above domain(s)",
      `Event pipeline: ${EVENTS_QUEUE_NAME} / ${EVENTS_DLQ_NAME} queues, wraps-email-event-processor Lambda, EventBridge rule ${EVENTBRIDGE_RULE_NAME}`,
      "",
      pc.yellow(
        "Event streaming stops: the Wraps dashboard email timeline and event history for THIS ENTIRE AWS ACCOUNT stop receiving events. Historical events in DynamoDB are destroyed with the table. This cannot be undone."
      ),
    ];

    summaryLines.push(...buildAgentDestroySummaryLines(agentsToDestroy));

    if (emailService?.webhookSecret) {
      summaryLines.push(
        "",
        pc.yellow(
          "This account is connected to the Wraps platform — the dashboard will stop receiving events for it."
        )
      );
    }

    clack.note(summaryLines.join("\n"), "What will be destroyed");

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

    // 4b. Typed confirmation gate for platform-connected accounts
    if (emailService?.webhookSecret) {
      const typed = await clack.text({
        message: `Type the AWS account id (${identity.accountId}) to confirm destruction of a platform-connected account:`,
      });

      if (clack.isCancel(typed) || typed !== identity.accountId) {
        clack.cancel("Destruction cancelled — account id did not match.");
        process.exit(0);
      }
    }
  } else if (options.force && emailService?.webhookSecret) {
    clack.log.warn(
      `--force skipped the typed account-id confirmation for platform-connected account ${identity.accountId}.`
    );
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
          message: `Found Route53 hosted zone for ${pc.cyan(domain)}. Delete the DNS records Wraps created (DKIM, DMARC, tracking CNAME, MAIL FROM)? Records Wraps did not create are left in place.`,
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
          // Note: init.ts creates stacks as `wraps-${accountId}-${region}` (without -email- prefix)
          const stackName =
            storedStackName || `wraps-${identity.accountId}-${region}`;

          // Try to select the stack
          let stack;
          try {
            stack = await pulumi.automation.LocalWorkspace.selectStack({
              stackName,
              workDir: getPulumiWorkDir(),
            });
            // baseline:allow-next-line no-swallowed-errors — stack not found means no infrastructure to preview
          } catch {
            throw new Error("No email infrastructure found to preview");
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

      // The SES receipt rule is managed through the SDK, not the stack, so
      // the stack preview can't show it.
      if (inboundEnabled) {
        clack.log.info(
          `SES receipt rule ${pc.cyan(RULE_NAME)} and rule set ${pc.cyan(RULE_SET_NAME)} will also be deleted`
        );
      }

      // Show agent blast radius so the operator sees leashed credentials go too.
      const agentSummaryLines = buildAgentDestroySummaryLines(agentsToDestroy);
      if (agentSummaryLines.length > 0) {
        clack.note(
          agentSummaryLines.filter(Boolean).join("\n"),
          "Agent mailboxes"
        );
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
    } catch (error) {
      progress.stop();
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("No email infrastructure found")) {
        clack.log.warn("No email infrastructure found to preview");
        process.exit(0);
      }
      trackError("PREVIEW_FAILED", "email destroy", { step: "preview" });
      throw new Error(`Preview failed: ${msg}`);
    }
  }

  // DESTROY MODE - actually remove infrastructure

  // Fail closed before the first delete. Every prompt is behind us (the guard
  // may create the state bucket), and receipt rules, DNS records and the stack
  // all go after this. Outside every try/catch below: the destroy catches mark
  // the run partly failed and carry on deleting, which must never happen on
  // stale local state.
  await progress.execute("Checking state backend", () =>
    requireAccountStateBackend(identity.accountId, region)
  );

  // 6b. Delete the inbound receipt rule and rule set before the stack, so no
  // rule is left pointing at a deleted bucket or function. Abort on any error
  // other than "already gone" (the helpers ignore RuleDoesNotExist /
  // RuleSetDoesNotExist): destroying the stack under a live rule would bounce
  // or drop inbound mail.
  if (inboundEnabled) {
    try {
      await progress.execute("Removing SES receipt rules", async () => {
        await deleteReceiptRule(region);
        await deleteReceiptRuleSet(region);
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const name = error instanceof Error ? error.name : "";
      const accessDenied =
        name === "AccessDenied" || name === "AccessDeniedException";
      trackError("RECEIPT_RULE_DELETE_FAILED", "email destroy", {
        step: "delete-receipt-rule",
        awsError: name || undefined,
      });
      throw new WrapsError(
        `Could not delete the SES receipt rule ${RULE_NAME} or rule set ${RULE_SET_NAME}: ${msg}. The email stack was not destroyed; the receipt rule or rule set may already be deleted or deactivated.`,
        "RECEIPT_RULE_DELETE_FAILED",
        accessDenied
          ? "Grant ses:DeleteReceiptRule, ses:DeleteReceiptRuleSet and ses:SetActiveReceiptRuleSet (see `wraps permissions --service email --json`), then run `wraps email destroy` again."
          : "Fix the SES error above (or wait and retry if SES throttled the call), then run `wraps email destroy` again.",
        "https://wraps.dev/docs/guides/aws-setup/permissions"
      );
    }
  }

  // 7. Clean up DNS records first (before destroying SES identity)
  if (shouldCleanDNS && hostedZone && domain && dkimTokens.length > 0) {
    try {
      const result = await progress.execute(
        `Deleting DNS records for ${domain}`,
        () =>
          deleteDNSRecords(
            hostedZone.id,
            domain,
            dkimTokens,
            region,
            emailConfig?.tracking?.customRedirectDomain,
            mailFromDomain
          )
      );
      reportEmailDNSCleanup(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      clack.log.warn(`Could not delete DNS records: ${msg}`);
      clack.log.info("You may need to delete them manually from Route53");
    }
  }

  // 8. Destroy Pulumi infrastructure
  let destroyFailed = false;
  try {
    await progress.execute(
      "Destroying email infrastructure (this may take 2-3 minutes)",
      async () => {
        // Use stored stack name from metadata, fallback to generated name
        // Note: init.ts creates stacks as `wraps-${accountId}-${region}` (without -email- prefix)
        const stackName =
          storedStackName || `wraps-${identity.accountId}-${region}`;

        // Try to select the stack
        let stack;
        try {
          stack = await pulumi.automation.LocalWorkspace.selectStack({
            stackName,
            workDir: getPulumiWorkDir(),
          });
          // baseline:allow-next-line no-swallowed-errors — stack not found means no infrastructure to destroy
        } catch {
          throw new Error("No email infrastructure found to destroy");
        }

        // Refresh state to sync with actual AWS resources before destroying.
        // This prevents failures when resources were manually deleted or drifted.
        await stack.refresh({ onOutput: () => {} });

        // Run destroy with timeout protection and lock retry.
        // continueOnError ensures partial deletes don't abort the entire operation.
        await withLockRetry(
          () =>
            withTimeout(
              stack.destroy({ onOutput: () => {}, continueOnError: true }),
              DEFAULT_PULUMI_TIMEOUT_MS,
              "Pulumi destroy"
            ),
          { accountId: identity.accountId, region, autoConfirm: options.force }
        );

        // Remove the stack from workspace
        await stack.workspace.removeStack(stackName);
      }
    );
  } catch (error) {
    progress.stop();
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("No email infrastructure found")) {
      clack.log.warn("No email infrastructure found");
      // Still delete metadata if it exists
      await deleteConnectionMetadata(identity.accountId, region);
      process.exit(0);
    }
    trackError("DESTROY_FAILED", "email destroy", { step: "destroy" });
    clack.log.error("Email infrastructure destruction failed");
    destroyFailed = true;
    clack.log.warn(
      "Some resources may not have been fully removed. You can re-run this command or clean up manually in the AWS console."
    );
  }

  // 9a. Best-effort SQS cleanup: Pulumi may skip the DLQ when the main queue
  // fails to confirm deletion (dependency skipping with continueOnError). If
  // either queue is still in AWS, delete it directly so the teardown is clean.
  if (destroyFailed) {
    try {
      const { SQSClient, GetQueueUrlCommand, DeleteQueueCommand } =
        await import("@aws-sdk/client-sqs");
      const sqsClient = new SQSClient({ region });
      for (const queueName of [EVENTS_QUEUE_NAME, EVENTS_DLQ_NAME]) {
        try {
          const { QueueUrl } = await sqsClient.send(
            new GetQueueUrlCommand({ QueueName: queueName })
          );
          if (QueueUrl) {
            await sqsClient.send(new DeleteQueueCommand({ QueueUrl }));
          }
          // baseline:allow-next-line no-swallowed-errors — best-effort cleanup
        } catch {}
      }
      // baseline:allow-next-line no-swallowed-errors — best-effort cleanup
    } catch {}
  }

  // 9b. Best-effort per-domain config set cleanup: these are created directly
  // via the AWS SDK (not Pulumi), so Pulumi destroy never touches them. Delete
  // each additional domain's config set to avoid leaking SES resources.
  try {
    const { SESv2Client, DeleteConfigurationSetCommand: DeleteConfigSet } =
      await import("@aws-sdk/client-sesv2");
    const sesv2 = new SESv2Client({ region });
    const additionalDomains = emailConfig?.additionalDomains ?? [];
    for (const d of additionalDomains) {
      if (!d.configSetName) continue;
      try {
        await sesv2.send(
          new DeleteConfigSet({ ConfigurationSetName: d.configSetName })
        );
        // baseline:allow-next-line no-swallowed-errors — best-effort cleanup
      } catch {}
    }
    // baseline:allow-next-line no-swallowed-errors — best-effort cleanup
  } catch {}

  // 9c. Best-effort: mark this stack's agents KILLED in Neon so the dashboard
  // doesn't keep showing live agents pointing at destroyed infra. The enforcer's
  // DynamoDB sync-back is expected to fail (the policy table is gone) — we only
  // care about the durable Neon status, so `syncStatus` is ignored here. Runs
  // AFTER the stack destroy so API availability can never block the teardown,
  // and is fully swallowed so it can never fail the destroy.
  if (agentsToDestroy.length > 0) {
    try {
      const agentApi = await createAgentApiClient();
      if (agentApi.ok) {
        let killed = 0;
        for (const agent of agentsToDestroy) {
          try {
            const resp = await agentApi.post(`/v1/agents/${agent.id}/kill`);
            if (resp.ok) {
              killed++;
            }
            // baseline:allow-next-line no-swallowed-errors — best-effort cleanup
          } catch {}
        }
        if (!isJsonMode()) {
          clack.log.info(
            `Marked ${killed}/${agentsToDestroy.length} agent(s) as killed in the Wraps dashboard.`
          );
        }
      } else if (!isJsonMode()) {
        clack.log.warn(
          "Could not reach the Wraps Platform to update agent status — your agents will still show as active in the dashboard. Kill them there: wraps email agent kill (or the dashboard)."
        );
      }
      // baseline:allow-next-line no-swallowed-errors — never fail destroy on cleanup
    } catch {}
  }

  // 9b. Delete connection metadata (even on partial failure, so user isn't stuck)
  await deleteConnectionMetadata(identity.accountId, region);

  // 10. Display success message
  progress.stop();

  if (isJsonMode()) {
    jsonSuccess("email.destroy", {
      destroyed: !destroyFailed,
      region,
      dns_cleaned: shouldCleanDNS,
      partial_failure: destroyFailed,
      agents: agentsToDestroy.map((a) => ({
        id: a.id,
        name: a.name,
        emailAddress: a.emailAddress,
      })),
    });
    trackServiceRemoved("email", {
      reason: "user_initiated",
      region,
      duration_ms: Date.now() - startTime,
      dns_cleaned: shouldCleanDNS,
      partial_failure: destroyFailed,
    });
    return;
  }

  if (destroyFailed) {
    clack.outro(
      pc.yellow("Email infrastructure partially removed. Metadata cleaned up.")
    );
    console.log(
      `\nRun ${pc.cyan("wraps email init")} to redeploy, or clean up remaining resources in the AWS console.\n`
    );
  } else {
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
  }

  // 11. Track destruction
  trackServiceRemoved("email", {
    reason: "user_initiated",
    region,
    duration_ms: Date.now() - startTime,
    dns_cleaned: shouldCleanDNS,
    partial_failure: destroyFailed,
  });
}
