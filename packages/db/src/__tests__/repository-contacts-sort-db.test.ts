import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import { listContactsWithRelations } from "../repositories/contacts";
import { contact, organization } from "../schema";

const suffix = crypto.randomUUID().slice(0, 8);
const orgId = `repo-contact-sort-org-${suffix}`;

// All four contacts share one createdAt timestamp on purpose — this is the
// tie F25 flags as latent in production (zero ties today, but nothing stops
// concurrent inserts from producing one). Without an `id` tiebreaker, OFFSET
// pagination over a tied column can skip or repeat rows across pages.
const tiedCreatedAt = new Date("2026-01-01T00:00:00.000Z");

const contacts = [
  {
    id: crypto.randomUUID(),
    organizationId: orgId,
    email: `charlie-${suffix}@example.com`,
    emailHash: `charlie-hash-${suffix}`,
    emailsSent: 30,
    createdAt: tiedCreatedAt,
  },
  {
    id: crypto.randomUUID(),
    organizationId: orgId,
    email: `alice-${suffix}@example.com`,
    emailHash: `alice-hash-${suffix}`,
    emailsSent: 10,
    createdAt: tiedCreatedAt,
  },
  {
    id: crypto.randomUUID(),
    organizationId: orgId,
    email: `bravo-${suffix}@example.com`,
    emailHash: `bravo-hash-${suffix}`,
    emailsSent: 20,
    createdAt: tiedCreatedAt,
  },
  {
    id: crypto.randomUUID(),
    organizationId: orgId,
    email: `delta-${suffix}@example.com`,
    emailHash: `delta-hash-${suffix}`,
    emailsSent: 40,
    createdAt: tiedCreatedAt,
  },
];

describe("Repository: contacts — listContactsWithRelations sort + tiebreaker", () => {
  beforeAll(async () => {
    await db
      .insert(organization)
      .values({
        id: orgId,
        name: "Contact Sort Org",
        slug: `contact-sort-${suffix}`,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    await db.insert(contact).values(contacts).onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(contact).where(eq(contact.organizationId, orgId));
    await db.delete(organization).where(eq(organization.id, orgId));
  });

  it("defaults to createdAt desc when no sort is given, unchanged from before", async () => {
    const { contacts: rows } = await listContactsWithRelations(
      orgId,
      {},
      { page: 1, pageSize: 10 }
    );
    expect(rows).toHaveLength(4);
  });

  it("sorts by email ascending", async () => {
    const { contacts: rows } = await listContactsWithRelations(
      orgId,
      {},
      { page: 1, pageSize: 10 },
      undefined,
      { field: "email", direction: "asc" }
    );
    expect(rows.map((r) => r.email)).toEqual([
      `alice-${suffix}@example.com`,
      `bravo-${suffix}@example.com`,
      `charlie-${suffix}@example.com`,
      `delta-${suffix}@example.com`,
    ]);
  });

  it("sorts by email descending", async () => {
    const { contacts: rows } = await listContactsWithRelations(
      orgId,
      {},
      { page: 1, pageSize: 10 },
      undefined,
      { field: "email", direction: "desc" }
    );
    expect(rows.map((r) => r.email)).toEqual([
      `delta-${suffix}@example.com`,
      `charlie-${suffix}@example.com`,
      `bravo-${suffix}@example.com`,
      `alice-${suffix}@example.com`,
    ]);
  });

  it("sorts by emailsSent", async () => {
    const { contacts: rows } = await listContactsWithRelations(
      orgId,
      {},
      { page: 1, pageSize: 10 },
      undefined,
      { field: "emailsSent", direction: "asc" }
    );
    expect(rows.map((r) => r.emailsSent)).toEqual([10, 20, 30, 40]);
  });

  it("falls back to createdAt desc for an unrecognized sort field instead of throwing", async () => {
    const { contacts: rows } = await listContactsWithRelations(
      orgId,
      {},
      { page: 1, pageSize: 10 },
      undefined,
      // biome-ignore lint/suspicious/noExplicitAny: exercising the runtime guard against an unknown field
      { field: "notARealColumn" as any, direction: "asc" }
    );
    expect(rows).toHaveLength(4);
  });

  it("appends an id tiebreaker so paginating over tied createdAt values never skips or repeats a row", async () => {
    const pageSize = 1;
    const seen = new Set<string>();
    for (let page = 1; page <= contacts.length; page++) {
      const { contacts: rows } = await listContactsWithRelations(
        orgId,
        {},
        { page, pageSize }
      );
      expect(rows).toHaveLength(1);
      const id = rows[0]?.id;
      expect(id).toBeDefined();
      const definiteId = id as string;
      expect(seen.has(definiteId)).toBe(false); // no repeat across page boundaries
      seen.add(definiteId);
    }
    expect(seen.size).toBe(contacts.length); // no skip either
  });

  it("appends an id tiebreaker on a custom sort field too", async () => {
    // All four contacts have distinct emailsSent, so this only proves the
    // tiebreaker doesn't corrupt a well-ordered sort — the no-skip/no-repeat
    // case is covered on createdAt above, where the tie actually exists.
    const seen = new Set<string>();
    for (let page = 1; page <= contacts.length; page++) {
      const { contacts: rows } = await listContactsWithRelations(
        orgId,
        {},
        { page, pageSize: 1 },
        undefined,
        { field: "emailsSent", direction: "desc" }
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBeDefined();
      seen.add((rows[0]?.id as string) ?? "");
    }
    expect(seen.size).toBe(contacts.length);
  });
});
