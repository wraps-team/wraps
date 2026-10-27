/**
 * The shared notification config, run end to end on better-auth's memory
 * adapter: no database. The config builds the real Wraps mailer, so the only
 * fake is at the SES boundary (getWrapsClient). That covers the wiring the
 * app depends on: the sender, the link, the delay, read-cancellation and the
 * lazy client.
 *
 * Imports the shared module only, never the real `auth` or `@wraps/db`.
 */

import { getAuthTables } from "@better-auth/core/db";
import { type InboxOptions, inbox } from "@byo-oss/notifications";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { type MemoryDB, memoryAdapter } from "better-auth/adapters/memory";
import { organization } from "better-auth/plugins";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOTIFICATION_EMAIL_FROM,
  NOTIFICATION_TYPES,
  notificationsOptions,
} from "../notifications-config";

const { getWrapsClient, wrapsSend } = vi.hoisted(() => {
  const wrapsSend = vi.fn(async (_params: unknown) => ({
    messageId: "ses-message-1",
    requestId: "req-1",
  }));
  const getWrapsClient = vi.fn(async () => ({ send: wrapsSend }));
  return { getWrapsClient, wrapsSend };
});

vi.mock("@wraps/email", () => ({ getWrapsClient }));

const APP_URL = "https://app.example.test";
const T0 = new Date("2026-10-27T12:00:00Z").getTime();
const MINUTE = 60_000;
const ALICE = "alice@example.com";

function createAuth(inboxOptions: InboxOptions = notificationsOptions) {
  const options = {
    baseURL: "https://auth.example.test",
    secret: "notifications-config-test-secret-0123456789",
    emailAndPassword: { enabled: true },
    plugins: [organization(), inbox(inboxOptions)],
  } satisfies Partial<BetterAuthOptions>;
  const tables = getAuthTables(options);
  const memoryDB = Object.keys(tables).reduce<MemoryDB>((db, table) => {
    db[table] = [];
    return db;
  }, {});
  return betterAuth({ ...options, database: memoryAdapter(memoryDB) });
}

async function signUp(auth: ReturnType<typeof createAuth>, email: string) {
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, password: "password-1234", name: "Alice" },
    returnHeaders: true,
  });
  const cookie = (headers as Headers)
    .getSetCookie()
    .map((c: string) => c.split(";")[0])
    .join("; ");
  return { user: response.user, headers: new Headers({ cookie }) };
}

/** Marks the user as in the app, as the inbox does on each unread-count poll. */
async function markPresent(
  auth: ReturnType<typeof createAuth>,
  headers: Headers
) {
  await auth.api.unreadCount({ headers, query: {} });
}

function setNow(ms: number) {
  vi.setSystemTime(new Date(ms));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  setNow(T0);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
  vi.stubEnv("BETTER_AUTH_URL", "");
  vi.stubEnv("APP_BASE_URL", "");
  getWrapsClient.mockClear();
  wrapsSend.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("shared notification config", () => {
  it("does not resolve the Wraps client when the module loads", () => {
    expect(getWrapsClient).not.toHaveBeenCalled();
    expect(wrapsSend).not.toHaveBeenCalled();
  });

  it("uses the same sender as the app's other email", () => {
    expect(NOTIFICATION_EMAIL_FROM).toBe(
      process.env.EMAIL_FROM || "Wraps <hello@wraps.dev>"
    );
  });

  it("holds an unread routed notification until the delay, then sends it once", async () => {
    const auth = createAuth();
    const { user, headers } = await signUp(auth, ALICE);
    await markPresent(auth, headers);

    await auth.api.notify({
      body: {
        userId: user.id,
        type: NOTIFICATION_TYPES.workflowExecutionFailed,
        title: "Workflow failed",
        body: "Step 2 timed out.",
        href: "/acme/automations/wf-1/executions?status=failed",
      },
    });

    // not due yet: nothing is sent, and the sweep reports nothing to do
    expect(await auth.api.processDeliveries({ body: {} })).toMatchObject({
      sent: 0,
    });
    setNow(T0 + 14 * MINUTE);
    expect(await auth.api.processDeliveries({ body: {} })).toMatchObject({
      sent: 0,
    });
    expect(wrapsSend).not.toHaveBeenCalled();

    // due: exactly one send, from the shared sender, with an absolute link
    setNow(T0 + 15 * MINUTE + 1_000);
    expect(await auth.api.processDeliveries({ body: {} })).toMatchObject({
      sent: 1,
    });
    expect(wrapsSend).toHaveBeenCalledTimes(1);
    expect(getWrapsClient).toHaveBeenCalledTimes(1);
    expect(wrapsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: NOTIFICATION_EMAIL_FROM,
        to: ALICE,
        subject: "Workflow failed",
        html: expect.stringContaining(
          `${APP_URL}/acme/automations/wf-1/executions?status=failed`
        ),
        text: expect.stringContaining(
          `${APP_URL}/acme/automations/wf-1/executions?status=failed`
        ),
      })
    );

    // a later sweep does not send it again
    setNow(T0 + 60 * MINUTE);
    expect(await auth.api.processDeliveries({ body: {} })).toMatchObject({
      sent: 0,
    });
    expect(wrapsSend).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when the notification is read before the delay", async () => {
    const auth = createAuth();
    const { user, headers } = await signUp(auth, ALICE);
    await markPresent(auth, headers);

    const { notifications } = await auth.api.notify({
      body: {
        userId: user.id,
        type: NOTIFICATION_TYPES.sesQuotaWarning,
        title: "Quota at 90%",
        href: "/acme/settings",
      },
    });
    await auth.api.markRead({
      headers,
      body: { id: notifications[0]!.id },
    });

    setNow(T0 + 16 * MINUTE);
    expect(await auth.api.processDeliveries({ body: {} })).toMatchObject({
      sent: 0,
      skipped: 1,
    });
    expect(wrapsSend).not.toHaveBeenCalled();
  });

  it("sends an immediate route at the next sweep, even after it is read", async () => {
    // security.new_device_login is routed immediate with cancelIfRead: false in
    // the production routes, so the shared options are used unmodified.
    const auth = createAuth();
    const { user, headers } = await signUp(auth, ALICE);

    const { notifications } = await auth.api.notify({
      body: {
        userId: user.id,
        type: NOTIFICATION_TYPES.securityNewDeviceLogin,
        title: "New sign-in to your account",
        href: "/settings/security",
      },
    });
    await auth.api.markRead({
      headers,
      body: { id: notifications[0]!.id },
    });

    // no delay: the first sweep sends it, with no time advanced
    expect(await auth.api.processDeliveries({ body: {} })).toMatchObject({
      sent: 1,
    });
    expect(wrapsSend).toHaveBeenCalledTimes(1);
    expect(wrapsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining(`${APP_URL}/settings/security`),
      })
    );
  });

  it("fails the delivery, not the module load, when no app URL is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const auth = createAuth();
    const { user, headers } = await signUp(auth, ALICE);
    await markPresent(auth, headers);

    await auth.api.notify({
      body: {
        userId: user.id,
        type: NOTIFICATION_TYPES.awsRoleUnreachable,
        title: "Wraps can no longer reach your AWS account",
        href: "/acme/connections",
      },
    });

    setNow(T0 + 16 * MINUTE);
    expect(await auth.api.processDeliveries({ body: {} })).toMatchObject({
      sent: 0,
      retrying: 1,
    });
    expect(wrapsSend).not.toHaveBeenCalled();
  });
});
