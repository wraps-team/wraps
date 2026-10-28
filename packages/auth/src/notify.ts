/**
 * Drop-in replacement for the `notifyUser` / `notifyOrg` helpers in
 * `@wraps/db` (repositories/notifications.ts). Writers import this module
 * instead; the rows go through `auth.api.notify`, so routed notifications get
 * their delivery rows. Import as `@wraps/auth/notify`.
 *
 * The notifications instance is created on first call and reused for as long
 * as `db` is the same object. `closeDbConnection()` (cron workers call it in a
 * `finally`) ends the pool and reassigns `db`; an instance built before that
 * still holds the ended pool, so a warm Lambda's next invocation would fail
 * every notify with "Cannot use a pool after calling end on the pool". The
 * instance is therefore rebuilt whenever the `db` binding has changed.
 */

import { db } from "@wraps/db";
import {
  createNotificationsAuth,
  type NotificationsAuth,
} from "./notifications";
import { createNotifiers } from "./notify-core";

export type { NotifyOrgParams, NotifyUserParams } from "./notify-core";

let cached: { db: typeof db; auth: NotificationsAuth } | undefined;

function getNotificationsAuth(): NotificationsAuth {
  if (cached?.db !== db) {
    cached = { db, auth: createNotificationsAuth() };
  }
  return cached.auth;
}

const notifiers = createNotifiers(getNotificationsAuth);

export const notifyUser = notifiers.notifyUser;
export const notifyOrg = notifiers.notifyOrg;
