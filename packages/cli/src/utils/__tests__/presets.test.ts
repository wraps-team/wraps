import { describe, expect, it } from "vitest";
import type { WrapsEmailConfig } from "../../types/index.js";
import {
  ENTERPRISE_PRESET,
  getAllPresetInfo,
  getPreset,
  getPresetInfo,
  getUpgradePath,
  PRODUCTION_PRESET,
  STARTER_PRESET,
  validateConfig,
} from "../presets.js";

describe("Preset Configurations", () => {
  describe("STARTER_PRESET", () => {
    it("should have basic tracking enabled", () => {
      expect(STARTER_PRESET.tracking?.enabled).toBe(true);
      expect(STARTER_PRESET.tracking?.opens).toBe(true);
      expect(STARTER_PRESET.tracking?.clicks).toBe(true);
    });

    it("should require TLS", () => {
      expect(STARTER_PRESET.tlsRequired).toBe(true);
    });

    it("should have suppression list enabled", () => {
      expect(STARTER_PRESET.suppressionList?.enabled).toBe(true);
      expect(STARTER_PRESET.suppressionList?.reasons).toEqual([
        "BOUNCE",
        "COMPLAINT",
      ]);
    });

    it("should not have reputation metrics", () => {
      expect(STARTER_PRESET.reputationMetrics).toBe(false);
    });

    it("should not have event tracking enabled", () => {
      expect(STARTER_PRESET.eventTracking?.enabled).toBe(false);
    });

    it("should not have dedicated IP", () => {
      expect(STARTER_PRESET.dedicatedIp).toBeUndefined();
    });

    it("should have sending enabled", () => {
      expect(STARTER_PRESET.sendingEnabled).toBe(true);
    });
  });

  describe("PRODUCTION_PRESET", () => {
    it("should have all starter features", () => {
      expect(PRODUCTION_PRESET.tracking?.enabled).toBe(true);
      expect(PRODUCTION_PRESET.tlsRequired).toBe(true);
      expect(PRODUCTION_PRESET.suppressionList?.enabled).toBe(true);
      expect(PRODUCTION_PRESET.sendingEnabled).toBe(true);
    });

    it("should have reputation metrics enabled", () => {
      expect(PRODUCTION_PRESET.reputationMetrics).toBe(true);
    });

    it("should have event tracking enabled with EventBridge", () => {
      expect(PRODUCTION_PRESET.eventTracking?.enabled).toBe(true);
      expect(PRODUCTION_PRESET.eventTracking?.eventBridge).toBe(true);
    });

    it("should track 8 event types", () => {
      expect(PRODUCTION_PRESET.eventTracking?.events).toHaveLength(8);
      expect(PRODUCTION_PRESET.eventTracking?.events).toEqual([
        "SEND",
        "DELIVERY",
        "OPEN",
        "CLICK",
        "BOUNCE",
        "COMPLAINT",
        "REJECT",
        "RENDERING_FAILURE",
      ]);
    });

    it("should have DynamoDB history enabled with 3-month retention", () => {
      expect(PRODUCTION_PRESET.eventTracking?.dynamoDBHistory).toBe(true);
      expect(PRODUCTION_PRESET.eventTracking?.archiveRetention).toBe("3months");
    });

    it("should not have dedicated IP", () => {
      expect(PRODUCTION_PRESET.dedicatedIp).toBeUndefined();
    });
  });

  describe("ENTERPRISE_PRESET", () => {
    it("should have all production features", () => {
      expect(ENTERPRISE_PRESET.tracking?.enabled).toBe(true);
      expect(ENTERPRISE_PRESET.reputationMetrics).toBe(true);
      expect(ENTERPRISE_PRESET.eventTracking?.enabled).toBe(true);
      expect(ENTERPRISE_PRESET.eventTracking?.dynamoDBHistory).toBe(true);
    });

    it("should track all 10 event types", () => {
      expect(ENTERPRISE_PRESET.eventTracking?.events).toHaveLength(10);
      expect(ENTERPRISE_PRESET.eventTracking?.events).toEqual([
        "SEND",
        "DELIVERY",
        "OPEN",
        "CLICK",
        "BOUNCE",
        "COMPLAINT",
        "REJECT",
        "RENDERING_FAILURE",
        "DELIVERY_DELAY",
        "SUBSCRIPTION",
      ]);
    });

    it("should have 1-year retention", () => {
      expect(ENTERPRISE_PRESET.eventTracking?.archiveRetention).toBe("1year");
    });

    it("should have dedicated IP", () => {
      expect(ENTERPRISE_PRESET.dedicatedIp).toBe(true);
    });
  });

  describe("getPreset", () => {
    it("should return STARTER_PRESET for starter", () => {
      const preset = getPreset("starter");
      expect(preset).toEqual(STARTER_PRESET);
    });

    it("should return PRODUCTION_PRESET for production", () => {
      const preset = getPreset("production");
      expect(preset).toEqual(PRODUCTION_PRESET);
    });

    it("should return ENTERPRISE_PRESET for enterprise", () => {
      const preset = getPreset("enterprise");
      expect(preset).toEqual(ENTERPRISE_PRESET);
    });

    it("should return null for custom", () => {
      const preset = getPreset("custom");
      expect(preset).toBeNull();
    });
  });

  describe("getPresetInfo", () => {
    describe("Starter Info", () => {
      it("should return correct metadata for starter", () => {
        const info = getPresetInfo("starter");

        expect(info.name).toBe("Starter");
        expect(info.description).toContain("Minimal features");
        expect(info.volume).toBe("Up to 10k emails/month");
        expect(info.recommended).toContain("Side projects");
      });

      it("should include starter features", () => {
        const info = getPresetInfo("starter");

        expect(info.features).toContain("Open & click tracking");
        expect(info.features).toContain("TLS encryption required");
        expect(info.features).toContain(
          "Automatic bounce/complaint suppression"
        );
      });

      it("should have estimated cost", () => {
        const info = getPresetInfo("starter");

        expect(info.estimatedCost).toBeDefined();
        expect(info.estimatedCost).not.toBe("Varies");
      });
    });

    describe("Production Info", () => {
      it("should return correct metadata for production", () => {
        const info = getPresetInfo("production");

        expect(info.name).toBe("Production");
        expect(info.description).toContain("Recommended");
        expect(info.volume).toBe("10k-500k emails/month");
        expect(info.recommended).toContain("RECOMMENDED");
      });

      it("should include production features", () => {
        const info = getPresetInfo("production");

        expect(info.features).toContain("Everything in Starter");
        expect(info.features).toContain("Reputation metrics dashboard");
        expect(info.features).toContain(
          "Real-time event tracking (EventBridge)"
        );
        expect(info.features).toContain("3-month email history storage");
      });

      it("should have higher cost than starter", () => {
        const _starterInfo = getPresetInfo("starter");
        const prodInfo = getPresetInfo("production");

        // Both should have valid costs (not "Free" or "Varies")
        expect(prodInfo.estimatedCost).toBeDefined();
        expect(prodInfo.estimatedCost).not.toBe("Varies");
      });
    });

    describe("Enterprise Info", () => {
      it("should return correct metadata for enterprise", () => {
        const info = getPresetInfo("enterprise");

        expect(info.name).toBe("Enterprise");
        expect(info.description).toContain("Full features");
        expect(info.volume).toBe("500k+ emails/month");
        expect(info.recommended).toContain("high-volume");
      });

      it("should include enterprise features", () => {
        const info = getPresetInfo("enterprise");

        expect(info.features).toContain("Everything in Production");
        expect(info.features).toContain("Dedicated IP address");
        expect(info.features).toContain("1-year email history");
        expect(info.features).toContain("All event types tracked");
      });

      it("should have higher cost than production", () => {
        const _prodInfo = getPresetInfo("production");
        const enterpriseInfo = getPresetInfo("enterprise");

        // Both should have valid costs
        expect(enterpriseInfo.estimatedCost).toBeDefined();
        expect(enterpriseInfo.estimatedCost).not.toBe("Free");
      });
    });

    describe("Custom Info", () => {
      it("should return correct metadata for custom", () => {
        const info = getPresetInfo("custom");

        expect(info.name).toBe("Custom");
        expect(info.description).toContain("Configure each feature");
        expect(info.volume).toBe("Any volume");
        expect(info.estimatedCost).toBe("Varies");
        expect(info.recommended).toContain("Advanced users");
      });

      it("should have generic features description", () => {
        const info = getPresetInfo("custom");

        expect(info.features).toContain("Full control over all features");
      });
    });
  });

  describe("getAllPresetInfo", () => {
    it("should return info for all 4 presets", () => {
      const allInfo = getAllPresetInfo();

      expect(allInfo).toHaveLength(4);
    });

    it("should include all preset types", () => {
      const allInfo = getAllPresetInfo();

      const names = allInfo.map((info) => info.name);
      expect(names).toContain("Starter");
      expect(names).toContain("Production");
      expect(names).toContain("Enterprise");
      expect(names).toContain("Custom");
    });

    it("should return presets in correct order", () => {
      const allInfo = getAllPresetInfo();

      expect(allInfo[0].name).toBe("Starter");
      expect(allInfo[1].name).toBe("Production");
      expect(allInfo[2].name).toBe("Enterprise");
      expect(allInfo[3].name).toBe("Custom");
    });
  });

  describe("getUpgradePath", () => {
    it("should detect tracking upgrade", () => {
      const current: WrapsEmailConfig = {
        tracking: { enabled: false },
      };

      const target: WrapsEmailConfig = {
        tracking: { enabled: true, opens: true, clicks: true },
      };

      const changes = getUpgradePath(current, target);

      expect(changes).toContain("Enable email tracking (opens & clicks)");
    });

    it("should detect reputation metrics upgrade", () => {
      const current: WrapsEmailConfig = {
        reputationMetrics: false,
      };

      const target: WrapsEmailConfig = {
        reputationMetrics: true,
      };

      const changes = getUpgradePath(current, target);

      expect(changes).toContain("Enable reputation metrics");
    });

    it("should detect event tracking upgrade", () => {
      const current: WrapsEmailConfig = {
        eventTracking: { enabled: false },
      };

      const target: WrapsEmailConfig = {
        eventTracking: { enabled: true, eventBridge: true },
      };

      const changes = getUpgradePath(current, target);

      expect(changes).toContain("Enable real-time event tracking");
    });

    it("should detect DynamoDB history upgrade", () => {
      const current: WrapsEmailConfig = {
        eventTracking: { enabled: true, dynamoDBHistory: false },
      };

      const target: WrapsEmailConfig = {
        eventTracking: { enabled: true, dynamoDBHistory: true },
      };

      const changes = getUpgradePath(current, target);

      expect(changes).toContain("Enable email history storage");
    });

    it("should detect retention upgrade", () => {
      const current: WrapsEmailConfig = {
        eventTracking: {
          enabled: true,
          dynamoDBHistory: true,
          archiveRetention: "3months",
        },
      };

      const target: WrapsEmailConfig = {
        eventTracking: {
          enabled: true,
          dynamoDBHistory: true,
          archiveRetention: "1year",
        },
      };

      const changes = getUpgradePath(current, target);

      expect(changes).toContain("Upgrade retention: 3months → 1year");
    });

    it("should detect dedicated IP upgrade", () => {
      const current: WrapsEmailConfig = {
        dedicatedIp: false,
      };

      const target: WrapsEmailConfig = {
        dedicatedIp: true,
      };

      const changes = getUpgradePath(current, target);

      expect(changes).toContain("Add dedicated IP address");
    });

    it("should detect multiple changes", () => {
      const current: WrapsEmailConfig = {
        tracking: { enabled: false },
        reputationMetrics: false,
      };

      const target: WrapsEmailConfig = {
        tracking: { enabled: true, opens: true, clicks: true },
        reputationMetrics: true,
        dedicatedIp: true,
      };

      const changes = getUpgradePath(current, target);

      expect(changes).toHaveLength(3);
      expect(changes).toContain("Enable email tracking (opens & clicks)");
      expect(changes).toContain("Enable reputation metrics");
      expect(changes).toContain("Add dedicated IP address");
    });

    it("should return empty array for no changes", () => {
      const config: WrapsEmailConfig = {
        tracking: { enabled: true, opens: true, clicks: true },
        reputationMetrics: true,
      };

      const changes = getUpgradePath(config, config);

      expect(changes).toEqual([]);
    });

    it("should handle upgrade from starter to production", () => {
      const changes = getUpgradePath(STARTER_PRESET, PRODUCTION_PRESET);

      expect(changes.length).toBeGreaterThan(0);
      expect(changes).toContain("Enable reputation metrics");
      expect(changes).toContain("Enable real-time event tracking");
      expect(changes).toContain("Enable email history storage");
    });

    it("should handle upgrade from production to enterprise", () => {
      const changes = getUpgradePath(PRODUCTION_PRESET, ENTERPRISE_PRESET);

      expect(changes.length).toBeGreaterThan(0);
      expect(changes).toContain("Upgrade retention: 3months → 1year");
      expect(changes).toContain("Add dedicated IP address");
    });

    it("should handle upgrade from starter to enterprise", () => {
      const changes = getUpgradePath(STARTER_PRESET, ENTERPRISE_PRESET);

      expect(changes.length).toBeGreaterThan(0);
      expect(changes).toContain("Enable reputation metrics");
      expect(changes).toContain("Add dedicated IP address");
    });
  });

  describe("validateConfig", () => {
    it("should warn about dedicated IP", () => {
      const config: WrapsEmailConfig = {
        dedicatedIp: true,
      };

      const warnings = validateConfig(config);

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain("Dedicated IPs require 100k+ emails/day");
    });

    it("should warn about event tracking without storage", () => {
      const config: WrapsEmailConfig = {
        eventTracking: {
          enabled: true,
          eventBridge: true,
          dynamoDBHistory: false,
        },
      };

      const warnings = validateConfig(config);

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings).toContain(
        "💡 Event tracking is enabled but history storage is disabled. Events will only be available in real-time."
      );
    });

    it("should warn about permanent retention", () => {
      const config: WrapsEmailConfig = {
        eventTracking: {
          enabled: true,
          dynamoDBHistory: true,
          archiveRetention: "permanent",
        },
      };

      const warnings = validateConfig(config);

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings).toContain(
        "⚠️  Permanent retention can become expensive. Consider 3-month or 1-year retention."
      );
    });

    it("should return multiple warnings for multiple issues", () => {
      const config: WrapsEmailConfig = {
        dedicatedIp: true,
        eventTracking: {
          enabled: true,
          dynamoDBHistory: true,
          archiveRetention: "permanent",
        },
      };

      const warnings = validateConfig(config);

      expect(warnings.length).toBe(2);
    });

    it("should return empty array for valid config", () => {
      const config: WrapsEmailConfig = {
        tracking: { enabled: true, opens: true, clicks: true },
        reputationMetrics: true,
        eventTracking: {
          enabled: true,
          dynamoDBHistory: true,
          archiveRetention: "90days",
        },
      };

      const warnings = validateConfig(config);

      expect(warnings).toEqual([]);
    });

    it("should not warn about starter preset", () => {
      const warnings = validateConfig(STARTER_PRESET);

      expect(warnings).toEqual([]);
    });

    it("should not warn about production preset", () => {
      const warnings = validateConfig(PRODUCTION_PRESET);

      expect(warnings).toEqual([]);
    });

    it("should warn about enterprise preset (dedicated IP)", () => {
      const warnings = validateConfig(ENTERPRISE_PRESET);

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain("Dedicated IPs");
    });
  });

  describe("Preset Feature Comparison", () => {
    it("should have starter as subset of production", () => {
      // Production should have everything Starter has plus more
      expect(PRODUCTION_PRESET.tracking?.enabled).toBe(
        STARTER_PRESET.tracking?.enabled
      );
      expect(PRODUCTION_PRESET.tlsRequired).toBe(STARTER_PRESET.tlsRequired);
      expect(PRODUCTION_PRESET.suppressionList?.enabled).toBe(
        STARTER_PRESET.suppressionList?.enabled
      );

      // But production has additional features
      expect(PRODUCTION_PRESET.reputationMetrics).toBe(true);
      expect(PRODUCTION_PRESET.eventTracking?.enabled).toBe(true);
      expect(STARTER_PRESET.reputationMetrics).toBe(false);
      expect(STARTER_PRESET.eventTracking?.enabled).toBe(false);
    });

    it("should have production as subset of enterprise", () => {
      // Enterprise should have everything Production has
      expect(ENTERPRISE_PRESET.tracking?.enabled).toBe(
        PRODUCTION_PRESET.tracking?.enabled
      );
      expect(ENTERPRISE_PRESET.reputationMetrics).toBe(
        PRODUCTION_PRESET.reputationMetrics
      );
      expect(ENTERPRISE_PRESET.eventTracking?.enabled).toBe(
        PRODUCTION_PRESET.eventTracking?.enabled
      );

      // But enterprise has additional features
      expect(ENTERPRISE_PRESET.dedicatedIp).toBe(true);
      expect(ENTERPRISE_PRESET.eventTracking?.archiveRetention).toBe("1year");
      expect(PRODUCTION_PRESET.dedicatedIp).toBeUndefined();
      expect(PRODUCTION_PRESET.eventTracking?.archiveRetention).toBe("3months");
    });

    it("should have increasing event types coverage", () => {
      const starterEvents = STARTER_PRESET.eventTracking?.events?.length || 0;
      const productionEvents =
        PRODUCTION_PRESET.eventTracking?.events?.length || 0;
      const enterpriseEvents =
        ENTERPRISE_PRESET.eventTracking?.events?.length || 0;

      expect(starterEvents).toBeLessThan(productionEvents);
      expect(productionEvents).toBeLessThan(enterpriseEvents);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty config in getUpgradePath", () => {
      const current: WrapsEmailConfig = {};
      const target: WrapsEmailConfig = {};

      const changes = getUpgradePath(current, target);

      expect(changes).toEqual([]);
    });

    it("should handle undefined values in getUpgradePath", () => {
      const current: WrapsEmailConfig = {
        tracking: undefined,
        reputationMetrics: undefined,
      };

      const target: WrapsEmailConfig = {
        tracking: { enabled: true, opens: true, clicks: true },
        reputationMetrics: true,
      };

      const changes = getUpgradePath(current, target);

      expect(changes.length).toBeGreaterThan(0);
    });

    it("should handle empty config in validateConfig", () => {
      const config: WrapsEmailConfig = {};

      const warnings = validateConfig(config);

      expect(warnings).toEqual([]);
    });

    it("should handle partial config in validateConfig", () => {
      const config: WrapsEmailConfig = {
        tracking: { enabled: true },
      };

      const warnings = validateConfig(config);

      expect(warnings).toEqual([]);
    });
  });
});
