import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import {
  DescribeActiveReceiptRuleSetCommand,
  SESClient,
} from "@aws-sdk/client-ses";
import {
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import { encodeReplyToken } from "@wraps/core";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../utils/shared/json-output.js";
import {
  deployHooks,
  replyDecode,
  replyDestroy,
  replyInit,
} from "../email/reply.js";

const ssmMock = mockClient(SSMClient);
// Backstop for receipt-rule calls the tests let through to the real module.
const sesMock = mockClient(SESClient);

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

// Mock telemetry
vi.mock("../../telemetry/events.js", () => ({
  trackCommand: vi.fn(),
  trackError: vi.fn(),
}));

// Mock AWS credentials
vi.mock("../../utils/shared/aws.js", () => ({
  getAWSRegion: vi.fn().mockResolvedValue("us-east-1"),
  validateAWSCredentials: vi.fn().mockResolvedValue({
    accountId: "123456789012",
    userId: "AIDATEST",
    arn: "arn:aws:iam::123456789012:user/test",
  }),
}));

// Mock Pulumi install check
vi.mock("../../utils/shared/pulumi.js", () => ({
  ensurePulumiInstalled: vi.fn().mockResolvedValue(undefined),
  // Only reply init --preview reaches it (plan 048 preview test).
  previewWithResourceChanges: vi
    .fn()
    .mockResolvedValue({ changeSummary: {}, resourceChanges: [] }),
  withLockRetry: vi
    .fn()
    .mockImplementation(async (fn: () => Promise<unknown>) => fn()),
}));

// reply init --preview builds a Pulumi stack; never a real workspace.
vi.mock("@pulumi/pulumi", () => ({
  automation: {
    LocalWorkspace: {
      createOrSelectStack: vi.fn().mockResolvedValue({
        setConfig: vi.fn().mockResolvedValue(undefined),
      }),
    },
  },
}));
vi.mock("../../utils/shared/fs.js", () => ({
  ensurePulumiWorkDir: vi.fn().mockResolvedValue(undefined),
  getPulumiWorkDir: vi.fn().mockReturnValue("/tmp/wraps-test/pulumi"),
}));

// Mock metadata
vi.mock("../../utils/shared/metadata.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../utils/shared/metadata.js")>();
  return {
    ...actual,
    loadConnectionMetadata: vi.fn(),
    saveConnectionMetadata: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock receipt rule helpers
vi.mock("../../utils/email/receipt-rules.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../utils/email/receipt-rules.js")>();
  return {
    ...actual,
    addDomainToReceiptRule: vi.fn().mockResolvedValue(undefined),
    removeDomainFromReceiptRule: vi.fn().mockResolvedValue(undefined),
    getReceiptRuleDomains: vi.fn().mockResolvedValue([]),
    // Plan 041 exports that call SES: never reached by reply, mocked so a
    // future path can't fall through to the real client.
    describeInboundReceiptRule: vi.fn().mockResolvedValue(null),
    syncReceiptRuleTrigger: vi.fn().mockResolvedValue(undefined),
    createReceiptRule: vi.fn().mockResolvedValue(undefined),
    // Plan 048 preflight: the rule is missing (default above), so replyInit
    // reads the active set; ours active means nothing to ask.
    readActiveReceiptRuleSet: vi
      .fn()
      .mockResolvedValue({ readable: true, name: "wraps-inbound-rules" }),
  };
});

// Mock DNS detection/creation so init doesn't touch the network
vi.mock("../../utils/dns/index.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../utils/dns/index.js")
  >("../../utils/dns/index.js");
  // Dynamic so these resolve to the mocked/real modules exactly as
  // production code sees them (every other vi.mock in this file is already
  // registered by the time this factory body runs, lazily, on first import).
  const clackPrompts = await import("@clack/prompts");
  const { errors } = await import("../../utils/shared/errors.js");
  const { isJsonMode } = await import("../../utils/shared/json-output.js");

  const checkInboundDNSPreflight = vi.fn().mockResolvedValue({
    checked: false,
    existingMx: [],
    existingSpf: [],
    alreadyPointsAtSes: false,
  });

  // Mirrors production `guardInboundDNSWrite` (utils/dns/inbound-preflight.ts)
  // against THIS file's own `checkInboundDNSPreflight` mock — see the same
  // helper in inbound.test.ts for why a plain object-spread mock can't just
  // reuse the real `guardInboundDNSWrite`.
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
    deleteEmailDNSRecordsForProvider: vi.fn().mockResolvedValue({
      deleted: [],
      skipped: [],
      supported: true,
      errors: [],
    }),
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
    describeInboundDNSConflict: actual.describeInboundDNSConflict,
    guardInboundDNSWrite,
  };
});

const baseMetadata = {
  version: "1.0.0",
  accountId: "123456789012",
  region: "us-east-1",
  provider: "other" as const,
  timestamp: "2024-01-01T00:00:00.000Z",
  services: {
    email: {
      config: {
        domain: "foo.com",
        inbound: {
          enabled: true,
          subdomain: "support",
          receivingDomain: "support.foo.com",
          bucketName: "wraps-inbound-123456789012-us-east-1",
        },
        inboundDomains: [
          {
            subdomain: "support",
            receivingDomain: "support.foo.com",
            parentDomain: "support.foo.com",
            addedAt: "2024-01-01T00:00:00.000Z",
          },
        ],
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

describe("replyDecode", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("decodes a real signed reply address into JSON without AWS calls", async () => {
    const secret = randomBytes(32);
    const convIdHex = "0102030405060708";
    const sendIdHex = "1112131415161718";
    const convId = Buffer.from(convIdHex, "hex");
    const sendId = Buffer.from(sendIdHex, "hex");
    const exp = Math.floor(Date.now() / 1000) + 3600;

    const token = encodeReplyToken({
      kid: 7,
      convId,
      sendId,
      exp,
      secret,
    });
    const address = `${token}@r.mail.foo.com`;

    await replyDecode(address);

    // Find the JSON output among console.log calls
    const jsonCall = consoleLogSpy.mock.calls.find((call) => {
      try {
        const parsed = JSON.parse(call[0] as string);
        return parsed.sendingDomain === "foo.com";
      } catch {
        return false;
      }
    });
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(jsonCall![0] as string);
    expect(parsed.sendingDomain).toBe("foo.com");
    expect(parsed.version).toBe(1);
    expect(parsed.kid).toBe(7);
    expect(parsed.convId).toBe(convIdHex);
    expect(parsed.sendId).toBe(sendIdHex);
    expect(parsed.exp).toBe(exp);
    expect(typeof parsed.hmacHex).toBe("string");
    expect(parsed.hmacHex.length).toBe(32); // 16 bytes hex
  });
});

describe("replyInit", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    ssmMock.reset();
    vi.clearAllMocks();
    setJsonMode(false);
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => {}) as never);
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Replace the Pulumi deploy hook with a no-op spy so tests don't spin up
    // a real workspace.
    deployHooks.deploy = vi.fn().mockResolvedValue(undefined);

    // Default SSM responses for reply-init success path
    ssmMock.on(GetParameterCommand).callsFake((input) => ({
      Parameter: {
        ARN: `arn:aws:ssm:us-east-1:123456789012:parameter${input.Name}`,
        Name: input.Name,
        Value: JSON.stringify({ kid: 1, current: "AAAA" }),
      },
    }));
    ssmMock.on(PutParameterCommand).resolves({ Version: 2 });
  });

  it("refuses when target domain is not configured for inbound", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());

    await expect(
      replyInit({ domain: "not-inbound.foo.com" })
    ).rejects.toMatchObject({
      code: "REPLY_INBOUND_DOMAIN_NOT_FOUND",
      suggestion: expect.stringContaining(
        "wraps email inbound add not-inbound.foo.com"
      ),
    });
    // Sanity: we didn't try to deploy
    expect(deployHooks.deploy).not.toHaveBeenCalled();
  });

  it("refuses when reply threading is already enabled for that domain", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    const meta = cloneMetadata((m) => {
      // biome-ignore lint/suspicious/noExplicitAny: test mutation on typed metadata
      (m.services.email.config as any).replyThreading = {
        enabled: true,
        domains: [
          {
            domain: "support.foo.com",
            parameterArn:
              "arn:aws:ssm:us-east-1:123456789012:parameter/wraps/email/reply-secret/support.foo.com",
            parameterName: "/wraps/email/reply-secret/support.foo.com",
            currentKid: 1,
            createdAt: "2024-01-02T00:00:00.000Z",
          },
        ],
      };
    });
    vi.mocked(loadConnectionMetadata).mockResolvedValue(meta);

    await expect(
      replyInit({ domain: "support.foo.com" })
    ).rejects.toMatchObject({
      code: "REPLY_ALREADY_ENABLED",
      suggestion: expect.stringContaining(
        "wraps email reply rotate --domain support.foo.com"
      ),
    });

    expect(deployHooks.deploy).not.toHaveBeenCalled();
  });

  it("--all enables every inbound domain and skips those already enabled", async () => {
    const { loadConnectionMetadata, saveConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    const meta = cloneMetadata((m) => {
      m.services.email.config.inboundDomains = [
        {
          subdomain: "support",
          receivingDomain: "support.foo.com",
          parentDomain: "support.foo.com",
          addedAt: "2024-01-01T00:00:00.000Z",
        },
        {
          subdomain: "sales",
          receivingDomain: "sales.foo.com",
          parentDomain: "sales.foo.com",
          addedAt: "2024-01-01T00:00:00.000Z",
        },
      ];
      // biome-ignore lint/suspicious/noExplicitAny: test setup
      (m.services.email.config as any).replyThreading = {
        enabled: true,
        domains: [
          {
            domain: "support.foo.com",
            parameterArn:
              "arn:aws:ssm:us-east-1:123456789012:parameter/wraps/email/reply-secret/support.foo.com",
            parameterName: "/wraps/email/reply-secret/support.foo.com",
            currentKid: 1,
            createdAt: "2024-01-02T00:00:00.000Z",
          },
        ],
      };
    });

    // Each call to loadConnectionMetadata returns a fresh copy so inner loop
    // iterations pick up the evolving metadata.
    vi.mocked(loadConnectionMetadata).mockImplementation(async () =>
      JSON.parse(JSON.stringify(meta))
    );

    await replyInit({ all: true, yes: true });

    // The deploy helper must have been called once: sales.foo.com new, support
    // already enabled.
    expect(deployHooks.deploy).toHaveBeenCalledTimes(1);

    // saveConnectionMetadata invoked at least once for the sales.foo.com entry
    expect(vi.mocked(saveConnectionMetadata)).toHaveBeenCalled();
    // Inspect the last save: it should carry sales.foo.com without an
    // initialSecret lingering.
    const saves = vi.mocked(saveConnectionMetadata).mock.calls;
    const finalSave = saves.at(-1)?.[0];
    expect(finalSave).toBeDefined();
    const finalRt =
      // biome-ignore lint/suspicious/noExplicitAny: dynamic inspection
      (finalSave as any)?.services?.email?.config?.replyThreading;
    expect(finalRt.enabled).toBe(true);
    const salesEntry = finalRt.domains.find(
      // biome-ignore lint/suspicious/noExplicitAny: dynamic inspection
      (d: any) => d.domain === "sales.foo.com"
    );
    expect(salesEntry).toBeDefined();
    expect(salesEntry.initialSecret).toBeUndefined();
  });

  it("noops with a friendly message when --all and everything is already enabled", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    const meta = cloneMetadata((m) => {
      // biome-ignore lint/suspicious/noExplicitAny: test setup
      (m.services.email.config as any).replyThreading = {
        enabled: true,
        domains: [
          {
            domain: "support.foo.com",
            parameterArn:
              "arn:aws:ssm:us-east-1:123456789012:parameter/wraps/email/reply-secret/support.foo.com",
            parameterName: "/wraps/email/reply-secret/support.foo.com",
            currentKid: 1,
            createdAt: "2024-01-02T00:00:00.000Z",
          },
        ],
      };
    });
    vi.mocked(loadConnectionMetadata).mockResolvedValue(meta);

    await replyInit({ all: true });

    expect(deployHooks.deploy).not.toHaveBeenCalled();
  });

  // Keep references to spies so TS doesn't complain about unused locals.
  // Accessed in `beforeEach`; this is a sentinel assertion.
  it("spy setup", () => {
    expect(exitSpy).toBeDefined();
    expect(consoleLogSpy).toBeDefined();
    expect(consoleErrorSpy).toBeDefined();
  });

  it.each([
    ["ses-lambda-action", "ses-lambda-action"],
    [undefined, "s3-notification"],
  ] as const)(
    "registers r.mail.<domain> with the saved trigger mode (saved %s → %s)",
    async (savedTrigger, expected) => {
      const { loadConnectionMetadata } = await import(
        "../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(
        cloneMetadata((m) => {
          if (savedTrigger) {
            // biome-ignore lint/suspicious/noExplicitAny: test setup
            (m.services.email.config.inbound as any).trigger = savedTrigger;
          }
        })
      );
      const { addDomainToReceiptRule } = await import(
        "../../utils/email/receipt-rules.js"
      );

      await replyInit({ domain: "support.foo.com", yes: true });

      expect(vi.mocked(addDomainToReceiptRule)).toHaveBeenCalledWith(
        "us-east-1",
        "123456789012",
        "r.mail.support.foo.com",
        "wraps-inbound-123456789012-us-east-1",
        expected,
        expect.objectContaining({
          expected: { readable: true, name: "wraps-inbound-rules" },
        })
      );
    }
  );

  it("does not print the manual-DNS block for a successful no-op write (success:true, recordsCreated:0)", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    // Give the domain a non-manual dnsProvider on file so the write path
    // (rather than the manual short-circuit) actually runs.
    const meta = cloneMetadata((m) => {
      // biome-ignore lint/suspicious/noExplicitAny: test setup
      (m.services.email as any).dnsProvider = "cloudflare";
    });
    vi.mocked(loadConnectionMetadata).mockResolvedValue(meta);

    const { createInboundDNSRecordsForProvider } = await import(
      "../../utils/dns/index.js"
    );
    vi.mocked(createInboundDNSRecordsForProvider).mockResolvedValueOnce({
      success: true,
      recordsCreated: 0,
      errors: ["add include:amazonses.com to your existing SPF record"],
    });
    const { note, log } = await import("@clack/prompts");

    await replyInit({ domain: "support.foo.com", yes: true });

    expect(vi.mocked(note)).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("DNS Records for r.mail.support.foo.com")
    );
    // 308's behaviour must survive: errors are still warned.
    expect(vi.mocked(log.warn)).toHaveBeenCalledWith(
      "add include:amazonses.com to your existing SPF record"
    );
  });

  describe("plan 048: rule-set activation consent", () => {
    const CUSTOMER = { readable: true, name: "customer-rules" } as const;

    async function setup(read: unknown, ruleMissing = true) {
      const { loadConnectionMetadata } = await import(
        "../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(cloneMetadata());
      const rules = await import("../../utils/email/receipt-rules.js");
      vi.mocked(rules.readActiveReceiptRuleSet).mockResolvedValue(
        read as never
      );
      vi.mocked(rules.describeInboundReceiptRule).mockResolvedValue(
        (ruleMissing
          ? null
          : { Name: "wraps-inbound-catch-all", Recipients: [] }) as never
      );
      return rules;
    }

    afterEach(async () => {
      const rules = await import("../../utils/email/receipt-rules.js");
      vi.mocked(rules.readActiveReceiptRuleSet).mockResolvedValue({
        readable: true,
        name: "wraps-inbound-rules",
      });
      vi.mocked(rules.describeInboundReceiptRule).mockResolvedValue(null);
      vi.mocked(rules.addDomainToReceiptRule).mockReset();
      vi.mocked(rules.addDomainToReceiptRule).mockResolvedValue(null);
      const clack = await import("@clack/prompts");
      vi.mocked(clack.confirm).mockReset();
      vi.mocked(clack.confirm).mockResolvedValue(true);
      sesMock.reset();
    });

    // isInteractive() also needs CI unset; GitHub Actions sets it.
    async function withTTY<T>(fn: () => Promise<T>): Promise<T> {
      const stdin = process.stdin.isTTY;
      const stdout = process.stdout.isTTY;
      const ci = process.env.CI;
      // biome-ignore lint/performance/noDelete: an unset env var, not an empty one
      delete process.env.CI;
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
        if (ci !== undefined) {
          process.env.CI = ci;
        }
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

    function consentPrompt() {
      return expect.objectContaining({
        message: expect.stringContaining("rules stop applying"),
        initialValue: false,
      });
    }

    it("interactive: asks (default No) naming the set; yes proceeds with the consented set", async () => {
      const rules = await setup(CUSTOMER);
      const clack = await import("@clack/prompts");

      await withTTY(() => replyInit({ domain: "support.foo.com" }));

      expect(vi.mocked(clack.confirm)).toHaveBeenCalledWith(consentPrompt());
      expect(vi.mocked(clack.confirm)).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("customer-rules"),
        })
      );
      expect(deployHooks.deploy).toHaveBeenCalledTimes(1);
      expect(rules.addDomainToReceiptRule).toHaveBeenCalledWith(
        "us-east-1",
        "123456789012",
        "r.mail.support.foo.com",
        "wraps-inbound-123456789012-us-east-1",
        "s3-notification",
        expect.objectContaining({ expected: CUSTOMER })
      );
    });

    it("interactive: no exits before any save, deploy or rule call", async () => {
      const rules = await setup(CUSTOMER);
      const clack = await import("@clack/prompts");
      const { saveConnectionMetadata } = await import(
        "../../utils/shared/metadata.js"
      );
      vi.mocked(clack.confirm).mockResolvedValueOnce(false);
      // This file's exit spy doesn't throw; make it, so the run stops there.
      exitSpy.mockImplementationOnce(((code?: number) => {
        throw new Error(`process.exit(${code})`);
      }) as never);

      await expect(
        withTTY(() => replyInit({ domain: "support.foo.com" }))
      ).rejects.toThrow("process.exit(0)");

      expect(vi.mocked(clack.confirm)).toHaveBeenCalledWith(consentPrompt());
      expect(saveConnectionMetadata).not.toHaveBeenCalled();
      expect(deployHooks.deploy).not.toHaveBeenCalled();
      expect(rules.addDomainToReceiptRule).not.toHaveBeenCalled();
    });

    it("--preview names the set applying would deactivate, without asking, saving or deploying", async () => {
      await setup(CUSTOMER);
      const clack = await import("@clack/prompts");
      const { saveConnectionMetadata } = await import(
        "../../utils/shared/metadata.js"
      );

      await replyInit({ domain: "support.foo.com", preview: true });

      expect(vi.mocked(clack.log.warn)).toHaveBeenCalledWith(
        expect.stringContaining(
          "would deactivate the active receipt rule set customer-rules"
        )
      );
      expect(vi.mocked(clack.confirm)).not.toHaveBeenCalled();
      expect(saveConnectionMetadata).not.toHaveBeenCalled();
      expect(deployHooks.deploy).not.toHaveBeenCalled();
    });

    it("the active set changing after consent: refuses after the save and deploy, says what is in place, and gives the init command that asks again", async () => {
      const rules = await setup(CUSTOMER);
      const { loadConnectionMetadata } = await import(
        "../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(
        cloneMetadata((m) => {
          m.services.email.config.inboundDomains = [
            {
              subdomain: "support",
              receivingDomain: "support.foo.com",
              parentDomain: "foo.com",
              addedAt: "2024-01-01T00:00:00.000Z",
            },
          ];
        })
      );
      sesMock
        .on(DescribeActiveReceiptRuleSetCommand)
        .resolves({ Metadata: { Name: "other-rules" } });
      const actual = await vi.importActual<
        typeof import("../../utils/email/receipt-rules.js")
      >("../../utils/email/receipt-rules.js");
      vi.mocked(rules.addDomainToReceiptRule).mockImplementationOnce(
        async (region, _account, _domain, _bucket, _trigger, activation) =>
          actual.setActiveReceiptRuleSet(
            region,
            "wraps-inbound-rules",
            activation
          )
      );

      const error = await replyInit({
        domain: "foo.com",
        yes: true,
        replaceActiveRuleSet: true,
      }).catch(
        (e: unknown) =>
          e as { code: string; message: string; suggestion: string }
      );

      expect(error.code).toBe("RECEIPT_RULE_SET_CONFLICT");
      expect(error.message).toContain(
        "not customer-rules, the set you agreed to replace"
      );
      expect(error.suggestion).toContain(
        "Already in place: reply threading for foo.com is saved and its stack deployed (the signing secret is in SSM), and wraps-inbound-rules and its receipt rule (listing r.mail.foo.com) exist but are inactive; DNS records for r.mail.foo.com were not written."
      );
      expect(error.suggestion).toContain(
        "(it re-deploys the inbound stack):\n  wraps email inbound init --domain foo.com --subdomain support --region us-east-1"
      );
      expect(error.suggestion).toContain(
        "Then add the r.mail.foo.com DNS records"
      );
      expect(error.suggestion).not.toContain("Re-run the command");
      expect(error.suggestion).not.toContain("reply init --all");
      expect(deployHooks.deploy).toHaveBeenCalledTimes(1);
    });

    it("--all: a late refusal on the first domain names the later domains it didn't start and how to finish them", async () => {
      const rules = await setup(CUSTOMER);
      const { loadConnectionMetadata } = await import(
        "../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(
        cloneMetadata((m) => {
          m.services.email.config.inboundDomains = [
            {
              subdomain: "support",
              receivingDomain: "support.foo.com",
              parentDomain: "foo.com",
              addedAt: "2024-01-01T00:00:00.000Z",
            },
            {
              subdomain: "in",
              receivingDomain: "in.bar.com",
              parentDomain: "bar.com",
              addedAt: "2024-01-01T00:00:00.000Z",
            },
          ];
        })
      );
      sesMock
        .on(DescribeActiveReceiptRuleSetCommand)
        .resolves({ Metadata: { Name: "other-rules" } });
      const actual = await vi.importActual<
        typeof import("../../utils/email/receipt-rules.js")
      >("../../utils/email/receipt-rules.js");
      vi.mocked(rules.addDomainToReceiptRule).mockImplementationOnce(
        async (region, _account, _domain, _bucket, _trigger, activation) =>
          actual.setActiveReceiptRuleSet(
            region,
            "wraps-inbound-rules",
            activation
          )
      );

      const error = await replyInit({
        all: true,
        yes: true,
        replaceActiveRuleSet: true,
      }).catch((e: unknown) => e as { code: string; suggestion: string });

      expect(error.code).toBe("RECEIPT_RULE_SET_CONFLICT");
      expect(error.suggestion).toContain(
        "were not written. Reply threading was not started for bar.com."
      );
      expect(error.suggestion).toContain(
        "Then run wraps email reply init --all --region us-east-1 to enable reply threading for bar.com."
      );
      expect(deployHooks.deploy).toHaveBeenCalledTimes(1);
    });

    it("reports the set it deactivated: a warning, and deactivatedRuleSet in --json", async () => {
      const rules = await setup(CUSTOMER);
      vi.mocked(rules.addDomainToReceiptRule).mockResolvedValueOnce(CUSTOMER);
      const clack = await import("@clack/prompts");
      setJsonMode(true);

      await replyInit({
        domain: "support.foo.com",
        yes: true,
        json: true,
        replaceActiveRuleSet: true,
      });

      const line = consoleLogSpy.mock.calls
        .map((c) => c[0])
        .find(
          (arg) =>
            typeof arg === "string" &&
            arg.includes('"command":"email.reply.init"')
        );
      expect(JSON.parse(line as string).data).toMatchObject({
        deactivatedRuleSet: "customer-rules",
        previousRuleSetUnreadable: null,
      });
      expect(vi.mocked(clack.log.warn)).toHaveBeenCalledWith(
        "Deactivated receipt rule set customer-rules."
      );
      setJsonMode(false);
    });

    it("--yes with another set active and the rule missing refuses before any save, deploy or rule call", async () => {
      const rules = await setup(CUSTOMER);
      const { saveConnectionMetadata } = await import(
        "../../utils/shared/metadata.js"
      );

      await expect(
        replyInit({ domain: "support.foo.com", yes: true })
      ).rejects.toMatchObject({
        code: "RECEIPT_RULE_SET_CONFLICT",
        message: expect.stringContaining("customer-rules"),
        suggestion: expect.stringContaining("Nothing was deployed or changed"),
      });

      expect(saveConnectionMetadata).not.toHaveBeenCalled();
      expect(deployHooks.deploy).not.toHaveBeenCalled();
      expect(rules.addDomainToReceiptRule).not.toHaveBeenCalled();
    });

    it("--json refuses the same way; an unreadable set counts as another set", async () => {
      const rules = await setup({ readable: false, error: "AccessDenied" });
      setJsonMode(true);

      await expect(
        replyInit({ domain: "support.foo.com", json: true })
      ).rejects.toMatchObject({
        code: "RECEIPT_RULE_SET_CONFLICT",
        message: expect.stringContaining("AccessDenied"),
      });
      expect(deployHooks.deploy).not.toHaveBeenCalled();
      expect(rules.addDomainToReceiptRule).not.toHaveBeenCalled();
    });

    it("--yes --replace-active-rule-set proceeds and the fallback rule write gets the consented set", async () => {
      const rules = await setup(CUSTOMER);

      await replyInit({
        domain: "support.foo.com",
        yes: true,
        replaceActiveRuleSet: true,
      });

      expect(deployHooks.deploy).toHaveBeenCalledTimes(1);
      expect(rules.addDomainToReceiptRule).toHaveBeenCalledWith(
        "us-east-1",
        "123456789012",
        "r.mail.support.foo.com",
        "wraps-inbound-123456789012-us-east-1",
        "s3-notification",
        expect.objectContaining({ expected: CUSTOMER })
      );
    });

    it("rule in place: no read, no refusal, and the rule write may replace no set", async () => {
      const rules = await setup(CUSTOMER, false);

      await replyInit({ domain: "support.foo.com", yes: true });

      expect(rules.readActiveReceiptRuleSet).not.toHaveBeenCalled();
      expect(rules.addDomainToReceiptRule).toHaveBeenCalledWith(
        "us-east-1",
        "123456789012",
        "r.mail.support.foo.com",
        "wraps-inbound-123456789012-us-east-1",
        "s3-notification",
        expect.objectContaining({ expected: { readable: true, name: null } })
      );
    });
  });
});

describe("replyDestroy", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    ssmMock.reset();
    vi.clearAllMocks();
    setJsonMode(false);
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => {}) as never);
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("spy setup", () => {
    expect(exitSpy).toBeDefined();
    expect(consoleLogSpy).toBeDefined();
    expect(consoleErrorSpy).toBeDefined();
  });

  it("does NOT persist metadata when Pulumi redeploy fails — state stays recoverable", async () => {
    const { loadConnectionMetadata, saveConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    const meta = cloneMetadata((m) => {
      // biome-ignore lint/suspicious/noExplicitAny: test setup
      (m.services.email.config as any).replyThreading = {
        enabled: true,
        domains: [
          {
            domain: "support.foo.com",
            parameterArn:
              "arn:aws:ssm:us-east-1:123456789012:parameter/wraps/email/reply-secret/support.foo.com",
            parameterName: "/wraps/email/reply-secret/support.foo.com",
            currentKid: 1,
            createdAt: "2024-01-02T00:00:00.000Z",
          },
        ],
      };
    });
    vi.mocked(loadConnectionMetadata).mockResolvedValue(meta);

    // Simulate a Pulumi deploy failure.
    deployHooks.deploy = vi
      .fn()
      .mockRejectedValue(new Error("pulumi up failed"));

    await expect(
      replyDestroy({ domain: "support.foo.com", force: true })
    ).rejects.toThrow(/pulumi up failed/);

    // Metadata must NOT have been persisted — otherwise the domain is gone
    // from disk but the SSM parameter still exists, leaving state stuck.
    expect(vi.mocked(saveConnectionMetadata)).not.toHaveBeenCalled();
  });

  it("does NOT mutate SES receipt rule when Pulumi redeploy fails", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    const { removeDomainFromReceiptRule } = await import(
      "../../utils/email/receipt-rules.js"
    );
    const meta = cloneMetadata((m) => {
      // biome-ignore lint/suspicious/noExplicitAny: test setup
      (m.services.email.config as any).replyThreading = {
        enabled: true,
        domains: [
          {
            domain: "support.foo.com",
            parameterArn:
              "arn:aws:ssm:us-east-1:123456789012:parameter/wraps/email/reply-secret/support.foo.com",
            parameterName: "/wraps/email/reply-secret/support.foo.com",
            currentKid: 1,
            createdAt: "2024-01-02T00:00:00.000Z",
          },
          {
            domain: "sales.foo.com",
            parameterArn:
              "arn:aws:ssm:us-east-1:123456789012:parameter/wraps/email/reply-secret/sales.foo.com",
            parameterName: "/wraps/email/reply-secret/sales.foo.com",
            currentKid: 1,
            createdAt: "2024-01-02T00:00:00.000Z",
          },
        ],
      };
    });
    vi.mocked(loadConnectionMetadata).mockResolvedValue(meta);

    deployHooks.deploy = vi
      .fn()
      .mockRejectedValue(new Error("pulumi up failed"));

    await expect(replyDestroy({ all: true, force: true })).rejects.toThrow(
      /pulumi up failed/
    );

    // Receipt rule mutations must only run after Pulumi deploy succeeds.
    // Otherwise, --all with N domains that fails on deploy would commit
    // N real SES receipt-rule changes to an account that's otherwise in
    // its original state.
    expect(vi.mocked(removeDomainFromReceiptRule)).not.toHaveBeenCalled();
  });

  it("persists metadata only after a successful Pulumi redeploy", async () => {
    const { loadConnectionMetadata, saveConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    const meta = cloneMetadata((m) => {
      // biome-ignore lint/suspicious/noExplicitAny: test setup
      (m.services.email.config as any).replyThreading = {
        enabled: true,
        domains: [
          {
            domain: "support.foo.com",
            parameterArn:
              "arn:aws:ssm:us-east-1:123456789012:parameter/wraps/email/reply-secret/support.foo.com",
            parameterName: "/wraps/email/reply-secret/support.foo.com",
            currentKid: 1,
            createdAt: "2024-01-02T00:00:00.000Z",
          },
        ],
      };
    });
    vi.mocked(loadConnectionMetadata).mockResolvedValue(meta);

    const order: string[] = [];
    deployHooks.deploy = vi.fn().mockImplementation(async () => {
      order.push("deploy");
    });
    vi.mocked(saveConnectionMetadata).mockImplementation(async () => {
      order.push("save");
    });

    await replyDestroy({ domain: "support.foo.com", force: true });

    expect(vi.mocked(saveConnectionMetadata)).toHaveBeenCalled();
    expect(order).toEqual(["deploy", "save"]);
  });

  describe("r.mail DNS cleanup", () => {
    function metaWithReplyThreading(
      domains: string[],
      overrides?: (m: typeof baseMetadata) => void
    ): typeof baseMetadata {
      return cloneMetadata((m) => {
        // biome-ignore lint/suspicious/noExplicitAny: test setup
        (m.services.email as any).dnsProvider = "cloudflare";
        // biome-ignore lint/suspicious/noExplicitAny: test setup
        (m.services.email.config as any).replyThreading = {
          enabled: true,
          domains: domains.map((domain) => ({
            domain,
            parameterArn: `arn:aws:ssm:us-east-1:123456789012:parameter/wraps/email/reply-secret/${domain}`,
            parameterName: `/wraps/email/reply-secret/${domain}`,
            currentKid: 1,
            createdAt: "2024-01-02T00:00:00.000Z",
          })),
        };
        overrides?.(m);
      });
    }

    it("deletes r.mail.<domain> via the resolved DNS provider, with the sending domain as parent", async () => {
      const { loadConnectionMetadata } = await import(
        "../../utils/shared/metadata.js"
      );
      const { getDNSCredentials, deleteInboundDNSRecordsForProvider } =
        await import("../../utils/dns/index.js");
      vi.mocked(loadConnectionMetadata).mockResolvedValue(
        metaWithReplyThreading(["support.foo.com"])
      );
      deployHooks.deploy = vi.fn().mockResolvedValue(undefined);

      await replyDestroy({ domain: "support.foo.com", force: true });

      expect(vi.mocked(getDNSCredentials)).toHaveBeenCalledWith(
        "cloudflare",
        "support.foo.com",
        "us-east-1"
      );
      expect(
        vi.mocked(deleteInboundDNSRecordsForProvider)
      ).toHaveBeenCalledWith(
        expect.anything(),
        "r.mail.support.foo.com",
        "us-east-1",
        "support.foo.com"
      );
    });

    it("deletes r.mail records for every domain when --all removes multiple", async () => {
      const { loadConnectionMetadata } = await import(
        "../../utils/shared/metadata.js"
      );
      const { deleteInboundDNSRecordsForProvider } = await import(
        "../../utils/dns/index.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(
        metaWithReplyThreading(["support.foo.com", "sales.foo.com"])
      );
      deployHooks.deploy = vi.fn().mockResolvedValue(undefined);

      await replyDestroy({ all: true, force: true });

      expect(
        vi.mocked(deleteInboundDNSRecordsForProvider)
      ).toHaveBeenCalledWith(
        expect.anything(),
        "r.mail.support.foo.com",
        "us-east-1",
        "support.foo.com"
      );
      expect(
        vi.mocked(deleteInboundDNSRecordsForProvider)
      ).toHaveBeenCalledWith(
        expect.anything(),
        "r.mail.sales.foo.com",
        "us-east-1",
        "sales.foo.com"
      );
      expect(
        vi.mocked(deleteInboundDNSRecordsForProvider)
      ).toHaveBeenCalledTimes(2);
    });

    it("still saves metadata and does not throw when DNS cleanup rejects", async () => {
      const { loadConnectionMetadata, saveConnectionMetadata } = await import(
        "../../utils/shared/metadata.js"
      );
      const { deleteInboundDNSRecordsForProvider } = await import(
        "../../utils/dns/index.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(
        metaWithReplyThreading(["support.foo.com"])
      );
      deployHooks.deploy = vi.fn().mockResolvedValue(undefined);
      vi.mocked(deleteInboundDNSRecordsForProvider).mockRejectedValueOnce(
        new Error("boom")
      );

      await expect(
        replyDestroy({ domain: "support.foo.com", force: true })
      ).resolves.toBeUndefined();

      expect(vi.mocked(saveConnectionMetadata)).toHaveBeenCalled();
    });

    it("never calls deleteInboundDNSRecordsForProvider and still prints the manual reminder when no dnsProvider is on file", async () => {
      const { loadConnectionMetadata } = await import(
        "../../utils/shared/metadata.js"
      );
      const { deleteInboundDNSRecordsForProvider } = await import(
        "../../utils/dns/index.js"
      );
      const meta = cloneMetadata((m) => {
        // No dnsProvider set — biome-ignore lint/suspicious/noExplicitAny: test setup
        (m.services.email.config as any).replyThreading = {
          enabled: true,
          domains: [
            {
              domain: "support.foo.com",
              parameterArn:
                "arn:aws:ssm:us-east-1:123456789012:parameter/wraps/email/reply-secret/support.foo.com",
              parameterName: "/wraps/email/reply-secret/support.foo.com",
              currentKid: 1,
              createdAt: "2024-01-02T00:00:00.000Z",
            },
          ],
        };
      });
      vi.mocked(loadConnectionMetadata).mockResolvedValue(meta);
      deployHooks.deploy = vi.fn().mockResolvedValue(undefined);

      await replyDestroy({ domain: "support.foo.com", force: true });

      expect(
        vi.mocked(deleteInboundDNSRecordsForProvider)
      ).not.toHaveBeenCalled();

      const { log } = await import("@clack/prompts");
      expect(vi.mocked(log.info)).toHaveBeenCalledWith(
        expect.stringContaining("Remove MX/SPF DNS records")
      );
    });

    it("includes dnsDeleted in the --json payload", async () => {
      const { loadConnectionMetadata } = await import(
        "../../utils/shared/metadata.js"
      );
      const { deleteInboundDNSRecordsForProvider } = await import(
        "../../utils/dns/index.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(
        metaWithReplyThreading(["support.foo.com"])
      );
      deployHooks.deploy = vi.fn().mockResolvedValue(undefined);
      vi.mocked(deleteInboundDNSRecordsForProvider).mockResolvedValueOnce({
        deleted: ["MX r.mail.support.foo.com"],
        skipped: [],
        supported: true,
        errors: [],
      });

      setJsonMode(true);
      await replyDestroy({ domain: "support.foo.com", force: true });
      setJsonMode(false);

      const jsonCall = consoleLogSpy.mock.calls
        .map((call) => call[0])
        .find(
          (arg) =>
            typeof arg === "string" && arg.includes("email.reply.destroy")
        );

      expect(jsonCall).toBeDefined();
      const parsed = JSON.parse(jsonCall as string);
      expect(parsed.data.dnsDeleted).toEqual(["MX r.mail.support.foo.com"]);
    });
  });
});
