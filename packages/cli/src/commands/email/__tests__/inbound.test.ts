import { LambdaClient } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { SESClient } from "@aws-sdk/client-ses";
import {
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildInboundDNSRecords } from "../../../utils/dns/create-records.js";
import { setJsonMode } from "../../../utils/shared/json-output.js";

// Mock clack
vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  note: vi.fn(),
  log: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    step: vi.fn(),
  },
  select: vi.fn(),
  text: vi.fn(),
  confirm: vi.fn().mockResolvedValue(true),
  isCancel: vi.fn().mockReturnValue(false),
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
  })),
}));

// Mock AWS credentials so the command never touches real STS
vi.mock("../../../utils/shared/aws.js", () => ({
  getAWSRegion: vi.fn().mockResolvedValue("us-east-1"),
  validateAWSCredentials: vi.fn().mockResolvedValue({
    accountId: "123456789012",
    userId: "AIDATEST",
    arn: "arn:aws:iam::123456789012:user/test",
  }),
}));

// Mock metadata load/save; keep the real mutators (addInboundDomainToMetadata etc.)
vi.mock("../../../utils/shared/metadata.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../utils/shared/metadata.js")>();
  return {
    ...actual,
    loadConnectionMetadata: vi.fn(),
    saveConnectionMetadata: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock receipt rule helpers so the command never touches real SES
vi.mock("../../../utils/email/receipt-rules.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../utils/email/receipt-rules.js")
    >();
  return {
    ...actual,
    addDomainToReceiptRule: vi.fn().mockResolvedValue(undefined),
    removeDomainFromReceiptRule: vi.fn().mockResolvedValue(undefined),
    getReceiptRuleDomains: vi.fn().mockResolvedValue([]),
    deleteReceiptRule: vi.fn().mockResolvedValue(undefined),
    deleteReceiptRuleSet: vi.fn().mockResolvedValue(undefined),
    // Only reached by inboundInit's deploy path (step 14, "Creating SES
    // receipt rules") — mocked so its non-interactive-guard success test
    // doesn't fall through to the real AWS SDK client.
    createReceiptRuleSet: vi.fn().mockResolvedValue(undefined),
    createReceiptRule: vi.fn().mockResolvedValue(undefined),
    // Returns the read taken just before activating (plan 048).
    setActiveReceiptRuleSet: vi
      .fn()
      .mockResolvedValue({ readable: true, name: "wraps-inbound-rules" }),
    getActiveReceiptRuleSet: vi.fn().mockResolvedValue("wraps-inbound-rules"),
    readActiveReceiptRuleSet: vi
      .fn()
      .mockResolvedValue({ readable: true, name: "wraps-inbound-rules" }),
    // Plan 041: init reads the rule to tell fresh from existing (null =
    // fresh, so the default keeps init off the switch path); the switch
    // reads it again and syncs it.
    describeInboundReceiptRule: vi.fn().mockResolvedValue(null),
    syncReceiptRuleTrigger: vi.fn().mockResolvedValue(undefined),
  };
});

// `inbound status`'s read-only trigger check (Lambda GetPolicy, S3
// GetBucketPolicy, the rule) — replaced per test.
vi.mock("../../../utils/email/inbound-trigger-check.js", () => ({
  checkInboundTrigger: vi.fn(),
}));

// Mock DNS detection/creation so the command doesn't touch the network
vi.mock("../../../utils/dns/index.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../utils/dns/index.js")
  >("../../../utils/dns/index.js");
  // The real module's own copy of these — used below by clackPrompts/errors/
  // isJsonMode, imported dynamically because by the time this factory body
  // runs (lazily, on first import) every other vi.mock in this file is
  // already registered, so these resolve to the mocked/real modules exactly
  // as production code sees them.
  const clackPrompts = await import("@clack/prompts");
  const { errors } = await import("../../../utils/shared/errors.js");
  const { isJsonMode } = await import("../../../utils/shared/json-output.js");

  const checkInboundDNSPreflight = vi.fn().mockResolvedValue({
    checked: false,
    existingMx: [],
    existingSpf: [],
    alreadyPointsAtSes: false,
  });

  // Mirrors production `guardInboundDNSWrite` (utils/dns/inbound-preflight.ts)
  // against THIS file's own `checkInboundDNSPreflight` mock. The production
  // function calls its module-local `checkInboundDNSPreflight` directly, so a
  // plain object-spread mock can't intercept that internal call — this
  // closure is what lets per-test `mockResolvedValueOnce` overrides reach it.
  const guardInboundDNSWrite = vi.fn(
    async (params: {
      credentials: unknown;
      receivingDomain: string;
      region: string;
      parentDomain: string;
      yes: boolean;
    }) => {
      const preflight = await checkInboundDNSPreflight(
        params.credentials,
        params.receivingDomain,
        params.region,
        params.parentDomain
      );
      const conflict = actual.describeInboundDNSConflict(
        preflight,
        params.receivingDomain
      );

      if (conflict.severity === "ok") {
        return;
      }
      if (
        conflict.severity === "unverified" ||
        conflict.severity === "spf-conflict"
      ) {
        clackPrompts.log.warn(conflict.message);
        return;
      }
      // mx-conflict
      if (params.yes || isJsonMode()) {
        throw errors.inboundMxConflict(
          params.receivingDomain,
          params.parentDomain,
          preflight.existingMx
        );
      }
      clackPrompts.log.warn(conflict.message);
      const confirmed = await clackPrompts.confirm({
        message: `Continue adding the SES MX record to ${params.receivingDomain}?`,
        initialValue: false,
      });
      if (clackPrompts.isCancel(confirmed) || !confirmed) {
        clackPrompts.cancel("Operation cancelled.");
        process.exit(0);
      }
    }
  );

  return {
    detectAvailableDNSProviders: vi
      .fn()
      .mockResolvedValue([{ provider: "manual", detected: true }]),
    getDNSCredentials: vi.fn().mockResolvedValue({
      valid: true,
      credentials: { provider: "manual" },
    }),
    createInboundDNSRecordsForProvider: vi
      .fn()
      .mockResolvedValue({ success: true, recordsCreated: 0 }),
    deleteInboundDNSRecordsForProvider: vi.fn().mockResolvedValue({
      deleted: [],
      skipped: [],
      supported: true,
      errors: [],
    }),
    buildInboundDNSRecords: vi.fn().mockReturnValue([]),
    formatManualDNSInstructions: vi.fn().mockReturnValue(""),
    getDNSProviderDisplayName: vi.fn().mockReturnValue("Manual"),
    checkInboundDNSPreflight,
    // Real implementation: it's pure and cheap, and several new tests need
    // its actual severity classification rather than a stubbed one.
    describeInboundDNSConflict: actual.describeInboundDNSConflict,
    guardInboundDNSWrite,
  };
});

// Mock Pulumi so inboundDestroy's stack redeploy never touches a real
// workspace. Only inboundDestroy (of the functions under test in this file)
// reaches this path — inboundAdd/inboundRemove never redeploy the stack.
vi.mock("@pulumi/pulumi", () => ({
  automation: {
    LocalWorkspace: {
      createOrSelectStack: vi.fn().mockResolvedValue({
        setConfig: vi.fn().mockResolvedValue(undefined),
        up: vi.fn().mockResolvedValue({ outputs: {} }),
      }),
    },
  },
}));

vi.mock("../../../utils/shared/pulumi.js", () => ({
  ensurePulumiInstalled: vi.fn().mockResolvedValue(undefined),
  previewWithResourceChanges: vi.fn(),
  withLockRetry: vi
    .fn()
    .mockImplementation(async (fn: () => Promise<unknown>) => fn()),
}));

// Only reached when a test runs the Pulumi program (plan 041 repair test).
vi.mock("../../../infrastructure/email-stack.js", () => ({
  deployEmailStack: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../../utils/shared/fs.js", () => ({
  ensurePulumiWorkDir: vi.fn().mockResolvedValue(undefined),
  getPulumiWorkDir: vi.fn().mockReturnValue("/tmp/wraps-test/pulumi"),
}));

import {
  inboundAdd,
  inboundDestroy,
  inboundInit,
  inboundRemove,
  inboundRepairCommand,
  inboundStatus,
} from "../inbound.js";

// Backstop: if a receipt-rule or trigger-check export is ever left unmocked,
// its SDK call lands here instead of on real AWS.
mockClient(SESClient);
const lambdaBackstop = mockClient(LambdaClient);
const s3Backstop = mockClient(S3Client);
// `inbound status` reads the DLQ depth through SQS.
const sqsBackstop = mockClient(SQSClient);

const baseMetadata = {
  version: "1.0.0",
  accountId: "123456789012",
  region: "us-east-1",
  provider: "other" as const,
  timestamp: "2024-01-01T00:00:00.000Z",
  services: {
    email: {
      config: {
        domain: "example.com",
        inbound: {
          enabled: true,
          subdomain: "in",
          receivingDomain: "in.example.com",
          bucketName: "wraps-inbound-123456789012-us-east-1",
          // Pinned so the pre-041 tests stay off the trigger-switch path;
          // the switch has its own tests below.
          trigger: "ses-lambda-action" as const,
        },
        inboundDomains: [
          {
            subdomain: "in",
            receivingDomain: "in.example.com",
            parentDomain: "example.com",
            addedAt: "2024-01-01T00:00:00.000Z",
          },
        ],
        additionalDomains: [],
      },
      preset: "starter" as const,
      deployedAt: "2024-01-01T00:00:00.000Z",
      pulumiStackName: "wraps-123456789012-us-east-1",
    },
  },
};

function cloneMetadata(
  overrides?: (m: typeof baseMetadata) => void
): typeof baseMetadata {
  const copy = JSON.parse(JSON.stringify(baseMetadata)) as typeof baseMetadata;
  overrides?.(copy);
  return copy;
}

// A handful of tests below need `createInboundDNSRecordsForProvider` to
// actually be invoked so the receivingDomain argument can be inspected. That
// call only happens when the account already has a non-"manual" DNS provider
// on file — otherwise `--yes` short-circuits provider selection to "manual"
// and the command falls back to printing manual instructions instead.
function cloneMetadataWithDnsProvider(): typeof baseMetadata {
  return cloneMetadata((m) => {
    (m.services.email as { dnsProvider?: string }).dnsProvider = "cloudflare";
  });
}

describe("inboundAdd smoke test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setJsonMode(false);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  });

  it("resolves without throwing for a basic add", async () => {
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());

    await expect(
      inboundAdd({
        subdomain: "support",
        domain: "example.com",
        yes: true,
        json: true,
      })
    ).resolves.toBeUndefined();
  });
});

describe("inboundAdd receiving domain resolution", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setJsonMode(false);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockImplementation(async () =>
      cloneMetadataWithDnsProvider()
    );
  });

  it("uses the given --subdomain", async () => {
    const { createInboundDNSRecordsForProvider } = await import(
      "../../../utils/dns/index.js"
    );

    await inboundAdd({
      subdomain: "support",
      domain: "example.com",
      yes: true,
    });

    expect(vi.mocked(createInboundDNSRecordsForProvider)).toHaveBeenCalledWith(
      expect.anything(),
      "support.example.com",
      "us-east-1",
      "example.com"
    );
  });

  it("defaults to 'inbound' with --yes and no --subdomain", async () => {
    const { createInboundDNSRecordsForProvider } = await import(
      "../../../utils/dns/index.js"
    );

    await inboundAdd({ domain: "example.com", yes: true });

    expect(vi.mocked(createInboundDNSRecordsForProvider)).toHaveBeenCalledWith(
      expect.anything(),
      "inbound.example.com",
      "us-east-1",
      "example.com"
    );
  });

  it("uses the parent domain itself when --root is passed", async () => {
    const { createInboundDNSRecordsForProvider } = await import(
      "../../../utils/dns/index.js"
    );

    await inboundAdd({ root: true, domain: "example.com", yes: true });

    expect(vi.mocked(createInboundDNSRecordsForProvider)).toHaveBeenCalledWith(
      expect.anything(),
      "example.com",
      "us-east-1",
      "example.com"
    );
  });

  it("errors when --root and --subdomain are both passed, before any AWS or DNS call", async () => {
    const { createInboundDNSRecordsForProvider } = await import(
      "../../../utils/dns/index.js"
    );
    const { validateAWSCredentials } = await import(
      "../../../utils/shared/aws.js"
    );
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );

    await expect(
      inboundAdd({
        subdomain: "support",
        root: true,
        domain: "example.com",
        yes: true,
      })
    ).rejects.toMatchObject({
      name: "WrapsError",
      code: "INVALID_FLAG_USAGE",
      message: expect.stringContaining("cannot be used together"),
    });

    expect(vi.mocked(validateAWSCredentials)).not.toHaveBeenCalled();
    expect(vi.mocked(loadConnectionMetadata)).not.toHaveBeenCalled();
    expect(
      vi.mocked(createInboundDNSRecordsForProvider)
    ).not.toHaveBeenCalled();
  });

  it("errors on a stray argument (--root wraps.dev), before any AWS or DNS call", async () => {
    const { createInboundDNSRecordsForProvider } = await import(
      "../../../utils/dns/index.js"
    );
    const { validateAWSCredentials } = await import(
      "../../../utils/shared/aws.js"
    );
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );

    await expect(
      inboundAdd({
        root: true,
        domain: "example.com",
        yes: true,
        unexpectedArg: "wraps.dev",
      })
    ).rejects.toMatchObject({
      name: "WrapsError",
      code: "INVALID_FLAG_USAGE",
      message: "Unexpected argument: wraps.dev",
    });

    expect(vi.mocked(validateAWSCredentials)).not.toHaveBeenCalled();
    expect(vi.mocked(loadConnectionMetadata)).not.toHaveBeenCalled();
    expect(
      vi.mocked(createInboundDNSRecordsForProvider)
    ).not.toHaveBeenCalled();
  });
});

describe("inboundAdd apex domain reachability", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setJsonMode(false);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockImplementation(async () =>
      cloneMetadataWithDnsProvider()
    );
  });

  it("refuses non-interactively when the apex already has a non-SES MX record", async () => {
    const { createInboundDNSRecordsForProvider, checkInboundDNSPreflight } =
      await import("../../../utils/dns/index.js");
    vi.mocked(checkInboundDNSPreflight).mockResolvedValueOnce({
      checked: true,
      existingMx: ["1 aspmx.l.google.com"],
      existingSpf: [],
      alreadyPointsAtSes: false,
    });

    await expect(
      inboundAdd({ root: true, domain: "example.com", yes: true })
    ).rejects.toThrow(/already has mail routed to it/);

    expect(
      vi.mocked(createInboundDNSRecordsForProvider)
    ).not.toHaveBeenCalled();
  });

  it("does not write a second SPF record when one already exists (warns and proceeds)", async () => {
    const { createInboundDNSRecordsForProvider, checkInboundDNSPreflight } =
      await import("../../../utils/dns/index.js");
    vi.mocked(checkInboundDNSPreflight).mockResolvedValueOnce({
      checked: true,
      existingMx: [],
      existingSpf: ["v=spf1 -all"],
      alreadyPointsAtSes: false,
    });

    await inboundAdd({ root: true, domain: "example.com", yes: true });

    // The preflight never drops the SPF record itself — that guard lives in
    // createInboundDNSRecordsForProvider (mocked here), which is why the
    // write still proceeds; the preflight only decides whether to warn.
    expect(vi.mocked(createInboundDNSRecordsForProvider)).toHaveBeenCalledWith(
      expect.anything(),
      "example.com",
      expect.anything(),
      expect.anything()
    );
  });

  it("proceeds without a prompt when the MX already points at SES (idempotent re-run)", async () => {
    const { createInboundDNSRecordsForProvider, checkInboundDNSPreflight } =
      await import("../../../utils/dns/index.js");
    vi.mocked(checkInboundDNSPreflight).mockResolvedValueOnce({
      checked: true,
      existingMx: ["10 inbound-smtp.us-east-1.amazonaws.com"],
      existingSpf: [],
      alreadyPointsAtSes: true,
    });
    const { confirm } = await import("@clack/prompts");

    await inboundAdd({ root: true, domain: "example.com", yes: true });

    expect(confirm).not.toHaveBeenCalled();
    expect(vi.mocked(createInboundDNSRecordsForProvider)).toHaveBeenCalledWith(
      expect.anything(),
      "example.com",
      expect.anything(),
      expect.anything()
    );
  });

  it("proceeds with a warning when the provider could not be read (manual/checked: false)", async () => {
    const { createInboundDNSRecordsForProvider, checkInboundDNSPreflight } =
      await import("../../../utils/dns/index.js");
    vi.mocked(checkInboundDNSPreflight).mockResolvedValueOnce({
      checked: false,
      existingMx: [],
      existingSpf: [],
      alreadyPointsAtSes: false,
    });
    const { log } = await import("@clack/prompts");

    await inboundAdd({ root: true, domain: "example.com", yes: true });

    expect(vi.mocked(log.warn)).toHaveBeenCalled();
    expect(vi.mocked(createInboundDNSRecordsForProvider)).toHaveBeenCalledWith(
      expect.anything(),
      "example.com",
      expect.anything(),
      expect.anything()
    );
  });
});

describe("inboundAdd successful no-op DNS write", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setJsonMode(false);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockImplementation(async () =>
      cloneMetadataWithDnsProvider()
    );
  });

  it("does not print the manual-DNS block when success:true, recordsCreated:0 (harmful-advice bug)", async () => {
    const { createInboundDNSRecordsForProvider } = await import(
      "../../../utils/dns/index.js"
    );
    vi.mocked(createInboundDNSRecordsForProvider).mockResolvedValueOnce({
      success: true,
      recordsCreated: 0,
    });
    const { note } = await import("@clack/prompts");

    await inboundAdd({ domain: "example.com", yes: true });

    expect(vi.mocked(note)).not.toHaveBeenCalledWith(
      expect.anything(),
      "DNS Records — Add these to your DNS provider"
    );
  });

  it("does not report a successful no-op write as a failure", async () => {
    const { createInboundDNSRecordsForProvider } = await import(
      "../../../utils/dns/index.js"
    );
    vi.mocked(createInboundDNSRecordsForProvider).mockResolvedValueOnce({
      success: true,
      recordsCreated: 0,
    });
    const { log } = await import("@clack/prompts");

    await inboundAdd({ domain: "example.com", yes: true });

    // progress.fail() routes through clack.log.error, not console.log.
    expect(vi.mocked(log.error)).not.toHaveBeenCalledWith(
      "Failed to create some DNS records"
    );
  });

  it("still warns errors carried alongside a successful no-op write (pins 308's behaviour)", async () => {
    const { createInboundDNSRecordsForProvider } = await import(
      "../../../utils/dns/index.js"
    );
    vi.mocked(createInboundDNSRecordsForProvider).mockResolvedValueOnce({
      success: true,
      recordsCreated: 0,
      errors: ["add include:amazonses.com to your existing SPF record"],
    });
    const { log } = await import("@clack/prompts");

    await inboundAdd({ domain: "example.com", yes: true });

    expect(vi.mocked(log.warn)).toHaveBeenCalledWith(
      "add include:amazonses.com to your existing SPF record"
    );
  });

  it("still reports a genuine failure and prints the manual-DNS block (today's behaviour preserved)", async () => {
    const { createInboundDNSRecordsForProvider } = await import(
      "../../../utils/dns/index.js"
    );
    vi.mocked(createInboundDNSRecordsForProvider).mockResolvedValueOnce({
      success: false,
      recordsCreated: 0,
      errors: ["some hard failure"],
    });
    const { note, log } = await import("@clack/prompts");

    await inboundAdd({ domain: "example.com", yes: true });

    expect(vi.mocked(log.error)).toHaveBeenCalledWith(
      "Failed to create some DNS records"
    );
    expect(vi.mocked(note)).toHaveBeenCalledWith(
      expect.anything(),
      "DNS Records — Add these to your DNS provider"
    );
  });
});

describe("inboundAdd non-interactive guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setJsonMode(false);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  });

  it("throws NON_INTERACTIVE_INPUT selecting a parent domain when multiple are tracked and neither --domain nor --yes is set", async () => {
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(
      cloneMetadata((m) => {
        m.services.email.config.additionalDomains = [
          {
            domain: "second.example.com",
            addedAt: "2024-01-02T00:00:00.000Z",
          },
        ];
      })
    );

    await expect(inboundAdd({ subdomain: "support" })).rejects.toMatchObject({
      name: "WrapsError",
      code: "NON_INTERACTIVE_INPUT",
    });
  });
});

describe("buildInboundDNSRecords", () => {
  it("returns exactly the inbound MX and SPF records for the receiving domain", () => {
    const records = buildInboundDNSRecords("support.example.com", "us-east-1");

    expect(records).toHaveLength(2);
    expect(records).toContainEqual({
      name: "support.example.com",
      type: "MX",
      value: "inbound-smtp.us-east-1.amazonaws.com",
      priority: 10,
      category: "inbound_mx",
    });
    expect(records).toContainEqual({
      name: "support.example.com",
      type: "TXT",
      value: "v=spf1 include:amazonses.com ~all",
      category: "inbound_spf",
    });
  });
});

describe("inboundInit non-interactive guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setJsonMode(false);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    // Deliberately NOT simulating a TTY here — process.stdin.isTTY /
    // process.stdout.isTTY default to undefined under vitest, which is
    // exactly the non-interactive condition ensureInteractive() is meant
    // to catch.
  });

  // Mirrors twoDomainMetadata() in the inboundRemove describe block below,
  // but for the primary/additionalDomains shape inboundInit reads via
  // getAllTrackedDomains(), rather than inboundDomains.
  function twoTrackedDomainsMetadata(): typeof baseMetadata {
    return cloneMetadata((m) => {
      m.services.email.config.additionalDomains = [
        { domain: "second.example.com", addedAt: "2024-01-02T00:00:00.000Z" },
      ];
    });
  }

  it("throws NON_INTERACTIVE_INPUT selecting a domain when multiple domains are tracked and --yes is absent", async () => {
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(
      twoTrackedDomainsMetadata()
    );

    await expect(inboundInit({ root: true })).rejects.toMatchObject({
      name: "WrapsError",
      code: "NON_INTERACTIVE_INPUT",
    });
  });

  it("throws NON_INTERACTIVE_INPUT on the deploy confirmation when --yes is absent", async () => {
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    // Single tracked domain, so the domain-select guard above is never
    // reached — this isolates the deploy-confirmation guard.
    vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());

    await expect(
      inboundInit({
        root: true,
        webhookUrl: "https://example.com/hook",
      })
    ).rejects.toMatchObject({
      name: "WrapsError",
      code: "NON_INTERACTIVE_INPUT",
    });
  });

  it("errors when --root and a subdomain are both passed, before any AWS call", async () => {
    const { validateAWSCredentials } = await import(
      "../../../utils/shared/aws.js"
    );
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );

    await expect(
      inboundInit({ root: true, subdomain: "support", yes: true })
    ).rejects.toMatchObject({
      name: "WrapsError",
      code: "INVALID_FLAG_USAGE",
      message: expect.stringContaining("cannot be used together"),
    });

    expect(vi.mocked(validateAWSCredentials)).not.toHaveBeenCalled();
    expect(vi.mocked(loadConnectionMetadata)).not.toHaveBeenCalled();
  });

  it("errors on a stray argument (--root wraps.dev), before any AWS call", async () => {
    const { validateAWSCredentials } = await import(
      "../../../utils/shared/aws.js"
    );
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );

    await expect(
      inboundInit({ root: true, yes: true, unexpectedArg: "wraps.dev" })
    ).rejects.toMatchObject({
      name: "WrapsError",
      code: "INVALID_FLAG_USAGE",
      message: "Unexpected argument: wraps.dev",
    });

    expect(vi.mocked(validateAWSCredentials)).not.toHaveBeenCalled();
    expect(vi.mocked(loadConnectionMetadata)).not.toHaveBeenCalled();
  });

  it("--root alone resolves the receiving domain to the parent domain", async () => {
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());

    await inboundInit({ root: true, yes: true });

    const { log } = await import("@clack/prompts");
    const receiving = vi
      .mocked(log.info)
      .mock.calls.map(([msg]) => String(msg))
      // biome-ignore lint/suspicious/noControlCharactersInRegex: strip ANSI colour codes
      .map((msg) => msg.replace(/\u001b\[[0-9;]*m/g, ""))
      .filter((msg) => msg.startsWith("Receiving domain:"));
    expect(receiving).toEqual(["Receiving domain: example.com"]);
  });

  function receivingDomainsLogged(log: { info: unknown }): string[] {
    return (
      vi
        .mocked(log.info as (m: unknown) => void)
        .mock.calls.map(([msg]) => String(msg))
        // biome-ignore lint/suspicious/noControlCharactersInRegex: strip ANSI colour codes
        .map((msg) => msg.replace(/\u001b\[[0-9;]*m/g, ""))
        .filter((msg) => msg.startsWith("Receiving domain:"))
    );
  }

  it("--domain is the parent and --subdomain the label, as for inbound add", async () => {
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());

    await inboundInit({
      domain: "example.com",
      subdomain: "support",
      yes: true,
    });

    const { log } = await import("@clack/prompts");
    expect(receivingDomainsLogged(log)).toEqual([
      "Receiving domain: support.example.com",
    ]);
  });

  it("rejects a --domain Wraps does not track, before any deploy", async () => {
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());
    const pulumi = await import("@pulumi/pulumi");

    await expect(
      inboundInit({ domain: "other.com", subdomain: "support", yes: true })
    ).rejects.toMatchObject({
      name: "WrapsError",
      code: "INVALID_FLAG_USAGE",
    });
    expect(
      vi.mocked(pulumi.automation.LocalWorkspace.createOrSelectStack)
    ).not.toHaveBeenCalled();
  });

  it("still reads a dotless --domain as the subdomain label, with a warning", async () => {
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());

    await inboundInit({ domain: "support", yes: true });

    const { log } = await import("@clack/prompts");
    expect(receivingDomainsLogged(log)).toEqual([
      "Receiving domain: support.example.com",
    ]);
    expect(vi.mocked(log.warn)).toHaveBeenCalledWith(
      expect.stringContaining("--subdomain support")
    );
  });

  it("--preview shows the plan and writes nothing: no stack.up, receipt rule, DNS or metadata", async () => {
    const { loadConnectionMetadata, saveConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());
    const pulumiUtils = await import("../../../utils/shared/pulumi.js");
    vi.mocked(pulumiUtils.previewWithResourceChanges).mockResolvedValue({
      changeSummary: { create: 4 },
      resourceChanges: [],
    } as never);
    const pulumi = await import("@pulumi/pulumi");
    const stack = {
      setConfig: vi.fn().mockResolvedValue(undefined),
      up: vi.fn(),
    };
    vi.mocked(
      pulumi.automation.LocalWorkspace.createOrSelectStack
    ).mockResolvedValueOnce(stack as never);
    const receiptRules = await import("../../../utils/email/receipt-rules.js");
    const dns = await import("../../../utils/dns/index.js");

    await inboundInit({
      domain: "example.com",
      subdomain: "support",
      yes: true,
      preview: true,
    });

    expect(pulumiUtils.previewWithResourceChanges).toHaveBeenCalledWith(stack, {
      diff: true,
    });
    expect(stack.up).not.toHaveBeenCalled();
    expect(receiptRules.createReceiptRuleSet).not.toHaveBeenCalled();
    expect(receiptRules.createReceiptRule).not.toHaveBeenCalled();
    expect(receiptRules.setActiveReceiptRuleSet).not.toHaveBeenCalled();
    expect(dns.createInboundDNSRecordsForProvider).not.toHaveBeenCalled();
    expect(saveConnectionMetadata).not.toHaveBeenCalled();
  });

  it("resolves without prompting when --root --yes --json are all set", async () => {
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());

    await expect(
      inboundInit({ root: true, yes: true, json: true })
    ).resolves.toBeUndefined();

    const clack = await import("@clack/prompts");
    expect(vi.mocked(clack.select)).not.toHaveBeenCalled();
    expect(vi.mocked(clack.confirm)).not.toHaveBeenCalled();
  });
});

describe("inboundDestroy", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setJsonMode(false);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    // inboundDestroy's confirm is now guarded by ensureInteractive(), which
    // reads real process.stdin/stdout — simulate an interactive TTY so the
    // guard is a no-op and the mocked clack.confirm below is still reached.
    process.stdin.isTTY = true;
    process.stdout.isTTY = true;
    delete process.env.CI;

    const { confirm } = await import("@clack/prompts");
    // Interactive path (no --force), proceeding — reaches the full teardown
    // deterministically without relying on process.exit fallthrough behavior.
    vi.mocked(confirm).mockResolvedValue(true);
  });

  afterEach(() => {
    process.stdin.isTTY = true;
    process.stdout.isTTY = true;
  });

  // The ownership rule this plan encodes: r.mail.<domain> belongs to
  // reply-threading and is deleted only by `email reply destroy`, never as
  // a side effect of removing inbound receiving domains. dnsProvider is set
  // so the inbound DNS cleanup path actually runs (and therefore actually
  // calls deleteInboundDNSRecordsForProvider) — otherwise the "no r.mail
  // argument" assertion below would be trivially true for the wrong reason.
  it("warns about reply-threading and deletes no r.mail record, even while deleting the inbound domain's own DNS", async () => {
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    const meta = cloneMetadata((m) => {
      (m.services.email as { dnsProvider?: string }).dnsProvider = "cloudflare";
      // biome-ignore lint/suspicious/noExplicitAny: test setup
      (m.services.email.config as any).replyThreading = {
        enabled: true,
        domains: [
          {
            domain: "example.com",
            parameterArn:
              "arn:aws:ssm:us-east-1:123456789012:parameter/wraps/email/reply-secret/example.com",
            parameterName: "/wraps/email/reply-secret/example.com",
            currentKid: 1,
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        ],
      };
    });
    vi.mocked(loadConnectionMetadata).mockResolvedValue(meta);

    const { deleteInboundDNSRecordsForProvider } = await import(
      "../../../utils/dns/index.js"
    );
    vi.mocked(deleteInboundDNSRecordsForProvider).mockResolvedValue({
      deleted: ["MX in.example.com"],
      skipped: [],
      supported: true,
      errors: [],
    });

    await inboundDestroy({});

    // Positive assertion first: the warning must actually fire, so this
    // test cannot pass via an early return that skips everything.
    const { log } = await import("@clack/prompts");
    expect(vi.mocked(log.warn)).toHaveBeenCalledWith(
      expect.stringContaining("Reply threading will stop working")
    );

    // DNS cleanup for the inbound receiving domain did run...
    expect(vi.mocked(deleteInboundDNSRecordsForProvider)).toHaveBeenCalled();

    // ...but never with an r.mail name, on any call, for any argument.
    for (const call of vi.mocked(deleteInboundDNSRecordsForProvider).mock
      .calls) {
      for (const arg of call) {
        expect(typeof arg === "string" && arg.startsWith("r.mail.")).toBe(
          false
        );
      }
    }
  });

  it("does not warn when reply-threading is not configured", async () => {
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());

    await inboundDestroy({});

    const { log } = await import("@clack/prompts");
    const warnedAboutReplyThreading = vi
      .mocked(log.warn)
      .mock.calls.some(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("Reply threading will stop working")
      );
    expect(warnedAboutReplyThreading).toBe(false);
  });
});

describe("inboundRemove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setJsonMode(false);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    // inboundDestroy's afterEach (above) leaves process.stdin/stdout.isTTY
    // set to true for its own interactive-path tests — reset to the default
    // vitest state (undefined/non-interactive) so this block's
    // NON_INTERACTIVE_INPUT test isn't accidentally made interactive by
    // that leaked state.
    process.stdin.isTTY = undefined;
    process.stdout.isTTY = undefined;
  });

  // Sets a non-"manual" dnsProvider, mirroring cloneMetadataWithDnsProvider
  // above: DNS cleanup only runs (and only calls
  // deleteInboundDNSRecordsForProvider) when the account has a DNS provider
  // on file — otherwise it's treated as manual and skipped.
  function twoDomainMetadata(): typeof baseMetadata {
    return cloneMetadata((m) => {
      m.services.email.config.inboundDomains = [
        {
          subdomain: "in",
          receivingDomain: "in.example.com",
          parentDomain: "example.com",
          addedAt: "2024-01-01T00:00:00.000Z",
        },
        {
          subdomain: "support",
          receivingDomain: "support.example.com",
          parentDomain: "example.com",
          addedAt: "2024-01-02T00:00:00.000Z",
        },
      ];
      (m.services.email as { dnsProvider?: string }).dnsProvider = "cloudflare";
    });
  }

  it("calls removeDomainFromReceiptRule and saves metadata without the removed domain", async () => {
    const { loadConnectionMetadata, saveConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    const { removeDomainFromReceiptRule } = await import(
      "../../../utils/email/receipt-rules.js"
    );

    vi.mocked(loadConnectionMetadata).mockResolvedValue(twoDomainMetadata());

    await inboundRemove({ domain: "support.example.com", yes: true });

    expect(vi.mocked(removeDomainFromReceiptRule)).toHaveBeenCalledWith(
      "us-east-1",
      "support.example.com"
    );

    expect(vi.mocked(saveConnectionMetadata)).toHaveBeenCalled();
    const saved = vi.mocked(saveConnectionMetadata).mock.calls.at(-1)?.[0] as
      | typeof baseMetadata
      | undefined;
    expect(
      saved?.services.email?.config.inboundDomains?.map(
        (d) => d.receivingDomain
      )
    ).toEqual(["in.example.com"]);
  });

  it("deletes the DNS records inbound add created, via the resolved credentials", async () => {
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    const { getDNSCredentials, deleteInboundDNSRecordsForProvider } =
      await import("../../../utils/dns/index.js");

    vi.mocked(loadConnectionMetadata).mockResolvedValue(twoDomainMetadata());

    await inboundRemove({ domain: "support.example.com", yes: true });

    const resolvedCredentials =
      await vi.mocked(getDNSCredentials).mock.results[0]?.value;

    expect(vi.mocked(deleteInboundDNSRecordsForProvider)).toHaveBeenCalledWith(
      resolvedCredentials.credentials,
      "support.example.com",
      "us-east-1",
      "example.com"
    );
  });

  it("still saves metadata without the removed domain when DNS cleanup rejects", async () => {
    const { loadConnectionMetadata, saveConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    const { deleteInboundDNSRecordsForProvider } = await import(
      "../../../utils/dns/index.js"
    );

    vi.mocked(loadConnectionMetadata).mockResolvedValue(twoDomainMetadata());
    vi.mocked(deleteInboundDNSRecordsForProvider).mockRejectedValueOnce(
      new Error("boom")
    );

    await inboundRemove({ domain: "support.example.com", yes: true });

    expect(vi.mocked(saveConnectionMetadata)).toHaveBeenCalled();
    const saved = vi.mocked(saveConnectionMetadata).mock.calls.at(-1)?.[0] as
      | typeof baseMetadata
      | undefined;
    expect(
      saved?.services.email?.config.inboundDomains?.map(
        (d) => d.receivingDomain
      )
    ).toEqual(["in.example.com"]);
  });

  it("never calls DNS cleanup and keeps the manual reminder when no dnsProvider is on file", async () => {
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    const { deleteInboundDNSRecordsForProvider } = await import(
      "../../../utils/dns/index.js"
    );

    // Same two-domain shape as twoDomainMetadata(), but without the
    // dnsProvider override — this is what an account with no DNS provider
    // on file looks like.
    const metadata = cloneMetadata((m) => {
      m.services.email.config.inboundDomains = [
        {
          subdomain: "in",
          receivingDomain: "in.example.com",
          parentDomain: "example.com",
          addedAt: "2024-01-01T00:00:00.000Z",
        },
        {
          subdomain: "support",
          receivingDomain: "support.example.com",
          parentDomain: "example.com",
          addedAt: "2024-01-02T00:00:00.000Z",
        },
      ];
    });
    vi.mocked(loadConnectionMetadata).mockResolvedValue(metadata);

    await inboundRemove({ domain: "support.example.com", yes: true });

    expect(
      vi.mocked(deleteInboundDNSRecordsForProvider)
    ).not.toHaveBeenCalled();

    const printedReminder = vi
      .mocked(console.log)
      .mock.calls.some(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("Remember to remove the MX and SPF DNS records")
      );
    expect(printedReminder).toBe(true);
  });

  it("includes dnsDeleted in the --json payload", async () => {
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    const { deleteInboundDNSRecordsForProvider } = await import(
      "../../../utils/dns/index.js"
    );

    vi.mocked(loadConnectionMetadata).mockResolvedValue(twoDomainMetadata());
    vi.mocked(deleteInboundDNSRecordsForProvider).mockResolvedValueOnce({
      deleted: ["MX support.example.com"],
      skipped: [],
      supported: true,
      errors: [],
    });

    setJsonMode(true);
    await inboundRemove({ domain: "support.example.com", yes: true });
    setJsonMode(false);

    const jsonCall = vi
      .mocked(console.log)
      .mock.calls.map((call) => call[0])
      .find(
        (arg) => typeof arg === "string" && arg.includes("email.inbound.remove")
      );

    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(jsonCall as string);
    expect(parsed.data.dnsDeleted).toEqual(["MX support.example.com"]);
  });

  it("refuses to remove the last remaining domain", async () => {
    const { loadConnectionMetadata, saveConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    const { removeDomainFromReceiptRule } = await import(
      "../../../utils/email/receipt-rules.js"
    );

    // baseMetadata carries a single inboundDomains entry: in.example.com
    vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());

    await inboundRemove({ domain: "in.example.com", yes: true });

    expect(vi.mocked(removeDomainFromReceiptRule)).not.toHaveBeenCalled();
    expect(vi.mocked(saveConnectionMetadata)).not.toHaveBeenCalled();

    const clack = await import("@clack/prompts");
    expect(vi.mocked(clack.log.error)).toHaveBeenCalledWith(
      expect.stringContaining("Cannot remove the last inbound domain")
    );
  });

  it("throws NON_INTERACTIVE_INPUT selecting a domain to remove when multiple are tracked and --domain is absent", async () => {
    const { loadConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(twoDomainMetadata());

    await expect(inboundRemove({})).rejects.toMatchObject({
      name: "WrapsError",
      code: "NON_INTERACTIVE_INPUT",
    });
  });
});

// ---------------------------------------------------------------------------
// Plan 041: trigger mode, init merge, the add-before-remove switch in init and
// add, add --preview, status, destroy. A stateful fake stands in for the
// receipt rule so tests can assert the rule's final actions.
// ---------------------------------------------------------------------------

describe("plan 041: inbound trigger in init / add / status / destroy", () => {
  type FakeRule = {
    Recipients: string[];
    Actions: Array<Record<string, unknown>>;
  };
  let rule: FakeRule | null;
  const events: string[] = [];
  const saved: Array<{
    trigger?: string;
    inbound?: Record<string, unknown>;
    inboundDomains?: Array<{ receivingDomain: string }>;
  }> = [];
  let originalDeploy: typeof import("../../../utils/email/email-stack-deploy.js")["deployHooks"]["deploy"];
  let originalPreview: typeof import("../../../utils/email/email-stack-deploy.js")["deployHooks"]["preview"];
  let exitSpy: ReturnType<typeof vi.spyOn>;

  const LEGACY = (bucket: string) => [
    { S3Action: { BucketName: bucket, ObjectKeyPrefix: "raw/" } },
  ];

  function legacyMetadata(
    overrides?: (m: typeof baseMetadata) => void
  ): typeof baseMetadata {
    return cloneMetadata((m) => {
      // biome-ignore lint/performance/noDelete: legacy metadata has no trigger key
      delete (m.services.email.config.inbound as { trigger?: string }).trigger;
      overrides?.(m);
    });
  }

  function jsonOutput(command: string): Record<string, any> | undefined {
    const line = vi
      .mocked(console.log)
      .mock.calls.map((c) => c[0])
      .find(
        (arg) =>
          typeof arg === "string" && arg.includes(`"command":"${command}"`)
      );
    return line ? JSON.parse(line as string) : undefined;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    setJsonMode(false);
    events.length = 0;
    saved.length = 0;
    rule = null;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    const actualRules = await vi.importActual<
      typeof import("../../../utils/email/receipt-rules.js")
    >("../../../utils/email/receipt-rules.js");
    const rules = await import("../../../utils/email/receipt-rules.js");
    vi.mocked(rules.describeInboundReceiptRule).mockImplementation(
      async () => rule as never
    );
    vi.mocked(rules.createReceiptRule).mockImplementation(
      async (region, account, domain, bucket, trigger) => {
        const recipients = rule?.Recipients ?? [];
        rule = {
          Recipients: recipients.includes(domain)
            ? recipients
            : [...recipients, domain],
          Actions: actualRules.inboundRuleActions(
            region,
            account,
            bucket,
            trigger
          ) as FakeRule["Actions"],
        };
        events.push(`rule-write:${trigger}`);
      }
    );
    vi.mocked(rules.addDomainToReceiptRule).mockImplementation(
      async (region, account, domain, bucket, trigger) => {
        if (rule) {
          rule = { ...rule, Recipients: [...rule.Recipients, domain] };
        } else {
          rule = {
            Recipients: [domain],
            Actions: actualRules.inboundRuleActions(
              region,
              account,
              bucket,
              trigger
            ) as FakeRule["Actions"],
          };
        }
        events.push(`rule-add:${trigger}`);
      }
    );
    vi.mocked(rules.syncReceiptRuleTrigger).mockImplementation(
      async (region, account, bucket, trigger) => {
        if (!rule) {
          throw new Error("no rule");
        }
        rule = {
          ...rule,
          Actions: actualRules.inboundRuleActions(
            region,
            account,
            bucket,
            trigger
          ) as FakeRule["Actions"],
        };
        events.push(`sync:${trigger}`);
      }
    );

    const { saveConnectionMetadata } = await import(
      "../../../utils/shared/metadata.js"
    );
    vi.mocked(saveConnectionMetadata).mockImplementation(async (m) => {
      const config = m.services.email?.config;
      saved.push(
        JSON.parse(
          JSON.stringify({
            trigger: config?.inbound?.trigger,
            inbound: config?.inbound,
            inboundDomains: config?.inboundDomains,
          })
        )
      );
      events.push(`save:${config?.inbound?.trigger ?? "absent"}`);
    });

    const pulumi = await import("@pulumi/pulumi");
    vi.mocked(
      pulumi.automation.LocalWorkspace.createOrSelectStack
    ).mockImplementation(
      async () =>
        ({
          setConfig: vi.fn().mockResolvedValue(undefined),
          up: vi.fn(async () => {
            events.push("command-up");
            return { outputs: {} };
          }),
        }) as never
    );

    const seam = await import("../../../utils/email/email-stack-deploy.js");
    originalDeploy = seam.deployHooks.deploy;
    originalPreview = seam.deployHooks.preview;
    seam.deployHooks.deploy = vi.fn(async (params) => {
      events.push(
        `seam-up:${params.stackConfig.emailConfig.inbound?.trigger ?? "s3-notification"}`
      );
    });
    seam.deployHooks.preview = vi.fn(async () => ({
      changeSummary: { delete: 2, update: 3 },
      resourceChanges: [],
    })) as never;
  });

  afterEach(async () => {
    const seam = await import("../../../utils/email/email-stack-deploy.js");
    seam.deployHooks.deploy = originalDeploy;
    seam.deployHooks.preview = originalPreview;
    exitSpy.mockRestore();
    setJsonMode(false);
  });

  const BUCKET = "wraps-inbound-123456789012-us-east-1";
  const REPAIR =
    "wraps email upgrade --action redeploy --region us-east-1 --yes";
  const NEW_ACTIONS = [
    { S3Action: { BucketName: BUCKET, ObjectKeyPrefix: "mail/" } },
    {
      LambdaAction: {
        FunctionArn:
          "arn:aws:lambda:us-east-1:123456789012:function:wraps-inbound-email-processor",
        InvocationType: "Event",
      },
    },
  ];

  /** No rule write with a raw/ action happens after the sync. */
  function noLegacyWriteAfterSync(): boolean {
    const syncAt = events.indexOf("sync:ses-lambda-action");
    return !events
      .slice(syncAt + 1)
      .some(
        (e) =>
          e === "rule-write:s3-notification" || e === "rule-add:s3-notification"
      );
  }

  describe("inbound init", () => {
    it("fresh (no rule): saves the inbound block with the new trigger right after the deploy, then creates the rule with mail/ + LambdaAction; no switch", async () => {
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(
        legacyMetadata((m) => {
          (m.services.email.config as { inbound?: unknown }).inbound =
            undefined;
          (
            m.services.email.config as { inboundDomains?: unknown }
          ).inboundDomains = undefined;
        })
      );

      await inboundInit({ domain: "example.com", subdomain: "in", yes: true });

      expect(events).toEqual([
        "command-up",
        "save:ses-lambda-action",
        "rule-write:ses-lambda-action",
        "save:ses-lambda-action",
      ]);
      expect(saved[0].inbound).toMatchObject({
        enabled: true,
        trigger: "ses-lambda-action",
      });
      expect(rule?.Actions).toEqual(NEW_ACTIONS);
    });

    it("existing S3-notification deployment: rule write in the saved mode, final save, then the switch (sync, save, up #2) as the last step", async () => {
      rule = { Recipients: ["in.example.com"], Actions: LEGACY(BUCKET) };
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(legacyMetadata());

      await inboundInit({ domain: "example.com", subdomain: "in", yes: true });

      expect(events).toEqual([
        "command-up",
        "save:absent",
        "rule-write:s3-notification",
        "save:absent",
        "sync:ses-lambda-action",
        "save:ses-lambda-action",
        "seam-up:ses-lambda-action",
      ]);
      expect(saved.at(-1)?.trigger).toBe("ses-lambda-action");
      expect(rule?.Actions).toEqual(NEW_ACTIONS);
      expect(noLegacyWriteAfterSync()).toBe(true);
    });

    it("rule already switched but metadata still old (design §4.4 row 3): the init rule write reverts it, and the switch's own sync moves it back to mail/ + LambdaAction", async () => {
      rule = { Recipients: ["in.example.com"], Actions: NEW_ACTIONS };
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(legacyMetadata());

      await inboundInit({ domain: "example.com", subdomain: "in", yes: true });

      expect(events.indexOf("sync:ses-lambda-action")).toBeGreaterThan(
        events.indexOf("rule-write:s3-notification")
      );
      expect(rule?.Actions).toEqual(NEW_ACTIONS);
      expect(saved.at(-1)?.trigger).toBe("ses-lambda-action");
    });

    it("re-run keeps trigger, retention, the webhook secret and inboundDomains (never r.mail.* from the rule)", async () => {
      rule = {
        Recipients: ["in.example.com", "r.mail.example.com"],
        Actions: NEW_ACTIONS,
      };
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(
        cloneMetadata((m) => {
          Object.assign(m.services.email.config.inbound, {
            retention: "90days",
            webhookUrl: "https://hooks.example.com/in",
            webhookSecret: "saved-secret",
          });
          m.services.email.config.inboundDomains.push({
            subdomain: "support",
            receivingDomain: "support.example.com",
            parentDomain: "example.com",
            addedAt: "2024-02-01T00:00:00.000Z",
          });
        })
      );

      await inboundInit({ domain: "example.com", subdomain: "in", yes: true });

      const last = saved.at(-1);
      expect(last?.inbound).toMatchObject({
        trigger: "ses-lambda-action",
        retention: "90days",
        webhookSecret: "saved-secret",
        webhookUrl: "https://hooks.example.com/in",
      });
      expect(last?.inboundDomains?.map((d) => d.receivingDomain)).toEqual([
        "in.example.com",
        "support.example.com",
      ]);
      // already in the new mode: no switch
      expect(events).not.toContain("sync:ses-lambda-action");
    });

    it("init re-run with a saved ses-lambda-action redeploys in that mode with the saved values and no switch", async () => {
      // An older CLI redeployed: SES permission gone, policy back to raw/*.
      // The rule still has mail/ + Lambda; metadata still says the new mode.
      rule = { Recipients: ["in.example.com"], Actions: NEW_ACTIONS };
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(
        cloneMetadata((m) => {
          Object.assign(m.services.email.config.inbound, {
            webhookUrl: "https://hooks.example.com/in",
            webhookSecret: "saved-secret",
            retention: "90days",
          });
        })
      );
      const pulumi = await import("@pulumi/pulumi");
      vi.mocked(
        pulumi.automation.LocalWorkspace.createOrSelectStack
      ).mockImplementation(async (args: any) => {
        await args.program();
        return {
          setConfig: vi.fn().mockResolvedValue(undefined),
          up: vi.fn(async () => {
            events.push("command-up");
            return { outputs: {} };
          }),
        } as never;
      });
      const { deployEmailStack } = await import(
        "../../../infrastructure/email-stack.js"
      );

      await inboundInit({
        domain: "example.com",
        subdomain: "in",
        region: "us-east-1",
        yes: true,
      });

      const deployed = vi.mocked(deployEmailStack).mock.calls[0][0];
      expect(deployed.emailConfig.inbound).toMatchObject({
        trigger: "ses-lambda-action",
        receivingDomain: "in.example.com",
        webhookUrl: "https://hooks.example.com/in",
        webhookSecret: "saved-secret",
        retention: "90days",
      });
      expect(events).toEqual([
        "command-up",
        "save:ses-lambda-action",
        "rule-write:ses-lambda-action",
        "save:ses-lambda-action",
      ]);
      expect(rule?.Actions).toEqual(NEW_ACTIONS);
      expect(
        saved.at(-1)?.inboundDomains?.map((d) => d.receivingDomain)
      ).toEqual(["in.example.com"]);
    });

    it("the status repair command is an upgrade redeploy, never an init re-run", () => {
      expect(inboundRepairCommand("us-east-1")).toBe(REPAIR);
    });

    it("a failed switch in --json returns a webhook secret generated in this run", async () => {
      // stale rule left behind, no saved inbound block: init generates a secret
      rule = { Recipients: ["old.example.com"], Actions: LEGACY(BUCKET) };
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(
        legacyMetadata((m) => {
          (m.services.email.config as { inbound?: unknown }).inbound =
            undefined;
          (
            m.services.email.config as { inboundDomains?: unknown }
          ).inboundDomains = undefined;
        })
      );
      const rules = await import("../../../utils/email/receipt-rules.js");
      vi.mocked(rules.syncReceiptRuleTrigger).mockRejectedValueOnce(
        new Error("AccessDenied")
      );
      setJsonMode(true);

      await expect(
        inboundInit({
          domain: "example.com",
          subdomain: "in",
          yes: true,
          webhookUrl: "https://hooks.example.com/in",
        })
      ).rejects.toThrow("process.exit(1)");

      const out = jsonOutput("email.inbound.init");
      expect(out?.success).toBe(false);
      expect(out?.data.webhookSecret).toMatch(/^[0-9a-f]{64}$/);
      expect(out?.data.webhookSecret).toBe(
        saved.at(-1)?.inbound?.webhookSecret
      );
    });

    it("appends a new init domain to the saved inboundDomains", async () => {
      rule = { Recipients: ["in.example.com"], Actions: NEW_ACTIONS };
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());

      await inboundInit({
        domain: "example.com",
        subdomain: "support",
        yes: true,
      });

      expect(
        saved.at(-1)?.inboundDomains?.map((d) => d.receivingDomain)
      ).toEqual(["in.example.com", "support.example.com"]);
    });

    it.each([
      ["receivingDomain", { subdomain: "support" }, "support.example.com"],
      ["subdomain", { subdomain: "support" }, "support"],
      ["bucketName", { subdomain: "in" }, BUCKET],
    ] as const)(
      "merges %s from the init run into the saved block",
      async (field, flags, expected) => {
        rule = { Recipients: ["in.example.com"], Actions: NEW_ACTIONS };
        const { loadConnectionMetadata } = await import(
          "../../../utils/shared/metadata.js"
        );
        vi.mocked(loadConnectionMetadata).mockResolvedValue(
          cloneMetadata((m) => {
            Object.assign(m.services.email.config.inbound, {
              bucketName: "stale-bucket-name",
              webhookSecret: "saved-secret",
            });
          })
        );

        await inboundInit({ domain: "example.com", yes: true, ...flags });

        expect(saved.at(-1)?.inbound?.[field]).toBe(expected);
        expect(saved.at(-1)?.inbound?.webhookSecret).toBe("saved-secret");
      }
    );

    it("merges webhookUrl: the flag wins over the saved URL", async () => {
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(
        cloneMetadata((m) => {
          Object.assign(m.services.email.config.inbound, {
            webhookUrl: "https://old.example.com/in",
            webhookSecret: "saved-secret",
          });
        })
      );

      await inboundInit({
        domain: "example.com",
        subdomain: "in",
        yes: true,
        webhookUrl: "https://new.example.com/in",
      });

      expect(saved.at(-1)?.inbound?.webhookUrl).toBe(
        "https://new.example.com/in"
      );
    });

    it("prints and returns in --json the secret actually saved (not a fresh one)", async () => {
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(
        cloneMetadata((m) => {
          Object.assign(m.services.email.config.inbound, {
            webhookUrl: "https://hooks.example.com/in",
            webhookSecret: "saved-secret",
          });
        })
      );
      const clack = await import("@clack/prompts");

      await inboundInit({ domain: "example.com", subdomain: "in", yes: true });
      const note = vi
        .mocked(clack.note)
        .mock.calls.map((c) => String(c[0]))
        .find((n) => n.includes("X-Wraps-Inbound-Key"));
      expect(note).toContain("saved-secret");

      setJsonMode(true);
      await inboundInit({ domain: "example.com", subdomain: "in", yes: true });
      expect(jsonOutput("email.inbound.init")?.data.webhookSecret).toBe(
        "saved-secret"
      );
      expect(saved.at(-1)?.inbound?.webhookSecret).toBe("saved-secret");
    });

    it("--json mode runs the switch and reports the resulting trigger", async () => {
      rule = { Recipients: ["in.example.com"], Actions: LEGACY(BUCKET) };
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(legacyMetadata());
      setJsonMode(true);

      await inboundInit({ domain: "example.com", subdomain: "in", yes: true });

      expect(events).toContain("sync:ses-lambda-action");
      expect(jsonOutput("email.inbound.init")?.data.trigger).toBe(
        "ses-lambda-action"
      );
    });

    it("--json switch failure goes through jsonError with the step and the finishing command, exits 1, keeps the saves", async () => {
      rule = { Recipients: ["in.example.com"], Actions: LEGACY(BUCKET) };
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(legacyMetadata());
      const rules = await import("../../../utils/email/receipt-rules.js");
      vi.mocked(rules.syncReceiptRuleTrigger).mockRejectedValueOnce(
        new Error("AccessDenied")
      );
      setJsonMode(true);

      await expect(
        inboundInit({ domain: "example.com", subdomain: "in", yes: true })
      ).rejects.toThrow("process.exit(1)");

      const out = jsonOutput("email.inbound.init");
      expect(out?.success).toBe(false);
      expect(out?.error.code).toBe("INBOUND_TRIGGER_SWITCH_FAILED");
      expect(out?.error.message).toContain("step 2");
      expect(out?.error.suggestion).toContain("wraps email upgrade");
      // init's own saves happened before the switch
      expect(saved.length).toBe(2);
    });
  });

  describe("inbound add", () => {
    it("S3-notification deployment: rule write, save, then the full switch; final trigger is new and reported in --json", async () => {
      rule = { Recipients: ["in.example.com"], Actions: LEGACY(BUCKET) };
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(legacyMetadata());
      setJsonMode(true);

      await inboundAdd({
        domain: "example.com",
        subdomain: "support",
        yes: true,
      });

      expect(events).toEqual([
        "rule-add:s3-notification",
        "save:absent",
        "seam-up:s3-notification",
        "sync:ses-lambda-action",
        "save:ses-lambda-action",
        "seam-up:ses-lambda-action",
      ]);
      expect(rule?.Actions).toEqual(NEW_ACTIONS);
      expect(noLegacyWriteAfterSync()).toBe(true);
      expect(jsonOutput("email.inbound.add")?.data.trigger).toBe(
        "ses-lambda-action"
      );
    });

    it("no rule at switch time: saves the new mode and runs up #2 only", async () => {
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(legacyMetadata());
      const rules = await import("../../../utils/email/receipt-rules.js");
      // the add's rule write is a no-op here, so the switch finds no rule
      vi.mocked(rules.addDomainToReceiptRule).mockImplementationOnce(
        async () => {
          events.push("rule-add:skipped");
        }
      );

      await inboundAdd({
        domain: "example.com",
        subdomain: "support",
        yes: true,
      });

      expect(events).toEqual([
        "rule-add:skipped",
        "save:absent",
        "save:ses-lambda-action",
        "seam-up:ses-lambda-action",
      ]);
    });

    it("already in the new mode: no switch, no deploy", async () => {
      rule = { Recipients: ["in.example.com"], Actions: NEW_ACTIONS };
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());

      await inboundAdd({
        domain: "example.com",
        subdomain: "support",
        yes: true,
      });

      expect(events).toEqual([
        "rule-add:ses-lambda-action",
        "save:ses-lambda-action",
      ]);
      expect(rule?.Actions).toEqual(NEW_ACTIONS);
    });

    it("--preview previews the switch and applies nothing", async () => {
      rule = { Recipients: ["in.example.com"], Actions: LEGACY(BUCKET) };
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(legacyMetadata());
      const seam = await import("../../../utils/email/email-stack-deploy.js");
      const dns = await import("../../../utils/dns/index.js");

      await inboundAdd({
        domain: "example.com",
        subdomain: "support",
        yes: true,
        preview: true,
      });

      expect(events).toEqual([]);
      expect(seam.deployHooks.preview).toHaveBeenCalledTimes(1);
      const previewed = vi.mocked(seam.deployHooks.preview).mock.calls[0][0];
      expect(previewed.stackConfig.emailConfig.inbound.trigger).toBe(
        "ses-lambda-action"
      );
      expect(dns.createInboundDNSRecordsForProvider).not.toHaveBeenCalled();
      expect(rule?.Actions).toEqual(LEGACY(BUCKET));
    });

    it("asks before the switch's deploys, and a no writes nothing", async () => {
      rule = { Recipients: ["in.example.com"], Actions: LEGACY(BUCKET) };
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(legacyMetadata());
      const clack = await import("@clack/prompts");
      vi.mocked(clack.confirm).mockResolvedValueOnce(false);
      const stdin = process.stdin.isTTY;
      const stdout = process.stdout.isTTY;
      Object.defineProperty(process.stdin, "isTTY", {
        value: true,
        configurable: true,
      });
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        configurable: true,
      });
      try {
        await expect(
          inboundAdd({ domain: "example.com", subdomain: "support" })
        ).rejects.toThrow("process.exit(0)");
      } finally {
        Object.defineProperty(process.stdin, "isTTY", {
          value: stdin,
          configurable: true,
        });
        Object.defineProperty(process.stdout, "isTTY", {
          value: stdout,
          configurable: true,
        });
      }

      expect(vi.mocked(clack.confirm)).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("two stack deploys"),
        })
      );
      expect(events).toEqual([]);
      expect(rule?.Actions).toEqual(LEGACY(BUCKET));
    });

    it("--yes skips that confirmation", async () => {
      rule = { Recipients: ["in.example.com"], Actions: LEGACY(BUCKET) };
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(legacyMetadata());
      const clack = await import("@clack/prompts");

      await inboundAdd({
        domain: "example.com",
        subdomain: "support",
        yes: true,
      });

      expect(vi.mocked(clack.confirm)).not.toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("two stack deploys"),
        })
      );
      expect(events).toContain("sync:ses-lambda-action");
    });

    it("--json switch failure goes through the JSON error envelope, exits 1 and keeps the add's save", async () => {
      rule = { Recipients: ["in.example.com"], Actions: LEGACY(BUCKET) };
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(legacyMetadata());
      const seam = await import("../../../utils/email/email-stack-deploy.js");
      vi.mocked(seam.deployHooks.deploy).mockRejectedValueOnce(
        new Error("stack locked")
      );
      const telemetry = await import("../../../telemetry/events.js");
      const trackSpy = vi.spyOn(telemetry, "trackError");
      setJsonMode(true);

      await expect(
        inboundAdd({ domain: "example.com", subdomain: "support", yes: true })
      ).rejects.toThrow("process.exit(1)");

      const out = jsonOutput("email.inbound.add");
      expect(out?.success).toBe(false);
      expect(out?.error.code).toBe("INBOUND_TRIGGER_SWITCH_FAILED");
      expect(out?.error.message).toContain("step 1");
      expect(out?.error.suggestion).toContain(
        "wraps email upgrade --action redeploy"
      );
      expect(saved.map((x) => x.inboundDomains?.length)).toEqual([2]);
      expect(trackSpy).toHaveBeenCalledWith(
        "INBOUND_TRIGGER_SWITCH_FAILED",
        "email.inbound.add",
        { step: "1" }
      );
    });

    it("--preview with a stray value names --preview, before any AWS call", async () => {
      const aws = await import("../../../utils/shared/aws.js");
      await expect(
        inboundAdd({ preview: true, unexpectedArg: "now" })
      ).rejects.toMatchObject({
        code: "INVALID_FLAG_USAGE",
        suggestion: expect.stringContaining("--preview takes no value"),
      });
      expect(aws.validateAWSCredentials).not.toHaveBeenCalled();
    });
  });

  describe("inbound status", () => {
    it("puts the trigger and the mismatch flags in --json", async () => {
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(legacyMetadata());
      const check = await import(
        "../../../utils/email/inbound-trigger-check.js"
      );
      vi.mocked(check.checkInboundTrigger).mockResolvedValue({
        savedTrigger: "s3-notification",
        ruleTrigger: "ses-lambda-action",
        ruleEnabled: true,
        activeRuleSet: "wraps-inbound-rules",
        activeRuleSetReadable: true,
        ruleSetInactive: false,
        sesInvokePermission: true,
        bucketPolicyCoversMail: true,
        mismatches: ["rule-differs-from-saved"],
        warnings: ["The receipt rule uses the ses-lambda-action trigger..."],
      });
      setJsonMode(true);

      await inboundStatus({});

      const data = jsonOutput("email.inbound.status")?.data;
      expect(data.trigger).toBe("s3-notification");
      expect(data.activeRuleSet).toBe("wraps-inbound-rules");
      expect(data.triggerCheck).toEqual({
        repairCommand: REPAIR,
        ruleSetInactive: false,
        ruleEnabled: true,
        ruleTrigger: "ses-lambda-action",
        sesInvokePermission: true,
        bucketPolicyCoversMail: true,
        mismatches: ["rule-differs-from-saved"],
        warnings: ["The receipt rule uses the ses-lambda-action trigger..."],
      });
      expect(vi.mocked(check.checkInboundTrigger)).toHaveBeenCalledWith({
        region: "us-east-1",
        bucketName: BUCKET,
        savedTrigger: "s3-notification",
        repairCommand: REPAIR,
        activeRuleSetRead: { readable: true, name: "wraps-inbound-rules" },
      });
    });

    it("shows the mode and warns on a mismatch", async () => {
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());
      const check = await import(
        "../../../utils/email/inbound-trigger-check.js"
      );
      vi.mocked(check.checkInboundTrigger).mockResolvedValue({
        savedTrigger: "ses-lambda-action",
        ruleTrigger: "ses-lambda-action",
        ruleEnabled: true,
        activeRuleSet: "wraps-inbound-rules",
        activeRuleSetReadable: true,
        ruleSetInactive: false,
        sesInvokePermission: false,
        bucketPolicyCoversMail: true,
        mismatches: ["ses-invoke-permission-missing"],
        warnings: ["The processor has no wraps-inbound-ses-invoke permission"],
      });
      const clack = await import("@clack/prompts");

      await inboundStatus({});

      const printed = vi
        .mocked(console.log)
        .mock.calls.map((c) => String(c[0]))
        .join("\n");
      expect(printed).toContain("SES Lambda action");
      expect(vi.mocked(clack.log.warn)).toHaveBeenCalledWith(
        "The processor has no wraps-inbound-ses-invoke permission"
      );
    });
  });

  describe("inbound status DLQ depth (plan 044)", () => {
    const QUEUE_URL =
      "https://sqs.us-east-1.amazonaws.com/123456789012/wraps-inbound-events-dlq";

    async function arrange() {
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());
      const check = await import(
        "../../../utils/email/inbound-trigger-check.js"
      );
      vi.mocked(check.checkInboundTrigger).mockResolvedValue({
        savedTrigger: "ses-lambda-action",
        ruleTrigger: "ses-lambda-action",
        ruleEnabled: true,
        activeRuleSet: "wraps-inbound-rules",
        activeRuleSetReadable: true,
        ruleSetInactive: false,
        sesInvokePermission: true,
        bucketPolicyCoversMail: true,
        mismatches: [],
        warnings: [],
      });
    }

    function stubDepth(depth: string) {
      sqsBackstop.reset();
      sqsBackstop.on(GetQueueUrlCommand).resolves({ QueueUrl: QUEUE_URL });
      sqsBackstop.on(GetQueueAttributesCommand).resolves({
        Attributes: { ApproximateNumberOfMessages: depth },
      });
    }

    it("shows the depth and the reprocess hint when it is non-zero", async () => {
      await arrange();
      stubDepth("3");
      const clack = await import("@clack/prompts");

      await inboundStatus({});

      const printed = vi
        .mocked(console.log)
        .mock.calls.map((c) => String(c[0]))
        .join("\n");
      expect(printed).toContain("Dead-letter queue:");
      expect(printed).toContain("3 messages");
      expect(vi.mocked(clack.log.warn)).toHaveBeenCalledWith(
        expect.stringContaining("wraps email inbound reprocess")
      );
      expect(
        sqsBackstop.commandCalls(GetQueueAttributesCommand)[0].args[0].input
      ).toEqual({
        QueueUrl: QUEUE_URL,
        AttributeNames: ["ApproximateNumberOfMessages"],
      });
    });

    it("says empty and gives no hint at depth zero", async () => {
      await arrange();
      stubDepth("0");
      const clack = await import("@clack/prompts");

      await inboundStatus({});

      const printed = vi
        .mocked(console.log)
        .mock.calls.map((c) => String(c[0]))
        .join("\n");
      expect(printed).toContain("empty");
      expect(vi.mocked(clack.log.warn)).not.toHaveBeenCalledWith(
        expect.stringContaining("reprocess")
      );
    });

    it("puts the depth in --json, and null when the queue can't be read", async () => {
      await arrange();
      stubDepth("2");
      setJsonMode(true);
      await inboundStatus({});
      expect(jsonOutput("email.inbound.status")?.data.dlq).toEqual({
        name: "wraps-inbound-events-dlq",
        depth: 2,
        reprocessCommand: "wraps email inbound reprocess",
      });

      vi.mocked(console.log).mockClear();
      sqsBackstop.reset();
      sqsBackstop
        .on(GetQueueUrlCommand)
        .rejects(new Error("AccessDenied: sqs:GetQueueUrl"));
      await inboundStatus({});
      const dlq = jsonOutput("email.inbound.status")?.data.dlq;
      expect(dlq.depth).toBeNull();
      expect(dlq.error).toBe("unreadable");
    });

    it("tells a missing queue from an access denial, in text and in --json", async () => {
      await arrange();
      sqsBackstop.reset();
      sqsBackstop
        .on(GetQueueUrlCommand)
        .rejects(
          Object.assign(new Error("nope"), { name: "QueueDoesNotExist" })
        );
      await inboundStatus({});
      let printed = vi
        .mocked(console.log)
        .mock.calls.map((c) => String(c[0]))
        .join("\n");
      expect(printed).toContain("not found");

      vi.mocked(console.log).mockClear();
      sqsBackstop.reset();
      sqsBackstop
        .on(GetQueueUrlCommand)
        .rejects(Object.assign(new Error("no"), { name: "AccessDenied" }));
      await inboundStatus({});
      printed = vi
        .mocked(console.log)
        .mock.calls.map((c) => String(c[0]))
        .join("\n");
      expect(printed).toContain("access denied");

      vi.mocked(console.log).mockClear();
      setJsonMode(true);
      await inboundStatus({});
      expect(jsonOutput("email.inbound.status")?.data.dlq.error).toBe(
        "access-denied"
      );
    });
  });

  describe("inbound status with another active rule set (review 1 finding 1)", () => {
    it("names the active set, flags it in --json, and offers no command that would activate wraps-inbound-rules", async () => {
      rule = { Recipients: ["in.example.com"], Actions: NEW_ACTIONS };
      (rule as { Enabled?: boolean }).Enabled = true;
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());
      const rules = await import("../../../utils/email/receipt-rules.js");
      vi.mocked(rules.readActiveReceiptRuleSet).mockResolvedValueOnce({
        readable: true,
        name: "customer-rules",
      });
      const check = await import(
        "../../../utils/email/inbound-trigger-check.js"
      );
      const actualCheck = await vi.importActual<
        typeof import("../../../utils/email/inbound-trigger-check.js")
      >("../../../utils/email/inbound-trigger-check.js");
      vi.mocked(check.checkInboundTrigger).mockImplementationOnce(
        actualCheck.checkInboundTrigger
      );
      lambdaBackstop.reset();
      s3Backstop.reset();
      lambdaBackstop.onAnyCommand().resolves({
        Policy: JSON.stringify({
          Statement: [
            {
              Sid: "wraps-inbound-ses-invoke",
              Principal: { Service: "ses.amazonaws.com" },
              Action: "lambda:InvokeFunction",
            },
          ],
        }),
      });
      s3Backstop.onAnyCommand().resolves({
        Policy: JSON.stringify({
          Statement: [
            {
              Sid: "AllowSESPut",
              Effect: "Allow",
              Principal: { Service: "ses.amazonaws.com" },
              Action: "s3:PutObject",
              Resource: [
                `arn:aws:s3:::${BUCKET}/raw/*`,
                `arn:aws:s3:::${BUCKET}/mail/*`,
              ],
            },
          ],
        }),
      });
      setJsonMode(true);

      await inboundStatus({});

      const data = jsonOutput("email.inbound.status")?.data;
      expect(data.activeRuleSet).toBe("customer-rules");
      expect(data.receiptRuleSetActive).toBe(false);
      expect(data.triggerCheck.ruleSetInactive).toBe(true);
      expect(data.triggerCheck.mismatches).toEqual(["rule-set-inactive"]);
      const text = JSON.stringify(data);
      expect(text).toContain("customer-rules");
      expect(text).not.toMatch(/inbound init --/);
      expect(text).not.toMatch(/Run `wraps email inbound/);
    });
  });

  describe("inbound destroy", () => {
    it("clears inbound.trigger with the rest of the inbound config", async () => {
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());

      await inboundDestroy({ force: true });

      expect(saved.at(-1)?.inbound).toBeUndefined();
      expect(saved.at(-1)?.trigger).toBeUndefined();
    });
  });

  describe("plan 048: rule-set activation consent", () => {
    const CUSTOMER = { readable: true, name: "customer-rules" } as const;
    const UNREADABLE = { readable: false, error: "AccessDenied" } as const;
    const NO_REPLACEMENT = { readable: true, name: null } as const;

    async function withTTY<T>(fn: () => Promise<T>): Promise<T> {
      const stdin = process.stdin.isTTY;
      const stdout = process.stdout.isTTY;
      Object.defineProperty(process.stdin, "isTTY", {
        value: true,
        configurable: true,
      });
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        configurable: true,
      });
      try {
        return await fn();
      } finally {
        Object.defineProperty(process.stdin, "isTTY", {
          value: stdin,
          configurable: true,
        });
        Object.defineProperty(process.stdout, "isTTY", {
          value: stdout,
          configurable: true,
        });
      }
    }

    async function setActiveRead(read: unknown) {
      const rules = await import("../../../utils/email/receipt-rules.js");
      vi.mocked(rules.readActiveReceiptRuleSet).mockResolvedValue(
        read as never
      );
      return rules;
    }

    async function freshInitMetadata() {
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(
        cloneMetadata((m) => {
          (m.services.email.config as { inbound?: unknown }).inbound =
            undefined;
          (
            m.services.email.config as { inboundDomains?: unknown }
          ).inboundDomains = undefined;
        })
      );
    }

    async function addMetadata() {
      const { loadConnectionMetadata } = await import(
        "../../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());
    }

    function consentPrompt() {
      return expect.objectContaining({
        message: expect.stringContaining("rules stop applying"),
        initialValue: false,
      });
    }

    afterEach(async () => {
      // Back to the file default (ours active) for the tests that follow.
      await setActiveRead({ readable: true, name: "wraps-inbound-rules" });
    });

    describe("inbound init", () => {
      it("interactive, another set active: asks (default No) naming the set; yes activates over that set", async () => {
        await freshInitMetadata();
        const rules = await setActiveRead(CUSTOMER);
        const clack = await import("@clack/prompts");

        await withTTY(() =>
          inboundInit({ domain: "example.com", subdomain: "in" })
        );

        expect(vi.mocked(clack.confirm)).toHaveBeenCalledWith(consentPrompt());
        expect(vi.mocked(clack.confirm)).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining("customer-rules"),
          })
        );
        expect(rules.setActiveReceiptRuleSet).toHaveBeenCalledWith(
          "us-east-1",
          "wraps-inbound-rules",
          CUSTOMER
        );
        expect(events[0]).toBe("command-up");
      });

      it("interactive, another set active: no exits before any deploy, rule write or save", async () => {
        await freshInitMetadata();
        const rules = await setActiveRead(CUSTOMER);
        const clack = await import("@clack/prompts");
        // Every other prompt says yes; the deactivation prompt says no.
        vi.mocked(clack.confirm).mockImplementation(
          async (opts: { message: string }) =>
            !opts.message.includes("rules stop applying")
        );

        await expect(
          withTTY(() => inboundInit({ domain: "example.com", subdomain: "in" }))
        ).rejects.toThrow("process.exit(0)");

        expect(vi.mocked(clack.confirm)).toHaveBeenLastCalledWith(
          consentPrompt()
        );
        expect(events).toEqual([]);
        expect(rules.createReceiptRule).not.toHaveBeenCalled();
        expect(rules.setActiveReceiptRuleSet).not.toHaveBeenCalled();
        vi.mocked(clack.confirm).mockReset();
        vi.mocked(clack.confirm).mockResolvedValue(true);
      });

      it("--yes with another set active refuses: no deploy, no rule call, no metadata save", async () => {
        await freshInitMetadata();
        const rules = await setActiveRead(CUSTOMER);
        const pulumi = await import("@pulumi/pulumi");

        await expect(
          inboundInit({ domain: "example.com", subdomain: "in", yes: true })
        ).rejects.toMatchObject({
          code: "RECEIPT_RULE_SET_CONFLICT",
          message: expect.stringContaining("customer-rules"),
          suggestion: expect.stringContaining("--replace-active-rule-set"),
        });

        expect(events).toEqual([]);
        expect(
          pulumi.automation.LocalWorkspace.createOrSelectStack
        ).not.toHaveBeenCalled();
        expect(rules.createReceiptRuleSet).not.toHaveBeenCalled();
        expect(rules.createReceiptRule).not.toHaveBeenCalled();
        expect(rules.setActiveReceiptRuleSet).not.toHaveBeenCalled();
      });

      it("--yes --replace-active-rule-set proceeds and passes the consented set to the activation", async () => {
        await freshInitMetadata();
        const rules = await setActiveRead(CUSTOMER);
        const clack = await import("@clack/prompts");

        await inboundInit({
          domain: "example.com",
          subdomain: "in",
          yes: true,
          replaceActiveRuleSet: true,
        });

        expect(vi.mocked(clack.confirm)).not.toHaveBeenCalled();
        expect(rules.setActiveReceiptRuleSet).toHaveBeenCalledWith(
          "us-east-1",
          "wraps-inbound-rules",
          CUSTOMER
        );
      });

      // Init's deploy confirmation already needs --yes in JSON mode, so
      // --json --yes is the only JSON run that reaches the guard.
      it("--json --yes refuses without the flag and proceeds with it", async () => {
        await freshInitMetadata();
        const rules = await setActiveRead(CUSTOMER);
        setJsonMode(true);

        await expect(
          inboundInit({
            domain: "example.com",
            subdomain: "in",
            json: true,
            yes: true,
          })
        ).rejects.toMatchObject({ code: "RECEIPT_RULE_SET_CONFLICT" });
        expect(events).toEqual([]);

        await inboundInit({
          domain: "example.com",
          subdomain: "in",
          json: true,
          yes: true,
          replaceActiveRuleSet: true,
        });
        expect(rules.setActiveReceiptRuleSet).toHaveBeenCalledWith(
          "us-east-1",
          "wraps-inbound-rules",
          CUSTOMER
        );
        expect(jsonOutput("email.inbound.init")?.success).toBe(true);
      });

      it("an unreadable active set (AccessDenied) is treated like another set: --yes refuses, interactive asks", async () => {
        await freshInitMetadata();
        const rules = await setActiveRead(UNREADABLE);
        const clack = await import("@clack/prompts");

        await expect(
          inboundInit({ domain: "example.com", subdomain: "in", yes: true })
        ).rejects.toMatchObject({
          code: "RECEIPT_RULE_SET_CONFLICT",
          message: expect.stringContaining("AccessDenied"),
        });
        expect(events).toEqual([]);

        await withTTY(() =>
          inboundInit({ domain: "example.com", subdomain: "in" })
        );
        expect(vi.mocked(clack.confirm)).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining(
              "Could not read the active receipt rule set in us-east-1 (AccessDenied)"
            ),
            initialValue: false,
          })
        );
        expect(rules.setActiveReceiptRuleSet).toHaveBeenCalledWith(
          "us-east-1",
          "wraps-inbound-rules",
          UNREADABLE
        );
      });

      it("--preview names the set applying would deactivate, without asking or refusing", async () => {
        await freshInitMetadata();
        await setActiveRead(CUSTOMER);
        const clack = await import("@clack/prompts");
        const { previewWithResourceChanges } = await import(
          "../../../utils/shared/pulumi.js"
        );
        vi.mocked(previewWithResourceChanges).mockResolvedValueOnce({
          changeSummary: {},
          resourceChanges: [],
        } as never);

        await inboundInit({
          domain: "example.com",
          subdomain: "in",
          preview: true,
          yes: true,
        });

        expect(vi.mocked(clack.log.warn)).toHaveBeenCalledWith(
          expect.stringContaining(
            "would deactivate the active receipt rule set customer-rules"
          )
        );
        expect(vi.mocked(clack.confirm)).not.toHaveBeenCalled();
        expect(events).toEqual([]);
      });

      it("the active set changing after consent: the activation refuses, after the deploy and 14b save, before the final save and any switch", async () => {
        await freshInitMetadata();
        const rules = await setActiveRead(CUSTOMER);
        const { errors } = await import("../../../utils/shared/errors.js");
        vi.mocked(rules.setActiveReceiptRuleSet).mockRejectedValueOnce(
          errors.receiptRuleSetConflict({
            region: "us-east-1",
            active: { readable: true, name: "other-rules" },
            changedSincePreflight: true,
          })
        );

        await expect(
          inboundInit({
            domain: "example.com",
            subdomain: "in",
            yes: true,
            replaceActiveRuleSet: true,
          })
        ).rejects.toMatchObject({
          code: "RECEIPT_RULE_SET_CONFLICT",
          message: expect.stringContaining("not the set you agreed to replace"),
        });

        expect(rules.setActiveReceiptRuleSet).toHaveBeenCalledWith(
          "us-east-1",
          "wraps-inbound-rules",
          CUSTOMER
        );
        expect(events).toEqual([
          "command-up",
          "save:ses-lambda-action",
          "rule-write:ses-lambda-action",
        ]);
      });

      it("no set active: unchanged, activates without asking", async () => {
        await freshInitMetadata();
        const rules = await setActiveRead(NO_REPLACEMENT);
        const clack = await import("@clack/prompts");

        await inboundInit({
          domain: "example.com",
          subdomain: "in",
          yes: true,
        });

        expect(vi.mocked(clack.confirm)).not.toHaveBeenCalled();
        expect(rules.setActiveReceiptRuleSet).toHaveBeenCalledWith(
          "us-east-1",
          "wraps-inbound-rules",
          NO_REPLACEMENT
        );
      });

      it("ours already active: unchanged, no prompt", async () => {
        await freshInitMetadata();
        const ours = { readable: true, name: "wraps-inbound-rules" };
        const rules = await setActiveRead(ours);
        const clack = await import("@clack/prompts");

        await withTTY(() =>
          inboundInit({ domain: "example.com", subdomain: "in" })
        );

        expect(vi.mocked(clack.confirm)).not.toHaveBeenCalledWith(
          consentPrompt()
        );
        expect(rules.setActiveReceiptRuleSet).toHaveBeenCalledWith(
          "us-east-1",
          "wraps-inbound-rules",
          ours
        );
      });
    });

    describe("inbound add", () => {
      it("rule missing, another set active, --yes: refuses before the rule write, DNS or save", async () => {
        rule = null;
        await addMetadata();
        const rules = await setActiveRead(CUSTOMER);

        await expect(
          inboundAdd({ domain: "example.com", subdomain: "support", yes: true })
        ).rejects.toMatchObject({
          code: "RECEIPT_RULE_SET_CONFLICT",
          message: expect.stringContaining("customer-rules"),
        });

        expect(rules.addDomainToReceiptRule).not.toHaveBeenCalled();
        expect(events).toEqual([]);
      });

      it("rule missing, --yes --replace-active-rule-set: the rule write gets the consented set", async () => {
        rule = null;
        await addMetadata();
        const rules = await setActiveRead(CUSTOMER);

        await inboundAdd({
          domain: "example.com",
          subdomain: "support",
          yes: true,
          replaceActiveRuleSet: true,
        });

        expect(rules.addDomainToReceiptRule).toHaveBeenCalledWith(
          "us-east-1",
          "123456789012",
          "support.example.com",
          BUCKET,
          "ses-lambda-action",
          CUSTOMER
        );
      });

      it("rule missing, --json: refuses without the flag", async () => {
        rule = null;
        await addMetadata();
        const rules = await setActiveRead(UNREADABLE);
        setJsonMode(true);

        await expect(
          inboundAdd({
            domain: "example.com",
            subdomain: "support",
            json: true,
          })
        ).rejects.toMatchObject({
          code: "RECEIPT_RULE_SET_CONFLICT",
          message: expect.stringContaining("AccessDenied"),
        });
        expect(rules.addDomainToReceiptRule).not.toHaveBeenCalled();
      });

      it("rule missing, interactive: no exits before any write", async () => {
        rule = null;
        await addMetadata();
        const rules = await setActiveRead(CUSTOMER);
        const clack = await import("@clack/prompts");
        vi.mocked(clack.confirm).mockResolvedValueOnce(false);

        await expect(
          withTTY(() =>
            inboundAdd({ domain: "example.com", subdomain: "support" })
          )
        ).rejects.toThrow("process.exit(0)");

        expect(vi.mocked(clack.confirm)).toHaveBeenCalledWith(consentPrompt());
        expect(rules.addDomainToReceiptRule).not.toHaveBeenCalled();
        expect(events).toEqual([]);
      });

      it("rule in place: nothing is activated, so no read, no prompt, and the write may replace no set", async () => {
        rule = { Recipients: ["in.example.com"], Actions: NEW_ACTIONS };
        await addMetadata();
        const rules = await setActiveRead(CUSTOMER);

        await inboundAdd({
          domain: "example.com",
          subdomain: "support",
          yes: true,
        });

        expect(rules.readActiveReceiptRuleSet).not.toHaveBeenCalled();
        expect(rules.addDomainToReceiptRule).toHaveBeenCalledWith(
          "us-east-1",
          "123456789012",
          "support.example.com",
          BUCKET,
          "ses-lambda-action",
          NO_REPLACEMENT
        );
      });

      it("--preview --json reports wouldDeactivateRuleSet", async () => {
        rule = null;
        await addMetadata();
        await setActiveRead(CUSTOMER);
        setJsonMode(true);

        await inboundAdd({
          domain: "example.com",
          subdomain: "support",
          preview: true,
          json: true,
        });

        const data = jsonOutput("email.inbound.add")?.data;
        expect(data.wouldDeactivateRuleSet).toBe("customer-rules");
        expect(data.activeRuleSetUnreadable).toBeNull();
        expect(events).toEqual([]);
      });
    });
  });
});
