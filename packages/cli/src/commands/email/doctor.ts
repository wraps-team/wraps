import { DeleteTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  DetachRolePolicyCommand,
  GetRolePolicyCommand,
  IAMClient,
  ListAttachedRolePoliciesCommand,
  ListRolePoliciesCommand,
} from "@aws-sdk/client-iam";
import { DeleteFunctionCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { DeleteConfigurationSetCommand, SESClient } from "@aws-sdk/client-ses";
import { DeleteTopicCommand, SNSClient } from "@aws-sdk/client-sns";
import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import { StackNotFoundError } from "@pulumi/pulumi/automation/index.js";
import pc from "picocolors";
import { trackCommand } from "../../telemetry/events.js";
import { domainToConfigSetName } from "../../utils/email/config-set-slug.js";
import {
  checkEventPipeline,
  type PipelineCheck,
} from "../../utils/email/event-pipeline-check.js";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import { findWrapsCloudFormationStacks } from "../../utils/shared/cloudformation.js";
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
import { buildConsolePolicyDocument } from "../platform/update-role.js";

/** The role `wraps platform connect` creates — never Pulumi-managed, never an orphan. */
const CONSOLE_ACCESS_ROLE = "wraps-console-access-role";
/** Pulumi's `notFoundRegex` (automation/errors.js) — a positive proof of absence. */
const NO_STACK_NAMED_REGEX = /no stack named/i;

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

/**
 * What the Pulumi probe proved. Only `absent` licenses the word "orphan":
 * `unknown` covers Pulumi-not-installed, S3 backend unreachable, expired
 * credentials — every case where a resource may well be owned by a stack this
 * machine cannot see.
 */
export type StackState = "present" | "absent" | "unknown";

type RowClassification = {
  status: DoctorFinding["status"];
  /** Undefined means "use this resource type's normal detail text". */
  details?: string;
  remediation?: DoctorFinding["remediation"];
};

/**
 * Decide what a single wraps-* resource's row says, in priority order:
 * something the CLI itself is known to have created on purpose (protected by
 * name) beats a CloudFormation stack owning it, which beats what the Pulumi
 * probe found. Only the last of those may ever say "orphan".
 */
function classifyResource(
  name: string,
  ctx: {
    protectedNames: Set<string>;
    stackState: StackState;
    region: string;
    cfStackName?: string;
  }
): RowClassification {
  if (ctx.protectedNames.has(name)) {
    return {
      status: "pass",
      details:
        name === CONSOLE_ACCESS_ROLE
          ? "managed by wraps platform connect"
          : "per-domain configuration set recorded in connection metadata",
    };
  }

  if (ctx.cfStackName) {
    return {
      status: "pass",
      details: `managed by CloudFormation stack ${ctx.cfStackName}`,
      remediation: remediations.cloudFormationManaged(ctx.cfStackName),
    };
  }

  if (ctx.stackState === "present") {
    return { status: "pass" };
  }

  if (ctx.stackState === "absent") {
    return {
      status: "warn",
      details: "orphan — no Pulumi state",
      // The scanned region is carried in the command: an orphan is by
      // definition a region with no connection metadata, so nothing
      // downstream can re-derive it and the bare command would target the
      // hardcoded default instead.
      remediation: remediations.cleanupOrphans(ctx.region),
    };
  }

  return {
    status: "info",
    details: "ownership unknown — could not read Pulumi state",
    remediation: remediations.stackStateUnknown(),
  };
}

function runResourceDiagnostics(
  wrapsResources: AWSResourceScan,
  stackState: StackState,
  region: string,
  protectedNames: Set<string>,
  cfStackName?: string
): DoctorFinding[] {
  const results: DoctorFinding[] = [];
  const ctx = { protectedNames, stackState, region, cfStackName };

  for (const cs of wrapsResources.configurationSets) {
    const c = classifyResource(cs.name, ctx);
    results.push({
      status: c.status,
      category: "SES Config Set",
      name: cs.name,
      details:
        c.details ?? `${cs.eventDestinations.length} event destination(s)`,
      remediation: c.remediation,
    });
  }

  for (const topic of wrapsResources.snsTopics) {
    const c = classifyResource(topic.name, ctx);
    results.push({
      status: c.status,
      category: "SNS Topic",
      name: topic.name,
      details: c.details,
      remediation: c.remediation,
    });
  }

  for (const table of wrapsResources.dynamoTables) {
    const c = classifyResource(table.name, ctx);
    const status = table.status === "ACTIVE" ? c.status : "warn";
    results.push({
      status,
      category: "DynamoDB Table",
      name: table.name,
      details: c.details ?? `Status: ${table.status}`,
      remediation: c.remediation,
    });
  }

  for (const fn of wrapsResources.lambdaFunctions) {
    const c = classifyResource(fn.name, ctx);
    results.push({
      status: c.status,
      category: "Lambda Function",
      name: fn.name,
      details: c.details ?? fn.runtime,
      remediation: c.remediation,
    });
  }

  for (const role of wrapsResources.iamRoles) {
    const c = classifyResource(role.name, ctx);
    results.push({
      status: c.status,
      category: "IAM Role",
      name: role.name,
      details: c.details,
      remediation: c.remediation,
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
  stackState: StackState;
  /** Only when the caller re-reads it: the raw probe failure, for the refusal message. */
  stackProbeError?: string;
  /**
   * `--cleanup` may run only when this is true: the Pulumi probe positively
   * proved "no stack" (not merely "could not tell"), and CloudFormation
   * ownership was checked and came back empty. Anything else means ownership
   * of at least one resource is unproven, and `--cleanup` must refuse.
   */
  cleanupAllowed: boolean;
  wrapsResources: AWSResourceScan;
  /** Resource names `--cleanup` must never delete, regardless of stack state. */
  protectedNames: Set<string>;
  /** Set when a Wraps CloudFormation stack was found to own this region's resources. */
  cfStackName?: string;
  /** False when CloudFormation ownership could not be checked (no cloudformation:DescribeStacks). */
  cfChecked: boolean;
};

/**
 * Names that are NEVER orphans regardless of Pulumi state, because something
 * other than Pulumi created them on purpose and the CLI can prove it:
 *   - the console role `platform connect` creates,
 *   - every per-domain configuration set recorded in connection metadata
 *     (created imperatively by `domains add`, plus the primary's set name).
 */
function protectedResourceNames(
  connection: ConnectionMetadata | undefined
): Set<string> {
  const names = new Set<string>([CONSOLE_ACCESS_ROLE]);
  if (!connection) {
    return names;
  }
  for (const d of getAllTrackedDomains(connection)) {
    names.add(d.configSetName ?? domainToConfigSetName(d.domain));
  }
  return names;
}

/**
 * The finding the incident actually needed: is the console role's inline
 * policy current with what this CLI version expects? Only runs when the
 * account is actually connected to the platform — an unconnected account has
 * no role to check. Never recommends `--cleanup` and is unaffected by
 * `stackState`: a stale policy is a permissions problem, not an ownership one.
 */
async function checkConsoleRolePolicy(
  connection: ConnectionMetadata,
  region: string
): Promise<DoctorFinding | undefined> {
  if (!connection.platform?.externalId) {
    return;
  }

  const iam = new IAMClient({ region }); // IAM is global — region is cosmetic
  try {
    const resp = await iam.send(
      new GetRolePolicyCommand({
        RoleName: CONSOLE_ACCESS_ROLE,
        PolicyName: "wraps-console-access-policy",
      })
    );
    const parsed = JSON.parse(
      decodeURIComponent(resp.PolicyDocument ?? "{}")
    ) as { Statement?: Array<{ Action?: string | string[] }> };

    const expected = new Set(
      buildConsolePolicyDocument(
        connection.services.email?.config,
        connection.services.sms?.config
      ).Statement.flatMap((s) => s.Action)
    );
    const live = new Set(
      (parsed.Statement ?? []).flatMap((s) => {
        if (Array.isArray(s.Action)) {
          return s.Action;
        }
        return s.Action ? [s.Action] : [];
      })
    );
    const missing = [...expected].filter((a) => !live.has(a));

    if (missing.length === 0) {
      return {
        status: "pass",
        category: "Platform Role",
        name: `${CONSOLE_ACCESS_ROLE} permissions current`,
      };
    }

    return {
      status: "warn",
      category: "Platform Role",
      name: `${CONSOLE_ACCESS_ROLE} is missing ${missing.length} permission(s)`,
      details:
        missing.slice(0, 5).join(", ") + (missing.length > 5 ? ", …" : ""),
      remediation: remediations.platformUpdateRole(region),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const notFound =
      error instanceof Error &&
      (error.name === "NoSuchEntityException" ||
        error.name === "NoSuchEntity" ||
        message.includes("NoSuchEntity"));
    if (notFound) {
      return {
        status: "fail",
        category: "Platform Role",
        name: `${CONSOLE_ACCESS_ROLE} not found`,
        remediation: remediations.platformUpdateRole(region),
      };
    }

    const accessDenied =
      error instanceof Error &&
      (error.name === "AccessDeniedException" ||
        error.name === "AccessDenied" ||
        message.includes("AccessDenied"));
    if (accessDenied) {
      return {
        status: "info",
        category: "Platform Role",
        name: `${CONSOLE_ACCESS_ROLE}: could not read the role policy (iam:GetRolePolicy)`,
        remediation: remediations.reviewPermissions(),
      };
    }

    // Anything else — throttling, a transient network failure, an error-name
    // variant the two checks above don't recognize — must not crash a
    // diagnostic command. Doctor is read-only and must always finish with a
    // report, even a degraded one.
    return {
      status: "info",
      category: "Platform Role",
      name: `${CONSOLE_ACCESS_ROLE}: could not check the role policy`,
      details: message,
      remediation: remediations.reviewPermissions(),
    };
  }
}

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
   * `--cleanup` needs that: it reads `stackState` to decide between "a stack
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
  // its answer cannot matter: `stackState` only labels orphan rows, and there
  // are none to label when the scan came back empty. The probe is not cheap —
  // `ensurePulumiWorkDir` resolves credentials and will CREATE the
  // `wraps-state-*` bucket on a miss, then Pulumi is spawned against that S3
  // backend — and `wraps doctor` runs this leg for every user with working
  // credentials, including ones who have never deployed anything.
  let stackState: StackState = "unknown";
  let stackProbeError: string | undefined;
  if (totalResources > 0 || params.probeStack) {
    try {
      await ensurePulumiWorkDir({ accountId, region });
      await pulumi.automation.LocalWorkspace.selectStack({
        stackName: `wraps-${accountId}-${region}`,
        workDir: getPulumiWorkDir(),
      });
      stackState = "present";
      // baseline:allow-next-line no-swallowed-errors — stack may not exist, Pulumi may not be installed
    } catch (error) {
      // "no stack named ... found" is a positive proof of absence — anything
      // else (Pulumi not installed, missing project file, S3 backend issues,
      // expired credentials) means we could not confirm stack state at all,
      // and a resource may well be owned by a stack this machine cannot see.
      // Doctor is a diagnostic tool and must not throw here.
      const message = error instanceof Error ? error.message : String(error);
      const notFound =
        error instanceof StackNotFoundError ||
        NO_STACK_NAMED_REGEX.test(message);
      stackState = notFound ? "absent" : "unknown";
      stackProbeError = notFound ? undefined : message;
    }
  }

  const emailConnection = connections.find((c) => c.region === region);
  const protectedNames = protectedResourceNames(emailConnection);

  // A Wraps CloudFormation stack owns resources the Pulumi probe never sees.
  // Only worth checking when the Pulumi probe did not already prove
  // ownership and there is something to protect.
  let cfStackName: string | undefined;
  let cfChecked = true;
  const findings: DoctorFinding[] = [];
  if (stackState !== "present" && totalResources > 0) {
    const cf = await findWrapsCloudFormationStacks(region);
    cfChecked = cf.checked;
    cfStackName = cf.stacks[0];
    if (!cf.checked) {
      findings.push({
        status: "info",
        category: "Email",
        name: "Could not list CloudFormation stacks (no cloudformation:DescribeStacks)",
        details: "Orphan detection is incomplete.",
        remediation: remediations.reviewPermissions(),
      });
    }
  }

  const cleanupAllowed = stackState === "absent" && !cfStackName && cfChecked;

  // If an email connection exists for this region, verify the SES ->
  // EventBridge -> SQS -> Lambda -> DynamoDB pipeline can actually deliver
  // events (see event-pipeline-check.ts for the hop-by-hop breakdown), and
  // whether the platform's console role permissions are current.
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

    const roleFinding = await checkConsoleRolePolicy(emailConnection, region);
    if (roleFinding) {
      findings.push(roleFinding);
    }
  }

  return {
    findings: [
      ...runResourceDiagnostics(
        wrapsResources,
        stackState,
        region,
        protectedNames,
        cfStackName
      ),
      ...pipelineResults,
      ...findings,
    ],
    totalResources,
    stackState,
    stackProbeError,
    cleanupAllowed,
    wrapsResources,
    protectedNames,
    cfStackName,
    cfChecked,
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
    stackState,
    stackProbeError,
    cleanupAllowed,
    wrapsResources,
    protectedNames,
    cfStackName,
  } = await progress.execute("Checking email infrastructure", async () =>
    collectEmailFindings({
      region,
      accountId: identity.accountId,
      connections: emailConnections,
      // The `--cleanup` branch below reads `stackState` even when the scan is
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
      if (cleanupAllowed) {
        // Structural, not a substring test on free text: the old gate
        // searched a finding's `details` for the word orphan, which could
        // never match an Event Pipeline finding, so `--cleanup` was a
        // guaranteed no-op every time the summary line recommended it.
        // Filtered straight off the scan (not off `results`) so the printed
        // enumeration and the actual deletion loop iterate the same lists.
        const toDelete = {
          configurationSets: wrapsResources.configurationSets.filter(
            (r) => !protectedNames.has(r.name)
          ),
          snsTopics: wrapsResources.snsTopics.filter(
            (r) => !protectedNames.has(r.name)
          ),
          dynamoTables: wrapsResources.dynamoTables.filter(
            (r) => !protectedNames.has(r.name)
          ),
          lambdaFunctions: wrapsResources.lambdaFunctions.filter(
            (r) => !protectedNames.has(r.name)
          ),
          iamRoles: wrapsResources.iamRoles.filter(
            (r) => !protectedNames.has(r.name)
          ),
        };
        const kept = [
          ...wrapsResources.configurationSets,
          ...wrapsResources.snsTopics,
          ...wrapsResources.dynamoTables,
          ...wrapsResources.lambdaFunctions,
          ...wrapsResources.iamRoles,
        ]
          .map((r) => r.name)
          .filter((name) => protectedNames.has(name));

        const orphanCount =
          toDelete.configurationSets.length +
          toDelete.snsTopics.length +
          toDelete.dynamoTables.length +
          toDelete.lambdaFunctions.length +
          toDelete.iamRoles.length;

        if (orphanCount > 0) {
          console.log(`\n  ${pc.bold("Will delete:")}`);
          for (const cs of toDelete.configurationSets) {
            console.log(`    ${pc.dim("SES config set:")}   ${cs.name}`);
          }
          for (const topic of toDelete.snsTopics) {
            console.log(`    ${pc.dim("SNS topic:")}        ${topic.name}`);
          }
          for (const table of toDelete.dynamoTables) {
            console.log(`    ${pc.dim("DynamoDB table:")}   ${table.name}`);
          }
          for (const fn of toDelete.lambdaFunctions) {
            console.log(`    ${pc.dim("Lambda function:")}  ${fn.name}`);
          }
          for (const role of toDelete.iamRoles) {
            console.log(`    ${pc.dim("IAM role:")}         ${role.name}`);
          }
          if (kept.length > 0) {
            console.log(
              `  ${pc.bold("Will keep (managed):")} ${kept.join(", ")}`
            );
          }
          console.log();

          const confirmed = await clack.confirm({
            message: `Delete these ${orphanCount} resource(s)? This cannot be undone.`,
            initialValue: false,
          });

          if (!clack.isCancel(confirmed) && confirmed) {
            await cleanupOrphanedResources(
              wrapsResources,
              region,
              protectedNames
            );
          }
        }
      } else if (stackState === "present") {
        clack.log.warn(
          // remediation:allow-literal — the --cleanup flag's own precondition message, not a finding's remedy
          `A Pulumi stack exists for this region. Use ${pc.cyan("wraps email destroy")} to remove managed resources, or ${pc.cyan("wraps email upgrade")} to reconcile.`
        );
      } else if (stackState === "unknown") {
        clack.log.warn(
          // remediation:allow-literal — the --cleanup flag's own precondition message, not a finding's remedy
          `Could not confirm Pulumi state${stackProbeError ? ` (${stackProbeError})` : ""}. Refusing to delete anything — fix the probe first (${pc.cyan("wraps aws doctor")}) or use ${pc.cyan("wraps email destroy")}.`
        );
      } else if (cfStackName) {
        clack.log.warn(
          // remediation:allow-literal — the --cleanup flag's own precondition message, not a finding's remedy
          `CloudFormation stack ${pc.cyan(cfStackName)} owns the wraps-* resources in this region. Refusing to delete anything — change or delete the stack in the CloudFormation console.`
        );
      } else {
        clack.log.warn(
          // remediation:allow-literal — the --cleanup flag's own precondition message, not a finding's remedy
          "Could not confirm CloudFormation ownership for this region (no cloudformation:DescribeStacks). Refusing to delete anything."
        );
      }
    }

    clack.outro(pc.dim("Done"));
  }
}

async function cleanupOrphanedResources(
  resources: AWSResourceScan,
  region: string,
  protectedNames: Set<string>
): Promise<void> {
  const ses = new SESClient({ region });
  const sns = new SNSClient({ region });
  const dynamo = new DynamoDBClient({ region });
  const lambda = new LambdaClient({ region });
  const iam = new IAMClient({ region });

  for (const cs of resources.configurationSets) {
    if (protectedNames.has(cs.name)) {
      clack.log.info(`Skipped ${cs.name} (managed)`);
      continue;
    }
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
    if (protectedNames.has(topic.name)) {
      clack.log.info(`Skipped ${topic.name} (managed)`);
      continue;
    }
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
    if (protectedNames.has(table.name)) {
      clack.log.info(`Skipped ${table.name} (managed)`);
      continue;
    }
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
    if (protectedNames.has(fn.name)) {
      clack.log.info(`Skipped ${fn.name} (managed)`);
      continue;
    }
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
    if (protectedNames.has(role.name)) {
      clack.log.info(`Skipped ${role.name} (managed)`);
      continue;
    }
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
