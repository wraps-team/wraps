import { beforeEach, describe, expect, it, vi } from "vitest";
import { emailDestroy } from "../commands/email/destroy.js";
import { init } from "../commands/email/init.js";

/**
 * Test: destroy → init leaves user stuck in inconsistent state
 *
 * Bug: When `wraps email destroy` partially fails, it deletes local metadata
 * but leaves the S3 copy intact. When the user then runs `wraps email init`,
 * loadConnectionMetadata() re-downloads the S3 copy and init refuses to proceed,
 * saying "Connection already exists" and telling the user to run `status` or `upgrade`.
 *
 * The user is stuck: destroy says it (partially) removed things, but init
 * won't let them redeploy.
 *
 * Root cause: deleteConnectionMetadata() only deletes the local file at
 * ~/.wraps/connections/{accountId}-{region}.json but does NOT delete the
 * metadata from S3 (wraps-state-* bucket). loadConnectionMetadata() has
 * S3 fallback that re-downloads and re-saves the metadata locally.
 *
 * WHY THE TWO COMMANDS ARE IMPORTED STATICALLY. Both used to be pulled in with
 * `await import(...)` inside the first test. The modules are cached, so only
 * that test paid — but it paid for both command graphs at once, ~1s of it, all
 * billed against a per-test timeout. That is why this test carried a
 * `{ timeout: 15_000 }` bump whose comment blamed "parallel suite load": the
 * load was real, but it was module loading, not the assertions, and raising the
 * ceiling hid it instead of removing it.
 *
 * Importing statically moves that cost into the file's import phase, which no
 * test timeout governs. The first test went from ~1017ms to ~13ms, so the bump
 * is gone. It needs `vi.hoisted()` for the mock functions, because `vi.mock`
 * factories are hoisted above imports and would otherwise close over consts
 * that have not been initialized yet. Reverting either half brings back both
 * the slow test and the need for the bump.
 */

// ---- Mocks ----

// Mock clack prompts
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
 * The destroy -> init round trip touches IAM, Lambda, SNS and DynamoDB. Each was
 * constructing a real client and talking to AWS from a unit test.
 */
/**
 * SES v1, which is a different client from the sesv2 mock above — the preflight
 * scanner uses it, and the endpoint tells them apart: v1 posts to
 * email.<region>.amazonaws.com/ while v2 uses /v2/email/*.
 */
vi.mock("@aws-sdk/client-ses", () => ({
  SESClient: vi.fn().mockImplementation(function () {
    return { send: vi.fn().mockResolvedValue({}) };
  }),
  ListIdentitiesCommand: vi.fn(),
  ListConfigurationSetsCommand: vi.fn(),
  ListReceiptRuleSetsCommand: vi.fn(),
}));

vi.mock("@aws-sdk/client-iam", () => ({
  IAMClient: vi.fn().mockImplementation(function () {
    return { send: vi.fn().mockResolvedValue({}) };
  }),
  GetRoleCommand: vi.fn(),
  PutRolePolicyCommand: vi.fn(),
}));

vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: vi.fn().mockImplementation(function () {
    return { send: vi.fn().mockResolvedValue({}) };
  }),
  ListFunctionsCommand: vi.fn(),
  GetFunctionCommand: vi.fn(),
}));

vi.mock("@aws-sdk/client-sns", () => ({
  SNSClient: vi.fn().mockImplementation(function () {
    return { send: vi.fn().mockResolvedValue({}) };
  }),
  ListTopicsCommand: vi.fn(),
  DeleteTopicCommand: vi.fn(),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn().mockImplementation(function () {
    return { send: vi.fn().mockResolvedValue({}) };
  }),
  DescribeTableCommand: vi.fn(),
  DeleteTableCommand: vi.fn(),
}));

vi.mock("../utils/shared/s3-state.js", () => ({
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

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  confirm: vi.fn().mockResolvedValue(true),
  select: vi.fn(),
  text: vi.fn().mockResolvedValue("test@example.com"),
  note: vi.fn(),
  isCancel: vi.fn().mockReturnValue(false),
  cancel: vi.fn(),
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    step: vi.fn(),
  },
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

// Mock picocolors
vi.mock("picocolors", () => ({
  default: {
    bold: (s: string) => s,
    red: (s: string) => s,
    green: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
    yellow: (s: string) => s,
    blue: (s: string) => s,
    white: (s: string) => s,
  },
}));

// Mock telemetry
vi.mock("../telemetry/events.js", () => ({
  trackError: vi.fn(),
  trackCommand: vi.fn(),
  trackServiceRemoved: vi.fn(),
  trackServiceDeployed: vi.fn(),
  trackServiceInit: vi.fn(),
}));

// Mock AWS credential validation
vi.mock("../utils/shared/aws.js", () => ({
  validateAWSCredentials: vi.fn().mockResolvedValue({
    accountId: "123456789012",
    userId: "AIDAEXAMPLE",
    arn: "arn:aws:iam::123456789012:user/test",
  }),
  validateAWSCredentialsWithDetails: vi.fn().mockResolvedValue({
    identity: {
      accountId: "123456789012",
      userId: "AIDAEXAMPLE",
      arn: "arn:aws:iam::123456789012:user/test",
    },
    warnings: [],
    credentialSource: "environment",
  }),
  getAWSRegion: vi.fn().mockResolvedValue("us-east-1"),
  getSESAccountStatus: vi.fn().mockResolvedValue({ isSandbox: false }),
}));

// Mock Route53
vi.mock("../utils/route53.js", () => ({
  findHostedZone: vi.fn().mockResolvedValue(null),
  deleteDNSRecords: vi.fn().mockResolvedValue(undefined),
}));

// Mock filesystem utilities
vi.mock("../utils/shared/fs.js", () => ({
  ensurePulumiWorkDir: vi.fn().mockResolvedValue(undefined),
  getPulumiWorkDir: vi.fn().mockReturnValue("/tmp/wraps-test/pulumi"),
  clearLocalStackLocks: vi.fn().mockResolvedValue(0),
}));

// Mock SES v2 client
vi.mock("@aws-sdk/client-sesv2", () => {
  const mockSend = vi.fn().mockResolvedValue({
    DkimAttributes: { Tokens: [] },
    MailFromAttributes: {},
  });
  return {
    SESv2Client: class {
      send = mockSend;
    },
    GetEmailIdentityCommand: class {},
    SendEmailCommand: class {},
  };
});

// Mock the timeout wrapper
// See email-destroy.test.ts: a failing destroy runs a best-effort SQS cleanup
// that dynamically imports this client. Unmocked it is real network I/O on the
// swallowed-error path, which is invisible until the suite runs under load.
vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockRejectedValue(new Error("QueueDoesNotExist")),
  })),
  GetQueueUrlCommand: vi.fn(),
  DeleteQueueCommand: vi.fn(),
}));

vi.mock("../utils/shared/timeout.js", () => ({
  DEFAULT_PULUMI_TIMEOUT_MS: 600_000,
  withTimeout: vi.fn(async (promise: Promise<any>) => promise),
}));

// Mock the pulumi utility - pass through withLockRetry so lock retry logic works
vi.mock("../utils/shared/pulumi.js", async () => {
  const actual = (await vi.importActual("../utils/shared/pulumi.js")) as any;
  return {
    previewWithResourceChanges: vi.fn(),
    ensurePulumiInstalled: vi.fn().mockResolvedValue(false),
    withLockRetry: actual.withLockRetry,
  };
});

// Mock errors module
vi.mock("../utils/shared/errors.js", async () => {
  const actual = (await vi.importActual("../utils/shared/errors.js")) as any;
  return { ...actual };
});

// Mock the output module
vi.mock("../utils/shared/output.js", async () => {
  const actual = (await vi.importActual("../utils/shared/output.js")) as any;
  return { ...actual };
});

// Mock the email test command (called by init post-deploy; not relevant to this test)
vi.mock("../commands/email/test.js", () => ({
  emailTest: vi.fn().mockResolvedValue(undefined),
}));

// --- Metadata mock with S3 simulation ---
//
// We simulate the S3-backed metadata behavior:
// - saveConnectionMetadata writes to both local and "S3"
// - deleteConnectionMetadata only deletes local
// - loadConnectionMetadata falls back to S3 when local is missing

let localMetadataStore: Record<string, any> = {};
let s3MetadataStore: Record<string, any> = {};

/**
 * Declared inside `vi.hoisted` so the `vi.mock` factories below can close over
 * them while still allowing the two commands under test to be imported
 * statically at the top of this file. See the header for why that matters.
 *
 * The closures here read `localMetadataStore` / `s3MetadataStore`, which stay
 * module-scoped `let`s so `beforeEach` can reassign them. That is safe: this
 * factory only *creates* the closures, and nothing calls one until a test runs,
 * by which point the module body has initialized both stores.
 */
const {
  mockLoadConnectionMetadata,
  mockSaveConnectionMetadata,
  mockDeleteConnectionMetadata,
  mockCreateConnectionMetadata,
  mockStackDestroy,
  mockStackRefresh,
  mockStackRemove,
  mockStackUp,
  mockSetConfig,
  mockSelectStack,
} = vi.hoisted(() => {
  const mockLoadConnectionMetadata = vi.fn(
    async (accountId: string, region: string) => {
      const key = `${accountId}-${region}`;
      // First check local
      if (localMetadataStore[key]) {
        return localMetadataStore[key];
      }
      // Fall back to S3 (simulating the real loadConnectionMetadata behavior)
      if (s3MetadataStore[key]) {
        // Re-save locally (as the real code does at line 235-236 of metadata.ts)
        localMetadataStore[key] = s3MetadataStore[key];
        return s3MetadataStore[key];
      }
      return null;
    }
  );

  const mockSaveConnectionMetadata = vi.fn(async (metadata: any) => {
    const key = `${metadata.accountId}-${metadata.region}`;
    localMetadataStore[key] = metadata;
    // Simulate S3 write-through (as the real code does)
    s3MetadataStore[key] = metadata;
  });

  const mockDeleteConnectionMetadata = vi.fn(
    async (accountId: string, region: string) => {
      const key = `${accountId}-${region}`;
      // FIX: Deletes both local and S3 (matches fixed implementation)
      delete localMetadataStore[key];
      delete s3MetadataStore[key];
    }
  );

  const mockCreateConnectionMetadata = vi.fn(
    (
      accountId: string,
      region: string,
      provider: string,
      emailConfig: any,
      preset?: string
    ) => ({
      version: "1.0.0",
      accountId,
      region,
      provider,
      timestamp: new Date().toISOString(),
      services: {
        email: {
          preset,
          config: emailConfig,
          deployedAt: new Date().toISOString(),
        },
      },
    })
  );

  const mockStackDestroy = vi.fn();
  const mockStackRefresh = vi.fn().mockResolvedValue(undefined);
  const mockStackRemove = vi.fn();
  const mockStackUp = vi.fn().mockResolvedValue({
    outputs: {
      roleArn: { value: "arn:aws:iam::123456789012:role/wraps-email-role" },
      configSetName: { value: "wraps-email-config" },
      region: { value: "us-east-1" },
      domain: { value: "example.com" },
      dkimTokens: { value: [] },
    },
  });
  const mockSetConfig = vi.fn().mockResolvedValue(undefined);
  const mockSelectStack = vi.fn().mockResolvedValue(undefined);

  return {
    mockLoadConnectionMetadata,
    mockSaveConnectionMetadata,
    mockDeleteConnectionMetadata,
    mockCreateConnectionMetadata,
    mockStackDestroy,
    mockStackRefresh,
    mockStackRemove,
    mockStackUp,
    mockSetConfig,
    mockSelectStack,
  };
});

vi.mock("../utils/shared/metadata.js", () => ({
  loadConnectionMetadata: mockLoadConnectionMetadata,
  saveConnectionMetadata: mockSaveConnectionMetadata,
  deleteConnectionMetadata: mockDeleteConnectionMetadata,
  createConnectionMetadata: mockCreateConnectionMetadata,
  findConnectionsWithService: vi.fn().mockResolvedValue([]),
}));

// Mock IAM check
vi.mock("../utils/shared/iam-check.js", () => ({
  checkIAMPermissions: vi.fn().mockResolvedValue({
    success: true,
    skipped: false,
    deniedActions: [],
  }),
  formatDeniedActions: vi.fn().mockReturnValue(""),
  getRequiredActions: vi.fn().mockReturnValue([]),
}));

// Mock presets
vi.mock("../utils/email/presets.js", () => ({
  getPreset: vi.fn().mockReturnValue({
    sendingEnabled: true,
    tracking: { enabled: true },
  }),
  validateConfig: vi.fn().mockReturnValue([]),
}));

// Mock costs
vi.mock("../utils/email/costs.js", () => ({
  getCostSummary: vi.fn().mockReturnValue("$0.05/mo"),
}));

// Mock prompts
vi.mock("../utils/shared/prompts.js", () => ({
  isInteractive: vi.fn().mockReturnValue(true),
  ensureInteractive: vi.fn(),
  promptProvider: vi.fn().mockResolvedValue("other"),
  promptRegion: vi.fn().mockResolvedValue("us-east-1"),
  promptDomain: vi.fn().mockResolvedValue("example.com"),
  promptVercelConfig: vi.fn().mockResolvedValue(undefined),
  promptConfigPreset: vi.fn().mockResolvedValue("starter"),
  promptCustomConfig: vi.fn(),
  promptEstimatedVolume: vi.fn().mockResolvedValue(1000),
  promptEmailArchiving: vi.fn().mockResolvedValue({ enabled: false }),
  confirmDeploy: vi.fn().mockResolvedValue(true),
  promptContinueManualDNS: vi.fn().mockResolvedValue(true),
  promptDNSProvider: vi.fn().mockResolvedValue("manual"),
  promptDNSConfirmation: vi.fn().mockResolvedValue({
    shouldCreate: false,
    selectedCategories: new Set(),
  }),
}));

// Mock Pulumi

vi.mock("@pulumi/pulumi", () => ({
  automation: {
    LocalWorkspace: {
      selectStack: vi.fn().mockResolvedValue({
        destroy: mockStackDestroy,
        refresh: mockStackRefresh,
        workspace: {
          removeStack: mockStackRemove,
        },
      }),
      createOrSelectStack: vi.fn().mockResolvedValue({
        up: mockStackUp,
        setConfig: mockSetConfig,
        workspace: {
          selectStack: mockSelectStack,
        },
      }),
    },
  },
}));

// Mock the email stack deployment
vi.mock("../../infrastructure/email-stack.js", () => ({
  deployEmailStack: vi.fn().mockResolvedValue({
    roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
    configSetName: "wraps-email-config",
    region: "us-east-1",
    domain: "example.com",
    dkimTokens: [],
  }),
}));

// Track process.exit calls
const mockProcessExit = vi.spyOn(process, "exit").mockImplementation((() => {
  throw new Error("process.exit called");
}) as any);

describe("destroy → init inconsistent state bug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localMetadataStore = {};
    s3MetadataStore = {};
    mockStackDestroy.mockReset();
    mockStackRefresh.mockReset().mockResolvedValue(undefined);
    mockStackRemove.mockReset();
    mockStackUp.mockReset().mockResolvedValue({
      outputs: {
        roleArn: { value: "arn:aws:iam::123456789012:role/wraps-email-role" },
        configSetName: { value: "wraps-email-config" },
        region: { value: "us-east-1" },
        domain: { value: "example.com" },
        dkimTokens: { value: [] },
      },
    });
    mockProcessExit.mockClear();
  });

  it("should allow init after destroy partial failure (destroy clears both local and S3 metadata)", async () => {
    // Step 1: Simulate existing deployment by seeding metadata in both stores
    // (as saveConnectionMetadata would have done during the initial init)
    const existingMetadata = {
      version: "1.0.0",
      accountId: "123456789012",
      region: "us-east-1",
      provider: "other",
      timestamp: "2024-01-01T00:00:00.000Z",
      services: {
        email: {
          preset: "starter",
          config: {
            domain: "example.com",
            sendingEnabled: true,
            tracking: { enabled: true },
          },
          pulumiStackName: "wraps-123456789012-us-east-1",
          deployedAt: "2024-01-01T00:00:00.000Z",
        },
      },
    };

    localMetadataStore["123456789012-us-east-1"] = existingMetadata;
    s3MetadataStore["123456789012-us-east-1"] = existingMetadata;

    // Step 2: Run destroy with partial failure
    mockStackDestroy.mockRejectedValue(
      new Error(
        "Command failed with exit code 255: pulumi destroy --yes --skip-preview"
      )
    );

    await emailDestroy({ force: true, region: "us-east-1" });

    // Verify destroy deleted local metadata
    expect(mockDeleteConnectionMetadata).toHaveBeenCalledWith(
      "123456789012",
      "us-east-1"
    );

    // Step 3: Run init — it should NOT find existing metadata
    // BUG: loadConnectionMetadata will re-download from S3 and return the old metadata
    // Reset the loadConnectionMetadata call count so we can track the init call
    mockLoadConnectionMetadata.mockClear();

    // init should proceed with deployment, NOT exit with "Connection already exists"
    // If it exits (process.exit), the test will throw "process.exit called"
    let initExitedEarly = false;
    try {
      await init({
        provider: "other",
        region: "us-east-1",
        domain: "example.com",
        preset: "starter",
        yes: true,
        quick: true,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "process.exit called") {
        initExitedEarly = true;
      } else {
        throw error;
      }
    }

    // The bug: init finds metadata from S3 fallback and exits early
    // This assertion should PASS when the bug is fixed (init should NOT exit early)
    // Currently it FAILS because loadConnectionMetadata returns the S3 copy
    expect(initExitedEarly).toBe(false);
  });

  it("deleteConnectionMetadata should remove S3 metadata too", async () => {
    // Seed metadata in both stores
    const metadata = {
      version: "1.0.0",
      accountId: "123456789012",
      region: "us-east-1",
      provider: "other",
      timestamp: "2024-01-01T00:00:00.000Z",
      services: {
        email: {
          preset: "starter",
          config: {
            domain: "example.com",
            sendingEnabled: true,
            tracking: { enabled: true },
          },
          pulumiStackName: "wraps-123456789012-us-east-1",
          deployedAt: "2024-01-01T00:00:00.000Z",
        },
      },
    };

    localMetadataStore["123456789012-us-east-1"] = metadata;
    s3MetadataStore["123456789012-us-east-1"] = metadata;

    // Delete metadata (as destroy would)
    await mockDeleteConnectionMetadata("123456789012", "us-east-1");

    // After deletion, loadConnectionMetadata should return null
    // BUG: It returns the S3 copy instead
    const loaded = await mockLoadConnectionMetadata(
      "123456789012",
      "us-east-1"
    );

    expect(loaded).toBeNull();
  });
});
