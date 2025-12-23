/**
 * Tests for telemetry event helpers
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the client module before importing events
vi.mock("../client.js", () => ({
  getTelemetryClient: vi.fn(() => ({
    track: vi.fn(),
  })),
}));

import { getTelemetryClient } from "../client.js";
import {
  trackCommand,
  trackConsoleStart,
  trackConsoleStop,
  trackError,
  trackFeature,
  trackServiceDeployed,
  trackServiceInit,
  trackServiceRemoved,
  trackServiceUpgrade,
} from "../events.js";

describe("Telemetry Events", () => {
  let mockTrack: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTrack = vi.fn();
    vi.mocked(getTelemetryClient).mockReturnValue({
      track: mockTrack,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("trackCommand", () => {
    it("should track command execution", () => {
      trackCommand("email:init");

      expect(mockTrack).toHaveBeenCalledWith("command:email:init", {});
    });

    it("should include metadata when provided", () => {
      trackCommand("email:init", {
        success: true,
        duration_ms: 1500,
        preset: "production",
      });

      expect(mockTrack).toHaveBeenCalledWith("command:email:init", {
        success: true,
        duration_ms: 1500,
        preset: "production",
      });
    });

    it("should sanitize sensitive fields from metadata", () => {
      trackCommand("email:init", {
        success: true,
        domain: "example.com",
        accountId: "123456789012",
        email: "user@example.com",
      });

      expect(mockTrack).toHaveBeenCalledWith("command:email:init", {
        success: true,
        domain: undefined,
        accountId: undefined,
        email: undefined,
      });
    });

    it("should handle empty metadata", () => {
      trackCommand("status", {});

      expect(mockTrack).toHaveBeenCalledWith("command:status", {});
    });
  });

  describe("trackServiceInit", () => {
    it("should track service initialization", () => {
      trackServiceInit("email", true);

      expect(mockTrack).toHaveBeenCalledWith("service:init", {
        service: "email",
        success: true,
      });
    });

    it("should include metadata when provided", () => {
      trackServiceInit("email", true, {
        preset: "production",
        provider: "vercel",
        features: ["tracking", "history"],
        duration_ms: 45_000,
      });

      expect(mockTrack).toHaveBeenCalledWith("service:init", {
        service: "email",
        success: true,
        preset: "production",
        provider: "vercel",
        features: ["tracking", "history"],
        duration_ms: 45_000,
      });
    });

    it("should track failed initialization", () => {
      trackServiceInit("email", false);

      expect(mockTrack).toHaveBeenCalledWith("service:init", {
        service: "email",
        success: false,
      });
    });
  });

  describe("trackServiceDeployed", () => {
    it("should track service deployment", () => {
      trackServiceDeployed("email");

      expect(mockTrack).toHaveBeenCalledWith("service:deployed", {
        service: "email",
      });
    });

    it("should include metadata when provided", () => {
      trackServiceDeployed("email", {
        duration_ms: 45_000,
        features: ["tracking", "history"],
        preset: "production",
      });

      expect(mockTrack).toHaveBeenCalledWith("service:deployed", {
        service: "email",
        duration_ms: 45_000,
        features: ["tracking", "history"],
        preset: "production",
      });
    });
  });

  describe("trackConsoleStart", () => {
    it("should track local console start", () => {
      trackConsoleStart("local");

      expect(mockTrack).toHaveBeenCalledWith("console:started", {
        mode: "local",
      });
    });

    it("should track hosted console start", () => {
      trackConsoleStart("hosted");

      expect(mockTrack).toHaveBeenCalledWith("console:started", {
        mode: "hosted",
      });
    });

    it("should include metadata when provided", () => {
      trackConsoleStart("local", { port: 3100 });

      expect(mockTrack).toHaveBeenCalledWith("console:started", {
        mode: "local",
        port: 3100,
      });
    });
  });

  describe("trackConsoleStop", () => {
    it("should track console stop", () => {
      trackConsoleStop();

      expect(mockTrack).toHaveBeenCalledWith("console:stopped", {});
    });

    it("should include duration when provided", () => {
      trackConsoleStop({ duration_s: 300 });

      expect(mockTrack).toHaveBeenCalledWith("console:stopped", {
        duration_s: 300,
      });
    });

    it("should include custom metadata", () => {
      trackConsoleStop({ duration_s: 300, reason: "user_interrupt" });

      expect(mockTrack).toHaveBeenCalledWith("console:stopped", {
        duration_s: 300,
        reason: "user_interrupt",
      });
    });
  });

  describe("trackError", () => {
    it("should track error occurrence", () => {
      trackError("AWS_CREDENTIALS_INVALID", "email:init");

      expect(mockTrack).toHaveBeenCalledWith("error:occurred", {
        error_code: "AWS_CREDENTIALS_INVALID",
        command: "email:init",
      });
    });

    it("should include metadata when provided", () => {
      trackError("DEPLOY_FAILED", "email:init", {
        step: "pulumi_deploy",
      });

      expect(mockTrack).toHaveBeenCalledWith("error:occurred", {
        error_code: "DEPLOY_FAILED",
        command: "email:init",
        step: "pulumi_deploy",
      });
    });
  });

  describe("trackFeature", () => {
    it("should track feature usage", () => {
      trackFeature("domain_verified");

      expect(mockTrack).toHaveBeenCalledWith("feature:domain_verified", {});
    });

    it("should include metadata when provided", () => {
      trackFeature("domain_verified", {
        dns_provider: "route53",
        auto_detected: true,
      });

      expect(mockTrack).toHaveBeenCalledWith("feature:domain_verified", {
        dns_provider: "route53",
        auto_detected: true,
      });
    });
  });

  describe("trackServiceUpgrade", () => {
    it("should track service upgrade", () => {
      trackServiceUpgrade("email");

      expect(mockTrack).toHaveBeenCalledWith("service:upgraded", {
        service: "email",
      });
    });

    it("should include upgrade details when provided", () => {
      trackServiceUpgrade("email", {
        from_preset: "starter",
        to_preset: "production",
        added_features: ["history", "dedicated_ip"],
      });

      expect(mockTrack).toHaveBeenCalledWith("service:upgraded", {
        service: "email",
        from_preset: "starter",
        to_preset: "production",
        added_features: ["history", "dedicated_ip"],
      });
    });
  });

  describe("trackServiceRemoved", () => {
    it("should track service removal", () => {
      trackServiceRemoved("email");

      expect(mockTrack).toHaveBeenCalledWith("service:removed", {
        service: "email",
      });
    });

    it("should include removal metadata when provided", () => {
      trackServiceRemoved("email", { reason: "user_initiated" });

      expect(mockTrack).toHaveBeenCalledWith("service:removed", {
        service: "email",
        reason: "user_initiated",
      });
    });
  });
});
