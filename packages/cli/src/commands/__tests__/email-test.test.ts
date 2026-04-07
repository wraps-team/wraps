import {
  GetEmailIdentityCommand,
  SESv2Client,
  SendEmailCommand,
} from "@aws-sdk/client-sesv2";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../utils/shared/json-output.js";
import { emailTest } from "../email/test.js";

const sesv2Mock = mockClient(SESv2Client);

// Mock clack
vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  log: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    step: vi.fn(),
  },
  note: vi.fn(),
  select: vi.fn(),
  text: vi.fn(),
  confirm: vi.fn(),
  isCancel: vi.fn().mockReturnValue(false),
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

// Mock metadata module — re-export real getAllTrackedDomains since it's pure logic
vi.mock("../../utils/shared/metadata.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../utils/shared/metadata.js")>();
  return {
    ...actual,
    loadConnectionMetadata: vi.fn().mockResolvedValue(null),
  };
});

// Mock telemetry
vi.mock("../../telemetry/events.js", () => ({
  trackCommand: vi.fn(),
  trackError: vi.fn(),
}));

// Mock AWS utilities
vi.mock("../../utils/shared/aws.js", () => ({
  getAWSRegion: vi.fn().mockResolvedValue("us-east-1"),
  validateAWSCredentials: vi.fn().mockResolvedValue({
    accountId: "123456789012",
    userId: "AIDAI123456789",
    arn: "arn:aws:iam::123456789012:user/test",
  }),
}));

// Mock verification utilities
vi.mock("../../utils/email/verification.js", () => ({
  pollDomainVerification: vi.fn().mockResolvedValue(true),
  verifySandboxRecipient: vi
    .fn()
    .mockResolvedValue({ verified: true, email: "user@example.com" }),
}));

const MOCK_METADATA = {
  version: "1.0.0",
  accountId: "123456789012",
  region: "us-east-1",
  provider: "other" as const,
  timestamp: "2024-01-01T00:00:00.000Z",
  services: {
    email: {
      config: {
        domain: "example.com",
        sendingEnabled: true,
      },
      preset: "starter" as const,
      deployedAt: "2024-01-01T00:00:00.000Z",
    },
  },
};

describe("email test command", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sesv2Mock.reset();
    vi.clearAllMocks();

    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it("should send test email with simulator address via --to flag", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(MOCK_METADATA);

    sesv2Mock.on(SendEmailCommand).resolves({
      MessageId: "test-message-id-123",
    });

    await emailTest({
      to: "success@simulator.amazonses.com",
    });

    // Verify SES was called with correct params
    const calls = sesv2Mock.commandCalls(SendEmailCommand);
    expect(calls).toHaveLength(1);

    const input = calls[0].args[0].input;
    expect(input.FromEmailAddress).toBe("test@example.com");
    expect(input.Destination?.ToAddresses).toEqual([
      "success@simulator.amazonses.com",
    ]);
    expect(input.ConfigurationSetName).toBe("wraps-email-tracking");
    expect(input.Content?.Simple?.Subject?.Data).toBe("Test email from Wraps");
  });

  it("should send test email with --scenario flag", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(MOCK_METADATA);

    sesv2Mock.on(SendEmailCommand).resolves({
      MessageId: "test-bounce-id-456",
    });

    await emailTest({
      scenario: "bounce",
    });

    const calls = sesv2Mock.commandCalls(SendEmailCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.Destination?.ToAddresses).toEqual([
      "bounce@simulator.amazonses.com",
    ]);
  });

  it("should exit with error when no email infrastructure found", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(null);

    await emailTest({ to: "success@simulator.amazonses.com" });

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should exit with error when metadata has no email service", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue({
      ...MOCK_METADATA,
      services: {},
    });

    await emailTest({ to: "success@simulator.amazonses.com" });

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should use additionalDomains when primary domain is not set", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue({
      ...MOCK_METADATA,
      services: {
        email: {
          config: {
            sendingEnabled: true,
            additionalDomains: [
              {
                domain: "added-later.com",
                addedAt: "2024-01-02T00:00:00.000Z",
                purpose: "transactional" as const,
              },
            ],
          },
          preset: "starter" as const,
          deployedAt: "2024-01-01T00:00:00.000Z",
        },
      },
    });

    sesv2Mock.on(SendEmailCommand).resolves({
      MessageId: "test-additional-domain-id",
    });

    await emailTest({
      to: "success@simulator.amazonses.com",
    });

    // Should NOT have exited
    expect(exitSpy).not.toHaveBeenCalled();

    // Should have used the additionalDomain
    const calls = sesv2Mock.commandCalls(SendEmailCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.FromEmailAddress).toBe(
      "test@added-later.com"
    );
  });

  it("should prompt domain selection when multiple domains exist", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue({
      ...MOCK_METADATA,
      services: {
        email: {
          config: {
            domain: "primary.com",
            sendingEnabled: true,
            additionalDomains: [
              {
                domain: "secondary.com",
                addedAt: "2024-01-02T00:00:00.000Z",
                purpose: "marketing" as const,
              },
            ],
          },
          preset: "starter" as const,
          deployedAt: "2024-01-01T00:00:00.000Z",
        },
      },
    });

    const clack = await import("@clack/prompts");
    vi.mocked(clack.select).mockResolvedValue("secondary.com");

    sesv2Mock.on(SendEmailCommand).resolves({
      MessageId: "test-multi-domain-id",
    });

    await emailTest({
      to: "success@simulator.amazonses.com",
    });

    // Should have prompted for domain selection
    expect(clack.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Which domain do you want to send from?",
      })
    );

    // Should have used the selected domain
    const calls = sesv2Mock.commandCalls(SendEmailCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.FromEmailAddress).toBe("test@secondary.com");
  });

  it("should handle MessageRejected error for unverified address", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(MOCK_METADATA);

    const error = new Error(
      "Email address is not verified. The following identities failed the check in region US-EAST-1: user@unverified.com"
    );
    error.name = "MessageRejected";
    sesv2Mock.on(SendEmailCommand).rejects(error);

    const clack = await import("@clack/prompts");

    await emailTest({ to: "user@unverified.com" });

    expect(clack.log.error).toHaveBeenCalledWith(
      "Email address is not verified"
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should handle MailFromDomainNotVerifiedException", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(MOCK_METADATA);

    const error = new Error("Mail from domain not verified");
    error.name = "MailFromDomainNotVerifiedException";
    sesv2Mock.on(SendEmailCommand).rejects(error);

    const clack = await import("@clack/prompts");

    await emailTest({ to: "success@simulator.amazonses.com" });

    expect(clack.log.error).toHaveBeenCalledWith(
      "Sending domain is not verified"
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should track telemetry on success", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(MOCK_METADATA);

    sesv2Mock.on(SendEmailCommand).resolves({
      MessageId: "test-id",
    });

    const { trackCommand } = await import("../../telemetry/events.js");

    await emailTest({ to: "success@simulator.amazonses.com" });

    expect(trackCommand).toHaveBeenCalledWith(
      "email:test",
      expect.objectContaining({
        success: true,
        is_simulator: true,
      })
    );
  });

  it("should track telemetry on failure", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(MOCK_METADATA);

    sesv2Mock.on(SendEmailCommand).rejects(new Error("Some SES error"));

    const { trackError, trackCommand } = await import(
      "../../telemetry/events.js"
    );

    await emailTest({ to: "success@simulator.amazonses.com" });

    expect(trackError).toHaveBeenCalledWith(
      "EMAIL_SEND_FAILED",
      "email:test",
      expect.objectContaining({ error: "Some SES error" })
    );
    expect(trackCommand).toHaveBeenCalledWith(
      "email:test",
      expect.objectContaining({ success: false })
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("postDeploy + unverified domain: offers to wait, proceeds after verified", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(MOCK_METADATA);

    const clack = await import("@clack/prompts");
    vi.mocked(clack.confirm).mockResolvedValue(true);

    // Domain starts unverified
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: false,
      DkimAttributes: { Status: "PENDING" },
    });

    // Mock pollDomainVerification to return true (verified)
    const { pollDomainVerification } = await import(
      "../../utils/email/verification.js"
    );
    vi.mocked(pollDomainVerification).mockResolvedValue(true);

    sesv2Mock.on(SendEmailCommand).resolves({
      MessageId: "test-post-deploy-id",
    });

    await emailTest({
      to: "success@simulator.amazonses.com",
      postDeploy: true,
    });

    // Should have called pollDomainVerification
    expect(pollDomainVerification).toHaveBeenCalledWith(
      "example.com",
      "us-east-1"
    );

    // Should have sent the email after verification
    const sendCalls = sesv2Mock.commandCalls(SendEmailCommand);
    expect(sendCalls).toHaveLength(1);

    // Should NOT have called process.exit
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("postDeploy + unverified domain + user declines: graceful exit (no process.exit)", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(MOCK_METADATA);

    const clack = await import("@clack/prompts");
    vi.mocked(clack.confirm).mockResolvedValue(false);

    // Domain is unverified
    sesv2Mock.on(GetEmailIdentityCommand).resolves({
      VerifiedForSendingStatus: false,
      DkimAttributes: { Status: "PENDING" },
    });

    await emailTest({
      to: "success@simulator.amazonses.com",
      postDeploy: true,
    });

    // Should NOT have called process.exit (graceful return)
    expect(exitSpy).not.toHaveBeenCalled();

    // Should NOT have attempted to send email
    const sendCalls = sesv2Mock.commandCalls(SendEmailCommand);
    expect(sendCalls).toHaveLength(0);
  });

  it("isSandbox + custom email: offers recipient verification", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(MOCK_METADATA);

    const clack = await import("@clack/prompts");
    vi.mocked(clack.confirm).mockResolvedValue(true);

    const { verifySandboxRecipient } = await import(
      "../../utils/email/verification.js"
    );
    vi.mocked(verifySandboxRecipient).mockResolvedValue({
      verified: true,
      email: "user@example.com",
    });

    sesv2Mock.on(SendEmailCommand).resolves({
      MessageId: "test-sandbox-id",
    });

    await emailTest({
      to: "user@example.com",
      isSandbox: true,
    });

    // Should have called verifySandboxRecipient
    expect(verifySandboxRecipient).toHaveBeenCalledWith(
      "user@example.com",
      "us-east-1"
    );

    // Should have sent the email after verification
    const sendCalls = sesv2Mock.commandCalls(SendEmailCommand);
    expect(sendCalls).toHaveLength(1);
  });

  it("isSandbox + simulator email: skips recipient verification", async () => {
    const { loadConnectionMetadata } = await import(
      "../../utils/shared/metadata.js"
    );
    vi.mocked(loadConnectionMetadata).mockResolvedValue(MOCK_METADATA);

    const { verifySandboxRecipient } = await import(
      "../../utils/email/verification.js"
    );

    sesv2Mock.on(SendEmailCommand).resolves({
      MessageId: "test-simulator-id",
    });

    await emailTest({
      to: "success@simulator.amazonses.com",
      isSandbox: true,
    });

    // Should NOT have called verifySandboxRecipient for simulator addresses
    expect(verifySandboxRecipient).not.toHaveBeenCalled();

    // Should have sent the email directly
    const sendCalls = sesv2Mock.commandCalls(SendEmailCommand);
    expect(sendCalls).toHaveLength(1);
  });

  describe("JSON output", () => {
    beforeEach(() => {
      setJsonMode(true);
    });

    afterEach(() => {
      setJsonMode(false);
    });

    it("should not prompt for domain selection in JSON mode with multiple domains", async () => {
      const { loadConnectionMetadata } = await import(
        "../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue({
        ...MOCK_METADATA,
        services: {
          email: {
            config: {
              domain: "primary.com",
              sendingEnabled: true,
              additionalDomains: [
                {
                  domain: "secondary.com",
                  addedAt: "2024-01-02T00:00:00.000Z",
                  purpose: "marketing" as const,
                },
              ],
            },
            preset: "starter" as const,
            deployedAt: "2024-01-01T00:00:00.000Z",
          },
        },
      });

      sesv2Mock.on(SendEmailCommand).resolves({
        MessageId: "test-json-multi-domain-id",
      });

      const clack = await import("@clack/prompts");

      await emailTest({
        to: "success@simulator.amazonses.com",
        json: true,
      });

      expect(clack.select).not.toHaveBeenCalled();

      const calls = sesv2Mock.commandCalls(SendEmailCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.FromEmailAddress).toBe("test@primary.com");
    });

    it("should output JSON envelope with messageId on success", async () => {
      const { loadConnectionMetadata } = await import(
        "../../utils/shared/metadata.js"
      );
      vi.mocked(loadConnectionMetadata).mockResolvedValue(MOCK_METADATA);

      sesv2Mock.on(SendEmailCommand).resolves({
        MessageId: "test-json-id-789",
      });

      await emailTest({
        to: "success@simulator.amazonses.com",
        json: true,
      });

      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          const parsed = JSON.parse(call[0]);
          return parsed.command === "email.test";
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const output = JSON.parse(jsonCall![0]);
      expect(output.success).toBe(true);
      expect(output.command).toBe("email.test");
      expect(output.data).toBeDefined();
      expect(output.data.messageId).toBe("test-json-id-789");
    });
  });
});
