import * as Sentry from "@sentry/aws-serverless";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  sendDefaultPii: true,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  includeLocalVariables: true,
  enableLogs: true,

  integrations: [nodeProfilingIntegration()],
  profilesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Set per Lambda by infra (sentryEnv in infra/secrets.ts). Without them every
  // event arrived untagged: no production filter for alerts, no per-deploy
  // regression tracking.
  environment:
    process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
  release: process.env.SENTRY_RELEASE || undefined,
});
