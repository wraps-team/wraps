/**
 * Shared `inbox()` options for every instance that calls `auth.api.notify` or
 * `auth.api.processDeliveries`: the main `auth` (index.ts), the notifications-only
 * instance (notifications.ts) and the delivery cron.
 *
 * `notify` schedules deliveries from `routes`, and the sweep sends through
 * `channels`. Two configs that drift apart fail silently (a type with no route
 * just stays in-app), so every instance imports this module and nothing else.
 *
 * Keep this module light: no database, no Stripe/SSO/SCIM. It is imported by
 * the main auth config and by Lambdas that only need the sweep.
 */

import type { WrapsMailerClient } from "@byo-oss/mailer/wraps";
import { wrapsMailer } from "@byo-oss/mailer/wraps";
import {
  type DeliveryRule,
  type InboxOptions,
  inbox,
} from "@byo-oss/notifications";
import { mailerChannel, renderEmail } from "@byo-oss/notifications/mailer";
import { getWrapsClient } from "@wraps/email";
import { resolveAppUrl } from "@wraps/email/lib/app-url";

/** Same sender as every other app email (packages/email/src/lib/client.ts). */
export const NOTIFICATION_EMAIL_FROM =
  process.env.EMAIL_FROM || "Wraps <hello@wraps.dev>";

/**
 * Notification types, keyed by the name we use in code. Each value must also
 * appear as a string literal in the file that writes it (see
 * notification-routes.test.ts); the writers keep their own literals.
 */
export const NOTIFICATION_TYPES = {
  workflowExecutionFailed: "workflow.execution_failed",
  awsRoleUnreachable: "aws.role_unreachable",
  awsRolePolicyStale: "aws.role_policy_stale",
  sesSendingPaused: "ses.sending_paused",
  sesProductionAccess: "ses.production_access",
  sesQuotaWarning: "ses.quota_warning",
  sesReputationWarning: "ses.reputation_warning",
  securityNewDeviceLogin: "security.new_device_login",
} as const;

/**
 * The @wraps.dev/email client has to be fetched asynchronously (getWrapsClient
 * resolves credentials), but the mailer needs a synchronous `{ send }`. Resolve
 * it per send, so a missing role or credential fails that one delivery rather
 * than the module load.
 */
const lazyWrapsClient: WrapsMailerClient = {
  send: async (params) => (await getWrapsClient()).send(params),
};

const emailChannel = mailerChannel({
  mailer: wrapsMailer({
    from: NOTIFICATION_EMAIL_FROM,
    client: lazyWrapsClient,
  }),
  // appUrl is resolved here, at send time, not in inbox(): resolveAppUrl throws
  // when no dashboard URL is configured, and that must not stop the web app
  // from loading. A missing URL fails the delivery (it retries, and names the fix).
  render: (ctx) =>
    renderEmail({ ...ctx, appUrl: ctx.appUrl ?? resolveAppUrl() }),
});

/** Email after 15 minutes if still unread; at most one such email per user per hour. */
const emailIfUnread: DeliveryRule<"email">[] = [
  {
    channel: "email",
    ifUnreadAfter: { minutes: 15 },
    throttle: { hours: 1 },
  },
];

/** Emails at the next sweep and is kept even if read in the app first. */
const emailImmediately: DeliveryRule<"email">[] = [
  { channel: "email", cancelIfRead: false },
];

export const notificationRoutes = {
  [NOTIFICATION_TYPES.workflowExecutionFailed]: emailIfUnread,
  [NOTIFICATION_TYPES.awsRoleUnreachable]: emailIfUnread,
  [NOTIFICATION_TYPES.awsRolePolicyStale]: emailIfUnread,
  [NOTIFICATION_TYPES.sesSendingPaused]: emailIfUnread,
  [NOTIFICATION_TYPES.sesProductionAccess]: emailIfUnread,
  [NOTIFICATION_TYPES.sesQuotaWarning]: emailIfUnread,
  [NOTIFICATION_TYPES.sesReputationWarning]: emailIfUnread,
  // A new sign-in emails at the next sweep and is not cancelled if the user
  // reads it in the app first: it is a security alert, not a nudge. There is no
  // other sign-in email today; the SMS alert (login-alert-sms.ts) is a separate
  // channel that cannot deliver until its origination identity is provisioned.
  [NOTIFICATION_TYPES.securityNewDeviceLogin]: emailImmediately,
};

export const notificationsOptions = {
  channels: { email: emailChannel },
  routes: notificationRoutes,
} satisfies InboxOptions<"email">;

/**
 * The inbox plugin for any instance that sends or sweeps notifications. Each
 * instance also adds the organization plugin itself (notify({ organizationId })
 * requires it), so the options above are the only shared part.
 */
export type NotificationsPlugins = [ReturnType<typeof inbox<"email">>];

export const notificationsPlugins = (): NotificationsPlugins => [
  inbox(notificationsOptions),
];
