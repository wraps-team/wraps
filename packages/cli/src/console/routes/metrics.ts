import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import type { ServerConfig } from "../server.js";
import { fetchSESMetrics } from "../services/aws-metrics.js";
import { fetchSendQuota } from "../services/ses-service.js";

export function createMetricsRouter(config: ServerConfig): Router {
  const router = createRouter();

  /**
   * SSE endpoint for real-time metrics
   */
  router.get("/stream", async (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial connection event
    res.write('data: {"type":"connected"}\n\n');

    // Get time range from query params, default to last 24 hours
    const { startTime, endTime } = req.query;
    const getTimeRange = () => ({
      start: startTime
        ? new Date(Number.parseInt(startTime as string, 10))
        : new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: endTime
        ? new Date(Number.parseInt(endTime as string, 10))
        : new Date(),
    });

    // Function to fetch and send metrics
    const sendMetrics = async () => {
      try {
        console.log("Fetching metrics from AWS...");

        const timeRange = getTimeRange();

        console.log("Time range:", timeRange);
        console.log("Config:", {
          region: config.region,
          roleArn: config.roleArn
            ? `${config.roleArn.substring(0, 30)}...`
            : "using current credentials",
        });

        const [metrics, quota] = await Promise.all([
          fetchSESMetrics(
            config.roleArn,
            config.region,
            timeRange,
            config.tableName
          ),
          fetchSendQuota(config.roleArn, config.region),
        ]);

        console.log("Metrics fetched successfully");

        const data = {
          type: "metrics",
          timestamp: Date.now(),
          metrics,
          quota,
        };

        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("Error fetching metrics:", error);
        res.write(
          `data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`
        );
      }
    };

    // Send immediately on connect
    await sendMetrics();

    // Poll every 60 seconds
    const interval = setInterval(sendMetrics, 60_000);

    // Clean up on disconnect
    req.on("close", () => {
      clearInterval(interval);
    });
  });

  /**
   * Get current metrics snapshot (REST endpoint)
   */
  router.get("/snapshot", async (_req: Request, res: Response) => {
    try {
      const timeRange = {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: new Date(),
      };

      const [metrics, quota] = await Promise.all([
        fetchSESMetrics(
          config.roleArn,
          config.region,
          timeRange,
          config.tableName
        ),
        fetchSendQuota(config.roleArn, config.region),
      ]);

      res.json({ metrics, quota });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: errorMessage });
    }
  });

  /**
   * Get metrics for a specific time range
   */
  router.get("/", async (req: Request, res: Response) => {
    try {
      const { startTime, endTime } = req.query;

      // Default to last 24 hours if no time range provided
      const timeRange = {
        start: startTime
          ? new Date(Number.parseInt(startTime as string, 10))
          : new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: endTime
          ? new Date(Number.parseInt(endTime as string, 10))
          : new Date(),
      };

      const [metrics, quota] = await Promise.all([
        fetchSESMetrics(
          config.roleArn,
          config.region,
          timeRange,
          config.tableName
        ),
        fetchSendQuota(config.roleArn, config.region),
      ]);

      res.json({
        metrics,
        quota,
        timestamp: Date.now(),
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Error fetching metrics:", error);
      res.status(500).json({ error: errorMessage });
    }
  });

  return router;
}
