// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { sentryEnvironment } from "./src/lib/sentry-environment";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  environment: sentryEnvironment(process.env.VERCEL_ENV, process.env.NODE_ENV),

  tracesSampleRate: 1,
  sendDefaultPii: true,
  includeLocalVariables: true,
  enableLogs: true,
});
