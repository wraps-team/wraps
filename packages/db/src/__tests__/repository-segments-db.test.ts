import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import {
  deleteSegmentRow,
  findSegment,
  insertSegment,
  listContactPropertyKeys,
  listSegmentsForOrg,
  updateSegmentFields,
} from "../repositories/segments";
import { contact, organization, segment } from "../schema";
import type { FilterCondition } from "../schema/segments";

const suffix = crypto.randomUUID().slice(0, 8);

const orgA = `repo-segments-org-a-${suffix}`;
const orgB = `repo-segments-org-b-${suffix}`;

const condition: FilterCondition = {
  logic: "AND",
  groups: [
    {
      filters: [{ field: "status", operator: "equals", value: "active" }],
    },
  ],
};

describe("Repository: segments — org scoping", () => {
  beforeAll(async () => {
    await db
      .insert(organization)
      .values([
        {
          id: orgA,
          name: "Repo Segments Org A",
          slug: `repo-segments-a-${suffix}`,
          createdAt: new Date(),
        },
        {
          id: orgB,
          name: "Repo Segments Org B",
          slug: `repo-segments-b-${suffix}`,
          createdAt: new Date(),
        },
      ])
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(segment).where(eq(segment.organizationId, orgA));
    await db.delete(segment).where(eq(segment.organizationId, orgB));
    await db.delete(contact).where(eq(contact.organizationId, orgA));
    await db.delete(contact).where(eq(contact.organizationId, orgB));
    await db.delete(organization).where(eq(organization.id, orgA));
    await db.delete(organization).where(eq(organization.id, orgB));
  });

  describe("listSegmentsForOrg", () => {
    it("never returns another organization's segments", async () => {
      const a = await insertSegment({
        organizationId: orgA,
        name: "Org A Segment",
        condition,
      });
      const b = await insertSegment({
        organizationId: orgB,
        name: "Org B Segment",
        condition,
      });

      const resultA = await listSegmentsForOrg(orgA);
      expect(resultA.segments.map((s) => s.id)).toContain(a.id);
      expect(resultA.segments.map((s) => s.id)).not.toContain(b.id);

      const resultB = await listSegmentsForOrg(orgB);
      expect(resultB.segments.map((s) => s.id)).toContain(b.id);
      expect(resultB.segments.map((s) => s.id)).not.toContain(a.id);

      await deleteSegmentRow(a.id, orgA);
      await deleteSegmentRow(b.id, orgB);
    });
  });

  describe("findSegment", () => {
    it("does not find another organization's segment", async () => {
      const created = await insertSegment({
        organizationId: orgA,
        name: "Find Me Only In Org A",
        condition,
      });

      expect(await findSegment(created.id, orgB)).toBeNull();
      expect((await findSegment(created.id, orgA))?.id).toBe(created.id);

      await deleteSegmentRow(created.id, orgA);
    });
  });

  describe("insertSegment", () => {
    it("scopes the new row to the organization it was created for", async () => {
      const created = await insertSegment({
        organizationId: orgA,
        name: "Scoped On Insert",
        condition,
      });

      expect(created.organizationId).toBe(orgA);
      expect(await findSegment(created.id, orgB)).toBeNull();

      await deleteSegmentRow(created.id, orgA);
    });
  });

  describe("updateSegmentFields", () => {
    it("does not update another organization's segment", async () => {
      const created = await insertSegment({
        organizationId: orgA,
        name: "Original Name",
        condition,
      });

      const result = await updateSegmentFields(created.id, orgB, {
        name: "Hijacked",
      });
      expect(result).toBeNull();

      const unchanged = await findSegment(created.id, orgA);
      expect(unchanged?.name).toBe("Original Name");

      await deleteSegmentRow(created.id, orgA);
    });

    it("updates the row when scoped to the owning organization", async () => {
      const created = await insertSegment({
        organizationId: orgA,
        name: "Before Update",
        condition,
      });

      const result = await updateSegmentFields(created.id, orgA, {
        name: "After Update",
      });
      expect(result?.name).toBe("After Update");

      await deleteSegmentRow(created.id, orgA);
    });
  });

  describe("deleteSegmentRow", () => {
    it("does not delete another organization's segment", async () => {
      const created = await insertSegment({
        organizationId: orgA,
        name: "Do Not Delete Me",
        condition,
      });

      const deleted = await deleteSegmentRow(created.id, orgB);
      expect(deleted).toBe(false);

      expect(await findSegment(created.id, orgA)).not.toBeNull();

      await deleteSegmentRow(created.id, orgA);
    });

    it("deletes the row when scoped to the owning organization", async () => {
      const created = await insertSegment({
        organizationId: orgA,
        name: "Delete Me",
        condition,
      });

      const deleted = await deleteSegmentRow(created.id, orgA);
      expect(deleted).toBe(true);
      expect(await findSegment(created.id, orgA)).toBeNull();
    });
  });

  describe("listContactPropertyKeys", () => {
    it("does not return another organization's property keys", async () => {
      await db.insert(contact).values([
        {
          id: crypto.randomUUID(),
          organizationId: orgA,
          properties: { onlyInOrgA: "yes" },
        },
        {
          id: crypto.randomUUID(),
          organizationId: orgB,
          properties: { onlyInOrgB: "yes" },
        },
      ]);

      const keysA = await listContactPropertyKeys(orgA);
      expect(keysA).toContain("onlyInOrgA");
      expect(keysA).not.toContain("onlyInOrgB");

      const keysB = await listContactPropertyKeys(orgB);
      expect(keysB).toContain("onlyInOrgB");
      expect(keysB).not.toContain("onlyInOrgA");
    });
  });
});
