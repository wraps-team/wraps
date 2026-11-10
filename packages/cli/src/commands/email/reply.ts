import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import {
  GetParameterCommand,
  ParameterNotFound,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import { decodeReplyToken } from "@wraps/core";
import pc from "picocolors";
import { deployEmailStack } from "../../infrastructure/email-stack.js";
import type {
  EmailReplyDecodeOptions,
  EmailReplyDestroyOptions,
  EmailReplyInitOptions,
  EmailReplyRotateOptions,
  EmailReplyStatusOptions,
} from "../../types/index.js";
import { SES_RECEIVING_REGIONS } from "../../types/index.js";
import type { InboundDNSCleanupResult } from "../../utils/dns/index.js";
import { runEmailStackDeploy } from "../../utils/email/email-stack-deploy.js";
import {
  type ActiveRuleSetRead,
  addDomainToReceiptRule,
  confirmRuleSetActivation,
  deactivatedRuleSetName,
  describeInboundReceiptRule,
  describeRuleSetActivation,
  describeRuleSetDeactivation,
  type ExpectedActiveRuleSet,
  getReceiptRuleDomains,
  inboundInitRecoveryCommand,
  previousRuleSetUnreadable,
  REPLACE_NO_RULE_SET,
  type RuleSetActivation,
  readActiveReceiptRuleSet,
  removeDomainFromReceiptRule,
} from "../../utils/email/receipt-rules.js";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import { errors, WrapsError } from "../../utils/shared/errors.js";
import {
  ensurePulumiWorkDir,
  getPulumiWorkDir,
} from "../../utils/shared/fs.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import {
  buildEmailStackConfig,
  getInboundTrigger,
  loadConnectionMetadata,
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

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

const SSM_PARAM_PREFIX = "/wraps/email/reply-secret/";

type ReplyThreadingConfig = NonNullable<
  NonNullable<
    Awaited<ReturnType<typeof loadConnectionMetadata>>
  >["services"]["email"]
>["config"]["replyThreading"];

type ReplyDomainEntry = NonNullable<ReplyThreadingConfig>["domains"][number];

// The deploy seam lives in `utils/email/email-stack-deploy.ts` (shared with
// the inbound trigger switch). Re-exported so existing imports and tests that
// replace `deployHooks.deploy` keep working on the same object.
export {
  deployHooks,
  runEmailStackDeploy,
} from "../../utils/email/email-stack-deploy.js";

/**
 * Fetch the SSM parameter ARN + name for a given sending domain.
 */
async function getSSMParameterInfo(
  region: string,
  domain: string
): Promise<{ parameterArn: string; parameterName: string } | null> {
  const ssm = new SSMClient({ region });
  const parameterName = `${SSM_PARAM_PREFIX}${domain}`;
  try {
    const resp = await ssm.send(
      new GetParameterCommand({
        Name: parameterName,
        WithDecryption: false,
      })
    );
    if (!resp.Parameter?.ARN) {
      return null;
    }
    return {
      parameterArn: resp.Parameter.ARN,
      parameterName,
    };
  } catch (error) {
    if (
      error instanceof ParameterNotFound ||
      (error instanceof Error && error.name === "ParameterNotFound")
    ) {
      return null;
    }
    throw error;
  }
}

function ssmParameterName(domain: string): string {
  return `${SSM_PARAM_PREFIX}${domain}`;
}

function findInboundEntry(
  metadata: NonNullable<Awaited<ReturnType<typeof loadConnectionMetadata>>>,
  domain: string
): boolean {
  const inboundDomains = metadata.services.email?.config.inboundDomains ?? [];
  // Accept either the exact receivingDomain or the parent domain of an inbound entry
  return inboundDomains.some(
    (d) => d.parentDomain === domain || d.receivingDomain === domain
  );
}

function isReplyEnabledFor(
  metadata: NonNullable<Awaited<ReturnType<typeof loadConnectionMetadata>>>,
  domain: string
): boolean {
  const rt = metadata.services.email?.config.replyThreading;
  return Boolean(rt?.domains?.some((d) => d.domain === domain));
}

// ---------------------------------------------------------------------------
// replyInit
// ---------------------------------------------------------------------------

async function replyInitForSingleDomain(params: {
  domain: string;
  metadata: NonNullable<Awaited<ReturnType<typeof loadConnectionMetadata>>>;
  accountId: string;
  region: string;
  stackName: string;
  autoConfirm?: boolean;
  progress: DeploymentProgress;
  /** What the receipt-rule fallback may deactivate, agreed in replyInit's preflight. */
  expectedActive: ExpectedActiveRuleSet;
  /** Target domains after this one (`--all`), not started if this one's activation refuses. */
  laterDomains: string[];
}): Promise<{
  parameterArn: string;
  parameterName: string;
  dnsAutoCreated: boolean;
  /** The active-set read taken before this domain's rule write activated wraps-inbound-rules, or null. */
  activationRead: ActiveRuleSetRead | null;
}> {
  const {
    domain,
    metadata,
    accountId,
    region,
    stackName,
    progress,
    autoConfirm,
  } = params;

  const emailService = metadata.services.email;
  if (!emailService) {
    throw errors.inboundRequiresOutbound();
  }
  const emailConfig = emailService.config;

  // Generate the per-domain initial secret (32 random bytes, base64 encoded).
  const initialSecret = randomBytes(32).toString("base64");

  // Upsert into metadata: add/replace the entry for this domain with initialSecret.
  const replyThreading = emailConfig.replyThreading ?? {
    enabled: false,
    domains: [],
  };
  const filtered = replyThreading.domains.filter((d) => d.domain !== domain);
  filtered.push({
    domain,
    initialSecret,
    currentKid: 1,
    createdAt: new Date().toISOString(),
  });

  emailConfig.replyThreading = {
    enabled: true,
    domains: filtered,
  };

  // Save metadata BEFORE deploying so that Pulumi reads the initialSecret from
  // the stack config we pass in (buildEmailStackConfig uses the config object).
  metadata.timestamp = new Date().toISOString();
  await saveConnectionMetadata(metadata); // baseline:allow-early-save — initialSecret must be in metadata before the deploy reads it

  // Build stack config from the updated metadata.
  const stackConfig = buildEmailStackConfig(metadata, region);

  // Deploy stack — creates the SSM parameter on first deploy.
  await progress.execute(
    `Deploying reply-threading secret for ${domain}`,
    async () => {
      await runEmailStackDeploy({
        accountId,
        region,
        stackName,
        stackConfig,
        autoConfirm: params.autoConfirm,
      });
    }
  );

  // After deploy, fetch the SSM parameter ARN + name (Pulumi output is not
  // directly returned here — query SSM directly).
  const paramInfo = await getSSMParameterInfo(region, domain);
  if (!paramInfo) {
    throw new WrapsError(
      `SSM parameter for ${domain} was not created`,
      "REPLY_SECRET_PARAMETER_MISSING",
      `The Pulumi deploy completed but the SSM parameter ${ssmParameterName(domain)} was not found. Run:\n  wraps email reply status\nto diagnose, or retry the init.`,
      "https://wraps.dev/docs/guides/reply-threading"
    );
  }

  // Strip initialSecret; persist ARN/name.
  const finalEntry: ReplyDomainEntry = {
    domain,
    parameterArn: paramInfo.parameterArn,
    parameterName: paramInfo.parameterName,
    currentKid: 1,
    createdAt: filtered.find((d) => d.domain === domain)?.createdAt,
  };
  emailConfig.replyThreading = {
    enabled: true,
    domains: [
      ...emailConfig.replyThreading.domains.filter((d) => d.domain !== domain),
      finalEntry,
    ],
  };
  metadata.timestamp = new Date().toISOString();
  await saveConnectionMetadata(metadata); // baseline:allow-early-save — runs after runEmailStackDeploy above, which the file-level check doesn't recognise as a deploy

  // Register r.mail.{domain} in the catch-all receipt rule.
  const bucketName =
    emailConfig.inbound?.bucketName || `wraps-inbound-${accountId}-${region}`;
  // The fallback write recreates and activates the set when the rule is
  // missing. If the active set changed by then, this domain is already saved
  // and deployed, so a reply init re-run can't reach the activation: the
  // recovery re-activates through inbound init.
  const activation: RuleSetActivation = {
    expected: params.expectedActive,
    inPlace: `reply threading for ${domain} is saved and its stack deployed (the signing secret is in SSM), and wraps-inbound-rules and its receipt rule (listing r.mail.${domain}) exist but are inactive; DNS records for r.mail.${domain} were not written.${params.laterDomains.length > 0 ? ` Reply threading was not started for ${params.laterDomains.join(", ")}.` : ""}`,
    recovery: inboundInitRecoveryCommand(
      region,
      emailConfig.inbound,
      emailConfig.inboundDomains
    ),
    afterRecovery: [
      `Then add the r.mail.${domain} DNS records (MX 10 inbound-smtp.${region}.amazonaws.com, and TXT "v=spf1 include:amazonses.com ~all"); wraps email reply status checks the MX record.`,
      ...(params.laterDomains.length > 0
        ? [
            `Then run wraps email reply init --all --region ${region} to enable reply threading for ${params.laterDomains.join(", ")}.`,
          ]
        : []),
    ].join("\n"),
  };
  let activationRead: ActiveRuleSetRead | null = null;
  await progress.execute(
    `Adding r.mail.${domain} to receipt rule`,
    async () => {
      activationRead = await addDomainToReceiptRule(
        region,
        accountId,
        `r.mail.${domain}`,
        bucketName,
        getInboundTrigger(metadata),
        activation
      );
    }
  );

  // Attempt DNS auto-creation (best-effort, mirror inboundAdd).
  let dnsAutoCreated = false;
  try {
    const {
      detectAvailableDNSProviders,
      getDNSCredentials,
      createInboundDNSRecordsForProvider,
      buildInboundDNSRecords: buildRecords,
      getDNSProviderDisplayName,
      formatManualDNSInstructions,
      guardInboundDNSWrite,
    } = await import("../../utils/dns/index.js");

    const existingDnsProvider = metadata.services.email?.dnsProvider;
    let dnsProvider = existingDnsProvider;
    if (!dnsProvider || dnsProvider === "manual") {
      const availableProviders = await detectAvailableDNSProviders(
        domain,
        region
      );
      // Pick first non-manual detected provider, fallback to manual.
      const first = availableProviders.find(
        (p) => p.provider !== "manual" && p.detected
      );
      dnsProvider = first?.provider ?? "manual";
    }

    if (dnsProvider !== "manual") {
      const credentialResult = await getDNSCredentials(
        dnsProvider,
        domain,
        region
      );
      if (credentialResult.valid && credentialResult.credentials) {
        const replyDomain = `r.mail.${domain}`;
        await guardInboundDNSWrite({
          credentials: credentialResult.credentials,
          receivingDomain: replyDomain,
          region,
          parentDomain: domain,
          yes: autoConfirm ?? false,
        });

        const result = await createInboundDNSRecordsForProvider(
          credentialResult.credentials,
          replyDomain,
          region,
          domain
        );
        if (result.success) {
          progress.succeed(
            result.recordsCreated > 0
              ? `Created ${result.recordsCreated} DNS records for r.mail.${domain} via ${getDNSProviderDisplayName(dnsProvider)}`
              : `DNS already configured for r.mail.${domain}`
          );
          dnsAutoCreated = true;
        }
        // Printed regardless of success: a skipped SPF write (e.g. an
        // existing v=spf1 record) still reports `success: true` with the
        // MX created, and `errors` is the only place the "add
        // include:amazonses.com yourself" guidance is carried — without
        // this, the reply-threading path drops it silently.
        if (result.errors) {
          for (const err of result.errors) {
            clack.log.warn(err);
          }
        }
      }
    }

    if (!(dnsAutoCreated || isJsonMode())) {
      const dnsRecords = buildRecords(`r.mail.${domain}`, region);
      // eslint-disable-next-line no-console
      // biome-ignore lint/suspicious/noConsole: displaying DNS instructions for manual setup
      console.log();
      clack.note(
        formatManualDNSInstructions(dnsRecords),
        `DNS Records for r.mail.${domain} — Add these to your DNS provider`
      );
    }
  } catch (error) {
    // DNS auto-creation is best-effort; surface the error as a warning.
    clack.log.warn(
      `DNS auto-creation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return {
    parameterArn: paramInfo.parameterArn,
    parameterName: paramInfo.parameterName,
    dnsAutoCreated,
    activationRead,
  };
}

export async function replyInit(options: EmailReplyInitOptions): Promise<void> {
  if (!isJsonMode()) {
    clack.intro(pc.bold("Reply-Threading Secret Setup"));
  }

  const progress = new DeploymentProgress();

  await progress.execute("Checking prerequisites", async () =>
    ensurePulumiInstalled()
  );

  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  const region = options.region || (await getAWSRegion());

  if (
    !SES_RECEIVING_REGIONS.includes(
      region as (typeof SES_RECEIVING_REGIONS)[number]
    )
  ) {
    throw errors.inboundRegionNotSupported(region);
  }

  const metadata = await loadConnectionMetadata(identity.accountId, region);
  if (!metadata?.services?.email?.config?.inbound?.enabled) {
    throw new WrapsError(
      "Reply threading requires inbound email infrastructure",
      "REPLY_REQUIRES_INBOUND",
      "Deploy inbound first:\n  wraps email inbound init\n\nThen enable reply threading:\n  wraps email reply init --domain yourapp.com",
      "https://wraps.dev/docs/guides/reply-threading"
    );
  }

  const emailService = metadata.services.email;
  const emailConfig = emailService.config;
  const inboundDomains = emailConfig.inboundDomains ?? [];
  const parentDomains = [
    ...new Set(
      inboundDomains.map((d) => d.parentDomain).filter((d): d is string => !!d)
    ),
  ];

  if (parentDomains.length === 0) {
    throw new WrapsError(
      "No inbound domains configured",
      "REPLY_NO_INBOUND_DOMAINS",
      "Add an inbound domain first:\n  wraps email inbound add --domain yourapp.com",
      "https://wraps.dev/docs/guides/reply-threading"
    );
  }

  // Resolve target domain(s) to init.
  let targetDomains: string[];
  if (options.all) {
    // All: every parent inbound domain not already reply-enabled.
    targetDomains = parentDomains.filter(
      (d) => !isReplyEnabledFor(metadata, d)
    );
    if (targetDomains.length === 0) {
      clack.log.info(
        "All inbound domains already have reply-threading enabled."
      );
      if (isJsonMode()) {
        jsonSuccess("email.reply.init", {
          enabled: [],
          skipped: parentDomains,
          region,
        });
      }
      return;
    }
  } else if (options.domain) {
    const target = options.domain;
    if (!findInboundEntry(metadata, target)) {
      throw new WrapsError(
        `Domain ${target} is not configured for inbound email`,
        "REPLY_INBOUND_DOMAIN_NOT_FOUND",
        `Add it to inbound first:\n  wraps email inbound add ${target}`,
        "https://wraps.dev/docs/guides/reply-threading"
      );
    }
    if (isReplyEnabledFor(metadata, target)) {
      throw new WrapsError(
        `Reply threading is already enabled for ${target}`,
        "REPLY_ALREADY_ENABLED",
        `To rotate the signing secret, run:\n  wraps email reply rotate --domain ${target}`,
        "https://wraps.dev/docs/guides/reply-threading"
      );
    }
    targetDomains = [target];
  } else {
    throw new WrapsError(
      "Specify a domain or use --all",
      "REPLY_MISSING_DOMAIN",
      "Use one of:\n  wraps email reply init --domain yourapp.com\n  wraps email reply init --all",
      "https://wraps.dev/docs/guides/reply-threading"
    );
  }

  const stackName =
    emailService.pulumiStackName || `wraps-${identity.accountId}-${region}`;

  // Each domain's receipt-rule write recreates and activates
  // wraps-inbound-rules when the rule is missing. That write comes after the
  // per-domain metadata save and deploy, so decide here, once, before the
  // loop's first mutation: read the active set so a run that would
  // deactivate another set asks first or refuses (plan 048).
  const ruleMissing = (await describeInboundReceiptRule(region)) === null;
  const activeRuleSetRead: ActiveRuleSetRead = ruleMissing
    ? await readActiveReceiptRuleSet(region)
    : REPLACE_NO_RULE_SET;

  // Preview mode — show what Pulumi would create across all target domains,
  // using placeholder secrets (nothing is saved to disk or deployed).
  if (options.preview) {
    const previewResult = await progress.execute(
      "Generating infrastructure preview",
      async () => {
        // Build an in-memory config with all target domains added (placeholder secrets).
        const previewMetadata = JSON.parse(
          JSON.stringify(metadata)
        ) as typeof metadata;
        const previewEmailConfig = previewMetadata.services.email!.config;
        const rt = previewEmailConfig.replyThreading ?? {
          enabled: false,
          domains: [],
        };
        for (const domain of targetDomains) {
          const filtered = rt.domains.filter((d) => d.domain !== domain);
          filtered.push({
            domain,
            initialSecret: randomBytes(32).toString("base64"),
            currentKid: 1,
            createdAt: new Date().toISOString(),
          });
          rt.domains = filtered;
        }
        previewEmailConfig.replyThreading = {
          enabled: true,
          domains: rt.domains,
        };

        const stackConfig = buildEmailStackConfig(previewMetadata, region);

        await ensurePulumiWorkDir({ accountId: identity.accountId, region });
        const stack =
          await pulumi.automation.LocalWorkspace.createOrSelectStack(
            {
              stackName,
              projectName: "wraps-email",
              program: async () => {
                const result = await deployEmailStack(stackConfig);
                return result as Record<string, unknown>;
              },
            },
            {
              workDir: getPulumiWorkDir(),
            }
          );
        await stack.setConfig("aws:region", { value: region });
        return previewWithResourceChanges(stack, { diff: true });
      }
    );
    displayPreview({
      changeSummary: previewResult.changeSummary,
      resourceChanges: previewResult.resourceChanges,
      commandName: "wraps email reply init",
    });
    const deactivation = describeRuleSetDeactivation(activeRuleSetRead);
    if (deactivation) {
      clack.log.warn(deactivation);
    }
    clack.outro(pc.green("Preview complete. Run without --preview to deploy."));
    return;
  }

  // Consent (prompt, or refuse under --yes/--json without
  // --replace-active-rule-set) before any domain is saved or deployed.
  const expectedActive = await confirmRuleSetActivation({
    region,
    read: activeRuleSetRead,
    yes: options.yes,
    replaceActiveRuleSet: options.replaceActiveRuleSet,
  });

  const results: Array<{
    domain: string;
    parameterArn: string;
    parameterName: string;
    dnsAutoCreated: boolean;
    activationRead: ActiveRuleSetRead | null;
  }> = [];
  for (const [index, domain] of targetDomains.entries()) {
    // Reload metadata between domains (the earlier loop iteration saves to
    // disk) so we preserve the write-history of each per-domain init.
    const fresh = await loadConnectionMetadata(identity.accountId, region);
    if (!fresh) {
      throw errors.inboundRequiresOutbound();
    }
    const result = await replyInitForSingleDomain({
      domain,
      metadata: fresh,
      accountId: identity.accountId,
      region,
      stackName,
      autoConfirm: options.yes,
      progress,
      expectedActive,
      laterDomains: targetDomains.slice(index + 1),
    });
    results.push({ domain, ...result });
  }

  // At most one domain's write activates the set (the first that finds the
  // rule missing); the rest find it in place.
  const activationRead =
    results.find((r) => r.activationRead !== null)?.activationRead ?? null;
  const activationNote = describeRuleSetActivation(activationRead);
  if (activationNote) {
    clack.log.warn(activationNote);
  }

  if (isJsonMode()) {
    jsonSuccess("email.reply.init", {
      enabled: results.map((r) => ({
        domain: r.domain,
        parameterArn: r.parameterArn,
        parameterName: r.parameterName,
        dnsAutoCreated: r.dnsAutoCreated,
      })),
      region,
      deactivatedRuleSet: deactivatedRuleSetName(activationRead),
      previousRuleSetUnreadable: previousRuleSetUnreadable(activationRead),
    });
    return;
  }

  // biome-ignore lint/suspicious/noConsole: summary output for terminal users
  console.log();
  clack.log.success(pc.bold("Reply-threading enabled!"));
  for (const r of results) {
    // biome-ignore lint/suspicious/noConsole: summary output
    console.log(
      `  ${pc.dim(r.domain)} → ${pc.cyan(r.parameterName)} ${r.dnsAutoCreated ? pc.green("(DNS auto-created)") : pc.yellow("(manual DNS)")}`
    );
  }
  // biome-ignore lint/suspicious/noConsole: summary output
  console.log();
}

// ---------------------------------------------------------------------------
// replyRotate
// ---------------------------------------------------------------------------

export async function replyRotate(
  options: EmailReplyRotateOptions
): Promise<void> {
  if (!isJsonMode()) {
    clack.intro(pc.bold("Rotate Reply-Threading Secret"));
  }

  const progress = new DeploymentProgress();

  if (!options.domain) {
    throw new WrapsError(
      "--domain is required for rotate",
      "REPLY_ROTATE_MISSING_DOMAIN",
      "Usage:\n  wraps email reply rotate --domain yourapp.com",
      "https://wraps.dev/docs/guides/reply-threading"
    );
  }

  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );
  const region = options.region || (await getAWSRegion());

  const metadata = await loadConnectionMetadata(identity.accountId, region);
  if (!metadata?.services?.email?.config?.replyThreading) {
    throw new WrapsError(
      "Reply threading is not enabled",
      "REPLY_NOT_ENABLED",
      "Enable it first:\n  wraps email reply init --domain yourapp.com",
      "https://wraps.dev/docs/guides/reply-threading"
    );
  }

  const rt = metadata.services.email.config.replyThreading;
  const entry = rt.domains.find((d) => d.domain === options.domain);
  if (!entry) {
    throw new WrapsError(
      `Reply threading is not enabled for ${options.domain}`,
      "REPLY_DOMAIN_NOT_ENABLED",
      `Enable it first:\n  wraps email reply init --domain ${options.domain}`,
      "https://wraps.dev/docs/guides/reply-threading"
    );
  }

  const parameterName = entry.parameterName || ssmParameterName(options.domain);
  const currentKid = entry.currentKid ?? 1;
  const newKid = currentKid + 1;

  // Generate new secret.
  const newSecret = randomBytes(32).toString("base64");

  // Fetch the current parameter value to carry forward "current" → "previous".
  await progress.execute("Reading current secret", async () => {
    const ssm = new SSMClient({ region });
    let currentValue = "";
    try {
      const resp = await ssm.send(
        new GetParameterCommand({
          Name: parameterName,
          WithDecryption: true,
        })
      );
      currentValue = resp.Parameter?.Value || "";
    } catch (error) {
      if (
        error instanceof ParameterNotFound ||
        (error instanceof Error && error.name === "ParameterNotFound")
      ) {
        throw new WrapsError(
          `SSM parameter ${parameterName} not found`,
          "REPLY_SECRET_PARAMETER_MISSING",
          `The signing secret for ${options.domain} has not been created yet. Run:\n  wraps email reply init --domain ${options.domain}`,
          "https://wraps.dev/docs/guides/reply-threading"
        );
      }
      throw error;
    }

    let previousSecret: string | undefined;
    let previousKid: number | undefined;
    try {
      const parsed = JSON.parse(currentValue) as {
        kid: number;
        current: string;
        previous?: string;
      };
      previousSecret = parsed.current;
      previousKid = parsed.kid;
    } catch (err) {
      // JSON.parse failure on stored SSM value is a non-actionable edge case —
      // we write a fresh blob regardless. Re-throw anything that isn't a parse
      // error so unexpected failures don't get silently swallowed.
      if (!(err instanceof SyntaxError)) {
        throw err;
      }
      previousSecret = undefined;
      previousKid = undefined;
    }

    const newValue = JSON.stringify({
      kid: newKid,
      current: newSecret,
      ...(previousSecret ? { previous: previousSecret } : {}),
      ...(previousKid !== undefined ? { previousKid } : {}),
    });

    await ssm.send(
      new PutParameterCommand({
        Name: parameterName,
        Value: newValue,
        Type: "SecureString",
        Overwrite: true,
      })
    );
  });

  // Update metadata.
  const now = new Date().toISOString();
  const updated: ReplyDomainEntry = {
    ...entry,
    previousKid: currentKid,
    currentKid: newKid,
    rotatedAt: now,
  };
  metadata.services.email.config.replyThreading = {
    enabled: true,
    domains: rt.domains.map((d) => (d.domain === options.domain ? updated : d)),
  };
  metadata.timestamp = now;
  await saveConnectionMetadata(metadata);

  if (isJsonMode()) {
    jsonSuccess("email.reply.rotate", {
      domain: options.domain,
      currentKid: newKid,
      previousKid: currentKid,
      rotatedAt: now,
    });
    return;
  }

  // biome-ignore lint/suspicious/noConsole: summary output
  console.log();
  clack.log.success(
    `Rotated reply-threading secret for ${pc.cyan(options.domain)}`
  );
  // biome-ignore lint/suspicious/noConsole: summary output
  console.log(
    `  ${pc.dim("Grace window:")} SDK caches secrets for 5 min. Old tokens will continue to verify until both the Lambda's and your SDK processes' caches roll over (≤5 min).`
  );
  // biome-ignore lint/suspicious/noConsole: summary output
  console.log();
}

// ---------------------------------------------------------------------------
// replyStatus
// ---------------------------------------------------------------------------

type ReplyStatusEntry = {
  domain: string;
  currentKid: number | null;
  previousKid: number | null;
  rotatedAt: string | null;
  createdAt: string | null;
  parameterName: string;
  parameterExists: boolean;
  receiptRuleHasDomain: boolean;
  mxResolves: boolean;
};

export async function replyStatus(
  options: EmailReplyStatusOptions
): Promise<void> {
  if (!isJsonMode()) {
    clack.intro(pc.bold("Reply-Threading Status"));
  }

  const progress = new DeploymentProgress();

  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  const region = options.region || (await getAWSRegion());
  const metadata = await loadConnectionMetadata(identity.accountId, region);
  const rt = metadata?.services?.email?.config?.replyThreading;

  if (!rt?.enabled || rt.domains.length === 0) {
    if (isJsonMode()) {
      jsonSuccess("email.reply.status", {
        enabled: false,
        domains: [],
        region,
      });
      return;
    }
    clack.log.warn("Reply threading is not configured.");
    // biome-ignore lint/suspicious/noConsole: guidance output
    console.log(
      `\nEnable it: ${pc.cyan("wraps email reply init --domain yourapp.com")}\n`
    );
    return;
  }

  const ssm = new SSMClient({ region });
  const ruleDomains: string[] = await getReceiptRuleDomains(region).catch(
    () => [] as string[]
  );

  const entries: ReplyStatusEntry[] = [];
  for (const entry of rt.domains) {
    const parameterName = entry.parameterName || ssmParameterName(entry.domain);

    let parameterExists = false;
    try {
      await ssm.send(
        new GetParameterCommand({
          Name: parameterName,
          WithDecryption: false,
        })
      );
      parameterExists = true;
    } catch (error) {
      if (
        !(
          error instanceof ParameterNotFound ||
          (error instanceof Error && error.name === "ParameterNotFound")
        )
      ) {
        throw error;
      }
    }

    const receiptRuleHasDomain = ruleDomains.includes(`r.mail.${entry.domain}`);

    let mxResolves = false;
    try {
      const records = await dns.resolveMx(`r.mail.${entry.domain}`);
      mxResolves = records.some((r) => r.exchange.includes("inbound-smtp"));
    } catch (err) {
      // DNS failures we treat as "not resolvable" for status display:
      // ENOTFOUND, SERVFAIL, EAI_AGAIN, EAI_NODATA, ECONNREFUSED, ETIMEOUT.
      // Re-throw anything else (e.g. unexpected programming errors).
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      const expected = new Set([
        "ENOTFOUND",
        "SERVFAIL",
        "EAI_AGAIN",
        "EAI_NODATA",
        "ECONNREFUSED",
        "ETIMEOUT",
        "ENODATA",
      ]);
      if (code && !expected.has(code)) {
        throw err;
      }
      mxResolves = false;
    }

    entries.push({
      domain: entry.domain,
      currentKid: entry.currentKid ?? null,
      previousKid: entry.previousKid ?? null,
      rotatedAt: entry.rotatedAt ?? null,
      createdAt: entry.createdAt ?? null,
      parameterName,
      parameterExists,
      receiptRuleHasDomain,
      mxResolves,
    });
  }

  if (isJsonMode()) {
    jsonSuccess("email.reply.status", {
      enabled: true,
      region,
      domains: entries,
    });
    return;
  }

  // biome-ignore lint/suspicious/noConsole: status table output
  console.log();
  for (const e of entries) {
    // biome-ignore lint/suspicious/noConsole: status table output
    console.log(pc.bold(`  ${e.domain}`));
    // biome-ignore lint/suspicious/noConsole: status table output
    console.log(
      `    ${pc.dim("currentKid:")}   ${pc.cyan(String(e.currentKid ?? "—"))}`
    );
    // biome-ignore lint/suspicious/noConsole: status table output
    console.log(
      `    ${pc.dim("previousKid:")}  ${pc.cyan(String(e.previousKid ?? "—"))}`
    );
    // biome-ignore lint/suspicious/noConsole: status table output
    console.log(
      `    ${pc.dim("rotatedAt:")}    ${pc.cyan(e.rotatedAt ?? "never")}`
    );
    // biome-ignore lint/suspicious/noConsole: status table output
    console.log(
      `    ${pc.dim("createdAt:")}    ${pc.cyan(e.createdAt ?? "—")}`
    );
    // biome-ignore lint/suspicious/noConsole: status table output
    console.log(`    ${pc.dim("parameter:")}    ${pc.cyan(e.parameterName)}`);
    // biome-ignore lint/suspicious/noConsole: status table output
    console.log(
      `    ${pc.dim("ssm exists:")}   ${e.parameterExists ? pc.green("yes") : pc.red("no")}`
    );
    // biome-ignore lint/suspicious/noConsole: status table output
    console.log(
      `    ${pc.dim("in rule set:")}  ${e.receiptRuleHasDomain ? pc.green("yes") : pc.red("no")}`
    );
    // biome-ignore lint/suspicious/noConsole: status table output
    console.log(
      `    ${pc.dim("mx resolves:")}  ${e.mxResolves ? pc.green("yes") : pc.red("no")}`
    );
  }
  // biome-ignore lint/suspicious/noConsole: status table output
  console.log();
}

// ---------------------------------------------------------------------------
// replyDestroy
// ---------------------------------------------------------------------------

function stripDomainFromReplyThreadingMetadata(params: {
  domain: string;
  metadata: NonNullable<Awaited<ReturnType<typeof loadConnectionMetadata>>>;
}): void {
  const emailConfig = params.metadata.services.email?.config;
  if (!emailConfig) {
    return;
  }
  const rt = emailConfig.replyThreading;
  if (!rt) {
    return;
  }
  const remaining = rt.domains.filter((d) => d.domain !== params.domain);
  emailConfig.replyThreading = {
    enabled: remaining.length > 0,
    domains: remaining,
  };
}

const UNSUPPORTED_REPLY_DNS_CLEANUP: InboundDNSCleanupResult = {
  deleted: [],
  skipped: [],
  supported: false,
  errors: [],
};

/**
 * Delete the `r.mail.<domain>` MX/SPF records reply-threading created for
 * `domain`, resolving the provider/credentials from metadata. Never throws —
 * a DNS failure here must not abort `replyDestroy`, because the receipt-rule
 * change (or the stack redeploy before it) has already happened and aborting
 * would strand the user worse than a warning does.
 *
 * Absent or "manual" `dnsProvider` is treated as unsupported without
 * prompting or probing providers — teardown is not the moment to ask
 * someone to connect a DNS provider. `r.mail.<domain>` hangs off the sending
 * domain itself, so `domain` doubles as both the receiving name (prefixed)
 * and the parent domain passed to `deleteInboundDNSRecordsForProvider`.
 */
async function cleanupDomainInfra(params: {
  domain: string;
  region: string;
  progress: DeploymentProgress;
  metadata: NonNullable<Awaited<ReturnType<typeof loadConnectionMetadata>>>;
}): Promise<InboundDNSCleanupResult> {
  const { domain, region, progress, metadata } = params;
  await progress.execute(
    `Removing r.mail.${domain} from receipt rule`,
    async () => {
      await removeDomainFromReceiptRule(region, `r.mail.${domain}`);
    }
  );

  const dnsProvider = metadata.services.email?.dnsProvider;
  if (!dnsProvider || dnsProvider === "manual") {
    return UNSUPPORTED_REPLY_DNS_CLEANUP;
  }

  try {
    const { getDNSCredentials, deleteInboundDNSRecordsForProvider } =
      await import("../../utils/dns/index.js");
    const credentialResult = await getDNSCredentials(
      dnsProvider,
      domain,
      region
    );

    if (!(credentialResult.valid && credentialResult.credentials)) {
      clack.log.warn(
        `Could not validate ${dnsProvider} credentials to delete DNS records for r.mail.${domain}: ${credentialResult.error || "unknown error"}`
      );
      return UNSUPPORTED_REPLY_DNS_CLEANUP;
    }

    return await deleteInboundDNSRecordsForProvider(
      credentialResult.credentials,
      `r.mail.${domain}`,
      region,
      domain
    );
  } catch (error) {
    clack.log.warn(
      `Failed to delete DNS records for r.mail.${domain}: ${error instanceof Error ? error.message : String(error)}`
    );
    return UNSUPPORTED_REPLY_DNS_CLEANUP;
  }
}

/**
 * Print the result of `cleanupDomainInfra` — deleted/skipped/errored
 * records, and the legacy manual-cleanup reminder only when cleanup was
 * unsupported (no DNS provider on file, invalid credentials, or a thrown
 * error). Mirrors `reportInboundDNSCleanup` (`inbound.ts`) — not exported
 * there, and three similar lines beat a cross-module abstraction for a
 * ~18-line block used by two command files.
 */
function reportReplyDNSCleanup(
  result: InboundDNSCleanupResult,
  domain: string
): void {
  for (const label of result.deleted) {
    clack.log.success(`Deleted DNS record: ${label}`);
  }
  for (const skip of result.skipped) {
    clack.log.warn(`Left DNS record in place: ${skip.record} (${skip.reason})`);
  }
  for (const err of result.errors) {
    clack.log.warn(`DNS cleanup error: ${err}`);
  }
  if (!result.supported) {
    clack.log.info(
      `Remove MX/SPF DNS records for ${pc.cyan(`r.mail.${domain}`)} from your DNS provider.`
    );
  }
}

export async function replyDestroy(
  options: EmailReplyDestroyOptions
): Promise<void> {
  if (!isJsonMode()) {
    clack.intro(pc.bold("Remove Reply-Threading Secret"));
  }

  const progress = new DeploymentProgress();

  await progress.execute("Checking prerequisites", async () =>
    ensurePulumiInstalled()
  );

  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );
  const region = options.region || (await getAWSRegion());

  const metadata = await loadConnectionMetadata(identity.accountId, region);
  const rt = metadata?.services?.email?.config?.replyThreading;
  if (!(metadata && rt) || rt.domains.length === 0) {
    clack.log.warn("Reply threading is not configured.");
    return;
  }

  let targets: string[];
  if (options.all) {
    targets = rt.domains.map((d) => d.domain);
  } else if (options.domain) {
    targets = [options.domain];
  } else {
    throw new WrapsError(
      "Specify a domain or use --all",
      "REPLY_DESTROY_MISSING_DOMAIN",
      "Usage:\n  wraps email reply destroy --domain yourapp.com\n  wraps email reply destroy --all",
      "https://wraps.dev/docs/guides/reply-threading"
    );
  }

  // Confirm (skip in JSON mode, --force, or --preview).
  if (!(options.force || options.preview || isJsonMode())) {
    const confirmed = await clack.confirm({
      message: `Remove reply threading for ${targets.join(", ")}?`,
      initialValue: false,
    });
    if (clack.isCancel(confirmed) || !confirmed) {
      clack.cancel("Operation cancelled.");
      return;
    }
  }

  const emailService = metadata.services.email;

  // Preview mode — show what Pulumi would remove without deploying or saving.
  if (options.preview) {
    if (emailService) {
      const previewMetadata = JSON.parse(
        JSON.stringify(metadata)
      ) as typeof metadata;
      for (const domain of targets) {
        stripDomainFromReplyThreadingMetadata({
          domain,
          metadata: previewMetadata,
        });
      }
      const stackName =
        emailService.pulumiStackName || `wraps-${identity.accountId}-${region}`;
      const stackConfig = buildEmailStackConfig(previewMetadata, region);

      const previewResult = await progress.execute(
        "Generating infrastructure preview",
        async () => {
          await ensurePulumiWorkDir({ accountId: identity.accountId, region });
          const stack =
            await pulumi.automation.LocalWorkspace.createOrSelectStack(
              {
                stackName,
                projectName: "wraps-email",
                program: async () => {
                  const result = await deployEmailStack(stackConfig);
                  return result as Record<string, unknown>;
                },
              },
              {
                workDir: getPulumiWorkDir(),
              }
            );
          await stack.setConfig("aws:region", { value: region });
          return previewWithResourceChanges(stack, { diff: true });
        }
      );
      displayPreview({
        changeSummary: previewResult.changeSummary,
        resourceChanges: previewResult.resourceChanges,
        commandName: "wraps email reply destroy",
      });
    }
    clack.outro(
      pc.green("Preview complete. Run without --preview to destroy.")
    );
    return;
  }

  // Strip targeted domains from the in-memory metadata so the next Pulumi
  // diff drops the corresponding SSM parameters. No AWS side effects yet.
  for (const domain of targets) {
    stripDomainFromReplyThreadingMetadata({ domain, metadata });
  }

  // Redeploy stack FIRST so Pulumi removes the SSM parameter(s) whose metadata
  // entries are gone. If this fails, no receipt-rule or metadata-disk changes
  // have been committed yet — the user can safely re-run.
  if (emailService) {
    const stackName =
      emailService.pulumiStackName || `wraps-${identity.accountId}-${region}`;
    const stackConfig = buildEmailStackConfig(metadata, region);
    await progress.execute(
      "Redeploying email stack (removing SSM parameters)",
      async () => {
        await runEmailStackDeploy({
          accountId: identity.accountId,
          region,
          stackName,
          stackConfig,
          autoConfirm: options.force,
        });
      }
    );
  }

  // Pulumi succeeded: now commit the AWS SES receipt-rule removals, delete
  // the r.mail DNS records reply-threading created, and persist the
  // stripped metadata to disk. DNS cleanup runs before the metadata write —
  // a DNS failure must not leave metadata claiming the domain is gone while
  // DNS still points at SES.
  const dnsCleanupByDomain: Array<{
    domain: string;
    result: InboundDNSCleanupResult;
  }> = [];
  for (const domain of targets) {
    const result = await cleanupDomainInfra({
      domain,
      region,
      progress,
      metadata,
    });
    dnsCleanupByDomain.push({ domain, result });
  }

  await saveConnectionMetadata(metadata);

  if (isJsonMode()) {
    jsonSuccess("email.reply.destroy", {
      removed: targets,
      region,
      dnsDeleted: dnsCleanupByDomain.flatMap((d) => d.result.deleted),
      dnsSkipped: dnsCleanupByDomain.flatMap((d) => d.result.skipped),
      dnsSupported: dnsCleanupByDomain.some((d) => d.result.supported),
    });
    return;
  }

  // biome-ignore lint/suspicious/noConsole: summary output
  console.log();
  clack.log.success(`Removed reply threading for ${targets.join(", ")}.`);
  // biome-ignore lint/suspicious/noConsole: summary output
  console.log();
  for (const { domain, result } of dnsCleanupByDomain) {
    reportReplyDNSCleanup(result, domain);
  }
}

// ---------------------------------------------------------------------------
// replyDecode (pure local)
// ---------------------------------------------------------------------------

export async function replyDecode(
  addressInput: string,
  options?: EmailReplyDecodeOptions
): Promise<void> {
  const progress = new DeploymentProgress();

  if (!addressInput || typeof addressInput !== "string") {
    throw new WrapsError(
      "Usage: wraps email reply decode <token>@r.mail.yourapp.com",
      "REPLY_DECODE_MISSING_ADDRESS",
      "Provide a signed reply address like:\n  wraps email reply decode abcDEF123@r.mail.yourapp.com",
      "https://wraps.dev/docs/guides/reply-threading"
    );
  }

  const at = addressInput.lastIndexOf("@");
  if (at <= 0 || at >= addressInput.length - 1) {
    progress.fail("Malformed address");
    throw new WrapsError(
      "Address must be in the form <token>@r.mail.example.com",
      "REPLY_DECODE_MALFORMED_ADDRESS",
      "Pass a full signed reply address:\n  wraps email reply decode abcDEF123@r.mail.yourapp.com",
      "https://wraps.dev/docs/guides/reply-threading"
    );
  }

  const local = addressInput.slice(0, at);
  const host = addressInput.slice(at + 1);
  const sendingDomain = host.replace(/^r\.mail\./, "");

  const decoded = decodeReplyToken(local);
  if (!decoded) {
    if (isJsonMode() || options?.json) {
      jsonSuccess("email.reply.decode", {
        sendingDomain,
        decoded: null,
        status: "malformed",
      });
      return;
    }
    progress.fail("Malformed token");
    return;
  }

  const expIso =
    decoded.exp === 0 ? null : new Date(decoded.exp * 1000).toISOString();

  const output = {
    version: decoded.version,
    kid: decoded.kid,
    convId: decoded.convId.toString("hex"),
    sendId: decoded.sendId.toString("hex"),
    exp: decoded.exp,
    expIso,
    hmacHex: decoded.hmac.toString("hex"),
    sendingDomain,
  };

  if (isJsonMode() || options?.json) {
    jsonSuccess("email.reply.decode", {
      sendingDomain,
      decoded: output,
      status: "decoded",
    });
    return;
  }

  // biome-ignore lint/suspicious/noConsole: JSON print for interactive debug
  console.log(JSON.stringify(output, null, 2));
}
