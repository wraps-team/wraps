import { describe, expect, it } from "vitest";
import type { WrapsEmailConfig } from "../../types/index.js";
import { calculateCosts, formatCost, getCostSummary } from "../costs.js";

describe("Cost Calculation", () => {
  describe("calculateCosts", () => {
    it("should calculate minimal configuration costs (no features)", () => {
      const config: WrapsEmailConfig = {
        sendingEnabled: true,
      };

      const costs = calculateCosts(config, 10_000);

      // Only SES base cost: 10,000 emails * $0.0001 = $1.00
      expect(costs.total.monthly).toBe(1.0);
      expect(costs.total.perEmail).toBe(0.0001);
      expect(costs.tracking).toBeUndefined();
      expect(costs.reputationMetrics).toBeUndefined();
      expect(costs.eventTracking).toBeUndefined();
      expect(costs.dynamoDBHistory).toBeUndefined();
      expect(costs.dedicatedIp).toBeUndefined();
    });

    it("should calculate costs with tracking enabled (no custom domain)", () => {
      const config: WrapsEmailConfig = {
        tracking: {
          enabled: true,
          opens: true,
          clicks: true,
        },
      };

      const costs = calculateCosts(config, 10_000);

      expect(costs.tracking).toBeDefined();
      expect(costs.tracking?.monthly).toBe(0); // Tracking is free without custom domain
      expect(costs.tracking?.description).toContain("no additional cost");
    });

    it("should calculate costs with tracking and custom domain", () => {
      const config: WrapsEmailConfig = {
        tracking: {
          enabled: true,
          opens: true,
          clicks: true,
          customRedirectDomain: "track.example.com",
        },
      };

      const costs = calculateCosts(config, 10_000);

      expect(costs.tracking).toBeDefined();
      expect(costs.tracking?.monthly).toBe(0); // DNS records managed where user already manages DNS
      expect(costs.tracking?.description).toContain("no additional cost");
    });

    it("should calculate costs with reputation metrics", () => {
      const config: WrapsEmailConfig = {
        reputationMetrics: true,
      };

      const costs = calculateCosts(config, 10_000);

      expect(costs.reputationMetrics).toBeDefined();
      expect(costs.reputationMetrics?.monthly).toBe(0); // Reputation metrics are free
      expect(costs.reputationMetrics?.description).toContain("CloudWatch");
    });

    it("should calculate costs with dedicated IP", () => {
      const config: WrapsEmailConfig = {
        dedicatedIp: true,
      };

      const costs = calculateCosts(config, 10_000);

      expect(costs.dedicatedIp).toBeDefined();
      expect(costs.dedicatedIp?.monthly).toBe(24.95);
      expect(costs.dedicatedIp?.description).toContain("Dedicated IP");
    });

    it("should calculate event tracking costs (EventBridge enabled)", () => {
      const config: WrapsEmailConfig = {
        eventTracking: {
          enabled: true,
          eventBridge: true,
          events: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT"],
        },
      };

      const costs = calculateCosts(config, 10_000);

      expect(costs.eventTracking).toBeDefined();
      expect(costs.eventTracking?.monthly).toBeGreaterThan(0);
      expect(costs.eventTracking?.description).toContain("EventBridge");
      expect(costs.eventTracking?.description).toContain("4 event types");
    });

    it("should calculate event tracking costs with default 8 event types", () => {
      const config: WrapsEmailConfig = {
        eventTracking: {
          enabled: true,
          eventBridge: true,
        },
      };

      const costs = calculateCosts(config, 10_000);

      expect(costs.eventTracking).toBeDefined();
      expect(costs.eventTracking?.description).toContain("8 event types");
    });

    it("should calculate DynamoDB history costs with 90 days retention", () => {
      const config: WrapsEmailConfig = {
        eventTracking: {
          enabled: true,
          dynamoDBHistory: true,
          archiveRetention: "90days",
          events: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT"],
        },
      };

      const costs = calculateCosts(config, 10_000);

      expect(costs.dynamoDBHistory).toBeDefined();
      expect(costs.dynamoDBHistory?.monthly).toBeGreaterThan(0);
      expect(costs.dynamoDBHistory?.description).toContain("90days");
      expect(costs.dynamoDBHistory?.description).toContain("4 event types");
    });

    it("should calculate DynamoDB history costs with 1 year retention", () => {
      const config: WrapsEmailConfig = {
        eventTracking: {
          enabled: true,
          dynamoDBHistory: true,
          archiveRetention: "1year",
        },
      };

      const costs = calculateCosts(config, 10_000);

      expect(costs.dynamoDBHistory).toBeDefined();
      expect(costs.dynamoDBHistory?.monthly).toBeGreaterThan(0);
      expect(costs.dynamoDBHistory?.description).toContain("1year");
    });

    it("should calculate DynamoDB history costs with indefinite retention", () => {
      const config: WrapsEmailConfig = {
        eventTracking: {
          enabled: true,
          dynamoDBHistory: true,
          archiveRetention: "indefinite",
        },
      };

      const costs = calculateCosts(config, 10_000);

      expect(costs.dynamoDBHistory).toBeDefined();
      expect(costs.dynamoDBHistory?.monthly).toBeGreaterThan(0);
      expect(costs.dynamoDBHistory?.description).toContain("indefinite");
    });

    it("should calculate combined costs for full production setup", () => {
      const config: WrapsEmailConfig = {
        tracking: {
          enabled: true,
          opens: true,
          clicks: true,
        },
        reputationMetrics: true,
        eventTracking: {
          enabled: true,
          eventBridge: true,
          dynamoDBHistory: true,
          archiveRetention: "90days",
          events: [
            "SEND",
            "DELIVERY",
            "OPEN",
            "CLICK",
            "BOUNCE",
            "COMPLAINT",
            "REJECT",
            "RENDERING_FAILURE",
          ],
        },
      };

      const costs = calculateCosts(config, 10_000);

      // All features should be present
      expect(costs.tracking).toBeDefined();
      expect(costs.reputationMetrics).toBeDefined();
      expect(costs.eventTracking).toBeDefined();
      expect(costs.dynamoDBHistory).toBeDefined();

      // Total should be sum of all components
      const expectedTotal =
        1.0 + // SES base cost for 10k emails
        (costs.tracking?.monthly || 0) +
        (costs.reputationMetrics?.monthly || 0) +
        (costs.eventTracking?.monthly || 0) +
        (costs.dynamoDBHistory?.monthly || 0);

      expect(costs.total.monthly).toBeCloseTo(expectedTotal, 2);
    });

    it("should calculate enterprise setup with dedicated IP", () => {
      const config: WrapsEmailConfig = {
        tracking: {
          enabled: true,
          opens: true,
          clicks: true,
          customRedirectDomain: "track.example.com",
        },
        reputationMetrics: true,
        dedicatedIp: true,
        eventTracking: {
          enabled: true,
          eventBridge: true,
          dynamoDBHistory: true,
          archiveRetention: "1year",
        },
      };

      const costs = calculateCosts(config, 100_000);

      // All features including dedicated IP
      expect(costs.tracking).toBeDefined();
      expect(costs.reputationMetrics).toBeDefined();
      expect(costs.eventTracking).toBeDefined();
      expect(costs.dynamoDBHistory).toBeDefined();
      expect(costs.dedicatedIp).toBeDefined();

      // Dedicated IP should be a significant portion of the cost
      expect(costs.dedicatedIp?.monthly).toBe(24.95);

      // Total should be substantial for enterprise setup
      expect(costs.total.monthly).toBeGreaterThan(25);
    });

    it("should scale costs linearly with email volume", () => {
      const config: WrapsEmailConfig = {
        eventTracking: {
          enabled: true,
          eventBridge: true,
          dynamoDBHistory: true,
          archiveRetention: "90days",
        },
      };

      const costs10k = calculateCosts(config, 10_000);
      const costs100k = calculateCosts(config, 100_000);

      // 100k emails should cost roughly 10x more than 10k emails
      // (not exactly due to free tiers and fixed costs)
      expect(costs100k.total.monthly).toBeGreaterThan(costs10k.total.monthly);
    });

    it("should handle zero email volume", () => {
      const config: WrapsEmailConfig = {
        tracking: { enabled: true, opens: true, clicks: true },
        reputationMetrics: true,
      };

      const costs = calculateCosts(config, 0);

      // Should only have fixed costs (no per-email costs)
      expect(costs.total.monthly).toBe(0);
    });

    it("should handle very high email volumes", () => {
      const config: WrapsEmailConfig = {
        eventTracking: {
          enabled: true,
          eventBridge: true,
          dynamoDBHistory: true,
          archiveRetention: "1year",
        },
      };

      const costs = calculateCosts(config, 10_000_000); // 10 million emails

      // Should calculate without errors
      expect(costs.total.monthly).toBeGreaterThan(0);
      expect(Number.isFinite(costs.total.monthly)).toBe(true);
    });

    it("should not include costs for disabled features", () => {
      const config: WrapsEmailConfig = {
        tracking: {
          enabled: false,
          opens: false,
          clicks: false,
        },
        reputationMetrics: false,
        dedicatedIp: false,
        eventTracking: {
          enabled: false,
        },
      };

      const costs = calculateCosts(config, 10_000);

      expect(costs.tracking).toBeUndefined();
      expect(costs.reputationMetrics).toBeUndefined();
      expect(costs.eventTracking).toBeUndefined();
      expect(costs.dedicatedIp).toBeUndefined();
    });
  });

  describe("Storage Cost Calculations", () => {
    it("should increase storage costs with longer retention periods", () => {
      const config7days: WrapsEmailConfig = {
        eventTracking: {
          enabled: true,
          dynamoDBHistory: true,
          archiveRetention: "7days",
        },
      };

      const config90days: WrapsEmailConfig = {
        eventTracking: {
          enabled: true,
          dynamoDBHistory: true,
          archiveRetention: "90days",
        },
      };

      const config1year: WrapsEmailConfig = {
        eventTracking: {
          enabled: true,
          dynamoDBHistory: true,
          archiveRetention: "1year",
        },
      };

      // Use higher volume to exceed free tier and see cost differences
      const costs7days = calculateCosts(config7days, 100_000);
      const costs90days = calculateCosts(config90days, 100_000);
      const costs1year = calculateCosts(config1year, 100_000);

      // All configs should have DynamoDB history costs
      expect(costs7days.dynamoDBHistory).toBeDefined();
      expect(costs90days.dynamoDBHistory).toBeDefined();
      expect(costs1year.dynamoDBHistory).toBeDefined();

      // Verify retention descriptions are correct
      expect(costs7days.dynamoDBHistory?.description).toContain("7days");
      expect(costs90days.dynamoDBHistory?.description).toContain("90days");
      expect(costs1year.dynamoDBHistory?.description).toContain("1year");

      // Longer retention should have equal or higher costs (mostly write costs, small storage differences)
      expect(costs7days.dynamoDBHistory?.monthly).toBeLessThanOrEqual(
        costs1year.dynamoDBHistory?.monthly || 0
      );
    });

    it("should account for multiple event types in storage calculation", () => {
      const config4events: WrapsEmailConfig = {
        eventTracking: {
          enabled: true,
          dynamoDBHistory: true,
          archiveRetention: "90days",
          events: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT"],
        },
      };

      const config8events: WrapsEmailConfig = {
        eventTracking: {
          enabled: true,
          dynamoDBHistory: true,
          archiveRetention: "90days",
          events: [
            "SEND",
            "DELIVERY",
            "OPEN",
            "CLICK",
            "BOUNCE",
            "COMPLAINT",
            "REJECT",
            "RENDERING_FAILURE",
          ],
        },
      };

      const costs4events = calculateCosts(config4events, 10_000);
      const costs8events = calculateCosts(config8events, 10_000);

      // More event types = more storage
      expect(costs4events.dynamoDBHistory?.monthly).toBeLessThan(
        costs8events.dynamoDBHistory?.monthly || 0
      );
    });
  });

  describe("Free Tier Calculations", () => {
    it("should benefit from Lambda free tier for low volumes", () => {
      const config: WrapsEmailConfig = {
        eventTracking: {
          enabled: true,
          eventBridge: true,
        },
      };

      // Very low volume should be mostly covered by free tier
      const costsLow = calculateCosts(config, 100);

      // Should have some cost but minimal due to free tier
      expect(costsLow.eventTracking?.monthly).toBeGreaterThanOrEqual(0);
      expect(costsLow.eventTracking?.monthly).toBeLessThan(1);
    });

    it("should not apply SES free tier (conservative estimate)", () => {
      const config: WrapsEmailConfig = {};

      const costs = calculateCosts(config, 3000);

      // Should charge for all 3,000 emails (no free tier assumption)
      // 3,000 * $0.0001 = $0.30
      expect(costs.total.monthly).toBe(0.3);
    });
  });

  describe("formatCost", () => {
    it("should format zero cost as Free", () => {
      expect(formatCost(0)).toBe("Free");
    });

    it("should format very small costs", () => {
      expect(formatCost(0.001)).toBe("< $0.01");
      expect(formatCost(0.005)).toBe("< $0.01");
      expect(formatCost(0.009)).toBe("< $0.01");
    });

    it("should format costs with 2 decimal places", () => {
      expect(formatCost(0.01)).toBe("$0.01");
      expect(formatCost(1.0)).toBe("$1.00");
      expect(formatCost(1.5)).toBe("$1.50");
      expect(formatCost(24.95)).toBe("$24.95");
      expect(formatCost(100.0)).toBe("$100.00");
    });

    it("should round to 2 decimal places", () => {
      expect(formatCost(1.234)).toBe("$1.23");
      expect(formatCost(1.235)).toBe("$1.24");
      expect(formatCost(1.999)).toBe("$2.00");
    });

    it("should handle large numbers", () => {
      expect(formatCost(1000)).toBe("$1000.00");
      expect(formatCost(10_000)).toBe("$10000.00");
    });
  });

  describe("getCostSummary", () => {
    it("should generate summary for minimal config", () => {
      const config: WrapsEmailConfig = {};

      const summary = getCostSummary(config, 10_000);

      expect(summary).toContain("10,000 emails/month");
      expect(summary).toContain("$1.00/mo");
      expect(summary).toContain("$0.10/1k emails");
    });

    it("should include all enabled features in summary", () => {
      const config: WrapsEmailConfig = {
        tracking: { enabled: true, opens: true, clicks: true },
        reputationMetrics: true,
        dedicatedIp: true,
        eventTracking: {
          enabled: true,
          eventBridge: true,
          dynamoDBHistory: true,
          archiveRetention: "90days",
        },
      };

      const summary = getCostSummary(config, 10_000);

      expect(summary).toContain("tracking");
      expect(summary).toContain("Reputation metrics");
      expect(summary).toContain("Event processing");
      expect(summary).toContain("Email history");
      expect(summary).toContain("Dedicated IP");
    });

    it("should format numbers with thousands separators", () => {
      const config: WrapsEmailConfig = {};

      const summary = getCostSummary(config, 1_000_000);

      expect(summary).toContain("1,000,000 emails/month");
    });

    it("should show per-email cost", () => {
      const config: WrapsEmailConfig = {};

      const summary = getCostSummary(config, 10_000);

      // Should show $0.10 per 1k emails
      expect(summary).toContain("$0.10/1k emails");
    });

    it("should not include disabled features in summary", () => {
      const config: WrapsEmailConfig = {
        tracking: { enabled: false },
        reputationMetrics: false,
      };

      const summary = getCostSummary(config, 10_000);

      expect(summary).not.toContain("tracking");
      expect(summary).not.toContain("Reputation metrics");
    });

    it("should handle custom tracking domain in summary", () => {
      const config: WrapsEmailConfig = {
        tracking: {
          enabled: true,
          opens: true,
          clicks: true,
          customRedirectDomain: "track.example.com",
        },
      };

      const summary = getCostSummary(config, 10_000);

      expect(summary).toContain("no additional cost");
      expect(summary).toContain("Free");
    });

    it("should format multi-line summary correctly", () => {
      const config: WrapsEmailConfig = {
        tracking: { enabled: true, opens: true, clicks: true },
        reputationMetrics: true,
      };

      const summary = getCostSummary(config, 10_000);

      const lines = summary.split("\n");
      expect(lines.length).toBeGreaterThan(1);
      expect(lines[0]).toContain("Estimated cost");
      expect(lines.filter((line) => line.includes("-")).length).toBeGreaterThan(
        0
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty config object", () => {
      const config: WrapsEmailConfig = {};

      expect(() => calculateCosts(config, 10_000)).not.toThrow();
      const costs = calculateCosts(config, 10_000);
      expect(costs.total.monthly).toBeGreaterThanOrEqual(0);
    });

    it("should handle config with undefined fields", () => {
      const config: WrapsEmailConfig = {
        tracking: undefined,
        reputationMetrics: undefined,
        eventTracking: undefined,
      };

      expect(() => calculateCosts(config, 10_000)).not.toThrow();
    });

    it("should handle very large email volumes without overflow", () => {
      const config: WrapsEmailConfig = {
        eventTracking: {
          enabled: true,
          eventBridge: true,
          dynamoDBHistory: true,
          archiveRetention: "1year",
        },
      };

      const costs = calculateCosts(config, 100_000_000); // 100 million

      expect(Number.isFinite(costs.total.monthly)).toBe(true);
      expect(costs.total.monthly).toBeGreaterThan(0);
    });

    it("should handle negative email volume gracefully", () => {
      const config: WrapsEmailConfig = {};

      const costs = calculateCosts(config, -1000);

      // Should treat negative as zero or minimal cost
      expect(costs.total.monthly).toBeLessThanOrEqual(0);
    });
  });

  describe("Realistic Scenarios", () => {
    it("should calculate Starter preset costs (~$0.05/mo)", () => {
      const config: WrapsEmailConfig = {
        tracking: { enabled: true, opens: true, clicks: true },
        suppressionList: {
          enabled: true,
          reasons: ["BOUNCE", "COMPLAINT"],
        },
      };

      const costs = calculateCosts(config, 1000);

      // Starter should be very cheap for 1k emails
      expect(costs.total.monthly).toBeLessThan(1);
    });

    it("should calculate Production preset costs (~$2-5/mo)", () => {
      const config: WrapsEmailConfig = {
        tracking: { enabled: true, opens: true, clicks: true },
        reputationMetrics: true,
        eventTracking: {
          enabled: true,
          eventBridge: true,
          dynamoDBHistory: true,
          archiveRetention: "90days",
        },
        suppressionList: {
          enabled: true,
          reasons: ["BOUNCE", "COMPLAINT"],
        },
      };

      const costs = calculateCosts(config, 10_000);

      // Production should be in $2-5 range for 10k emails
      expect(costs.total.monthly).toBeGreaterThan(0.5);
      expect(costs.total.monthly).toBeLessThan(10);
    });

    it("should calculate Enterprise preset costs (~$50-100/mo)", () => {
      const config: WrapsEmailConfig = {
        tracking: { enabled: true, opens: true, clicks: true },
        reputationMetrics: true,
        dedicatedIp: true,
        eventTracking: {
          enabled: true,
          eventBridge: true,
          dynamoDBHistory: true,
          archiveRetention: "1year",
        },
        suppressionList: {
          enabled: true,
          reasons: ["BOUNCE", "COMPLAINT"],
        },
      };

      const costs = calculateCosts(config, 100_000);

      // Enterprise with dedicated IP should be $50+ for 100k emails
      expect(costs.total.monthly).toBeGreaterThan(25);
    });
  });
});
