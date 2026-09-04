import {
  ArchiveState,
  CreateArchiveCommand,
  GetArchiveCommand,
  ListArchivesCommand,
  MailManagerClient,
} from "@aws-sdk/client-mailmanager";
import {
  GetAccountCommand,
  GetConfigurationSetCommand,
  GetConfigurationSetEventDestinationsCommand,
  PutConfigurationSetArchivingOptionsCommand,
  PutConfigurationSetDeliveryOptionsCommand,
  PutConfigurationSetReputationOptionsCommand,
  PutConfigurationSetSendingOptionsCommand,
  PutConfigurationSetSuppressionOptionsCommand,
  PutConfigurationSetVdmOptionsCommand,
  SESv2Client,
  UpdateConfigurationSetEventDestinationCommand,
} from "@aws-sdk/client-sesv2";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { trackCommand } from "../../telemetry/events.js";
import type { EmailDomainsConfigOptions } from "../../types/index.js";
import {
  createDNSRecordsForProvider,
  getDNSCredentials,
  getDNSProviderDisplayName,
} from "../../utils/dns/index.js";
import { domainToConfigSetName } from "../../utils/email/config-set-slug.js";
import {
  clearTrackingDomain,
  defaultTrackingDomain,
  isTrackingDomainNotReady,
  putTrackingDomain,
  TRACKING_DOMAIN_NONE,
  validateTrackingDomain,
} from "../../utils/email/tracking-domain.js";
import {
  describeTrackingHttpsError,
  disableDistribution,
  provisionTrackingHttps,
} from "../../utils/email/tracking-https.js";
import { resolveNegatableFlag } from "../../utils/shared/arg-parser.js";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import { WrapsError } from "../../utils/shared/errors.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import {
  findConnectionsWithService,
  loadConnectionMetadata,
  saveConnectionMetadata,
} from "../../utils/shared/metadata.js";
import { DeploymentProgress } from "../../utils/shared/output.js";

type DomainCandidate = {
  domain: string;
  configSetName: string;
  trackingConfig?: { opens: boolean; clicks: boolean };
  trackingDomain?: string;
  trackingHttps?: import("../../types/index.js").AdditionalDomain["trackingHttps"];
  additionalIndex?: number;
  tlsRequired?: boolean;
  reputationMetrics?: boolean;
  suppressionReasons?: ("BOUNCE" | "COMPLAINT")[];
  sendingEnabled?: boolean;
  archiveEnabled?: boolean;
  archiveArn?: string;
  vdmEngagement?: boolean;
  vdmInbox?: boolean;
};

async function findOrCreateEmailArchive(region: string): Promise<string> {
  const client = new MailManagerClient({ region });
  const baseName = "wraps-email-archive";
  const MAX_ATTEMPTS = 10;

  try {
    const listResult = await client.send(new ListArchivesCommand({}));
    const existing = listResult.Archives?.find(
      (a) =>
        a.ArchiveState === ArchiveState.ACTIVE && a.ArchiveName === baseName
    );
    if (existing?.ArchiveId) {
      const getResult = await client.send(
        new GetArchiveCommand({ ArchiveId: existing.ArchiveId })
      );
      if (getResult.ArchiveArn) return getResult.ArchiveArn;
    }
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    // fall through to creation if listing/getting archives fails
  }

  let archiveId: string | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const name = attempt === 1 ? baseName : `${baseName}-${attempt}`;
    try {
      const result = await client.send(
        new CreateArchiveCommand({
          ArchiveName: name,
          Retention: { RetentionPeriod: "EIGHTEEN_MONTHS" as const },
          Tags: [
            { Key: "ManagedBy", Value: "wraps-cli" },
            { Key: "Service", Value: "email" },
          ],
        })
      );
      archiveId = result.ArchiveId;
      break;
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "ConflictException" &&
        attempt < MAX_ATTEMPTS
      ) {
        continue;
      }
      throw error;
    }
  }

  if (!archiveId) throw new Error("Failed to create email archive");

  const getResult = await client.send(
    new GetArchiveCommand({ ArchiveId: archiveId })
  );
  if (!getResult.ArchiveArn) throw new Error("Failed to resolve archive ARN");
  return getResult.ArchiveArn;
}

export async function configDomain(
  options: EmailDomainsConfigOptions
): Promise<void> {
  if (!isJsonMode()) {
    clack.intro(pc.bold("Configure Domain Settings"));
  }

  const progress = new DeploymentProgress();

  try {
    const identity = await progress.execute(
      "Validating AWS credentials",
      async () => validateAWSCredentials()
    );

    let region = options.region || (await getAWSRegion());

    const emailConnections = await findConnectionsWithService(
      identity.accountId,
      "email"
    );

    if (emailConnections.length === 0) {
      progress.stop();
      clack.log.error("No email infrastructure found");
      console.log(
        `\nRun ${pc.cyan("wraps email init")} first to deploy email infrastructure.\n`
      );
      process.exit(1);
      return;
    }

    if (emailConnections.length === 1) {
      region = emailConnections[0].region;
    }

    const metadata = await loadConnectionMetadata(identity.accountId, region);

    if (!metadata?.services.email) {
      progress.stop();
      clack.log.error(`No email service found in ${region}`);
      process.exit(1);
      return;
    }

    const primaryDomain = metadata.services.email.config.domain;
    const additionalDomains =
      metadata.services.email.config.additionalDomains ?? [];

    const candidates: DomainCandidate[] = [
      ...(primaryDomain
        ? [
            {
              domain: primaryDomain,
              configSetName: domainToConfigSetName(primaryDomain),
              tlsRequired: metadata.services.email.config.tlsRequired,
              reputationMetrics:
                metadata.services.email.config.reputationMetrics,
              suppressionReasons:
                metadata.services.email.config.suppressionList?.reasons,
              sendingEnabled: metadata.services.email.config.sendingEnabled,
              archiveEnabled:
                metadata.services.email.config.emailArchiving?.enabled,
              vdmEngagement:
                metadata.services.email.config.vdmOptions
                  ?.engagementTrackingEnabled,
              vdmInbox:
                metadata.services.email.config.vdmOptions
                  ?.optimizedSharedDeliveryEnabled,
              trackingDomain:
                metadata.services.email.config.tracking?.customRedirectDomain,
            },
          ]
        : []),
      ...additionalDomains
        .map((d, i) => ({ d, i }))
        .filter(({ d }) => !!d.configSetName)
        .map(({ d, i }) => ({
          domain: d.domain,
          configSetName: d.configSetName!,
          trackingConfig: d.trackingConfig,
          trackingDomain: d.trackingDomain,
          trackingHttps: d.trackingHttps,
          additionalIndex: i,
          tlsRequired: d.tlsRequired,
          reputationMetrics: d.reputationMetrics,
          suppressionReasons: d.suppressionReasons,
          sendingEnabled: d.sendingEnabled,
          archiveEnabled: d.archiveEnabled,
          archiveArn: d.archiveArn,
          vdmEngagement: d.vdmEngagement,
          vdmInbox: d.vdmInbox,
        })),
    ];

    let targetDomain: string;
    if (!options.domain && (isJsonMode() || options.json)) {
      throw new WrapsError(
        "The --domain flag is required in JSON mode",
        "MISSING_REQUIRED_FLAG",
        "Provide --domain <domain>"
      );
    }
    if (options.domain) {
      targetDomain = options.domain;
    } else {
      if (candidates.length === 0) {
        progress.stop();
        clack.log.error(
          `No domains configured. Run ${pc.cyan("wraps email domains add")} first.`
        );
        process.exit(1);
        return;
      }
      const selected = await clack.select({
        message: "Which domain do you want to configure?",
        options: candidates.map((c) => ({
          value: c.domain,
          label: c.domain,
          hint: c.trackingConfig
            ? `opens ${c.trackingConfig.opens ? "on" : "off"} · clicks ${c.trackingConfig.clicks ? "on" : "off"}`
            : undefined,
        })),
      });
      if (clack.isCancel(selected)) {
        clack.cancel("Cancelled");
        process.exit(0);
        return;
      }
      targetDomain = selected;
    }

    const candidate = candidates.find((c) => c.domain === targetDomain);
    if (!candidate) {
      const needsUpgrade = additionalDomains.find(
        (d) => d.domain === targetDomain
      );
      if (needsUpgrade) {
        progress.stop();
        clack.log.error(
          `Domain ${targetDomain} has no configuration set. Run ${pc.cyan("wraps email upgrade")} first.`
        );
        process.exit(1);
        return;
      }
      progress.stop();
      clack.log.error(`Domain ${targetDomain} not found in Wraps metadata`);
      console.log(
        `\nRun ${pc.cyan(`wraps email domains add --domain ${targetDomain}`)} first.\n`
      );
      process.exit(1);
      return;
    }

    // Detect group flags — `options.*` can be true/false from direct calls;
    // `--no-X` in argv covers the CLI negated-flag path (see the helper).
    const flag = resolveNegatableFlag;

    const opensFlag = flag(options.opens, "--no-opens");
    const clicksFlag = flag(options.clicks, "--no-clicks");
    const tlsFlag = flag(options.tlsRequired, "--no-tls-required");
    const reputationFlag = flag(
      options.reputationMetrics,
      "--no-reputation-metrics"
    );
    const suppressBounceFlag = flag(
      options.suppressBounce,
      "--no-suppress-bounce"
    );
    const suppressComplaintFlag = flag(
      options.suppressComplaint,
      "--no-suppress-complaint"
    );
    const archiveFlag = flag(options.archive, "--no-archive");
    const sendingEnabledFlag = flag(
      options.sendingEnabled,
      "--no-sending-enabled"
    );
    const vdmEngagementFlag = flag(
      options.vdmEngagement,
      "--no-vdm-engagement"
    );
    const vdmInboxFlag = flag(options.vdmInbox, "--no-vdm-inbox");
    const trackingDomainFlag = options.trackingDomain;
    const trackingHttpsFlag = flag(
      options.trackingHttps,
      "--no-tracking-https"
    );

    const hasGroupFlags =
      [
        opensFlag,
        clicksFlag,
        tlsFlag,
        reputationFlag,
        suppressBounceFlag,
        suppressComplaintFlag,
        archiveFlag,
        sendingEnabledFlag,
        vdmEngagementFlag,
        vdmInboxFlag,
        trackingHttpsFlag,
      ].some((f) => f !== undefined) || trackingDomainFlag !== undefined;

    const sesClient = new SESv2Client({ region });

    if (hasGroupFlags) {
      await applyFlagMode({
        candidate,
        additionalDomains,
        metadata,
        sesClient,
        region,
        opensFlag,
        clicksFlag,
        tlsFlag,
        reputationFlag,
        suppressBounceFlag,
        suppressComplaintFlag,
        archiveFlag,
        sendingEnabledFlag,
        vdmEngagementFlag,
        vdmInboxFlag,
        trackingDomainFlag,
        trackingHttpsFlag,
        progress,
      });
      return;
    }

    // Interactive mode
    await applyInteractiveMode({
      candidate,
      additionalDomains,
      metadata,
      sesClient,
      region,
      progress,
      targetDomain,
    });
  } catch (error) {
    progress.stop();
    trackCommand("email:domains:config", { success: false });
    throw error;
  }
}

type ApplyContext = {
  candidate: DomainCandidate;
  additionalDomains: import("../../types/index.js").AdditionalDomain[];
  metadata: NonNullable<Awaited<ReturnType<typeof loadConnectionMetadata>>>;
  sesClient: SESv2Client;
  region: string;
  progress: DeploymentProgress;
};

async function saveMetadata(ctx: ApplyContext): Promise<void> {
  ctx.metadata.timestamp = new Date().toISOString();
  await saveConnectionMetadata(ctx.metadata);
}

function persistCandidateField<K extends keyof DomainCandidate>(
  ctx: ApplyContext,
  field: K,
  value: DomainCandidate[K]
): void {
  (ctx.candidate as DomainCandidate)[field] = value;
  if (ctx.candidate.additionalIndex !== undefined) {
    (
      ctx.additionalDomains[ctx.candidate.additionalIndex] as Record<
        string,
        unknown
      >
    )[field as string] = value;
  } else {
    const emailConfig = ctx.metadata.services.email!.config;
    switch (field) {
      case "tlsRequired":
        emailConfig.tlsRequired = value as boolean;
        break;
      case "reputationMetrics":
        emailConfig.reputationMetrics = value as boolean;
        break;
      case "sendingEnabled":
        emailConfig.sendingEnabled = value as boolean;
        break;
      case "suppressionReasons": {
        const reasons = value as ("BOUNCE" | "COMPLAINT")[];
        emailConfig.suppressionList = {
          enabled: reasons.length > 0,
          reasons,
        };
        break;
      }
      case "archiveEnabled":
        if (emailConfig.emailArchiving) {
          emailConfig.emailArchiving.enabled = value as boolean;
        } else {
          emailConfig.emailArchiving = {
            enabled: value as boolean,
            retention: "18months",
          };
        }
        break;
      case "archiveArn":
        // Primary domain ARN is managed by Pulumi (mail-manager.ts find-or-create).
        // No metadata field to update here — intentional no-op.
        break;
      case "trackingConfig": {
        const tc = value as { opens: boolean; clicks: boolean };
        if (!emailConfig.tracking) emailConfig.tracking = { enabled: true };
        emailConfig.tracking.opens = tc.opens;
        emailConfig.tracking.clicks = tc.clicks;
        break;
      }
      case "vdmEngagement":
        if (!emailConfig.vdmOptions) emailConfig.vdmOptions = {};
        emailConfig.vdmOptions.engagementTrackingEnabled = value as boolean;
        break;
      case "vdmInbox":
        if (!emailConfig.vdmOptions) emailConfig.vdmOptions = {};
        emailConfig.vdmOptions.optimizedSharedDeliveryEnabled =
          value as boolean;
        break;
      case "trackingDomain":
        // Primary is Pulumi-managed; never reached — applyTrackingDomain
        // refuses the primary domain before calling persistCandidateField.
        break;
      case "trackingHttps":
        // Primary's HTTPS tracking is Pulumi-managed; never reached — the
        // trackingHttps flag/menu refuses the primary domain the same way.
        break;
    }
  }
}

// --- Group handlers ---

async function applyTracking(
  ctx: ApplyContext,
  opens: boolean,
  clicks: boolean
): Promise<void> {
  const destResponse = await ctx.sesClient.send(
    new GetConfigurationSetEventDestinationsCommand({
      ConfigurationSetName: ctx.candidate.configSetName,
    })
  );

  const dest = destResponse.EventDestinations?.find(
    (d) => d.Name === "wraps-email-eventbridge"
  );

  if (!dest) {
    throw new WrapsError(
      `Event destination not found for ${ctx.candidate.domain}. Run ${pc.cyan("wraps email upgrade")} first.`,
      "EVENT_DESTINATION_NOT_FOUND",
      "Run wraps email upgrade"
    );
  }

  const eventBusArn = dest.EventBridgeDestination?.EventBusArn;
  if (!eventBusArn) {
    throw new WrapsError(
      `Event destination for ${ctx.candidate.domain} is not an EventBridge destination. Run ${pc.cyan("wraps email upgrade")} first.`,
      "INVALID_EVENT_DESTINATION",
      "Run wraps email upgrade"
    );
  }

  const currentTypes = dest.MatchingEventTypes ?? [];
  const newTypes = [
    ...currentTypes.filter((t) => t !== "OPEN" && t !== "CLICK"),
    ...(opens ? (["OPEN"] as const) : []),
    ...(clicks ? (["CLICK"] as const) : []),
  ];

  await ctx.sesClient.send(
    new UpdateConfigurationSetEventDestinationCommand({
      ConfigurationSetName: ctx.candidate.configSetName,
      EventDestinationName: "wraps-email-eventbridge",
      EventDestination: {
        Enabled: true,
        MatchingEventTypes: newTypes,
        EventBridgeDestination: { EventBusArn: eventBusArn },
      },
    })
  );

  persistCandidateField(ctx, "trackingConfig", { opens, clicks });
  await saveMetadata(ctx);
}

async function applyDelivery(
  ctx: ApplyContext,
  tlsRequired: boolean
): Promise<void> {
  await ctx.sesClient.send(
    new PutConfigurationSetDeliveryOptionsCommand({
      ConfigurationSetName: ctx.candidate.configSetName,
      TlsPolicy: tlsRequired ? "REQUIRE" : "OPTIONAL",
    })
  );
  persistCandidateField(ctx, "tlsRequired", tlsRequired);
  await saveMetadata(ctx);
}

async function applySending(
  ctx: ApplyContext,
  enabled: boolean
): Promise<void> {
  await ctx.sesClient.send(
    new PutConfigurationSetSendingOptionsCommand({
      ConfigurationSetName: ctx.candidate.configSetName,
      SendingEnabled: enabled,
    })
  );
  persistCandidateField(ctx, "sendingEnabled", enabled);
  await saveMetadata(ctx);
}

async function applyReputation(
  ctx: ApplyContext,
  enabled: boolean
): Promise<void> {
  await ctx.sesClient.send(
    new PutConfigurationSetReputationOptionsCommand({
      ConfigurationSetName: ctx.candidate.configSetName,
      ReputationMetricsEnabled: enabled,
    })
  );
  persistCandidateField(ctx, "reputationMetrics", enabled);
  await saveMetadata(ctx);
}

async function applySuppression(
  ctx: ApplyContext,
  reasons: ("BOUNCE" | "COMPLAINT")[]
): Promise<void> {
  await ctx.sesClient.send(
    new PutConfigurationSetSuppressionOptionsCommand({
      ConfigurationSetName: ctx.candidate.configSetName,
      SuppressedReasons: reasons,
    })
  );
  persistCandidateField(ctx, "suppressionReasons", reasons);
  await saveMetadata(ctx);
}

async function applyArchive(
  ctx: ApplyContext,
  enable: boolean,
  region: string
): Promise<void> {
  if (enable) {
    const archiveArn = await findOrCreateEmailArchive(region);
    await ctx.sesClient.send(
      new PutConfigurationSetArchivingOptionsCommand({
        ConfigurationSetName: ctx.candidate.configSetName,
        ArchiveArn: archiveArn,
      })
    );
    persistCandidateField(ctx, "archiveEnabled", true);
    persistCandidateField(ctx, "archiveArn", archiveArn);
  } else {
    await ctx.sesClient.send(
      new PutConfigurationSetArchivingOptionsCommand({
        ConfigurationSetName: ctx.candidate.configSetName,
        ArchiveArn: undefined,
      })
    );
    persistCandidateField(ctx, "archiveEnabled", false);
    persistCandidateField(ctx, "archiveArn", undefined);
  }
  await saveMetadata(ctx);
}

async function applyVdm(
  ctx: ApplyContext,
  engagement: boolean,
  inbox: boolean
): Promise<void> {
  await ctx.sesClient.send(
    new PutConfigurationSetVdmOptionsCommand({
      ConfigurationSetName: ctx.candidate.configSetName,
      VdmOptions: {
        DashboardOptions: {
          EngagementMetrics: engagement ? "ENABLED" : "DISABLED",
        },
        GuardianOptions: {
          OptimizedSharedDelivery: inbox ? "ENABLED" : "DISABLED",
        },
      },
    })
  );
  persistCandidateField(ctx, "vdmEngagement", engagement);
  persistCandidateField(ctx, "vdmInbox", inbox);
  await saveMetadata(ctx);
}

async function applyTrackingDomain(
  ctx: ApplyContext,
  value: string
): Promise<void> {
  if (ctx.candidate.additionalIndex === undefined) {
    throw new WrapsError(
      `${ctx.candidate.domain} is the primary domain — its tracking domain is managed by ${pc.cyan("wraps email upgrade")} (choose "tracking").`,
      "PRIMARY_TRACKING_DOMAIN_MANAGED_BY_PULUMI",
      "Run wraps email upgrade"
    );
  }
  if (value === TRACKING_DOMAIN_NONE) {
    await clearTrackingDomain(ctx.region, ctx.candidate.configSetName);
    persistCandidateField(ctx, "trackingDomain", undefined);
    (
      ctx.additionalDomains[ctx.candidate.additionalIndex] as Record<
        string,
        unknown
      >
    ).trackingDomainAppliedAt = undefined;
    await saveMetadata(ctx);
    return;
  }
  const problem = validateTrackingDomain(value, ctx.candidate.domain);
  if (problem) {
    throw new WrapsError(
      `Invalid tracking domain: ${problem}`,
      "INVALID_TRACKING_DOMAIN",
      `Use a subdomain of ${ctx.candidate.domain}`
    );
  }
  const host = value.toLowerCase();

  // Same degradation `domains add` performs: SES refuses a redirect domain
  // under an identity it has not verified yet, and that is a "not yet", not a
  // failure. Without this the documented `domains config --tracking-domain`
  // path threw a raw BadRequestException while the identical operation through
  // `domains add` deferred cleanly to `domains verify`.
  let appliedAt: string | undefined;
  try {
    await putTrackingDomain(ctx.sesClient, ctx.candidate.configSetName, host);
    appliedAt = new Date().toISOString();
  } catch (error) {
    if (!isTrackingDomainNotReady(error)) {
      throw error;
    }
    if (!isJsonMode()) {
      clack.log.warn(
        `Saved ${host}, but SES will not accept it until ${ctx.candidate.domain} is verified — run ${pc.cyan(`wraps email domains verify --domain ${ctx.candidate.domain}`)} to apply it.`
      );
    }
  }

  persistCandidateField(ctx, "trackingDomain", host);
  (
    ctx.additionalDomains[ctx.candidate.additionalIndex] as Record<
      string,
      unknown
    >
  ).trackingDomainAppliedAt = appliedAt;
  await saveMetadata(ctx);
}

/**
 * Create (or, with `replaceExisting`, swap) the tracking domain's CNAME via
 * the cached DNS provider, falling back to a manual instruction. `cnameTarget`
 * defaults to the plain SES tracking endpoint; pass the CloudFront
 * distribution domain to point at HTTPS tracking instead.
 */
async function offerTrackingCname(
  ctx: ApplyContext,
  trackingDomain: string,
  cnameTarget?: string,
  replaceExisting?: boolean
): Promise<void> {
  const targetValue = cnameTarget ?? `r.${ctx.region}.awstrack.me`;
  const record = {
    name: trackingDomain,
    type: "CNAME",
    value: targetValue,
  };
  const provider = ctx.metadata.services.email?.dnsProvider;
  // Why the automatic push did not happen, when it did not. Falling back to
  // the manual record silently is indistinguishable from "this provider has no
  // automation", so a rejected token reads as normal output and the user walks
  // away thinking DNS is handled.
  let degradedReason: string | undefined;
  if (provider && provider !== "manual") {
    const parts = ctx.candidate.domain.split(".");
    const rootDomain =
      parts.length > 2 ? parts.slice(-2).join(".") : ctx.candidate.domain;
    const cred = await getDNSCredentials(provider, rootDomain, ctx.region);
    if (cred.valid && cred.credentials) {
      const result = await createDNSRecordsForProvider(
        cred.credentials,
        {
          domain: ctx.candidate.domain,
          dkimTokens: [],
          region: ctx.region,
          customTrackingDomain: trackingDomain,
          trackingCnameTarget: cnameTarget,
        },
        new Set(["tracking"]),
        replaceExisting ? { replaceExisting: true } : undefined
      );
      if (result.success && result.recordsCreated > 0) {
        clack.log.success(
          `${replaceExisting ? "Updated" : "Created"} ${record.name} CNAME via ${getDNSProviderDisplayName(provider)}`
        );
        return;
      }
      degradedReason =
        result.errors?.join("; ") ??
        `${getDNSProviderDisplayName(provider)} created no record`;
    } else {
      degradedReason =
        cred.error ?? `${getDNSProviderDisplayName(provider)} credentials`;
    }
  }

  if (degradedReason) {
    clack.log.warn(`Could not update DNS automatically: ${degradedReason}`);
  }
  clack.log.info(
    `Add this DNS record:\n  ${pc.cyan(record.name)}\n    Type: CNAME  Value: ${record.value}`
  );
}

async function applyTrackingHttps(
  ctx: ApplyContext,
  enable: boolean
): Promise<{
  pendingValidationRecord?: { name: string; type: string; value: string };
  /** False means the user still has to add `pendingValidationRecord` by hand. */
  validationRecordPushed?: boolean;
}> {
  if (ctx.candidate.additionalIndex === undefined) {
    throw new WrapsError(
      `${ctx.candidate.domain} is the primary domain — its HTTPS tracking is managed by ${pc.cyan("wraps email upgrade")} (choose "tracking").`,
      "PRIMARY_TRACKING_HTTPS_MANAGED_BY_PULUMI",
      "Run wraps email upgrade"
    );
  }
  if (!ctx.candidate.trackingDomain) {
    throw new WrapsError(
      `${ctx.candidate.domain} has no tracking domain yet.`,
      "TRACKING_DOMAIN_REQUIRED",
      `Set one first: wraps email domains config --domain ${ctx.candidate.domain} --tracking-domain <host>`
    );
  }
  const trackingDomain = ctx.candidate.trackingDomain;

  if (!enable) {
    await putTrackingDomain(
      ctx.sesClient,
      ctx.candidate.configSetName,
      trackingDomain,
      "OPTIONAL"
    );
    if (ctx.candidate.trackingHttps?.distributionId) {
      await disableDistribution(ctx.candidate.trackingHttps.distributionId);
    }
    persistCandidateField(ctx, "trackingHttps", undefined);
    await saveMetadata(ctx);
    await offerTrackingCname(ctx, trackingDomain, undefined, true);
    return {};
  }

  let result: Awaited<ReturnType<typeof provisionTrackingHttps>>;
  try {
    result = await provisionTrackingHttps({
      domain: ctx.candidate.domain,
      trackingDomain,
      configSetName: ctx.candidate.configSetName,
      sesRegion: ctx.region,
      sesv2: ctx.sesClient,
      metadataDnsProvider: ctx.metadata.services.email?.dnsProvider,
      existing: ctx.candidate.trackingHttps,
      progress: ctx.progress,
    });
  } catch (error) {
    throw new WrapsError(
      `Failed to provision HTTPS for tracking domain: ${describeTrackingHttpsError(error)}`,
      "TRACKING_HTTPS_PROVISION_FAILED"
    );
  }

  const wasActive = ctx.candidate.trackingHttps?.status === "active";
  persistCandidateField(ctx, "trackingHttps", result.trackingHttps);
  await saveMetadata(ctx);

  if (result.trackingHttps.status === "active" && !wasActive) {
    await offerTrackingCname(ctx, trackingDomain, result.cnameTarget, true);
  }

  return {
    pendingValidationRecord: result.dnsRecordsToShow[0],
    validationRecordPushed: result.validationRecordPushed,
  };
}

// --- Flag mode ---

async function applyFlagMode(
  args: ApplyContext & {
    opensFlag: boolean | undefined;
    clicksFlag: boolean | undefined;
    tlsFlag: boolean | undefined;
    reputationFlag: boolean | undefined;
    suppressBounceFlag: boolean | undefined;
    suppressComplaintFlag: boolean | undefined;
    archiveFlag: boolean | undefined;
    sendingEnabledFlag: boolean | undefined;
    vdmEngagementFlag: boolean | undefined;
    vdmInboxFlag: boolean | undefined;
    trackingDomainFlag: string | undefined;
    trackingHttpsFlag: boolean | undefined;
    targetDomain?: string;
  }
): Promise<void> {
  const {
    opensFlag,
    clicksFlag,
    tlsFlag,
    reputationFlag,
    suppressBounceFlag,
    suppressComplaintFlag,
    archiveFlag,
    sendingEnabledFlag,
    vdmEngagementFlag,
    vdmInboxFlag,
    trackingDomainFlag,
    trackingHttpsFlag,
    candidate,
    region,
  } = args;
  const ctx: ApplyContext = args;

  if (opensFlag !== undefined || clicksFlag !== undefined) {
    const opens = opensFlag ?? false;
    const clicks = clicksFlag ?? false;
    try {
      await args.progress.execute("Updating tracking configuration", async () =>
        applyTracking(ctx, opens, clicks)
      );
    } catch (error) {
      args.progress.stop();
      if (error instanceof WrapsError) {
        clack.log.error(error.message);
        process.exit(1);
        return;
      }
      throw error;
    }
    trackCommand("email:domains:config", { success: true, opens, clicks });
    if (isJsonMode()) {
      jsonSuccess("email.domains.config", {
        domain: candidate.domain,
        trackingConfig: { opens, clicks },
      });
      return;
    }
    clack.log.success(
      `Tracking updated: opens ${opens ? "on" : "off"}, clicks ${clicks ? "on" : "off"}`
    );
  }

  if (tlsFlag !== undefined) {
    await args.progress.execute("Updating TLS policy", async () =>
      applyDelivery(ctx, tlsFlag)
    );
    clack.log.success(`TLS policy set to ${tlsFlag ? "required" : "optional"}`);
  }

  if (sendingEnabledFlag !== undefined) {
    await args.progress.execute("Updating sending status", async () =>
      applySending(ctx, sendingEnabledFlag)
    );
    clack.log.success(`Sending ${sendingEnabledFlag ? "enabled" : "disabled"}`);
  }

  if (reputationFlag !== undefined) {
    await args.progress.execute("Updating reputation metrics", async () =>
      applyReputation(ctx, reputationFlag)
    );
    clack.log.success(
      `Reputation metrics ${reputationFlag ? "enabled" : "disabled"}`
    );
  }

  if (suppressBounceFlag !== undefined || suppressComplaintFlag !== undefined) {
    const currentReasons = candidate.suppressionReasons ?? [
      "BOUNCE",
      "COMPLAINT",
    ];
    const suppressBounce =
      suppressBounceFlag !== undefined
        ? suppressBounceFlag
        : currentReasons.includes("BOUNCE");
    const suppressComplaint =
      suppressComplaintFlag !== undefined
        ? suppressComplaintFlag
        : currentReasons.includes("COMPLAINT");
    const newReasons: ("BOUNCE" | "COMPLAINT")[] = [
      ...(suppressBounce ? ["BOUNCE" as const] : []),
      ...(suppressComplaint ? ["COMPLAINT" as const] : []),
    ];
    await args.progress.execute("Updating suppression settings", async () =>
      applySuppression(ctx, newReasons)
    );
    clack.log.success(
      `Suppression: ${newReasons.length > 0 ? newReasons.join(", ").toLowerCase() : "none"}`
    );
  }

  if (archiveFlag !== undefined) {
    await args.progress.execute(
      archiveFlag ? "Enabling email archiving" : "Disabling email archiving",
      async () => applyArchive(ctx, archiveFlag, region)
    );
    clack.log.success(
      `Email archiving ${archiveFlag ? "enabled" : "disabled"}`
    );
  }

  if (vdmEngagementFlag !== undefined || vdmInboxFlag !== undefined) {
    const engagement = vdmEngagementFlag ?? candidate.vdmEngagement ?? false;
    const inbox = vdmInboxFlag ?? candidate.vdmInbox ?? false;
    await args.progress.execute("Updating VDM settings", async () =>
      applyVdm(ctx, engagement, inbox)
    );
    clack.log.success(
      `VDM: engagement ${engagement ? "on" : "off"}, inbox placement ${inbox ? "on" : "off"}`
    );
  }

  if (trackingDomainFlag !== undefined) {
    try {
      await args.progress.execute("Updating tracking domain", async () =>
        applyTrackingDomain(ctx, trackingDomainFlag)
      );
    } catch (error) {
      args.progress.stop();
      if (error instanceof WrapsError) {
        clack.log.error(error.message);
        process.exit(1);
        return;
      }
      throw error;
    }
    args.progress.stop();
    if (trackingDomainFlag === TRACKING_DOMAIN_NONE) {
      clack.log.success("Tracking domain cleared — links use the SES default");
    } else {
      clack.log.success(`Tracking domain set to ${trackingDomainFlag}`);
      await offerTrackingCname(ctx, trackingDomainFlag.toLowerCase());
    }
    trackCommand("email:domains:config", {
      success: true,
      tracking_domain: trackingDomainFlag !== TRACKING_DOMAIN_NONE,
    });
    if (isJsonMode()) {
      jsonSuccess("email.domains.config", {
        domain: candidate.domain,
        trackingDomain:
          trackingDomainFlag === TRACKING_DOMAIN_NONE
            ? null
            : trackingDomainFlag,
      });
      return;
    }
  }

  if (trackingHttpsFlag !== undefined) {
    let httpsResult: Awaited<ReturnType<typeof applyTrackingHttps>>;
    try {
      httpsResult = await applyTrackingHttps(ctx, trackingHttpsFlag);
    } catch (error) {
      args.progress.stop();
      if (error instanceof WrapsError) {
        clack.log.error(error.message);
        process.exit(1);
        return;
      }
      throw error;
    }
    args.progress.stop();
    if (trackingHttpsFlag) {
      const status = candidate.trackingHttps?.status;
      if (status === "active") {
        clack.log.success(
          `HTTPS active for ${candidate.trackingDomain} (${candidate.trackingHttps?.distributionDomain})`
        );
      } else {
        clack.log.info(
          pc.dim(
            `Certificate validation usually takes 5–30 minutes. Re-run ${pc.cyan(`wraps email domains config --domain ${candidate.domain} --tracking-https`)} once it's ISSUED.`
          )
        );
        if (httpsResult.pendingValidationRecord) {
          clack.log.info(
            `${httpsResult.validationRecordPushed ? "Certificate validation record (created for you):" : "Add this DNS record to validate the certificate:"}\n  ${pc.cyan(httpsResult.pendingValidationRecord.name)}\n    Type: ${httpsResult.pendingValidationRecord.type}  Value: ${httpsResult.pendingValidationRecord.value}`
          );
        }
      }
    } else {
      clack.log.success("HTTPS disabled for tracking links");
    }
    trackCommand("email:domains:config", {
      success: true,
      tracking_https: trackingHttpsFlag,
    });
    if (isJsonMode()) {
      jsonSuccess("email.domains.config", {
        domain: candidate.domain,
        trackingHttps: trackingHttpsFlag
          ? (candidate.trackingHttps?.status ?? null)
          : null,
      });
      return;
    }
  }

  args.progress.stop();

  if (candidate.additionalIndex === undefined) {
    clack.note(
      `Run ${pc.cyan("wraps email upgrade")} to sync these settings to your Pulumi stack.`,
      "Settings applied immediately"
    );
  }

  clack.outro(pc.green(`✓ ${candidate.domain} configuration updated`));
}

// --- Interactive mode ---

async function applyInteractiveMode(
  args: ApplyContext & { targetDomain: string }
): Promise<void> {
  const { candidate, sesClient, region, progress, targetDomain } = args;
  const ctx: ApplyContext = args;

  // Read current SES state
  const configSet = await progress.execute(
    "Reading current configuration",
    async () =>
      sesClient.send(
        new GetConfigurationSetCommand({
          ConfigurationSetName: candidate.configSetName,
        })
      )
  );

  let account: { VdmAttributes?: { VdmEnabled?: string } } | null = null;
  try {
    account = await sesClient.send(new GetAccountCommand({}));
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    account = null; // GetAccount may fail if SES is not fully configured — treat VDM as disabled
  }

  progress.stop();

  const vdmEnabled = account?.VdmAttributes?.VdmEnabled === "ENABLED";

  let primaryDomainChanged = false;

  while (true) {
    // Build hints from live SES state
    const tlsPolicy = configSet.DeliveryOptions?.TlsPolicy ?? "OPTIONAL";
    const sendingEnabled = configSet.SendingOptions?.SendingEnabled ?? true;
    const reputationEnabled =
      configSet.ReputationOptions?.ReputationMetricsEnabled ?? false;
    const suppressedReasons =
      configSet.SuppressionOptions?.SuppressedReasons ?? [];
    const archiveArn = configSet.ArchivingOptions?.ArchiveArn;
    const vdmEngagement =
      configSet.VdmOptions?.DashboardOptions?.EngagementMetrics;
    const vdmInbox =
      configSet.VdmOptions?.GuardianOptions?.OptimizedSharedDelivery;
    const trackingCfg = candidate.trackingConfig;

    const menuOptions: Array<{ value: string; label: string; hint?: string }> =
      [
        {
          value: "tracking",
          label: "Open & click tracking",
          hint: trackingCfg
            ? `opens ${trackingCfg.opens ? "on" : "off"} · clicks ${trackingCfg.clicks ? "on" : "off"}`
            : "not configured",
        },
        {
          value: "tracking-domain",
          label: "Tracking domain",
          hint: candidate.trackingDomain ?? "SES default (awstrack.me)",
        },
        {
          value: "delivery",
          label: "Delivery (TLS policy)",
          hint: tlsPolicy === "REQUIRE" ? "TLS required" : "TLS optional",
        },
        {
          value: "sending",
          label: "Sending",
          hint: sendingEnabled ? "enabled" : "disabled",
        },
        {
          value: "reputation",
          label: "Reputation metrics",
          hint: reputationEnabled ? "enabled" : "disabled",
        },
        {
          value: "suppression",
          label: "Suppression list",
          hint:
            suppressedReasons.length === 0
              ? "none"
              : suppressedReasons.map((r) => r.toLowerCase()).join(" + "),
        },
        {
          value: "archive",
          label: "Email archiving",
          hint: archiveArn ? "enabled" : "disabled",
        },
        ...(vdmEnabled
          ? [
              {
                value: "vdm",
                label: "Virtual Deliverability Manager (VDM)",
                hint:
                  vdmEngagement || vdmInbox
                    ? `engagement ${vdmEngagement === "ENABLED" ? "on" : "off"} · inbox ${vdmInbox === "ENABLED" ? "on" : "off"}`
                    : "not configured",
              },
            ]
          : []),
        {
          value: "done",
          label: "Done",
        },
      ];

    const choice = await clack.select({
      message: `Configure ${pc.cyan(targetDomain)}`,
      options: menuOptions,
    });

    if (clack.isCancel(choice) || choice === "done") {
      break;
    }

    switch (choice) {
      case "tracking": {
        const wantsOpens = await clack.confirm({
          message: "Enable open tracking?",
          initialValue: candidate.trackingConfig?.opens ?? true,
        });
        if (clack.isCancel(wantsOpens)) break;
        const wantsClicks = await clack.confirm({
          message: "Enable click tracking?",
          initialValue: candidate.trackingConfig?.clicks ?? true,
        });
        if (clack.isCancel(wantsClicks)) break;
        const trackProgress = new DeploymentProgress();
        await trackProgress.execute(
          "Updating tracking configuration",
          async () => applyTracking(ctx, wantsOpens, wantsClicks)
        );
        trackProgress.stop();
        clack.log.success(
          `Tracking: opens ${wantsOpens ? "on" : "off"}, clicks ${wantsClicks ? "on" : "off"}`
        );
        if (candidate.additionalIndex === undefined)
          primaryDomainChanged = true;
        break;
      }

      case "tracking-domain": {
        if (candidate.additionalIndex === undefined) {
          clack.log.info(
            `Managed by ${pc.cyan("wraps email upgrade")} (choose "tracking").`
          );
          break;
        }
        const choice = await clack.select({
          message: `Tracking domain for ${pc.cyan(candidate.domain)}`,
          options: [
            {
              value: "set",
              label: "Set / change",
              hint:
                candidate.trackingDomain ??
                defaultTrackingDomain(candidate.domain),
            },
            ...(candidate.trackingDomain
              ? [
                  { value: "clear", label: "Clear (use SES default)" },
                  {
                    value: "https",
                    label: candidate.trackingHttps
                      ? "Disable HTTPS"
                      : "Enable HTTPS",
                    hint: candidate.trackingHttps?.status ?? "disabled",
                  },
                ]
              : []),
            { value: "back", label: "Back" },
          ],
        });
        if (clack.isCancel(choice) || choice === "back") break;

        if (choice === "clear") {
          const clearProgress = new DeploymentProgress();
          await clearProgress.execute("Clearing tracking domain", async () =>
            applyTrackingDomain(ctx, TRACKING_DOMAIN_NONE)
          );
          clearProgress.stop();
          clack.log.success(
            "Tracking domain cleared — links use the SES default"
          );
          break;
        }

        if (choice === "https") {
          const enabling = !candidate.trackingHttps;
          const httpsProgress = new DeploymentProgress();
          let httpsResult: Awaited<ReturnType<typeof applyTrackingHttps>>;
          try {
            httpsResult = await httpsProgress.execute(
              enabling ? "Enabling HTTPS" : "Disabling HTTPS",
              async () => applyTrackingHttps(ctx, enabling)
            );
          } catch (error) {
            httpsProgress.stop();
            if (error instanceof WrapsError) {
              clack.log.error(error.message);
              break;
            }
            throw error;
          }
          httpsProgress.stop();
          if (enabling) {
            if (candidate.trackingHttps?.status === "active") {
              clack.log.success(
                `HTTPS active (${candidate.trackingHttps.distributionDomain})`
              );
            } else {
              clack.log.info(
                pc.dim(
                  "Certificate validation usually takes 5–30 minutes. Reopen this menu once it's ISSUED."
                )
              );
              if (httpsResult.pendingValidationRecord) {
                clack.log.info(
                  `${httpsResult.validationRecordPushed ? "Certificate validation record (created for you):" : "Add this DNS record to validate the certificate:"}\n  ${pc.cyan(httpsResult.pendingValidationRecord.name)}\n    Type: ${httpsResult.pendingValidationRecord.type}  Value: ${httpsResult.pendingValidationRecord.value}`
                );
              }
            }
          } else {
            clack.log.success("HTTPS disabled for tracking links");
          }
          break;
        }

        const value = await clack.text({
          message: `Tracking subdomain for ${pc.cyan(candidate.domain)}:`,
          initialValue:
            candidate.trackingDomain ?? defaultTrackingDomain(candidate.domain),
          validate: (v) => validateTrackingDomain(v, candidate.domain),
        });
        if (clack.isCancel(value)) break;

        const trackingDomainProgress = new DeploymentProgress();
        try {
          await trackingDomainProgress.execute(
            "Setting tracking domain",
            async () =>
              applyTrackingDomain(ctx, (value as string).toLowerCase())
          );
        } catch (error) {
          trackingDomainProgress.stop();
          if (error instanceof WrapsError) {
            clack.log.error(error.message);
            break;
          }
          throw error;
        }
        trackingDomainProgress.stop();
        clack.log.success(
          `Tracking domain set to ${(value as string).toLowerCase()}`
        );
        await offerTrackingCname(ctx, (value as string).toLowerCase());
        break;
      }

      case "delivery": {
        const wantsTls = await clack.confirm({
          message: "Require TLS for outbound delivery?",
          initialValue: tlsPolicy === "REQUIRE",
        });
        if (clack.isCancel(wantsTls)) break;
        const deliveryProgress = new DeploymentProgress();
        await deliveryProgress.execute("Updating TLS policy", async () =>
          applyDelivery(ctx, wantsTls)
        );
        deliveryProgress.stop();
        configSet.DeliveryOptions = {
          ...configSet.DeliveryOptions,
          TlsPolicy: wantsTls ? "REQUIRE" : "OPTIONAL",
        };
        clack.log.success(
          `TLS policy set to ${wantsTls ? "required" : "optional"}`
        );
        if (candidate.additionalIndex === undefined)
          primaryDomainChanged = true;
        break;
      }

      case "sending": {
        const wantsSending = await clack.confirm({
          message: "Enable sending through this configuration set?",
          initialValue: sendingEnabled,
        });
        if (clack.isCancel(wantsSending)) break;
        const sendingProgress = new DeploymentProgress();
        await sendingProgress.execute("Updating sending status", async () =>
          applySending(ctx, wantsSending)
        );
        sendingProgress.stop();
        configSet.SendingOptions = { SendingEnabled: wantsSending };
        clack.log.success(`Sending ${wantsSending ? "enabled" : "disabled"}`);
        if (candidate.additionalIndex === undefined)
          primaryDomainChanged = true;
        break;
      }

      case "reputation": {
        const wantsReputation = await clack.confirm({
          message: "Enable CloudWatch reputation metrics?",
          initialValue: reputationEnabled,
        });
        if (clack.isCancel(wantsReputation)) break;
        const repProgress = new DeploymentProgress();
        await repProgress.execute("Updating reputation metrics", async () =>
          applyReputation(ctx, wantsReputation)
        );
        repProgress.stop();
        configSet.ReputationOptions = {
          ReputationMetricsEnabled: wantsReputation,
        };
        clack.log.success(
          `Reputation metrics ${wantsReputation ? "enabled" : "disabled"}`
        );
        if (candidate.additionalIndex === undefined)
          primaryDomainChanged = true;
        break;
      }

      case "suppression": {
        const wantsBounce = await clack.confirm({
          message:
            "Suppress on BOUNCE (add bounced addresses to account suppression list)?",
          initialValue: suppressedReasons.includes("BOUNCE"),
        });
        if (clack.isCancel(wantsBounce)) break;
        const wantsComplaint = await clack.confirm({
          message:
            "Suppress on COMPLAINT (add complained addresses to account suppression list)?",
          initialValue: suppressedReasons.includes("COMPLAINT"),
        });
        if (clack.isCancel(wantsComplaint)) break;
        const newReasons: ("BOUNCE" | "COMPLAINT")[] = [
          ...(wantsBounce ? ["BOUNCE" as const] : []),
          ...(wantsComplaint ? ["COMPLAINT" as const] : []),
        ];
        const supProgress = new DeploymentProgress();
        await supProgress.execute("Updating suppression settings", async () =>
          applySuppression(ctx, newReasons)
        );
        supProgress.stop();
        configSet.SuppressionOptions = { SuppressedReasons: newReasons };
        clack.log.success(
          `Suppression: ${newReasons.length > 0 ? newReasons.join(" + ") : "none"}`
        );
        if (candidate.additionalIndex === undefined)
          primaryDomainChanged = true;
        break;
      }

      case "archive": {
        const wantsArchive = await clack.confirm({
          message:
            "Enable email archiving (stores full email content in wraps-email-archive)?",
          initialValue: !!archiveArn,
        });
        if (clack.isCancel(wantsArchive)) break;
        const archiveProgress = new DeploymentProgress();
        await archiveProgress.execute(
          wantsArchive
            ? "Enabling email archiving"
            : "Disabling email archiving",
          async () => applyArchive(ctx, wantsArchive, region)
        );
        archiveProgress.stop();
        configSet.ArchivingOptions = {
          ArchiveArn: wantsArchive ? candidate.archiveArn : undefined,
        };
        clack.log.success(
          `Email archiving ${wantsArchive ? "enabled" : "disabled"}`
        );
        if (candidate.additionalIndex === undefined)
          primaryDomainChanged = true;
        break;
      }

      case "vdm": {
        const wantsEngagement = await clack.confirm({
          message: "Enable VDM engagement tracking?",
          initialValue: vdmEngagement === "ENABLED",
        });
        if (clack.isCancel(wantsEngagement)) break;
        const wantsInbox = await clack.confirm({
          message: "Enable VDM optimized shared delivery (inbox placement)?",
          initialValue: vdmInbox === "ENABLED",
        });
        if (clack.isCancel(wantsInbox)) break;
        const vdmProgress = new DeploymentProgress();
        await vdmProgress.execute("Updating VDM settings", async () =>
          applyVdm(ctx, wantsEngagement, wantsInbox)
        );
        vdmProgress.stop();
        configSet.VdmOptions = {
          DashboardOptions: {
            EngagementMetrics: wantsEngagement ? "ENABLED" : "DISABLED",
          },
          GuardianOptions: {
            OptimizedSharedDelivery: wantsInbox ? "ENABLED" : "DISABLED",
          },
        };
        clack.log.success(
          `VDM: engagement ${wantsEngagement ? "on" : "off"}, inbox ${wantsInbox ? "on" : "off"}`
        );
        if (candidate.additionalIndex === undefined)
          primaryDomainChanged = true;
        break;
      }
    }
  }

  trackCommand("email:domains:config", { success: true });

  if (primaryDomainChanged) {
    clack.note(
      `Run ${pc.cyan("wraps email upgrade")} to sync these settings to your Pulumi stack.`,
      "Settings applied immediately"
    );
  }

  clack.outro(pc.green(`✓ ${targetDomain} configuration complete`));
}
