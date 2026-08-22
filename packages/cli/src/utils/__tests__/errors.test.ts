import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../telemetry/events.js", () => ({ trackError: vi.fn() }));

import * as clack from "@clack/prompts";
import { trackError } from "../../telemetry/events.js";
import {
  awsErrorToWrapsError,
  errors,
  handleCLIError,
  isAWSError,
  isPulumiError,
  parseAWSError,
  parsePulumiError,
  sanitizeErrorMessage,
  WrapsError,
} from "../shared/errors.js";
import { setJsonMode } from "../shared/json-output.js";

describe("WrapsError", () => {
  it("should create error with all properties", () => {
    const error = new WrapsError(
      "Test error message",
      "TEST_ERROR",
      "Try this suggestion",
      "https://wraps.dev/docs/test"
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(WrapsError);
    expect(error.message).toBe("Test error message");
    expect(error.code).toBe("TEST_ERROR");
    expect(error.suggestion).toBe("Try this suggestion");
    expect(error.docsUrl).toBe("https://wraps.dev/docs/test");
    expect(error.name).toBe("WrapsError");
  });

  it("should create error without optional properties", () => {
    const error = new WrapsError("Test error", "TEST_ERROR");

    expect(error.message).toBe("Test error");
    expect(error.code).toBe("TEST_ERROR");
    expect(error.suggestion).toBeUndefined();
    expect(error.docsUrl).toBeUndefined();
  });
});

describe("handleCLIError", () => {
  let exitSpy: any;
  let consoleErrorSpy: any;
  let consoleLogSpy: any;
  // The message line goes through clack, not console.log. Without this spy the
  // suggestion/docs assertions below still pass with the render deleted, so the
  // one thing the user actually reads would be untested.
  let clackErrorSpy: any;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    clackErrorSpy = vi.spyOn(clack.log, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = undefined;
    exitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    clackErrorSpy.mockRestore();
  });

  it("should handle WrapsError with all properties", () => {
    const error = new WrapsError(
      "AWS credentials not found",
      "NO_AWS_CREDENTIALS",
      "Run: aws configure",
      "https://wraps.dev/docs/credentials"
    );

    handleCLIError(error);

    expect(clackErrorSpy).toHaveBeenCalledWith("AWS credentials not found");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("Suggestion:")
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("Run: aws configure")
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("Documentation:")
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://wraps.dev/docs/credentials")
    );
    expect(process.exitCode).toBe(1);
  });

  it("should handle WrapsError without suggestion and docs", () => {
    const error = new WrapsError("Simple error", "SIMPLE_ERROR");

    handleCLIError(error);

    expect(clackErrorSpy).toHaveBeenCalledWith("Simple error");
    expect(process.exitCode).toBe(1);
  });

  it("should handle unknown errors", () => {
    const error = new Error("Unknown error");

    handleCLIError(error);

    // The message is the ONLY surviving copy of what went wrong: telemetry
    // sends `errorType` alone, and the clack line is the fixed string "An
    // unexpected error occurred". A bare toHaveBeenCalled() here is satisfied
    // by the blank line the same handler emits, so it has to name the text.
    // stringContaining, not toBe: pc.dim is identity under NO_COLOR but wraps
    // the message in ANSI under FORCE_COLOR.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unknown error")
    );
    // ...and the message, not the error object itself.
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(error);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://github.com/wraps-team/wraps/issues")
    );
    expect(process.exitCode).toBe(1);
  });

  it("should handle string errors", () => {
    handleCLIError("String error message");

    // Should log the string error
    expect(consoleErrorSpy).toHaveBeenCalledWith("String error message");
    expect(process.exitCode).toBe(1);
  });

  it("should handle null/undefined errors", () => {
    handleCLIError(null);
    expect(process.exitCode).toBe(1);
    // Mirror of the Error branch: a value that is neither Error nor string has
    // no message to render, so the blank line is all console.error should see.
    expect(consoleErrorSpy.mock.calls).toEqual([[""]]);

    // Sticky global: reset between calls or the second assertion just re-reads
    // the first call's value.
    process.exitCode = undefined;

    handleCLIError(undefined);
    expect(process.exitCode).toBe(1);
  });

  it("should handle WrapsError with only suggestion (no docsUrl)", () => {
    const error = new WrapsError(
      "Error with suggestion",
      "ERROR_WITH_SUGGESTION",
      "Try this fix"
    );

    handleCLIError(error);

    expect(clackErrorSpy).toHaveBeenCalledWith("Error with suggestion");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("Suggestion:")
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("Try this fix")
    );
    expect(process.exitCode).toBe(1);
  });

  it("should handle WrapsError with only docsUrl (no suggestion)", () => {
    const error = new WrapsError(
      "Error with docs",
      "ERROR_WITH_DOCS",
      undefined,
      "https://wraps.dev/docs/error"
    );

    handleCLIError(error);

    expect(clackErrorSpy).toHaveBeenCalledWith("Error with docs");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("Documentation:")
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://wraps.dev/docs/error")
    );
    expect(process.exitCode).toBe(1);
  });

  it("should print blank line before error message", () => {
    const error = new Error("Test error");
    handleCLIError(error);

    expect(consoleErrorSpy).toHaveBeenCalledWith("");
  });

  it("sets process.exitCode and returns instead of exiting, so cli.ts's finally can flush telemetry", () => {
    // process.exit(1) here jumped over run()'s `finally { await
    // telemetry.shutdown() }`, so no error event has ever reached the server.
    handleCLIError(new WrapsError("Test error", "TEST_ERROR"));

    expect(exitSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  // The AWS and Pulumi branches of the human-readable chain used to be covered
  // only by the JSON-mode tests below, which exit through the single JSON tail
  // and never reach either branch. Deleting `process.exitCode = 1` from one of
  // them failed nothing here — a `wraps email upgrade` that died on a Pulumi
  // error printed the error and exited 0, so CI pipelines and `&&` chains read
  // a failed deploy as a success.
  it("sets a non-zero exit code for an AWS error on the human-readable path", () => {
    const error = new Error("Token has expired");
    error.name = "ExpiredTokenException";

    handleCLIError(error, "email.init");

    // Proves this went through the human chain, not the JSON tail.
    expect(clackErrorSpy).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("sets a non-zero exit code for a Pulumi error on the human-readable path", () => {
    const error = new Error("AccessDenied for sqs:CreateQueue");

    handleCLIError(error, "email.upgrade");

    expect(clackErrorSpy).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  describe("handleCLIError JSON mode", () => {
    let clackErrorSpy: any;

    beforeEach(() => {
      setJsonMode(true);
      clackErrorSpy = vi.spyOn(clack.log, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      setJsonMode(false);
      clackErrorSpy.mockRestore();
    });

    it("should output JSON envelope for WrapsError", () => {
      const error = new WrapsError(
        "AWS credentials not found",
        "NO_AWS_CREDENTIALS",
        "Run: aws configure",
        "https://wraps.dev/docs/credentials"
      );

      handleCLIError(error);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output).toEqual({
        success: false,
        command: "unknown",
        error: {
          code: "NO_AWS_CREDENTIALS",
          message: "AWS credentials not found",
          suggestion: "Run: aws configure",
          docsUrl: "https://wraps.dev/docs/credentials",
        },
      });
    });

    it("should output JSON envelope for WrapsError without suggestion/docsUrl", () => {
      const error = new WrapsError("Simple error", "SIMPLE_ERROR");

      handleCLIError(error);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.success).toBe(false);
      expect(output.command).toBe("unknown");
      expect(output.error.code).toBe("SIMPLE_ERROR");
      expect(output.error.message).toBe("Simple error");
      expect(output.error.suggestion).toBeUndefined();
      expect(output.error.docsUrl).toBeUndefined();
    });

    it("should use custom command context in JSON envelope", () => {
      const error = new WrapsError("Test error", "TEST_ERROR");

      handleCLIError(error, "email.init");

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.command).toBe("email.init");
    });

    it("should map AWS errors to JSON envelope", () => {
      const error = new Error("Token has expired");
      error.name = "ExpiredTokenException";

      handleCLIError(error);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.success).toBe(false);
      expect(output.command).toBe("unknown");
      expect(output.error.code).toBe("AWS_ExpiredTokenException");
      expect(output.error.message).toContain("session token has expired");
    });

    it("should NOT report 'AWS credentials not found' for SES MessageRejected", () => {
      // Bug repro: SES SendEmail throws MessageRejected (e.g., recipient not
      // verified in sandbox mode). It has $metadata so isAWSError() returns true.
      // The current default-case in awsErrorToWrapsError lies and says
      // "AWS credentials not found" — but credentials are perfectly valid.
      const error = new Error(
        "Email address is not verified. The following identities failed the check in region US-EAST-1: test@jaststore.com"
      ) as Error & { $metadata: { httpStatusCode: number } };
      error.name = "MessageRejected";
      error.$metadata = { httpStatusCode: 400 };

      handleCLIError(error, "email.inbound.test");

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.success).toBe(false);
      // The user-facing message must not mention missing credentials
      expect(output.error.message).not.toMatch(/credentials not found/i);
      // And the suggestion must not push the user toward `aws configure`
      expect(output.error.suggestion ?? "").not.toMatch(/aws configure/i);
      // Code must be specific to MessageRejected, not the generic credentials code
      expect(output.error.code).not.toBe("NO_AWS_CREDENTIALS");
      expect(output.error.code).toBe("AWS_MessageRejected");
    });

    it("should report a meaningful error for MailFromDomainNotVerifiedException", () => {
      // Bug repro: SES SendEmail throws MailFromDomainNotVerifiedException
      // when the MAIL FROM domain is not verified. Currently maps to
      // "AWS credentials not found" via the default case.
      const error = new Error(
        "Mail from domain mail.example.com is not verified."
      ) as Error & { $metadata: { httpStatusCode: number } };
      error.name = "MailFromDomainNotVerifiedException";
      error.$metadata = { httpStatusCode: 400 };

      handleCLIError(error, "email.inbound.test");

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.success).toBe(false);
      expect(output.error.message).not.toMatch(/credentials not found/i);
      expect(output.error.code).not.toBe("NO_AWS_CREDENTIALS");
      // The user should see a message that points at the sender domain,
      // not at credentials.
      expect(output.error.message.toLowerCase()).toMatch(
        /domain|mail from|verif/
      );
    });

    it("should map Pulumi errors to JSON envelope", () => {
      const error = new Error("AccessDenied for sqs:CreateQueue");

      handleCLIError(error);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.success).toBe(false);
      expect(output.error.code).toBe("PULUMI_SQS_PERMISSION_DENIED");
      expect(output.error.message).toContain("SQS permission denied");
    });

    it("should handle unknown errors in JSON mode", () => {
      const error = new Error("something broke");

      handleCLIError(error);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output).toEqual({
        success: false,
        command: "unknown",
        error: {
          code: "UNKNOWN_ERROR",
          message: "something broke",
        },
      });
    });

    it("should handle string errors in JSON mode", () => {
      handleCLIError("a string error");

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.success).toBe(false);
      expect(output.error.code).toBe("UNKNOWN_ERROR");
      expect(output.error.message).toBe("a string error");
    });

    it("should not call clack.log.error in JSON mode", () => {
      const error = new WrapsError(
        "Some error",
        "SOME_ERROR",
        "Fix it",
        "https://wraps.dev/docs"
      );

      handleCLIError(error);

      expect(clackErrorSpy).not.toHaveBeenCalled();
      // The JSON chain must `return`, not fall through into the human chain.
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it("sets a non-zero exit code in JSON mode instead of exiting, so cli.ts can flush telemetry", () => {
      const error = new WrapsError("Test error", "TEST_ERROR");

      handleCLIError(error);

      expect(process.exitCode).toBe(1);
    });
  });
});

describe("error factory functions", () => {
  describe("noAWSCredentials", () => {
    it("should create proper error", () => {
      const error = errors.noAWSCredentials();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toBe("AWS credentials not found");
      expect(error.code).toBe("NO_AWS_CREDENTIALS");
      expect(error.suggestion).toContain("aws configure sso");
      expect(error.suggestion).toContain("aws configure");
      expect(error.suggestion).toContain("AWS_ACCESS_KEY_ID");
      expect(error.suggestion).toContain("AWS_SECRET_ACCESS_KEY");
      expect(error.suggestion).toContain("AWS_PROFILE");
      // Neutral tone: list options without prescribing one
      expect(error.suggestion).not.toContain("recommended");
      expect(error.docsUrl).toBe("https://wraps.dev/docs/guides/aws-setup");
    });
  });

  describe("stackExists", () => {
    it("should create proper error with stack name", () => {
      const error = errors.stackExists("wraps-123456789-us-east-1");

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("wraps-123456789-us-east-1");
      expect(error.code).toBe("STACK_EXISTS");
      expect(error.suggestion).toContain("wraps email upgrade");
      expect(error.suggestion).toContain(
        "wraps destroy --stack wraps-123456789-us-east-1"
      );
      expect(error.docsUrl).toBe("https://wraps.dev/docs/cli-reference");
    });
  });

  describe("invalidRegion", () => {
    it("should create proper error with region", () => {
      const error = errors.invalidRegion("invalid-region-123");

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("invalid-region-123");
      expect(error.code).toBe("INVALID_REGION");
      expect(error.suggestion).toContain("us-east-1");
      expect(error.docsUrl).toContain("aws.amazon.com");
    });
  });

  describe("unknownCommand", () => {
    it("names the command the user actually typed", () => {
      const error = errors.unknownCommand(
        "command",
        "emial",
        "Available: init, status"
      );

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toBe("Unknown command: emial");
      expect(error.code).toBe("UNKNOWN_COMMAND");
      expect(error.suggestion).toContain("Available: init, status");
      expect(error.docsUrl).toBe("https://wraps.dev/docs/cli-reference");
    });

    it("renders a missing subcommand as (none) rather than undefined", () => {
      const error = errors.unknownCommand(
        "inbound command",
        undefined,
        "Available: init, status"
      );

      expect(error.message).toBe("Unknown inbound command: (none)");
    });
  });

  describe("missingInput", () => {
    it("names the missing flag and hands back the usage line", () => {
      const error = errors.missingInput(
        "--domain",
        "wraps email verify --domain yourapp.com"
      );

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("--domain");
      expect(error.code).toBe("MISSING_REQUIRED_FLAG");
      expect(error.suggestion).toContain(
        "wraps email verify --domain yourapp.com"
      );
      expect(error.docsUrl).toBe("https://wraps.dev/docs/cli-reference");
    });
  });

  describe("pulumiError", () => {
    it("should create proper error with message", () => {
      const error = errors.pulumiError("Failed to create IAM role");

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("Failed to create IAM role");
      expect(error.code).toBe("PULUMI_ERROR");
      expect(error.suggestion).toContain("AWS permissions");
      expect(error.docsUrl).toBe(
        "https://wraps.dev/docs/guides/aws-setup/troubleshooting"
      );
    });
  });

  describe("noStack", () => {
    it("should create proper error", () => {
      const error = errors.noStack();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("No Wraps infrastructure found");
      expect(error.code).toBe("NO_STACK");
      expect(error.suggestion).toContain("wraps email init");
      expect(error.docsUrl).toBe("https://wraps.dev/docs/quickstart/email");
    });
  });

  describe("pulumiNotInstalled", () => {
    it("should create proper error", () => {
      const error = errors.pulumiNotInstalled();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toBe("Pulumi CLI is not installed");
      expect(error.code).toBe("PULUMI_NOT_INSTALLED");
      expect(error.suggestion).toContain("brew install pulumi");
      expect(error.suggestion).toContain("curl -fsSL https://get.pulumi.com");
      expect(error.docsUrl).toBe("https://www.pulumi.com/docs/install/");
    });
  });

  describe("stackLocked", () => {
    it("should create proper error", () => {
      const error = errors.stackLocked();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("stack is locked");
      expect(error.code).toBe("STACK_LOCKED");
      expect(error.suggestion).toContain("rm -rf");
      expect(error.suggestion).toContain("locks");
    });
  });

  describe("smsNotConfigured", () => {
    it("should create proper error", () => {
      const error = errors.smsNotConfigured();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("SMS infrastructure not found");
      expect(error.code).toBe("SMS_NOT_CONFIGURED");
      expect(error.suggestion).toContain("wraps sms init");
    });
  });

  describe("smsPhoneNotVerified", () => {
    it("should create proper error", () => {
      const error = errors.smsPhoneNotVerified();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("Phone number registration not complete");
      expect(error.code).toBe("SMS_PHONE_NOT_VERIFIED");
    });
  });

  describe("smsOptedOut", () => {
    it("should create proper error with phone number", () => {
      const error = errors.smsOptedOut("+14155551234");

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("+14155551234");
      expect(error.message).toContain("opted out");
      expect(error.code).toBe("SMS_OPTED_OUT");
      expect(error.suggestion).toContain("START");
    });
  });

  describe("smsSpendingLimit", () => {
    it("should create proper error", () => {
      const error = errors.smsSpendingLimit();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("spending limit");
      expect(error.code).toBe("SMS_SPENDING_LIMIT");
    });
  });

  describe("smsInvalidPhoneNumber", () => {
    it("should create proper error with phone number", () => {
      const error = errors.smsInvalidPhoneNumber("123-456");

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("123-456");
      expect(error.code).toBe("SMS_INVALID_PHONE_NUMBER");
      expect(error.suggestion).toContain("E.164");
    });
  });

  describe("smsSimulatorLimit", () => {
    it("should create proper error", () => {
      const error = errors.smsSimulatorLimit();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("Simulator");
      expect(error.message).toContain("100 messages");
      expect(error.code).toBe("SMS_SIMULATOR_LIMIT");
    });
  });

  describe("smtpRequiresSending", () => {
    it("should create proper error", () => {
      const error = errors.smtpRequiresSending();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("SMTP");
      expect(error.message).toContain("sending");
      expect(error.code).toBe("SMTP_REQUIRES_SENDING");
    });
  });

  describe("smtpCredentialsNotFound", () => {
    it("should create proper error", () => {
      const error = errors.smtpCredentialsNotFound();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("SMTP credentials not found");
      expect(error.code).toBe("SMTP_CREDENTIALS_NOT_FOUND");
    });
  });

  describe("ssoSessionExpired", () => {
    it("should create error without profile", () => {
      const error = errors.ssoSessionExpired();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("SSO session has expired");
      expect(error.code).toBe("SSO_SESSION_EXPIRED");
      expect(error.suggestion).toContain("aws sso login");
    });

    it("should create error with profile", () => {
      const error = errors.ssoSessionExpired("my-profile");

      expect(error.message).toContain("my-profile");
      expect(error.suggestion).toContain("--profile my-profile");
    });
  });

  describe("profileNotFound", () => {
    it("should create error with available profiles", () => {
      const error = errors.profileNotFound("missing", [
        "default",
        "dev",
        "prod",
      ]);

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("missing");
      expect(error.code).toBe("PROFILE_NOT_FOUND");
      expect(error.suggestion).toContain("default, dev, prod");
    });

    it("should create error with no available profiles", () => {
      const error = errors.profileNotFound("missing", []);

      expect(error.suggestion).toContain("No AWS profiles configured");
      expect(error.suggestion).toContain("aws configure");
    });
  });

  describe("credentialsFileMissing", () => {
    it("should create proper error", () => {
      const error = errors.credentialsFileMissing();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("credentials file not found");
      expect(error.code).toBe("CREDENTIALS_FILE_MISSING");
      expect(error.suggestion).toContain("aws configure sso");
      expect(error.suggestion).toContain("aws configure");
      expect(error.suggestion).toContain("AWS_PROFILE");
      expect(error.suggestion).not.toContain("recommended");
    });
  });

  describe("accessKeyInvalid", () => {
    it("should create proper error", () => {
      const error = errors.accessKeyInvalid();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("access key is invalid");
      expect(error.code).toBe("ACCESS_KEY_INVALID");
    });
  });

  describe("sessionTokenExpired", () => {
    it("should create proper error", () => {
      const error = errors.sessionTokenExpired();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("session token has expired");
      expect(error.code).toBe("SESSION_TOKEN_EXPIRED");
      expect(error.suggestion).toContain("aws sso login");
    });
  });

  describe("iamPermissionDenied", () => {
    it("should create error with action and resource", () => {
      const error = errors.iamPermissionDenied(
        "ses:SendEmail",
        "SES identity",
        "Add ses:SendEmail permission to your IAM role"
      );

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("ses:SendEmail");
      expect(error.message).toContain("SES identity");
      expect(error.code).toBe("IAM_PERMISSION_DENIED");
      expect(error.suggestion).toContain("ses:SendEmail");
    });
  });

  describe("sesPermissionDenied", () => {
    it("should create proper error with action", () => {
      const error = errors.sesPermissionDenied("CreateEmailIdentity");

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("SES permission denied");
      expect(error.message).toContain("CreateEmailIdentity");
      expect(error.code).toBe("SES_PERMISSION_DENIED");
    });
  });

  describe("dynamoDBPermissionDenied", () => {
    it("should create proper error", () => {
      const error = errors.dynamoDBPermissionDenied();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("DynamoDB permission denied");
      expect(error.code).toBe("DYNAMODB_PERMISSION_DENIED");
      expect(error.suggestion).toContain("CreateTable");
    });
  });

  describe("lambdaPermissionDenied", () => {
    it("should create proper error", () => {
      const error = errors.lambdaPermissionDenied();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("Lambda permission denied");
      expect(error.code).toBe("LAMBDA_PERMISSION_DENIED");
      expect(error.suggestion).toContain("CreateFunction");
    });
  });

  describe("eventBridgePermissionDenied", () => {
    it("should create proper error", () => {
      const error = errors.eventBridgePermissionDenied();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("EventBridge permission denied");
      expect(error.code).toBe("EVENTBRIDGE_PERMISSION_DENIED");
      expect(error.suggestion).toContain("PutRule");
    });
  });

  describe("sqsPermissionDenied", () => {
    it("should create proper error", () => {
      const error = errors.sqsPermissionDenied();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("SQS permission denied");
      expect(error.code).toBe("SQS_PERMISSION_DENIED");
      expect(error.suggestion).toContain("CreateQueue");
    });
  });

  describe("route53PermissionDenied", () => {
    it("should create proper error", () => {
      const error = errors.route53PermissionDenied();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("Route53 permission denied");
      expect(error.code).toBe("ROUTE53_PERMISSION_DENIED");
      expect(error.suggestion).toContain("optional");
    });
  });
});

describe("resourceConflict error factory", () => {
  it("should create error with resource name and type", () => {
    const error = errors.resourceConflict(
      "wraps-email-config-set",
      "aws:ses/configurationSet:ConfigurationSet"
    );

    expect(error).toBeInstanceOf(WrapsError);
    expect(error.code).toBe("RESOURCE_CONFLICT");
    expect(error.message).toContain("wraps-email-config-set");
    expect(error.message).toContain("already exists");
    expect(error.suggestion).toContain("wraps email doctor --cleanup");
  });

  it("should handle missing resource type", () => {
    const error = errors.resourceConflict("wraps-email-role");

    expect(error).toBeInstanceOf(WrapsError);
    expect(error.code).toBe("RESOURCE_CONFLICT");
    expect(error.message).toContain("wraps-email-role");
    expect(error.suggestion).toContain("wraps email doctor --cleanup");
  });
});

describe("isAWSError", () => {
  it("should return true for known AWS error names", () => {
    const awsErrorNames = [
      "ExpiredTokenException",
      "InvalidClientTokenId",
      "AccessDenied",
      "AccessDeniedException",
      "UnauthorizedAccess",
      "InvalidAccessKeyId",
      "SignatureDoesNotMatch",
      "UnrecognizedClientException",
      "CredentialsError",
      "TokenRefreshRequired",
      "SSOTokenExpired",
    ];

    for (const name of awsErrorNames) {
      const error = new Error("Test error");
      error.name = name;
      expect(isAWSError(error)).toBe(true);
    }
  });

  it("should return true for errors with $metadata", () => {
    const error = new Error("Test error") as any;
    error.$metadata = { httpStatusCode: 403 };

    expect(isAWSError(error)).toBe(true);
  });

  it("should return false for regular errors", () => {
    const error = new Error("Regular error");
    expect(isAWSError(error)).toBe(false);
  });

  it("should return false for non-Error values", () => {
    expect(isAWSError(null)).toBe(false);
    expect(isAWSError(undefined)).toBe(false);
    expect(isAWSError("string error")).toBe(false);
    expect(isAWSError(123)).toBe(false);
    expect(isAWSError({ message: "object" })).toBe(false);
  });
});

describe("isPulumiError", () => {
  it("should return true for errors containing pulumi", () => {
    expect(isPulumiError(new Error("pulumi failed"))).toBe(true);
    expect(isPulumiError(new Error("Pulumi error occurred"))).toBe(true);
  });

  it("should return true for resource creation errors", () => {
    expect(isPulumiError(new Error("Error creating resource"))).toBe(true);
    expect(isPulumiError(new Error("resource not found"))).toBe(true);
  });

  it("should return true for AccessDenied errors", () => {
    expect(
      isPulumiError(new Error("AccessDenied when creating IAM role"))
    ).toBe(true);
  });

  it("should return false for regular errors", () => {
    expect(isPulumiError(new Error("Connection timeout"))).toBe(false);
    expect(isPulumiError(new Error("Network error"))).toBe(false);
  });

  it("should return false for non-Error values", () => {
    expect(isPulumiError(null)).toBe(false);
    expect(isPulumiError(undefined)).toBe(false);
    expect(isPulumiError("string error")).toBe(false);
  });
});

describe("parseAWSError", () => {
  it("should extract error code from error name", () => {
    const error = new Error("Test");
    error.name = "AccessDenied";

    const result = parseAWSError(error);

    expect(result.code).toBe("AccessDenied");
  });

  it("should extract action from error message", () => {
    const error = new Error(
      "User is not authorized when calling the SendEmail operation"
    );

    const result = parseAWSError(error);

    expect(result.action).toBe("SendEmail");
  });

  it("should extract resource from error message", () => {
    const error = new Error(
      "Access denied for resource: arn:aws:ses:us-east-1"
    );

    const result = parseAWSError(error);

    expect(result.resource).toBe("arn:aws:ses:us-east-1");
  });

  it("should handle error without action or resource", () => {
    const error = new Error("Something failed");
    error.name = "UnknownError";

    const result = parseAWSError(error);

    expect(result.code).toBe("UnknownError");
    expect(result.action).toBeUndefined();
    expect(result.resource).toBeUndefined();
  });
});

describe("parsePulumiError", () => {
  it("should detect IAM permission denied with action", () => {
    const error = new Error(
      'AccessDenied: action: "ses:CreateEmailIdentity" is not allowed'
    );

    const result = parsePulumiError(error);

    expect(result.code).toBe("IAM_PERMISSION_DENIED");
    expect(result.iamAction).toBe("ses:CreateEmailIdentity");
    expect(result.service).toBe("ses");
  });

  it("should detect SES permission denied", () => {
    const error = new Error("access denied for ses:SendEmail operation");

    const result = parsePulumiError(error);

    expect(result.code).toBe("SES_PERMISSION_DENIED");
    expect(result.service).toBe("ses");
  });

  it("should detect DynamoDB permission denied", () => {
    const error = new Error("AccessDenied for dynamodb:CreateTable");

    const result = parsePulumiError(error);

    expect(result.code).toBe("DYNAMODB_PERMISSION_DENIED");
    expect(result.service).toBe("dynamodb");
  });

  it("should detect Lambda permission denied", () => {
    const error = new Error("AccessDenied for lambda:CreateFunction");

    const result = parsePulumiError(error);

    expect(result.code).toBe("LAMBDA_PERMISSION_DENIED");
    expect(result.service).toBe("lambda");
  });

  it("should detect EventBridge permission denied", () => {
    const error = new Error("AccessDenied for events:PutRule");

    const result = parsePulumiError(error);

    expect(result.code).toBe("EVENTBRIDGE_PERMISSION_DENIED");
    expect(result.service).toBe("events");
  });

  it("should detect SQS permission denied", () => {
    const error = new Error("AccessDenied for sqs:CreateQueue");

    const result = parsePulumiError(error);

    expect(result.code).toBe("SQS_PERMISSION_DENIED");
    expect(result.service).toBe("sqs");
  });

  it("should detect IAM permission denied", () => {
    const error = new Error("AccessDenied for iam:CreateRole");

    const result = parsePulumiError(error);

    expect(result.code).toBe("IAM_PERMISSION_DENIED");
    expect(result.service).toBe("iam");
  });

  it("should detect stack locked error", () => {
    const error = new Error("the stack is currently locked by another process");

    const result = parsePulumiError(error);

    expect(result.code).toBe("STACK_LOCKED");
  });

  it("should return generic error for unknown Pulumi errors", () => {
    const error = new Error("Unknown Pulumi error");

    const result = parsePulumiError(error);

    expect(result.code).toBe("PULUMI_ERROR");
  });

  it("should detect RESOURCE_CONFLICT when message contains AlreadyExists", () => {
    const error = new Error(
      "error creating 'wraps-email-config-set' (aws:ses/configurationSet:ConfigurationSet): EntityAlreadyExists: Configuration set wraps-email-config-set already exists"
    );

    const result = parsePulumiError(error);

    expect(result.code).toBe("RESOURCE_CONFLICT");
  });

  it("should detect RESOURCE_CONFLICT for ResourceInUse patterns", () => {
    const error = new Error(
      "error creating 'wraps-email-lambda' (aws:lambda/function:Function): ResourceConflictException: Function already exist: wraps-email-lambda"
    );

    const result = parsePulumiError(error);

    expect(result.code).toBe("RESOURCE_CONFLICT");
  });

  it("should detect RESOURCE_CONFLICT for generic already exists", () => {
    const error = new Error(
      "creating resource: InvalidParameter: IAM role wraps-email-role already exists in this account"
    );

    const result = parsePulumiError(error);

    expect(result.code).toBe("RESOURCE_CONFLICT");
  });

  it("should extract resource name and type from Pulumi error format", () => {
    const error = new Error(
      "error creating 'wraps-email-config-set' (aws:ses/configurationSet:ConfigurationSet): EntityAlreadyExists: Configuration set wraps-email-config-set already exists"
    );

    const result = parsePulumiError(error);

    expect(result.code).toBe("RESOURCE_CONFLICT");
    expect(result.resourceName).toBe("wraps-email-config-set");
    expect(result.resourceType).toBe(
      "aws:ses/configurationSet:ConfigurationSet"
    );
  });

  it("should return undefined resourceName/Type when not in Pulumi format", () => {
    const error = new Error(
      "creating resource: InvalidParameter: IAM role wraps-email-role already exists in this account"
    );

    const result = parsePulumiError(error);

    expect(result.code).toBe("RESOURCE_CONFLICT");
    expect(result.resourceName).toBeUndefined();
    expect(result.resourceType).toBeUndefined();
  });

  it("should detect NOT_INSTALLED when pulumi binary is missing from PATH", () => {
    const error = new Error(
      "Command failed with ENOENT: pulumi version\nspawn pulumi ENOENT"
    );

    const result = parsePulumiError(error);

    expect(result.code).toBe("NOT_INSTALLED");
  });

  it("should not report NOT_INSTALLED when a different binary is missing during a pulumi operation", () => {
    const error = new Error(
      "pulumi up failed: Command failed with ENOENT\nspawn docker ENOENT"
    );

    const result = parsePulumiError(error);

    expect(result.code).toBe("PULUMI_ERROR");
  });
});

describe("sanitizeErrorMessage", () => {
  it("should redact AWS account IDs", () => {
    const message = sanitizeErrorMessage(
      new Error("Error in account 123456789012")
    );

    expect(message).toContain("[ACCOUNT_ID]");
    expect(message).not.toContain("123456789012");
  });

  it("should redact email addresses", () => {
    const message = sanitizeErrorMessage(
      new Error("Failed for user@example.com")
    );

    expect(message).toContain("[EMAIL]");
    expect(message).not.toContain("user@example.com");
  });

  it("should redact domain names but keep AWS domains", () => {
    const message = sanitizeErrorMessage(
      new Error("Error with myapp.com and ses.amazonaws.com")
    );

    expect(message).toContain("[DOMAIN]");
    expect(message).not.toContain("myapp.com");
    // AWS domains should be preserved
    expect(message).toContain("amazonaws.com");
  });

  it("should redact ARNs with account IDs", () => {
    const message = sanitizeErrorMessage(
      new Error(
        "Resource arn:aws:ses:us-east-1:123456789012:identity not found"
      )
    );

    expect(message).toContain("[ACCOUNT_ID]");
  });

  it("should truncate very long messages", () => {
    const longMessage = "A".repeat(600);
    const message = sanitizeErrorMessage(new Error(longMessage));

    expect(message.length).toBeLessThanOrEqual(503); // 500 + "..."
    expect(message).toContain("...");
  });

  it("should handle null/undefined", () => {
    expect(sanitizeErrorMessage(null)).toBe("Unknown error");
    expect(sanitizeErrorMessage(undefined)).toBe("Unknown error");
  });

  it("should handle string errors", () => {
    const message = sanitizeErrorMessage("Simple string error");

    expect(message).toBe("Simple string error");
  });

  it("should handle Error objects", () => {
    const message = sanitizeErrorMessage(new Error("Error message"));

    expect(message).toBe("Error message");
  });
});

describe("awsErrorToWrapsError — ResourceNotFoundException discrimination (COR-13)", () => {
  it("maps DynamoDB's data-plane RNFE to the policy-table error", () => {
    // DynamoDB GetItem/UpdateItem RNFE message carries no table/dynamodb token.
    const ddbError = Object.assign(new Error("Requested resource not found"), {
      name: "ResourceNotFoundException",
    });

    const result = awsErrorToWrapsError(
      "ResourceNotFoundException",
      "syncAgentPolicy",
      ddbError,
      true
    );

    expect(result.code).toBe("DYNAMODB_TABLE_NOT_FOUND");
  });

  it("does NOT map a bare RNFE to the policy-table error outside agent context", () => {
    // A ResourceNotFoundException from a non-agent command must fall through to
    // the generic AWS error, not tell the user to "run wraps email agent create".
    const ddbError = Object.assign(new Error("Requested resource not found"), {
      name: "ResourceNotFoundException",
    });

    const result = awsErrorToWrapsError(
      "ResourceNotFoundException",
      "getItem",
      ddbError
    );

    expect(result.code).not.toBe("DYNAMODB_TABLE_NOT_FOUND");
    expect(result.code).toBe("AWS_ResourceNotFoundException");
    expect(result.suggestion ?? "").not.toMatch(/wraps email agent create/i);
  });

  it("maps Lambda's RNFE to the enforcer-Lambda error", () => {
    const lambdaError = Object.assign(
      new Error(
        "Function not found: arn:aws:lambda:us-east-1:123456789012:function:wraps-agent-enforcer"
      ),
      { name: "ResourceNotFoundException" }
    );

    const result = awsErrorToWrapsError(
      "ResourceNotFoundException",
      "invokeEnforcer",
      lambdaError,
      true
    );

    expect(result.code).toBe("LAMBDA_FUNCTION_NOT_FOUND");
  });
});

describe("user-input errors render without crash furniture", () => {
  let exitSpy: any;
  let consoleErrorSpy: any;
  let consoleLogSpy: any;
  let clackErrorSpy: any;

  beforeEach(() => {
    vi.mocked(trackError).mockClear();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    clackErrorSpy = vi.spyOn(clack.log, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = undefined;
    exitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    clackErrorSpy.mockRestore();
  });

  it("renders a mistyped command as a rejection, not as a crash", () => {
    handleCLIError(
      errors.unknownCommand(
        "command",
        "emial",
        "Available commands: email, sms, cdn"
      )
    );

    // The rejection has to SAY something. Asserting only the absence of crash
    // furniture passes just as happily when nothing is printed at all.
    expect(clackErrorSpy).toHaveBeenCalledWith("Unknown command: emial");
    expect(clackErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("An unexpected error occurred")
    );
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("https://github.com/wraps-team/wraps/issues")
    );
    expect(process.exitCode).toBe(1);
  });

  it("names the missing flag and the usage line, not a crash", () => {
    handleCLIError(
      errors.missingInput("--domain", "wraps email verify --domain <domain>")
    );

    expect(clackErrorSpy).toHaveBeenCalledWith("--domain is required");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("wraps email verify --domain <domain>")
    );
    expect(clackErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("An unexpected error occurred")
    );
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("https://github.com/wraps-team/wraps/issues")
    );
    expect(process.exitCode).toBe(1);
  });

  it("reports a mistyped command under its own telemetry code", () => {
    handleCLIError(
      errors.unknownCommand(
        "command",
        "emial",
        "Available commands: email, sms, cdn"
      )
    );

    expect(trackError).toHaveBeenCalledWith("UNKNOWN_COMMAND", "unknown");
    expect(
      vi.mocked(trackError).mock.calls.map((call) => call[0])
    ).not.toContain("UNHANDLED_ERROR");
  });

  describe("in --json mode", () => {
    beforeEach(() => {
      setJsonMode(true);
    });

    afterEach(() => {
      setJsonMode(false);
    });

    it("emits one machine-readable envelope naming the command that failed", () => {
      handleCLIError(
        errors.unknownCommand(
          "command",
          "emial",
          "Available commands: email, sms, cdn"
        )
      );

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const envelope = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(envelope.error.code).toBe("UNKNOWN_COMMAND");
      expect(envelope.error.message).toBe("Unknown command: emial");
      expect(envelope.error.suggestion).toContain(
        "Available commands: email, sms, cdn"
      );
    });
  });
});
