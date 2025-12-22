/**
 * Health Check Routes
 */

import { Elysia } from "elysia";

export const healthRoutes = new Elysia({ prefix: "" })
  .get(
    "/health",
    () => ({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    }),
    {
      detail: {
        tags: ["health"],
        summary: "Health check",
        description: "Returns the health status of the API",
      },
    }
  )
  .get(
    "/",
    () => ({
      name: "Wraps Platform API",
      version: "1.0.0",
      docs: "/swagger",
    }),
    {
      detail: {
        tags: ["health"],
        summary: "API info",
        description: "Returns basic API information",
      },
    }
  );
