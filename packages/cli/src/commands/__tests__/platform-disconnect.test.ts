/**
 * `wraps platform disconnect` — removes the app.wraps.dev event target.
 *
 * The two assertions that matter, and why:
 *
 * 1. `buildEmailStackConfig` must receive an explicit `webhook: undefined`.
 *    The builder only treats the platform webhook as absent when the KEY is
 *    present — omitting it makes the builder reconstruct the target from
 *    metadata, which is exactly what keeps app.wraps.dev connected during a
 *    selfhost connect. Here that reconstruction is the bug, so a test that
 *    only checked "webhook is falsy" would pass on the broken version.
 *
 * 2. `selfhostWebhook` must NOT be overridden, so it keeps being rebuilt from
 *    metadata. A customer who has migrated to self-hosting is the main caller,
 *    and dropping their own control plane's target would be far worse than the
 *    problem this command solves.
 */

import {
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  IAMClient,
} from "@aws-sdk/client-iam";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Do NOT vi.mock("@aws-sdk/client-iam") — mockClient patches the prototype.
vi.mock("@pulumi/pulumi", () => ({
  automation: { LocalWorkspace: { createOrSelectStack: vi.fn() } },
}));
vi.mock("@clack/prompts");
vi.mock("../../utils/shared/aws.js");
vi.mock("../../utils/shared/fs.js");
vi.mock("../../utils/shared/metadata.js");
vi.mock("../../utils/shared/pulumi.js");
vi.mock("../../utils/shared/json-output.js");
vi.mock("../../utils/shared/region-resolver.js");
vi.mock("../../utils/shared/prompts.js");
vi.mock("../../infrastructure/email-stack.js");

import * as prompts from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import * as aws from "../../utils/shared/aws.js";
import * as fsUtils from "../../utils/shared/fs.js";
import * as jsonOutput from "../../utils/shared/json-output.js";
import * as metadata from "../../utils/shared/metadata.js";
import * as pulumiUtils from "../../utils/shared/pulumi.js";
import * as regionResolver from "../../utils/shared/region-resolver.js";
import { disconnect } from "../platform/disconnect.js";

const iamMock = mockClient(IAMClient);

const ACCOUNT_ID = "123456789012";

/** Connected to the platform AND self-hosted — the Wamy-shaped account. */
function connectedMetadata(overrides: Record<string, unknown> = {}) {
  return {
    version: "1.0.0",
    accountId: ACCOUNT_ID,
    region: "us-east-1",
    provider: "other" as const,
    timestamp: "2026-09-01T00:00:00.000Z",
    services: {
      email: {
        preset: "production" as const,
        deployedAt: "2026-09-01T00:00:00.000Z",
        config: {
          tracking: { enabled: true, opens: true, clicks: true },
          sendingEnabled: true,
          eventTracking: { enabled: true, eventBridge: true },
        },
        webhookSecret: "platform-secret-abc",
        selfhostWebhook: {
          url: "https://selfhost.example.com",
          secret: "selfhost-secret-xyz",
        },
        ...overrides,
      },
    },
  };
}

let capturedOverrides: Record<string, unknown> | undefined;
let savedMetadata: any;

beforeEach(() => {
  vi.clearAllMocks();
  iamMock.reset();
  iamMock.on(DeleteRolePolicyCommand).resolves({});
  iamMock.on(DeleteRoleCommand).resolves({});
  capturedOverrides = undefined;
  savedMetadata = undefined;

  const mockSpinner = { start: vi.fn(), stop: vi.fn(), message: vi.fn() };
  vi.mocked(prompts.spinner).mockReturnValue(mockSpinner as never);
  vi.mocked(prompts.intro).mockImplementation(() => {});
  vi.mocked(prompts.outro).mockImplementation(() => {});
  vi.mocked(prompts.isCancel).mockReturnValue(false);
  vi.mocked(prompts.confirm).mockResolvedValue(true as never);
  vi.mocked(prompts.log).info = vi.fn();
  vi.mocked(prompts.log).success = vi.fn();
  vi.mocked(prompts.log).error = vi.fn();
  vi.mocked(prompts.log).warn = vi.fn();
  vi.mocked(prompts.log).step = vi.fn();

  vi.mocked(aws.validateAWSCredentials).mockResolvedValue({
    accountId: ACCOUNT_ID,
    userId: "AIDACKCEVSQ6C2EXAMPLE",
    arn: `arn:aws:iam::${ACCOUNT_ID}:user/test`,
  });
  vi.mocked(regionResolver.resolveRegionForCommand).mockResolvedValue(
    "us-east-1"
  );
  vi.mocked(pulumiUtils.ensurePulumiInstalled).mockResolvedValue(false);
  vi.mocked(fsUtils.ensurePulumiWorkDir).mockResolvedValue(undefined);
  vi.mocked(fsUtils.getPulumiWorkDir).mockReturnValue("/mock/.wraps/pulumi");
  vi.mocked(jsonOutput.isJsonMode).mockReturnValue(false);

  vi.mocked(metadata.saveConnectionMetadata).mockImplementation(
    async (meta: any) => {
      // Snapshot at call time — the command mutates the same object afterwards.
      savedMetadata = structuredClone(meta);
    }
  );
  vi.mocked(metadata.buildEmailStackConfig).mockImplementation(
    (_meta: any, _region: any, overrides: any) => {
      capturedOverrides = overrides;
      return {} as any;
    }
  );

  vi.mocked(
    pulumi.automation.LocalWorkspace.createOrSelectStack
  ).mockResolvedValue({
    setConfig: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    exportStack: vi.fn().mockResolvedValue({ deployment: { resources: [] } }),
    up: vi.fn().mockResolvedValue({}),
  } as any);
});

describe("platform disconnect", () => {
  it("passes an explicit webhook: undefined so Pulumi deletes the platform target", async () => {
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
      connectedMetadata() as any
    );

    await disconnect({ force: true });

    // The KEY must be present — omitting it rebuilds the target from metadata.
    expect(capturedOverrides).toBeDefined();
    expect("webhook" in (capturedOverrides ?? {})).toBe(true);
    expect(capturedOverrides?.webhook).toBeUndefined();
  });

  it("leaves selfhostWebhook alone so the self-hosted plane keeps its target", async () => {
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
      connectedMetadata() as any
    );

    await disconnect({ force: true });

    // Absent key ⇒ builder reconstructs it from metadata. Present-but-undefined
    // would delete the customer's own control-plane target.
    expect("selfhostWebhook" in (capturedOverrides ?? {})).toBe(false);
    expect(savedMetadata.services.email.selfhostWebhook).toEqual({
      url: "https://selfhost.example.com",
      secret: "selfhost-secret-xyz",
    });
  });

  it("clears webhookSecret from metadata so later deploys stay disconnected", async () => {
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
      connectedMetadata() as any
    );

    await disconnect({ force: true });

    expect(metadata.saveConnectionMetadata).toHaveBeenCalled();
    expect(savedMetadata.services.email.webhookSecret).toBeUndefined();
    expect(savedMetadata.services.email.webhookUrl).toBeUndefined();
  });

  it("is a no-op when the account was never connected", async () => {
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
      connectedMetadata({ webhookSecret: undefined }) as any
    );

    await disconnect({ force: true });

    expect(metadata.buildEmailStackConfig).not.toHaveBeenCalled();
    expect(
      pulumi.automation.LocalWorkspace.createOrSelectStack
    ).not.toHaveBeenCalled();
  });

  it("deletes the cross-account console role so Wraps loses dashboard access", async () => {
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
      connectedMetadata() as any
    );

    await disconnect({ force: true });

    // Inline policy must be removed first — DeleteRole fails while one is attached.
    expect(iamMock.commandCalls(DeleteRolePolicyCommand)).toHaveLength(1);
    const del = iamMock.commandCalls(DeleteRoleCommand);
    expect(del).toHaveLength(1);
    expect(del[0].args[0].input.RoleName).toBe("wraps-console-access-role");
  });

  it("clears the stale platform externalId once the connection is gone", async () => {
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
      ...connectedMetadata(),
      platform: { externalId: "ext-abc", connectionId: "conn-abc" },
    } as any);

    await disconnect({ force: true });

    // saveConnectionMetadata is called twice; the last snapshot is the final state.
    expect(savedMetadata.platform).toBeUndefined();
  });

  it("treats an already-absent role as success, so the command is re-runnable", async () => {
    const notFound = Object.assign(new Error("not found"), {
      name: "NoSuchEntityException",
    });
    iamMock.on(DeleteRolePolicyCommand).rejects(notFound);
    iamMock.on(DeleteRoleCommand).rejects(notFound);
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
      connectedMetadata() as any
    );

    await expect(disconnect({ force: true })).resolves.toBeUndefined();
  });

  it("skips the prompt with --yes, matching connect", async () => {
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
      connectedMetadata() as any
    );

    await disconnect({ yes: true });

    expect(prompts.confirm).not.toHaveBeenCalled();
    expect(metadata.buildEmailStackConfig).toHaveBeenCalled();
  });

  it("aborts without touching metadata when the user declines the prompt", async () => {
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
      connectedMetadata() as any
    );
    vi.mocked(prompts.confirm).mockResolvedValue(false as never);

    await disconnect({});

    expect(metadata.saveConnectionMetadata).not.toHaveBeenCalled();
    expect(
      pulumi.automation.LocalWorkspace.createOrSelectStack
    ).not.toHaveBeenCalled();
  });
});
