/**
 * Classifying `contact_topic` primary-key collisions (real DB)
 *
 * A repeated topic in one request used to reach the INSERT as two identical
 * rows and fail on the composite primary key. The repeat is gone, but the
 * collision is still reachable under concurrency: two requests subscribing a
 * contact to the same topic race between reading existing subscriptions and
 * writing. Callers need to tell that apart from an unknown failure so they can
 * answer 409 rather than a bare 500.
 *
 * The constraint is named by Drizzle, not Postgres — `contact_topic_pkey` is
 * the wrong guess and would make the classifier silently never match. These
 * tests provoke a genuine violation rather than hand-building the error shape,
 * so a rename in a future migration fails here instead of in production.
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import {
  contactUniqueViolationField,
  isContactTopicConflict,
} from "../repositories/contacts";
import { contact, contactTopic, organization, topic } from "../schema";

const suffix = crypto.randomUUID().slice(0, 8);

const orgId = `repo-ct-conflict-org-${suffix}`;
const contactId = crypto.randomUUID();
const topicId = crypto.randomUUID();

describe("Repository: contacts — contact_topic conflict classification", () => {
  beforeAll(async () => {
    await db
      .insert(organization)
      .values({
        id: orgId,
        name: "Contact Topic Conflict Org",
        slug: `ct-conflict-${suffix}`,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(contact)
      .values({
        id: contactId,
        organizationId: orgId,
        email: `ct-conflict-${suffix}@example.com`,
        emailHash: `ct-conflict-hash-${suffix}`,
      })
      .onConflictDoNothing();

    await db
      .insert(topic)
      .values({
        id: topicId,
        organizationId: orgId,
        name: "Conflict Topic",
        slug: `ct-conflict-topic-${suffix}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(contactTopic)
      .values({ contactId, topicId, status: "subscribed" })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(contact).where(eq(contact.id, contactId));
    await db.delete(topic).where(eq(topic.id, topicId));
    await db.delete(organization).where(eq(organization.id, orgId));
  });

  it("classifies a duplicate subscription as a contact_topic conflict", async () => {
    const duplicate = db
      .insert(contactTopic)
      .values({ contactId, topicId, status: "subscribed" });

    const error = await duplicate.then(
      () => null,
      (err: unknown) => err
    );

    expect(error).not.toBeNull();
    expect(isContactTopicConflict(error)).toBe(true);
  });

  it("does not classify a contact uniqueness violation as a topic conflict", async () => {
    // Both are 23505. The classifier must key on the constraint, not the code,
    // or a duplicate email would be reported as a duplicate subscription.
    const duplicate = db.insert(contact).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      email: `ct-conflict-${suffix}@example.com`,
      emailHash: `ct-conflict-hash-${suffix}`,
    });

    const error = await duplicate.then(
      () => null,
      (err: unknown) => err
    );

    expect(error).not.toBeNull();
    expect(contactUniqueViolationField(error)).toBe("email");
    expect(isContactTopicConflict(error)).toBe(false);
  });

  it("does not classify unrelated errors as a topic conflict", () => {
    expect(isContactTopicConflict(new Error("boom"))).toBe(false);
    expect(isContactTopicConflict(null)).toBe(false);
    expect(isContactTopicConflict(undefined)).toBe(false);
    // Foreign-key violation, not a uniqueness one.
    expect(
      isContactTopicConflict({ code: "23503", constraint: "some_fk" })
    ).toBe(false);
  });
});
