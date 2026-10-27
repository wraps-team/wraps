/**
 * Every route key must be the exact `type` its writer uses. A misspelled key
 * compiles, boots and silently never sends: notify finds no rule and the
 * notification stays in-app. So each routed type must appear as a string
 * literal in the file that writes it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_TYPES,
  notificationRoutes,
} from "../notifications-config";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../");

const ACCOUNT_HEALTH = "apps/api/src/workers/account-health.ts";
const WORKFLOW_FAILURE =
  "apps/api/src/(ee)/services/workflow-failure-notification.ts";
const LOGIN_NOTIFICATION = "packages/auth/src/index.ts";

/** The file that writes each notification type. */
const WRITER_FILES: Record<string, string> = {
  [NOTIFICATION_TYPES.workflowExecutionFailed]: WORKFLOW_FAILURE,
  [NOTIFICATION_TYPES.awsRoleUnreachable]: ACCOUNT_HEALTH,
  [NOTIFICATION_TYPES.awsRolePolicyStale]: ACCOUNT_HEALTH,
  [NOTIFICATION_TYPES.sesSendingPaused]: ACCOUNT_HEALTH,
  [NOTIFICATION_TYPES.sesProductionAccess]: ACCOUNT_HEALTH,
  [NOTIFICATION_TYPES.sesQuotaWarning]: ACCOUNT_HEALTH,
  [NOTIFICATION_TYPES.sesReputationWarning]: ACCOUNT_HEALTH,
  [NOTIFICATION_TYPES.securityNewDeviceLogin]: LOGIN_NOTIFICATION,
};

function readWriter(file: string) {
  return readFileSync(path.join(REPO_ROOT, file), "utf8");
}

describe("notification route keys match their writers", () => {
  it.each(Object.keys(notificationRoutes))(
    "%s is written as that exact literal",
    (type) => {
      const writer = WRITER_FILES[type];
      expect(writer, `no writer mapped for routed type ${type}`).toBeDefined();
      expect(readWriter(writer!)).toContain(`"${type}"`);
    }
  );

  it.each(Object.values(NOTIFICATION_TYPES))(
    "%s has a writer that contains it",
    (type) => {
      const writer = WRITER_FILES[type];
      expect(writer, `no writer mapped for ${type}`).toBeDefined();
      expect(readWriter(writer!)).toContain(`"${type}"`);
    }
  );

  it("routes every account-health type the worker writes", () => {
    const source = readWriter(ACCOUNT_HEALTH);
    const written = [...source.matchAll(/type: "([a-z_]+\.[a-z_]+)"/g)].map(
      (m) => m[1] ?? ""
    );
    expect(written.length).toBeGreaterThan(0);
    for (const type of written) {
      expect(
        notificationRoutes,
        `unrouted account-health type ${type}`
      ).toHaveProperty([type]);
    }
  });

  it("emails security.new_device_login at once and keeps it when read first", () => {
    expect(
      notificationRoutes[NOTIFICATION_TYPES.securityNewDeviceLogin]
    ).toEqual([{ channel: "email", cancelIfRead: false }]);
  });
});
