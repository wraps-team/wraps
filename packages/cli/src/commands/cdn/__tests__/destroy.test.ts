import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Plan 057: `wraps cdn destroy` refuses to work from local state when the
// account's S3 state backend is unreachable, before it touches DNS or empties
// the CDN bucket.
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
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(function () {
    return { send: vi.fn().mockResolvedValue({}) };
  }),
  ListObjectVersionsCommand: vi.fn(),
  DeleteObjectsCommand: vi.fn(),
}));
vi.mock("@aws-sdk/client-route-53", () => ({
  Route53Client: vi.fn().mockImplementation(function () {
    return {
      send: vi.fn().mockResolvedValue({
        ResourceRecordSets: [{ Name: "cdn.example.com.", Type: "CNAME" }],
      }),
    };
  }),
  ListResourceRecordSetsCommand: vi.fn(),
  ChangeResourceRecordSetsCommand: vi.fn(),
}));
vi.mock("../../../utils/route53.js", () => ({
  findHostedZone: vi.fn(),
}));
vi.mock("../../../utils/shared/aws.js");
vi.mock("../../../utils/shared/fs.js");
vi.mock("../../../utils/shared/metadata.js");
vi.mock("../../../utils/shared/s3-state.js", () => ({
  getS3BackendUrl: vi.fn(() => "s3://wraps-state-123456789012-us-east-1"),
}));
vi.mock("../../../utils/shared/pulumi.js", () => ({
  ensurePulumiInstalled: vi.fn().mockResolvedValue(false),
  previewWithResourceChanges: vi
    .fn()
    .mockResolvedValue({ changeSummary: {}, resourceChanges: [] }),
  withLockRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import * as route53Sdk from "@aws-sdk/client-route-53";
import * as s3Sdk from "@aws-sdk/client-s3";
import * as prompts from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import { findHostedZone } from "../../../utils/route53.js";
import * as aws from "../../../utils/shared/aws.js";
import { WrapsError } from "../../../utils/shared/errors.js";
import * as fsUtils from "../../../utils/shared/fs.js";
import * as metadata from "../../../utils/shared/metadata.js";
import { cdnDestroy } from "../destroy.js";

const S3_URL = "s3://wraps-state-123456789012-us-east-1";
const LOCAL_URL = "file:///mock/.wraps/pulumi";

function mockStack() {
  const stack = {
    destroy: vi.fn().mockResolvedValue(undefined),
    workspace: { removeStack: vi.fn().mockResolvedValue(undefined) },
  };
  vi.mocked(pulumi.automation.LocalWorkspace.selectStack).mockResolvedValue(
    stack as never
  );
  return stack;
}

describe("cdn destroy fails closed on local state (plan 057)", () => {
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
      process.env.PULUMI_BACKEND_URL = LOCAL_URL;
      return undefined as never;
    });
    // A custom domain with a hosted zone turns on the DNS deletes.
    vi.mocked(findHostedZone).mockResolvedValue({
      id: "Z123456789",
      name: "example.com",
    });
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue({
      version: "1.0.0",
      accountId: "123456789012",
      region: "us-east-1",
      provider: "vercel",
      timestamp: new Date().toISOString(),
      services: {
        cdn: {
          preset: "production",
          config: { cdn: { customDomain: "cdn.example.com" } },
          pulumiStackName: "wraps-cdn-123456789012-us-east-1",
          deployedAt: new Date().toISOString(),
        },
      },
    } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.PULUMI_BACKEND_URL;
  });

  it("preview with the S3 fallback throws unwrapped and selects no stack", async () => {
    mockStack();

    const error = await cdnDestroy({
      preview: true,
      region: "us-east-1",
    }).catch((e) => e);

    expect(error).toBeInstanceOf(WrapsError);
    expect(error.code).toBe("STATE_BACKEND_UNREACHABLE");
    expect(pulumi.automation.LocalWorkspace.selectStack).not.toHaveBeenCalled();
  });

  it("destroy with the S3 fallback throws before DNS, bucket emptying, destroy or metadata changes", async () => {
    const stack = mockStack();

    const error = await cdnDestroy({ region: "us-east-1" }).catch((e) => e);

    expect(error).toBeInstanceOf(WrapsError);
    expect(error.code).toBe("STATE_BACKEND_UNREACHABLE");
    expect(route53Sdk.Route53Client).not.toHaveBeenCalled();
    expect(s3Sdk.S3Client).not.toHaveBeenCalled();
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
      cdnDestroy({ preview: true, region: "us-east-1" })
    ).resolves.toBeUndefined();
    await expect(cdnDestroy({ region: "us-east-1" })).resolves.toBeUndefined();

    expect(stack.destroy).toHaveBeenCalled();
    expect(s3Sdk.S3Client).toHaveBeenCalled();
  });

  it("an S3 backend proceeds without WRAPS_LOCAL_ONLY", async () => {
    vi.mocked(fsUtils.ensurePulumiWorkDir).mockImplementation(async () => {
      process.env.PULUMI_BACKEND_URL = S3_URL;
      return undefined as never;
    });
    const stack = mockStack();

    await cdnDestroy({ region: "us-east-1" });

    expect(stack.destroy).toHaveBeenCalled();
  });

  it("checks the backend after the last prompt and before the first delete", async () => {
    vi.stubEnv("WRAPS_LOCAL_ONLY", "1");
    mockStack();

    await cdnDestroy({ region: "us-east-1" });

    // Two prompts: the destroy confirmation and the DNS confirmation.
    expect(vi.mocked(prompts.confirm).mock.calls.length).toBe(2);
    const lastPrompt = Math.max(
      ...vi.mocked(prompts.confirm).mock.invocationCallOrder
    );
    const guard = vi.mocked(fsUtils.ensurePulumiWorkDir).mock
      .invocationCallOrder[0];
    const firstDelete = vi.mocked(route53Sdk.Route53Client).mock
      .invocationCallOrder[0];
    expect(lastPrompt).toBeLessThan(guard);
    expect(guard).toBeLessThan(firstDelete);
  });
});
