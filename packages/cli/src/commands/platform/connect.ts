/**
 * Platform connect command - Connect AWS infrastructure to Wraps Platform
 *
 * This command combines:
 * 1. EventBridge webhook setup (streaming events to dashboard)
 * 2. IAM role update (granting dashboard read access)
 *
 * Users can run this single command instead of:
 * - `wraps email upgrade` → "Connect to Wraps Dashboard"
 * - `wraps platform update-role`
 */
import {
  CreateRoleCommand,
  GetRoleCommand,
  IAMClient,
  PutRolePolicyCommand,
  UpdateAssumeRolePolicyCommand,
} from "@aws-sdk/client-iam";
import { confirm, intro, isCancel, log, outro, select } from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import {
  CONSOLE_ACCESS_ROLE_NAME,
  SELFHOST_CONSOLE_ACCESS_ROLE_NAME,
} from "@wraps/core";
import pc from "picocolors";
import { deployEmailStack } from "../../infrastructure/email-stack.js";
import { trackCommand, trackError } from "../../telemetry/events.js";
import type { PlatformConnectOptions } from "../../types/index.js";
import {
  normalizeApiUrl,
  reconcileSelfhostApiUrl,
} from "../../utils/selfhost/api-url.js";
import { validateAWSCredentials } from "../../utils/shared/aws.js";
import {
  getApiBaseUrl,
  getAppBaseUrl,
  type OrgInfo,
  readAuthConfig,
  readSelfhostAuth,
  resolveSelfhostToken,
  resolveTokenAsync,
} from "../../utils/shared/config.js";
import {
  ensurePulumiWorkDir,
  getPulumiWorkDir,
} from "../../utils/shared/fs.js";
import {
  isJsonMode,
  jsonError,
  jsonSuccess,
} from "../../utils/shared/json-output.js";
import type { ConnectionMetadata } from "../../utils/shared/metadata.js";
import {
  buildEmailStackConfig,
  createAdoptedConnectionMetadata,
  generateWebhookSecret,
  loadConnectionMetadata,
  saveConnectionMetadata,
} from "../../utils/shared/metadata.js";
import { DeploymentProgress } from "../../utils/shared/output.js";
import { promptVercelConfig } from "../../utils/shared/prompts.js";
import { ensurePulumiInstalled } from "../../utils/shared/pulumi.js";
import { resolveRegionForCommand } from "../../utils/shared/region-resolver.js";
import { buildConsolePolicyDocument } from "./update-role.js";

/**
 * Shared: Validate AWS, load metadata, and resolve region
 */
async function validateAndLoadMetadata(
  options: PlatformConnectOptions,
  progress: DeploymentProgress
): Promise<{
  identity: { accountId: string };
  region: string;
  metadata: ConnectionMetadata;
  // True when no local/S3 deployment record existed for this account/region
  // and the caller adopted the account instead — infrastructure exists in
  // AWS (e.g. deployed via the dashboard's CloudFormation flow) but this CLI
  // never recorded it. Callers must not deploy anything on an adopted run.
  adopted: boolean;
}> {
  // Check Pulumi CLI
  const wasAutoInstalled = await progress.execute(
    "Checking Pulumi CLI installation",
    async () => await ensurePulumiInstalled()
  );
  if (wasAutoInstalled) {
    progress.info("Pulumi CLI was automatically installed");
  }

  // Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );
  progress.info(`Connected to AWS account: ${pc.cyan(identity.accountId)}`);

  // Get region — option → env → saved connection metadata for this account.
  const region = await resolveRegionForCommand({
    accountId: identity.accountId,
    optionRegion: options.region,
    label: "connection",
  });

  // Load metadata
  let metadata = await loadConnectionMetadata(identity.accountId, region);
  let adopted = false;
  if (!metadata) {
    // No local record. This is expected for a CloudFormation-first customer
    // (or a machine with no local file and no S3 state bucket to sync from):
    // registration is idempotent on the External ID
    // (`apps/api/src/routes/connections.ts`), so re-registering an
    // already-connected account is safe and returns the account's existing
    // identity rather than rotating it.
    if (!isJsonMode()) {
      progress.stop();
      log.warn(
        `No Wraps deployment found for account ${pc.cyan(identity.accountId)} in region ${pc.cyan(region)}`
      );
      console.log(
        `\nThis is expected if infrastructure here was deployed another way — for example, through the dashboard's CloudFormation flow instead of ${pc.cyan("wraps email init")}.\n`
      );
    }

    const shouldAdopt =
      options.yes === true ||
      isJsonMode() ||
      (await confirm({
        message: `Register AWS account ${identity.accountId} with Wraps without deploying new infrastructure?`,
        initialValue: true,
      }));

    if (isCancel(shouldAdopt) || !shouldAdopt) {
      if (!isJsonMode()) {
        log.error(
          `No Wraps deployment found for account ${identity.accountId}.`
        );
        console.log(
          `\nRun ${pc.cyan("wraps email init")} to deploy infrastructure first.\n`
        );
      }
      process.exit(0);
    }

    metadata = createAdoptedConnectionMetadata(
      identity.accountId,
      region,
      "other"
    );
    adopted = true;
  }

  const hasEmail = !!metadata.services.email?.config;
  const hasSms = !!metadata.services.sms?.config;
  if (!(adopted || hasEmail || hasSms)) {
    progress.stop();
    log.error("No services deployed in this region.");
    console.log(
      `\nRun ${pc.cyan("wraps email init")} or ${pc.cyan("wraps sms init")} first.\n`
    );
    process.exit(1);
  }

  if (adopted) {
    progress.info(
      "Adopting existing AWS infrastructure — no new resources will be deployed."
    );
  } else {
    progress.info(
      `Found services: ${[hasEmail && "email", hasSms && "sms"].filter(Boolean).join(", ")}`
    );
  }

  return { identity, region, metadata, adopted };
}

/**
 * Shared: Deploy EventBridge with webhook secret
 */
async function deployEventBridge(
  metadata: ConnectionMetadata,
  region: string,
  identity: { accountId: string },
  webhookSecret: string,
  progress: DeploymentProgress,
  // Present ⇒ `webhookSecret` was issued by the customer's self-hosted control
  // plane, so it configures the SECOND target. Passing no `webhook` key here is
  // load-bearing: buildEmailStackConfig then reconstructs the platform webhook
  // from metadata, which is what keeps app.wraps.dev receiving events.
  selfhostTarget?: { url: string }
): Promise<void> {
  // Get Vercel config if needed
  if (metadata.provider === "vercel" && !metadata.vercel) {
    progress.stop();
    metadata.vercel = await promptVercelConfig();
  }

  const stackConfig = buildEmailStackConfig(
    metadata,
    region,
    selfhostTarget
      ? {
          selfhostWebhook: {
            awsAccountNumber: metadata.accountId,
            webhookSecret,
            webhookUrl: selfhostTarget.url,
          },
        }
      : { webhook: { awsAccountNumber: metadata.accountId, webhookSecret } }
  );

  await progress.execute("Configuring event streaming", async () => {
    await ensurePulumiWorkDir({ accountId: identity.accountId, region });

    const stack = await pulumi.automation.LocalWorkspace.createOrSelectStack(
      {
        stackName:
          metadata.services.email?.pulumiStackName ||
          `wraps-${identity.accountId}-${region}`,
        projectName: "wraps-email",
        program: async () => {
          const result = await deployEmailStack(stackConfig);
          return {
            roleArn: result.roleArn,
            configSetName: result.configSetName,
            tableName: result.tableName,
            region: result.region,
          };
        },
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

    await stack.setConfig("aws:region", { value: region });
    await stack.refresh({ onOutput: () => {} });

    // Check if resources already exist in Pulumi state (e.g., from a prior `wraps email init`).
    // If so, skip import flags to avoid collision — the resources are already tracked.
    const stackState = await stack.exportStack();
    const resourceCount = stackState.deployment?.resources?.length ?? 0;
    if (resourceCount > 1) {
      stackConfig.skipResourceImports = true;
    }

    await stack.up({ onOutput: () => {} });
  });

  progress.succeed("Event streaming configured");
}

/** AWS Account ID of the Wraps Platform (used in trust policy for cloud-hosted customers) */
const WRAPS_PLATFORM_ACCOUNT_ID = "905130073023";

/**
 * Shared: Update or create platform access IAM role
 */
async function updatePlatformRole(
  metadata: ConnectionMetadata,
  progress: DeploymentProgress,
  externalId: string | undefined,
  selfhosted: boolean
): Promise<void> {
  const roleName = selfhosted
    ? SELFHOST_CONSOLE_ACCESS_ROLE_NAME
    : CONSOLE_ACCESS_ROLE_NAME;
  const iam = new IAMClient({ region: "us-east-1" });

  // Self-hosted customers run the dashboard in their own AWS account, so the
  // trust policy must trust their account rather than the Wraps platform
  // account. This is keyed off the invoked subcommand (`wraps selfhost connect`
  // hardcodes it), NEVER off the presence of selfhost metadata: keying it off
  // metadata made an ordinary SaaS connect from a machine that had deployed
  // selfhost silently revoke platform access.
  const trustedAccountId = selfhosted
    ? metadata.accountId
    : WRAPS_PLATFORM_ACCOUNT_ID;

  let roleExists = false;
  try {
    await iam.send(new GetRoleCommand({ RoleName: roleName }));
    roleExists = true;
  } catch (error) {
    const isNotFound =
      error instanceof Error &&
      (error.name === "NoSuchEntityException" ||
        error.name === "NoSuchEntity" ||
        error.message.includes("NoSuchEntity"));
    if (!isNotFound) {
      throw error;
    }
  }

  const emailConfig = metadata.services.email?.config;
  const smsConfig = metadata.services.sms?.config;
  // An adopted connection carries no service config, and
  // buildConsolePolicyDocument() tolerates undefined by omitting the
  // conditional blocks. Writing that result would REPLACE a working
  // permissions policy (often one CloudFormation owns) with a narrower one.
  // Only write the inline policy when metadata actually describes the
  // deployment; the trust-policy repair below is what adoption needs.
  const hasPolicySource = Boolean(emailConfig || smsConfig);

  if (roleExists) {
    if (hasPolicySource) {
      const policy = buildConsolePolicyDocument(emailConfig, smsConfig);
      await progress.execute("Updating platform access role", async () => {
        await iam.send(
          new PutRolePolicyCommand({
            RoleName: roleName,
            PolicyName: "wraps-console-access-policy",
            PolicyDocument: JSON.stringify(policy, null, 2),
          })
        );
      });
    }

    if (externalId) {
      const trustPolicy = {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${trustedAccountId}:root`,
            },
            Action: "sts:AssumeRole",
            Condition: {
              StringEquals: {
                "sts:ExternalId": externalId,
              },
            },
          },
        ],
      };
      await progress.execute("Repairing trust policy", async () => {
        await iam.send(
          new UpdateAssumeRolePolicyCommand({
            RoleName: roleName,
            PolicyDocument: JSON.stringify(trustPolicy),
          })
        );
      });
    }

    progress.succeed("Platform access role updated");
  } else if (externalId) {
    await progress.execute("Creating platform access role", async () => {
      const trustPolicy = {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${trustedAccountId}:root`,
            },
            Action: "sts:AssumeRole",
            Condition: {
              StringEquals: {
                "sts:ExternalId": externalId,
              },
            },
          },
        ],
      };

      await iam.send(
        new CreateRoleCommand({
          RoleName: roleName,
          Description:
            "Allows Wraps dashboard to access CloudWatch metrics and SES data",
          AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
          Tags: [
            { Key: "ManagedBy", Value: "wraps-cli" },
            { Key: "Purpose", Value: "Console Access" },
          ],
        })
      );

      const policy = buildConsolePolicyDocument(emailConfig, smsConfig);
      await iam.send(
        new PutRolePolicyCommand({
          RoleName: roleName,
          PolicyName: "wraps-console-access-policy",
          PolicyDocument: JSON.stringify(policy, null, 2),
        })
      );
    });

    progress.succeed("Platform access role created");
  } else {
    progress.info(
      `IAM role ${pc.cyan(roleName)} will be created when you add your AWS account in the dashboard`
    );
  }
}

/**
 * Select an organization from the caller-provided list (SaaS or self-hosted),
 * prompting when there's more than one.
 */
async function resolveOrganization(
  orgs: OrgInfo[] | undefined
): Promise<OrgInfo | null> {
  if (!orgs || orgs.length === 0) {
    return null;
  }

  if (orgs.length === 1) {
    return orgs[0];
  }

  // Multiple orgs — prompt
  const selected = await select({
    message: "Which organization should this AWS account connect to?",
    options: orgs.map((org) => ({
      value: org.id,
      label: org.name,
      hint: org.slug,
    })),
  });

  if (isCancel(selected)) {
    outro("Operation cancelled");
    process.exit(0);
  }

  return orgs.find((o) => o.id === selected) || null;
}

/**
 * Register connection via Wraps Platform API
 */
async function registerConnection(params: {
  baseURL: string;
  token: string;
  orgId: string;
  accountId: string;
  region: string;
  features?: Record<string, unknown>;
}): Promise<{
  success: boolean;
  connectionId?: string;
  externalId?: string;
  roleArn?: string;
  webhookSecret?: string;
  webhookEndpoint?: string;
  error?: string;
}> {
  const response = await fetch(`${params.baseURL}/v1/connections`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.token}`,
      "X-Organization-Id": params.orgId,
    },
    body: JSON.stringify({
      accountId: params.accountId,
      region: params.region,
      features: params.features,
    }),
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    return {
      success: false,
      error: (data.error as string) || `HTTP ${response.status}`,
    };
  }

  return data as {
    success: boolean;
    connectionId: string;
    externalId: string;
    roleArn: string;
    webhookSecret: string;
    webhookEndpoint: string;
  };
}

/**
 * Authenticated platform connect — registers via API, no manual paste needed
 */
async function authenticatedConnect(
  options: PlatformConnectOptions,
  saasToken: string | null
): Promise<void> {
  const startTime = Date.now();
  const selfhosted = options.selfhosted === true;

  if (!isJsonMode()) {
    intro(
      pc.bold(
        selfhosted
          ? "Connect to Self-Hosted Wraps"
          : "Connect to Wraps Platform"
      )
    );
  }

  const progress = new DeploymentProgress();

  try {
    // 1. Validate AWS + load metadata
    const { identity, region, metadata, adopted } =
      await validateAndLoadMetadata(options, progress);

    // Self-hosted connects target the customer's own control plane, not the
    // Wraps SaaS. Both URLs come from the selfhost deployment metadata.
    // `apiUrl` is persisted empty before Pulumi runs, so an interrupted deploy
    // can leave the service present but unusable — reconcile against the live
    // Lambda Function URL first, then treat a still-empty URL as "not deployed".
    const selfhostService = metadata.services.selfhost;
    if (selfhosted && selfhostService) {
      await reconcileSelfhostApiUrl(metadata, region);
    }
    if (selfhosted && !selfhostService?.apiUrl) {
      progress.stop();
      log.error(
        `No reachable self-hosted deployment found for account ${pc.cyan(identity.accountId)} in region ${pc.cyan(region)}`
      );
      console.log(
        `\nRun ${pc.cyan("pnpm selfhost:deploy")} from your fork to finish deploying the self-hosted control plane first.\n`
      );
      process.exit(1);
    }
    const apiBaseUrl =
      selfhosted && selfhostService
        ? normalizeApiUrl(selfhostService.apiUrl)
        : getApiBaseUrl();
    const dashboardUrl =
      selfhosted && selfhostService
        ? selfhostService.config.appUrl
        : getAppBaseUrl();

    const hasEmail = !!metadata.services.email?.config;

    // 2. Resolve auth + organization from the right source. Self-hosted uses a
    // per-instance session (from `wraps selfhost login`), never the SaaS slot —
    // so a SaaS login can't accidentally register against the customer's plane.
    let token: string;
    let organizations: OrgInfo[] | undefined;
    if (selfhosted) {
      const instanceToken = await resolveSelfhostToken(dashboardUrl);
      if (!instanceToken) {
        progress.stop();
        if (isJsonMode()) {
          jsonError("platform.connect", {
            code: "NOT_AUTHENTICATED",
            message: "Not signed in to the self-hosted instance.",
            suggestion: "Run `wraps selfhost login` first.",
          });
        } else {
          log.error("You need to sign in to your self-hosted instance first.");
          console.log(`\nRun ${pc.cyan("wraps selfhost login")} first.\n`);
        }
        process.exit(1);
      }
      token = instanceToken;
      organizations = (await readSelfhostAuth(dashboardUrl))?.organizations;
    } else {
      if (!saasToken) {
        progress.stop();
        if (isJsonMode()) {
          jsonError("platform.connect", {
            code: "NOT_AUTHENTICATED",
            message: "Not signed in.",
            suggestion: "Run `wraps auth login` first.",
          });
        } else {
          log.error("Not signed in. Run `wraps auth login` first.");
        }
        process.exit(1);
      }
      token = saasToken;
      organizations = (await readAuthConfig())?.auth?.organizations;
    }

    const org = await resolveOrganization(organizations);
    if (!org) {
      progress.stop();
      log.error(
        selfhosted
          ? `No organizations found. Sign in at ${dashboardUrl} and run ${pc.cyan("wraps selfhost login")} again.`
          : `No organizations found. Sign in at ${dashboardUrl} to create one.`
      );
      process.exit(1);
    }

    if (!isJsonMode()) {
      progress.info(`Organization: ${pc.cyan(org.name)}`);
    }

    // 3. Ensure event tracking is enabled for email
    if (hasEmail) {
      const emailConfig = metadata.services.email?.config;
      if (!emailConfig?.eventTracking?.enabled) {
        if (!isJsonMode()) {
          progress.stop();
          log.warn(
            selfhosted
              ? "Event tracking must be enabled to connect to your self-hosted instance."
              : "Event tracking must be enabled to connect to the Wraps Platform."
          );
        }

        const enableTracking =
          options.yes ||
          (await confirm({
            message: "Enable event tracking now?",
            initialValue: true,
          }));

        if (isCancel(enableTracking) || !enableTracking) {
          outro("Platform connection cancelled.");
          process.exit(0);
        }

        metadata.services.email!.config = {
          ...emailConfig,
          eventTracking: {
            enabled: true,
            eventBridge: true,
            events: [
              "SEND",
              "DELIVERY",
              "OPEN",
              "CLICK",
              "BOUNCE",
              "COMPLAINT",
            ],
            dynamoDBHistory:
              emailConfig?.eventTracking?.dynamoDBHistory ?? false,
            archiveRetention:
              emailConfig?.eventTracking?.archiveRetention ?? "90days",
          },
        };
      }
    }

    // 4. Register connection via API
    const features: Record<string, unknown> = {};
    if (metadata.services.email?.config) {
      features.email = metadata.services.email.config;
    }
    if (metadata.services.sms?.config) {
      features.sms = metadata.services.sms.config;
    }

    const result = await progress.execute(
      selfhosted
        ? "Registering connection with your self-hosted instance"
        : "Registering connection with Wraps Platform",
      async () =>
        registerConnection({
          baseURL: apiBaseUrl,
          token,
          orgId: org.id,
          accountId: identity.accountId,
          region,
          features,
        })
    );

    if (!(result.success && result.webhookSecret)) {
      progress.stop();
      log.error(
        `Failed to register connection: ${result.error || "Unknown error"}`
      );
      console.log(
        `\nYou can try the manual flow: ${pc.cyan("wraps auth logout")} then ${pc.cyan("wraps platform connect")}\n`
      );
      process.exit(1);
    }

    progress.succeed("Connection registered");

    // 5. Save the issuing plane's identity immediately (so externalId survives
    // if later steps fail). Self-hosted writes its OWN slot — the two planes
    // issue different externalIds, and each is the sts:ExternalId condition on
    // that plane's console access role. Writing both here meant whichever
    // plane connected last silently broke the other's AssumeRole.
    if (selfhosted) {
      metadata.selfhostPlatform = {
        externalId: result.externalId,
        connectionId: result.connectionId,
      };
    } else {
      metadata.platform = {
        externalId: result.externalId,
        connectionId: result.connectionId,
      };
    }
    if (hasEmail) {
      const emailService = metadata.services.email!;
      if (selfhosted) {
        // The self-hosted plane's secret is a SECOND target, not a replacement.
        // Writing it to `webhookSecret` is what made SES events single-plane:
        // whichever control plane connected last owned the customer's events.
        if (emailService.webhookUrl) {
          // `reroute.ts` is the only writer of `webhookUrl`, so its presence
          // means this account went through `--reroute-events`. Leaving it in
          // place would deliver every event twice once the second target is
          // built. Migrate it: the new field supersedes it, and the fresh
          // secret below is the one the plane actually has in its DB.
          emailService.webhookUrl = undefined;
          emailService.webhookSecret = undefined;
          log.warn(
            "Migrated this account off the legacy event reroute.\n" +
              `  SES events now reach your self-hosted API via a dedicated target (${pc.cyan(apiBaseUrl)}).\n` +
              `  The Wraps platform is NOT receiving events for this account — run ${pc.cyan("wraps platform connect")} if you also want app.wraps.dev connected.`
          );
        }
        emailService.selfhostWebhook = {
          url: apiBaseUrl,
          secret: result.webhookSecret,
        };
      } else {
        emailService.webhookSecret = result.webhookSecret;
      }
    }
    await saveConnectionMetadata(metadata);

    // 6. Deploy EventBridge with server-provided webhook secret. Never on an
    // adopted run — adoption registers and repairs access only, it deploys
    // nothing.
    if (hasEmail && !adopted) {
      await deployEventBridge(
        metadata,
        region,
        identity,
        result.webhookSecret,
        progress,
        selfhosted ? { url: apiBaseUrl } : undefined
      );
    }

    // 7. Update IAM role with server-provided externalId
    try {
      await updatePlatformRole(
        metadata,
        progress,
        result.externalId,
        selfhosted
      );
    } catch (error) {
      const errName =
        error && typeof error === "object" && "name" in error
          ? (error as Error).name
          : "Unknown";
      const errMsg = error instanceof Error ? error.message : String(error);
      log.warn(
        `Could not create/update IAM role (${errName}): ${errMsg}\n` +
          `  You may need ${pc.cyan("iam:GetRole")}, ${pc.cyan("iam:CreateRole")}, and ${pc.cyan("iam:PutRolePolicy")} permissions.\n` +
          `  Run ${pc.cyan("wraps platform update-role")} to retry.`
      );
    }

    // 8. Save metadata again (captures any changes from deployment/role steps)
    await saveConnectionMetadata(metadata);

    progress.stop();

    // 9. Output
    if (isJsonMode()) {
      jsonSuccess("platform.connect", {
        accountId: identity.accountId,
        region,
        organizationId: org.id,
        connectionId: result.connectionId,
        webhookConnected: !adopted,
        selfhosted,
        adopted,
      });
    } else if (adopted) {
      outro(pc.green("AWS account adopted!"));

      console.log();
      console.log(
        pc.dim(
          "Registered this account and repaired the IAM trust policy so the dashboard can reach it."
        )
      );
      console.log(
        pc.dim(
          "No infrastructure was deployed and no event wiring was changed."
        )
      );
      console.log(`  Dashboard: ${pc.cyan(dashboardUrl)}`);
      console.log();
    } else {
      outro(
        pc.green(
          selfhosted
            ? "Self-hosted connection complete!"
            : "Platform connection complete!"
        )
      );

      console.log();
      console.log(
        pc.dim(
          "Events from your AWS infrastructure will stream to the dashboard."
        )
      );
      console.log(`  Dashboard: ${pc.cyan(dashboardUrl)}`);
      console.log();
    }

    const duration = Date.now() - startTime;
    trackCommand("platform:connect", {
      success: true,
      duration_ms: duration,
      authenticated: true,
    });
  } catch (error) {
    progress.stop();

    const duration = Date.now() - startTime;
    const errorCode = error instanceof Error ? error.name : "UNKNOWN_ERROR";
    // Code and flow only. `trackError` spreads its metadata straight into the
    // `error:occurred` body POSTed to the telemetry endpoint, and this catch
    // re-throws to `handleCLIError`, which now drains the queue instead of
    // killing the process — so an error's own text would leave the machine.
    // The message is still printed to the user locally.
    trackError(errorCode, "platform:connect", { step: "authenticated" });
    trackCommand("platform:connect", {
      success: false,
      duration_ms: duration,
      authenticated: true,
    });

    throw error;
  }
}

/**
 * Connect AWS infrastructure to Wraps Platform
 */
export async function connect(options: PlatformConnectOptions): Promise<void> {
  // Self-hosted always uses the authenticated flow: it resolves a per-instance
  // session (from `wraps selfhost login`) after loading the deployment's
  // metadata, never the SaaS token. There is no copy/paste fallback for it.
  if (options.selfhosted) {
    await authenticatedConnect(options, null);
    return;
  }

  // SaaS: if logged in, use the streamlined authenticated flow.
  const token = await resolveTokenAsync();
  if (token) {
    await authenticatedConnect(options, token);
    return;
  }

  // Unauthenticated fallback — manual copy/paste flow
  const startTime = Date.now();

  intro(pc.bold("Connect to Wraps Platform"));

  const progress = new DeploymentProgress();

  try {
    // 1. Check Pulumi CLI is installed
    const wasAutoInstalled = await progress.execute(
      "Checking Pulumi CLI installation",
      async () => await ensurePulumiInstalled()
    );

    if (wasAutoInstalled) {
      progress.info("Pulumi CLI was automatically installed");
    }

    // 2. Validate AWS credentials
    const identity = await progress.execute(
      "Validating AWS credentials",
      async () => validateAWSCredentials()
    );

    progress.info(`Connected to AWS account: ${pc.cyan(identity.accountId)}`);

    // 3. Get region — option → env → saved metadata so a fresh shell can
    // still connect the only deployment without prompting.
    const region = await resolveRegionForCommand({
      accountId: identity.accountId,
      optionRegion: options.region,
      label: "connection",
    });

    // 4. Load connection metadata
    const metadata = await loadConnectionMetadata(identity.accountId, region);

    if (!metadata) {
      progress.stop();
      log.error(
        `No Wraps deployment found for account ${pc.cyan(identity.accountId)} in region ${pc.cyan(region)}`
      );
      console.log(
        `\nRun ${pc.cyan("wraps email init")} to deploy infrastructure first.\n`
      );
      process.exit(1);
    }

    // 5. Check what services are deployed
    const hasEmail = !!metadata.services.email?.config;
    const hasSms = !!metadata.services.sms?.config;

    if (!(hasEmail || hasSms)) {
      progress.stop();
      log.error("No services deployed in this region.");
      console.log(
        `\nRun ${pc.cyan("wraps email init")} or ${pc.cyan("wraps sms init")} first.\n`
      );
      process.exit(1);
    }

    progress.info(
      `Found services: ${[hasEmail && "email", hasSms && "sms"].filter(Boolean).join(", ")}`
    );

    // 6. Check and configure webhook for email service
    let webhookSecret: string | undefined;
    let needsDeployment = false;

    if (hasEmail) {
      const emailConfig = metadata.services.email?.config;
      const existingSecret = metadata.services.email?.webhookSecret;

      // Check if event tracking is enabled (required for webhook)
      if (!emailConfig?.eventTracking?.enabled) {
        progress.stop();
        log.warn(
          "Event tracking must be enabled to connect to the Wraps Platform."
        );
        log.info(
          "Enabling event tracking will allow SES events to be streamed to the dashboard."
        );

        const enableEventTracking = await confirm({
          message: "Enable event tracking now?",
          initialValue: true,
        });

        if (isCancel(enableEventTracking) || !enableEventTracking) {
          outro("Platform connection cancelled.");
          process.exit(0);
        }

        // Enable event tracking
        metadata.services.email!.config = {
          ...emailConfig,
          eventTracking: {
            enabled: true,
            eventBridge: true,
            events: [
              "SEND",
              "DELIVERY",
              "OPEN",
              "CLICK",
              "BOUNCE",
              "COMPLAINT",
            ],
            dynamoDBHistory:
              emailConfig?.eventTracking?.dynamoDBHistory ?? false,
            archiveRetention:
              emailConfig?.eventTracking?.archiveRetention ?? "90days",
          },
        };
        needsDeployment = true;
      }

      // Handle existing webhook secret
      if (existingSecret) {
        progress.stop();
        log.info(
          `Already connected to Wraps Platform (AWS Account: ${pc.cyan(metadata.accountId)})`
        );

        const action = await select({
          message: "What would you like to do?",
          options: [
            {
              value: "keep",
              label: "Keep current connection",
              hint: "Continue with existing webhook secret",
            },
            {
              value: "regenerate",
              label: "Regenerate webhook secret",
              hint: "Create new secret (requires update in dashboard)",
            },
            {
              value: "disconnect",
              label: "Disconnect from platform",
              hint: "Stop sending events to Wraps",
            },
          ],
        });

        if (isCancel(action)) {
          outro("Operation cancelled");
          process.exit(0);
        }

        if (action === "keep") {
          webhookSecret = existingSecret;
          // Still continue to update IAM role
        } else if (action === "disconnect") {
          const confirmDisconnect = await confirm({
            message:
              "Are you sure? Events will no longer be sent to the Wraps Platform.",
            initialValue: false,
          });

          if (isCancel(confirmDisconnect) || !confirmDisconnect) {
            outro("Disconnect cancelled");
            process.exit(0);
          }

          metadata.services.email!.webhookSecret = undefined;
          needsDeployment = true;
          // Clear webhookSecret so deployment removes API Destination
          webhookSecret = undefined;
        } else {
          // Regenerate
          webhookSecret = generateWebhookSecret();
          metadata.services.email!.webhookSecret = webhookSecret;
          needsDeployment = true;
        }
      } else {
        // Generate new webhook secret
        webhookSecret = generateWebhookSecret();
        metadata.services.email!.webhookSecret = webhookSecret;
        needsDeployment = true;
      }
    }

    // 7. Deploy stack if needed (for webhook configuration)
    if (needsDeployment && hasEmail) {
      // Get Vercel config if needed
      if (metadata.provider === "vercel" && !metadata.vercel) {
        progress.stop();
        metadata.vercel = await promptVercelConfig();
      }

      // Explicit webhook override needed because the freshly generated
      // webhookSecret may not yet be saved to metadata at this point
      const stackConfig = buildEmailStackConfig(metadata, region, {
        webhook: webhookSecret
          ? { awsAccountNumber: metadata.accountId, webhookSecret }
          : undefined,
      });

      await progress.execute("Configuring event streaming", async () => {
        await ensurePulumiWorkDir({ accountId: identity.accountId, region });

        const stack =
          await pulumi.automation.LocalWorkspace.createOrSelectStack(
            {
              stackName:
                metadata.services.email?.pulumiStackName ||
                `wraps-${identity.accountId}-${region}`,
              projectName: "wraps-email",
              program: async () => {
                const result = await deployEmailStack(stackConfig);
                return {
                  roleArn: result.roleArn,
                  configSetName: result.configSetName,
                  tableName: result.tableName,
                  region: result.region,
                };
              },
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

        await stack.setConfig("aws:region", { value: region });
        await stack.refresh({ onOutput: () => {} });

        // Check if resources already exist in Pulumi state to avoid import collisions
        const stackState = await stack.exportStack();
        const resourceCount = stackState.deployment?.resources?.length ?? 0;
        if (resourceCount > 1) {
          stackConfig.skipResourceImports = true;
        }

        await stack.up({ onOutput: () => {} });
      });

      progress.succeed("Event streaming configured");
    } else if (!needsDeployment && hasEmail && webhookSecret) {
      progress.succeed("Event streaming already configured");
    }

    // 8. Update platform access role
    const roleName = CONSOLE_ACCESS_ROLE_NAME;
    const iam = new IAMClient({ region: "us-east-1" });

    let roleExists = false;
    try {
      await iam.send(new GetRoleCommand({ RoleName: roleName }));
      roleExists = true;
    } catch (error) {
      const isNotFound =
        error instanceof Error &&
        (error.name === "NoSuchEntityException" ||
          error.name === "NoSuchEntity" ||
          error.message.includes("NoSuchEntity"));
      if (!isNotFound) {
        throw error;
      }
    }

    const emailConfig = metadata.services.email?.config;
    const smsConfig = metadata.services.sms?.config;
    const consolePolicy = buildConsolePolicyDocument(emailConfig, smsConfig);

    if (roleExists) {
      await progress.execute("Updating platform access role", async () => {
        await iam.send(
          new PutRolePolicyCommand({
            RoleName: roleName,
            PolicyName: "wraps-console-access-policy",
            PolicyDocument: JSON.stringify(consolePolicy, null, 2),
          })
        );
      });

      progress.succeed("Platform access role updated");
    } else {
      progress.info(
        `IAM role ${pc.cyan(roleName)} will be created when you add your AWS account in the dashboard`
      );
    }

    // 9. Save metadata
    await saveConnectionMetadata(metadata);

    progress.stop();

    // 10. Display results
    outro(pc.green("Platform connection complete!"));

    if (webhookSecret && needsDeployment) {
      console.log(`\n${pc.bold("Webhook Secret")} ${pc.dim("(save this!)")}`);
      console.log(pc.dim("─".repeat(60)));
      console.log(`  ${pc.cyan(webhookSecret)}`);
      console.log(pc.dim("─".repeat(60)));
    } else if (metadata.services.email?.webhookSecret && !needsDeployment) {
      console.log(`\n${pc.bold("Existing Webhook Secret:")}`);
      console.log(pc.dim("─".repeat(60)));
      console.log(`  ${pc.cyan(metadata.services.email.webhookSecret)}`);
      console.log(pc.dim("─".repeat(60)));
    }

    console.log(`\n${pc.bold("Next Steps:")}`);
    console.log(`  1. Go to ${pc.cyan("https://app.wraps.dev")}`);
    console.log(`  2. Navigate to ${pc.dim("Settings → AWS Accounts")}`);
    console.log(`  3. Add your AWS account: ${pc.cyan(identity.accountId)}`);
    if (webhookSecret) {
      console.log("  4. Paste the webhook secret shown above");
    }
    console.log();
    console.log(
      pc.dim(
        "Events from your AWS infrastructure will stream to the dashboard."
      )
    );
    console.log();

    // Track success
    const duration = Date.now() - startTime;
    trackCommand("platform:connect", {
      success: true,
      duration_ms: duration,
    });
  } catch (error) {
    progress.stop();

    const duration = Date.now() - startTime;
    const errorCode = error instanceof Error ? error.name : "UNKNOWN_ERROR";
    // Code and flow only — see the note on the authenticated catch above.
    trackError(errorCode, "platform:connect", { step: "unauthenticated" });
    trackCommand("platform:connect", {
      success: false,
      duration_ms: duration,
    });

    throw error;
  }
}
