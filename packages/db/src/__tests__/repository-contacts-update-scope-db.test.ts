import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../index";
import { updateContactFields } from "../repositories/contacts";
import { contact, organization } from "../schema";

const suffix = crypto.randomUUID().slice(0, 8);
const orgA = `repo-contact-upd-orgA-${suffix}`;
const orgB = `repo-contact-upd-orgB-${suffix}`;
const cA = `repo-contact-upd-cA-${suffix}`;
const cA2 = `repo-contact-upd-cA2-${suffix}`;
const cB = `repo-contact-upd-cB-${suffix}`;

const seedRows = [
  { id: cA, organizationId: orgA, key: "a" },
  { id: cA2, organizationId: orgA, key: "a2" },
  { id: cB, organizationId: orgB, key: "b" },
].map(({ id, organizationId, key }) => ({
  id,
  organizationId,
  email: `${key}-${suffix}@example.com`,
  emailHash: `upd-${key}-hash-${suffix}`,
  firstName: "Original",
}));

const readContact = async (id: string) => {
  const [row] = await db.select().from(contact).where(eq(contact.id, id));
  return row;
};

describe("Repository: updateContactFields org scope", () => {
  beforeAll(async () => {
    await db
      .insert(organization)
      .values([
        {
          id: orgA,
          name: "Contact Update Org A",
          slug: `contact-upd-a-${suffix}`,
          createdAt: new Date(),
        },
        {
          id: orgB,
          name: "Contact Update Org B",
          slug: `contact-upd-b-${suffix}`,
          createdAt: new Date(),
        },
      ])
      .onConflictDoNothing();
    await db.insert(contact).values(seedRows).onConflictDoNothing();
  });

  beforeEach(async () => {
    for (const id of [cA, cA2, cB]) {
      await db
        .update(contact)
        .set({ firstName: "Original" })
        .where(eq(contact.id, id));
    }
  });

  afterAll(async () => {
    await db.delete(contact).where(eq(contact.organizationId, orgA));
    await db.delete(contact).where(eq(contact.organizationId, orgB));
    await db.delete(organization).where(eq(organization.id, orgA));
    await db.delete(organization).where(eq(organization.id, orgB));
  });

  it("updateContactFields with another org's id changes nothing", async () => {
    const result = await updateContactFields(cB, orgA, {
      firstName: "Hijacked",
    });

    expect(result).toBeUndefined();
    const row = await readContact(cB);
    expect(row?.firstName).toBe("Original");
    expect(row?.organizationId).toBe(orgB);
  });

  it("updateContactFields updates only the named contact in the caller's org", async () => {
    const result = await updateContactFields(cA, orgA, {
      firstName: "Updated",
    });

    expect(result.id).toBe(cA);
    expect(result.firstName).toBe("Updated");
    expect((await readContact(cA2))?.firstName).toBe("Original");
    expect((await readContact(cB))?.firstName).toBe("Original");
  });
});
