import { GetEmailIdentityCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyDomain as verify } from "../email/domains.js";

const sesv2Mock = mockClient(SESv2Client);

// Mock DNS resolver
const mockResolverInstance = {
  resolveCname: vi.fn(),
  resolveTxt: vi.fn(),
  setServers: vi.fn(),
};

vi.mock("dns/promises", () => ({
  Resolver: vi.fn(function (this: any) {
    Object.assign(this, mockResolverInstance);
    return this;
  }),
}));

// Mock clack
vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  log: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

// Mock AWS credential/region helpers (verifyDomain loads metadata via
// validateAWSCredentials to look up a pending tracking domain)
vi.mock("../../utils/shared/aws.js", () => ({
  getAWSRegion: vi.fn().mockResolvedValue("us-east-1"),
  validateAWSCredentials: vi.fn().mockResolvedValue({
    accountId: "123456789012",
    arn: "arn:aws:iam::123456789012:user/test",
    userId: "AIDATEST",
  }),
}));

// Mock metadata lookups (no tracking domain configured in these tests)
vi.mock("../../utils/shared/metadata.js", () => ({
  loadConnectionMetadata: vi.fn().mockResolvedValue(null),
  getDomainFromMetadata: vi.fn().mockReturnValue(null),
  addDomainToMetadata: vi.fn(),
  saveConnectionMetadata: vi.fn().mockResolvedValue(undefined),
}));

// Mock DeploymentProgress
vi.mock("../../utils/output.js", () => ({
  DeploymentProgress: vi.fn(function (this: any) {
    this.execute = vi.fn((_msg: any, fn: any) => fn());
    this.stop = vi.fn();
    return this;
  }),
}));

describe("verify command", () => {
  let exitSpy: any;
  let consoleLogSpy: any;

  beforeEach(() => {
    sesv2Mock.reset();
    vi.clearAllMocks();

    // Reset mock resolver methods
    mockResolverInstance.resolveCname.mockReset();
    mockResolverInstance.resolveTxt.mockReset();

    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it("should exit when domain is not found in SES", async () => {
    const notFoundError = new Error("Not found");
    notFoundError.name = "NotFoundException";
    sesv2Mock.on(GetEmailIdentityCommand).rejects(notFoundError);

    // The verify function will call process.exit, but since we mock it,
    // the code continues and tries to access undefined properties
    // We need to catch the error or make process.exit actually stop execution
    try {
      await verify({ domain: "nonexistent.com" });
    } catch (_error) {
      // Ignore errors from trying to access properties after exit
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should verify all DNS records when correctly configured", async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: true,
      DkimAttributes: {
        Status: "SUCCESS",
        Tokens: ["token1", "token2", "token3"],
      },
    });

    mockResolverInstance.resolveCname
      .mockResolvedValueOnce(["token1.dkim.amazonses.com"])
      .mockResolvedValueOnce(["token2.dkim.amazonses.com"])
      .mockResolvedValueOnce(["token3.dkim.amazonses.com"]);

    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([["v=spf1 include:amazonses.com ~all"]])
      .mockResolvedValueOnce([["v=DMARC1; p=quarantine"]]);

    await verify({ domain: "example.com" });

    expect(mockResolverInstance.resolveCname).toHaveBeenCalledTimes(3);
    expect(mockResolverInstance.resolveTxt).toHaveBeenCalledTimes(2);
  });

  it("should detect missing DKIM records", async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: false,
      DkimAttributes: {
        Status: "PENDING",
        Tokens: ["token1"],
      },
    });

    const dnsErr = Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    mockResolverInstance.resolveCname.mockRejectedValue(dnsErr);
    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([["v=spf1 include:amazonses.com ~all"]])
      .mockResolvedValueOnce([["v=DMARC1; p=quarantine"]]);

    await verify({ domain: "example.com" });

    expect(mockResolverInstance.resolveCname).toHaveBeenCalled();
  });

  it("should detect missing SPF record", async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: false,
      DkimAttributes: {
        Status: "PENDING",
        Tokens: ["token1"],
      },
    });

    mockResolverInstance.resolveCname.mockResolvedValue([
      "token1.dkim.amazonses.com",
    ]);
    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([["v=DMARC1; p=quarantine"]]);

    await verify({ domain: "example.com" });

    expect(mockResolverInstance.resolveTxt).toHaveBeenCalledWith("example.com");
  });

  it("should detect incorrect SPF record", async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: false,
      DkimAttributes: {
        Status: "PENDING",
        Tokens: ["token1"],
      },
    });

    mockResolverInstance.resolveCname.mockResolvedValue([
      "token1.dkim.amazonses.com",
    ]);
    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([["v=spf1 include:sendgrid.net ~all"]])
      .mockResolvedValueOnce([["v=DMARC1; p=quarantine"]]);

    await verify({ domain: "example.com" });

    expect(mockResolverInstance.resolveTxt).toHaveBeenCalledWith("example.com");
  });

  it("should detect missing DMARC record", async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: false,
      DkimAttributes: {
        Status: "PENDING",
        Tokens: ["token1"],
      },
    });

    mockResolverInstance.resolveCname.mockResolvedValue([
      "token1.dkim.amazonses.com",
    ]);
    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([["v=spf1 include:amazonses.com ~all"]])
      .mockRejectedValueOnce(
        Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" })
      );

    await verify({ domain: "example.com" });

    expect(mockResolverInstance.resolveTxt).toHaveBeenCalledWith(
      "_dmarc.example.com"
    );
  });

  it("should handle domain with trailing dot in CNAME response", async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: true,
      DkimAttributes: {
        Status: "SUCCESS",
        Tokens: ["token1"],
      },
    });

    mockResolverInstance.resolveCname.mockResolvedValue([
      "token1.dkim.amazonses.com.",
    ]);
    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([["v=spf1 include:amazonses.com ~all"]])
      .mockResolvedValueOnce([["v=DMARC1; p=quarantine"]]);

    await verify({ domain: "example.com" });

    // Should still be considered verified
    expect(mockResolverInstance.resolveCname).toHaveBeenCalled();
  });

  it("should handle domain with no DKIM tokens", async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: false,
      DkimAttributes: {
        Status: "NOT_STARTED",
        Tokens: [],
      },
    });

    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([["v=spf1 include:amazonses.com ~all"]])
      .mockResolvedValueOnce([["v=DMARC1; p=quarantine"]]);

    await verify({ domain: "example.com" });

    // Should not try to resolve DKIM if no tokens (resolveCname is reset between tests)
  });

  it("should verify MAIL FROM domain MX records", async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: true,
      DkimAttributes: {
        Status: "SUCCESS",
        Tokens: ["token1"],
      },
      MailFromAttributes: {
        MailFromDomain: "mail.example.com",
        MailFromDomainStatus: "SUCCESS",
      },
    });

    mockResolverInstance.resolveCname.mockResolvedValue([
      "token1.dkim.amazonses.com",
    ]);
    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([["v=spf1 include:amazonses.com ~all"]])
      .mockResolvedValueOnce([["v=DMARC1; p=quarantine"]])
      .mockResolvedValueOnce([["v=spf1 include:amazonses.com ~all"]]);

    // Mock resolveMx
    mockResolverInstance.resolveMx = vi
      .fn()
      .mockResolvedValue([
        { priority: 10, exchange: "feedback-smtp.us-east-1.amazonses.com" },
      ]);

    await verify({ domain: "example.com" });

    expect(mockResolverInstance.resolveMx).toHaveBeenCalledWith(
      "mail.example.com"
    );
  });

  it("should detect missing MAIL FROM MX records", async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: false,
      DkimAttributes: {
        Status: "PENDING",
        Tokens: ["token1"],
      },
      MailFromAttributes: {
        MailFromDomain: "mail.example.com",
        MailFromDomainStatus: "PENDING",
      },
    });

    mockResolverInstance.resolveCname.mockResolvedValue([
      "token1.dkim.amazonses.com",
    ]);
    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([["v=spf1 include:amazonses.com ~all"]])
      .mockResolvedValueOnce([["v=DMARC1; p=quarantine"]])
      .mockRejectedValueOnce(
        Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" })
      );

    mockResolverInstance.resolveMx = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" })
      );

    await verify({ domain: "example.com" });

    expect(mockResolverInstance.resolveMx).toHaveBeenCalledWith(
      "mail.example.com"
    );
  });

  it("should detect incorrect MAIL FROM MX records", async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: false,
      DkimAttributes: {
        Status: "PENDING",
        Tokens: ["token1"],
      },
      MailFromAttributes: {
        MailFromDomain: "mail.example.com",
        MailFromDomainStatus: "PENDING",
      },
    });

    mockResolverInstance.resolveCname.mockResolvedValue([
      "token1.dkim.amazonses.com",
    ]);
    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([["v=spf1 include:amazonses.com ~all"]])
      .mockResolvedValueOnce([["v=DMARC1; p=quarantine"]])
      .mockResolvedValueOnce([["v=spf1 include:sendgrid.net ~all"]]);

    mockResolverInstance.resolveMx = vi
      .fn()
      .mockResolvedValue([{ priority: 10, exchange: "mx.google.com" }]);

    await verify({ domain: "example.com" });

    expect(mockResolverInstance.resolveMx).toHaveBeenCalled();
  });

  it("should handle some incorrect DNS records", async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: false,
      DkimAttributes: {
        Status: "PENDING",
        Tokens: ["token1"],
      },
    });

    mockResolverInstance.resolveCname.mockResolvedValue(["wrong.cname.com"]);
    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([["v=spf1 include:sendgrid.net ~all"]])
      .mockResolvedValueOnce([["v=DMARC1; p=quarantine"]]);

    await verify({ domain: "example.com" });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("wraps email status")
    );
  });

  it("should handle pending verification with all DNS records correct", async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: false,
      DkimAttributes: {
        Status: "PENDING",
        Tokens: ["token1"],
      },
    });

    mockResolverInstance.resolveCname.mockResolvedValue([
      "token1.dkim.amazonses.com",
    ]);
    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([["v=spf1 include:amazonses.com ~all"]])
      .mockResolvedValueOnce([["v=DMARC1; p=quarantine"]]);

    await verify({ domain: "example.com" });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("DNS records can take up to 48 hours")
    );
  });

  it("should suggest --wait flag when not fully verified", async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: false,
      DkimAttributes: {
        Status: "PENDING",
        Tokens: ["token1"],
      },
    });

    mockResolverInstance.resolveCname.mockResolvedValue([
      "token1.dkim.amazonses.com",
    ]);
    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([["v=spf1 include:amazonses.com ~all"]])
      .mockResolvedValueOnce([["v=DMARC1; p=quarantine"]]);

    await verify({ domain: "example.com" });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("--wait")
    );
  });

  it("should not enter wait loop when already fully verified", async () => {
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: true,
      DkimAttributes: {
        Status: "SUCCESS",
        Tokens: ["token1"],
      },
    });

    mockResolverInstance.resolveCname.mockResolvedValue([
      "token1.dkim.amazonses.com",
    ]);
    mockResolverInstance.resolveTxt
      .mockResolvedValueOnce([["v=spf1 include:amazonses.com ~all"]])
      .mockResolvedValueOnce([["v=DMARC1; p=quarantine"]]);

    await verify({ domain: "example.com", wait: true });

    // Should complete immediately — SES was called only once (no polling)
    const calls = sesv2Mock.commandCalls(GetEmailIdentityCommand);
    expect(calls).toHaveLength(1);
  });

  it("should poll and succeed when DNS records verify on retry", async () => {
    // First call: pending. Second call (in poll): verified.
    sesv2Mock
      .on(GetEmailIdentityCommand)
      .resolvesOnce({
        VerifiedForSendingStatus: false,
        DkimAttributes: {
          Status: "PENDING",
          Tokens: ["token1"],
        },
      })
      .resolvesOnce({
        VerifiedForSendingStatus: true,
        DkimAttributes: {
          Status: "SUCCESS",
          Tokens: ["token1"],
        },
      });

    // First check: missing DKIM
    const dnsErr = Object.assign(new Error("ENOTFOUND"), {
      code: "ENOTFOUND",
    });
    mockResolverInstance.resolveCname
      .mockRejectedValueOnce(dnsErr)
      // Second check: found DKIM
      .mockResolvedValueOnce(["token1.dkim.amazonses.com"]);

    mockResolverInstance.resolveTxt
      // First check: SPF + DMARC
      .mockResolvedValueOnce([["v=spf1 include:amazonses.com ~all"]])
      .mockResolvedValueOnce([["v=DMARC1; p=quarantine"]])
      // Second check: SPF + DMARC
      .mockResolvedValueOnce([["v=spf1 include:amazonses.com ~all"]])
      .mockResolvedValueOnce([["v=DMARC1; p=quarantine"]]);

    await verify({ domain: "example.com", wait: true, interval: 0.01 });

    // Should have made 2 SES calls (initial + 1 poll)
    const calls = sesv2Mock.commandCalls(GetEmailIdentityCommand);
    expect(calls).toHaveLength(2);
  });
});
