import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { loadConnectionMetadata } from "../../utils/shared/metadata.js";
import type { ServerConfig } from "../server.js";

export function createUserRouter(config: ServerConfig): Router {
  const router = createRouter();

  /**
   * Get current AWS user/account information
   */
  router.get("/", async (_req: Request, res: Response) => {
    try {
      const accountId = config.accountId || "Unknown";
      const region = config.region;

      console.log(
        "[User API] Fetching user info for account:",
        accountId,
        "region:",
        region
      );

      // Load metadata to get additional details
      const metadata = await loadConnectionMetadata(accountId, region);
      console.log(
        "[User API] Metadata loaded:",
        metadata ? "found" : "not found"
      );

      // Get AWS account alias if available (for better UX)
      let accountAlias = accountId;
      try {
        if (config.roleArn) {
          console.log("[User API] Attempting to fetch account alias via IAM");
          const { assumeRole } = await import("../../utils/assume-role.js");
          const { IAMClient, ListAccountAliasesCommand } = await import(
            "@aws-sdk/client-iam"
          );

          const credentials = await assumeRole(config.roleArn, region);
          const iamClient = new IAMClient({ region, credentials });

          const response = await iamClient.send(
            new ListAccountAliasesCommand({})
          );

          if (response.AccountAliases && response.AccountAliases.length > 0) {
            accountAlias = response.AccountAliases[0];
            console.log("[User API] Account alias found:", accountAlias);
          } else {
            console.log("[User API] No account alias found, using account ID");
          }
        } else {
          console.log("[User API] No roleArn, skipping account alias lookup");
        }
      } catch (error) {
        // Silently fail if we can't get account alias
        console.error("[User API] Error fetching account alias:", error);
      }

      const responseData = {
        accountId,
        accountAlias,
        region,
        provider: metadata?.provider || "unknown",
        domain: metadata?.services?.email?.config?.domain || null,
        preset: metadata?.services?.email?.preset || null,
        timestamp: metadata?.timestamp || null,
      };

      console.log("[User API] Sending response:", responseData);
      res.json(responseData);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[User API] Error fetching user info:", error);
      res.status(500).json({ error: errorMessage });
    }
  });

  return router;
}
