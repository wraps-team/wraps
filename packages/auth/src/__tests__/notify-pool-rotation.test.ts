/**
 * `closeDbConnection()` ends the pool and reassigns the exported `db`. The
 * memoized notifications instance has to follow it: one built before the
 * rotation still holds the ended pool ("Cannot use a pool after calling end on
 * the pool"), which silently dropped message-send-cleanup's retention warnings
 * on a warm Lambda. No database: `@wraps/db` and the instance are stubbed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  db: { name: "db-1" } as { name: string },
  created: [] as Array<{ db: { name: string } }>,
}));

vi.mock("@wraps/db", () => ({
  get db() {
    return state.db;
  },
}));

vi.mock("../notifications", () => ({
  createNotificationsAuth: vi.fn(() => {
    const instance = { db: state.db };
    state.created.push(instance);
    return {
      api: {
        notify: vi.fn(async () => ({
          count: 1,
          notifications: [{ id: "n1" }],
        })),
      },
    };
  }),
}));

describe("notify.ts across a pool rotation", () => {
  beforeEach(() => {
    vi.resetModules();
    state.db = { name: "db-1" };
    state.created = [];
  });

  it("reuses one instance while db is unchanged", async () => {
    const { notifyUser } = await import("../notify");
    const params = { userId: "u1", type: "t", title: "x" };
    await notifyUser(params);
    await notifyUser(params);
    expect(state.created).toHaveLength(1);
  });

  it("builds a new instance once closeDbConnection has swapped db", async () => {
    const { notifyUser } = await import("../notify");
    const params = { userId: "u1", type: "t", title: "x" };
    await notifyUser(params);

    state.db = { name: "db-2" };
    await notifyUser(params);

    expect(state.created.map((c) => c.db.name)).toEqual(["db-1", "db-2"]);
  });
});
