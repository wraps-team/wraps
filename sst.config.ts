/// <reference path="./.sst/platform/config.d.ts" />

import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from apps/web/.env.local
config({ path: resolve(__dirname, "apps/web/.env.local") });

/**
 * SST v3 (Ion) Configuration for Wraps Platform
 *
 * This deploys the Wraps API infrastructure:
 * - API Gateway + Lambda for Elysia API
 * - SQS queues for batch processing
 * - DynamoDB for rate limiting
 */

export default $config({
  app(input) {
    return {
      name: "wraps",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage ?? ""),
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1",
        },
      },
    };
  },
  async run() {
    // Import infrastructure modules
    const { rateLimitTable } = await import("./infra/tables");
    const { batchQueue, batchDlq } = await import("./infra/queues");
    const { api } = await import("./infra/api");

    return {
      apiUrl: api.url,
      batchQueueUrl: batchQueue.url,
      batchDlqUrl: batchDlq.url,
      rateLimitTableName: rateLimitTable.name,
    };
  },
});
