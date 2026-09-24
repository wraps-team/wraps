import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    if (process.env.NODE_ENV === "production" && !process.env.SENTRY_DSN) {
      // Sentry.init with no DSN is a silent no-op; this is the only trace.
      const { logger } = await import("@/lib/logger");
      logger.warn(
        { event: "sentry.dsn_missing" },
        "SENTRY_DSN is not set; server errors will not be reported"
      );
    }

    // Surface a bad WRAPS_AI_PROVIDER / AI_MODEL here rather than leaving the
    // operator to discover it from the first 503. Imported lazily so the AI
    // registry stays out of the edge bundle.
    const { logAIConfigIssuesAtBoot } = await import("@/lib/ai/env");
    logAIConfigIssuesAtBoot();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
