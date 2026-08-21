import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `wraps doctor` runs the email leg for every user whose credentials work,
 * including users with no Wraps deployment at all. The Pulumi/S3 stack probe
 * inside `collectEmailFindings` is expensive — it resolves credentials into
 * env vars, HEADs (and on a miss CREATES) the `wraps-state-*` bucket, then
 * spawns the Pulumi binary against the S3 backend — and its only product is
 * the `hasStack` boolean. When the scan found zero wraps-* resources and
 * `--cleanup` was not passed, nothing downstream can read that boolean, so a
 * read-only diagnostic must not pay the cost or create the bucket.
 */

vi.mock("@pulumi/pulumi", () => ({
  automation: {
    LocalWorkspace: {
      selectStack: vi.fn().mockRejectedValue(new Error("no stack named")),
    },
  },
}));
vi.mock("../../utils/shared/scanner.js", () => ({
  scanAWSResources: vi.fn(),
  filterWrapsResources: vi.fn(),
}));
vi.mock("../../utils/shared/fs.js", () => ({
  ensurePulumiWorkDir: vi.fn(),
  getPulumiWorkDir: vi.fn().mockReturnValue("/tmp/pulumi"),
}));
vi.mock("../../utils/email/event-pipeline-check.js", () => ({
  checkEventPipeline: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../utils/shared/metadata.js", () => ({
  findConnectionsWithService: vi.fn().mockResolvedValue([]),
  getAllTrackedDomains: vi.fn().mockReturnValue([]),
}));

import * as pulumi from "@pulumi/pulumi";
import { ensurePulumiWorkDir } from "../../utils/shared/fs.js";
import {
  type AWSResourceScan,
  filterWrapsResources,
  scanAWSResources,
} from "../../utils/shared/scanner.js";
import { collectEmailFindings } from "../email/doctor.js";

const mockScan = scanAWSResources as ReturnType<typeof vi.fn>;
const mockFilter = filterWrapsResources as ReturnType<typeof vi.fn>;
const mockEnsureWorkDir = ensurePulumiWorkDir as ReturnType<typeof vi.fn>;
const mockSelectStack = pulumi.automation.LocalWorkspace
  .selectStack as ReturnType<typeof vi.fn>;

const emptyScan: AWSResourceScan = {
  identities: [],
  configurationSets: [],
  snsTopics: [],
  dynamoTables: [],
  lambdaFunctions: [],
  iamRoles: [],
};

function scanWith(overrides: Partial<AWSResourceScan>): AWSResourceScan {
  return { ...emptyScan, ...overrides };
}

describe("collectEmailFindings stack probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectStack.mockRejectedValue(new Error("no stack named"));
  });

  it("does not touch Pulumi or the S3 state bucket when the scan found no wraps-* resources", async () => {
    mockScan.mockResolvedValue(emptyScan);
    mockFilter.mockReturnValue(emptyScan);

    const result = await collectEmailFindings({
      region: "us-east-1",
      accountId: "123456789012",
      connections: [],
    });

    expect(result.totalResources).toBe(0);
    expect(result.findings).toEqual([]);
    expect(mockEnsureWorkDir).not.toHaveBeenCalled();
    expect(mockSelectStack).not.toHaveBeenCalled();
  });

  it("still probes when the scan found wraps-* resources, so orphans are labelled", async () => {
    const scan = scanWith({
      configurationSets: [{ name: "wraps-email-cs", eventDestinations: [] }],
    });
    mockScan.mockResolvedValue(scan);
    mockFilter.mockReturnValue(scan);

    const result = await collectEmailFindings({
      region: "us-east-1",
      accountId: "123456789012",
      connections: [],
    });

    expect(mockEnsureWorkDir).toHaveBeenCalled();
    expect(mockSelectStack).toHaveBeenCalled();
    expect(result.hasStack).toBe(false);
    expect(result.findings[0].details).toContain("orphan");
  });

  it("still probes on an empty account when the caller needs hasStack for --cleanup", async () => {
    mockScan.mockResolvedValue(emptyScan);
    mockFilter.mockReturnValue(emptyScan);
    mockSelectStack.mockResolvedValue({});

    const result = await collectEmailFindings({
      region: "us-east-1",
      accountId: "123456789012",
      connections: [],
      probeStack: true,
    });

    expect(mockEnsureWorkDir).toHaveBeenCalled();
    expect(mockSelectStack).toHaveBeenCalled();
    expect(result.hasStack).toBe(true);
  });
});
