/**
 * Platform disconnect command — stop streaming SES events to the Wraps Platform
 *
 * The counterpart to `wraps platform connect`. It removes the EventBridge
 * target that delivers this account's SES events to api.wraps.dev, along with
 * the API Destination, connection and IAM role that back it.
 *
 * Why this exists as its own command: `platform connect` does offer a
 * "Disconnect from platform" choice, but only in its unauthenticated fallback
 * path — `connect()` routes to `authenticatedConnect()` whenever a token
 * resolves, and that path has no disconnect option. So a logged-in customer had
 * no supported way to turn the platform plane off short of logging out first.
 *
 * What it deliberately leaves alone:
 * - The self-hosted target (`selfhostWebhook`). A customer who has migrated to
 *   self-hosting is the main caller here, and their own control plane must keep
 *   receiving events. The two planes are independent targets on the same rule —
 *   see the comment in connect.ts where the self-hosted secret is written.
 * - The SQS target, event processor Lambda, archive, and every other piece of
 *   the email stack. This command is not a teardown; `wraps email destroy` is,
 *   and it removes shared infrastructure the self-hosted plane still needs.
 *
 * It also tells the platform. The AWS-side teardown alone leaves the dashboard
 * holding a `webhook_secret` for the account, and account-health sweeps every
 * account that holds one — so with the console role gone it emails the owner a
 * daily "Wraps can no longer reach your AWS account" for a role they removed on
 * purpose. `DELETE /v1/connections/:id` clears the secret and takes the account
 * out of that sweep.
 *
 * Sending is entirely unaffected either way — mail flows from the customer's
 * own SES with their own credentials, and Wraps is never in that path.
 */

import {
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  IAMClient,
} from "@aws-sdk/client-iam";
import { confirm, intro, isCancel, log, outro } from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import { CONSOLE_ACCESS_ROLE_NAME } from "@wraps/core";
import pc from "picocolors";
import { deployEmailStack } from "../../infrastructure/email-stack.js";
import type { PlatformDisconnectOptions } from "../../types/index.js";
import { validateAWSCredentials } from "../../utils/shared/aws.js";
import {
  getApiBaseUrl,
  readAuthConfig,
  resolveTokenAsync,
} from "../../utils/shared/config.js";
import { isAWSNotFoundError } from "../../utils/shared/errors.js";
import {
  ensurePulumiWorkDir,
  getPulumiWorkDir,
} from "../../utils/shared/fs.js";
import {
  isJsonMode,
  jsonError,
  jsonSuccess,
} from "../../utils/shared/json-output.js";
import {
  buildEmailStackConfig,
  loadConnectionMetadata,
  saveConnectionMetadata,
} from "../../utils/shared/metadata.js";
import { DeploymentProgress } from "../../utils/shared/output.js";
import { promptVercelConfig } from "../../utils/shared/prompts.js";
import { ensurePulumiInstalled } from "../../utils/shared/pulumi.js";
import { resolveRegionForCommand } from "../../utils/shared/region-resolver.js";

/**
 * Delete the cross-account role that lets app.wraps.dev read this AWS account.
 *
 * `platform connect` creates two things — the SES event target and this role —
 * so a disconnect that removed only the target would leave Wraps holding
 * cross-account access after the customer was told they were disconnected.
 *
 * Returns whether anything was removed. A missing role is success: this
 * command has to be safe to re-run, and an account connected before the role
 * existed simply has nothing to delete.
 */
async function removeConsoleAccessRole(region: string): Promise<boolean> {
  const iam = new IAMClient({ region });

  // The inline policy must go first — DeleteRole fails while one is attached.
  try {
    await iam.send(
      new DeleteRolePolicyCommand({
        RoleName: CONSOLE_ACCESS_ROLE_NAME,
        PolicyName: "wraps-console-access-policy",
      })
    );
  } catch (error) {
    // isAWSNotFoundError, not `instanceof NoSuchEntityException`: the SDK v3
    // error classes don't survive every bundling path, and v3 is known in this
    // codebase to return a bare `name: "Error"` with the real type only in the
    // message. The helper checks name AND $metadata.httpStatusCode.
    if (!isAWSNotFoundError(error)) {
      throw error;
    }
  }

  try {
    await iam.send(
      new DeleteRoleCommand({ RoleName: CONSOLE_ACCESS_ROLE_NAME })
    );
    return true;
  } catch (error) {
    if (isAWSNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

type PlatformRecordResult =
  | { cleared: true }
  | { cleared: false; reason: string };

/** One DELETE attempt; resolves to the HTTP status, rejects on a network failure. */
async function deleteConnection(
  connectionId: string,
  token: string,
  orgId: string | undefined
): Promise<number> {
  const response = await fetch(
    `${getApiBaseUrl()}/v1/connections/${encodeURIComponent(connectionId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(orgId ? { "X-Organization-Id": orgId } : {}),
      },
    }
  );
  return response.status;
}

/**
 * The organizations to try the DELETE under. A session token resolves to its
 * active organization unless told which one, and a mismatch is a 404, not an
 * error. The connection's org isn't stored in metadata, so try each one the
 * token belongs to; with none known, send no header and let the server decide.
 */
async function organizationAttempts(): Promise<Array<string | undefined>> {
  const config = await readAuthConfig();
  const orgIds = config?.auth?.organizations?.map((org) => org.id) ?? [];
  return orgIds.length ? orgIds : [undefined];
}

/**
 * Ask the Wraps platform to forget this connection (clears its webhook secret).
 *
 * Deliberately NOT `resolveApiTarget()`: that follows `activeInstance`, and this
 * command's main caller is a customer who also runs a self-hosted control plane
 * — so it could aim the DELETE at their own plane and null the secret of the
 * one they are keeping. This command only ever concerns the SaaS plane, so it
 * pairs `getApiBaseUrl()` with the SaaS-slot token, as `platform connect` does.
 *
 * Never throws: by the time this runs the AWS side is already torn down, so a
 * failure here must be reported, not allowed to abort the rest of the command.
 */
async function clearPlatformRecord(
  connectionId: string | undefined
): Promise<PlatformRecordResult> {
  if (!connectionId) {
    return {
      cleared: false,
      reason: "no connection id is recorded for it (it was connected manually)",
    };
  }

  const token = await resolveTokenAsync();
  if (!token) {
    return { cleared: false, reason: "you are not signed in to Wraps" };
  }

  const attempts = await organizationAttempts();

  let status = 0;
  for (const orgId of attempts) {
    try {
      status = await deleteConnection(connectionId, token, orgId);
    } catch (error) {
      return {
        cleared: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    if (status >= 200 && status < 300) {
      return { cleared: true };
    }
    if (status !== 404) {
      break;
    }
  }

  return {
    cleared: false,
    reason:
      status === 404
        ? "none of your organizations owns that connection"
        : `the platform answered HTTP ${status}`,
  };
}

/**
 * `clearPlatformRecord` with a spinner that ends on the real outcome.
 * `progress.execute` would tick green on a `{ cleared: false }` result, since
 * that is a return value, not a throw.
 */
async function removePlatformRecord(
  progress: DeploymentProgress,
  connectionId: string | undefined
): Promise<PlatformRecordResult> {
  progress.start("Removing platform record");
  const record = await clearPlatformRecord(connectionId);
  if (record.cleared) {
    progress.succeed("Platform record removed");
  } else {
    progress.fail("Platform record not removed");
  }
  return record;
}

/** Loud, because a quiet failure here is exactly what produces the daily emails. */
function warnPlatformRecordNotCleared(reason: string): void {
  log.warn(
    [
      `Wraps still lists this account as connected (${reason}).`,
      'Until that is cleared you will keep getting "Wraps can no longer reach your AWS account" emails.',
      `Clear it in the dashboard (Settings → AWS accounts → this account → ${pc.cyan("Disconnect streaming")}), or fix the above and re-run ${pc.cyan("wraps platform disconnect")}.`,
    ].join("\n  ")
  );
}

export async function disconnect(
  options: PlatformDisconnectOptions
): Promise<void> {
  const json = isJsonMode();

  if (!json) {
    intro(pc.bold("Disconnect from Wraps Platform"));
  }

  const progress = new DeploymentProgress();

  try {
    await progress.execute(
      "Checking Pulumi CLI installation",
      async () => await ensurePulumiInstalled()
    );

    const identity = await progress.execute(
      "Validating AWS credentials",
      async () => validateAWSCredentials()
    );

    const region = await resolveRegionForCommand({
      accountId: identity.accountId,
      optionRegion: options.region,
      label: "connection",
    });

    const metadata = await loadConnectionMetadata(identity.accountId, region);

    if (!metadata) {
      progress.stop();
      if (json) {
        jsonError("platform.disconnect", {
          code: "NO_DEPLOYMENT",
          message: `No Wraps deployment found for account ${identity.accountId} in ${region}.`,
          suggestion: "Run `wraps email init` to deploy infrastructure first.",
        });
        return;
      }
      log.error(
        `No Wraps deployment found for account ${pc.cyan(identity.accountId)} in region ${pc.cyan(region)}`
      );
      process.exit(1);
    }

    const emailService = metadata.services.email;

    if (!emailService?.config) {
      progress.stop();
      if (json) {
        jsonError("platform.disconnect", {
          code: "NO_EMAIL_SERVICE",
          message: "No email service deployed in this region.",
          suggestion: "Run `wraps email init` first.",
        });
        return;
      }
      log.error("No email service deployed in this region.");
      process.exit(1);
    }

    // Already disconnected is success, not failure — this command is the kind
    // of thing people run twice, and re-running a Pulumi up to remove nothing
    // is a slow way to say "nothing to do".
    //
    // Unless an earlier run couldn't reach the platform: it keeps
    // `platform.connectionId` in that case, and finishing that half is all a
    // re-run has left to do.
    if (!emailService.webhookSecret && metadata.platform?.connectionId) {
      const record = await removePlatformRecord(
        progress,
        metadata.platform.connectionId
      );
      if (record.cleared) {
        metadata.platform = undefined;
        // This path never deploys; it only drops an id the platform has forgotten.
        await saveConnectionMetadata(metadata); // baseline:allow-early-save — no deployment on this path
      }
      if (json) {
        jsonSuccess("platform.disconnect", {
          accountId: identity.accountId,
          region,
          disconnected: false,
          reason: "not connected",
          platformRecordCleared: record.cleared,
        });
        return;
      }
      if (record.cleared) {
        log.success("Wraps no longer lists this account as connected.");
        outro("Done");
      } else {
        warnPlatformRecordNotCleared(record.reason);
        outro("Platform record not cleared");
      }
      return;
    }

    if (!emailService.webhookSecret) {
      progress.stop();
      if (json) {
        jsonSuccess("platform.disconnect", {
          accountId: identity.accountId,
          region,
          disconnected: false,
          reason: "not connected",
        });
        return;
      }
      log.info("This account is not connected to the Wraps Platform.");
      outro("Nothing to do");
      return;
    }

    const stillSelfhosted = !!emailService.selfhostWebhook;
    // Read now: `metadata.platform` is cleared before the end of this command.
    const connectionId = metadata.platform?.connectionId;

    if (!(options.force || options.yes || json)) {
      progress.stop();
      log.warn(
        `SES events from AWS account ${pc.cyan(identity.accountId)} will stop reaching ${pc.cyan("app.wraps.dev")}.`
      );
      log.info(
        [
          "This does NOT affect sending — your mail flows through your own SES.",
          `Wraps' cross-account IAM role (${pc.cyan(CONSOLE_ACCESS_ROLE_NAME)}) will be deleted, revoking dashboard access to this account.`,
          stillSelfhosted
            ? `Your self-hosted control plane (${pc.cyan(emailService.selfhostWebhook?.url ?? "self-hosted")}) keeps receiving events.`
            : "Dashboard email logs and analytics will stop updating for this account.",
        ].join("\n  ")
      );

      const confirmed = await confirm({
        message: "Disconnect from the Wraps Platform?",
        initialValue: false,
      });

      if (isCancel(confirmed) || !confirmed) {
        outro("Disconnect cancelled");
        return;
      }
    }

    // Clearing these is what removes the target. buildEmailStackConfig
    // reconstructs `webhook` from metadata whenever the caller doesn't pass the
    // key, so the explicit `webhook: undefined` below plus this clear are both
    // needed — one for this deploy, one for every deploy after it.
    //
    // Saved BEFORE the deploy on purpose, which is the reverse of every other
    // command here — hence the allow. The baseline rule guards against
    // recording a resource as created before it exists. This is the inverse
    // operation, and its two failure modes are not symmetric:
    //   save-first, deploy fails  → metadata says disconnected, target lingers;
    //                               any later deploy removes it. Self-heals.
    //   deploy-first, save fails  → target gone, metadata still holds the
    //                               secret, and the next `wraps email deploy`
    //                               silently RE-CREATES it, reconnecting a
    //                               customer who explicitly asked to leave.
    // Only the first is recoverable, so the save goes first.
    emailService.webhookSecret = undefined;
    emailService.webhookUrl = undefined;
    await saveConnectionMetadata(metadata); // baseline:allow-early-save — removal, not creation; see above

    if (metadata.provider === "vercel" && !metadata.vercel) {
      progress.stop();
      metadata.vercel = await promptVercelConfig();
    }

    // `webhook: undefined` is an explicit override, not an omission — the key
    // must be present for buildEmailStackConfig to treat it as "no platform
    // webhook" rather than falling back to metadata. `selfhostWebhook` is left
    // out entirely so it keeps being reconstructed from metadata.
    //
    // NOTE: packages/cli/CLAUDE.md calls an explicit `webhook: undefined` "the
    // coexistence regression", because passing it from the *selfhost connect*
    // flow silently tore down the platform target a customer still wanted.
    // Here that teardown is the entire purpose of the command. Do not
    // "fix" this line to match the connect flow — deleting the platform
    // target is what the user asked for.
    const stackConfig = buildEmailStackConfig(metadata, region, {
      webhook: undefined,
    });

    await progress.execute("Removing platform event target", async () => {
      await ensurePulumiWorkDir({ accountId: identity.accountId, region });

      const stack = await pulumi.automation.LocalWorkspace.createOrSelectStack(
        {
          stackName:
            emailService.pulumiStackName ||
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

      const stackState = await stack.exportStack();
      const resourceCount = stackState.deployment?.resources?.length ?? 0;
      if (resourceCount > 1) {
        stackConfig.skipResourceImports = true;
      }

      await stack.up({ onOutput: () => {} });
    });

    progress.succeed("Platform event target removed");

    // Before the role goes: deleting it is what makes account-health start
    // reporting the account unreachable, so the record has to be cleared first.
    // After `stack.up`, so no event still in flight meets a cleared secret.
    const record = await removePlatformRecord(progress, connectionId);

    // Revoke cross-account access last: if this fails the event target is
    // already gone, so the customer is disconnected in the sense that matters
    // and can re-run to finish the job. Doing it first would leave the reverse
    // — access revoked while events still flow — which reads as a broken
    // integration rather than a partial disconnect.
    const roleRemoved = await progress.execute(
      "Revoking dashboard access",
      async () => removeConsoleAccessRole(region)
    );

    // The platform issued this externalId for a connection that no longer
    // exists. Leaving it behind would let a later connect reuse a stale id.
    // Unless the platform still lists the connection: then the id is the only
    // handle a re-run has to finish the job.
    if (record.cleared) {
      metadata.platform = undefined;
      await saveConnectionMetadata(metadata);
    }

    if (json) {
      jsonSuccess("platform.disconnect", {
        accountId: identity.accountId,
        region,
        disconnected: true,
        selfhostWebhookRetained: stillSelfhosted,
        consoleAccessRoleRemoved: roleRemoved,
        platformRecordCleared: record.cleared,
      });
      return;
    }

    console.log();
    if (record.cleared) {
      log.success("Disconnected from the Wraps Platform.");
    } else {
      log.warn("Disconnected on AWS, but not yet on the Wraps Platform.");
      warnPlatformRecordNotCleared(record.reason);
    }
    console.log();
    console.log(
      `  SES events from ${pc.cyan(identity.accountId)} no longer reach app.wraps.dev.`
    );
    console.log(
      roleRemoved
        ? `  Wraps' cross-account access role was deleted — the dashboard can no longer read this account.`
        : "  No cross-account access role was present to remove."
    );
    if (stillSelfhosted) {
      console.log(
        `  Your self-hosted plane at ${pc.cyan(emailService.selfhostWebhook?.url ?? "")} is unchanged.`
      );
    }
    console.log(
      pc.dim(`  Reconnect any time with ${pc.cyan("wraps platform connect")}.`)
    );
    console.log();

    outro("Done");
  } catch (error) {
    progress.stop();
    if (json) {
      jsonError("platform.disconnect", {
        code: "DISCONNECT_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    throw error;
  }
}
