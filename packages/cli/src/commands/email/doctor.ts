import { DeleteTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  DetachRolePolicyCommand,
  IAMClient,
  ListAttachedRolePoliciesCommand,
  ListRolePoliciesCommand,
} from "@aws-sdk/client-iam";
import { DeleteFunctionCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { DeleteConfigurationSetCommand, SESClient } from "@aws-sdk/client-ses";
import { DeleteTopicCommand, SNSClient } from "@aws-sdk/client-sns";
import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import pc from "picocolors";
import { trackCommand } from "../../telemetry/events.js";
import {
  checkEventPipeline,
  type PipelineCheck,
} from "../../utils/email/event-pipeline-check.js";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import {
  collectRemediations,
  type DoctorFinding,
  remediations,
} from "../../utils/shared/doctor-remediation.js";
import {
  ensurePulumiWorkDir,
  getPulumiWorkDir,
} from "../../utils/shared/fs.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import {
  type ConnectionMetadata,
  findConnectionsWithService,
  getAllTrackedDomains,
} from "../../utils/shared/metadata.js";
import { DeploymentProgress } from "../../utils/shared/output.js";
import {
  type AWSResourceScan,
  filterWrapsResources,
  scanAWSResources,
} from "../../utils/shared/scanner.js";

export type EmailDoctorOptions = {
  region?: string;
  json?: boolean;
  cleanup?: boolean;
};

function pipelineChecksToFindings(
  pipelineChecks: PipelineCheck[]
): DoctorFinding[] {
  return pipelineChecks.map((check) => ({
    status: check.status,
    category: "Event Pipeline",
    name: check.hop,
    details: check.details,
    remediation: check.remediation,
  }));
}

function runResourceDiagnostics(
  wrapsResources: AWSResourceScan,
  hasStack: boolean,
  region: string
): DoctorFinding[] {
  const results: DoctorFinding[] = [];

  // When no Pulumi stack exists, all wraps-* resources are orphaned
  const orphanSuffix = hasStack ? undefined : " (orphan — no Pulumi state)";
  const orphanStatus = hasStack ? "pass" : "warn";
  // Attached only to orphan rows. `--cleanup` deletes wraps-* resources with
  // no Pulumi state and nothing else, so this is the only finding class that
  // may ever recommend it. The scanned region is carried in the command: an
  // orphan is by definition a region with no connection metadata, so nothing
  // downstream can re-derive it and the bare command would target the
  // hardcoded default instead.
  const orphanRemediation = hasStack
    ? undefined
    : remediations.cleanupOrphans(region);

  for (const cs of wrapsResources.configurationSets) {
    results.push({
      status: orphanStatus,
      category: "SES Config Set",
      name: cs.name,
      details:
        orphanSuffix || `${cs.eventDestinations.length} event destination(s)`,
      remediation: orphanRemediation,
    });
  }

  for (const topic of wrapsResources.snsTopics) {
    results.push({
      status: orphanStatus,
      category: "SNS Topic",
      name: topic.name,
      details: orphanSuffix,
      remediation: orphanRemediation,
    });
  }

  for (const table of wrapsResources.dynamoTables) {
    const baseStatus = table.status === "ACTIVE" ? orphanStatus : "warn";
    results.push({
      status: baseStatus,
      category: "DynamoDB Table",
      name: table.name,
      details: orphanSuffix || `Status: ${table.status}`,
      remediation: orphanRemediation,
    });
  }

  for (const fn of wrapsResources.lambdaFunctions) {
    results.push({
      status: orphanStatus,
      category: "Lambda Function",
      name: fn.name,
      details: orphanSuffix || fn.runtime,
      remediation: orphanRemediation,
    });
  }

  for (const role of wrapsResources.iamRoles) {
    results.push({
      status: orphanStatus,
      category: "IAM Role",
      name: role.name,
      details: orphanSuffix,
      remediation: orphanRemediation,
    });
  }

  return results;
}

function displayDoctorResults(results: DoctorFinding[]): void {
  console.log();

  if (results.length === 0) {
    console.log(`  ${pc.dim("No wraps-* resources found")}`);
    console.log();
    return;
  }

  for (const result of results) {
    let icon: string;
    let color: (s: string) => string;

    switch (result.status) {
      case "pass":
        icon = "\u2713";
        color = pc.green;
        break;
      case "warn":
        icon = "!";
        color = pc.yellow;
        break;
      case "fail":
        icon = "\u2717";
        color = pc.red;
        break;
      case "info":
        icon = "i";
        color = pc.blue;
        break;
    }

    console.log(
      `  ${color(`[${icon}]`)} ${pc.dim(result.category)}: ${result.name}`
    );
    if (result.details) {
      console.log(`      ${pc.dim(result.details)}`);
    }
    if (result.remediation?.command) {
      console.log(
        `      ${pc.dim("fix:")} ${pc.cyan(result.remediation.command)}`
      );
    }
  }

  console.log();
}

/**
 * The remedy block. Never recommends `wraps email doctor --cleanup` unless an
 * orphan finding actually declared it: the old summary line fired on any fail,
 * and since `runResourceDiagnostics` never emits a fail, it was wrong 100% of
 * the time it appeared.
 */
function displayRemediations(results: DoctorFinding[]): void {
  const actionable = collectRemediations(
    results.filter((r) => r.status === "fail" || r.status === "warn")
  );
  if (actionable.length === 0) {
    return;
  }

  console.log();
  console.log(`  ${pc.bold("Suggested fixes:")}`);
  for (const remediation of actionable) {
    if (remediation.command) {
      console.log(
        `  ${pc.dim("-")} ${pc.cyan(remediation.command)}\n      ${pc.dim(remediation.summary)}`
      );
    } else {
      console.log(`  ${pc.dim("-")} ${pc.dim(remediation.summary)}`);
    }
  }
  console.log();
}

export type EmailFindings = {
  findings: DoctorFinding[];
  totalResources: number;
  hasStack: boolean;
  wrapsResources: AWSResourceScan;
};

/**
 * Everything `wraps email doctor` knows, with no rendering, no prompting and
 * no process exit — so `wraps doctor` can aggregate it. Region and accountId
 * are resolved by the caller.
 */
export async function collectEmailFindings(params: {
  region: string;
  accountId: string;
  /**
   * Already fetched by the caller. `emailDoctor` needs it before this call for
   * region auto-detection, and re-fetching here would read ~/.wraps twice per
   * run and let the two reads disagree.
   */
  connections: ConnectionMetadata[];
  /**
   * Force the Pulumi/S3 stack probe even when the scan found nothing. Only
   * `--cleanup` needs that: it reads `hasStack` to decide between "a stack
   * exists, use destroy/upgrade" and the orphan sweep, and it has to be able
   * to say so on an account with zero wraps-* resources.
   */
  probeStack?: boolean;
}): Promise<EmailFindings> {
  const { region, accountId, connections } = params;

  const scan = await scanAWSResources(region);
  const wrapsResources = filterWrapsResources(scan);

  const totalResources =
    wrapsResources.configurationSets.length +
    wrapsResources.snsTopics.length +
    wrapsResources.dynamoTables.length +
    wrapsResources.lambdaFunctions.length +
    wrapsResources.iamRoles.length;

  // Try to load the Pulumi stack to detect orphaned resources. Skipped when
  // its answer cannot matter: `hasStack` only labels orphan rows, and there
  // are none to label when the scan came back empty. The probe is not cheap —
  // `ensurePulumiWorkDir` resolves credentials and will CREATE the
  // `wraps-state-*` bucket on a miss, then Pulumi is spawned against that S3
  // backend — and `wraps doctor` runs this leg for every user with working
  // credentials, including ones who have never deployed anything.
  let hasStack = false;
  if (totalResources > 0 || params.probeStack) {
    try {
      await ensurePulumiWorkDir({ accountId, region });
      await pulumi.automation.LocalWorkspace.selectStack({
        stackName: `wraps-${accountId}-${region}`,
        workDir: getPulumiWorkDir(),
      });
      hasStack = true;
      // baseline:allow-next-line no-swallowed-errors — stack may not exist, Pulumi may not be installed
    } catch (_error) {
      // Any failure (stack not found, Pulumi not installed, missing project file,
      // S3 backend issues) means we can't confirm stack state — treat resources as
      // potentially orphaned. Doctor is a diagnostic tool and must not fail here.
      hasStack = false;
    }
  }

  // If an email connection exists for this region, verify the SES ->
  // EventBridge -> SQS -> Lambda -> DynamoDB pipeline can actually deliver
  // events (see event-pipeline-check.ts for the hop-by-hop breakdown).
  const emailConnection = connections.find((c) => c.region === region);
  let pipelineResults: DoctorFinding[] = [];
  if (emailConnection) {
    const emailService = emailConnection.services.email;
    // The full TrackedDomain is passed through, not just the name: isPrimary
    // and configSetName are what decide the remedy for a missing config set.
    const domains = emailService?.config
      ? getAllTrackedDomains(emailConnection).map((d) => ({
          domain: d.domain,
          isPrimary: d.isPrimary,
          configSetName: d.configSetName,
        }))
      : [];
    const expectPlatformWebhook = Boolean(emailService?.webhookSecret);

    pipelineResults = pipelineChecksToFindings(
      await checkEventPipeline({ region, domains, expectPlatformWebhook })
    );
  }

  return {
    findings: [
      ...runResourceDiagnostics(wrapsResources, hasStack, region),
      ...pipelineResults,
    ],
    totalResources,
    hasStack,
    wrapsResources,
  };
}

export async function emailDoctor(options: EmailDoctorOptions): Promise<void> {
  const startTime = Date.now();

  if (!isJsonMode()) {
    clack.intro(pc.bold("Wraps Email Doctor"));
  }

  const progress = new DeploymentProgress();

  // 1. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  // 2. Get region — auto-detect from metadata when not explicitly provided
  let region = options.region || (await getAWSRegion());

  // Fetched unconditionally: used both for region auto-detection below and
  // to locate the connection for this region's event-pipeline health check.
  const emailConnections = await findConnectionsWithService(
    identity.accountId,
    "email"
  );

  if (
    !(
      options.region ||
      process.env.AWS_REGION ||
      process.env.AWS_DEFAULT_REGION
    )
  ) {
    if (emailConnections.length === 1) {
      region = emailConnections[0].region;
    } else if (emailConnections.length > 1 && !isJsonMode()) {
      const selectedRegion = await clack.select({
        message: "Multiple email deployments found. Which region?",
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

  // 3-5. Everything that talks to AWS, in one collector so `wraps doctor` can
  // reuse it. Two spinner labels ("Scanning AWS resources" and "Checking event
  // pipeline") collapse into one here because the collector owns no progress.
  const {
    findings: results,
    totalResources,
    hasStack,
    wrapsResources,
  } = await progress.execute("Checking email infrastructure", async () =>
    collectEmailFindings({
      region,
      accountId: identity.accountId,
      connections: emailConnections,
      // The `--cleanup` branch below reads `hasStack` even when the scan is
      // empty, so it is the one caller that must pay for the probe regardless.
      probeStack: Boolean(options.cleanup),
    })
  );

  progress.stop();

  // Not the last statement any more, deliberately: it sits above the --json
  // early return so scripted runs report the same events interactive ones do.
  // Counting remedies is only useful if CI runs are counted too.
  trackCommand("email:doctor", {
    success: true,
    duration_ms: Date.now() - startTime,
    resource_count: totalResources,
    region,
    fail_count: results.filter((r) => r.status === "fail").length,
    warn_count: results.filter((r) => r.status === "warn").length,
    // ids only — `remediation.command` can embed a customer domain. Set:
    // remedies are deduped by id AND command, so two domains needing the same
    // kind of repair are two entries under one id.
    remediation_ids: [...new Set(collectRemediations(results).map((r) => r.id))]
      .sort()
      .join(","),
  });

  if (isJsonMode()) {
    jsonSuccess("email.doctor", {
      region,
      accountId: identity.accountId,
      resources: results.map((r) => ({
        category: r.category,
        name: r.name,
        status: r.status,
        details: r.details,
        ...(r.remediation ? { remediation: r.remediation } : {}),
      })),
      totalResources,
      remediations: collectRemediations(results),
    });
    return;
  }

  // 6. Display results
  if (results.length === 0) {
    clack.log.info("No wraps-* resources found in this region.");
    clack.outro(pc.dim("Your AWS account is clean."));
  } else {
    clack.log.info(
      `Found ${pc.bold(String(totalResources))} wraps-* resource(s) in ${pc.cyan(region)}`
    );
    displayDoctorResults(results);

    const failCount = results.filter((r) => r.status === "fail").length;
    const warnCount = results.filter((r) => r.status === "warn").length;

    if (failCount > 0) {
      clack.log.error(`${failCount} issue(s) found`);
    } else if (warnCount > 0) {
      clack.log.warn(`${warnCount} warning(s)`);
    } else {
      clack.log.success("All resources look healthy!");
    }

    displayRemediations(results);

    // 8. Cleanup orphaned resources if requested
    if (options.cleanup) {
      if (hasStack) {
        clack.log.warn(
          // remediation:allow-literal — the --cleanup flag's own precondition message, not a finding's remedy
          `A Pulumi stack exists for this region. Use ${pc.cyan("wraps email destroy")} to remove managed resources, or ${pc.cyan("wraps email upgrade")} to reconcile.`
        );
      } else {
        // Structural, not a substring test on free text: the old gate
        // searched a finding's `details` for the word orphan, which could
        // never match an Event Pipeline finding, so `--cleanup` was a
        // guaranteed no-op every time the summary line recommended it.
        const cleanupId = remediations.cleanupOrphans().id;
        const orphanCount = results.filter(
          (r) => r.remediation?.id === cleanupId
        ).length;

        if (orphanCount > 0) {
          const confirmed = await clack.confirm({
            message: `Delete ${orphanCount} orphaned wraps-* resource(s)?`,
          });

          if (!clack.isCancel(confirmed) && confirmed) {
            await cleanupOrphanedResources(wrapsResources, region);
          }
        }
      }
    }

    clack.outro(pc.dim("Done"));
  }
}

async function cleanupOrphanedResources(
  resources: AWSResourceScan,
  region: string
): Promise<void> {
  const ses = new SESClient({ region });
  const sns = new SNSClient({ region });
  const dynamo = new DynamoDBClient({ region });
  const lambda = new LambdaClient({ region });
  const iam = new IAMClient({ region });

  for (const cs of resources.configurationSets) {
    try {
      await ses.send(
        new DeleteConfigurationSetCommand({ ConfigurationSetName: cs.name })
      );
      clack.log.success(`Deleted config set: ${cs.name}`);
    } catch (error) {
      clack.log.error(
        `Failed to delete config set ${cs.name}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  for (const topic of resources.snsTopics) {
    try {
      await sns.send(new DeleteTopicCommand({ TopicArn: topic.arn }));
      clack.log.success(`Deleted SNS topic: ${topic.name}`);
    } catch (error) {
      clack.log.error(
        `Failed to delete SNS topic ${topic.name}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  for (const table of resources.dynamoTables) {
    try {
      await dynamo.send(new DeleteTableCommand({ TableName: table.name }));
      clack.log.success(`Deleted DynamoDB table: ${table.name}`);
    } catch (error) {
      clack.log.error(
        `Failed to delete DynamoDB table ${table.name}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  for (const fn of resources.lambdaFunctions) {
    try {
      await lambda.send(new DeleteFunctionCommand({ FunctionName: fn.name }));
      clack.log.success(`Deleted Lambda function: ${fn.name}`);
    } catch (error) {
      clack.log.error(
        `Failed to delete Lambda function ${fn.name}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  // Delete IAM roles (must remove all policies first)
  for (const role of resources.iamRoles) {
    try {
      // Delete inline policies
      const inlineResp = await iam.send(
        new ListRolePoliciesCommand({ RoleName: role.name })
      );
      for (const policyName of inlineResp.PolicyNames || []) {
        await iam.send(
          new DeleteRolePolicyCommand({
            RoleName: role.name,
            PolicyName: policyName,
          })
        );
      }

      // Detach managed policies
      const attachedResp = await iam.send(
        new ListAttachedRolePoliciesCommand({ RoleName: role.name })
      );
      for (const policy of attachedResp.AttachedPolicies || []) {
        await iam.send(
          new DetachRolePolicyCommand({
            RoleName: role.name,
            PolicyArn: policy.PolicyArn!,
          })
        );
      }

      await iam.send(new DeleteRoleCommand({ RoleName: role.name }));
      clack.log.success(`Deleted IAM role: ${role.name}`);
    } catch (error) {
      clack.log.error(
        `Failed to delete IAM role ${role.name}: ${error instanceof Error ? error.message : error}`
      );
    }
  }
}
