/**
 * The `notifyUser` / `notifyOrg` wrappers over `auth.api.notify`, with the
 * notifications instance injected. No database import here, so the tests run
 * this on better-auth's memory adapter. `notify.ts` supplies the real instance.
 *
 * Same call shapes as the `@wraps/db` helpers they replace, minus the
 * `dbClient` argument: the plugin owns the transaction now.
 */

import type { Notification } from "@byo-oss/notifications";
import { INBOX_ERROR_CODES } from "@byo-oss/notifications";
import { isAPIError } from "better-auth/api";

export type NotificationPayload = {
  type: string;
  title: string;
  body?: string;
  href?: string;
  data?: Record<string, unknown>;
};

export type NotifyUserParams = NotificationPayload & {
  userId: string;
  organizationId?: string;
};

export type NotifyOrgParams = NotificationPayload & {
  organizationId: string;
  roles?: string[];
  excludeUserIds?: string[];
};

type NotifyBody = {
  userId?: string;
  organizationId?: string;
  roles?: string[];
  excludeUserIds?: string[];
  type: string;
  title: string;
  body?: string;
  href?: string;
  data?: Record<string, unknown>;
};

export type NotifyAuth = {
  api: {
    notify: (ctx: {
      body: NotifyBody;
    }) => Promise<{ count: number; notifications: Notification[] }>;
  };
};

/**
 * Matched on the error code, not the message. `APIError.from` puts the code
 * on `body.code`.
 */
function isOrgHasNoMembersError(error: unknown): boolean {
  return (
    isAPIError(error) &&
    error.body?.code === INBOX_ERROR_CODES.ORGANIZATION_HAS_NO_MEMBERS.code
  );
}

export function createNotifiers(
  getAuth: () => NotifyAuth | Promise<NotifyAuth>
) {
  /** Returns the inserted row, as the db helper did. */
  async function notifyUser(params: NotifyUserParams): Promise<Notification> {
    const auth = await getAuth();
    const { notifications } = await auth.api.notify({
      body: {
        userId: params.userId,
        organizationId: params.organizationId,
        type: params.type,
        title: params.title,
        body: params.body,
        href: params.href,
        data: params.data,
      },
    });
    const [row] = notifications;
    if (!row) {
      throw new Error("notify returned no notification for a userId target");
    }
    return row;
  }

  /**
   * Returns the inserted rows, or [] when nobody is targeted: the role or
   * exclude filter leaves no one, or the org has no members. Any other error
   * propagates.
   */
  async function notifyOrg(params: NotifyOrgParams): Promise<Notification[]> {
    const auth = await getAuth();
    try {
      const { notifications } = await auth.api.notify({
        body: {
          organizationId: params.organizationId,
          roles: params.roles,
          excludeUserIds: params.excludeUserIds,
          type: params.type,
          title: params.title,
          body: params.body,
          href: params.href,
          data: params.data,
        },
      });
      return notifications;
    } catch (error) {
      if (isOrgHasNoMembersError(error)) {
        return [];
      }
      throw error;
    }
  }

  return { notifyUser, notifyOrg };
}
