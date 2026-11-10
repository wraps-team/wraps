/**
 * Switch an inbound deployment from the S3-notification trigger to the SES
 * receipt-rule Lambda action, adding the new trigger before removing the old
 * one (design: plans/inbound-envelope §4.4).
 *
 *   1. up #1 in "s3-notification" mode: new processor bundle,
 *      wraps-inbound-ses-invoke, bucket policy covering mail/*. The raw/
 *      notification stays.
 *   2. syncReceiptRuleTrigger(..., "ses-lambda-action"): new mail goes to
 *      mail/ and SES invokes the processor; the raw/ notification goes idle.
 *   3. inbound.trigger = "ses-lambda-action" on the caller's metadata (deep
 *      merge), saved.
 *   4. up #2 in "ses-lambda-action" mode: Pulumi removes the notification and
 *      wraps-inbound-s3-invoke.
 *
 * With no receipt rule there is nothing to protect: steps 3 and 4 only.
 * Mail always has exactly one live trigger. Callers run this as their last
 * mutating step, after their own metadata save.
 */

import * as clack from "@clack/prompts";
import type { WrapsEmailConfig } from "../../types/index.js";
import { WrapsError } from "../shared/errors.js";
import { isJsonMode, jsonError } from "../shared/json-output.js";
import {
  applyConfigUpdates,
  buildEmailStackConfig,
  type ConnectionMetadata,
  getInboundTrigger,
  saveConnectionMetadata,
} from "../shared/metadata.js";
import type { DeploymentProgress } from "../shared/output.js";
import { runEmailStackDeploy } from "./email-stack-deploy.js";
import {
  describeInboundReceiptRule,
  syncReceiptRuleTrigger,
} from "./receipt-rules.js";

/** The command that finishes an interrupted switch. */
export const FINISH_SWITCH_COMMAND = "wraps email upgrade";

export type InboundSwitchStep = 1 | 2 | 3 | 4;

/** Design §4.4 failure table: the state each failed step leaves behind. */
function rowText(step: InboundSwitchStep, ruleExisted: boolean): string {
  if (!ruleExisted) {
    return step === 3
      ? "Stopped at step 3 (save the new trigger to metadata). No receipt rule exists, so no mail is flowing; nothing was changed in AWS by the switch."
      : "Stopped at step 4 (deploy in the new mode). Metadata says ses-lambda-action and no receipt rule exists, so no mail is flowing; the next deploy finishes the stack change.";
  }
  switch (step) {
    case 1:
      return "Stopped at step 1 (deploy the new processor and SES invoke permission): old code, old rule. Inbound mail works as before.";
    case 2:
      return "Stopped at step 2 (move the receipt rule to the Lambda action): new code, old rule. Inbound mail works as before, without envelope recipients.";
    case 3:
      return "Stopped at step 3 (save the new trigger to metadata): the rule uses the Lambda action but metadata still says s3-notification. Mail works and records envelope recipients; `wraps email inbound status` reports the mismatch.";
    default:
      return "Stopped at step 4 (deploy that removes the S3 notification): rule and metadata are in the new mode; the leftover raw/ notification is idle and never fires.";
  }
}

export const INBOUND_TRIGGER_SWITCH_FAILED = "INBOUND_TRIGGER_SWITCH_FAILED";

/** A switch failure: a WrapsError carrying the §4.4 step it stopped at. */
export type InboundTriggerSwitchError = WrapsError & {
  step: InboundSwitchStep;
  ruleExisted: boolean;
};

/**
 * Build a switch failure. Constructed directly as a WrapsError (not a subclass) so
 * the CLI error-code docs parity check sees the code.
 */
export function inboundTriggerSwitchError(
  step: InboundSwitchStep,
  ruleExisted: boolean,
  cause: unknown
): InboundTriggerSwitchError {
  const causeText = cause instanceof Error ? cause.message : String(cause);
  const message = `Inbound trigger switch did not finish. ${rowText(step, ruleExisted)} Cause: ${causeText}`;
  const suggestion = `Run ${FINISH_SWITCH_COMMAND} to finish the switch. Everything this command saved before the switch stays saved.`;
  const error = new WrapsError(
    message,
    "INBOUND_TRIGGER_SWITCH_FAILED",
    suggestion,
    "https://wraps.dev/docs/quickstart/email/inbound"
  );
  error.cause = cause;
  return Object.assign(error, { step, ruleExisted });
}

export function isInboundTriggerSwitchError(
  error: unknown
): error is InboundTriggerSwitchError {
  return (
    error instanceof WrapsError && error.code === INBOUND_TRIGGER_SWITCH_FAILED
  );
}

export type SwitchInboundTriggerContext = {
  metadata: ConnectionMetadata;
  accountId: string;
  region: string;
  stackName: string;
  autoConfirm?: boolean;
  /**
   * The caller has just deployed the stack with this CLI in the old mode
   * (`inbound init` existing path, `email upgrade`), so step 1 is done.
   */
  skipInitialDeploy?: boolean;
  progress?: DeploymentProgress;
};

export type SwitchInboundTriggerResult = {
  trigger: "ses-lambda-action";
  ruleExisted: boolean;
};

async function step<T>(
  progress: DeploymentProgress | undefined,
  message: string,
  fn: () => Promise<T>
): Promise<T> {
  return progress ? progress.execute(message, fn) : fn();
}

/**
 * Run the add-before-remove switch. Throws an `InboundTriggerSwitchError`
 * naming the failed step; a no-op when the saved mode is already the new one.
 */
export async function switchInboundTrigger(
  ctx: SwitchInboundTriggerContext
): Promise<SwitchInboundTriggerResult> {
  const { metadata, accountId, region, stackName, progress } = ctx;
  const emailService = metadata.services.email;
  if (!emailService?.config.inbound?.enabled) {
    throw new Error("switchInboundTrigger called without inbound enabled");
  }

  if (getInboundTrigger(metadata) === "ses-lambda-action") {
    return { trigger: "ses-lambda-action", ruleExisted: true };
  }

  // Read the rule here, never from an earlier read: a rule writer in the same
  // command may just have changed it.
  let rule: Awaited<ReturnType<typeof describeInboundReceiptRule>>;
  try {
    rule = await describeInboundReceiptRule(region);
  } catch (error) {
    throw inboundTriggerSwitchError(ctx.skipInitialDeploy ? 2 : 1, true, error);
  }
  const ruleExisted = rule !== null;

  const bucketName =
    emailService.config.inbound.bucketName ||
    `wraps-inbound-${accountId}-${region}`;

  if (ruleExisted) {
    // 1. Deploy in the old mode: new code, SES permission, both prefixes.
    if (!ctx.skipInitialDeploy) {
      try {
        await step(
          progress,
          "Deploying the inbound processor and SES invoke permission",
          () =>
            runEmailStackDeploy({
              accountId,
              region,
              stackName,
              stackConfig: buildEmailStackConfig(metadata, region),
              autoConfirm: ctx.autoConfirm,
            })
        );
      } catch (error) {
        throw inboundTriggerSwitchError(1, true, error);
      }
    }

    // 2. Move the rule to mail/ + Lambda action. Always runs while the saved
    // mode is old, even if the rule already looks switched: idempotent.
    try {
      await step(
        progress,
        "Switching the receipt rule to the SES Lambda action",
        () =>
          syncReceiptRuleTrigger(
            region,
            accountId,
            bucketName,
            "ses-lambda-action"
          )
      );
    } catch (error) {
      throw inboundTriggerSwitchError(2, true, error);
    }
  }

  // 3. Record the new mode on the caller's metadata and save it.
  try {
    await step(progress, "Saving the inbound trigger mode", async () => {
      emailService.config = applyConfigUpdates(emailService.config, {
        inbound: { trigger: "ses-lambda-action" },
      } as Partial<WrapsEmailConfig>);
      metadata.timestamp = new Date().toISOString();
      await saveConnectionMetadata(metadata);
    });
  } catch (error) {
    throw inboundTriggerSwitchError(3, ruleExisted, error);
  }

  // 4. Deploy in the new mode: removes the raw/ notification and S3 permission.
  try {
    await step(progress, "Removing the S3 notification trigger", () =>
      runEmailStackDeploy({
        accountId,
        region,
        stackName,
        stackConfig: buildEmailStackConfig(metadata, region),
        autoConfirm: ctx.autoConfirm,
      })
    );
  } catch (error) {
    throw inboundTriggerSwitchError(4, ruleExisted, error);
  }

  return { trigger: "ses-lambda-action", ruleExisted };
}

/**
 * Report a switch failure the way commands must (plan 041 R1): the §4.4 row
 * and the finishing command, through `jsonError` in JSON mode, then exit
 * non-zero. Non-switch errors are rethrown for `handleCLIError`.
 */
export function exitOnSwitchFailure(command: string, error: unknown): never {
  if (!isInboundTriggerSwitchError(error)) {
    throw error;
  }
  if (isJsonMode()) {
    jsonError(command, {
      code: error.code,
      message: error.message,
      suggestion: error.suggestion,
      docsUrl: error.docsUrl,
    });
  } else {
    clack.log.error(error.message);
    clack.log.info(error.suggestion ?? "");
  }
  process.exit(1);
}
