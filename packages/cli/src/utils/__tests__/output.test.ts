import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DeploymentProgress,
  displayStatus,
  displaySuccess,
} from "../output.js";

// Mock @clack/prompts
vi.mock("@clack/prompts", () => ({
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
  log: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    step: vi.fn(),
  },
  outro: vi.fn(),
  note: vi.fn(),
  intro: vi.fn(),
}));

describe("DeploymentProgress", () => {
  let progress: DeploymentProgress;

  beforeEach(() => {
    progress = new DeploymentProgress();
    vi.clearAllMocks();
  });

  describe("execute", () => {
    it("should execute function and succeed on success", async () => {
      const mockFn = vi.fn().mockResolvedValue("result");

      const result = await progress.execute("Test message", mockFn);

      expect(result).toBe("result");
      expect(mockFn).toHaveBeenCalledOnce();
    });

    it("should execute function and fail on error", async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error("Test error"));

      await expect(progress.execute("Test message", mockFn)).rejects.toThrow(
        "Test error"
      );
      expect(mockFn).toHaveBeenCalledOnce();
    });

    it("should return value from async function", async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: "test" });

      const result = await progress.execute("Test message", mockFn);

      expect(result).toEqual({ data: "test" });
    });

    it("should handle multiple sequential executions", async () => {
      const fn1 = vi.fn().mockResolvedValue("first");
      const fn2 = vi.fn().mockResolvedValue("second");

      const result1 = await progress.execute("First step", fn1);
      const result2 = await progress.execute("Second step", fn2);

      expect(result1).toBe("first");
      expect(result2).toBe("second");
      expect(fn1).toHaveBeenCalledOnce();
      expect(fn2).toHaveBeenCalledOnce();
    });
  });

  describe("start/succeed/fail", () => {
    it("should handle manual progress tracking", () => {
      progress.start("Starting task");
      expect(() => progress.succeed("Task completed")).not.toThrow();
    });

    it("should handle manual failure", () => {
      progress.start("Starting task");
      expect(() => progress.fail("Task failed")).not.toThrow();
    });
  });

  describe("info and step", () => {
    it("should handle info messages", () => {
      expect(() => progress.info("Info message")).not.toThrow();
    });

    it("should handle step messages", () => {
      expect(() => progress.step("Step message")).not.toThrow();
    });
  });
});

describe("displaySuccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should display success with minimal outputs", () => {
    expect(() =>
      displaySuccess({
        roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
        region: "us-east-1",
      })
    ).not.toThrow();
  });

  it("should display success with config set", () => {
    expect(() =>
      displaySuccess({
        roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
        configSetName: "wraps-tracking",
        region: "us-east-1",
      })
    ).not.toThrow();
  });

  it("should display success with table name", () => {
    expect(() =>
      displaySuccess({
        roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
        tableName: "wraps-email-history",
        region: "us-east-1",
      })
    ).not.toThrow();
  });

  it("should display success with DNS records", () => {
    expect(() =>
      displaySuccess({
        roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
        region: "us-east-1",
        domain: "example.com",
        dnsRecords: [
          {
            name: "token1._domainkey.example.com",
            type: "CNAME",
            value: "token1.dkim.amazonses.com",
          },
          {
            name: "token2._domainkey.example.com",
            type: "CNAME",
            value: "token2.dkim.amazonses.com",
          },
        ],
      })
    ).not.toThrow();
  });

  it("should display success with auto-created DNS", () => {
    expect(() =>
      displaySuccess({
        roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
        region: "us-east-1",
        domain: "example.com",
        dnsAutoCreated: true,
      })
    ).not.toThrow();
  });

  it("should handle all outputs together", () => {
    expect(() =>
      displaySuccess({
        roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
        configSetName: "wraps-tracking",
        tableName: "wraps-email-history",
        region: "us-east-1",
        domain: "example.com",
        dnsAutoCreated: true,
      })
    ).not.toThrow();
  });
});

describe("displayStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should display status with minimal information", () => {
    expect(() =>
      displayStatus({
        integrationLevel: "dashboard-only",
        region: "us-east-1",
        domains: [],
        resources: {},
      })
    ).not.toThrow();
  });

  it("should display status with verified domain", () => {
    expect(() =>
      displayStatus({
        integrationLevel: "enhanced",
        region: "us-east-1",
        domains: [
          {
            domain: "example.com",
            status: "verified",
          },
        ],
        resources: {
          roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
        },
      })
    ).not.toThrow();
  });

  it("should display status with pending domain and DKIM tokens", () => {
    expect(() =>
      displayStatus({
        integrationLevel: "enhanced",
        region: "us-east-1",
        domains: [
          {
            domain: "example.com",
            status: "pending",
            dkimTokens: ["token1", "token2", "token3"],
          },
        ],
        resources: {
          roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
          configSetName: "wraps-tracking",
        },
      })
    ).not.toThrow();
  });

  it("should display status with multiple domains", () => {
    expect(() =>
      displayStatus({
        integrationLevel: "enhanced",
        region: "us-east-1",
        domains: [
          { domain: "verified.com", status: "verified" },
          { domain: "pending.com", status: "pending" },
          { domain: "failed.com", status: "failed" },
        ],
        resources: {
          roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
          configSetName: "wraps-tracking",
          tableName: "wraps-email-history",
          lambdaFunctions: 2,
          snsTopics: 1,
        },
      })
    ).not.toThrow();
  });

  it("should display all resource types", () => {
    expect(() =>
      displayStatus({
        integrationLevel: "enhanced",
        region: "us-east-1",
        domains: [],
        resources: {
          roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
          configSetName: "wraps-tracking",
          tableName: "wraps-email-history",
          lambdaFunctions: 3,
          snsTopics: 2,
        },
      })
    ).not.toThrow();
  });
});
