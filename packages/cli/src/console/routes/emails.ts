import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import type { ServerConfig } from "../server.js";
import { fetchEmailLogs } from "../services/email-logs.js";

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
        ? Number.parseInt(req.query.limit as string)
        : 100;
      const startTime = req.query.startTime
        ? Number.parseInt(req.query.startTime as string)
        : undefined;
      const endTime = req.query.endTime
        ? Number.parseInt(req.query.endTime as string)
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

  return router;
}
