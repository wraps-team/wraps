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
    setActiveReceiptRuleSet: vi.fn().mockResolvedValue(undefined),
  };
});

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

vi.mock("../../../utils/shared/fs.js", () => ({
  ensurePulumiWorkDir: vi.fn().mockResolvedValue(undefined),
  getPulumiWorkDir: vi.fn().mockReturnValue("/tmp/wraps-test/pulumi"),
}));

import {
  inboundAdd,
  inboundDestroy,
  inboundInit,
  inboundRemove,
} from "../inbound.js";

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
