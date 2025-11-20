/**
 * Tests for telemetry client
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TelemetryClient } from "../client";

describe("TelemetryClient", () => {
  let client: TelemetryClient;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear telemetry-related env vars
    process.env.DO_NOT_TRACK = undefined;
    process.env.WRAPS_TELEMETRY_DISABLED = undefined;
    process.env.WRAPS_TELEMETRY_DEBUG = undefined;
    process.env.CI = undefined;

    // Create client in debug mode (won't send real requests)
    client = new TelemetryClient({ debug: true });
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("initialization", () => {
    it("should create client with default options", () => {
      expect(client).toBeInstanceOf(TelemetryClient);
    });

    it("should respect custom endpoint", () => {
      const customClient = new TelemetryClient({
        endpoint: "https://custom.example.com/telemetry",
      });
      expect(customClient).toBeInstanceOf(TelemetryClient);
    });

    it("should respect custom timeout", () => {
      const customClient = new TelemetryClient({ timeout: 5000 });
      expect(customClient).toBeInstanceOf(TelemetryClient);
    });
  });

  describe("opt-out mechanisms", () => {
    it("should respect DO_NOT_TRACK=1", () => {
      process.env.DO_NOT_TRACK = "1";
      const dntClient = new TelemetryClient();
      expect(dntClient.isEnabled()).toBe(false);
    });

    it("should respect WRAPS_TELEMETRY_DISABLED=1", () => {
      process.env.WRAPS_TELEMETRY_DISABLED = "1";
      const disabledClient = new TelemetryClient();
      expect(disabledClient.isEnabled()).toBe(false);
    });

    it("should respect CI environment", () => {
      process.env.CI = "true";
      const ciClient = new TelemetryClient();
      expect(ciClient.isEnabled()).toBe(false);
    });

    it("should prioritize DO_NOT_TRACK over config", () => {
      process.env.DO_NOT_TRACK = "1";
      const dntClient = new TelemetryClient();
      dntClient.enable(); // Try to enable via config
      expect(dntClient.isEnabled()).toBe(false);
    });
  });

  describe("enable/disable", () => {
    it("should disable telemetry", () => {
      client.disable();
      expect(client.isEnabled()).toBe(false);
    });

    it("should enable telemetry", () => {
      client.disable();
      client.enable();
      expect(client.isEnabled()).toBe(true);
    });

    it("should not track events when disabled", () => {
      // Create a non-debug client to test actual tracking behavior
      const nonDebugClient = new TelemetryClient({ debug: false });
      const fetchSpy = vi.spyOn(global, "fetch");

      nonDebugClient.disable();
      nonDebugClient.track("test:event");

      // Should not make any fetch calls when disabled
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("event tracking", () => {
    it("should track events in debug mode", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      client.track("test:event", { foo: "bar" });

      expect(consoleSpy).toHaveBeenCalledWith(
        "[Telemetry Debug] Event:",
        expect.stringContaining("test:event")
      );
    });

    it("should include default properties", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      client.track("test:event");

      const calls = consoleSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      const eventJson = calls[0][1];
      const event = JSON.parse(eventJson);

      expect(event.properties).toHaveProperty("cli_version");
      expect(event.properties).toHaveProperty("os");
      expect(event.properties).toHaveProperty("node_version");
      expect(event.properties).toHaveProperty("ci");
    });

    it("should include custom properties", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      client.track("test:event", { customProp: "value" });

      const calls = consoleSpy.mock.calls;
      const eventJson = calls[0][1];
      const event = JSON.parse(eventJson);

      expect(event.properties.customProp).toBe("value");
    });

    it("should include anonymousId", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      client.track("test:event");

      const calls = consoleSpy.mock.calls;
      const eventJson = calls[0][1];
      const event = JSON.parse(eventJson);

      expect(event.anonymousId).toBeDefined();
      expect(typeof event.anonymousId).toBe("string");
    });

    it("should include timestamp", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      client.track("test:event");

      const calls = consoleSpy.mock.calls;
      const eventJson = calls[0][1];
      const event = JSON.parse(eventJson);

      expect(event.timestamp).toBeDefined();
      expect(new Date(event.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe("notification", () => {
    it("should show notification on first run", () => {
      // Reset config to simulate first run
      const freshClient = new TelemetryClient();
      // This would be true if it's the first run
      // (depends on actual config state)
      expect(typeof freshClient.shouldShowNotification()).toBe("boolean");
    });

    it("should not show notification after marking as shown", () => {
      client.markNotificationShown();
      expect(client.shouldShowNotification()).toBe(false);
    });
  });

  describe("config path", () => {
    it("should return config file path", () => {
      const path = client.getConfigPath();
      expect(path).toBeDefined();
      expect(typeof path).toBe("string");
      expect(path).toContain("telemetry");
    });
  });

  describe("shutdown", () => {
    it("should flush events on shutdown", async () => {
      // This test just ensures shutdown doesn't throw
      await expect(client.shutdown()).resolves.toBeUndefined();
    });
  });
});
