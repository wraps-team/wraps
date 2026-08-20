/**
 * Segment filter — real-DB behavioral tests for list operators.
 *
 * Guards the node-postgres array-binding fix in segment-filter.ts /
 * segment-evaluator.ts: `= ANY(${jsArray})` expanded to `ANY(($1,$2))` and threw
 * SQLSTATE 42809. The fix binds the array as a single param via `sql.param(...)`
 * (filter list operators) / `inArray(...)` (the id pre-filter). These tests run
 * the real SQL against Neon, so a reversion to the bare-array form fails here.
 */

import {
  contact,
  contactIdsMatchingCondition,
  db,
  eq,
  type FilterCondition,
} from "@wraps/db";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type BaseOrgFixture,
  cleanupBaseOrg,
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";

const TEST_PREFIX = "segment-filter-db";

const cId = {
  gold: `${TEST_PREFIX}-c-gold`,
  silver: `${TEST_PREFIX}-c-silver`,
  bronze: `${TEST_PREFIX}-c-bronze`,
};

/** Single-filter condition helper. */
function condition(
  field: string,
  operator: string,
  value: unknown
): FilterCondition {
  return {
    logic: "AND",
    groups: [{ filters: [{ field, operator: operator as never, value }] }],
  };
}

describe("contactIdsMatchingCondition — list operators (real DB)", () => {
  let fx: BaseOrgFixture;
  let allIds: string[];

  beforeAll(async () => {
    fx = await seedBaseOrg(TEST_PREFIX);
    const now = new Date();
    await db
      .insert(contact)
      .values([
        {
          id: cId.gold,
          organizationId: fx.ids.org,
          email: `${TEST_PREFIX}-gold@example.com`,
          emailHash: `${TEST_PREFIX}-h-gold`,
          emailStatus: "active",
          status: "active",
          properties: { tier: "gold" },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: cId.silver,
          organizationId: fx.ids.org,
          email: `${TEST_PREFIX}-silver@example.com`,
          emailHash: `${TEST_PREFIX}-h-silver`,
          emailStatus: "active",
          status: "active",
          properties: { tier: "silver" },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: cId.bronze,
          organizationId: fx.ids.org,
          email: `${TEST_PREFIX}-bronze@example.com`,
          emailHash: `${TEST_PREFIX}-h-bronze`,
          emailStatus: "unsubscribed",
          status: "unsubscribed",
          properties: { tier: "bronze" },
          createdAt: now,
          updatedAt: now,
        },
      ] as (typeof contact.$inferInsert)[])
      .onConflictDoNothing();
    allIds = [cId.gold, cId.silver, cId.bronze];
  });

  afterAll(async () => {
    await db.delete(contact).where(inArray(contact.id, allIds));
    await cleanupBaseOrg(TEST_PREFIX);
  });

  it("inList on a JSON property returns the matching subset", async () => {
    const matched = await contactIdsMatchingCondition(
      db,
      allIds,
      fx.ids.org,
      condition("properties.tier", "inList", ["gold", "silver"])
    );
    expect(matched.sort()).toEqual([cId.gold, cId.silver].sort());
  });

  it("notInList on a JSON property excludes the listed values", async () => {
    const matched = await contactIdsMatchingCondition(
      db,
      allIds,
      fx.ids.org,
      condition("properties.tier", "notInList", ["gold"])
    );
    expect(matched.sort()).toEqual([cId.silver, cId.bronze].sort());
  });

  it("inList on a mapped column returns the matching subset", async () => {
    const matched = await contactIdsMatchingCondition(
      db,
      allIds,
      fx.ids.org,
      condition("status", "inList", ["unsubscribed"])
    );
    expect(matched).toEqual([cId.bronze]);
  });

  it("notInList on a mapped column excludes the listed values", async () => {
    const matched = await contactIdsMatchingCondition(
      db,
      allIds,
      fx.ids.org,
      condition("status", "notInList", ["unsubscribed"])
    );
    expect(matched.sort()).toEqual([cId.gold, cId.silver].sort());
  });

  it("inList with a single value still binds as an array param", async () => {
    const matched = await contactIdsMatchingCondition(
      db,
      allIds,
      fx.ids.org,
      condition("properties.tier", "inList", ["bronze"])
    );
    expect(matched).toEqual([cId.bronze]);
  });
});
