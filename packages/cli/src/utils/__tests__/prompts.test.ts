import * as clack from "@clack/prompts";
import { ALL_EVENT_TYPES } from "@wraps/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmConnect,
  confirmDeploy,
  getAvailableFeatures,
  promptConfigPreset,
  promptConflictResolution,
  promptCustomConfig,
  promptDomain,
  promptEstimatedVolume,
  promptFeatureSelection,
  promptIntegrationLevel,
  promptProvider,
  promptRegion,
  promptSelectIdentities,
  promptVercelConfig,
  REQUIRED_SUPPRESSION_EVENT_TYPES,
} from "../shared/prompts.js";

const OPTIONAL_EVENT_TYPES = ALL_EVENT_TYPES.filter(
  (type) => !REQUIRED_SUPPRESSION_EVENT_TYPES.includes(type)
);

// Mock @clack/prompts
vi.mock("@clack/prompts", () => ({
  select: vi.fn(),
  text: vi.fn(),
  confirm: vi.fn(),
  multiselect: vi.fn(),
  group: vi.fn(),
  isCancel: vi.fn(),
  cancel: vi.fn(),
  log: {
    info: vi.fn(),
  },
}));

// Mock process.exit
const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
  throw new Error("process.exit called");
});

describe("Prompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clack.isCancel).mockReturnValue(false);

    // Every prompt* helper is now guarded by ensureInteractive() — simulate
    // an interactive TTY so the guard is a no-op here, matching pre-guard
    // behavior. See utils/shared/__tests__/prompts.test.ts for guard-specific
    // coverage (non-TTY / JSON-mode throw behavior).
    process.stdin.isTTY = true;
    process.stdout.isTTY = true;
    delete process.env.CI;
  });

  afterEach(() => {
    process.stdin.isTTY = true;
    process.stdout.isTTY = true;
  });

  describe("promptProvider", () => {
    it("should return selected provider", async () => {
      vi.mocked(clack.select).mockResolvedValue("vercel");

      const result = await promptProvider();

      expect(result).toBe("vercel");
      expect(clack.select).toHaveBeenCalledWith({
        message: "Where is your app hosted?",
        options: expect.arrayContaining([
          expect.objectContaining({ value: "aws" }),
          expect.objectContaining({ value: "vercel" }),
          expect.objectContaining({ value: "railway" }),
          expect.objectContaining({ value: "other" }),
        ]),
      });
    });

    it("should handle AWS provider selection", async () => {
      vi.mocked(clack.select).mockResolvedValue("aws");

      const result = await promptProvider();

      expect(result).toBe("aws");
    });

    it("should handle Railway provider selection", async () => {
      vi.mocked(clack.select).mockResolvedValue("railway");

      const result = await promptProvider();

      expect(result).toBe("railway");
    });

    it("should handle cancellation", async () => {
      vi.mocked(clack.select).mockResolvedValue(Symbol("cancelled"));
      vi.mocked(clack.isCancel).mockReturnValue(true);

      await expect(promptProvider()).rejects.toThrow("process.exit called");
      expect(clack.cancel).toHaveBeenCalledWith("Operation cancelled.");
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it("should include hint text for each provider", async () => {
      vi.mocked(clack.select).mockResolvedValue("vercel");

      await promptProvider();

      const call = vi.mocked(clack.select).mock.calls[0][0];
      const options = call.options as any[];

      expect(options.find((o) => o.value === "vercel")?.hint).toContain("OIDC");
      expect(options.find((o) => o.value === "aws")?.hint).toContain(
        "IAM roles"
      );
      expect(options.find((o) => o.value === "railway")?.hint).toContain(
        "credentials"
      );
      expect(options.find((o) => o.value === "other")?.hint).toContain(
        "access keys"
      );
    });
  });

  describe("promptRegion", () => {
    it("should return selected region", async () => {
      vi.mocked(clack.select).mockResolvedValue("us-west-2");

      const result = await promptRegion("us-east-1");

      expect(result).toBe("us-west-2");
    });

    it("should use default region as initial value", async () => {
      vi.mocked(clack.select).mockResolvedValue("us-east-1");

      await promptRegion("us-east-1");

      expect(clack.select).toHaveBeenCalledWith(
        expect.objectContaining({
          initialValue: "us-east-1",
        })
      );
    });

    it("should include all major regions", async () => {
      vi.mocked(clack.select).mockResolvedValue("eu-west-1");

      await promptRegion("us-east-1");

      const call = vi.mocked(clack.select).mock.calls[0][0];
      const options = call.options as any[];
      const regions = options.map((o) => o.value);

      expect(regions).toContain("us-east-1");
      expect(regions).toContain("us-west-2");
      expect(regions).toContain("eu-west-1");
      expect(regions).toContain("ap-southeast-1");
      expect(regions).toContain("ca-central-1");
    });

    it("should handle cancellation", async () => {
      vi.mocked(clack.select).mockResolvedValue(Symbol("cancelled"));
      vi.mocked(clack.isCancel).mockReturnValue(true);

      await expect(promptRegion("us-east-1")).rejects.toThrow(
        "process.exit called"
      );
      expect(clack.cancel).toHaveBeenCalledWith("Operation cancelled.");
    });
  });

  describe("promptDomain", () => {
    it("should return entered domain", async () => {
      vi.mocked(clack.text).mockResolvedValue("example.com");

      const result = await promptDomain();

      expect(result).toBe("example.com");
    });

    it("should return empty string when no domain entered", async () => {
      vi.mocked(clack.text).mockResolvedValue("");

      const result = await promptDomain();

      expect(result).toBe("");
    });

    it("should validate domain format", async () => {
      vi.mocked(clack.text).mockResolvedValue("example.com");

      await promptDomain();

      const call = vi.mocked(clack.text).mock.calls[0][0];
      const validate = call.validate as Function;

      // Valid domains
      expect(validate("example.com")).toBeUndefined();
      expect(validate("sub.example.com")).toBeUndefined();
      expect(validate("")).toBeUndefined(); // Optional

      // Invalid domains
      expect(validate("invalid")).toBe(
        "Please enter a valid domain (e.g., myapp.com)"
      );
      expect(validate("no-dot")).toBe(
        "Please enter a valid domain (e.g., myapp.com)"
      );
    });

    it("should handle cancellation", async () => {
      vi.mocked(clack.text).mockResolvedValue(Symbol("cancelled"));
      vi.mocked(clack.isCancel).mockReturnValue(true);

      await expect(promptDomain()).rejects.toThrow("process.exit called");
    });
  });

  describe("promptVercelConfig", () => {
    it("should return team slug and project name", async () => {
      vi.mocked(clack.group).mockResolvedValue({
        teamSlug: "my-team",
        projectName: "my-project",
      });

      const result = await promptVercelConfig();

      expect(result).toEqual({
        teamSlug: "my-team",
        projectName: "my-project",
      });
    });

    it("should validate required fields", async () => {
      vi.mocked(clack.group).mockResolvedValue({
        teamSlug: "my-team",
        projectName: "my-project",
      });

      await promptVercelConfig();

      const call = vi.mocked(clack.group).mock.calls[0][0];

      // Both fields should be required
      expect(call).toHaveProperty("teamSlug");
      expect(call).toHaveProperty("projectName");
    });

    it("should handle cancellation via onCancel", async () => {
      vi.mocked(clack.group).mockImplementation(
        async (_prompts, options: any) => {
          options.onCancel();
          return {};
        }
      );

      await expect(promptVercelConfig()).rejects.toThrow("process.exit called");
    });
  });

  describe("promptIntegrationLevel", () => {
    it("should return enhanced level", async () => {
      vi.mocked(clack.select).mockResolvedValue("enhanced");

      const result = await promptIntegrationLevel();

      expect(result).toBe("enhanced");
    });

    it("should return dashboard-only level", async () => {
      vi.mocked(clack.select).mockResolvedValue("dashboard-only");

      const result = await promptIntegrationLevel();

      expect(result).toBe("dashboard-only");
    });

    it("should include descriptions for both options", async () => {
      vi.mocked(clack.select).mockResolvedValue("enhanced");

      await promptIntegrationLevel();

      const call = vi.mocked(clack.select).mock.calls[0][0];
      const options = call.options as any[];

      expect(options).toHaveLength(2);
      expect(options[0].hint).toContain("DynamoDB");
      expect(options[1].hint).toContain("IAM role");
    });
  });

  describe("confirmDeploy", () => {
    it("should return true when confirmed", async () => {
      vi.mocked(clack.confirm).mockResolvedValue(true);

      const result = await confirmDeploy();

      expect(result).toBe(true);
    });

    it("should return false when declined", async () => {
      vi.mocked(clack.confirm).mockResolvedValue(false);

      const result = await confirmDeploy();

      expect(result).toBe(false);
    });

    it("should have initial value of true", async () => {
      vi.mocked(clack.confirm).mockResolvedValue(true);

      await confirmDeploy();

      expect(clack.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          initialValue: true,
        })
      );
    });

    it("should handle cancellation", async () => {
      vi.mocked(clack.confirm).mockResolvedValue(Symbol("cancelled"));
      vi.mocked(clack.isCancel).mockReturnValue(true);

      await expect(confirmDeploy()).rejects.toThrow("process.exit called");
    });
  });

  describe("getAvailableFeatures", () => {
    it("should return all available features", () => {
      const features = getAvailableFeatures();

      expect(features).toHaveLength(6);
      expect(features.map((f) => f.value)).toEqual([
        "configSet",
        "bounceHandling",
        "complaintHandling",
        "emailHistory",
        "eventProcessor",
        "dashboardAccess",
      ]);
    });

    it("should include hint text for each feature", () => {
      const features = getAvailableFeatures();

      features.forEach((feature) => {
        expect(feature).toHaveProperty("value");
        expect(feature).toHaveProperty("label");
        expect(feature).toHaveProperty("hint");
        expect(feature.hint).toBeTruthy();
      });
    });
  });

  describe("promptFeatureSelection", () => {
    it("should return selected features", async () => {
      vi.mocked(clack.multiselect).mockResolvedValue([
        "configSet",
        "bounceHandling",
      ]);

      const result = await promptFeatureSelection();

      expect(result).toEqual(["configSet", "bounceHandling"]);
    });

    it("should use default preselected features", async () => {
      vi.mocked(clack.multiselect).mockResolvedValue([
        "configSet",
        "bounceHandling",
        "complaintHandling",
        "dashboardAccess",
      ]);

      await promptFeatureSelection();

      expect(clack.multiselect).toHaveBeenCalledWith(
        expect.objectContaining({
          initialValues: [
            "configSet",
            "bounceHandling",
            "complaintHandling",
            "dashboardAccess",
          ],
        })
      );
    });

    it("should use custom preselected features", async () => {
      vi.mocked(clack.multiselect).mockResolvedValue(["emailHistory"]);

      await promptFeatureSelection(["emailHistory"]);

      expect(clack.multiselect).toHaveBeenCalledWith(
        expect.objectContaining({
          initialValues: ["emailHistory"],
        })
      );
    });

    it("should mark selection as required", async () => {
      vi.mocked(clack.multiselect).mockResolvedValue(["configSet"]);

      await promptFeatureSelection();

      expect(clack.multiselect).toHaveBeenCalledWith(
        expect.objectContaining({
          required: true,
        })
      );
    });

    it("should handle cancellation", async () => {
      vi.mocked(clack.multiselect).mockResolvedValue(Symbol("cancelled"));
      vi.mocked(clack.isCancel).mockReturnValue(true);

      await expect(promptFeatureSelection()).rejects.toThrow(
        "process.exit called"
      );
    });
  });

  describe("promptConflictResolution", () => {
    it("should return deploy-alongside action", async () => {
      vi.mocked(clack.select).mockResolvedValue("deploy-alongside");

      const result = await promptConflictResolution(
        "IAM role",
        "existing-role"
      );

      expect(result).toBe("deploy-alongside");
    });

    it("should return replace action", async () => {
      vi.mocked(clack.select).mockResolvedValue("replace");

      const result = await promptConflictResolution(
        "config set",
        "existing-config"
      );

      expect(result).toBe("replace");
    });

    it("should return skip action", async () => {
      vi.mocked(clack.select).mockResolvedValue("skip");

      const result = await promptConflictResolution(
        "Lambda function",
        "existing-function"
      );

      expect(result).toBe("skip");
    });

    it("should include resource type and name in message", async () => {
      vi.mocked(clack.select).mockResolvedValue("deploy-alongside");

      await promptConflictResolution("IAM role", "my-role");

      expect(clack.select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("IAM role"),
        })
      );
    });

    it("should have three conflict resolution options", async () => {
      vi.mocked(clack.select).mockResolvedValue("deploy-alongside");

      await promptConflictResolution("resource", "name");

      const call = vi.mocked(clack.select).mock.calls[0][0];
      const options = call.options as any[];

      expect(options).toHaveLength(3);
      expect(options.map((o) => o.value)).toEqual([
        "deploy-alongside",
        "replace",
        "skip",
      ]);
    });
  });

  describe("promptSelectIdentities", () => {
    it("should return selected identity names", async () => {
      vi.mocked(clack.multiselect).mockResolvedValue([
        "example.com",
        "test.com",
      ]);

      const identities = [
        { name: "example.com", verified: true },
        { name: "test.com", verified: false },
      ];

      const result = await promptSelectIdentities(identities);

      expect(result).toEqual(["example.com", "test.com"]);
    });

    it("should show verified status in hints", async () => {
      vi.mocked(clack.multiselect).mockResolvedValue([]);

      const identities = [
        { name: "verified.com", verified: true },
        { name: "pending.com", verified: false },
      ];

      await promptSelectIdentities(identities);

      const call = vi.mocked(clack.multiselect).mock.calls[0][0];
      const options = call.options as any[];

      expect(options[0].hint).toBe("Verified");
      expect(options[1].hint).toBe("Pending verification");
    });

    it("should not require selection", async () => {
      vi.mocked(clack.multiselect).mockResolvedValue([]);

      await promptSelectIdentities([]);

      expect(clack.multiselect).toHaveBeenCalledWith(
        expect.objectContaining({
          required: false,
        })
      );
    });

    it("should handle empty identities array", async () => {
      vi.mocked(clack.multiselect).mockResolvedValue([]);

      const result = await promptSelectIdentities([]);

      expect(result).toEqual([]);
    });
  });

  describe("confirmConnect", () => {
    it("should return true when confirmed", async () => {
      vi.mocked(clack.confirm).mockResolvedValue(true);

      const result = await confirmConnect();

      expect(result).toBe(true);
    });

    it("should return false when declined", async () => {
      vi.mocked(clack.confirm).mockResolvedValue(false);

      const result = await confirmConnect();

      expect(result).toBe(false);
    });

    it("should have initial value of true", async () => {
      vi.mocked(clack.confirm).mockResolvedValue(true);

      await confirmConnect();

      expect(clack.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          initialValue: true,
        })
      );
    });
  });

  describe("promptConfigPreset", () => {
    it("should return selected preset", async () => {
      vi.mocked(clack.select).mockResolvedValue("production");

      const result = await promptConfigPreset();

      expect(result).toBe("production");
    });

    it("should include all preset options", async () => {
      vi.mocked(clack.select).mockResolvedValue("starter");

      await promptConfigPreset();

      const call = vi.mocked(clack.select).mock.calls[0][0];
      const options = call.options as any[];

      expect(options).toHaveLength(4);
      expect(options.map((o) => o.value)).toEqual([
        "starter",
        "production",
        "enterprise",
        "custom",
      ]);
    });

    it("should show estimated cost in hint", async () => {
      vi.mocked(clack.select).mockResolvedValue("starter");

      await promptConfigPreset();

      const call = vi.mocked(clack.select).mock.calls[0][0];
      const options = call.options as any[];

      options.forEach((option: any) => {
        expect(option.hint).toContain("Est.");
        expect(option.hint).toContain("/mo");
      });
    });
  });

  describe("promptEstimatedVolume", () => {
    it("should return selected volume", async () => {
      vi.mocked(clack.select).mockResolvedValue(50_000);

      const result = await promptEstimatedVolume();

      expect(result).toBe(50_000);
    });

    it("should include all volume ranges", async () => {
      vi.mocked(clack.select).mockResolvedValue(10_000);

      await promptEstimatedVolume();

      const call = vi.mocked(clack.select).mock.calls[0][0];
      const options = call.options as any[];

      expect(options).toHaveLength(5);
      expect(options.map((o) => o.value)).toEqual([
        1000, 10_000, 50_000, 250_000, 1_000_000,
      ]);
    });

    it("should include use case hints", async () => {
      vi.mocked(clack.select).mockResolvedValue(1000);

      await promptEstimatedVolume();

      const call = vi.mocked(clack.select).mock.calls[0][0];
      const options = call.options as any[];

      expect(options[0].hint).toContain("Development");
      expect(options[1].hint).toContain("Side Project");
      expect(options[2].hint).toContain("Startup");
      expect(options[3].hint).toContain("SaaS");
      expect(options[4].hint).toContain("High Volume");
    });
  });

  describe("promptCustomConfig", () => {
    it("should return custom configuration with all options enabled", async () => {
      vi.mocked(clack.confirm)
        .mockResolvedValueOnce(true) // reputation metrics (first)
        .mockResolvedValueOnce(true) // tracking
        .mockResolvedValueOnce(true) // event tracking (stores in DynamoDB)
        .mockResolvedValueOnce(true) // TLS
        .mockResolvedValueOnce(false) // custom MAIL FROM
        .mockResolvedValueOnce(false); // email archiving

      vi.mocked(clack.select).mockResolvedValue("90days");
      vi.mocked(clack.multiselect).mockResolvedValue(OPTIONAL_EVENT_TYPES);

      const result = await promptCustomConfig();

      expect(result.tracking.enabled).toBe(true);
      expect(result.eventTracking.enabled).toBe(true);
      expect(result.eventTracking.dynamoDBHistory).toBe(true);
      expect(result.tlsRequired).toBe(true);
      expect(result.reputationMetrics).toBe(true);
      expect(result.dedicatedIp).toBeUndefined();
    });

    it("should return configuration with minimal options", async () => {
      vi.mocked(clack.confirm)
        .mockResolvedValueOnce(false) // reputation metrics (first)
        .mockResolvedValueOnce(false) // tracking
        .mockResolvedValueOnce(false) // event tracking
        .mockResolvedValueOnce(true) // TLS
        .mockResolvedValueOnce(false) // custom MAIL FROM
        .mockResolvedValueOnce(false); // email archiving

      const result = await promptCustomConfig();

      expect(result.tracking.enabled).toBe(false);
      expect(result.eventTracking.enabled).toBe(false);
      expect(result.tlsRequired).toBe(true);
      expect(result.reputationMetrics).toBe(false);
      expect(result.dedicatedIp).toBeUndefined();
    });

    it("should prompt for retention when event tracking is enabled", async () => {
      vi.mocked(clack.confirm)
        .mockResolvedValueOnce(true) // reputation metrics (first)
        .mockResolvedValueOnce(true) // tracking
        .mockResolvedValueOnce(true) // event tracking (stores in DynamoDB)
        .mockResolvedValueOnce(true) // TLS
        .mockResolvedValueOnce(false) // custom MAIL FROM
        .mockResolvedValueOnce(false); // email archiving

      vi.mocked(clack.select).mockResolvedValue("1year");
      vi.mocked(clack.multiselect).mockResolvedValue(OPTIONAL_EVENT_TYPES);

      const result = await promptCustomConfig();

      expect(result.eventTracking.archiveRetention).toBe("1year");
      expect(clack.select).toHaveBeenCalled();
    });

    it("should skip retention prompt when event tracking is disabled", async () => {
      vi.mocked(clack.confirm)
        .mockResolvedValueOnce(true) // reputation metrics (first)
        .mockResolvedValueOnce(true) // tracking
        .mockResolvedValueOnce(false) // event tracking - DISABLED
        .mockResolvedValueOnce(true) // TLS
        .mockResolvedValueOnce(false) // custom MAIL FROM
        .mockResolvedValueOnce(false); // email archiving - DISABLED

      await promptCustomConfig();

      // select should not be called for retention (neither event tracking nor archiving)
      expect(clack.select).not.toHaveBeenCalled();
    });

    // Plan 182: the event-type prompt defaults to every optional type
    // selected, and BOUNCE/COMPLAINT are never offered as choices — they're
    // unconditionally unioned into the result. Accepting the defaults must
    // produce all ten types, byte-identical to ALL_EVENT_TYPES; that was not
    // true before this plan (a hardcoded eight-type literal silently dropped
    // DELIVERY_DELAY and SUBSCRIPTION even when the user picked "everything").
    it("should include all event types when event tracking is enabled and every option is accepted", async () => {
      vi.mocked(clack.confirm)
        .mockResolvedValueOnce(true) // reputation metrics (first)
        .mockResolvedValueOnce(true) // tracking
        .mockResolvedValueOnce(true) // event tracking (stores in DynamoDB)
        .mockResolvedValueOnce(true) // TLS
        .mockResolvedValueOnce(false) // custom MAIL FROM
        .mockResolvedValueOnce(false); // email archiving

      vi.mocked(clack.select).mockResolvedValue("90days");
      vi.mocked(clack.multiselect).mockResolvedValue(OPTIONAL_EVENT_TYPES);

      const result = await promptCustomConfig();

      expect(result.eventTracking.events).toEqual(ALL_EVENT_TYPES);
      expect(result.eventTracking.events).toHaveLength(10);

      // BOUNCE/COMPLAINT must not even be selectable — the prompt should
      // make the invalid combination impossible to produce, not just reject
      // it after the fact.
      const multiselectArgs = vi.mocked(clack.multiselect).mock.calls[0][0];
      const offeredValues = multiselectArgs.options.map(
        (option: { value: unknown }) => option.value
      );
      expect(offeredValues).not.toContain("BOUNCE");
      expect(offeredValues).not.toContain("COMPLAINT");
    });

    it("always includes BOUNCE and COMPLAINT even when deselected from the event-type prompt", async () => {
      vi.mocked(clack.confirm)
        .mockResolvedValueOnce(true) // reputation metrics (first)
        .mockResolvedValueOnce(true) // tracking
        .mockResolvedValueOnce(true) // event tracking (stores in DynamoDB)
        .mockResolvedValueOnce(true) // TLS
        .mockResolvedValueOnce(false) // custom MAIL FROM
        .mockResolvedValueOnce(false); // email archiving

      vi.mocked(clack.select).mockResolvedValue("90days");
      // BOUNCE/COMPLAINT aren't offered as options at all, so a caller can't
      // deselect them — simulate the user picking nothing.
      vi.mocked(clack.multiselect).mockResolvedValue([]);

      const result = await promptCustomConfig();

      expect(result.eventTracking.events).toEqual(["BOUNCE", "COMPLAINT"]);
    });

    it("should always enable suppression list", async () => {
      vi.mocked(clack.confirm)
        .mockResolvedValueOnce(false) // reputation metrics (first)
        .mockResolvedValueOnce(false) // tracking
        .mockResolvedValueOnce(false) // event tracking
        .mockResolvedValueOnce(true) // TLS
        .mockResolvedValueOnce(false) // custom MAIL FROM
        .mockResolvedValueOnce(false); // email archiving

      const result = await promptCustomConfig();

      expect(result.suppressionList.enabled).toBe(true);
      expect(result.suppressionList.reasons).toEqual(["BOUNCE", "COMPLAINT"]);
    });

    it("should always enable sending", async () => {
      vi.mocked(clack.confirm)
        .mockResolvedValueOnce(false) // reputation metrics (first)
        .mockResolvedValueOnce(false) // tracking
        .mockResolvedValueOnce(false) // event tracking
        .mockResolvedValueOnce(true) // TLS
        .mockResolvedValueOnce(false) // custom MAIL FROM
        .mockResolvedValueOnce(false); // email archiving

      const result = await promptCustomConfig();

      expect(result.sendingEnabled).toBe(true);
    });

    it("should include email archiving when enabled", async () => {
      vi.mocked(clack.confirm)
        .mockResolvedValueOnce(false) // reputation metrics (first)
        .mockResolvedValueOnce(false) // tracking
        .mockResolvedValueOnce(false) // event tracking
        .mockResolvedValueOnce(true) // TLS
        .mockResolvedValueOnce(false) // custom MAIL FROM
        .mockResolvedValueOnce(true); // email archiving

      vi.mocked(clack.select).mockResolvedValue("90days");

      const result = await promptCustomConfig();

      expect(result.emailArchiving?.enabled).toBe(true);
      expect(result.emailArchiving?.retention).toBe("90days");
    });

    it("should not include email archiving when disabled", async () => {
      vi.mocked(clack.confirm)
        .mockResolvedValueOnce(false) // reputation metrics (first)
        .mockResolvedValueOnce(false) // tracking
        .mockResolvedValueOnce(false) // event tracking
        .mockResolvedValueOnce(true) // TLS
        .mockResolvedValueOnce(false) // custom MAIL FROM
        .mockResolvedValueOnce(false); // email archiving

      const result = await promptCustomConfig();

      expect(result.emailArchiving).toEqual({
        enabled: false,
        retention: "90days",
      });
    });

    it("should prompt for retention period when email archiving is enabled", async () => {
      vi.mocked(clack.confirm)
        .mockResolvedValueOnce(false) // reputation metrics (first)
        .mockResolvedValueOnce(false) // tracking
        .mockResolvedValueOnce(false) // event tracking
        .mockResolvedValueOnce(true) // TLS
        .mockResolvedValueOnce(false) // custom MAIL FROM
        .mockResolvedValueOnce(true); // email archiving

      vi.mocked(clack.select).mockResolvedValue("1year");

      const result = await promptCustomConfig();

      expect(clack.select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Email archive retention period:",
          options: expect.arrayContaining([
            expect.objectContaining({ value: "7days" }),
            expect.objectContaining({ value: "30days" }),
            expect.objectContaining({ value: "90days" }),
            expect.objectContaining({ value: "6months" }),
            expect.objectContaining({ value: "1year" }),
            expect.objectContaining({ value: "18months" }),
          ]),
        })
      );
      expect(result.emailArchiving?.retention).toBe("1year");
    });

    it("should support all retention period options for email archiving", async () => {
      vi.mocked(clack.confirm)
        .mockResolvedValueOnce(false) // reputation metrics (first)
        .mockResolvedValueOnce(false) // tracking
        .mockResolvedValueOnce(false) // event tracking
        .mockResolvedValueOnce(true) // TLS
        .mockResolvedValueOnce(false) // custom MAIL FROM
        .mockResolvedValueOnce(true); // email archiving

      vi.mocked(clack.select).mockResolvedValue("18months");

      const result = await promptCustomConfig();

      expect(result.emailArchiving?.retention).toBe("18months");
    });

    it("should include mailFromSubdomain when custom MAIL FROM is enabled", async () => {
      vi.mocked(clack.confirm)
        .mockResolvedValueOnce(false) // reputation metrics
        .mockResolvedValueOnce(false) // tracking
        .mockResolvedValueOnce(false) // event tracking
        .mockResolvedValueOnce(true) // TLS
        .mockResolvedValueOnce(true) // custom MAIL FROM - ENABLED
        .mockResolvedValueOnce(false); // email archiving

      vi.mocked(clack.text).mockResolvedValue("bounce");

      const result = await promptCustomConfig();

      expect(result.mailFromSubdomain).toBe("bounce");
    });

    it("should not include mailFromSubdomain when custom MAIL FROM is disabled", async () => {
      vi.mocked(clack.confirm)
        .mockResolvedValueOnce(false) // reputation metrics
        .mockResolvedValueOnce(false) // tracking
        .mockResolvedValueOnce(false) // event tracking
        .mockResolvedValueOnce(true) // TLS
        .mockResolvedValueOnce(false) // custom MAIL FROM - DISABLED
        .mockResolvedValueOnce(false); // email archiving

      const result = await promptCustomConfig();

      expect(result.mailFromSubdomain).toBeUndefined();
    });
  });
});
