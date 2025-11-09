import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import type { ServerConfig } from "../server.js";
import { fetchEmailById, fetchEmailLogs } from "../services/email-logs.js";

export function createEmailsRouter(config: ServerConfig): Router {
  const router = createRouter();

  /**
   * Get email logs
   */
  router.get("/", async (req: Request, res: Response) => {
    try {
      console.log("Email logs request received");
      console.log("Query params:", req.query);
      console.log("Config:", {
        tableName: config.tableName,
        region: config.region,
        accountId: config.accountId,
      });

      // Parse query parameters
      const limit = req.query.limit
        ? Number.parseInt(req.query.limit as string, 10)
        : 100;
      const startTime = req.query.startTime
        ? Number.parseInt(req.query.startTime as string, 10)
        : undefined;
      const endTime = req.query.endTime
        ? Number.parseInt(req.query.endTime as string, 10)
        : undefined;

      if (!config.tableName) {
        console.log("No table name configured");
        return res.status(400).json({
          error:
            "Email tracking not enabled. Deploy with enhanced integration to enable email logs.",
        });
      }

      console.log("Fetching email logs from DynamoDB...");
      const logs = await fetchEmailLogs({
        region: config.region,
        tableName: config.tableName,
        accountId: config.accountId,
        limit,
        startTime,
        endTime,
      });

      console.log(`Found ${logs.length} email logs`);
      res.json({ logs });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Error fetching email logs:", error);
      res.status(500).json({ error: errorMessage });
    }
  });

  /**
   * Get email details by ID
   */
  router.get("/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      console.log("Email detail request received for ID:", id);
      console.log("Request headers:", req.headers);
      console.log("Request query:", req.query);

      if (!config.tableName) {
        console.log("No table name configured");
        return res.status(400).json({
          error:
            "Email tracking not enabled. Deploy with enhanced integration to enable email logs.",
        });
      }

      console.log("Fetching email details from DynamoDB...");
      const email = await fetchEmailById(id, {
        region: config.region,
        tableName: config.tableName,
      });

      if (!email) {
        console.log("Email not found for ID:", id);
        return res.status(404).json({ error: "Email not found" });
      }

      console.log("Email details found:", email.messageId);
      console.log("Sending response with", email.events.length, "events");
      res.json(email);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Error fetching email details:", error);
      console.error(
        "Stack trace:",
        error instanceof Error ? error.stack : "N/A"
      );
      res.status(500).json({ error: errorMessage });
    }
  });

  return router;
}
