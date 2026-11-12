import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Plan 057: `wraps sms destroy` refuses to work from local state when the
// account's S3 state backend is unreachable.
vi.mock("@pulumi/pulumi", () => ({
  automation: { LocalWorkspace: { selectStack: vi.fn() } },
}));
vi.mock("@pulumi/pulumi/automation", () => ({
  LocalWorkspace: { selectStack: vi.fn() },
  installPulumiCli: vi.fn(),
}));
vi.mock("@clack/prompts", () => ({
  select: vi.fn(),
  confirm: vi.fn(),
  text: vi.fn(),
  isCancel: vi.fn().mockReturnValue(false),
  cancel: vi.fn(),
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() })),
  log: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    step: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock("../../../utils/shared/aws.js");
vi.mock("../../../utils/shared/fs.js");
vi.mock("../../../utils/shared/metadata.js");
vi.mock("../../../utils/shared/s3-state.js", () => ({
  getS3BackendUrl: vi.fn(
    (accountId: string, region: string) =>
      `s3://wraps-state-${accountId}-${region}`
  ),
}));
vi.mock("../../../utils/shared/pulumi.js", () => ({
  ensurePulumiInstalled: vi.fn().mockResolvedValue(false),
  previewWithResourceChanges: vi
    .fn()
    .mockResolvedValue({ changeSummary: {}, resourceChanges: [] }),
}));
vi.mock("../../../infrastructure/sms-stack.js", () => ({
  deleteSMSPhonePoolWithSDK: vi.fn().mockResolvedValue(undefined),
  deleteSMSEventDestinationWithSDK: vi.fn().mockResolvedValue(undefined),
  deleteSMSProtectConfigurationWithSDK: vi.fn().mockResolvedValue(undefined),
}));

import * as prompts from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import * as smsStack from "../../../infrastructure/sms-stack.js";
import * as aws from "../../../utils/shared/aws.js";
import { WrapsError } from "../../../utils/shared/errors.js";
import * as fsUtils from "../../../utils/shared/fs.js";
import { setJsonMode } from "../../../utils/shared/json-output.js";
import * as metadata from "../../../utils/shared/metadata.js";
import { smsDestroy } from "../destroy.js";

const S3_URL = "s3://wraps-state-123456789012-us-east-1";
const LOCAL_URL = "file:///mock/.wraps/pulumi";

function mockStack() {
  const stack = {
    destroy: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    workspace: { removeStack: vi.fn().mockResolvedValue(undefined) },
  };
  vi.mocked(pulumi.automation.LocalWorkspace.selectStack).mockResolvedValue(
    stack as never
  );
  return stack;
}

describe("sms destroy fails closed on local state (plan 057)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WRAPS_LOCAL_ONLY", "");
    vi.stubEnv("AWS_REGION", "");
    vi.stubEnv("AWS_DEFAULT_REGION", "");
    vi.mocked(prompts.confirm).mockResolvedValue(true as never);
    vi.mocked(prompts.isCancel).mockReturnValue(false);
    vi.mocked(aws.validateAWSCredentials).mockResolvedValue({
      accountId: "123456789012",
      userId: "AIDAEXAMPLE",
      arn: "arn:aws:iam::123456789012:user/test",
    });
    vi.mocked(aws.getAWSRegion).mockResolvedValue("us-east-1");
    vi.mocked(fsUtils.getPulumiWorkDir).mockReturnValue("/mock/.wraps/pulumi");
    // The S3 backend is unreachable: ensurePulumiWorkDir falls back to file://.
    vi.mocked(fsUtils.ensurePulumiWorkDir).mockImplementation(async () => {
      vi.stubEnv("PULUMI_BACKEND_URL", LOCAL_URL);
    });
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
      version: "1.0.0",
      accountId: "123456789012",
      region: "us-east-1",
      provider: "vercel",
      timestamp: new Date().toISOString(),
      services: {
        sms: {
          preset: "production",
          // eventTracking enables the event destination delete.
          config: { eventTracking: { enabled: true } },
          pulumiStackName: "wraps-sms-123456789012-us-east-1",
          deployedAt: new Date().toISOString(),
        },
      },
    } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    setJsonMode(false);
  });

  it("preview with the S3 fallback throws unwrapped and selects no stack", async () => {
    mockStack();

    const error = await smsDestroy({
      preview: true,
      region: "us-east-1",
    }).catch((e) => e);

    expect(error).toBeInstanceOf(WrapsError);
    expect(error.code).toBe("STATE_BACKEND_UNREACHABLE");
    expect(pulumi.automation.LocalWorkspace.selectStack).not.toHaveBeenCalled();
  });

  it("destroy with the S3 fallback throws and runs no delete or metadata change", async () => {
    const stack = mockStack();

    const error = await smsDestroy({ region: "us-east-1" }).catch((e) => e);

    expect(error).toBeInstanceOf(WrapsError);
    expect(error.code).toBe("STATE_BACKEND_UNREACHABLE");
    expect(smsStack.deleteSMSPhonePoolWithSDK).not.toHaveBeenCalled();
    expect(smsStack.deleteSMSEventDestinationWithSDK).not.toHaveBeenCalled();
    expect(
      smsStack.deleteSMSProtectConfigurationWithSDK
    ).not.toHaveBeenCalled();
    expect(pulumi.automation.LocalWorkspace.selectStack).not.toHaveBeenCalled();
    expect(stack.destroy).not.toHaveBeenCalled();
    expect(stack.workspace.removeStack).not.toHaveBeenCalled();
    expect(metadata.removeServiceFromConnection).not.toHaveBeenCalled();
    expect(metadata.saveConnectionMetadata).not.toHaveBeenCalled();
  });

  it("WRAPS_LOCAL_ONLY=1 proceeds on file:// for preview and destroy", async () => {
    vi.stubEnv("WRAPS_LOCAL_ONLY", "1");
    const stack = mockStack();

    await expect(
      smsDestroy({ preview: true, region: "us-east-1" })
    ).resolves.toBeUndefined();
    await expect(smsDestroy({ region: "us-east-1" })).resolves.toBeUndefined();

    expect(stack.destroy).toHaveBeenCalled();
    expect(stack.workspace.removeStack).toHaveBeenCalled();
    expect(smsStack.deleteSMSPhonePoolWithSDK).toHaveBeenCalled();
  });

  it("--json --force with the S3 fallback throws and prints no sms.destroy envelope", async () => {
    const stack = mockStack();
    setJsonMode(true);
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      const error = await smsDestroy({
        force: true,
        json: true,
        region: "us-east-1",
      }).catch((e) => e);

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.code).toBe("STATE_BACKEND_UNREACHABLE");
      expect(smsStack.deleteSMSPhonePoolWithSDK).not.toHaveBeenCalled();
      expect(stack.destroy).not.toHaveBeenCalled();
      expect(
        consoleLogSpy.mock.calls.some((c) =>
          String(c[0]).includes("sms.destroy")
        )
      ).toBe(false);
    } finally {
      consoleLogSpy.mockRestore();
    }
  });

  it("guards the caller's account and region, not the metadata's", async () => {
    vi.mocked(aws.validateAWSCredentials).mockResolvedValue({
      accountId: "999999999999",
      userId: "AIDAEXAMPLE",
      arn: "arn:aws:iam::999999999999:user/test",
    });
    vi.mocked(fsUtils.ensurePulumiWorkDir).mockImplementation(
      async (options) => {
        vi.stubEnv(
          "PULUMI_BACKEND_URL",
          `s3://wraps-state-${options?.accountId}-${options?.region}`
        );
      }
    );
    mockStack();

    await smsDestroy({ force: true, region: "eu-west-1" });

    expect(fsUtils.ensurePulumiWorkDir).toHaveBeenCalledWith({
      accountId: "999999999999",
      region: "eu-west-1",
    });
  });

  it("an S3 backend proceeds without WRAPS_LOCAL_ONLY", async () => {
    vi.mocked(fsUtils.ensurePulumiWorkDir).mockImplementation(async () => {
      vi.stubEnv("PULUMI_BACKEND_URL", S3_URL);
    });
    const stack = mockStack();

    await smsDestroy({ region: "us-east-1" });

    expect(stack.destroy).toHaveBeenCalled();
  });

  it("checks the backend after the last prompt and before the first delete", async () => {
    vi.stubEnv("WRAPS_LOCAL_ONLY", "1");
    mockStack();

    await smsDestroy({ region: "us-east-1" });

    const lastPrompt = Math.max(
      ...vi.mocked(prompts.confirm).mock.invocationCallOrder
    );
    const guard = vi.mocked(fsUtils.ensurePulumiWorkDir).mock
      .invocationCallOrder[0];
    const firstDelete = vi.mocked(smsStack.deleteSMSPhonePoolWithSDK).mock
      .invocationCallOrder[0];
    expect(lastPrompt).toBeLessThan(guard);
    expect(guard).toBeLessThan(firstDelete);
  });
});
