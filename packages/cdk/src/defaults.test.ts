import * as cdk from "aws-cdk-lib";
import { describe, expect, it } from "vitest";
import { applyDefaults } from "./defaults.js";
import type { WrapsEmailProps } from "./types.js";

describe("applyDefaults", () => {
  describe("minimal configuration", () => {
    it("should apply defaults for empty props", () => {
      const result = applyDefaults({});

      expect(result.mailFromSubdomain).toBe("mail");
      expect(result.tracking.enabled).toBe(true);
      expect(result.tracking.opens).toBe(true);
      expect(result.tracking.clicks).toBe(true);
      expect(result.tracking.httpsEnabled).toBe(false);
      expect(result.tracking.wafEnabled).toBe(false);
      expect(result.suppressionList.enabled).toBe(true);
      expect(result.suppressionList.reasons).toEqual(["BOUNCE", "COMPLAINT"]);
      expect(result.reputationMetrics).toBe(true);
      expect(result.tlsRequired).toBe(false);
      expect(result.dedicatedIp).toBe(false);
      expect(result.sendingEnabled).toBe(true);
      expect(result.removalPolicy).toBe(cdk.RemovalPolicy.RETAIN);
    });

    it("should not include events by default", () => {
      const result = applyDefaults({});
      expect(result.events).toBeUndefined();
    });

    it("should not include archiving by default", () => {
      const result = applyDefaults({});
      expect(result.archiving).toBeUndefined();
    });

    it("should not include smtp by default", () => {
      const result = applyDefaults({});
      expect(result.smtp).toBeUndefined();
    });
  });

  describe("vercel configuration", () => {
    it("should pass through vercel config", () => {
      const props: WrapsEmailProps = {
        vercel: { teamSlug: "my-team", projectName: "my-app" },
      };
      const result = applyDefaults(props);

      expect(result.vercel).toEqual({
        teamSlug: "my-team",
        projectName: "my-app",
      });
    });
  });

  describe("oidc configuration", () => {
    it("should pass through custom oidc config", () => {
      const props: WrapsEmailProps = {
        oidc: {
          providerUrl: "https://token.actions.githubusercontent.com",
          audience: "sts.amazonaws.com",
          subjectPattern: "repo:org/repo:*",
        },
      };
      const result = applyDefaults(props);

      expect(result.oidc).toEqual({
        providerUrl: "https://token.actions.githubusercontent.com",
        audience: "sts.amazonaws.com",
        subjectPattern: "repo:org/repo:*",
      });
    });
  });

  describe("domain configuration", () => {
    it("should pass through domain", () => {
      const props: WrapsEmailProps = {
        domain: "example.com",
      };
      const result = applyDefaults(props);

      expect(result.domain).toBe("example.com");
      expect(result.mailFromSubdomain).toBe("mail");
    });

    it("should use custom mailFromSubdomain", () => {
      const props: WrapsEmailProps = {
        domain: "example.com",
        mailFromSubdomain: "bounce",
      };
      const result = applyDefaults(props);

      expect(result.mailFromSubdomain).toBe("bounce");
    });
  });

  describe("tracking configuration", () => {
    it("should use provided tracking values", () => {
      const props: WrapsEmailProps = {
        tracking: {
          enabled: false,
          opens: false,
          clicks: true,
        },
      };
      const result = applyDefaults(props);

      expect(result.tracking.enabled).toBe(false);
      expect(result.tracking.opens).toBe(false);
      expect(result.tracking.clicks).toBe(true);
    });

    it("should configure custom tracking domain", () => {
      const props: WrapsEmailProps = {
        tracking: {
          customRedirectDomain: "track.example.com",
          httpsEnabled: true,
          wafEnabled: true,
        },
      };
      const result = applyDefaults(props);

      expect(result.tracking.customRedirectDomain).toBe("track.example.com");
      expect(result.tracking.httpsEnabled).toBe(true);
      expect(result.tracking.wafEnabled).toBe(true);
    });
  });

  describe("tracking misconfiguration", () => {
    it("a customRedirectDomain with no httpsEnabled resolves to the exact combination WrapsEmail warns on as not-yet-implemented (customRedirectDomain set, httpsEnabled false)", () => {
      const props: WrapsEmailProps = {
        tracking: {
          customRedirectDomain: "track.a.com",
        },
      };
      const result = applyDefaults(props);

      expect(result.tracking.customRedirectDomain).toBe("track.a.com");
      expect(result.tracking.httpsEnabled).toBe(false);
    });

    it("a customRedirectDomain with httpsEnabled: true still threads through unchanged — the construct warns regardless of httpsEnabled, since it never reads tracking at all", () => {
      const props: WrapsEmailProps = {
        tracking: {
          customRedirectDomain: "track.a.com",
          httpsEnabled: true,
        },
      };
      const result = applyDefaults(props);

      expect(result.tracking.customRedirectDomain).toBe("track.a.com");
      expect(result.tracking.httpsEnabled).toBe(true);
    });
  });

  describe("events configuration", () => {
    it("should apply events defaults when events is provided", () => {
      const props: WrapsEmailProps = {
        events: {},
      };
      const result = applyDefaults(props);

      expect(result.events).toBeDefined();
      expect(result.events?.storeHistory).toBe(true);
      expect(result.events?.retention).toBe("90days");
      expect(result.events?.types).toEqual([
        "SEND",
        "DELIVERY",
        "BOUNCE",
        "COMPLAINT",
        "OPEN",
        "CLICK",
      ]);
    });

    it("should use custom event types", () => {
      const props: WrapsEmailProps = {
        events: {
          types: ["SEND", "DELIVERY", "OPEN", "CLICK"],
          storeHistory: false,
          retention: "1year",
        },
      };
      const result = applyDefaults(props);

      expect(result.events?.types).toEqual([
        "SEND",
        "DELIVERY",
        "OPEN",
        "CLICK",
      ]);
      expect(result.events?.storeHistory).toBe(false);
      expect(result.events?.retention).toBe("1year");
    });
  });

  describe("suppression list configuration", () => {
    it("should use custom suppression reasons", () => {
      const props: WrapsEmailProps = {
        suppressionList: {
          enabled: true,
          reasons: ["BOUNCE"],
        },
      };
      const result = applyDefaults(props);

      expect(result.suppressionList.reasons).toEqual(["BOUNCE"]);
    });

    it("should allow disabling suppression list", () => {
      const props: WrapsEmailProps = {
        suppressionList: {
          enabled: false,
        },
      };
      const result = applyDefaults(props);

      expect(result.suppressionList.enabled).toBe(false);
    });
  });

  describe("removal policy", () => {
    it("should use RETAIN by default", () => {
      const result = applyDefaults({});
      expect(result.removalPolicy).toBe(cdk.RemovalPolicy.RETAIN);
    });

    it("should use custom removal policy", () => {
      const props: WrapsEmailProps = {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      };
      const result = applyDefaults(props);

      expect(result.removalPolicy).toBe(cdk.RemovalPolicy.DESTROY);
    });
  });

  describe("advanced features", () => {
    it("should configure TLS required", () => {
      const props: WrapsEmailProps = {
        tlsRequired: true,
      };
      const result = applyDefaults(props);

      expect(result.tlsRequired).toBe(true);
    });

    it("should configure dedicated IP", () => {
      const props: WrapsEmailProps = {
        dedicatedIp: true,
      };
      const result = applyDefaults(props);

      expect(result.dedicatedIp).toBe(true);
    });

    it("should configure reputation metrics", () => {
      const props: WrapsEmailProps = {
        reputationMetrics: false,
      };
      const result = applyDefaults(props);

      expect(result.reputationMetrics).toBe(false);
    });

    it("should configure sending enabled", () => {
      const props: WrapsEmailProps = {
        sendingEnabled: false,
      };
      const result = applyDefaults(props);

      expect(result.sendingEnabled).toBe(false);
    });
  });

  describe("webhook configuration", () => {
    it("should pass through webhook config", () => {
      const props: WrapsEmailProps = {
        webhook: {
          awsAccountNumber: "123456789012",
          webhookSecret: "secret123",
          webhookUrl: "https://api.wraps.dev/webhook",
        },
      };
      const result = applyDefaults(props);

      expect(result.webhook).toEqual({
        awsAccountNumber: "123456789012",
        webhookSecret: "secret123",
        webhookUrl: "https://api.wraps.dev/webhook",
      });
    });
  });

  describe("full configuration", () => {
    it("should handle a complete configuration", () => {
      const props: WrapsEmailProps = {
        vercel: { teamSlug: "my-team", projectName: "my-app" },
        domain: "example.com",
        mailFromSubdomain: "bounce",
        tracking: {
          enabled: true,
          opens: true,
          clicks: true,
          customRedirectDomain: "track.example.com",
          httpsEnabled: true,
          wafEnabled: false,
        },
        events: {
          types: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "OPEN", "CLICK"],
          storeHistory: true,
          retention: "6months",
        },
        archiving: {
          enabled: true,
          retention: "1year",
        },
        smtp: {
          enabled: true,
        },
        suppressionList: {
          enabled: true,
          reasons: ["BOUNCE", "COMPLAINT"],
        },
        reputationMetrics: true,
        tlsRequired: true,
        dedicatedIp: false,
        sendingEnabled: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      };

      const result = applyDefaults(props);

      expect(result.vercel?.teamSlug).toBe("my-team");
      expect(result.domain).toBe("example.com");
      expect(result.mailFromSubdomain).toBe("bounce");
      expect(result.tracking.customRedirectDomain).toBe("track.example.com");
      expect(result.events?.retention).toBe("6months");
      expect(result.archiving?.enabled).toBe(true);
      expect(result.smtp?.enabled).toBe(true);
      expect(result.tlsRequired).toBe(true);
      expect(result.removalPolicy).toBe(cdk.RemovalPolicy.DESTROY);
    });
  });
});
