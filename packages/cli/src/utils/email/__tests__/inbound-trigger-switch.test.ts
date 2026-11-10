import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionMetadata } from "../../shared/metadata.js";

const calls: string[] = [];

vi.mock("../receipt-rules.js", () => ({
  describeInboundReceiptRule: vi.fn(),
  syncReceiptRuleTrigger: vi.fn(),
}));

vi.mock("../../shared/metadata.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../shared/metadata.js")>();
  return {
    ...actual,
    saveConnectionMetadata: vi.fn(),
  };
});

import { saveConnectionMetadata } from "../../shared/metadata.js";
import { deployHooks } from "../email-stack-deploy.js";
import {
  isInboundTriggerSwitchError,
  switchInboundTrigger,
} from "../inbound-trigger-switch.js";
import {
  describeInboundReceiptRule,
  syncReceiptRuleTrigger,
} from "../receipt-rules.js";

const RULE = {
  Name: "wraps-inbound-catch-all",
  Enabled: true,
  Recipients: ["inbound.example.com"],
  Actions: [
    {
      S3Action: {
        BucketName: "wraps-inbound-123456789012-us-east-1",
        ObjectKeyPrefix: "raw/",
      },
    },
  ],
};

function metadata(trigger?: "s3-notification" | "ses-lambda-action") {
  return {
    version: "1.0.0",
    accountId: "123456789012",
    region: "us-east-1",
    provider: "aws",
    timestamp: "2026-11-10T00:00:00.000Z",
    services: {
      email: {
        preset: "production",
        deployedAt: "2026-11-10T00:00:00.000Z",
        config: {
          domain: "example.com",
          sendingEnabled: true,
          inbound: {
            enabled: true,
            subdomain: "inbound",
            receivingDomain: "inbound.example.com",
            bucketName: "wraps-inbound-123456789012-us-east-1",
            webhookSecret: "keep-me",
            retention: "90days",
            ...(trigger ? { trigger } : {}),
          },
        },
      },
    },
  } as ConnectionMetadata;
}

const deployedModes: Array<string | undefined> = [];
const savedModes: Array<string | undefined> = [];

function ctx(m: ConnectionMetadata, extra: Record<string, unknown> = {}) {
  return {
    metadata: m,
    accountId: "123456789012",
    region: "us-east-1",
    stackName: "wraps-123456789012-us-east-1",
    ...extra,
  };
}

beforeEach(() => {
  calls.length = 0;
  deployedModes.length = 0;
  savedModes.length = 0;
  vi.mocked(describeInboundReceiptRule).mockReset().mockResolvedValue(RULE);
  vi.mocked(syncReceiptRuleTrigger)
    .mockReset()
    .mockImplementation(async (_r, _a, _b, trigger) => {
      calls.push(`sync:${trigger}`);
    });
  vi.mocked(saveConnectionMetadata)
    .mockReset()
    .mockImplementation(async (m) => {
      const mode = m.services.email?.config.inbound?.trigger;
      savedModes.push(mode);
      calls.push(`save:${mode}`);
    });
  deployHooks.deploy = vi.fn(async (params) => {
    const mode =
      params.stackConfig.emailConfig.inbound?.trigger ?? "s3-notification";
    deployedModes.push(mode);
    calls.push(`up:${mode}`);
  });
});

describe("switchInboundTrigger", () => {
  it("runs up (old mode), sync, save, up (new mode) in that order", async () => {
    const m = metadata();
    const result = await switchInboundTrigger(ctx(m));

    expect(calls).toEqual([
      "up:s3-notification",
      "sync:ses-lambda-action",
      "save:ses-lambda-action",
      "up:ses-lambda-action",
    ]);
    expect(result).toEqual({ trigger: "ses-lambda-action", ruleExisted: true });
    expect(vi.mocked(syncReceiptRuleTrigger)).toHaveBeenCalledWith(
      "us-east-1",
      "123456789012",
      "wraps-inbound-123456789012-us-east-1",
      "ses-lambda-action"
    );
  });

  it("deep-merges the trigger into the caller's metadata, keeping every other inbound field", async () => {
    const m = metadata("s3-notification");
    await switchInboundTrigger(ctx(m));
    expect(m.services.email?.config.inbound).toEqual({
      enabled: true,
      subdomain: "inbound",
      receivingDomain: "inbound.example.com",
      bucketName: "wraps-inbound-123456789012-us-east-1",
      webhookSecret: "keep-me",
      retention: "90days",
      trigger: "ses-lambda-action",
    });
  });

  it("skips step 1 when the caller just deployed in the old mode", async () => {
    await switchInboundTrigger(ctx(metadata(), { skipInitialDeploy: true }));
    expect(calls).toEqual([
      "sync:ses-lambda-action",
      "save:ses-lambda-action",
      "up:ses-lambda-action",
    ]);
  });

  it("with no rule: sets the trigger, saves, up #2 only, no sync", async () => {
    vi.mocked(describeInboundReceiptRule).mockResolvedValue(null);
    const result = await switchInboundTrigger(ctx(metadata()));
    expect(calls).toEqual(["save:ses-lambda-action", "up:ses-lambda-action"]);
    expect(result.ruleExisted).toBe(false);
  });

  it("is a no-op when metadata is already in the new mode", async () => {
    await switchInboundTrigger(ctx(metadata("ses-lambda-action")));
    expect(calls).toEqual([]);
    expect(vi.mocked(describeInboundReceiptRule)).not.toHaveBeenCalled();
  });

  it("still syncs when the rule already looks switched but metadata is old (design §4.4 row 3 recovery)", async () => {
    vi.mocked(describeInboundReceiptRule).mockResolvedValue({
      ...RULE,
      Actions: [
        {
          S3Action: {
            BucketName: "wraps-inbound-123456789012-us-east-1",
            ObjectKeyPrefix: "mail/",
          },
        },
      ],
    });
    await switchInboundTrigger(ctx(metadata(), { skipInitialDeploy: true }));
    expect(calls).toEqual([
      "sync:ses-lambda-action",
      "save:ses-lambda-action",
      "up:ses-lambda-action",
    ]);
  });

  describe("each failure row (design §4.4)", () => {
    it("step 1: no sync, no save; metadata keeps the old mode", async () => {
      deployHooks.deploy = vi.fn().mockRejectedValue(new Error("deploy boom"));
      const m = metadata();
      const error = await switchInboundTrigger(ctx(m)).catch((e) => e);
      expect(isInboundTriggerSwitchError(error)).toBe(true);
      expect(error.code).toBe("INBOUND_TRIGGER_SWITCH_FAILED");
      expect(error.step).toBe(1);
      expect(error.message).toContain("old code, old rule");
      expect(error.message).toContain("deploy boom");
      expect(error.suggestion).toContain(
        "wraps email upgrade --action redeploy"
      );
      expect(vi.mocked(syncReceiptRuleTrigger)).not.toHaveBeenCalled();
      expect(savedModes).toEqual([]);
      expect(m.services.email?.config.inbound?.trigger).toBeUndefined();
    });

    it("step 2: sync fails, nothing saved, no second deploy", async () => {
      vi.mocked(syncReceiptRuleTrigger).mockRejectedValue(
        new Error("sync boom")
      );
      const m = metadata();
      const error = await switchInboundTrigger(ctx(m)).catch((e) => e);
      expect(error.step).toBe(2);
      expect(error.message).toContain("new code, old rule");
      expect(deployedModes).toEqual(["s3-notification"]);
      expect(savedModes).toEqual([]);
      expect(m.services.email?.config.inbound?.trigger).toBeUndefined();
    });

    it("step 3: save fails after the sync, no second deploy", async () => {
      vi.mocked(saveConnectionMetadata).mockRejectedValue(
        new Error("disk full")
      );
      const error = await switchInboundTrigger(ctx(metadata())).catch((e) => e);
      expect(error.step).toBe(3);
      expect(error.message).toContain("inbound status");
      expect(deployedModes).toEqual(["s3-notification"]);
    });

    it("step 4: second deploy fails after rule and metadata are new", async () => {
      deployHooks.deploy = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("up2 boom"));
      const error = await switchInboundTrigger(ctx(metadata())).catch((e) => e);
      expect(error.step).toBe(4);
      expect(error.message).toContain("idle");
      expect(savedModes).toEqual(["ses-lambda-action"]);
    });

    it("a failed rule read after the caller's own deploy reports step 2", async () => {
      vi.mocked(describeInboundReceiptRule).mockRejectedValue(
        new Error("AccessDenied")
      );
      const error = await switchInboundTrigger(
        ctx(metadata(), { skipInitialDeploy: true })
      ).catch((e) => e);
      expect(error.step).toBe(2);
      expect(calls).toEqual([]);
    });
  });
});
