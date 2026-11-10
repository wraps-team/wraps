import { describe, expect, it } from "vitest";
import type { ConnectionMetadata, WrapsEmailConfig } from "../types/index.js";
import {
  applyConfigUpdates,
  buildEmailStackConfig,
  updateServiceConfig,
} from "../utils/shared/metadata.js";

/**
 * Test: wraps email sync overwrites inbound email configuration
 *
 * Bug: The `applyConfigUpdates` function deep-merges `tracking`,
 * `eventTracking`, `suppressionList`, `emailArchiving`, and
 * `smtpCredentials` — but NOT `inbound`. When any code path passes
 * a partial `inbound` update (e.g. `{ inbound: { enabled: true } }`),
 * the entire existing inbound object is replaced instead of merged,
 * silently dropping `webhookUrl`, `webhookSecret`, `bucketName`,
 * `receivingDomain`, `subdomain`, and `retention`.
 *
 * This matters because:
 * 1. `updateEmailConfig` (used by `wraps email upgrade`) calls
 *    `applyConfigUpdates` internally.
 * 2. `updateServiceConfig` (the newer replacement) uses a shallow
 *    spread that has the same problem.
 * 3. Any future refactor of `wraps email sync` that touches config
 *    merging will hit this gap.
 *
 * The test below shows that `emailArchiving` (which HAS deep-merge
 * handling) preserves nested fields on partial update, while `inbound`
 * (which does NOT) loses them.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal metadata with both outbound and inbound email configured */
function createMetadataWithInbound(): ConnectionMetadata {
  return {
    version: "1.0.0",
    accountId: "123456789012",
    region: "us-east-1",
    provider: "aws",
    timestamp: "2024-06-01T00:00:00.000Z",
    services: {
      email: {
        preset: "production",
        config: {
          domain: "example.com",
          tracking: { enabled: true, opens: true, clicks: true },
          tlsRequired: true,
          reputationMetrics: true,
          suppressionList: { enabled: true, reasons: ["BOUNCE", "COMPLAINT"] },
          eventTracking: {
            enabled: true,
            eventBridge: true,
            events: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT"],
            dynamoDBHistory: true,
            archiveRetention: "90days",
          },
          sendingEnabled: true,
          // Inbound email — set up via `wraps email inbound init`
          inbound: {
            enabled: true,
            subdomain: "inbound",
            receivingDomain: "inbound.example.com",
            bucketName: "wraps-inbound-123456789012-us-east-1",
            webhookUrl: "https://myapp.example.com/api/email/inbound",
            webhookSecret: "super-secret-webhook-key-abc123",
            retention: "90days",
          },
          inboundDomains: [
            {
              subdomain: "inbound",
              receivingDomain: "inbound.example.com",
              parentDomain: "example.com",
              addedAt: "2024-06-15T00:00:00.000Z",
            },
          ],
        },
        deployedAt: "2024-06-01T00:00:00.000Z",
        webhookSecret: "platform-webhook-secret",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("wraps email sync — inbound configuration preservation", () => {
  describe("buildEmailStackConfig preserves inbound config for sync", () => {
    it("should include inbound config in the stack config returned for sync", () => {
      const metadata = createMetadataWithInbound();
      const stackConfig = buildEmailStackConfig(metadata, "us-east-1");

      // The sync command passes emailConfig straight from metadata.
      // Inbound must be present for deployEmailStack to create/maintain
      // the S3 bucket, Lambda, SQS, and EventBridge resources.
      expect(stackConfig.emailConfig.inbound).toBeDefined();
      expect(stackConfig.emailConfig.inbound?.enabled).toBe(true);
      expect(stackConfig.emailConfig.inbound?.webhookUrl).toBe(
        "https://myapp.example.com/api/email/inbound"
      );
      expect(stackConfig.emailConfig.inbound?.webhookSecret).toBe(
        "super-secret-webhook-key-abc123"
      );
      expect(stackConfig.emailConfig.inbound?.bucketName).toBe(
        "wraps-inbound-123456789012-us-east-1"
      );
    });

    it("should include inboundDomains in the stack config", () => {
      const metadata = createMetadataWithInbound();
      const stackConfig = buildEmailStackConfig(metadata, "us-east-1");

      expect(stackConfig.emailConfig.inboundDomains).toHaveLength(1);
      expect(stackConfig.emailConfig.inboundDomains?.[0]?.receivingDomain).toBe(
        "inbound.example.com"
      );
    });
  });

  describe("applyConfigUpdates deep-merges inbound (like other nested objects)", () => {
    /**
     * This is the core bug. `applyConfigUpdates` has explicit deep-merge
     * handling for tracking, eventTracking, suppressionList, emailArchiving,
     * and smtpCredentials. But `inbound` falls through to the default
     * branch which does a direct assignment, replacing the entire object.
     *
     * Consequence: any partial update to `inbound` (e.g. changing just
     * `retention`) silently drops webhookUrl, webhookSecret, bucketName, etc.
     */

    it("should preserve inbound.webhookUrl when updating inbound.retention", () => {
      const existingConfig: WrapsEmailConfig = {
        domain: "example.com",
        tracking: { enabled: true, opens: true, clicks: true },
        sendingEnabled: true,
        inbound: {
          enabled: true,
          subdomain: "inbound",
          receivingDomain: "inbound.example.com",
          bucketName: "wraps-inbound-123456789012-us-east-1",
          webhookUrl: "https://myapp.example.com/api/email/inbound",
          webhookSecret: "super-secret-webhook-key-abc123",
          retention: "30days",
        },
      };

      // A partial update that only changes retention
      const updates: Partial<WrapsEmailConfig> = {
        inbound: {
          enabled: true,
          subdomain: "inbound",
          retention: "90days",
        },
      };

      const result = applyConfigUpdates(existingConfig, updates);

      // Deep merge preserves existing fields not included in the update
      expect(result.inbound?.webhookUrl).toBe(
        "https://myapp.example.com/api/email/inbound"
      );
      expect(result.inbound?.webhookSecret).toBe(
        "super-secret-webhook-key-abc123"
      );
      expect(result.inbound?.bucketName).toBe(
        "wraps-inbound-123456789012-us-east-1"
      );
      expect(result.inbound?.receivingDomain).toBe("inbound.example.com");
      // The update value should still be applied
      expect(result.inbound?.retention).toBe("90days");
    });

    it("should preserve inbound.webhookSecret when enabling inbound via partial update", () => {
      const existingConfig: WrapsEmailConfig = {
        domain: "example.com",
        tracking: { enabled: true, opens: true, clicks: true },
        sendingEnabled: true,
        inbound: {
          enabled: true,
          subdomain: "inbound",
          receivingDomain: "inbound.example.com",
          bucketName: "wraps-inbound-123456789012-us-east-1",
          webhookUrl: "https://myapp.example.com/api/email/inbound",
          webhookSecret: "super-secret-webhook-key-abc123",
        },
      };

      // Minimal update — just re-affirming enabled: true
      const updates: Partial<WrapsEmailConfig> = {
        inbound: {
          enabled: true,
          subdomain: "inbound",
        },
      };

      const result = applyConfigUpdates(existingConfig, updates);

      // Deep merge preserves webhookSecret even with minimal update
      expect(result.inbound?.webhookSecret).toBe(
        "super-secret-webhook-key-abc123"
      );
      expect(result.inbound?.webhookUrl).toBe(
        "https://myapp.example.com/api/email/inbound"
      );
      expect(result.inbound?.bucketName).toBe(
        "wraps-inbound-123456789012-us-east-1"
      );
      expect(result.inbound?.receivingDomain).toBe("inbound.example.com");
    });

    it("emailArchiving IS deep-merged (for comparison — shows the pattern inbound should follow)", () => {
      // This test passes, demonstrating how the deep-merge SHOULD work
      const existingConfig: WrapsEmailConfig = {
        tracking: { enabled: true, opens: true, clicks: true },
        sendingEnabled: true,
        emailArchiving: {
          enabled: true,
          retention: "30days",
        },
      };

      const updates: Partial<WrapsEmailConfig> = {
        emailArchiving: {
          enabled: true,
          retention: "90days",
        },
      };

      const result = applyConfigUpdates(existingConfig, updates);

      // This works because emailArchiving has explicit deep-merge handling
      expect(result.emailArchiving?.enabled).toBe(true);
      expect(result.emailArchiving?.retention).toBe("90days");
    });
  });

  describe("updateServiceConfig shallow merge loses inbound fields", () => {
    /**
     * `updateServiceConfig` is the recommended replacement for
     * `updateEmailConfig`. It uses a simple shallow spread:
     *
     *   metadata.services.email.config = {
     *     ...metadata.services.email.config,
     *     ...(config as Partial<WrapsEmailConfig>),
     *   };
     *
     * When `config` includes a partial `inbound` object, the spread
     * replaces the entire `inbound` key, losing nested fields.
     */

    it("should preserve inbound webhook fields when updating unrelated config", () => {
      const metadata = createMetadataWithInbound();

      // User enables dedicated IP — unrelated to inbound
      updateServiceConfig(metadata, "email", {
        dedicatedIp: true,
      });

      // Inbound config should be completely untouched
      expect(metadata.services.email?.config.inbound?.enabled).toBe(true);
      expect(metadata.services.email?.config.inbound?.webhookUrl).toBe(
        "https://myapp.example.com/api/email/inbound"
      );
      expect(metadata.services.email?.config.inbound?.webhookSecret).toBe(
        "super-secret-webhook-key-abc123"
      );
    });

    it("should preserve inbound nested fields when partial inbound is in update", () => {
      const metadata = createMetadataWithInbound();

      // Partial update that includes a partial inbound object
      updateServiceConfig(metadata, "email", {
        inbound: {
          enabled: true,
          subdomain: "inbound",
          retention: "1year",
        },
      });

      // Deep merge via applyConfigUpdates preserves existing nested fields
      expect(metadata.services.email?.config.inbound?.webhookUrl).toBe(
        "https://myapp.example.com/api/email/inbound"
      );
      expect(metadata.services.email?.config.inbound?.webhookSecret).toBe(
        "super-secret-webhook-key-abc123"
      );
      expect(metadata.services.email?.config.inbound?.bucketName).toBe(
        "wraps-inbound-123456789012-us-east-1"
      );
      expect(metadata.services.email?.config.inbound?.receivingDomain).toBe(
        "inbound.example.com"
      );
      // The update should also be applied
      expect(metadata.services.email?.config.inbound?.retention).toBe("1year");
    });
  });

  describe("inbound.trigger survives every metadata path (plan 041)", () => {
    function withTrigger(): ConnectionMetadata {
      const metadata = createMetadataWithInbound();
      // biome-ignore lint/style/noNonNullAssertion: fixture has inbound
      metadata.services.email!.config.inbound!.trigger = "ses-lambda-action";
      return metadata;
    }

    it("buildEmailStackConfig passes the saved trigger to the deploy", () => {
      const stackConfig = buildEmailStackConfig(withTrigger(), "us-east-1");
      expect(stackConfig.emailConfig.inbound?.trigger).toBe(
        "ses-lambda-action"
      );
    });

    it("a later partial inbound update (e.g. upgrade's retention change) keeps the trigger", () => {
      const metadata = withTrigger();
      updateServiceConfig(metadata, "email", {
        inbound: { enabled: true, subdomain: "inbound", retention: "1year" },
      });
      expect(metadata.services.email?.config.inbound?.trigger).toBe(
        "ses-lambda-action"
      );
    });

    it("applyConfigUpdates with a trigger-only update (the switch's step 3) keeps every other inbound field", () => {
      const metadata = createMetadataWithInbound();
      const result = applyConfigUpdates(
        // biome-ignore lint/style/noNonNullAssertion: fixture has email
        metadata.services.email!.config,
        {
          inbound: { trigger: "ses-lambda-action" },
        } as Partial<WrapsEmailConfig>
      );
      expect(result.inbound).toEqual({
        enabled: true,
        subdomain: "inbound",
        receivingDomain: "inbound.example.com",
        bucketName: "wraps-inbound-123456789012-us-east-1",
        webhookUrl: "https://myapp.example.com/api/email/inbound",
        webhookSecret: "super-secret-webhook-key-abc123",
        retention: "90days",
        trigger: "ses-lambda-action",
      });
    });
  });
});
