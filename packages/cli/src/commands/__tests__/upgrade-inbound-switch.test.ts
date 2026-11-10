import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../utils/shared/json-output.js";

/**
 * Plan 041: `wraps email upgrade` runs the inbound trigger switch as its last
 * mutating step (after both of its metadata saves and the once-shown SMTP
 * output), never in --preview, and repairs a stack an older CLI redeployed.
 * Harness trimmed from upgrade.test.ts; the switch itself runs for real with
 * the receipt-rule SDK calls and the deploy seam mocked.
 */

const order: string[] = [];

vi.mock("@aws-sdk/client-route-53", () => ({
  Route53Client: vi.fn().mockImplementation(function () {
    return { send: vi.fn().mockResolvedValue({}) };
  }),
  ListHostedZonesByNameCommand: vi.fn(),
  ChangeResourceRecordSetsCommand: vi.fn(),
}));
vi.mock("../../utils/shared/s3-state.js", () => ({
  getStateBucketName: vi.fn(() => "wraps-state-123456789012-us-east-1"),
  getS3BackendUrl: vi.fn(() => "s3://wraps-state-123456789012-us-east-1"),
  stateBucketExists: vi.fn().mockResolvedValue(false),
  ensureStateBucket: vi.fn().mockResolvedValue(undefined),
  uploadMetadata: vi.fn().mockResolvedValue(undefined),
  deleteMetadata: vi.fn().mockResolvedValue(undefined),
  clearS3StackLocks: vi.fn().mockResolvedValue(undefined),
  downloadMetadata: vi.fn().mockResolvedValue(null),
  needsMigration: vi.fn().mockResolvedValue(false),
  migrateLocalPulumiState: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@pulumi/pulumi", () => ({
  automation: {
    LocalWorkspace: { createOrSelectStack: vi.fn() },
    installPulumiCli: vi.fn(),
  },
}));
vi.mock("@pulumi/pulumi/automation", () => ({
  LocalWorkspace: { createOrSelectStack: vi.fn() },
  installPulumiCli: vi.fn(),
}));
vi.mock("@clack/prompts");
vi.mock("../../utils/shared/aws.js");
vi.mock("../../utils/shared/pulumi.js");
vi.mock("../../utils/shared/fs.js");
vi.mock("../../utils/shared/metadata.js", async () => {
  const actual = await vi.importActual("../../utils/shared/metadata.js");
  return {
    ...actual,
    loadConnectionMetadata: vi.fn(),
    saveConnectionMetadata: vi.fn(),
    findConnectionsWithService: vi.fn().mockResolvedValue([]),
    findConnectionsForAccount: vi.fn().mockResolvedValue([]),
  };
});
vi.mock("../../utils/shared/prompts.js");
vi.mock("../../infrastructure/email-stack.js");
vi.mock("../../utils/email/event-pipeline-check.js", () => ({
  checkEventPipeline: vi.fn().mockResolvedValue([]),
}));
// Every SES call the switch can make, so nothing reaches real SES.
vi.mock("../../utils/email/receipt-rules.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../utils/email/receipt-rules.js")>();
  return {
    ...actual,
    describeInboundReceiptRule: vi.fn(),
    syncReceiptRuleTrigger: vi.fn(),
    createReceiptRule: vi.fn(),
    createReceiptRuleSet: vi.fn(),
    setActiveReceiptRuleSet: vi.fn(),
    addDomainToReceiptRule: vi.fn(),
  };
});
// DNS writers upgrade can reach; `--action redeploy` must reach none of them.
vi.mock("../../utils/dns/credentials.js", () => ({
  getDNSCredentials: vi.fn().mockResolvedValue({ valid: false }),
  detectAvailableDNSProviders: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../utils/dns/create-records.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../utils/dns/create-records.js")>();
  return {
    ...actual,
    createDNSRecordsForProvider: vi.fn(),
  };
});

import * as prompts from "@clack/prompts";
import { deployEmailStack } from "../../infrastructure/email-stack.js";
import * as telemetry from "../../telemetry/events.js";
import * as dnsRecords from "../../utils/dns/create-records.js";
import * as dnsCredentials from "../../utils/dns/credentials.js";
import { deployHooks } from "../../utils/email/email-stack-deploy.js";
import {
  describeInboundReceiptRule,
  setActiveReceiptRuleSet,
  syncReceiptRuleTrigger,
} from "../../utils/email/receipt-rules.js";
import * as aws from "../../utils/shared/aws.js";
import * as fsUtils from "../../utils/shared/fs.js";
import * as metadata from "../../utils/shared/metadata.js";
import * as pulumiUtils from "../../utils/shared/pulumi.js";
import { upgrade } from "../email/upgrade.js";

const BUCKET = "wraps-inbound-123456789012-us-east-1";
const LEGACY_RULE = {
  Name: "wraps-inbound-catch-all",
  Enabled: true,
  ScanEnabled: true,
  Recipients: ["inbound.example.com"],
  Actions: [{ S3Action: { BucketName: BUCKET, ObjectKeyPrefix: "raw/" } }],
};
const SWITCHED_RULE = {
  ...LEGACY_RULE,
  Actions: [
    { S3Action: { BucketName: BUCKET, ObjectKeyPrefix: "mail/" } },
    {
      LambdaAction: {
        FunctionArn:
          "arn:aws:lambda:us-east-1:123456789012:function:wraps-inbound-email-processor",
        InvocationType: "Event",
      },
    },
  ],
};

function connection(trigger?: "s3-notification" | "ses-lambda-action") {
  return {
    version: "1.0.0",
    accountId: "123456789012",
    region: "us-east-1",
    provider: "aws",
    timestamp: new Date().toISOString(),
    services: {
      email: {
        preset: "starter",
        pulumiStackName: "wraps-123456789012-us-east-1",
        config: {
          domain: "example.com",
          tracking: { enabled: true, opens: true, clicks: true },
          tlsRequired: true,
          reputationMetrics: false,
          suppressionList: { enabled: true, reasons: ["BOUNCE", "COMPLAINT"] },
          eventTracking: { enabled: false },
          emailArchiving: { enabled: false, retention: "30days" },
          sendingEnabled: true,
          inbound: {
            enabled: true,
            subdomain: "inbound",
            receivingDomain: "inbound.example.com",
            bucketName: BUCKET,
            webhookSecret: "keep-me",
            ...(trigger ? { trigger } : {}),
          },
          inboundDomains: [
            {
              subdomain: "inbound",
              receivingDomain: "inbound.example.com",
              parentDomain: "example.com",
              addedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      },
    },
  } as any;
}

/** Snapshot of each saved metadata (the object is mutated in place). */
const saves: Array<{ preset?: string; trigger?: string }> = [];

let stackUp: ReturnType<typeof vi.fn>;

async function setupPulumi(upOutputs: Record<string, unknown> = {}) {
  const pulumi = await import("@pulumi/pulumi");
  const pulumiAutomation = await import("@pulumi/pulumi/automation");
  stackUp = vi.fn().mockImplementation(async () => {
    order.push("upgrade-up");
    return {
      outputs: {
        roleArn: { value: "arn:aws:iam::123456789012:role/wraps-email-role" },
        configSetName: { value: "wraps-email-tracking" },
        region: { value: "us-east-1" },
        ...Object.fromEntries(
          Object.entries(upOutputs).map(([k, v]) => [k, { value: v }])
        ),
      },
    };
  });
  const stack = {
    workspace: { selectStack: vi.fn().mockResolvedValue(undefined) },
    setConfig: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue({}),
    up: stackUp,
  } as any;
  const createOrSelect = vi.fn().mockImplementation(async (args) => {
    if (args.program) {
      await args.program();
    }
    return stack;
  });
  vi.mocked(
    pulumi.automation.LocalWorkspace.createOrSelectStack
  ).mockImplementation(createOrSelect);
  vi.mocked(
    pulumiAutomation.LocalWorkspace.createOrSelectStack
  ).mockImplementation(createOrSelect);
}

let exitSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  saves.length = 0;
  setJsonMode(false);

  vi.mocked(prompts.spinner).mockReturnValue({
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
  } as never);
  vi.mocked(prompts.log).info = vi.fn();
  vi.mocked(prompts.log).success = vi.fn();
  vi.mocked(prompts.log).error = vi.fn();
  vi.mocked(prompts.log).warn = vi.fn();
  vi.mocked(prompts.log).step = vi.fn();
  vi.mocked(prompts.isCancel).mockReturnValue(false);
  vi.mocked(prompts.confirm).mockResolvedValue(true as never);

  vi.mocked(aws.validateAWSCredentials).mockResolvedValue({
    accountId: "123456789012",
    userId: "AIDATEST",
    arn: "arn:aws:iam::123456789012:user/test",
  });
  vi.mocked(aws.getAWSRegion).mockResolvedValue("us-east-1");
  vi.mocked(aws.listSESDomains).mockResolvedValue([
    { domain: "example.com", verified: true },
  ]);
  vi.mocked(pulumiUtils.ensurePulumiInstalled).mockResolvedValue(false);
  vi.mocked(fsUtils.ensurePulumiWorkDir).mockReturnValue(undefined as never);
  vi.mocked(fsUtils.getPulumiWorkDir).mockReturnValue("/mock/.wraps/pulumi");
  vi.mocked(deployEmailStack).mockResolvedValue({} as any);

  vi.mocked(metadata.saveConnectionMetadata).mockImplementation(async (m) => {
    const email = m.services.email;
    saves.push({
      preset: email?.preset,
      trigger: email?.config.inbound?.trigger,
    });
    order.push(`save:${email?.config.inbound?.trigger ?? "absent"}`);
  });

  vi.mocked(describeInboundReceiptRule).mockResolvedValue(LEGACY_RULE);
  vi.mocked(syncReceiptRuleTrigger).mockImplementation(
    async (_r, _a, _b, trigger) => {
      order.push(`sync:${trigger}`);
    }
  );
  deployHooks.deploy = vi.fn(async (params) => {
    order.push(
      `seam-up:${params.stackConfig.emailConfig.inbound?.trigger ?? "s3-notification"}`
    );
  });

  exitSpy = vi.spyOn(process, "exit").mockImplementation(((code: number) => {
    throw new Error(`process.exit(${code})`);
  }) as never);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  exitSpy.mockRestore();
  logSpy.mockRestore();
  setJsonMode(false);
});

function presetUpgrade() {
  vi.mocked(prompts.select)
    .mockResolvedValueOnce("preset" as never)
    .mockResolvedValueOnce("production" as never);
}

describe("email upgrade: inbound trigger switch", () => {
  it("switches after upgrade's own saves: upgrade-up, saves, sync, save(new), up(new)", async () => {
    await setupPulumi();
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(connection());
    presetUpgrade();

    await upgrade({});

    expect(order).toEqual([
      "upgrade-up",
      "save:absent",
      "save:absent",
      "sync:ses-lambda-action",
      "save:ses-lambda-action",
      "seam-up:ses-lambda-action",
    ]);
    expect(saves.at(-1)).toEqual({
      preset: "production",
      trigger: "ses-lambda-action",
    });
    // The switch skipped step 1: upgrade's deploy was it.
    expect(deployHooks.deploy).toHaveBeenCalledTimes(1);
  });

  it("never switches in --preview", async () => {
    await setupPulumi();
    vi.mocked(pulumiUtils.previewWithResourceChanges).mockResolvedValue({
      changeSummary: {},
      resourceChanges: [],
    } as any);
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(connection());
    presetUpgrade();

    await upgrade({ preview: true });

    // The preview really ran (the test would pass vacuously otherwise)...
    expect(pulumiUtils.previewWithResourceChanges).toHaveBeenCalledTimes(1);
    // ...and nothing was switched or saved.
    expect(syncReceiptRuleTrigger).not.toHaveBeenCalled();
    expect(deployHooks.deploy).not.toHaveBeenCalled();
    expect(saves).toEqual([]);
  });

  it("a failed sync exits non-zero naming step 2 and leaves the saved preset", async () => {
    await setupPulumi();
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(connection());
    vi.mocked(syncReceiptRuleTrigger).mockRejectedValue(new Error("denied"));
    presetUpgrade();

    await expect(upgrade({})).rejects.toThrow("process.exit(1)");

    expect(saves.at(-1)).toEqual({ preset: "production", trigger: undefined });
    expect(deployHooks.deploy).not.toHaveBeenCalled();
    const errorText = vi
      .mocked(prompts.log.error)
      .mock.calls.map((c) => String(c[0]))
      .join("\n");
    expect(errorText).toContain("step 2");
    expect(
      vi
        .mocked(prompts.log.info)
        .mock.calls.some((c) => String(c[0]).includes("wraps email upgrade"))
    ).toBe(true);
  });

  it("with no receipt rule: saves the new mode and deploys once more, no sync", async () => {
    await setupPulumi();
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(connection());
    vi.mocked(describeInboundReceiptRule).mockResolvedValue(null);
    presetUpgrade();

    await upgrade({});

    expect(syncReceiptRuleTrigger).not.toHaveBeenCalled();
    expect(order.slice(-2)).toEqual([
      "save:ses-lambda-action",
      "seam-up:ses-lambda-action",
    ]);
  });

  it("prints once-shown SMTP credentials before the switch, even when the switch fails", async () => {
    await setupPulumi({
      smtpUserArn: "arn:aws:iam::123456789012:user/wraps-smtp",
      smtpUsername: "AKIATESTUSER",
      smtpPassword: "smtp-secret-password",
      smtpEndpoint: "email-smtp.us-east-1.amazonaws.com",
    });
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(connection());
    vi.mocked(syncReceiptRuleTrigger).mockRejectedValue(new Error("denied"));

    await expect(
      upgrade({ action: "smtp-credentials", yes: true })
    ).rejects.toThrow("process.exit(1)");

    const passwordLine = logSpy.mock.calls.findIndex((c) =>
      String(c[0]).includes("smtp-secret-password")
    );
    expect(passwordLine).toBeGreaterThanOrEqual(0);
    const passwordOrder = logSpy.mock.invocationCallOrder[passwordLine];
    const syncOrder = vi.mocked(syncReceiptRuleTrigger).mock
      .invocationCallOrder[0];
    expect(passwordOrder).toBeLessThan(syncOrder);
    // and smtpCredentials was saved before the switch ran
    expect(saves.length).toBeGreaterThanOrEqual(2);
  });

  describe("repairing a stack an older CLI redeployed", () => {
    it("(a) saved trigger still ses-lambda-action: upgrade's deploy is built from it (restoring the SES permission and mail/*), no switch", async () => {
      await setupPulumi();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
        connection("ses-lambda-action")
      );
      presetUpgrade();

      await upgrade({});

      expect(vi.mocked(deployEmailStack)).toHaveBeenCalledTimes(1);
      const deployed = vi.mocked(deployEmailStack).mock.calls[0][0];
      expect(deployed.emailConfig.inbound?.trigger).toBe("ses-lambda-action");
      expect(syncReceiptRuleTrigger).not.toHaveBeenCalled();
      expect(deployHooks.deploy).not.toHaveBeenCalled();
    });

    it("(b) older CLI dropped the saved trigger while the rule is already mail/ + Lambda: the switch still syncs, saves and removes the S3 trigger", async () => {
      await setupPulumi();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
        connection(undefined)
      );
      vi.mocked(describeInboundReceiptRule).mockResolvedValue(SWITCHED_RULE);
      presetUpgrade();

      await upgrade({});

      // upgrade's own deploy ran in the old mode: it restores the SES
      // permission and mail/* while keeping the (idle) raw/ notification...
      const deployed = vi.mocked(deployEmailStack).mock.calls[0][0];
      expect(deployed.emailConfig.inbound?.trigger).toBeUndefined();
      // ...then the switch ends single-trigger in the new mode.
      expect(order.slice(-3)).toEqual([
        "sync:ses-lambda-action",
        "save:ses-lambda-action",
        "seam-up:ses-lambda-action",
      ]);
    });
  });

  describe("--action redeploy (the finishing and repair command)", () => {
    function upgradeJson(): Record<string, any> | undefined {
      const line = logSpy.mock.calls
        .map((c) => c[0])
        .find(
          (a) =>
            typeof a === "string" && a.includes('"command":"email.upgrade"')
        );
      return line ? JSON.parse(line as string) : undefined;
    }

    it("saved ses-lambda-action: deploys the saved config unchanged, no switch, no rule-set activation, no DNS writes", async () => {
      await setupPulumi({
        domain: "example.com",
        dkimTokens: ["a", "b", "c"],
      });
      const saved = connection("ses-lambda-action");
      saved.services.email.dnsProvider = "cloudflare";
      saved.services.email.config.tracking = {
        enabled: true,
        opens: true,
        clicks: true,
        httpsEnabled: true,
        customRedirectDomain: "link.example.com",
      };
      const savedConfig = JSON.parse(
        JSON.stringify(saved.services.email.config)
      );
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(saved);

      await upgrade({ action: "redeploy", yes: true });

      expect(vi.mocked(deployEmailStack)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(deployEmailStack).mock.calls[0][0].emailConfig).toEqual(
        savedConfig
      );
      expect(prompts.select).not.toHaveBeenCalled();
      expect(syncReceiptRuleTrigger).not.toHaveBeenCalled();
      expect(deployHooks.deploy).not.toHaveBeenCalled();
      expect(setActiveReceiptRuleSet).not.toHaveBeenCalled();
      expect(dnsCredentials.getDNSCredentials).not.toHaveBeenCalled();
      expect(dnsCredentials.detectAvailableDNSProviders).not.toHaveBeenCalled();
      expect(dnsRecords.createDNSRecordsForProvider).not.toHaveBeenCalled();
      expect(saves.at(-1)).toEqual({
        preset: "starter",
        trigger: "ses-lambda-action",
      });
    });

    it("saved old mode, --json --yes: runs the switch and reports the resulting trigger", async () => {
      await setupPulumi();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
        connection()
      );
      setJsonMode(true);

      await upgrade({ action: "redeploy", yes: true, json: true });

      expect(order).toEqual([
        "upgrade-up",
        "save:absent",
        "save:absent",
        "sync:ses-lambda-action",
        "save:ses-lambda-action",
        "seam-up:ses-lambda-action",
      ]);
      expect(setActiveReceiptRuleSet).not.toHaveBeenCalled();
      const out = upgradeJson();
      expect(out?.success).toBe(true);
      expect(out?.data.action).toBe("redeploy");
      expect(out?.data.trigger).toBe("ses-lambda-action");
    });

    it("(b) through redeploy: trigger dropped, rule already mail/ + Lambda: ends single-trigger in the new mode", async () => {
      await setupPulumi();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
        connection(undefined)
      );
      vi.mocked(describeInboundReceiptRule).mockResolvedValue(SWITCHED_RULE);

      await upgrade({ action: "redeploy", yes: true });

      const deployed = vi.mocked(deployEmailStack).mock.calls[0][0];
      expect(deployed.emailConfig.inbound?.trigger).toBeUndefined();
      expect(order.slice(-3)).toEqual([
        "sync:ses-lambda-action",
        "save:ses-lambda-action",
        "seam-up:ses-lambda-action",
      ]);
      expect(setActiveReceiptRuleSet).not.toHaveBeenCalled();
    });

    it("--json switch failure: JSON error envelope naming step and redeploy, exit 1, telemetry", async () => {
      await setupPulumi();
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
        connection()
      );
      vi.mocked(syncReceiptRuleTrigger).mockRejectedValue(new Error("denied"));
      const trackSpy = vi.spyOn(telemetry, "trackError");
      setJsonMode(true);

      await expect(
        upgrade({ action: "redeploy", yes: true, json: true })
      ).rejects.toThrow("process.exit(1)");

      const out = upgradeJson();
      expect(out?.success).toBe(false);
      expect(out?.error.code).toBe("INBOUND_TRIGGER_SWITCH_FAILED");
      expect(out?.error.message).toContain("step 2");
      expect(out?.error.suggestion).toContain(
        "wraps email upgrade --action redeploy"
      );
      expect(trackSpy).toHaveBeenCalledWith(
        "INBOUND_TRIGGER_SWITCH_FAILED",
        "email.upgrade",
        { step: "2" }
      );
    });
  });
});
