/**
 * A better-auth instance with only what notification sends and the delivery
 * sweep need: the database, the organization plugin and the shared inbox
 * config. API Lambdas and the delivery cron import this instead of the full
 * `auth` (Stripe, SSO and SCIM are not loaded here).
 *
 * Mirrors index.ts's database setup. Import as `@wraps/auth/notifications`.
 */

import type { Notification, SweepResult } from "@byo-oss/notifications";
import { db } from "@wraps/db";
import * as schema from "@wraps/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { notificationsPlugins } from "./notifications-config";

/**
 * The parts of the instance the notification API Lambdas and the sweep call.
 * Named so the emitted .d.ts doesn't spell out better-auth's and
 * @byo-oss/core's internal types (TS2742).
 */
export type NotificationsAuth = {
  api: {
    notify: (ctx: { body: NotifyBody }) => Promise<{
      count: number;
      notifications: Notification[];
    }>;
    processDeliveries: (ctx: {
      body?: { limit?: number };
    }) => Promise<SweepResult>;
  };
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

/**
 * better-auth requires a secret, and refuses its built-in default when
 * NODE_ENV=production (API Lambdas). This instance never signs, verifies or
 * hashes anything: nothing mounts its request handler (only the server-only
 * `notify` and `processDeliveries` are called), it handles no session or
 * cookie, and it authenticates no one. So the placeholder below is acceptable
 * and no secret has to be provisioned for the Lambdas. When BETTER_AUTH_SECRET
 * is set it is used anyway.
 *
 * It is 32+ characters, so better-auth's length check passes, and it is not
 * better-auth's DEFAULT_SECRET, so its production check passes too.
 */
export const NOTIFICATIONS_ONLY_PLACEHOLDER_SECRET =
  "notifications-only-placeholder-not-a-secret-never-used-to-sign";

export function createNotificationsAuth(): NotificationsAuth {
  const database: ReturnType<typeof drizzleAdapter> = drizzleAdapter(db, {
    provider: "pg",
    schema,
    // same as index.ts: a plain Drizzle/node-postgres connection with real transactions
    transaction: true,
  });
  const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret:
      process.env.BETTER_AUTH_SECRET || NOTIFICATIONS_ONLY_PLACEHOLDER_SECRET,
    database,
    // organization: notify({ organizationId }) requires it
    plugins: [organization(), ...notificationsPlugins()],
  });
  return auth satisfies NotificationsAuth;
}
