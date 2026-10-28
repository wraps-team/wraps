/**
 * Notification Deliveries Worker
 *
 * Scheduled Lambda that sweeps the notification delivery queue: sends emails
 * that were held for `ifUnreadAfter` and are now due, and retries failed
 * sends. Runs every minute in production (infra/cron.ts).
 *
 * The sweep is `auth.api.processDeliveries`, from the notifications-only auth
 * instance (@wraps/auth/notifications) that shares its routes and channels with
 * the app's own `auth`. It runs outside any transaction. Each call handles one
 * batch; the handler loops while `hasMore` is true, up to a cap, so a backlog
 * drains within the run and the rest carries over to the next minute.
 */

import "../lib/sentry";

import {
  captureException,
  withMonitor,
  wrapHandler,
} from "@sentry/aws-serverless";
import { createNotificationsAuth } from "@wraps/auth/notifications";
import { closeDbConnection } from "@wraps/db";
import type { Handler } from "aws-lambda";
import { flushLogger, log } from "../lib/logger";
import { CRON_MONITOR_DEFAULTS, CRON_MONITORS } from "./cron-monitors";

/**
 * Batches per run. With the plugin's default batchSize of 100 this sends up to
 * 2,000 deliveries a minute; anything beyond that waits one minute.
 */
export const MAX_SWEEPS_PER_RUN = 20;

export const handler: Handler = wrapHandler(async () =>
  withMonitor(
    "notification-deliveries",
    async () => {
      try {
        const auth = createNotificationsAuth();

        let sweeps = 0;
        let sent = 0;
        let skipped = 0;
        let retrying = 0;
        let failed = 0;
        let hasMore = true;

        while (hasMore && sweeps < MAX_SWEEPS_PER_RUN) {
          const result = await auth.api.processDeliveries({ body: {} });
          sweeps += 1;
          sent += result.sent;
          skipped += result.skipped;
          retrying += result.retrying;
          failed += result.failed;
          hasMore = result.hasMore;
        }

        if (hasMore) {
          log.warn(
            "[notification-deliveries] Sweep cap reached; remaining deliveries wait for the next run",
            { maxSweeps: MAX_SWEEPS_PER_RUN }
          );
        }

        log.info("[notification-deliveries] Sweep complete", {
          sweeps,
          sent,
          skipped,
          retrying,
          failed,
        });
      } catch (error) {
        // Captured here and not rethrown: a failed sweep is retried by the next
        // minute's run, and a rethrow would have wrapHandler report it again.
        captureException(error, {
          tags: { worker: "notification-deliveries" },
        });
        log.error("[notification-deliveries] Sweep failed", error);
      } finally {
        await flushLogger();
        // Runs every minute, so a warm container would otherwise keep the Neon
        // compute awake; see closeDbConnection's doc comment in @wraps/db.
        await closeDbConnection();
      }
    },
    {
      ...CRON_MONITOR_DEFAULTS,
      ...CRON_MONITORS["notification-deliveries"],
    }
  )
);
