import dns from "node:dns/promises";
import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { loadConnectionMetadata } from "../../utils/metadata.js";
import type { ServerConfig } from "../server.js";
import { fetchEmailSettings } from "../services/settings-service.js";

export function createSettingsRouter(config: ServerConfig): Router {
  const router = createRouter();

  /**
   * Get email settings (configuration set + identity)
   */
  router.get("/", async (_req: Request, res: Response) => {
    try {
      // Load metadata to get configuration
      const metadata = await loadConnectionMetadata(
        config.accountId || "",
        config.region
      );

      if (!metadata) {
        return res.status(404).json({
          error: "No Wraps infrastructure found for this account and region",
        });
      }

      // Get configuration set name and domain from metadata
      const configSetName = "wraps-email-tracking"; // Always use this name
      const domain = metadata.emailConfig.domain;

      // Fetch settings from AWS
      const settings = await fetchEmailSettings(
        config.roleArn,
        config.region,
        configSetName,
        domain
      );

      // Add region to response
      res.json({
        ...settings,
        region: config.region,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: errorMessage });
    }
  });

  /**
   * Verify tracking domain CNAME
   */
  router.get("/verify-tracking-domain", async (req: Request, res: Response) => {
    try {
      const { domain, expectedTarget } = req.query;

      if (!domain || typeof domain !== "string") {
        return res.status(400).json({ error: "Domain parameter required" });
      }

      if (!expectedTarget || typeof expectedTarget !== "string") {
        return res
          .status(400)
          .json({ error: "Expected target parameter required" });
      }

      console.log(`[Verify] Checking CNAME for: ${domain}`);
      console.log(`[Verify] Expected target: ${expectedTarget}`);

      // Check CNAME record using DNS
      const records = await dns.resolveCname(domain);

      console.log("[Verify] CNAME records found:", records);

      // Check if any CNAME points to the expected target
      const verified = records.some((record) =>
        record.toLowerCase().includes(expectedTarget.toLowerCase())
      );

      console.log(`[Verify] Verified: ${verified}`);

      res.json({
        verified,
        error: verified
          ? undefined
          : `CNAME not pointing to ${expectedTarget}. Found: ${records.join(", ")}`,
      });
    } catch (error: any) {
      console.error("[Verify] Error verifying tracking domain:", error);

      // If no CNAME record exists, DNS will throw ENODATA or ENOTFOUND
      if (error.code === "ENODATA" || error.code === "ENOTFOUND") {
        return res.json({
          verified: false,
          error: "No CNAME record found for this domain",
        });
      }

      const errorMessage =
        error instanceof Error ? error.message : "Failed to verify";
      res.json({
        verified: false,
        error: errorMessage,
      });
    }
  });

  /**
   * Verify DMARC TXT record
   */
  router.get("/verify-dmarc", async (req: Request, res: Response) => {
    try {
      const { domain } = req.query;

      if (!domain || typeof domain !== "string") {
        return res.status(400).json({ error: "Domain parameter required" });
      }

      const dmarcDomain = `_dmarc.${domain}`;

      console.log(`[Verify] Checking DMARC for: ${dmarcDomain}`);

      // Use Node.js DNS to resolve TXT records
      const records = await dns.resolveTxt(dmarcDomain);

      console.log("[Verify] TXT records found:", records);

      // Check if there's a TXT record that starts with "v=DMARC1"
      // TXT records are arrays of strings, so we need to join them
      const hasDmarc = records.some((record) => {
        const value = record.join("");
        return value.startsWith("v=DMARC1");
      });

      console.log(`[Verify] DMARC verified: ${hasDmarc}`);

      res.json({
        verified: hasDmarc,
        error: hasDmarc ? undefined : "DMARC record not found",
      });
    } catch (error: any) {
      console.error("[Verify] Error verifying DMARC:", error);

      // If no TXT record exists, DNS will throw ENODATA or ENOTFOUND
      if (error.code === "ENODATA" || error.code === "ENOTFOUND") {
        return res.json({
          verified: false,
          error: "No DMARC record found for this domain",
        });
      }

      const errorMessage =
        error instanceof Error ? error.message : "Failed to verify";
      res.json({
        verified: false,
        error: errorMessage,
      });
    }
  });

  /**
   * Update configuration set sending options
   */
  router.put("/config-set/sending", async (req: Request, res: Response) => {
    try {
      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }

      // Load metadata to get configuration set name
      const metadata = await loadConnectionMetadata(
        config.accountId || "",
        config.region
      );

      if (!metadata) {
        return res.status(404).json({
          error: "No Wraps infrastructure found for this account and region",
        });
      }

      const configSetName = "wraps-email-tracking";

      console.log(
        `[Settings] Updating sending options for ${configSetName}: ${enabled}`
      );

      // Update sending options via AWS SDK
      const { SESv2Client, PutConfigurationSetSendingOptionsCommand } =
        await import("@aws-sdk/client-sesv2");
      const { assumeRole } = await import("../../utils/assume-role.js");

      const credentials = config.roleArn
        ? await assumeRole(config.roleArn, config.region)
        : undefined;
      const sesClient = new SESv2Client({ region: config.region, credentials });

      await sesClient.send(
        new PutConfigurationSetSendingOptionsCommand({
          ConfigurationSetName: configSetName,
          SendingEnabled: enabled,
        })
      );

      console.log("[Settings] Successfully updated sending options");

      res.json({ success: true });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[Settings] Error updating sending options:", error);
      res.status(500).json({ error: errorMessage });
    }
  });

  /**
   * Update configuration set reputation options
   */
  router.put("/config-set/reputation", async (req: Request, res: Response) => {
    try {
      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }

      // Load metadata to get configuration set name
      const metadata = await loadConnectionMetadata(
        config.accountId || "",
        config.region
      );

      if (!metadata) {
        return res.status(404).json({
          error: "No Wraps infrastructure found for this account and region",
        });
      }

      const configSetName = "wraps-email-tracking";

      console.log(
        `[Settings] Updating reputation options for ${configSetName}: ${enabled}`
      );

      // Update reputation options via AWS SDK
      const { SESv2Client, PutConfigurationSetReputationOptionsCommand } =
        await import("@aws-sdk/client-sesv2");
      const { assumeRole } = await import("../../utils/assume-role.js");

      const credentials = config.roleArn
        ? await assumeRole(config.roleArn, config.region)
        : undefined;
      const sesClient = new SESv2Client({ region: config.region, credentials });

      await sesClient.send(
        new PutConfigurationSetReputationOptionsCommand({
          ConfigurationSetName: configSetName,
          ReputationMetricsEnabled: enabled,
        })
      );

      console.log("[Settings] Successfully updated reputation options");

      res.json({ success: true });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[Settings] Error updating reputation options:", error);
      res.status(500).json({ error: errorMessage });
    }
  });

  /**
   * Update tracking domain
   */
  router.put(
    "/config-set/tracking-domain",
    async (req: Request, res: Response) => {
      try {
        const { domain } = req.body;

        if (!domain || typeof domain !== "string") {
          return res.status(400).json({ error: "domain must be a string" });
        }

        // Validate domain format (basic check)
        const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-_.]+[a-zA-Z0-9]$/;
        if (!domainRegex.test(domain)) {
          return res.status(400).json({ error: "Invalid domain format" });
        }

        // Load metadata to get configuration set name
        const metadata = await loadConnectionMetadata(
          config.accountId || "",
          config.region
        );

        if (!metadata) {
          return res.status(404).json({
            error: "No Wraps infrastructure found for this account and region",
          });
        }

        const configSetName = "wraps-email-tracking";

        console.log(
          `[Settings] Updating tracking domain for ${configSetName}: ${domain}`
        );

        // Update tracking options via AWS SDK
        const { SESv2Client, PutConfigurationSetTrackingOptionsCommand } =
          await import("@aws-sdk/client-sesv2");
        const { assumeRole } = await import("../../utils/assume-role.js");

        const credentials = config.roleArn
          ? await assumeRole(config.roleArn, config.region)
          : undefined;
        const sesClient = new SESv2Client({
          region: config.region,
          credentials,
        });

        await sesClient.send(
          new PutConfigurationSetTrackingOptionsCommand({
            ConfigurationSetName: configSetName,
            CustomRedirectDomain: domain,
          })
        );

        console.log("[Settings] Successfully updated tracking domain");

        res.json({ success: true });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("[Settings] Error updating tracking domain:", error);
        res.status(500).json({ error: errorMessage });
      }
    }
  );

  return router;
}
