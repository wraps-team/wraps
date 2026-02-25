/**
 * Wraps Platform API
 *
 * Elysia-based API for batch sending and platform features.
 * Deployed via SST to AWS Lambda + API Gateway.
 */

import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";
import { automationsRoutes } from "./(ee)/routes/automations";
import { getPostHogClient } from "./lib/posthog";
import { automationScheduleRoutes } from "./routes/automation-schedules";
import { automationsSyncRoutes } from "./routes/automations-sync";
import { batchRoutes } from "./routes/batch";
import { connectionsRoutes } from "./routes/connections";
import { contactsRoutes } from "./routes/contacts";
import { eventsRoutes } from "./routes/events";
import { healthRoutes } from "./routes/health";
import { preferenceEventsRoutes } from "./routes/preference-events";
import { templatesSyncRoutes } from "./routes/templates-sync";
import { toolsRoutes } from "./routes/tools";
import { unsubscribeRoutes } from "./routes/unsubscribe";
import { webhooksRoutes } from "./routes/webhooks";

/**
 * OpenAPI documentation configuration
 * Shared between swagger UI and OpenAPI spec generation
 */
const openApiDocumentation = {
  openapi: "3.0.3" as const,
  info: {
    title: "Wraps Platform API",
    version: "1.0.0",
    description:
      "REST API for the Wraps email marketing platform. Send emails, manage contacts, trigger automations, and process events.",
    contact: {
      name: "Wraps Support",
      url: "https://wraps.dev",
      email: "support@wraps.dev",
    },
    license: {
      name: "Proprietary",
      url: "https://wraps.dev/terms",
    },
    termsOfService: "https://wraps.dev/terms",
  },
  servers: [
    {
      url: "https://api.wraps.dev",
      description: "Production API",
    },
  ],
  tags: [
    { name: "health", description: "Health check and API info endpoints" },
    {
      name: "contacts",
      description:
        "Contact management - create, update, delete, and list contacts",
    },
    {
      name: "batch",
      description: "Batch email sending operations for broadcasts",
    },
    {
      name: "events",
      description: "Custom event ingestion for triggering automations",
    },
    {
      name: "automations",
      description: "API-triggered automation execution endpoints",
    },
    {
      name: "connections",
      description: "AWS account connection management",
    },
    {
      name: "webhooks",
      description: "Webhook endpoints for receiving SES events",
    },
    {
      name: "unsubscribe",
      description: "RFC 8058 compliant email unsubscribe endpoints",
    },
    {
      name: "tools",
      description: "Free email deliverability tools (no auth required)",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http" as const,
        scheme: "bearer",
        description:
          "API key (wraps_*) or session token. Use format: Bearer wraps_your_api_key",
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

export const app = new Elysia()
  .onError(({ error, request }) => {
    const posthog = getPostHogClient();
    posthog.captureException(
      error instanceof Error ? error : new Error(String(error)),
      "api-error",
      {
        url: request.url,
        method: request.method,
      }
    );
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  })
  .use(
    cors({
      origin: true, // Allow any origin for public API
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-Organization-Id"],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    })
  )
  .use(
    swagger({
      path: "/swagger",
      documentation: openApiDocumentation,
      exclude: ["/swagger", "/swagger/json"],
    })
  )
  .use(healthRoutes)
  .use(connectionsRoutes)
  .use(contactsRoutes)
  .use(batchRoutes)
  .use(eventsRoutes)
  .use(automationsRoutes)
  .use(webhooksRoutes)
  .use(unsubscribeRoutes)
  .use(preferenceEventsRoutes)
  .use(templatesSyncRoutes)
  .use(automationsSyncRoutes)
  .use(toolsRoutes)
  .use(automationScheduleRoutes);

// Export type for Eden Treaty client
export type App = typeof app;

// For local development (not in Lambda)
// Check for Lambda environment indicators
const isLambda =
  !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.SST_DEV;

if (!isLambda && process.env.NODE_ENV !== "production") {
  app.listen(3002);
}
