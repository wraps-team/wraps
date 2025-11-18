import {
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  GetEmailIdentityCommand,
  ListEmailIdentitiesCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addDomain,
  getDkim,
  listDomains,
  removeDomain,
  verifyDomain,
} from "../email/domains";

const sesClientMock = mockClient(SESv2Client);

// Mock process.exit
const mockExit = vi
  .spyOn(process, "exit")
  .mockImplementation((() => {}) as any);

// Mock @clack/prompts
vi.mock("@clack/prompts");

// Mock utils
vi.mock("../../utils/shared/aws", () => ({
  getAWSRegion: vi.fn().mockResolvedValue("us-east-1"),
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
      // Mock domain doesn't exist (first call)
      const notFoundError = new Error("Not found");
      notFoundError.name = "NotFoundException";
      sesClientMock
        .on(GetEmailIdentityCommand)
        .rejectsOnce(notFoundError)
        // Mock getting DKIM tokens after creation (second call)
        .resolvesOnce({
          DkimAttributes: {
            Tokens: ["token1", "token2", "token3"],
            Status: "PENDING",
          },
        });

      // Mock successful creation
      sesClientMock.on(CreateEmailIdentityCommand).resolves({});

      await addDomain({ domain: "test.com" });

      // Verify CreateEmailIdentityCommand was called
      const createCalls = sesClientMock.commandCalls(
        CreateEmailIdentityCommand
      );
      expect(createCalls.length).toBe(1);
      expect(createCalls[0].args[0].input).toMatchObject({
        EmailIdentity: "test.com",
        DkimSigningAttributes: {
          NextSigningKeyLength: "RSA_2048_BIT",
        },
      });
    });

    it("should handle domain already exists gracefully", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        DkimAttributes: {
          Tokens: ["token1"],
          Status: "SUCCESS",
        },
      });

      const clack = await import("@clack/prompts");

      await addDomain({ domain: "existing.com" });

      expect(clack.log.warn).toHaveBeenCalledWith(
        "Domain existing.com already exists in SES"
      );
    });

    it("should handle AWS errors", async () => {
      sesClientMock
        .on(GetEmailIdentityCommand)
        .rejects(new Error("AWS Service Error"));

      await expect(addDomain({ domain: "test.com" })).rejects.toThrow(
        "AWS Service Error"
      );
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

      await removeDomain({ domain: "test.com" });

      const deleteCalls = sesClientMock.commandCalls(
        DeleteEmailIdentityCommand
      );
      expect(deleteCalls.length).toBe(1);
      expect(deleteCalls[0].args[0].input.EmailIdentity).toBe("test.com");
    });

    it("should skip confirmation with --yes flag", async () => {
      sesClientMock.on(GetEmailIdentityCommand).resolves({
        VerifiedForSendingStatus: true,
      });

      sesClientMock.on(DeleteEmailIdentityCommand).resolves({});

      const clack = await import("@clack/prompts");

      await removeDomain({ domain: "test.com", yes: true });

      // confirm should not be called when yes=true
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
      await removeDomain({ domain: "nonexistent.com", yes: true });

      expect(mockExit).toHaveBeenCalledWith(1);
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
  });
});
