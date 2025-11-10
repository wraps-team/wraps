import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errors, handleCLIError, WrapsError } from "../errors.js";

describe("WrapsError", () => {
  it("should create error with all properties", () => {
    const error = new WrapsError(
      "Test error message",
      "TEST_ERROR",
      "Try this suggestion",
      "https://docs.wraps.dev/test"
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(WrapsError);
    expect(error.message).toBe("Test error message");
    expect(error.code).toBe("TEST_ERROR");
    expect(error.suggestion).toBe("Try this suggestion");
    expect(error.docsUrl).toBe("https://docs.wraps.dev/test");
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

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it("should handle WrapsError with all properties", () => {
    const error = new WrapsError(
      "AWS credentials not found",
      "NO_AWS_CREDENTIALS",
      "Run: aws configure",
      "https://docs.wraps.dev/credentials"
    );

    handleCLIError(error);

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
      expect.stringContaining("https://docs.wraps.dev/credentials")
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should handle WrapsError without suggestion and docs", () => {
    const error = new WrapsError("Simple error", "SIMPLE_ERROR");

    handleCLIError(error);

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should handle unknown errors", () => {
    const error = new Error("Unknown error");

    handleCLIError(error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://github.com/wraps-team/wraps/issues")
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should handle string errors", () => {
    handleCLIError("String error message");

    expect(consoleErrorSpy).toHaveBeenCalledWith("String error message");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should handle null/undefined errors", () => {
    handleCLIError(null);
    expect(exitSpy).toHaveBeenCalledWith(1);

    handleCLIError(undefined);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("error factory functions", () => {
  describe("noAWSCredentials", () => {
    it("should create proper error", () => {
      const error = errors.noAWSCredentials();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toBe("AWS credentials not found");
      expect(error.code).toBe("NO_AWS_CREDENTIALS");
      expect(error.suggestion).toContain("aws configure");
      expect(error.docsUrl).toBe(
        "https://docs.wraps.dev/setup/aws-credentials"
      );
    });
  });

  describe("stackExists", () => {
    it("should create proper error with stack name", () => {
      const error = errors.stackExists("wraps-123456789-us-east-1");

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("wraps-123456789-us-east-1");
      expect(error.code).toBe("STACK_EXISTS");
      expect(error.suggestion).toContain("wraps upgrade");
      expect(error.suggestion).toContain(
        "wraps destroy --stack wraps-123456789-us-east-1"
      );
      expect(error.docsUrl).toBe("https://docs.wraps.dev/cli/upgrade");
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

  describe("pulumiError", () => {
    it("should create proper error with message", () => {
      const error = errors.pulumiError("Failed to create IAM role");

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("Failed to create IAM role");
      expect(error.code).toBe("PULUMI_ERROR");
      expect(error.suggestion).toContain("AWS permissions");
      expect(error.docsUrl).toBe("https://docs.wraps.dev/troubleshooting");
    });
  });

  describe("noStack", () => {
    it("should create proper error", () => {
      const error = errors.noStack();

      expect(error).toBeInstanceOf(WrapsError);
      expect(error.message).toContain("No Wraps infrastructure found");
      expect(error.code).toBe("NO_STACK");
      expect(error.suggestion).toContain("wraps init");
      expect(error.docsUrl).toBe("https://docs.wraps.dev/cli/init");
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
});
