/**
 * Shared deploy/preview seam for the email stack, used by commands that
 * redeploy from metadata outside their own Pulumi program (`email reply`, the
 * inbound trigger switch, `inbound add`). Moved here from `commands/email/
 * reply.ts` unchanged; `reply.ts` re-exports the same `deployHooks` object, so
 * a test that replaces `deployHooks.deploy` intercepts every caller.
 */

import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import { deployEmailStack } from "../../infrastructure/email-stack.js";
import { ensurePulumiWorkDir, getPulumiWorkDir } from "../shared/fs.js";
import {
  type ExtendedPreviewResult,
  previewWithResourceChanges,
  withLockRetry,
} from "../shared/pulumi.js";
import { DEFAULT_PULUMI_TIMEOUT_MS, withTimeout } from "../shared/timeout.js";

export type EmailStackDeployParams = {
  accountId: string;
  region: string;
  stackName: string;
  stackConfig: Parameters<typeof deployEmailStack>[0];
  autoConfirm?: boolean;
};

/**
 * Deploy helper indirection — tests replace `deployHooks.deploy` (and
 * `deployHooks.preview`) so the full Pulumi workspace + AWS credential
 * resolution path is skipped without having to mock every leaf module.
 */
export const deployHooks = {
  // biome-ignore lint/suspicious/noExplicitAny: test override hook
  deploy: (params: any) => runEmailStackDeployImpl(params),
  // biome-ignore lint/suspicious/noExplicitAny: test override hook
  preview: (params: any): Promise<ExtendedPreviewResult> =>
    runEmailStackPreviewImpl(params),
};

/**
 * Deploy the email stack via Pulumi. Exported for test-time monkey-patching;
 * tests mock this so they don't spin up a real Pulumi workspace.
 */
export async function runEmailStackDeploy(
  params: EmailStackDeployParams
): Promise<void> {
  return deployHooks.deploy(params);
}

/** Preview the email stack for `stackConfig` without applying anything. */
export async function runEmailStackPreview(
  params: Omit<EmailStackDeployParams, "autoConfirm">
): Promise<ExtendedPreviewResult> {
  return deployHooks.preview(params);
}

async function selectEmailStack(
  params: Omit<EmailStackDeployParams, "autoConfirm">
) {
  await ensurePulumiWorkDir({
    accountId: params.accountId,
    region: params.region,
  });
  const pulumiWorkDir = getPulumiWorkDir();

  const stack = await pulumi.automation.LocalWorkspace.createOrSelectStack(
    {
      stackName: params.stackName,
      projectName: "wraps-email",
      program: async () => {
        const result = await deployEmailStack(params.stackConfig);
        return result as Record<string, unknown>;
      },
    },
    {
      workDir: pulumiWorkDir,
    }
  );

  await stack.setConfig("aws:region", { value: params.region });
  return stack;
}

async function runEmailStackDeployImpl(
  params: EmailStackDeployParams
): Promise<void> {
  const stack = await selectEmailStack(params);

  const pulumiOutput: string[] = [];
  await withLockRetry(
    () =>
      withTimeout(
        stack.up({
          onOutput: (msg) => {
            pulumiOutput.push(msg);
          },
        }),
        DEFAULT_PULUMI_TIMEOUT_MS,
        "Pulumi deployment"
      ).catch((error: unknown) => {
        if (pulumiOutput.length > 0) {
          const fullOutput = pulumiOutput.join("");
          clack.log.error("Pulumi deployment output:");
          // biome-ignore lint/suspicious/noConsole: Pulumi failure diagnostic
          console.error(fullOutput);
        }
        throw error;
      }),
    {
      accountId: params.accountId,
      region: params.region,
      autoConfirm: params.autoConfirm,
    }
  );
}

async function runEmailStackPreviewImpl(
  params: Omit<EmailStackDeployParams, "autoConfirm">
): Promise<ExtendedPreviewResult> {
  const stack = await selectEmailStack(params);
  return previewWithResourceChanges(stack, { diff: true });
}
