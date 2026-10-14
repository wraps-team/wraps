import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import { claimFirstEmailMilestone } from "../repositories/activation-milestones";
import { organizationExtension } from "../schema/app";
import { organization } from "../schema/auth";

const suffix = crypto.randomUUID().slice(0, 8);

const orgNoRow = `repo-actm-norow-${suffix}`;
const orgNullRow = `repo-actm-null-${suffix}`;
const orgClaimed = `repo-actm-claimed-${suffix}`;
const orgConcurrent = `repo-actm-conc-${suffix}`;
const allOrgIds = [orgNoRow, orgNullRow, orgClaimed, orgConcurrent];

const claimedAt = new Date("2026-01-01T00:00:00Z");

async function trackedAt(orgId: string) {
  const [row] = await db
    .select({ trackedAt: organizationExtension.activationFirstEmailTrackedAt })
    .from(organizationExtension)
    .where(eq(organizationExtension.organizationId, orgId));
  return row?.trackedAt;
}

describe("Repository: activation milestones", () => {
  beforeAll(async () => {
    await db
      .insert(organization)
      .values(
        allOrgIds.map((id) => ({
          id,
          name: `Activation Milestone Test ${id}`,
          slug: `${id}-slug`,
          createdAt: new Date(),
        }))
      )
      .onConflictDoNothing();

    await db
      .insert(organizationExtension)
      .values([
        { organizationId: orgNullRow },
        {
          organizationId: orgClaimed,
          activationFirstEmailTrackedAt: claimedAt,
        },
      ])
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db
      .delete(organizationExtension)
      .where(inArray(organizationExtension.organizationId, allOrgIds));
    await db.delete(organization).where(inArray(organization.id, allOrgIds));
  });

  it("claims once when the org has no extension row", async () => {
    expect(await claimFirstEmailMilestone(orgNoRow)).toBe(true);
    expect(await claimFirstEmailMilestone(orgNoRow)).toBe(false);
    expect(await trackedAt(orgNoRow)).toBeInstanceOf(Date);
  });

  it("claims when the extension row exists with a null timestamp", async () => {
    expect(await claimFirstEmailMilestone(orgNullRow)).toBe(true);
  });

  it("does not claim an already-claimed org and keeps the stored timestamp", async () => {
    expect(await claimFirstEmailMilestone(orgClaimed)).toBe(false);
    expect((await trackedAt(orgClaimed))?.toISOString()).toBe(
      "2026-01-01T00:00:00.000Z"
    );
  });

  it("lets exactly one of several concurrent first-fires win", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => claimFirstEmailMilestone(orgConcurrent))
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
