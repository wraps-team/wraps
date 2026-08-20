import { beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../utils/shared/json-output.js";

/**
 * Mock the S3 state module.
 *
 * `metadata.ts` mirrors connection metadata into an S3 backend through this
 * module, which constructs a real S3Client. Unmocked, the SDK's credential
 * chain runs before any request — on a machine with AWS SSO configured that is
 * a live call to the SSO portal for federated credentials on every test. Slow,
 * non-deterministic, and dependent on whose laptop is running the suite.
 */
/**
 * selfhost env probes SES identities and the console IAM role. Unmocked both
 * reach AWS for real.
 */
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: vi.fn().mockImplementation(function () {
    return { send: vi.fn().mockResolvedValue({}) };
  }),
  GetEmailIdentityCommand: vi.fn(),
  ListEmailIdentitiesCommand: vi.fn(),
}));

vi.mock("@aws-sdk/client-iam", () => ({
  IAMClient: vi.fn().mockImplementation(function () {
    return { send: vi.fn().mockResolvedValue({}) };
  }),
  GetRoleCommand: vi.fn(),
  PutRolePolicyCommand: vi.fn(),
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

vi.mock("@clack/prompts");
vi.mock("../../utils/shared/aws.js");
vi.mock("../../utils/shared/metadata.js", async () => {
  const actual = await vi.importActual("../../utils/shared/metadata.js");
  return {
    ...actual,
    loadConnectionMetadata: vi.fn(),
  };
});
vi.mock("../../utils/shared/region-resolver.js");
vi.mock("../../telemetry/events.js");

import * as prompts from "@clack/prompts";
import * as aws from "../../utils/shared/aws.js";
import * as metadata from "../../utils/shared/metadata.js";
import * as regionResolver from "../../utils/shared/region-resolver.js";
import { selfhostEnv } from "../selfhost/env.js";

const MOCK_SELFHOST_METADATA = {
  version: "1.0.0",
  accountId: "115690362111",
  region: "us-east-1",
  provider: "other" as const,
  timestamp: "2026-05-19T00:00:00.000Z",
  services: {
    selfhost: {
      deployedAt: "2026-05-19T00:00:00.000Z",
      pulumiStackName: "wraps-selfhost-115690362111-us-east-1",
      apiUrl: "https://abc123.lambda-url.us-east-1.on.aws",
      config: {
        databaseUrl: "postgres://user:pass@torbox-db.example.com:5432/wraps",
        betterAuthSecret:
          "deadbeefcafe1234567890abcdef1234567890abcdef1234567890abcdef1234",
        unsubscribeSecret:
          "feedfacecafe1234567890abcdef1234567890abcdef1234567890abcdef1234",
        licenseKey: "v1.scale.2027-05-19.abc123",
        appUrl: "https://app.torbox.app",
      },
    },
  },
};

describe("selfhostEnv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setJsonMode(false);

    vi.mocked(prompts.intro).mockImplementation(() => {});
    vi.mocked(prompts.outro).mockImplementation(() => {});
    vi.mocked(prompts.log).info = vi.fn();
    vi.mocked(prompts.log).error = vi.fn();
    vi.mocked(prompts.log).warn = vi.fn();
    vi.mocked(prompts.isCancel).mockReturnValue(false);

    vi.mocked(aws.validateAWSCredentials).mockResolvedValue({
      accountId: "115690362111",
      userId: "AIDACKCEVSQ6C2EXAMPLE",
      arn: "arn:aws:iam::115690362111:user/test",
    });

    vi.mocked(regionResolver.resolveRegionForCommand).mockResolvedValue(
      "us-east-1"
    );

    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
      MOCK_SELFHOST_METADATA as any
    );
  });

  describe("env var output", () => {
    it("outputs BETTER_AUTH_SECRET from stored config", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await selfhostEnv({ region: "us-east-1" });

      const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain(
        "BETTER_AUTH_SECRET=deadbeefcafe1234567890abcdef1234567890abcdef1234567890abcdef1234"
      );
    });

    it("outputs DATABASE_URL from stored config", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await selfhostEnv({ region: "us-east-1" });

      const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain(
        "DATABASE_URL=postgres://user:pass@torbox-db.example.com:5432/wraps"
      );
    });

    it("outputs AWS_BACKEND_ACCOUNT_ID from the AWS identity", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await selfhostEnv({ region: "us-east-1" });

      const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("AWS_BACKEND_ACCOUNT_ID=115690362111");
    });

    it("outputs NEXT_PUBLIC_APP_URL and CORS_ORIGIN from appUrl", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await selfhostEnv({ region: "us-east-1" });

      const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("NEXT_PUBLIC_APP_URL=https://app.torbox.app");
      expect(output).toContain("CORS_ORIGIN=https://app.torbox.app");
    });

    it("outputs WRAPS_LICENSE_KEY from stored config", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await selfhostEnv({ region: "us-east-1" });

      const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain("WRAPS_LICENSE_KEY=v1.scale.2027-05-19.abc123");
    });
  });

  describe("json mode", () => {
    it("outputs structured JSON with all secrets", async () => {
      setJsonMode(true);
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await selfhostEnv({ region: "us-east-1", json: true });

      const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      const parsed = JSON.parse(output);
      expect(parsed.data.env.BETTER_AUTH_SECRET).toBe(
        "deadbeefcafe1234567890abcdef1234567890abcdef1234567890abcdef1234"
      );
      expect(parsed.data.env.DATABASE_URL).toBe(
        "postgres://user:pass@torbox-db.example.com:5432/wraps"
      );
      expect(parsed.data.env.AWS_BACKEND_ACCOUNT_ID).toBe("115690362111");
    });
  });

  describe("OIDC instructions", () => {
    it("outputs wildcard resource ARNs for both console roles, not selfhost account", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await selfhostEnv({ region: "us-east-1" });

      const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      // Both the self-hosted role and the platform role must be listed — an
      // already-migrated install needs the new name, and an install mid-migration
      // still has the old ARN stored in its DB.
      expect(output).toContain(
        `"arn:aws:iam::*:role/wraps-selfhost-console-access-role"`
      );
      expect(output).toContain(
        `"arn:aws:iam::*:role/wraps-console-access-role"`
      );
      // Must NOT scope either resource to the selfhost account — customers live in other accounts
      expect(output).not.toContain(
        `"arn:aws:iam::115690362111:role/wraps-console-access-role"`
      );
      expect(output).not.toContain(
        `"arn:aws:iam::115690362111:role/wraps-selfhost-console-access-role"`
      );
    });

    it("outputs trust policy with AssumeRoleWithWebIdentity and team-slug audience", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await selfhostEnv({ region: "us-east-1" });

      const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain(`"Action": "sts:AssumeRoleWithWebIdentity"`);
      // Vercel OIDC audience is https://vercel.com/<team-slug> per Vercel docs
      expect(output).toContain(`"https://vercel.com/<team-slug>"`);
      expect(output).not.toContain(`"sts.amazonaws.com"`);
    });

    it("outputs sub claim with project segment", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await selfhostEnv({ region: "us-east-1" });

      const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      // sub must include :project:<name>: — omitting it causes token mismatch
      expect(output).toContain(
        "owner:<team-slug>:project:<project-name>:environment:production"
      );
    });

    it("outputs trust policy federated principal scoped to selfhost account", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await selfhostEnv({ region: "us-east-1" });

      const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(output).toContain(
        `"Federated": "arn:aws:iam::115690362111:oidc-provider/oidc.vercel.com/<team-slug>"`
      );
    });
  });

  describe("missing deployment", () => {
    it("exits with error when no selfhost deployment exists", async () => {
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(null);
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      await selfhostEnv({ region: "us-east-1" });

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
