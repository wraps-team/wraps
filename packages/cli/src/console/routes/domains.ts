import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import type { ServerConfig } from "../server.js";
import { fetchDomainInfo } from "../services/ses-service.js";

export function createDomainsRouter(config: ServerConfig): Router {
  const router = createRouter();

  /**
   * Get domain verification status
   */
  router.get("/:domain", async (req: Request, res: Response) => {
    try {
      const { domain } = req.params;

      if (!domain) {
        return res.status(400).json({ error: "Domain parameter required" });
      }

      const domainInfo = await fetchDomainInfo(
        config.roleArn,
        config.region,
        domain
      );

      res.json(domainInfo);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: errorMessage });
    }
  });

  return router;
}
