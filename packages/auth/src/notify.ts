/**
 * Drop-in replacement for the `notifyUser` / `notifyOrg` helpers in
 * `@wraps/db` (repositories/notifications.ts). Writers import this module
 * instead; the rows go through `auth.api.notify`, so routed notifications get
 * their delivery rows. Import as `@wraps/auth/notify`.
 *
 * The notifications instance is created on first call and then reused.
 */

import {
  createNotificationsAuth,
  type NotificationsAuth,
} from "./notifications";
import { createNotifiers } from "./notify-core";

export type { NotifyOrgParams, NotifyUserParams } from "./notify-core";

let notificationsAuth: NotificationsAuth | undefined;

function getNotificationsAuth(): NotificationsAuth {
  notificationsAuth ??= createNotificationsAuth();
  return notificationsAuth;
}

const notifiers = createNotifiers(getNotificationsAuth);

export const notifyUser = notifiers.notifyUser;
export const notifyOrg = notifiers.notifyOrg;
