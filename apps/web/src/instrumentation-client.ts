import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import { sentryEnvironment } from "@/lib/sentry-environment";

// Sentry client-side initialization
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment: sentryEnvironment(
    process.env.NEXT_PUBLIC_VERCEL_ENV,
    process.env.NODE_ENV
  ),

  sendDefaultPii: true,

  // 100% in dev, 10% in production
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  enableLogs: true,
});

// PostHog client-side initialization
posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: "https://o11y.wraps.dev",
  ui_host: "https://us.posthog.com",
  // Include the defaults option as required by PostHog
  defaults: "2026-01-30",
  // Enables capturing unhandled exceptions via Error Tracking
  capture_exceptions: true,
  // Disable web vitals to avoid console warning
  capture_performance: false,
  debug: false,
  cross_subdomain_cookie: true,
});

// IMPORTANT: Never combine this approach with other client-side PostHog initialization
// approaches, especially components like a PostHogProvider. instrumentation-client.ts
// is the correct solution for initializing client-side PostHog in Next.js 15.3+ apps.

// Hook into App Router navigation transitions
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
