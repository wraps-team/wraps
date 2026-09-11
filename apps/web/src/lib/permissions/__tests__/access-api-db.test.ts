/**
 * DAC access-statement module — cross-org isolation (real DB).
 *
 * access-api.ts has zero callers anywhere in the codebase today, so no
 * coverage of it existed before this file. `statement.organizationId` was
 * nullable and none of the three functions threaded an org id through —
 * `revokeAccessStatement`'s two delete branches and `checkAccessStatement`'s
 * lookup matched on (userId, action, resource) alone, so a statement in one
 * org was reachable — readable or deletable — by another org holding the
 * same (userId, action, resource) tuple. `organizationId` is now `.notNull()`
 * on the schema and threaded through all three functions; this file proves
 * the isolation, not just that the calls succeed.
 *
 * Same user (`sharedUserId`) is deliberately a plausible member of both orgs
 * here — that is the realistic IDOR shape, not an edge case.
 */

import { db, eq, organization, statement, user } from "@wraps/db";
import { and } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  checkAccessStatement,
  createAccessStatement,
  revokeAccessStatement,
} from "../access-api";

const PREFIX = "access-api-db";

const sharedUserId = `${PREFIX}-user`;
const orgAId = `${PREFIX}-org-a`;
const orgBId = `${PREFIX}-org-b`;

const RESOURCE = "aws-account:shared-acc";
const ACTION = "aws-account:read";

async function insertStatementRow(overrides: {
  id: string;
  organizationId: string;
  action: string;
  effect?: "allow" | "deny";
  resource?: string;
}) {
  const now = new Date();
  await db.insert(statement).values({
    id: overrides.id,
    userId: sharedUserId,
    organizationId: overrides.organizationId,
    effect: overrides.effect ?? "allow",
    action: overrides.action,
    resource: overrides.resource ?? RESOURCE,
    createdAt: now,
    updatedAt: now,
  });
}

async function getStatement(id: string) {
  const [row] = await db.select().from(statement).where(eq(statement.id, id));
  return row;
}

describe("access-api.ts DAC module — cross-org isolation", () => {
  beforeAll(async () => {
    const now = new Date();
    await db.insert(user).values({
      id: sharedUserId,
      name: "Shared User",
      email: `${PREFIX}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(organization).values([
      { id: orgAId, name: "Org A", slug: `${PREFIX}-org-a`, createdAt: now },
      { id: orgBId, name: "Org B", slug: `${PREFIX}-org-b`, createdAt: now },
    ]);
  });

  beforeEach(async () => {
    await db.delete(statement).where(eq(statement.userId, sharedUserId));
  });

  afterAll(async () => {
    await db.delete(statement).where(eq(statement.userId, sharedUserId));
    await db.delete(organization).where(eq(organization.id, orgAId));
    await db.delete(organization).where(eq(organization.id, orgBId));
    await db.delete(user).where(eq(user.id, sharedUserId));
  });

  it("revokeAccessStatement (exact-action branch) does not delete another org's statement", async () => {
    const orgBStatementId = `${PREFIX}-exact-orgb`;
    await insertStatementRow({
      id: orgBStatementId,
      organizationId: orgBId,
      action: ACTION,
    });

    await revokeAccessStatement({
      userId: sharedUserId,
      organizationId: orgAId,
      action: ACTION,
      resource: RESOURCE,
    });

    const row = await getStatement(orgBStatementId);
    expect(row).toBeDefined();
    expect(row?.organizationId).toBe(orgBId);
  });

  it("revokeAccessStatement (wildcard branch) does not delete another org's matching statements", async () => {
    const orgBStatementId = `${PREFIX}-wildcard-orgb`;
    await insertStatementRow({
      id: orgBStatementId,
      organizationId: orgBId,
      action: ACTION,
    });

    await revokeAccessStatement({
      userId: sharedUserId,
      organizationId: orgAId,
      action: "aws-account:*",
      resource: RESOURCE,
    });

    const row = await getStatement(orgBStatementId);
    expect(row).toBeDefined();
    expect(row?.organizationId).toBe(orgBId);
  });

  it("checkAccessStatement returns false for a statement belonging to a different org", async () => {
    const orgBStatementId = `${PREFIX}-check-orgb`;
    await insertStatementRow({
      id: orgBStatementId,
      organizationId: orgBId,
      action: ACTION,
      effect: "allow",
    });

    const allowedInOrgA = await checkAccessStatement({
      userId: sharedUserId,
      organizationId: orgAId,
      action: ACTION,
      resource: RESOURCE,
    });
    expect(allowedInOrgA).toBe(false);

    const allowedInOrgB = await checkAccessStatement({
      userId: sharedUserId,
      organizationId: orgBId,
      action: ACTION,
      resource: RESOURCE,
    });
    expect(allowedInOrgB).toBe(true);
  });

  it("createAccessStatement persists the organizationId it was given", async () => {
    const createdId = `${PREFIX}-create-orga`;
    await createAccessStatement({
      userId: sharedUserId,
      organizationId: orgAId,
      effect: "allow",
      action: ACTION,
      resource: RESOURCE,
    });

    const rows = await db
      .select()
      .from(statement)
      .where(
        and(eq(statement.userId, sharedUserId), eq(statement.action, ACTION))
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.organizationId).toBe(orgAId);
  });
});
