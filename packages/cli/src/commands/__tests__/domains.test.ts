import {
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  GetConfigurationSetCommand,
  GetConfigurationSetEventDestinationsCommand,
  GetEmailIdentityCommand,
  ListEmailIdentitiesCommand,
  PutConfigurationSetTrackingOptionsCommand,
  PutEmailIdentityConfigurationSetAttributesCommand,
  PutEmailIdentityMailFromAttributesCommand,
  SESv2Client,
  UpdateConfigurationSetEventDestinationCommand,
} from "@aws-sdk/client-sesv2";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { domainToConfigSetName } from "../../utils/email/config-set-slug";
import {
  addDomain,
  configDomain,
  getDkim,
  listDomains,
  removeDomain,
  verifyDomain,
} from "../email/domains";

const sesClientMock = mockClient(SESv2Client);

// Deterministic DNS resolver mock — checkVerification's `new Resolver()` uses
// this instead of hitting real nameservers. Default: everything "missing"
// (ENOTFOUND), non-fatal per classifyDNSError. Individual tests override
// specific lookups to make a domain fully verified.
const notFound = () =>
  Object.assign(new Error("not found"), { code: "ENOTFOUND" });
const dnsResolverMock = {
  setServers: vi.fn(),
  resolveCname: vi.fn().mockRejectedValue(notFound()),
  resolveTxt: vi.fn().mockRejectedValue(notFound()),
  resolveMx: vi.fn().mockRejectedValue(notFound()),
};
vi.mock("node:dns/promises", () => ({
  Resolver: vi.fn(function MockResolver() {
    return dnsResolverMock;
  }),
}));

// Mock process.exit
const mockExit = vi
  .spyOn(process, "exit")
  .mockImplementation((() => {}) as any);

// Mock @clack/prompts
vi.mock("@clack/prompts");

// Mock utils
vi.mock("../../utils/shared/aws", () => ({
  getAWSRegion: vi.fn().mockResolvedValue("us-east-1"),
  validateAWSCredentials: vi.fn().mockResolvedValue({
    accountId: "123456789012",
    arn: "arn:aws:iam::123456789012:user/test",
    userId: "AIDATEST",
  }),
}));

vi.mock("../../utils/shared/metadata", () => ({
  findConnectionsWithService: vi.fn().mockResolvedValue([
    {
      accountId: "123456789012",
      region: "us-east-1",
      services: {
        email: {
          config: { domain: "primary.com" },
          dnsProvider: undefined,
        },
      },
    },
  ]),
  loadConnectionMetadata: vi.fn().mockResolvedValue({
    version: "1.0.0",
    accountId: "123456789012",
    region: "us-east-1",
    provider: "vercel",
    timestamp: new Date().toISOString(),
    services: {
      email: {
        config: { domain: "primary.com" },
        deployedAt: new Date().toISOString(),
      },
    },
  }),
  saveConnectionMetadata: vi.fn().mockResolvedValue(undefined),
  addDomainToMetadata: vi.fn(),
  removeDomainFromMetadata: vi.fn(),
  getDomainFromMetadata: vi.fn().mockReturnValue(null),
  getAllTrackedDomains: vi.fn().mockReturnValue([]),
}));

vi.mock("../../utils/dns/index", () => ({
  detectAvailableDNSProviders: vi
    .fn()
    .mockResolvedValue([{ provider: "manual", detected: true }]),
  getDNSCredentials: vi.fn().mockResolvedValue({
    valid: true,
    credentials: { provider: "manual" },
  }),
  createDNSRecordsForProvider: vi.fn().mockResolvedValue({
    success: true,
    recordsCreated: 0,
  }),
  buildEmailDNSRecords: vi.fn().mockReturnValue([]),
  formatDNSRecordsForDisplay: vi.fn().mockReturnValue([]),
  getDNSProviderDisplayName: vi.fn().mockReturnValue("Manual"),
}));

vi.mock("../../utils/shared/prompts", () => ({
  promptSubdomainSuggestions: vi.fn().mockResolvedValue("sub.primary.com"),
  promptDomainPurpose: vi.fn().mockResolvedValue("transactional"),
  promptMailFromSubdomain: vi.fn().mockResolvedValue("mail.test.com"),
  promptDNSProvider: vi.fn().mockResolvedValue("manual"),
  promptTrackingSubdomain: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../utils/email/tracking-https", () => ({
  provisionTrackingHttps: vi.fn().mockResolvedValue({
    trackingHttps: { certificateArn: "arn:aws:acm:pending", status: "pending" },
    cnameTarget: "r.us-east-1.awstrack.me",
    dnsRecordsToShow: [],
  }),
  describeTrackingHttpsError: vi.fn(
    (error: unknown) => (error as Error)?.message ?? "Unknown AWS error"
  ),
}));

describe("Domain Management Commands", () => {
  let mockSpinner: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    message: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    sesClientMock.reset();
    vi.clearAllMocks();
    mockExit.mockClear();

    // Reset the DNS resolver mock to its "everything missing" default.
    dnsResolverMock.setServers.mockReset();
    dnsResolverMock.resolveCname.mockReset().mockRejectedValue(notFound());
    dnsResolverMock.resolveTxt.mockReset().mockRejectedValue(notFound());
    dnsResolverMock.resolveMx.mockReset().mockRejectedValue(notFound());

    // Mock spinner
    mockSpinner = {
      start: vi.fn(),
      stop: vi.fn(),
      message: vi.fn(),
    };

    const clack = await import("@clack/prompts");
    vi.mocked(clack.spinner).mockReturnValue(mockSpinner as never);
    vi.mocked(clack.intro).mockImplementation(() => {});
    vi.mocked(clack.outro).mockImplementation(() => {});
    vi.mocked(clack.note).mockImplementation(() => {});
    vi.mocked(clack.log).info = vi.fn();
    vi.mocked(clack.log).warn = vi.fn();
    vi.mocked(clack.log).error = vi.fn();
    vi.mocked(clack.cancel).mockImplementation(() => {});
    vi.mocked(clack.isCancel).mockReturnValue(false);
  });

  describe("addDomain", () => {
    it("should add a new domain successfully", async () => {
      // Mock domain doesn't exist (first call), then return DKIM tokens (second call)
      const notFoundError = new Error("Not found");
      notFoundError.name = "NotFoundException";
      sesClientMock
        .on(GetEmailIdentityCommand)
        .rejectsOnce(notFoundError)
        .resolvesOnce({
          DkimAttributes: {
            Tokens: ["token1", "token2", "token3"],
            Status: "PENDING",
          },
        });

      // Mock successful creation
      sesClientMock.on(CreateEmailIdentityCommand).resolves({});

      const clack = await import("@clack/prompts");
      vi.mocked(clack.confirm).mockResolvedValue(false as never);

      await addDomain({ domain: "test.com", yes: true });

      // Verify CreateEmailIdentityCommand was called with config set
      const createCalls = sesClientMock.commandCalls(
        CreateEmailIdentityCommand
      );
      expect(createCalls.length).toBe(1);
      expect(createCalls[0].args[0].input).toMatchObject({
        EmailIdentity: "test.com",
        ConfigurationSetName: domainToConfigSetName("test.com"),
        DkimSigningAttributes: {
          NextSigningKeyLength: "RSA_2048_BIT",
        },
      });
    });

    it("should adopt existing SES domain into metadata without creating new identity", async () => {
      // Domain already exists in SES — return identity on first call, DKIM on second
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
        DkimAttributes: {
          Tokens: ["token1", "token2", "token3"],
          Status: "SUCCESS",
        },
      });

      sesClientMock
        .on(PutEmailIdentityConfigurationSetAttributesCommand)
        .resolves({});
      sesClientMock.on(PutEmailIdentityMailFromAttributesCommand).resolves({});

      const clack = await import("@clack/prompts");
      vi.mocked(clack.confirm).mockResolvedValue(false as never);

      const metadata = await import("../../utils/shared/metadata");

      await addDomain({ domain: "existing.com", yes: true });

      // Should NOT have tried to create a new SES identity
      const createCalls = sesClientMock.commandCalls(
        CreateEmailIdentityCommand
      );
      expect(createCalls.length).toBe(0);

      // Should have saved to metadata
      expect(metadata.addDomainToMetadata).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          domain: "existing.com",
        })
      );
      expect(metadata.saveConnectionMetadata).toHaveBeenCalled();
    });

    it("should associate config set on adopted existing domain", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
        DkimAttributes: {
          Tokens: ["token1"],
          Status: "SUCCESS",
        },
      });

      sesClientMock
        .on(PutEmailIdentityConfigurationSetAttributesCommand)
        .resolves({});
      sesClientMock.on(PutEmailIdentityMailFromAttributesCommand).resolves({});

      await addDomain({ domain: "existing.com", yes: true });

      const configSetCalls = sesClientMock.commandCalls(
        PutEmailIdentityConfigurationSetAttributesCommand
      );
      expect(configSetCalls.length).toBe(1);
      expect(configSetCalls[0].args[0].input).toMatchObject({
        EmailIdentity: "existing.com",
        ConfigurationSetName: domainToConfigSetName("existing.com"),
      });
    });

    it("should set up MAIL FROM on adopted existing domain", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
        DkimAttributes: {
          Tokens: ["token1"],
          Status: "SUCCESS",
        },
      });

      sesClientMock
        .on(PutEmailIdentityConfigurationSetAttributesCommand)
        .resolves({});
      sesClientMock.on(PutEmailIdentityMailFromAttributesCommand).resolves({});

      await addDomain({ domain: "existing.com", yes: true });

      // Should have called PutEmailIdentityMailFromAttributes
      const mailFromCalls = sesClientMock.commandCalls(
        PutEmailIdentityMailFromAttributesCommand
      );
      expect(mailFromCalls.length).toBe(1);
      expect(mailFromCalls[0].args[0].input).toMatchObject({
        EmailIdentity: "existing.com",
        MailFromDomain: "mail.existing.com",
        BehaviorOnMxFailure: "USE_DEFAULT_VALUE",
      });
    });

    it("should show adoption message for existing SES domain", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
        DkimAttributes: {
          Tokens: ["token1"],
          Status: "SUCCESS",
        },
      });

      sesClientMock
        .on(PutEmailIdentityConfigurationSetAttributesCommand)
        .resolves({});
      sesClientMock.on(PutEmailIdentityMailFromAttributesCommand).resolves({});

      const clack = await import("@clack/prompts");
      vi.mocked(clack.confirm).mockResolvedValue(false as never);

      await addDomain({ domain: "existing.com", yes: true });

      // Should show adoption info message
      expect(clack.log.info).toHaveBeenCalledWith(
        expect.stringContaining("already exists in SES")
      );
      expect(clack.log.info).toHaveBeenCalledWith(
        expect.stringContaining("adopting into Wraps")
      );
    });

    it("should use DKIM tokens from existing domain for DNS setup", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
        DkimAttributes: {
          Tokens: ["existing-tok1", "existing-tok2", "existing-tok3"],
          Status: "SUCCESS",
        },
      });

      sesClientMock
        .on(PutEmailIdentityConfigurationSetAttributesCommand)
        .resolves({});
      sesClientMock.on(PutEmailIdentityMailFromAttributesCommand).resolves({});

      const dns = await import("../../utils/dns/index");

      await addDomain({ domain: "existing.com", yes: true });

      // Should have passed DKIM tokens to DNS record builder
      expect(dns.buildEmailDNSRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: "existing.com",
          dkimTokens: ["existing-tok1", "existing-tok2", "existing-tok3"],
        })
      );
    });

    it("should handle AWS errors", async () => {
      const notFoundError = new Error("Not found");
      notFoundError.name = "NotFoundException";
      sesClientMock.on(GetEmailIdentityCommand).rejectsOnce(notFoundError);

      sesClientMock
        .on(CreateEmailIdentityCommand)
        .rejects(new Error("AWS Service Error"));

      await expect(
        addDomain({ domain: "test.com", yes: true })
      ).rejects.toThrow("AWS Service Error");
    });
  });

  describe("listDomains", () => {
    it("should list all domains successfully", async () => {
      sesClientMock.on(ListEmailIdentitiesCommand).resolves({
        EmailIdentities: [
          {
            IdentityType: "DOMAIN",
            IdentityName: "domain1.com",
          },
          {
            IdentityType: "DOMAIN",
            IdentityName: "domain2.com",
          },
          {
            IdentityType: "EMAIL_ADDRESS",
            IdentityName: "test@example.com",
          },
        ],
      });

      sesClientMock
        .on(GetEmailIdentityCommand, { EmailIdentity: "domain1.com" })
        .resolves({
          VerifiedForSendingStatus: true,
          DkimAttributes: {
            Status: "SUCCESS",
          },
        })
        .on(GetEmailIdentityCommand, { EmailIdentity: "domain2.com" })
        .resolves({
          VerifiedForSendingStatus: false,
          DkimAttributes: {
            Status: "PENDING",
          },
        });

      await listDomains();

      const listCalls = sesClientMock.commandCalls(ListEmailIdentitiesCommand);
      expect(listCalls.length).toBe(1);
    });

    it("should handle no domains found", async () => {
      sesClientMock.on(ListEmailIdentitiesCommand).resolves({
        EmailIdentities: [],
      });

      const clack = await import("@clack/prompts");

      await listDomains();

      expect(clack.outro).toHaveBeenCalledWith("No domains found in SES");
    });

    it("should filter out email addresses", async () => {
      sesClientMock.on(ListEmailIdentitiesCommand).resolves({
        EmailIdentities: [
          {
            IdentityName: "domain.com",
          },
          {
            IdentityName: "test@example.com",
          },
        ],
      });

      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
        DkimAttributes: { Status: "SUCCESS" },
      });

      await listDomains();

      // Should only query domain.com, not the email address
      const getCalls = sesClientMock.commandCalls(GetEmailIdentityCommand);
      expect(getCalls.length).toBe(1);
      expect(getCalls[0].args[0].input.EmailIdentity).toBe("domain.com");
    });

    it("should handle errors fetching domain details gracefully", async () => {
      sesClientMock.on(ListEmailIdentitiesCommand).resolves({
        EmailIdentities: [
          {
            IdentityType: "DOMAIN",
            IdentityName: "error-domain.com",
          },
        ],
      });

      sesClientMock
        .on(GetEmailIdentityCommand)
        .rejects(new Error("Access denied"));

      // Should not throw, should handle gracefully
      await expect(listDomains()).resolves.not.toThrow();
    });
  });

  describe("getDkim", () => {
    it("should get DKIM tokens successfully", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        DkimAttributes: {
          Tokens: ["token1", "token2", "token3"],
          Status: "SUCCESS",
        },
      });

      await getDkim({ domain: "test.com" });

      const getCalls = sesClientMock.commandCalls(GetEmailIdentityCommand);
      expect(getCalls.length).toBe(1);
      expect(getCalls[0].args[0].input.EmailIdentity).toBe("test.com");
    });

    it("should handle pending DKIM verification", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        DkimAttributes: {
          Tokens: ["token1", "token2"],
          Status: "PENDING",
        },
      });

      await getDkim({ domain: "test.com" });

      // Should complete without error
      expect(sesClientMock.commandCalls(GetEmailIdentityCommand).length).toBe(
        1
      );
    });

    it("should handle domain not found", async () => {
      const notFoundError = new Error("Not found");
      notFoundError.name = "NotFoundException";
      sesClientMock.on(GetEmailIdentityCommand).rejects(notFoundError);

      // Function will return early after calling process.exit()
      await getDkim({ domain: "nonexistent.com" });

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it("should handle no DKIM tokens", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        DkimAttributes: {
          Tokens: [],
          Status: "PENDING",
        },
      });

      const clack = await import("@clack/prompts");

      await getDkim({ domain: "test.com" });

      expect(clack.outro).toHaveBeenCalledWith(
        expect.stringContaining("No DKIM tokens")
      );
    });
  });

  describe("removeDomain", () => {
    it("should remove domain with confirmation", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
      });

      sesClientMock.on(DeleteEmailIdentityCommand).resolves({});

      const clack = await import("@clack/prompts");
      vi.mocked(clack.confirm).mockResolvedValue(true as never);
      vi.mocked(clack.isCancel).mockReturnValue(false);

      // getDomainFromMetadata returns null (not primary), so no guard
      await removeDomain({ domain: "test.com" });

      const deleteCalls = sesClientMock.commandCalls(
        DeleteEmailIdentityCommand
      );
      expect(deleteCalls.length).toBe(1);
      expect(deleteCalls[0].args[0].input.EmailIdentity).toBe("test.com");
    });

    it("should skip confirmation with --force flag", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
      });

      sesClientMock.on(DeleteEmailIdentityCommand).resolves({});

      const clack = await import("@clack/prompts");

      await removeDomain({ domain: "test.com", force: true });

      // confirm should not be called when force=true
      expect(clack.confirm).not.toHaveBeenCalled();

      const deleteCalls = sesClientMock.commandCalls(
        DeleteEmailIdentityCommand
      );
      expect(deleteCalls.length).toBe(1);
    });

    it("should cancel when user declines confirmation", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
      });

      const clack = await import("@clack/prompts");
      vi.mocked(clack.confirm).mockResolvedValue(false as never);
      vi.mocked(clack.isCancel).mockReturnValue(false);

      await removeDomain({ domain: "test.com" });

      expect(clack.cancel).toHaveBeenCalledWith("Operation cancelled");
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it("should handle user cancels prompt", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
      });

      const clack = await import("@clack/prompts");
      const cancelSymbol = Symbol("cancel");
      vi.mocked(clack.confirm).mockResolvedValue(cancelSymbol as never);
      vi.mocked(clack.isCancel).mockReturnValue(true);

      await removeDomain({ domain: "test.com" });

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it("should handle domain not found", async () => {
      const notFoundError = new Error("Not found");
      notFoundError.name = "NotFoundException";
      sesClientMock.on(GetEmailIdentityCommand).rejects(notFoundError);

      // Function will return early after calling process.exit()
      await removeDomain({ domain: "nonexistent.com", force: true });

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe("addDomain - metadata and MAIL FROM", () => {
    it("should save domain to metadata after creation", async () => {
      const notFoundError = new Error("Not found");
      notFoundError.name = "NotFoundException";
      sesClientMock
        .on(GetEmailIdentityCommand)
        .rejectsOnce(notFoundError)
        .resolvesOnce({
          DkimAttributes: {
            Tokens: ["token1", "token2", "token3"],
            Status: "PENDING",
          },
        });

      sesClientMock.on(CreateEmailIdentityCommand).resolves({});
      sesClientMock.on(PutEmailIdentityMailFromAttributesCommand).resolves({});

      const clack = await import("@clack/prompts");
      vi.mocked(clack.confirm).mockResolvedValue(false as never);

      const metadata = await import("../../utils/shared/metadata");

      await addDomain({ domain: "test.com", yes: true });

      // Verify addDomainToMetadata was called with correct entry
      expect(metadata.addDomainToMetadata).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          domain: "test.com",
          mailFromDomain: "mail.test.com",
          addedAt: expect.any(String),
        })
      );

      // Verify saveConnectionMetadata was called
      expect(metadata.saveConnectionMetadata).toHaveBeenCalled();
    });

    it("should set up MAIL FROM in non-interactive mode", async () => {
      const notFoundError = new Error("Not found");
      notFoundError.name = "NotFoundException";
      sesClientMock
        .on(GetEmailIdentityCommand)
        .rejectsOnce(notFoundError)
        .resolvesOnce({
          DkimAttributes: {
            Tokens: ["token1"],
            Status: "PENDING",
          },
        });

      sesClientMock.on(CreateEmailIdentityCommand).resolves({});
      sesClientMock.on(PutEmailIdentityMailFromAttributesCommand).resolves({});

      const clack = await import("@clack/prompts");
      vi.mocked(clack.confirm).mockResolvedValue(false as never);

      await addDomain({ domain: "test.com", yes: true });

      // Verify PutEmailIdentityMailFromAttributesCommand was called
      const mailFromCalls = sesClientMock.commandCalls(
        PutEmailIdentityMailFromAttributesCommand
      );
      expect(mailFromCalls.length).toBe(1);
      expect(mailFromCalls[0].args[0].input).toMatchObject({
        EmailIdentity: "test.com",
        MailFromDomain: "mail.test.com",
        BehaviorOnMxFailure: "USE_DEFAULT_VALUE",
      });
    });

    it("should exit when no email infrastructure exists", async () => {
      const metadata = await import("../../utils/shared/metadata");
      vi.mocked(metadata.findConnectionsWithService).mockResolvedValueOnce([]);

      await addDomain({ domain: "test.com", yes: true });

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe("removeDomain - primary domain guard", () => {
    it("should block removing primary domain without --force", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
      });

      const metadata = await import("../../utils/shared/metadata");
      vi.mocked(metadata.getDomainFromMetadata).mockReturnValueOnce({
        isPrimary: true,
      });

      await removeDomain({ domain: "primary.com" });

      expect(mockExit).toHaveBeenCalledWith(1);

      // Should NOT have called DeleteEmailIdentityCommand
      const deleteCalls = sesClientMock.commandCalls(
        DeleteEmailIdentityCommand
      );
      expect(deleteCalls.length).toBe(0);
    });

    it("should allow removing primary domain with --force", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
      });
      sesClientMock.on(DeleteEmailIdentityCommand).resolves({});

      const metadata = await import("../../utils/shared/metadata");
      vi.mocked(metadata.getDomainFromMetadata).mockReturnValueOnce({
        isPrimary: true,
      });

      await removeDomain({ domain: "primary.com", force: true });

      const deleteCalls = sesClientMock.commandCalls(
        DeleteEmailIdentityCommand
      );
      expect(deleteCalls.length).toBe(1);
    });

    it("should call removeDomainFromMetadata and save after removal", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
      });
      sesClientMock.on(DeleteEmailIdentityCommand).resolves({});

      const clack = await import("@clack/prompts");
      vi.mocked(clack.confirm).mockResolvedValue(true as never);
      vi.mocked(clack.isCancel).mockReturnValue(false);

      const metadata = await import("../../utils/shared/metadata");

      await removeDomain({ domain: "sub.primary.com" });

      expect(metadata.removeDomainFromMetadata).toHaveBeenCalledWith(
        expect.any(Object),
        "sub.primary.com"
      );
      expect(metadata.saveConnectionMetadata).toHaveBeenCalled();
    });
  });

  describe("verifyDomain", () => {
    it("should verify domain DNS records successfully", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
        DkimAttributes: {
          Tokens: ["token1", "token2"],
          Status: "SUCCESS",
        },
      });

      // Mock DNS resolver
      const mockResolver = {
        resolveCname: vi.fn().mockResolvedValue(["token1.dkim.amazonses.com"]),
        resolveTxt: vi
          .fn()
          .mockResolvedValueOnce([["v=spf1 include:amazonses.com ~all"]])
          .mockResolvedValueOnce([["v=DMARC1; p=none;"]]),
        setServers: vi.fn(),
      };

      vi.doMock("node:dns/promises", () => ({
        Resolver: vi.fn(() => mockResolver),
      }));

      await verifyDomain({ domain: "test.com" });

      const getCalls = sesClientMock.commandCalls(GetEmailIdentityCommand);
      expect(getCalls.length).toBeGreaterThan(0);
    });

    it("should handle domain not found in SES", async () => {
      const notFoundError = new Error("Not found");
      notFoundError.name = "NotFoundException";
      sesClientMock.on(GetEmailIdentityCommand).rejects(notFoundError);

      // Function will return early after calling process.exit()
      await verifyDomain({ domain: "nonexistent.com" });

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it("Unit 12: applies a pending tracking domain once the domain is fully verified", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
        DkimAttributes: { Tokens: [], Status: "SUCCESS" },
      });
      sesClientMock.on(PutConfigurationSetTrackingOptionsCommand).resolves({});

      dnsResolverMock.resolveTxt.mockImplementation(async (name: string) => {
        if (name === "test.com") return [["v=spf1 include:amazonses.com ~all"]];
        if (name === "_dmarc.test.com") return [["v=DMARC1; p=none;"]];
        throw notFound();
      });
      dnsResolverMock.resolveCname.mockImplementation(async (name: string) => {
        if (name === "track.test.com") return ["r.us-east-1.awstrack.me"];
        throw notFound();
      });

      const metadata = await import("../../utils/shared/metadata");
      vi.mocked(metadata.getDomainFromMetadata).mockReturnValueOnce({
        isPrimary: false,
        entry: {
          domain: "test.com",
          configSetName: domainToConfigSetName("test.com"),
          trackingDomain: "track.test.com",
          addedAt: new Date().toISOString(),
        },
      });

      await verifyDomain({ domain: "test.com" });

      const putCalls = sesClientMock.commandCalls(
        PutConfigurationSetTrackingOptionsCommand
      );
      expect(putCalls.length).toBe(1);
      expect(putCalls[0].args[0].input).toMatchObject({
        ConfigurationSetName: domainToConfigSetName("test.com"),
        CustomRedirectDomain: "track.test.com",
      });
      expect(metadata.saveConnectionMetadata).toHaveBeenCalled();
    });

    it("checks the tracking CNAME against CloudFront, not awstrack.me, when HTTPS tracking is active", async () => {
      // With HTTPS on, SES serves tracking links through the distribution, so
      // the CNAME correctly points at CloudFront. Comparing against
      // r.<region>.awstrack.me marked every correctly-configured HTTPS domain
      // "incorrect" and told the user to break their own working setup.
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
        DkimAttributes: { Tokens: [], Status: "SUCCESS" },
      });
      dnsResolverMock.resolveCname.mockImplementation(async (name: string) => {
        if (name === "track.test.com") return ["d111.cloudfront.net"];
        throw notFound();
      });

      const metadata = await import("../../utils/shared/metadata");
      vi.mocked(metadata.getDomainFromMetadata).mockReturnValueOnce({
        isPrimary: false,
        entry: {
          domain: "test.com",
          configSetName: domainToConfigSetName("test.com"),
          trackingDomain: "track.test.com",
          trackingHttps: {
            certificateArn: "arn:aws:acm:issued",
            status: "active",
            distributionId: "D111",
            distributionDomain: "d111.cloudfront.net",
          },
          addedAt: new Date().toISOString(),
        },
      });

      await verifyDomain({ domain: "test.com" });

      const clack = await import("@clack/prompts");
      const dnsNote = vi
        .mocked(clack.note)
        .mock.calls.find(([, title]) => title === "DNS Records");
      expect(dnsNote?.[0]).toContain("track.test.com");
      expect(dnsNote?.[0]).toContain("verified");
      expect(dnsNote?.[0]).not.toContain("incorrect");
    });

    it("still flags the tracking CNAME when HTTPS is active but DNS points at awstrack.me", async () => {
      // The genuinely wrong state after enabling HTTPS: the record was never
      // swapped, so tracking links resolve to the plain SES endpoint and the
      // REQUIRE policy has nothing to serve.
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
        DkimAttributes: { Tokens: [], Status: "SUCCESS" },
      });
      dnsResolverMock.resolveCname.mockImplementation(async (name: string) => {
        if (name === "track.test.com") return ["r.us-east-1.awstrack.me"];
        throw notFound();
      });

      const metadata = await import("../../utils/shared/metadata");
      vi.mocked(metadata.getDomainFromMetadata).mockReturnValueOnce({
        isPrimary: false,
        entry: {
          domain: "test.com",
          configSetName: domainToConfigSetName("test.com"),
          trackingDomain: "track.test.com",
          trackingHttps: {
            certificateArn: "arn:aws:acm:issued",
            status: "active",
            distributionId: "D111",
            distributionDomain: "d111.cloudfront.net",
          },
          addedAt: new Date().toISOString(),
        },
      });

      await verifyDomain({ domain: "test.com" });

      const clack = await import("@clack/prompts");
      const dnsNote = vi
        .mocked(clack.note)
        .mock.calls.find(([, title]) => title === "DNS Records");
      expect(dnsNote?.[0]).toContain("track.test.com");
      expect(dnsNote?.[0]).toContain("incorrect");
    });
  });

  describe("addDomain - per-domain config sets", () => {
    const defaultEventBusArn =
      "arn:aws:events:us-east-1:123456789012:event-bus/default";

    it("Unit 6: new domain: CreateConfigurationSetCommand called with derived name before CreateEmailIdentityCommand", async () => {
      const notFoundError = new Error("Not found");
      notFoundError.name = "NotFoundException";
      sesClientMock
        .on(GetEmailIdentityCommand)
        .rejectsOnce(notFoundError)
        .resolvesOnce({
          DkimAttributes: {
            Tokens: ["tok1", "tok2", "tok3"],
            Status: "PENDING",
          },
        });

      sesClientMock.on(CreateConfigurationSetCommand).resolves({});
      sesClientMock
        .on(CreateConfigurationSetEventDestinationCommand)
        .resolves({});
      sesClientMock.on(CreateEmailIdentityCommand).resolves({});

      await addDomain({ domain: "test.com", yes: true });

      const configSetCalls = sesClientMock.commandCalls(
        CreateConfigurationSetCommand
      );
      expect(configSetCalls.length).toBeGreaterThanOrEqual(1);
      expect(configSetCalls[0].args[0].input).toMatchObject({
        ConfigurationSetName: domainToConfigSetName("test.com"),
      });

      const allCalls = sesClientMock.calls();
      const configSetIdx = allCalls.findIndex(
        (c) => c.args[0] instanceof CreateConfigurationSetCommand
      );
      const identityIdx = allCalls.findIndex(
        (c) => c.args[0] instanceof CreateEmailIdentityCommand
      );
      expect(configSetIdx).toBeGreaterThanOrEqual(0);
      expect(identityIdx).toBeGreaterThanOrEqual(0);
      expect(configSetIdx).toBeLessThan(identityIdx);
    });

    it("Unit 7: new domain: CreateConfigurationSetEventDestinationCommand called with Enabled: true", async () => {
      const notFoundError = new Error("Not found");
      notFoundError.name = "NotFoundException";
      sesClientMock
        .on(GetEmailIdentityCommand)
        .rejectsOnce(notFoundError)
        .resolvesOnce({
          DkimAttributes: {
            Tokens: ["tok1", "tok2", "tok3"],
            Status: "PENDING",
          },
        });

      sesClientMock.on(CreateConfigurationSetCommand).resolves({});
      sesClientMock
        .on(CreateConfigurationSetEventDestinationCommand)
        .resolves({});
      sesClientMock.on(CreateEmailIdentityCommand).resolves({});

      await addDomain({ domain: "test.com", yes: true });

      const destCalls = sesClientMock.commandCalls(
        CreateConfigurationSetEventDestinationCommand
      );
      expect(destCalls.length).toBeGreaterThanOrEqual(1);
      expect(destCalls[0].args[0].input).toMatchObject({
        ConfigurationSetName: domainToConfigSetName("test.com"),
        EventDestination: {
          Enabled: true,
          EventBridgeDestination: { EventBusArn: defaultEventBusArn },
        },
      });
    });

    it("Unit 8: new domain: CreateEmailIdentityCommand called with derived ConfigurationSetName", async () => {
      const notFoundError = new Error("Not found");
      notFoundError.name = "NotFoundException";
      sesClientMock
        .on(GetEmailIdentityCommand)
        .rejectsOnce(notFoundError)
        .resolvesOnce({
          DkimAttributes: {
            Tokens: ["tok1", "tok2", "tok3"],
            Status: "PENDING",
          },
        });

      sesClientMock.on(CreateConfigurationSetCommand).resolves({});
      sesClientMock
        .on(CreateConfigurationSetEventDestinationCommand)
        .resolves({});
      sesClientMock.on(CreateEmailIdentityCommand).resolves({});

      await addDomain({ domain: "test.com", yes: true });

      const createCalls = sesClientMock.commandCalls(
        CreateEmailIdentityCommand
      );
      expect(createCalls.length).toBe(1);
      expect(createCalls[0].args[0].input).toMatchObject({
        EmailIdentity: "test.com",
        ConfigurationSetName: domainToConfigSetName("test.com"),
      });
    });

    it("Unit 9: all event types always forwarded to EventBridge regardless of purpose", async () => {
      const notFoundError = new Error("Not found");
      notFoundError.name = "NotFoundException";
      sesClientMock
        .on(GetEmailIdentityCommand)
        .rejectsOnce(notFoundError)
        .resolvesOnce({
          DkimAttributes: { Tokens: ["tok1"], Status: "PENDING" },
        });

      sesClientMock.on(CreateConfigurationSetCommand).resolves({});
      sesClientMock
        .on(CreateConfigurationSetEventDestinationCommand)
        .resolves({});
      sesClientMock.on(CreateEmailIdentityCommand).resolves({});

      const prompts = await import("../../utils/shared/prompts");
      vi.mocked(prompts.promptDomainPurpose).mockResolvedValueOnce(
        "transactional"
      );

      await addDomain({ domain: "test.com", yes: false });

      const destCalls = sesClientMock.commandCalls(
        CreateConfigurationSetEventDestinationCommand
      );
      expect(destCalls.length).toBeGreaterThanOrEqual(1);
      const eventTypes =
        destCalls[0].args[0].input.EventDestination?.MatchingEventTypes ?? [];
      expect(eventTypes).toContain("OPEN");
      expect(eventTypes).toContain("CLICK");
      expect(eventTypes).toContain("SEND");
      expect(eventTypes).toContain("BOUNCE");
    });

    it("Unit 10: marketing purpose: event destination includes OPEN and CLICK", async () => {
      const notFoundError = new Error("Not found");
      notFoundError.name = "NotFoundException";
      sesClientMock
        .on(GetEmailIdentityCommand)
        .rejectsOnce(notFoundError)
        .resolvesOnce({
          DkimAttributes: { Tokens: ["tok1"], Status: "PENDING" },
        });

      sesClientMock.on(CreateConfigurationSetCommand).resolves({});
      sesClientMock
        .on(CreateConfigurationSetEventDestinationCommand)
        .resolves({});
      sesClientMock.on(CreateEmailIdentityCommand).resolves({});

      const prompts = await import("../../utils/shared/prompts");
      vi.mocked(prompts.promptDomainPurpose).mockResolvedValueOnce("marketing");

      const clack = await import("@clack/prompts");
      vi.mocked(clack.confirm).mockResolvedValue(false as never);

      await addDomain({ domain: "test.com", yes: false });

      const destCalls = sesClientMock.commandCalls(
        CreateConfigurationSetEventDestinationCommand
      );
      expect(destCalls.length).toBeGreaterThanOrEqual(1);
      const eventTypes =
        destCalls[0].args[0].input.EventDestination?.MatchingEventTypes ?? [];
      expect(eventTypes).toContain("OPEN");
      expect(eventTypes).toContain("CLICK");
    });

    it("Unit 11: adopted domain: CreateConfigurationSetCommand + event destination called before PutEmailIdentityConfigurationSetAttributesCommand", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
        DkimAttributes: { Tokens: ["tok1"], Status: "SUCCESS" },
      });

      sesClientMock.on(CreateConfigurationSetCommand).resolves({});
      sesClientMock
        .on(CreateConfigurationSetEventDestinationCommand)
        .resolves({});
      sesClientMock
        .on(PutEmailIdentityConfigurationSetAttributesCommand)
        .resolves({});
      sesClientMock.on(PutEmailIdentityMailFromAttributesCommand).resolves({});

      await addDomain({ domain: "existing.com", yes: true });

      const configSetCalls = sesClientMock.commandCalls(
        CreateConfigurationSetCommand
      );
      expect(configSetCalls.length).toBeGreaterThanOrEqual(1);
      expect(configSetCalls[0].args[0].input).toMatchObject({
        ConfigurationSetName: domainToConfigSetName("existing.com"),
      });

      const allCalls = sesClientMock.calls();
      const csIdx = allCalls.findIndex(
        (c) => c.args[0] instanceof CreateConfigurationSetCommand
      );
      const putIdx = allCalls.findIndex(
        (c) =>
          c.args[0] instanceof PutEmailIdentityConfigurationSetAttributesCommand
      );
      expect(csIdx).toBeGreaterThanOrEqual(0);
      expect(putIdx).toBeGreaterThanOrEqual(0);
      expect(csIdx).toBeLessThan(putIdx);

      const putCalls = sesClientMock.commandCalls(
        PutEmailIdentityConfigurationSetAttributesCommand
      );
      expect(putCalls[0].args[0].input).toMatchObject({
        EmailIdentity: "existing.com",
        ConfigurationSetName: domainToConfigSetName("existing.com"),
      });
    });

    it("Unit 12: config set creation failure: error bubbles and metadata not updated", async () => {
      const notFoundError = new Error("Not found");
      notFoundError.name = "NotFoundException";
      sesClientMock.on(GetEmailIdentityCommand).rejectsOnce(notFoundError);

      const configSetError = new Error(
        "ConfigurationSetAlreadyExistsException"
      );
      configSetError.name = "ConfigurationSetAlreadyExistsException";
      sesClientMock.on(CreateConfigurationSetCommand).rejects(configSetError);

      const metadata = await import("../../utils/shared/metadata");

      await expect(
        addDomain({ domain: "fail.com", yes: true })
      ).rejects.toThrow();

      expect(metadata.saveConnectionMetadata).not.toHaveBeenCalled();
    });

    it("Unit 13: AlreadyExistsException on config set is swallowed (idempotent re-run)", async () => {
      const notFoundError = new Error("Not found");
      notFoundError.name = "NotFoundException";
      sesClientMock
        .on(GetEmailIdentityCommand)
        .rejectsOnce(notFoundError)
        .resolvesOnce({
          DkimAttributes: {
            Tokens: ["tok1", "tok2", "tok3"],
            Status: "PENDING",
          },
        });

      const alreadyExistsError = new Error("Already exists");
      alreadyExistsError.name = "AlreadyExistsException";
      sesClientMock
        .on(CreateConfigurationSetCommand)
        .rejects(alreadyExistsError);
      sesClientMock
        .on(CreateConfigurationSetEventDestinationCommand)
        .resolves({});
      sesClientMock.on(CreateEmailIdentityCommand).resolves({});

      await expect(
        addDomain({ domain: "test.com", yes: true })
      ).resolves.not.toThrow();
    });
  });

  describe("addDomain - tracking domain", () => {
    beforeEach(() => {
      const notFoundError = new Error("Not found");
      notFoundError.name = "NotFoundException";
      sesClientMock
        .on(GetEmailIdentityCommand)
        .rejectsOnce(notFoundError)
        .resolvesOnce({
          DkimAttributes: { Tokens: ["tok1"], Status: "PENDING" },
        });
      sesClientMock.on(CreateConfigurationSetCommand).resolves({});
      sesClientMock
        .on(CreateConfigurationSetEventDestinationCommand)
        .resolves({});
      sesClientMock.on(CreateEmailIdentityCommand).resolves({});
      sesClientMock.on(PutEmailIdentityMailFromAttributesCommand).resolves({});
    });

    it("Unit 1: --yes defaults to track.<domain> and applies it", async () => {
      sesClientMock.on(PutConfigurationSetTrackingOptionsCommand).resolves({});

      const metadata = await import("../../utils/shared/metadata");

      await addDomain({ domain: "test.com", yes: true });

      const putCalls = sesClientMock.commandCalls(
        PutConfigurationSetTrackingOptionsCommand
      );
      expect(putCalls.length).toBe(1);
      expect(putCalls[0].args[0].input).toEqual({
        ConfigurationSetName: domainToConfigSetName("test.com"),
        CustomRedirectDomain: "track.test.com",
      });
      expect(metadata.addDomainToMetadata).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          trackingDomain: "track.test.com",
          trackingDomainAppliedAt: expect.any(String),
        })
      );
    });

    it("Unit 2: --tracking-domain none skips the SES call and metadata field", async () => {
      const metadata = await import("../../utils/shared/metadata");

      await addDomain({
        domain: "test.com",
        yes: true,
        trackingDomain: "none",
      });

      expect(
        sesClientMock.commandCalls(PutConfigurationSetTrackingOptionsCommand)
          .length
      ).toBe(0);
      expect(metadata.addDomainToMetadata).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ trackingDomain: undefined })
      );
    });

    it("Unit 3: --tracking-domain <host> uses the given host", async () => {
      sesClientMock.on(PutConfigurationSetTrackingOptionsCommand).resolves({});

      await addDomain({
        domain: "test.com",
        yes: true,
        trackingDomain: "links.test.com",
      });

      const putCalls = sesClientMock.commandCalls(
        PutConfigurationSetTrackingOptionsCommand
      );
      expect(putCalls.length).toBe(1);
      expect(putCalls[0].args[0].input).toMatchObject({
        CustomRedirectDomain: "links.test.com",
      });
    });

    it("Unit 4: a tracking domain outside the sending domain is rejected", async () => {
      await expect(
        addDomain({
          domain: "test.com",
          yes: true,
          trackingDomain: "track.other.com",
        })
      ).rejects.toMatchObject({ code: "INVALID_TRACKING_DOMAIN" });

      expect(
        sesClientMock.commandCalls(PutConfigurationSetTrackingOptionsCommand)
          .length
      ).toBe(0);
    });

    it("Unit 5: SES BadRequestException (domain not verified yet) does not throw", async () => {
      const badRequest = Object.assign(new Error("not verified"), {
        name: "BadRequestException",
      });
      sesClientMock
        .on(PutConfigurationSetTrackingOptionsCommand)
        .rejects(badRequest);

      const metadata = await import("../../utils/shared/metadata");

      await expect(
        addDomain({ domain: "test.com", yes: true })
      ).resolves.not.toThrow();

      expect(metadata.addDomainToMetadata).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          trackingDomain: "track.test.com",
          trackingDomainAppliedAt: undefined,
        })
      );
    });

    it("Unit 6: the tracking domain is passed through to buildEmailDNSRecords", async () => {
      const dns = await import("../../utils/dns/index");
      vi.mocked(dns.getDNSCredentials).mockResolvedValueOnce({
        valid: false,
        credentials: undefined,
      } as never);
      sesClientMock.on(PutConfigurationSetTrackingOptionsCommand).resolves({});

      await addDomain({ domain: "test.com", yes: true });

      expect(dns.buildEmailDNSRecords).toHaveBeenCalledWith(
        expect.objectContaining({ customTrackingDomain: "track.test.com" })
      );
    });
  });

  describe("addDomain - tracking HTTPS", () => {
    beforeEach(() => {
      const notFoundError = new Error("Not found");
      notFoundError.name = "NotFoundException";
      sesClientMock
        .on(GetEmailIdentityCommand)
        .rejectsOnce(notFoundError)
        .resolvesOnce({
          DkimAttributes: { Tokens: ["tok1"], Status: "PENDING" },
        });
      sesClientMock.on(CreateConfigurationSetCommand).resolves({});
      sesClientMock
        .on(CreateConfigurationSetEventDestinationCommand)
        .resolves({});
      sesClientMock.on(CreateEmailIdentityCommand).resolves({});
      sesClientMock.on(PutEmailIdentityMailFromAttributesCommand).resolves({});
      sesClientMock.on(PutConfigurationSetTrackingOptionsCommand).resolves({});
    });

    it("Unit 1: --yes defaults HTTPS on — provisionTrackingHttps is called and the metadata entry carries trackingHttps", async () => {
      const trackingHttps = await import("../../utils/email/tracking-https");
      const metadata = await import("../../utils/shared/metadata");

      await addDomain({ domain: "test.com", yes: true });

      expect(trackingHttps.provisionTrackingHttps).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: "test.com",
          trackingDomain: "track.test.com",
        })
      );
      expect(metadata.addDomainToMetadata).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          trackingHttps: expect.objectContaining({ status: "pending" }),
        })
      );
    });

    it("Unit 2: --no-tracking-https skips provisionTrackingHttps entirely", async () => {
      const originalArgv = process.argv;
      process.argv = [...originalArgv, "--no-tracking-https"];
      try {
        const trackingHttps = await import("../../utils/email/tracking-https");
        const metadata = await import("../../utils/shared/metadata");

        await addDomain({ domain: "test.com", yes: true });

        expect(trackingHttps.provisionTrackingHttps).not.toHaveBeenCalled();
        expect(metadata.addDomainToMetadata).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({ trackingHttps: undefined })
        );
      } finally {
        process.argv = originalArgv;
      }
    });

    it("Unit 3: pending HTTPS prints the config --tracking-https hint and uses the awstrack.me CNAME target", async () => {
      const dns = await import("../../utils/dns/index");
      vi.mocked(dns.getDNSCredentials).mockResolvedValueOnce({
        valid: false,
        credentials: undefined,
      } as never);
      const clack = await import("@clack/prompts");
      const infoSpy = vi.mocked(clack.log.info);

      await addDomain({ domain: "test.com", yes: true });

      expect(dns.buildEmailDNSRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          trackingCnameTarget: "r.us-east-1.awstrack.me",
        })
      );
      const hinted = infoSpy.mock.calls.some((call) =>
        String(call[0]).includes("wraps email domains config")
      );
      expect(hinted).toBe(true);
    });

    it("Unit 4: active HTTPS uses the CloudFront distribution domain as the CNAME target", async () => {
      const trackingHttps = await import("../../utils/email/tracking-https");
      vi.mocked(trackingHttps.provisionTrackingHttps).mockResolvedValueOnce({
        trackingHttps: {
          certificateArn: "arn:aws:acm:active",
          status: "active",
          distributionId: "DIST123",
          distributionDomain: "dabc123.cloudfront.net",
        },
        cnameTarget: "dabc123.cloudfront.net",
        dnsRecordsToShow: [],
      });
      const dns = await import("../../utils/dns/index");
      vi.mocked(dns.getDNSCredentials).mockResolvedValueOnce({
        valid: false,
        credentials: undefined,
      } as never);

      await addDomain({ domain: "test.com", yes: true });

      expect(dns.buildEmailDNSRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          trackingCnameTarget: "dabc123.cloudfront.net",
        })
      );
    });

    it("Unit 5: an AccessDenied failure degrades instead of aborting — metadata is still saved with no trackingHttps", async () => {
      const trackingHttps = await import("../../utils/email/tracking-https");
      const accessDenied = Object.assign(new Error("not authorized"), {
        name: "AccessDenied",
      });
      vi.mocked(trackingHttps.provisionTrackingHttps).mockRejectedValueOnce(
        accessDenied
      );
      const dns = await import("../../utils/dns/index");
      vi.mocked(dns.getDNSCredentials).mockResolvedValueOnce({
        valid: false,
        credentials: undefined,
      } as never);
      const metadata = await import("../../utils/shared/metadata");

      await expect(
        addDomain({ domain: "test.com", yes: true })
      ).resolves.not.toThrow();

      expect(metadata.addDomainToMetadata).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ trackingHttps: undefined })
      );
      expect(dns.buildEmailDNSRecords).toHaveBeenCalledWith(
        expect.objectContaining({ trackingCnameTarget: undefined })
      );
    });
  });

  describe("configDomain", () => {
    const defaultEventBusArn =
      "arn:aws:events:us-east-1:123456789012:event-bus/default";
    const configSetName = domainToConfigSetName("test.com");

    const metadataWithDomain = {
      version: "1.0.0",
      accountId: "123456789012",
      region: "us-east-1",
      provider: "vercel",
      timestamp: new Date().toISOString(),
      services: {
        email: {
          config: {
            domain: "primary.com",
            additionalDomains: [
              {
                domain: "test.com",
                configSetName,
                addedAt: new Date().toISOString(),
              },
            ],
          },
          deployedAt: new Date().toISOString(),
        },
      },
    };

    it("Unit 1: opens:false clicks:false → UpdateCommand excludes OPEN+CLICK, saves metadata", async () => {
      const metadata = await import("../../utils/shared/metadata");
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValueOnce(
        metadataWithDomain as any
      );

      sesClientMock.on(GetConfigurationSetEventDestinationsCommand).resolves({
        EventDestinations: [
          {
            Name: "wraps-email-eventbridge",
            Enabled: true,
            MatchingEventTypes: ["SEND", "DELIVERY", "OPEN", "CLICK"],
            EventBridgeDestination: { EventBusArn: defaultEventBusArn },
          },
        ],
      });
      sesClientMock
        .on(UpdateConfigurationSetEventDestinationCommand)
        .resolves({});

      await configDomain({ domain: "test.com", opens: false, clicks: false });

      const getCalls = sesClientMock.commandCalls(
        GetConfigurationSetEventDestinationsCommand
      );
      expect(getCalls.length).toBe(1);
      expect(getCalls[0].args[0].input.ConfigurationSetName).toBe(
        configSetName
      );

      const updateCalls = sesClientMock.commandCalls(
        UpdateConfigurationSetEventDestinationCommand
      );
      expect(updateCalls.length).toBe(1);
      expect(updateCalls[0].args[0].input).toMatchObject({
        ConfigurationSetName: configSetName,
        EventDestinationName: "wraps-email-eventbridge",
        EventDestination: expect.objectContaining({
          Enabled: true,
          MatchingEventTypes: expect.not.arrayContaining(["OPEN", "CLICK"]),
        }),
      });
      expect(
        updateCalls[0].args[0].input.EventDestination?.MatchingEventTypes
      ).toContain("SEND");
      expect(
        updateCalls[0].args[0].input.EventDestination?.MatchingEventTypes
      ).toContain("DELIVERY");

      expect(metadata.saveConnectionMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          services: expect.objectContaining({
            email: expect.objectContaining({
              config: expect.objectContaining({
                additionalDomains: expect.arrayContaining([
                  expect.objectContaining({
                    domain: "test.com",
                    trackingConfig: { opens: false, clicks: false },
                  }),
                ]),
              }),
            }),
          }),
        })
      );
    });

    it("Unit 2: opens:true clicks:true → UpdateCommand includes OPEN+CLICK", async () => {
      const metadata = await import("../../utils/shared/metadata");
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValueOnce(
        metadataWithDomain as any
      );

      sesClientMock.on(GetConfigurationSetEventDestinationsCommand).resolves({
        EventDestinations: [
          {
            Name: "wraps-email-eventbridge",
            Enabled: true,
            MatchingEventTypes: ["SEND", "DELIVERY"],
            EventBridgeDestination: { EventBusArn: defaultEventBusArn },
          },
        ],
      });
      sesClientMock
        .on(UpdateConfigurationSetEventDestinationCommand)
        .resolves({});

      await configDomain({ domain: "test.com", opens: true, clicks: true });

      const getCalls = sesClientMock.commandCalls(
        GetConfigurationSetEventDestinationsCommand
      );
      expect(getCalls.length).toBe(1);
      expect(getCalls[0].args[0].input.ConfigurationSetName).toBe(
        configSetName
      );

      const updateCalls = sesClientMock.commandCalls(
        UpdateConfigurationSetEventDestinationCommand
      );
      expect(updateCalls.length).toBe(1);
      expect(updateCalls[0].args[0].input).toMatchObject({
        ConfigurationSetName: configSetName,
        EventDestinationName: "wraps-email-eventbridge",
        EventDestination: expect.objectContaining({
          Enabled: true,
          MatchingEventTypes: expect.arrayContaining([
            "OPEN",
            "CLICK",
            "SEND",
            "DELIVERY",
          ]),
        }),
      });

      expect(metadata.saveConnectionMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          services: expect.objectContaining({
            email: expect.objectContaining({
              config: expect.objectContaining({
                additionalDomains: expect.arrayContaining([
                  expect.objectContaining({
                    domain: "test.com",
                    trackingConfig: { opens: true, clicks: true },
                  }),
                ]),
              }),
            }),
          }),
        })
      );
    });

    it("Unit 3: exits when domain entry has no configSetName — no SES calls", async () => {
      const metadata = await import("../../utils/shared/metadata");
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValueOnce({
        ...metadataWithDomain,
        services: {
          email: {
            config: {
              domain: "primary.com",
              additionalDomains: [
                {
                  domain: "test.com",
                  addedAt: new Date().toISOString(),
                  // no configSetName
                },
              ],
            },
            deployedAt: new Date().toISOString(),
          },
        },
      } as any);

      await configDomain({ domain: "test.com", opens: false, clicks: false });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(
        sesClientMock.commandCalls(GetConfigurationSetEventDestinationsCommand)
          .length
      ).toBe(0);
    });

    it("Unit 4: exits when domain not found in additionalDomains", async () => {
      const metadata = await import("../../utils/shared/metadata");
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValueOnce({
        ...metadataWithDomain,
        services: {
          email: {
            config: {
              domain: "primary.com",
              additionalDomains: [],
            },
            deployedAt: new Date().toISOString(),
          },
        },
      } as any);

      await configDomain({ domain: "test.com", opens: false, clicks: false });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(
        sesClientMock.commandCalls(GetConfigurationSetEventDestinationsCommand)
          .length
      ).toBe(0);
    });

    it("Unit 5: JSON mode without --domain throws MISSING_REQUIRED_FLAG", async () => {
      const metadata = await import("../../utils/shared/metadata");
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValueOnce(
        metadataWithDomain as any
      );

      await expect(
        configDomain({ opens: false, clicks: false, json: true })
      ).rejects.toThrow("--domain flag is required");
    });

    it("Unit 8: exits when event destination has no EventBridgeDestination", async () => {
      const metadata = await import("../../utils/shared/metadata");
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValueOnce(
        metadataWithDomain as any
      );

      sesClientMock.on(GetConfigurationSetEventDestinationsCommand).resolves({
        EventDestinations: [
          {
            Name: "wraps-email-eventbridge",
            Enabled: true,
            MatchingEventTypes: ["SEND", "DELIVERY"],
            // no EventBridgeDestination
          },
        ],
      });

      await configDomain({ domain: "test.com", opens: false, clicks: false });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(
        sesClientMock.commandCalls(
          UpdateConfigurationSetEventDestinationCommand
        ).length
      ).toBe(0);
    });

    it("Unit 10: no --domain in interactive mode → prompts to select domain", async () => {
      const metadata = await import("../../utils/shared/metadata");
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValueOnce(
        metadataWithDomain as any
      );

      const clack = await import("@clack/prompts");
      vi.mocked(clack.select).mockResolvedValueOnce("test.com" as never);

      sesClientMock.on(GetConfigurationSetEventDestinationsCommand).resolves({
        EventDestinations: [
          {
            Name: "wraps-email-eventbridge",
            Enabled: true,
            MatchingEventTypes: ["SEND", "DELIVERY"],
            EventBridgeDestination: { EventBusArn: defaultEventBusArn },
          },
        ],
      });
      sesClientMock
        .on(UpdateConfigurationSetEventDestinationCommand)
        .resolves({});

      // opens/clicks also passed so we skip the confirm prompts and go straight to SES
      await configDomain({ opens: true, clicks: false });

      const updateCalls = sesClientMock.commandCalls(
        UpdateConfigurationSetEventDestinationCommand
      );
      expect(updateCalls.length).toBe(1);
      expect(updateCalls[0].args[0].input.ConfigurationSetName).toBe(
        configSetName
      );
      const newTypes =
        updateCalls[0].args[0].input.EventDestination?.MatchingEventTypes ?? [];
      expect(newTypes).toContain("OPEN");
      expect(newTypes).not.toContain("CLICK");
    });

    it("Unit 11: no --domain → primary domain appears in select and updates its config set", async () => {
      const metadata = await import("../../utils/shared/metadata");
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValueOnce(
        metadataWithDomain as any
      );

      const clack = await import("@clack/prompts");
      vi.mocked(clack.select).mockResolvedValueOnce("primary.com" as never);

      const primaryConfigSetName = domainToConfigSetName("primary.com");

      sesClientMock.on(GetConfigurationSetEventDestinationsCommand).resolves({
        EventDestinations: [
          {
            Name: "wraps-email-eventbridge",
            Enabled: true,
            MatchingEventTypes: ["SEND", "DELIVERY"],
            EventBridgeDestination: { EventBusArn: defaultEventBusArn },
          },
        ],
      });
      sesClientMock
        .on(UpdateConfigurationSetEventDestinationCommand)
        .resolves({});

      await configDomain({ opens: true, clicks: false });

      const updateCalls = sesClientMock.commandCalls(
        UpdateConfigurationSetEventDestinationCommand
      );
      expect(updateCalls.length).toBe(1);
      expect(updateCalls[0].args[0].input.ConfigurationSetName).toBe(
        primaryConfigSetName
      );
      const newTypes =
        updateCalls[0].args[0].input.EventDestination?.MatchingEventTypes ?? [];
      expect(newTypes).toContain("OPEN");
      expect(newTypes).not.toContain("CLICK");
      // Metadata timestamp is updated and saved
      expect(metadata.saveConnectionMetadata).toHaveBeenCalled();
      // No additionalDomain entry exists for "primary.com" — it only lives in config.domain
      const savedArg = vi.mocked(metadata.saveConnectionMetadata).mock
        .calls[0][0] as any;
      const savedAdditional =
        savedArg?.services?.email?.config?.additionalDomains ?? [];
      expect(savedAdditional.some((d: any) => d.domain === "primary.com")).toBe(
        false
      );
    });

    it("Unit 9: no flags in interactive mode → shows menu, selects tracking, prompts and uses answers", async () => {
      const metadata = await import("../../utils/shared/metadata");
      vi.mocked(metadata.loadConnectionMetadata).mockResolvedValueOnce(
        metadataWithDomain as any
      );

      const clack = await import("@clack/prompts");
      // Menu: pick "tracking" group, then "done"
      vi.mocked(clack.select)
        .mockResolvedValueOnce("tracking" as never)
        .mockResolvedValueOnce("done" as never);
      vi.mocked(clack.confirm)
        .mockResolvedValueOnce(true) // opens: yes
        .mockResolvedValueOnce(false); // clicks: no

      sesClientMock.on(GetConfigurationSetCommand).resolves({});
      sesClientMock.on(GetConfigurationSetEventDestinationsCommand).resolves({
        EventDestinations: [
          {
            Name: "wraps-email-eventbridge",
            Enabled: true,
            MatchingEventTypes: ["SEND", "DELIVERY"],
            EventBridgeDestination: { EventBusArn: defaultEventBusArn },
          },
        ],
      });
      sesClientMock
        .on(UpdateConfigurationSetEventDestinationCommand)
        .resolves({});

      await configDomain({ domain: "test.com" });

      const updateCalls = sesClientMock.commandCalls(
        UpdateConfigurationSetEventDestinationCommand
      );
      expect(updateCalls.length).toBe(1);
      const newTypes =
        updateCalls[0].args[0].input.EventDestination?.MatchingEventTypes ?? [];
      expect(newTypes).toContain("OPEN");
      expect(newTypes).not.toContain("CLICK");

      expect(metadata.saveConnectionMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          services: expect.objectContaining({
            email: expect.objectContaining({
              config: expect.objectContaining({
                additionalDomains: expect.arrayContaining([
                  expect.objectContaining({
                    domain: "test.com",
                    trackingConfig: { opens: true, clicks: false },
                  }),
                ]),
              }),
            }),
          }),
        })
      );
    });
  });
});
