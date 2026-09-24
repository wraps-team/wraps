/**
 * Binds the Sentry monitor schedules in cron-monitors.ts to the CronV2
 * `schedule` values in infra/cron.ts. A mismatch here would page for a missed
 * check-in that was never actually due, or worse, never notice a schedule
 * change at all.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CRON_MONITORS } from "../cron-monitors";

const REPO_ROOT = path.resolve(__dirname, "../../../../../");
const cronSource = readFileSync(path.join(REPO_ROOT, "infra/cron.ts"), "utf8");

/** Each block starts at `new sst.aws.CronV2(` and runs to the next one (or EOF). */
const blocks = cronSource.split(/(?=new sst\.aws\.CronV2\()/);

/** The handler path each CRON_MONITORS slug corresponds to in infra/cron.ts. */
const HANDLER_PATHS: Record<keyof typeof CRON_MONITORS, string> = {
  "broadcast-reaper": "apps/api/src/workers/broadcast-reaper.handler",
  "audit-log-cleanup": "apps/api/src/workers/audit-log-cleanup.handler",
  "message-send-cleanup": "apps/api/src/workers/message-send-cleanup.handler",
  "workflow-reaper": "apps/api/src/(ee)/workers/workflow-reaper.handler",
  "event-feed-staleness": "apps/api/src/workers/event-feed-staleness.handler",
  "account-health": "apps/api/src/workers/account-health.handler",
};

type TranslatedSchedule =
  | { type: "interval"; value: number; unit: "minute" | "hour" }
  | { type: "crontab"; value: string };

/** Translate infra/cron.ts's AWS schedule expression to a Sentry monitor schedule. */
function translateAwsSchedule(awsSchedule: string): TranslatedSchedule {
  const rateMinutes = awsSchedule.match(/^rate\((\d+) minutes?\)$/);
  if (rateMinutes) {
    return { type: "interval", value: Number(rateMinutes[1]), unit: "minute" };
  }

  const rateHours = awsSchedule.match(/^rate\((\d+) hours?\)$/);
  if (rateHours) {
    return { type: "interval", value: Number(rateHours[1]), unit: "hour" };
  }

  const cron = awsSchedule.match(/^cron\((\S+) (\S+) \* \* \? \*\)$/);
  if (cron) {
    const [, minute, hour] = cron;
    return { type: "crontab", value: `${minute} ${hour} * * *` };
  }

  throw new Error(`Don't know how to translate AWS schedule: ${awsSchedule}`);
}

function findBlockForHandler(handlerPath: string): string {
  const block = blocks.find((b) => b.includes(`"${handlerPath}"`));
  if (!block) {
    throw new Error(
      `No CronV2 block in infra/cron.ts references handler "${handlerPath}"`
    );
  }
  return block;
}

function extractAwsSchedule(block: string): string {
  const match = block.match(/schedule:\s*"([^"]+)"/);
  if (!match) {
    throw new Error("No schedule: found in the matched CronV2 block");
  }
  return match[1];
}

describe("cron monitor schedules match infra/cron.ts", () => {
  it("defines exactly six monitors", () => {
    expect(Object.keys(CRON_MONITORS).length).toBe(6);
  });

  it.each(Object.entries(HANDLER_PATHS))(
    "%s's monitor schedule matches its infra/cron.ts schedule",
    (slug, handlerPath) => {
      const block = findBlockForHandler(handlerPath);
      const awsSchedule = extractAwsSchedule(block);
      const expected = translateAwsSchedule(awsSchedule);

      expect(
        CRON_MONITORS[slug as keyof typeof CRON_MONITORS].schedule
      ).toEqual(expected);
    }
  );

  it.each(Object.keys(CRON_MONITORS))(
    "%s's handler file calls withMonitor with its own slug",
    (slug) => {
      const handlerPath = HANDLER_PATHS[slug as keyof typeof CRON_MONITORS];
      const sourcePath = path.join(
        REPO_ROOT,
        handlerPath.replace(/\.handler$/, ".ts")
      );
      const source = readFileSync(sourcePath, "utf8");

      expect(source).toMatch(new RegExp(`withMonitor\\(\\s*["']${slug}["']`));
    }
  );
});
