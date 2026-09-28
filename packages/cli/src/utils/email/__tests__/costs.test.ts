import { describe, expect, it } from "vitest";
import type { WrapsEmailConfig } from "../../../types/index.js";
import { calculateCosts, getCostSummary } from "../costs.js";

describe("Email Cost Calculation - User Webhook", () => {
  describe("calculateCosts", () => {
    it("should calculate cost when user webhook is enabled", () => {
      const config: WrapsEmailConfig = {
        userWebhook: {
          enabled: true,
          url: "https://example.com/webhooks/email",
          secret: "abc123",
        },
      };

      const costs = calculateCosts(config, 50_000);

      expect(costs.userWebhook).toBeDefined();
      expect(costs.userWebhook?.monthly).toBeGreaterThan(0);
      expect(costs.userWebhook?.description).toContain("User webhook");
    });

    it("should not include cost when user webhook is disabled", () => {
      const config: WrapsEmailConfig = {
        userWebhook: {
          enabled: false,
        },
      };

      const costs = calculateCosts(config, 50_000);

      expect(costs.userWebhook).toBeUndefined();
    });

    it("should not include cost when user webhook is not configured", () => {
      const config: WrapsEmailConfig = {};

      const costs = calculateCosts(config, 50_000);

      expect(costs.userWebhook).toBeUndefined();
    });

    it("should not charge for the retired dedicatedIp flag", () => {
      const withFlag = calculateCosts(
        { dedicatedIp: true } as WrapsEmailConfig,
        100_000
      );
      const withoutFlag = calculateCosts({} as WrapsEmailConfig, 100_000);

      expect(withFlag.dedicatedIp).toBeUndefined();
      expect(withFlag.total.monthly).toBe(withoutFlag.total.monthly);
    });

    it("should charge the à la carte fixed fee for managedDedicatedIps", () => {
      const costs = calculateCosts(
        { managedDedicatedIps: true } as WrapsEmailConfig,
        100_000
      );

      expect(costs.dedicatedIp?.monthly).toBe(15);
    });

    it("should include user webhook cost in total", () => {
      const configWithout: WrapsEmailConfig = {};
      const configWith: WrapsEmailConfig = {
        userWebhook: {
          enabled: true,
          url: "https://example.com/webhooks/email",
          secret: "abc123",
        },
      };

      const costsWithout = calculateCosts(configWithout, 50_000);
      const costsWith = calculateCosts(configWith, 50_000);

      expect(costsWith.total.monthly).toBeGreaterThan(
        costsWithout.total.monthly
      );
      expect(costsWith.total.monthly).toBeCloseTo(
        costsWithout.total.monthly + (costsWith.userWebhook?.monthly || 0),
        2
      );
    });

    it("should scale cost with email volume", () => {
      const config: WrapsEmailConfig = {
        userWebhook: {
          enabled: true,
          url: "https://example.com/webhooks/email",
          secret: "abc123",
        },
      };

      const costsLow = calculateCosts(config, 10_000);
      const costsHigh = calculateCosts(config, 1_000_000);

      expect(costsHigh.userWebhook?.monthly).toBeGreaterThan(
        costsLow.userWebhook?.monthly || 0
      );
    });

    it("should handle zero volume", () => {
      const config: WrapsEmailConfig = {
        userWebhook: {
          enabled: true,
          url: "https://example.com/webhooks/email",
          secret: "abc123",
        },
      };

      const costs = calculateCosts(config, 0);

      expect(costs.userWebhook).toBeDefined();
      expect(costs.userWebhook?.monthly).toBe(0);
    });

    it("should not include cost for disabled features including webhook", () => {
      const config: WrapsEmailConfig = {
        tracking: { enabled: false },
        eventTracking: { enabled: false },
        userWebhook: { enabled: false },
      };

      const costs = calculateCosts(config, 10_000);

      expect(costs.tracking).toBeUndefined();
      expect(costs.eventTracking).toBeUndefined();
      expect(costs.userWebhook).toBeUndefined();
    });
  });

  describe("getCostSummary", () => {
    it("should appear in cost summary when enabled", () => {
      const config: WrapsEmailConfig = {
        userWebhook: {
          enabled: true,
          url: "https://example.com/webhooks/email",
          secret: "abc123",
        },
      };

      const summary = getCostSummary(config, 50_000);

      expect(summary).toContain("User webhook");
    });

    it("should not appear in cost summary when disabled", () => {
      const config: WrapsEmailConfig = {
        userWebhook: {
          enabled: false,
        },
      };

      const summary = getCostSummary(config, 50_000);

      expect(summary).not.toContain("User webhook");
    });
  });
});
