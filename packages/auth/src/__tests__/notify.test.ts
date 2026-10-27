/**
 * The notifyUser / notifyOrg wrappers, run on the shared notification config
 * over better-auth's memory adapter: no database. The notifications instance
 * is injected (createNotifiers), so this exercises the same wrapper code that
 * notify.ts exports, against a memory-backed instance.
 *
 * Imports the shared config and the wrapper core only, never the real `auth`,
 * `@wraps/db` or notify.ts (which would load the real db).
 */

import { getAuthTables } from "@better-auth/core/db";
import { type InboxOptions, inbox } from "@byo-oss/notifications";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { type MemoryDB, memoryAdapter } from "better-auth/adapters/memory";
import { organization } from "better-auth/plugins";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOTIFICATION_TYPES,
  notificationsOptions,
} from "../notifications-config";
import { createNotifiers } from "../notify-core";

vi.mock("@wraps/email", () => ({ getWrapsClient: vi.fn() }));

const ORG = "org-acme";
const OTHER_ORG = "org-other";

function createAuth(inboxOptions: InboxOptions = notificationsOptions) {
  const options = {
    baseURL: "https://auth.example.test",
    secret: "notify-test-secret-0123456789abcdefghijklmnop",
    plugins: [organization(), inbox(inboxOptions)],
  } satisfies Partial<BetterAuthOptions>;
  const tables = getAuthTables(options);
  const memoryDB = Object.keys(tables).reduce<MemoryDB>((db, table) => {
    db[table] = [];
    return db;
  }, {});
  const auth = betterAuth({ ...options, database: memoryAdapter(memoryDB) });
  return { auth, memoryDB };
}

type Harness = ReturnType<typeof createAuth>;

/** Seeds an org with members (userId -> role). Better-auth's member table holds the role. */
async function seedOrg(
  harness: Harness,
  orgId: string,
  members: Record<string, string>
) {
  const ctx = await harness.auth.$context;
  for (const [userId, role] of Object.entries(members)) {
    await ctx.adapter.create({
      model: "member",
      data: { organizationId: orgId, userId, role, createdAt: new Date() },
    });
  }
}

const rowsFor = (harness: Harness, model: string) =>
  (harness.memoryDB[model] ?? []) as Record<string, unknown>[];

let harness: Harness;
let notifyUser: ReturnType<typeof createNotifiers>["notifyUser"];
let notifyOrg: ReturnType<typeof createNotifiers>["notifyOrg"];

function wire(inboxOptions?: InboxOptions) {
  harness = createAuth(inboxOptions);
  const notifiers = createNotifiers(() => harness.auth);
  notifyUser = notifiers.notifyUser;
  notifyOrg = notifiers.notifyOrg;
}

const basePayload = {
  type: NOTIFICATION_TYPES.sesQuotaWarning,
  title: "Quota at 90%",
  body: "Raise your sending quota.",
  href: "/acme/settings",
};

beforeEach(() => {
  wire();
});

describe("notifyUser", () => {
  it("creates one row for the user and returns it", async () => {
    const row = await notifyUser({ ...basePayload, userId: "user-alice" });

    expect(row).toMatchObject({
      userId: "user-alice",
      type: basePayload.type,
      title: basePayload.title,
      body: basePayload.body,
      href: basePayload.href,
      read: false,
    });
    expect(row.organizationId).toBeFalsy();
    expect(rowsFor(harness, "notification")).toHaveLength(1);
  });

  it("stores the organization when one is given", async () => {
    await seedOrg(harness, ORG, { "user-alice": "member" });
    const row = await notifyUser({
      ...basePayload,
      userId: "user-alice",
      organizationId: ORG,
    });

    expect(row.organizationId).toBe(ORG);
  });

  it("schedules a delivery row for a routed type", async () => {
    await notifyUser({ ...basePayload, userId: "user-alice" });

    const deliveries = rowsFor(harness, "notificationDelivery");
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ channel: "email" });
  });

  it("schedules no delivery row for an unrouted type", async () => {
    await notifyUser({
      ...basePayload,
      type: "member.role_changed",
      userId: "user-alice",
    });

    expect(rowsFor(harness, "notification")).toHaveLength(1);
    expect(rowsFor(harness, "notificationDelivery")).toHaveLength(0);
  });
});

describe("notifyOrg", () => {
  beforeEach(async () => {
    await seedOrg(harness, ORG, {
      "user-alice": "owner",
      "user-bob": "admin",
      "user-carol": "member",
    });
  });

  it("fans out to every member and returns the rows", async () => {
    const rows = await notifyOrg({ ...basePayload, organizationId: ORG });

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.userId).sort()).toEqual([
      "user-alice",
      "user-bob",
      "user-carol",
    ]);
    expect(rows.every((r) => r.organizationId === ORG)).toBe(true);
    expect(rowsFor(harness, "notification")).toHaveLength(3);
  });

  it("filters by role", async () => {
    const rows = await notifyOrg({
      ...basePayload,
      organizationId: ORG,
      roles: ["admin", "owner"],
    });

    expect(rows.map((r) => r.userId).sort()).toEqual([
      "user-alice",
      "user-bob",
    ]);
  });

  it("matches a multi-role member stored as a comma-separated list", async () => {
    await seedOrg(harness, OTHER_ORG, { "user-dana": "member,admin" });

    const rows = await notifyOrg({
      ...basePayload,
      organizationId: OTHER_ORG,
      roles: ["admin"],
    });

    expect(rows.map((r) => r.userId)).toEqual(["user-dana"]);
  });

  it("drops excluded users", async () => {
    const rows = await notifyOrg({
      ...basePayload,
      organizationId: ORG,
      excludeUserIds: ["user-bob"],
    });

    expect(rows.map((r) => r.userId).sort()).toEqual([
      "user-alice",
      "user-carol",
    ]);
  });

  it("returns an empty list, and writes nothing, when the filters leave no one", async () => {
    const rows = await notifyOrg({
      ...basePayload,
      organizationId: ORG,
      roles: ["viewer"],
    });

    expect(rows).toEqual([]);
    expect(rowsFor(harness, "notification")).toHaveLength(0);
  });

  it("returns an empty list when the organization has no members", async () => {
    const rows = await notifyOrg({
      ...basePayload,
      organizationId: "org-empty",
    });

    expect(rows).toEqual([]);
    expect(rowsFor(harness, "notification")).toHaveLength(0);
  });

  it("propagates other errors instead of swallowing them", async () => {
    await expect(
      notifyOrg({
        ...basePayload,
        type: "notifications.reserved",
        organizationId: ORG,
      })
    ).rejects.toMatchObject({ body: { code: "RESERVED_NOTIFICATION_TYPE" } });
  });

  it("propagates the fan-out limit rather than truncating silently", async () => {
    wire({ ...notificationsOptions, maxFanout: 2 });
    await seedOrg(harness, ORG, {
      "user-alice": "owner",
      "user-bob": "admin",
      "user-carol": "member",
    });

    await expect(
      notifyOrg({ ...basePayload, organizationId: ORG })
    ).rejects.toMatchObject({ body: { code: "FAN_OUT_LIMIT_EXCEEDED" } });
    expect(rowsFor(harness, "notification")).toHaveLength(0);
  });
});
