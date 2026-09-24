import type { withMonitor } from "@sentry/aws-serverless";

/**
 * `MonitorConfig` is exported by `@sentry/core`, which isn't a direct
 * dependency of this package (only `@sentry/aws-serverless` is), and
 * `@sentry/aws-serverless`'s public types don't re-export it either. Derive
 * the shape from `withMonitor`'s own third parameter instead of adding a
 * dependency just for a type.
 */
type MonitorConfig = NonNullable<Parameters<typeof withMonitor>[2]>;

/**
 * Sentry cron monitors for the scheduled Lambdas in infra/cron.ts. The
 * schedule here MUST match the CronV2 `schedule` there (AWS syntax translated
 * to crontab, UTC) — a mismatch pages for a missed check-in that was never due.
 */
export const CRON_MONITORS = {
  "broadcast-reaper": {
    schedule: { type: "interval", value: 15, unit: "minute" },
    maxRuntime: 6, // timeout: 5 minutes
  },
  "audit-log-cleanup": {
    schedule: { type: "crontab", value: "0 2 * * *" },
    maxRuntime: 6, // timeout: 5 minutes
  },
  "message-send-cleanup": {
    schedule: { type: "crontab", value: "0 3 * * *" },
    maxRuntime: 16, // timeout: 15 minutes
  },
  "workflow-reaper": {
    schedule: { type: "interval", value: 1, unit: "hour" },
    maxRuntime: 6, // timeout: 5 minutes
  },
  "event-feed-staleness": {
    schedule: { type: "crontab", value: "15 * * * *" },
    maxRuntime: 11, // timeout: 10 minutes
  },
  "account-health": {
    schedule: { type: "crontab", value: "45 * * * *" },
    maxRuntime: 11, // timeout: 10 minutes
  },
} satisfies Record<string, MonitorConfig>;

export type CronMonitorSlug = keyof typeof CRON_MONITORS;

export const CRON_MONITOR_DEFAULTS = {
  checkinMargin: 5, // minutes late before "missed"
  timezone: "Etc/UTC",
  failureIssueThreshold: 1,
  recoveryThreshold: 1,
} as const;
