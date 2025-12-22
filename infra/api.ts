/**
 * API Gateway + Lambda for Wraps Platform API
 *
 * Elysia API:
 * - POST /v1/batch - Create batch send
 * - GET /v1/batch/:id - Get batch status
 * - GET /health - Health check
 *
 * Features:
 * - API key authentication
 * - Rate limiting via DynamoDB
 * - Plan-based feature gating
 */

import { rateLimitTable } from "./tables";
import { batchQueue } from "./queues";

// API Gateway with Elysia Lambda handler
export const api = new sst.aws.ApiGatewayV2("Api", {
  transform: {
    api: {
      tags: {
        ManagedBy: "sst",
        Service: "wraps-api",
      },
    },
  },
});

// Main API handler - Elysia app
const apiHandler = new sst.aws.Function("ApiHandler", {
  handler: "apps/api/src/lambda.handler",
  timeout: "30 seconds",
  memory: "512 MB",
  environment: {
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    BATCH_QUEUE_URL: batchQueue.url,
  },
  link: [rateLimitTable, batchQueue],
  nodejs: {
    install: ["pg"], // PostgreSQL driver for Drizzle
  },
  url: false, // We use API Gateway, not function URLs
});

// Route all requests to the Elysia handler
api.route("ANY /{proxy+}", apiHandler.arn);
api.route("ANY /", apiHandler.arn);
