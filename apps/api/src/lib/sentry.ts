import * as Sentry from "@sentry/aws-serverless";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  sendDefaultPii: true,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Off on purpose. Local-variable capture opens the V8 inspector and pauses
  // the main thread on every thrown exception, caught ones included. A fresh
  // AWS SDK client throws dozens of caught config-lookup errors on its first
  // call, so the first SQS send in each container took 5-10 s in production
  // (the POST /v1/events latency alarm). Turn it back on only with
  // captureAllExceptions: false and a re-check of that route's first-call time.
  includeLocalVariables: false,
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
