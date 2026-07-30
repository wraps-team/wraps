import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../shared/json-output.js";
import {
  DeploymentProgress,
  displayStatus,
  displaySuccess,
  type SuccessOutputs,
} from "../shared/output.js";

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

  describe("JSON mode", () => {
    beforeEach(() => {
      setJsonMode(true);
    });

    afterEach(() => {
      setJsonMode(false);
    });

    it("start() is a no-op", async () => {
      const clack = await import("@clack/prompts");

      progress.start("Starting task");

      expect(clack.spinner).not.toHaveBeenCalled();
    });

    it("succeed() is a no-op", async () => {
      const clack = await import("@clack/prompts");

      progress.succeed("Task completed");

      expect(clack.log.success).not.toHaveBeenCalled();
    });

    it("fail() is a no-op", async () => {
      const clack = await import("@clack/prompts");

      progress.fail("Task failed");

      expect(clack.log.error).not.toHaveBeenCalled();
    });

    it("info() is a no-op", async () => {
      const clack = await import("@clack/prompts");

      progress.info("Info message");

      expect(clack.log.info).not.toHaveBeenCalled();
    });

    it("step() is a no-op", async () => {
      const clack = await import("@clack/prompts");

      progress.step("Step message");

      expect(clack.log.step).not.toHaveBeenCalled();
    });

    it("stop() is a no-op", async () => {
      const clack = await import("@clack/prompts");

      progress.stop("Stopping");

      expect(clack.spinner).not.toHaveBeenCalled();
    });

    it("execute() still runs function", async () => {
      const mockFn = vi.fn().mockResolvedValue("json-result");

      const result = await progress.execute("Test message", mockFn);

      expect(mockFn).toHaveBeenCalledOnce();
      expect(result).toBe("json-result");
    });

    it("execute() still throws on error", async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error("JSON error"));

      await expect(progress.execute("Test message", mockFn)).rejects.toThrow(
        "JSON error"
      );
      expect(mockFn).toHaveBeenCalledOnce();
    });

    it("execute() doesn't show spinner", async () => {
      const clack = await import("@clack/prompts");
      const mockFn = vi.fn().mockResolvedValue("result");

      await progress.execute("Test message", mockFn);

      expect(clack.spinner).not.toHaveBeenCalled();
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

  it("should display success with MAIL FROM domain", () => {
    expect(() =>
      displaySuccess({
        roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
        region: "us-east-1",
        domain: "example.com",
        mailFromDomain: "mail.example.com",
        dnsRecords: [
          {
            name: "token1._domainkey.example.com",
            type: "CNAME",
            value: "token1.dkim.amazonses.com",
          },
        ],
      })
    ).not.toThrow();
  });

  it("should display success with custom tracking domain DNS records", () => {
    expect(() =>
      displaySuccess({
        roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
        region: "us-east-1",
        customTrackingDomain: "track.example.com",
        trackingDomainDnsRecords: [
          {
            name: "track.example.com",
            type: "CNAME",
            value: "r.us-east-1.awstrack.me",
          },
        ],
      })
    ).not.toThrow();
  });

  it("should display success with custom tracking domain without DNS records", () => {
    expect(() =>
      displaySuccess({
        roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
        region: "us-east-1",
        customTrackingDomain: "track.example.com",
      })
    ).not.toThrow();
  });
});

describe("displaySuccess output content", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it("should reference @wraps.dev/email SDK package", () => {
    displaySuccess({
      roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
      region: "us-east-1",
    });

    const output = consoleLogSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("@wraps.dev/email");
    expect(output).not.toContain("@wraps/sdk");
  });

  it("should embed SDK snippet with actual deployment values when domain is provided", () => {
    displaySuccess({
      roleArn: "arn:aws:iam::999888777666:role/wraps-email-role",
      region: "eu-west-1",
      domain: "myapp.com",
    });

    const output = consoleLogSpy.mock.calls.map((c) => c[0]).join("\n");
    // SDK import
    expect(output).toContain("import { WrapsEmail } from '@wraps.dev/email'");
    // Constructor matches the variable used in the send call
    expect(output).toContain("const email = new WrapsEmail({");
    // Actual roleArn
    expect(output).toContain("arn:aws:iam::999888777666:role/wraps-email-role");
    // Actual region
    expect(output).toContain("eu-west-1");
    // Actual domain in from address
    expect(output).toContain("hello@myapp.com");
    // Has send example
    expect(output).toContain("await email.send(");
  });

  it("should not embed SDK snippet when domain is not provided", () => {
    displaySuccess({
      roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
      region: "us-east-1",
    });

    const output = consoleLogSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("@wraps.dev/email");
    expect(output).not.toContain("import { WrapsEmail }");
  });

  it("should display correct DNS provider name when DNS was auto-created", async () => {
    const clack = await import("@clack/prompts");

    displaySuccess({
      roleArn: "arn:aws:iam::123456789012:role/wraps-email-role",
      region: "us-east-1",
      domain: "example.com",
      dnsAutoCreated: true,
      dnsProvider: "cloudflare",
    });

    // clack.note is called for the DNS auto-configured message
    const noteCall = (clack.note as ReturnType<typeof vi.fn>).mock.calls.find(
      ([, title]: [string, string]) =>
        typeof title === "string" && title.includes("DNS Auto-Configured")
    );
    expect(noteCall).toBeDefined();

    const [noteBody] = noteCall!;
    // Bug: the message hardcodes "Route53" regardless of the actual DNS provider
    expect(noteBody).toContain("Cloudflare");
    expect(noteBody).not.toContain("Route53");
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

  it("should display status with MAIL FROM domain", () => {
    expect(() =>
      displayStatus({
        integrationLevel: "enhanced",
        region: "us-east-1",
        domains: [
          {
            domain: "example.com",
            status: "verified",
            mailFromDomain: "mail.example.com",
            mailFromStatus: "SUCCESS",
          },
        ],
        resources: {},
      })
    ).not.toThrow();
  });

  it("should display status with pending MAIL FROM domain", () => {
    expect(() =>
      displayStatus({
        integrationLevel: "enhanced",
        region: "us-east-1",
        domains: [
          {
            domain: "example.com",
            status: "verified",
            mailFromDomain: "mail.example.com",
            mailFromStatus: "PENDING",
          },
        ],
        resources: {},
      })
    ).not.toThrow();
  });

  it("should display archiving feature with different retention periods", () => {
    const retentions = [
      "7days",
      "30days",
      "90days",
      "6months",
      "1year",
      "18months",
    ] as const;

    for (const retention of retentions) {
      expect(() =>
        displayStatus({
          integrationLevel: "enhanced",
          region: "us-east-1",
          domains: [],
          resources: {
            archivingEnabled: true,
            archiveRetention: retention,
            archiveArn: "arn:aws:ses:us-east-1:123456789012:archive/wraps",
          },
        })
      ).not.toThrow();
    }
  });

  it("should display status with domains needing DNS records", () => {
    expect(() =>
      displayStatus({
        integrationLevel: "enhanced",
        region: "us-east-1",
        domains: [
          {
            domain: "pending.com",
            status: "pending",
            dkimTokens: ["token1", "token2", "token3"],
          },
        ],
        resources: {},
      })
    ).not.toThrow();
  });

  it("should display status with domain needing MAIL FROM DNS", () => {
    expect(() =>
      displayStatus({
        integrationLevel: "enhanced",
        region: "us-east-1",
        domains: [
          {
            domain: "example.com",
            status: "verified",
            mailFromDomain: "mail.example.com",
            mailFromStatus: "PENDING",
          },
        ],
        resources: {},
      })
    ).not.toThrow();
  });

  it("should display status with both pending domain and MAIL FROM", () => {
    expect(() =>
      displayStatus({
        integrationLevel: "enhanced",
        region: "us-east-1",
        domains: [
          {
            domain: "pending.com",
            status: "pending",
            dkimTokens: ["token1", "token2", "token3"],
            mailFromDomain: "mail.pending.com",
            mailFromStatus: "PENDING",
          },
        ],
        resources: {},
      })
    ).not.toThrow();
  });
});
