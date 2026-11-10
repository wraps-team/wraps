import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { trackCommand } from "../../telemetry/events.js";
import { WrapsError } from "../../utils/shared/errors.js";
import { splitPolicy } from "../../utils/shared/iam-policy-split.js";
import { setJsonMode } from "../../utils/shared/json-output.js";

vi.mock("../../telemetry/events.js", () => ({
  trackCommand: vi.fn(),
}));

import {
  buildPolicy,
  collectPolicyStatements,
  permissions,
} from "../permissions.js";

type Preset = "starter" | "production" | "enterprise" | undefined;
type Service = "email" | "sms" | "cdn" | undefined;

const PRESETS: Preset[] = [undefined, "starter", "production", "enterprise"];
const SERVICES: Service[] = [undefined, "email", "sms", "cdn"];
const CASES = PRESETS.flatMap((preset) =>
  SERVICES.map((service) => ({
    preset,
    service,
    key: `${preset ?? "-"}/${service ?? "-"}`,
  }))
);

/**
 * Each part's Sids for every preset/service case. A new or resized statement
 * changes this table, so a reshuffle of the files users attach shows in review.
 */
const EXPECTED_PART_SIDS: Record<string, string[][]> = {
  "-/-": [
    [
      "STSGetCallerIdentity",
      "IAMRoleManagement",
      "CloudWatchMetrics",
      "S3StateManagement",
      "SESManagement",
      "SESSending",
      "EventBridgeManagement",
      "EventBridgeWebhookDestinations",
      "EventBridgeConnectionSecrets",
      "EventBridgeApiDestinationsServiceRole",
      "ReplyThreadingSecret",
      "ReplyThreadingSecretDescribe",
      "SQSManagement",
      "DynamoDBManagement",
      "LambdaManagement",
      "LambdaEventSourceMapping",
      "InboundReceiptRules",
      "InboundBucket",
      "InboundBucketObjects",
      "InboundParsedRead",
    ],
    [
      "InboundReprocess",
      "SMTPUserManagement",
      "SESManagedDedicatedIps",
      "Route53DNSManagement",
      "OIDCProviderManagement",
      "SMSManagement",
      "S3BucketManagement",
      "CloudFrontManagement",
      "ACMCertificateManagement",
    ],
  ],
  "-/email": [
    [
      "STSGetCallerIdentity",
      "IAMRoleManagement",
      "CloudWatchMetrics",
      "S3StateManagement",
      "SESManagement",
      "SESSending",
      "EventBridgeManagement",
      "EventBridgeWebhookDestinations",
      "EventBridgeConnectionSecrets",
      "EventBridgeApiDestinationsServiceRole",
      "ReplyThreadingSecret",
      "ReplyThreadingSecretDescribe",
      "SQSManagement",
      "DynamoDBManagement",
      "LambdaManagement",
      "LambdaEventSourceMapping",
      "InboundReceiptRules",
      "InboundBucket",
      "InboundBucketObjects",
      "InboundParsedRead",
    ],
    [
      "InboundReprocess",
      "SMTPUserManagement",
      "SESManagedDedicatedIps",
      "Route53DNSManagement",
      "OIDCProviderManagement",
    ],
  ],
  "-/sms": [
    [
      "STSGetCallerIdentity",
      "IAMRoleManagement",
      "CloudWatchMetrics",
      "S3StateManagement",
      "SMSManagement",
      "DynamoDBManagement",
      "LambdaManagement",
      "LambdaEventSourceMapping",
    ],
  ],
  "-/cdn": [
    [
      "STSGetCallerIdentity",
      "IAMRoleManagement",
      "CloudWatchMetrics",
      "S3StateManagement",
      "S3BucketManagement",
      "CloudFrontManagement",
      "ACMCertificateManagement",
      "Route53DNSManagement",
    ],
  ],
  "starter/-": [
    [
      "STSGetCallerIdentity",
      "IAMRoleManagement",
      "CloudWatchMetrics",
      "S3StateManagement",
      "SESManagement",
      "SESSending",
      "Route53DNSManagement",
      "OIDCProviderManagement",
      "SMSManagement",
      "DynamoDBManagement",
      "LambdaManagement",
      "LambdaEventSourceMapping",
      "S3BucketManagement",
      "CloudFrontManagement",
      "ACMCertificateManagement",
    ],
  ],
  "starter/email": [
    [
      "STSGetCallerIdentity",
      "IAMRoleManagement",
      "CloudWatchMetrics",
      "S3StateManagement",
      "SESManagement",
      "SESSending",
      "Route53DNSManagement",
      "OIDCProviderManagement",
    ],
  ],
  "starter/sms": [
    [
      "STSGetCallerIdentity",
      "IAMRoleManagement",
      "CloudWatchMetrics",
      "S3StateManagement",
      "SMSManagement",
      "DynamoDBManagement",
      "LambdaManagement",
      "LambdaEventSourceMapping",
    ],
  ],
  "starter/cdn": [
    [
      "STSGetCallerIdentity",
      "IAMRoleManagement",
      "CloudWatchMetrics",
      "S3StateManagement",
      "S3BucketManagement",
      "CloudFrontManagement",
      "ACMCertificateManagement",
      "Route53DNSManagement",
    ],
  ],
  "production/-": [
    [
      "STSGetCallerIdentity",
      "IAMRoleManagement",
      "CloudWatchMetrics",
      "S3StateManagement",
      "SESManagement",
      "SESSending",
      "EventBridgeManagement",
      "EventBridgeWebhookDestinations",
      "EventBridgeConnectionSecrets",
      "EventBridgeApiDestinationsServiceRole",
      "ReplyThreadingSecret",
      "ReplyThreadingSecretDescribe",
      "SQSManagement",
      "DynamoDBManagement",
      "LambdaManagement",
      "LambdaEventSourceMapping",
      "InboundReceiptRules",
      "InboundBucket",
      "InboundBucketObjects",
      "InboundParsedRead",
    ],
    [
      "InboundReprocess",
      "Route53DNSManagement",
      "OIDCProviderManagement",
      "SMSManagement",
      "S3BucketManagement",
      "CloudFrontManagement",
      "ACMCertificateManagement",
    ],
  ],
  "production/email": [
    [
      "STSGetCallerIdentity",
      "IAMRoleManagement",
      "CloudWatchMetrics",
      "S3StateManagement",
      "SESManagement",
      "SESSending",
      "EventBridgeManagement",
      "EventBridgeWebhookDestinations",
      "EventBridgeConnectionSecrets",
      "EventBridgeApiDestinationsServiceRole",
      "ReplyThreadingSecret",
      "ReplyThreadingSecretDescribe",
      "SQSManagement",
      "DynamoDBManagement",
      "LambdaManagement",
      "LambdaEventSourceMapping",
      "InboundReceiptRules",
      "InboundBucket",
      "InboundBucketObjects",
      "InboundParsedRead",
    ],
    ["InboundReprocess", "Route53DNSManagement", "OIDCProviderManagement"],
  ],
  "production/sms": [
    [
      "STSGetCallerIdentity",
      "IAMRoleManagement",
      "CloudWatchMetrics",
      "S3StateManagement",
      "SMSManagement",
      "DynamoDBManagement",
      "LambdaManagement",
      "LambdaEventSourceMapping",
    ],
  ],
  "production/cdn": [
    [
      "STSGetCallerIdentity",
      "IAMRoleManagement",
      "CloudWatchMetrics",
      "S3StateManagement",
      "S3BucketManagement",
      "CloudFrontManagement",
      "ACMCertificateManagement",
      "Route53DNSManagement",
    ],
  ],
  "enterprise/-": [
    [
      "STSGetCallerIdentity",
      "IAMRoleManagement",
      "CloudWatchMetrics",
      "S3StateManagement",
      "SESManagement",
      "SESSending",
      "EventBridgeManagement",
      "EventBridgeWebhookDestinations",
      "EventBridgeConnectionSecrets",
      "EventBridgeApiDestinationsServiceRole",
      "ReplyThreadingSecret",
      "ReplyThreadingSecretDescribe",
      "SQSManagement",
      "DynamoDBManagement",
      "LambdaManagement",
      "LambdaEventSourceMapping",
      "InboundReceiptRules",
      "InboundBucket",
      "InboundBucketObjects",
      "InboundParsedRead",
    ],
    [
      "InboundReprocess",
      "SMTPUserManagement",
      "SESManagedDedicatedIps",
      "Route53DNSManagement",
      "OIDCProviderManagement",
      "SMSManagement",
      "S3BucketManagement",
      "CloudFrontManagement",
      "ACMCertificateManagement",
    ],
  ],
  "enterprise/email": [
    [
      "STSGetCallerIdentity",
      "IAMRoleManagement",
      "CloudWatchMetrics",
      "S3StateManagement",
      "SESManagement",
      "SESSending",
      "EventBridgeManagement",
      "EventBridgeWebhookDestinations",
      "EventBridgeConnectionSecrets",
      "EventBridgeApiDestinationsServiceRole",
      "ReplyThreadingSecret",
      "ReplyThreadingSecretDescribe",
      "SQSManagement",
      "DynamoDBManagement",
      "LambdaManagement",
      "LambdaEventSourceMapping",
      "InboundReceiptRules",
      "InboundBucket",
      "InboundBucketObjects",
      "InboundParsedRead",
    ],
    [
      "InboundReprocess",
      "SMTPUserManagement",
      "SESManagedDedicatedIps",
      "Route53DNSManagement",
      "OIDCProviderManagement",
    ],
  ],
  "enterprise/sms": [
    [
      "STSGetCallerIdentity",
      "IAMRoleManagement",
      "CloudWatchMetrics",
      "S3StateManagement",
      "SMSManagement",
      "DynamoDBManagement",
      "LambdaManagement",
      "LambdaEventSourceMapping",
    ],
  ],
  "enterprise/cdn": [
    [
      "STSGetCallerIdentity",
      "IAMRoleManagement",
      "CloudWatchMetrics",
      "S3StateManagement",
      "S3BucketManagement",
      "CloudFrontManagement",
      "ACMCertificateManagement",
      "Route53DNSManagement",
    ],
  ],
};

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "wraps-permissions-policy-dir-"));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

afterEach(() => {
  setJsonMode(false);
  vi.restoreAllMocks();
  vi.mocked(trackCommand).mockClear();
});

/** IAM's count: the JSON text with every whitespace character removed. */
function iamSize(file: string): number {
  return JSON.stringify(JSON.parse(readFileSync(file, "utf8"))).replace(
    /\s/g,
    ""
  ).length;
}

function policyFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => /^wraps-deployer-\d+\.json$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
    .map((name) => join(dir, name));
}

async function runJson(
  options: Parameters<typeof permissions>[0]
): Promise<Record<string, unknown>> {
  setJsonMode(true);
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  await permissions({ json: true, ...options });
  const lines = log.mock.calls.map((c) => c[0]);
  log.mockRestore();
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0] as string);
}

async function runHuman(
  options: Parameters<typeof permissions>[0]
): Promise<string> {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  await permissions(options);
  const text = [
    ...log.mock.calls.map((c) => String(c[0])),
    ...out.mock.calls.map((c) => String(c[0])),
  ].join("\n");
  log.mockRestore();
  out.mockRestore();
  return text;
}

describe("permissions --policy-dir: the 16 preset/service cases", () => {
  it.each(CASES)(
    "$key: every file fits one managed policy, at most 3 files, Sids as pinned",
    async ({ preset, service, key }) => {
      const dir = tempDir();
      setJsonMode(true);
      vi.spyOn(console, "log").mockImplementation(() => undefined);
      await permissions({ json: true, preset, service, policyDir: dir });

      const files = policyFiles(dir);
      expect(files.length).toBeGreaterThan(0);
      expect(files.length).toBeLessThanOrEqual(3);
      for (const file of files) {
        expect(iamSize(file)).toBeLessThanOrEqual(6144);
      }

      const docs = files.map((f) => JSON.parse(readFileSync(f, "utf8")));
      for (const doc of docs) {
        // A bare IAM policy, no `{"success","command","data"}` envelope.
        expect(Object.keys(doc)).toEqual(["Version", "Statement"]);
        expect(doc.Version).toBe("2012-10-17");
      }
      expect(
        docs.map((d) => d.Statement.map((s: { Sid: string }) => s.Sid))
      ).toEqual(EXPECTED_PART_SIDS[key]);

      // The files together are the merged policy, in order, nothing repeated.
      const all = docs.flatMap((d) => d.Statement);
      expect(all).toEqual(buildPolicy(service, preset).Statement);
      expect(new Set(all.map((s: { Sid: string }) => s.Sid)).size).toBe(
        all.length
      );
    }
  );

  it.each(CASES)(
    "$key: no string in the policy contains whitespace, so removing all of it matches IAM's count",
    ({ preset, service }) => {
      const strings: string[] = [];
      JSON.stringify(buildPolicy(service, preset), (_k, v) => {
        if (typeof v === "string") {
          strings.push(v);
        }
        return v;
      });
      expect(strings.length).toBeGreaterThan(0);
      expect(strings.filter((s) => /\s/.test(s))).toEqual([]);
    }
  );

  it.each(CASES)(
    "$key: every statement the Sid dedupe drops is identical to the one it keeps",
    ({ preset, service }) => {
      const kept = new Map<string, unknown>();
      for (const stmt of buildPolicy(service, preset).Statement) {
        kept.set(stmt.Sid, stmt);
      }
      for (const stmt of collectPolicyStatements(service, preset)) {
        expect(stmt).toEqual(kept.get(stmt.Sid));
      }
    }
  );

  it("the dedupe really has duplicates to check (email and SMS share DynamoDB and Lambda)", () => {
    const sids = collectPolicyStatements(undefined, undefined).map(
      (s) => s.Sid
    );
    expect(sids.filter((s) => s === "DynamoDBManagement")).toHaveLength(2);
    expect(sids.filter((s) => s === "LambdaManagement")).toHaveLength(2);
    expect(sids.filter((s) => s === "Route53DNSManagement")).toHaveLength(2);
  });
});

describe("permissions --policy-dir: writing", () => {
  it("two runs into the same folder produce byte-identical files", async () => {
    const a = tempDir();
    const b = tempDir();
    await runJson({ policyDir: a });
    await runJson({ policyDir: a });
    await runJson({ policyDir: b });
    const filesA = policyFiles(a);
    expect(filesA.map((f) => f.slice(a.length))).toEqual(
      policyFiles(b).map((f) => f.slice(b.length))
    );
    for (const file of filesA) {
      const twin = join(b, file.slice(a.length));
      expect(readFileSync(file, "utf8")).toBe(readFileSync(twin, "utf8"));
      expect(readFileSync(file, "utf8").endsWith("}\n")).toBe(true);
    }
  });

  it("an empty --policy-dir is rejected with INVALID_FLAG_USAGE and writes nothing", async () => {
    for (const policyDir of ["", "   "]) {
      let thrown: unknown;
      try {
        await permissions({ policyDir });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(WrapsError);
      expect((thrown as WrapsError).code).toBe("INVALID_FLAG_USAGE");
      expect((thrown as WrapsError).message).toBe(
        "--policy-dir needs a directory"
      );
      expect((thrown as WrapsError).suggestion).toBe(
        "Pass the folder to write the policies to: wraps permissions --policy-dir ./wraps-policy"
      );
    }
    expect(trackCommand).not.toHaveBeenCalled();
  });

  it("reports policy_dir and policy_count to telemetry, never the path", async () => {
    const dir = tempDir();
    await runJson({ policyDir: dir });
    expect(trackCommand).toHaveBeenCalledTimes(1);
    const [name, meta] = vi.mocked(trackCommand).mock.calls[0] ?? [];
    expect(name).toBe("permissions");
    expect(meta).toMatchObject({ policy_dir: true, policy_count: 2 });
    expect(JSON.stringify(meta)).not.toContain(dir);

    vi.mocked(trackCommand).mockClear();
    await runJson({});
    expect(vi.mocked(trackCommand).mock.calls[0]?.[1]).toMatchObject({
      policy_dir: false,
      policy_count: 2,
    });
  });
});

describe("permissions --json", () => {
  it("keeps data.policy as the merged policy and adds data.policies (the split)", async () => {
    const out = await runJson({ service: "email", preset: "production" });
    const data = out.data as Record<string, unknown>;
    const policy = buildPolicy("email", "production");
    expect(out.success).toBe(true);
    expect(data.policy).toEqual(policy);
    expect(data.policies).toEqual(splitPolicy(policy));
    expect((data.policies as { name: string }[]).map((p) => p.name)).toEqual([
      "wraps-deployer-1",
      "wraps-deployer-2",
    ]);
    expect(Object.keys(data).sort()).toEqual(["policies", "policy"]);
  });

  it("with --policy-dir adds the absolute written and removed paths", async () => {
    const dir = tempDir();
    // A stale third file from a run when the policy needed three.
    await runJson({ policyDir: dir });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(dir, "wraps-deployer-3.json"), "{}\n");

    const out = await runJson({ policyDir: dir });
    const data = out.data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual([
      "policies",
      "policy",
      "removed",
      "written",
    ]);
    expect(data.written).toEqual([
      join(dir, "wraps-deployer-1.json"),
      join(dir, "wraps-deployer-2.json"),
    ]);
    expect(data.removed).toEqual([join(dir, "wraps-deployer-3.json")]);
    for (const path of [
      ...(data.written as string[]),
      ...(data.removed as string[]),
    ]) {
      expect(isAbsolute(path)).toBe(true);
    }
    expect(existsSync(join(dir, "wraps-deployer-3.json"))).toBe(false);
  });
});

describe("permissions: human output", () => {
  it("--policy-dir lists the files and the attach and update steps", async () => {
    const dir = tempDir();
    const text = await runHuman({ policyDir: dir });
    expect(text).toContain(`Wrote 2 IAM policies to ${dir}:`);
    expect(text).toContain(join(dir, "wraps-deployer-1.json"));
    expect(text).toContain(join(dir, "wraps-deployer-2.json"));
    expect(text).toContain(
      "2. Attach every wraps-deployer-<n> policy to the IAM user or role that runs wraps"
    );
    expect(text).toContain(
      "A user takes 10 managed policies by default (a role 20, a group 10), including ones already attached"
    );
    expect(text).toContain(
      "- If you attached a single WrapsDeploymentPolicy before, detach it once these are attached."
    );
    // The summary is skipped.
    expect(text).not.toContain("Required AWS Services");
  });

  it("the default Quick Setup points at --policy-dir, not at --json > file", async () => {
    const text = await runHuman({ service: "email", preset: "enterprise" });
    expect(text).toContain(
      "wraps permissions --service email --preset enterprise --policy-dir ./wraps-policy"
    );
    expect(text).not.toContain("--json > wraps-policy.json");
    expect(text).toContain(
      "Run with --policy-dir <dir> to write the IAM policy files to attach"
    );
  });
});

describe("wraps permissions --policy-dir with no value (the real CLI)", () => {
  const PKG_ROOT = join(import.meta.dirname, "../../..");

  function run(args: string[]) {
    const tsx = [
      join(PKG_ROOT, "node_modules/.bin/tsx"),
      join(PKG_ROOT, "../../node_modules/.bin/tsx"),
    ].find((c) => existsSync(c));
    if (!tsx) {
      throw new Error("tsx not found; cannot drive the CLI");
    }
    const cwd = tempDir();
    const result = spawnSync(tsx, [join(PKG_ROOT, "src/cli.ts"), ...args], {
      cwd,
      encoding: "utf-8",
      timeout: 60_000,
      env: {
        ...process.env,
        HOME: cwd,
        WRAPS_TELEMETRY_DISABLED: "1",
        NO_COLOR: "1",
      },
    });
    return { ...result, cwd };
  }

  it.each([
    [["permissions", "--policy-dir", "--json"]],
    [["permissions", "--json", "--policy-dir"]],
    [["permissions", "--json", "--policy-dir="]],
  ])(
    "%j fails with INVALID_FLAG_USAGE and writes nothing",
    (args) => {
      const result = run(args);
      expect(result.status).not.toBe(0);
      const envelope = JSON.parse(
        result.stdout.trim().split("\n").at(-1) as string
      );
      expect(envelope.success).toBe(false);
      expect(envelope.error.code).toBe("INVALID_FLAG_USAGE");
      expect(envelope.error.message).toBe("--policy-dir needs a directory");
      expect(
        readdirSync(result.cwd).filter((n) => n.startsWith("wraps-deployer"))
      ).toEqual([]);
    },
    60_000
  );
});
