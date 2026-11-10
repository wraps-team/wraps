import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WrapsEmailConfig } from "../../types/index.js";
import {
  formatDeniedActions,
  getRequiredActions,
} from "../shared/iam-check.js";

describe("IAM check utility", () => {
  describe("getRequiredActions", () => {
    it("should return core actions for basic config", () => {
      const config: WrapsEmailConfig = {
        tracking: { enabled: true },
      };

      const actions = getRequiredActions(config);

      expect(actions).toContain("iam:CreateRole");
      expect(actions).toContain("ses:CreateConfigurationSet");
      expect(actions).toContain("ses:CreateEmailIdentity");
    });

    it("should add event tracking actions when enabled", () => {
      const config: WrapsEmailConfig = {
        tracking: { enabled: true },
        eventTracking: { enabled: true },
      };

      const actions = getRequiredActions(config);

      expect(actions).toContain("events:CreateEventBus");
      expect(actions).toContain("events:PutRule");
      expect(actions).toContain("sqs:CreateQueue");
    });

    it("should add DynamoDB and Lambda actions when history enabled", () => {
      const config: WrapsEmailConfig = {
        tracking: { enabled: true },
        eventTracking: { enabled: true, dynamoDBHistory: true },
      };

      const actions = getRequiredActions(config);

      expect(actions).toContain("dynamodb:CreateTable");
      expect(actions).toContain("lambda:CreateFunction");
    });

    it("should not duplicate actions", () => {
      const config: WrapsEmailConfig = {
        tracking: { enabled: true },
        eventTracking: { enabled: true, dynamoDBHistory: true },
      };

      const actions = getRequiredActions(config);
      const uniqueActions = [...new Set(actions)];

      expect(actions.length).toBe(uniqueActions.length);
    });
  });

  describe("checkIAMPermissions", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.resetModules();
    });

    it("should return success when all actions are allowed", async () => {
      vi.doMock("@aws-sdk/client-iam", () => ({
        IAMClient: class {
          send() {
            return Promise.resolve({
              EvaluationResults: [
                { EvalActionName: "iam:CreateRole", EvalDecision: "allowed" },
                {
                  EvalActionName: "ses:CreateConfigurationSet",
                  EvalDecision: "allowed",
                },
              ],
            });
          }
        },
        SimulatePrincipalPolicyCommand: class {},
      }));

      // Re-import after mocking
      const { checkIAMPermissions } = await import("../shared/iam-check.js");

      const result = await checkIAMPermissions(
        "arn:aws:iam::123456789012:user/test",
        ["iam:CreateRole", "ses:CreateConfigurationSet"],
        "us-east-1"
      );

      expect(result.success).toBe(true);
      expect(result.deniedActions).toHaveLength(0);
      expect(result.allowedActions).toHaveLength(2);
      expect(result.skipped).toBe(false);
    });

    it("should return denied actions when permissions are missing", async () => {
      vi.doMock("@aws-sdk/client-iam", () => ({
        IAMClient: class {
          send() {
            return Promise.resolve({
              EvaluationResults: [
                { EvalActionName: "iam:CreateRole", EvalDecision: "allowed" },
                {
                  EvalActionName: "ses:CreateConfigurationSet",
                  EvalDecision: "implicitDeny",
                },
              ],
            });
          }
        },
        SimulatePrincipalPolicyCommand: class {},
      }));

      // Re-import after mocking
      const { checkIAMPermissions } = await import("../shared/iam-check.js");

      const result = await checkIAMPermissions(
        "arn:aws:iam::123456789012:user/test",
        ["iam:CreateRole", "ses:CreateConfigurationSet"],
        "us-east-1"
      );

      expect(result.success).toBe(false);
      expect(result.deniedActions).toContain("ses:CreateConfigurationSet");
      expect(result.allowedActions).toContain("iam:CreateRole");
    });

    it("should skip gracefully when user lacks SimulatePrincipalPolicy permission", async () => {
      vi.doMock("@aws-sdk/client-iam", () => ({
        IAMClient: class {
          send() {
            const error = new Error(
              "User: ... is not authorized to perform: iam:SimulatePrincipalPolicy"
            );
            error.name = "AccessDenied";
            return Promise.reject(error);
          }
        },
        SimulatePrincipalPolicyCommand: class {},
      }));

      // Re-import after mocking
      const { checkIAMPermissions } = await import("../shared/iam-check.js");

      const result = await checkIAMPermissions(
        "arn:aws:iam::123456789012:user/test",
        ["iam:CreateRole"],
        "us-east-1"
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toContain("SimulatePrincipalPolicy");
    });

    it("should handle other errors gracefully", async () => {
      vi.doMock("@aws-sdk/client-iam", () => ({
        IAMClient: class {
          send() {
            return Promise.reject(new Error("Network error"));
          }
        },
        SimulatePrincipalPolicyCommand: class {},
      }));

      // Re-import after mocking
      const { checkIAMPermissions } = await import("../shared/iam-check.js");

      const result = await checkIAMPermissions(
        "arn:aws:iam::123456789012:user/test",
        ["iam:CreateRole"],
        "us-east-1"
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toContain("Network error");
    });
  });

  describe("formatDeniedActions", () => {
    it("should return empty string for no denied actions", () => {
      expect(formatDeniedActions([])).toBe("");
    });

    it("should group actions by service", () => {
      const formatted = formatDeniedActions([
        "iam:CreateRole",
        "iam:DeleteRole",
        "ses:CreateConfigurationSet",
      ]);

      expect(formatted).toContain("IAM:");
      expect(formatted).toContain("SES:");
      expect(formatted).toContain("iam:CreateRole");
      expect(formatted).toContain("iam:DeleteRole");
      expect(formatted).toContain("ses:CreateConfigurationSet");
    });

    it("should include help text", () => {
      const formatted = formatDeniedActions(["iam:CreateRole"]);

      expect(formatted).toContain("Missing permissions");
      expect(formatted).toContain(
        "Write the IAM policies to attach: `wraps permissions --policy-dir ./wraps-policy`"
      );
    });
  });
});
