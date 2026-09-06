/**
 * Wraps Platform API
 *
 * Elysia-based API for batch sending and platform features.
 * Deployed via SST to AWS Lambda + API Gateway.
 */

import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import * as Sentry from "@sentry/aws-serverless";
import { Elysia } from "elysia";
import { workflowScheduleRoutes } from "./(ee)/routes/workflow-schedules";
import { workflowsRoutes } from "./(ee)/routes/workflows";
import { workflowsSyncRoutes } from "./(ee)/routes/workflows-sync";
import { type ApiErrorSinks, handleApiError } from "./lib/error-handler";
import { log } from "./lib/logger";
import {
  ERROR_RESPONSES,
  ERROR_SCHEMAS,
  injectErrorResponses,
} from "./lib/openapi-errors";
import { getPostHogClient } from "./lib/posthog";
import { resolveApiUrl } from "./lib/urls";
import { getAuthOptional } from "./middleware/auth";
import { errorContract } from "./middleware/error-contract";
import { accountRoutes } from "./routes/account";
import { agentsRoutes } from "./routes/agents";
import { agentsWebhookRoutes } from "./routes/agents-webhook";
import { batchRoutes } from "./routes/batch";
import { connectionsRoutes } from "./routes/connections";
import { contactsRoutes } from "./routes/contacts";
import { contactsTopicsRoutes } from "./routes/contacts-topics";
import { domainsRoutes } from "./routes/domains";
import { emailLogsRoutes } from "./routes/email-logs";
import { eventsRoutes } from "./routes/events";
import { healthRoutes } from "./routes/health";
import { metricsRoutes } from "./routes/metrics";
import { preferenceEventsRoutes } from "./routes/preference-events";
import { segmentsRoutes } from "./routes/segments";
import { templatesRoutes } from "./routes/templates";
import { templatesSyncRoutes } from "./routes/templates-sync";
import { toolsRoutes } from "./routes/tools";
import { unsubscribeRoutes } from "./routes/unsubscribe";
import { webhooksRoutes } from "./routes/webhooks";
import { wellKnownRoutes } from "./routes/well-known";

/**
 * OpenAPI documentation configuration
 * Shared between swagger UI and OpenAPI spec generation
 */
const openApiDocumentation = {
  openapi: "3.0.3" as const,
  info: {
    title: "Wraps Platform API",
    version: "1.0.0",
    description: [
      "REST API for the Wraps email marketing platform. Send emails, manage contacts, trigger workflows, and process events.",
      "",
      "**Errors.** Every 4xx and 5xx response returns the `ApiError` object: branch on the stable `code`, show `error` to a person, quote `requestId` to support. The full list of codes is enumerated on the schema.",
      "",
      "**Rate limits.** Limited responses carry `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (seconds, not a timestamp) and `RateLimit-Policy`, plus `Retry-After` on a 429. See https://wraps.dev/docs/reference/rate-limits",
      "",
      "**Versioning.** Breaking changes ship as a new version; deprecations are announced with `Deprecation` and `Sunset` headers and a 6-month minimum notice. Policy: https://wraps.dev/docs/reference/versioning",
    ].join("\n"),
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
  externalDocs: {
    description: "Wraps documentation",
    url: "https://wraps.dev/docs",
  },
  servers: [
    {
      // A self-hosted deployment must advertise its OWN server here. Hardcoded,
      // this sent every client generated from this spec — and every "try it"
      // request from the swagger UI, carrying the customer's self-hosted API
      // key — to the Wraps platform.
      url: resolveApiUrl(),
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
      description: "Custom event ingestion for triggering workflows",
    },
    {
      name: "workflows",
      description: "API-triggered workflow execution endpoints",
    },
    {
      name: "connections",
      description: "AWS account connection management",
    },
    {
      name: "domains",
      description:
        "Sending identity (domain) verification state, read live from SES",
    },
    {
      name: "templates",
      description: "Email template CRUD, publish to SES, and CLI sync",
    },
    {
      name: "segments",
      description:
        "Audience segment CRUD and condition preview. Requires a Pro plan or higher.",
    },
    {
      name: "email-logs",
      description: "Email delivery log inspection",
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
    schemas: ERROR_SCHEMAS,
    responses: ERROR_RESPONSES,
  },
  security: [{ bearerAuth: [] }],
};

/** The spec route, so the injector can find it without guessing. */
const OPENAPI_SPEC_PATH = "/swagger/json";

/**
 * CORS is intentionally wildcard: this is a public API for customer apps,
 * authenticated via Authorization: Bearer only (never cookies), so browsers
 * cannot attach a victim's credentials cross-origin. Matches the API Gateway
 * CORS config in infra/api.ts, which overrides these headers when deployed.
 * Credentials must stay disabled — wildcard + credentials is rejected by
 * browsers, and cookie auth on this API would require an allowlist instead.
 */

/**
 * Incident sinks for the error handler. Sentry and PostHog always fire
 * together, so they are one dependency from the handler's point of view.
 */
const apiErrorSinks: ApiErrorSinks = {
  log,
  captureException: (error, context) => {
    Sentry.captureException(error, { extra: { ...context } });
    getPostHogClient().captureException(error, "api-error", {
      url: context.url,
      method: context.method,
    });
  },
};

export const app = new Elysia()
  .derive(({ request }) => ({
    startTime: performance.now(),
    requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
  }))
  .onAfterResponse(({ request, startTime, requestId, set, ...ctx }) => {
    const auth = getAuthOptional(ctx);

    set.headers["x-request-id"] = requestId;

    if (!auth) {
      return;
    }

    const url = new URL(request.url);
    log.info("api.request", {
      requestId,
      method: request.method,
      path: url.pathname,
      status: set.status ?? 200,
      durationMs: Math.round(performance.now() - startTime),
      organizationId: auth.organizationId,
      apiKeyId: auth.apiKeyId,
      userId: auth.userId,
      planId: auth.planId,
      authMethod: auth.apiKeyId ? "api_key" : "session",
    });
  })
  // Routes that return their own `{ error }` object skip onError entirely, so
  // the machine-readable `code` the OpenAPI contract promises is filled in
  // there rather than in each of them.
  .use(errorContract)
  .onError(({ error, request, code, set, requestId, ...ctx }) =>
    handleApiError(
      {
        error,
        request,
        code,
        setStatus: set.status,
        requestId,
        auth: getAuthOptional(ctx) ?? null,
      },
      apiErrorSinks
    )
  )
  .use(
    cors({
      origin: true,
      credentials: false,
      allowedHeaders: ["Content-Type", "Authorization", "X-Organization-Id"],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    })
  )
  // Every operation shares one error contract. The plugin generates operations
  // from the route definitions, so the responses are attached to the finished
  // spec instead of being repeated in every route's `detail`.
  .onAfterHandle({ as: "global" }, ({ path, response }) => {
    if (
      path === OPENAPI_SPEC_PATH &&
      response &&
      typeof response === "object"
    ) {
      injectErrorResponses(response as Record<string, never>);
    }
  })
  .use(
    swagger({
      path: "/swagger",
      documentation: openApiDocumentation,
      exclude: ["/swagger", OPENAPI_SPEC_PATH],
    })
  )
  .use(wellKnownRoutes)
  .use(healthRoutes)
  .use(accountRoutes)
  .use(connectionsRoutes)
  .use(domainsRoutes)
  .use(emailLogsRoutes)
  .use(metricsRoutes)
  .use(contactsRoutes)
  .use(contactsTopicsRoutes)
  .use(batchRoutes)
  .use(segmentsRoutes)
  .use(eventsRoutes)
  .use(workflowsRoutes)
  .use(webhooksRoutes)
  .use(unsubscribeRoutes)
  .use(preferenceEventsRoutes)
  .use(templatesSyncRoutes)
  .use(templatesRoutes)
  .use(workflowsSyncRoutes)
  .use(toolsRoutes)
  .use(workflowScheduleRoutes)
  .use(agentsRoutes)
  .use(agentsWebhookRoutes);

// Export type for Eden Treaty client
export type App = typeof app;

// For local development (not in Lambda)
// Check for Lambda environment indicators
const isLambda =
  !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.SST_DEV;

if (!isLambda && process.env.NODE_ENV !== "production") {
  app.listen(Number(process.env.PORT) || 3002);
}
