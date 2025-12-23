/**
 * Contacts Routes
 *
 * CRUD operations for managing contacts.
 *
 * GET /v1/contacts - List contacts with pagination
 * GET /v1/contacts/:id - Get a single contact
 * POST /v1/contacts - Create a new contact
 * PATCH /v1/contacts/:id - Update a contact
 * DELETE /v1/contacts/:id - Delete a contact
 * DELETE /v1/contacts - Bulk delete contacts
 */

import { createHash } from "node:crypto";
import {
  contact,
  contactTopic,
  db,
  type EmailStatus,
  eq,
  type SmsStatus,
  topic,
} from "@wraps/db";
import { and, desc, inArray, or, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { type AuthContext, authMiddleware } from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rate-limit";

// Schemas
const contactSchema = t.Object({
  id: t.String(),
  email: t.Nullable(t.String()),
  phone: t.Nullable(t.String()),
  emailStatus: t.Nullable(t.String()),
  smsStatus: t.Nullable(t.String()),
  properties: t.Record(t.String(), t.Unknown()),
  emailsSent: t.Number(),
  emailsOpened: t.Number(),
  emailsClicked: t.Number(),
  smsSent: t.Number(),
  smsClicked: t.Number(),
  createdAt: t.String(),
  updatedAt: t.String(),
});

const createContactSchema = t.Object({
  email: t.Optional(t.String()),
  phone: t.Optional(t.String()),
  emailStatus: t.Optional(
    t.Union([
      t.Literal("active"),
      t.Literal("unsubscribed"),
      t.Literal("bounced"),
      t.Literal("complained"),
    ])
  ),
  smsStatus: t.Optional(
    t.Union([
      t.Literal("pending_consent"),
      t.Literal("opted_in"),
      t.Literal("opted_out"),
      t.Literal("invalid"),
    ])
  ),
  properties: t.Optional(t.Record(t.String(), t.Unknown())),
  topicIds: t.Optional(t.Array(t.String())),
});

const updateContactSchema = t.Object({
  email: t.Optional(t.String()),
  phone: t.Optional(t.String()),
  emailStatus: t.Optional(
    t.Union([
      t.Literal("active"),
      t.Literal("unsubscribed"),
      t.Literal("bounced"),
      t.Literal("complained"),
    ])
  ),
  smsStatus: t.Optional(
    t.Union([
      t.Literal("pending_consent"),
      t.Literal("opted_in"),
      t.Literal("opted_out"),
      t.Literal("invalid"),
    ])
  ),
  properties: t.Optional(t.Record(t.String(), t.Unknown())),
  topicIds: t.Optional(t.Array(t.String())),
});

const listContactsQuerySchema = t.Object({
  page: t.Optional(t.String()),
  pageSize: t.Optional(t.String()),
  emailStatus: t.Optional(t.String()),
  smsStatus: t.Optional(t.String()),
  search: t.Optional(t.String()),
});

// Helpers
function hashValue(value: string): string {
  return createHash("sha256").update(value.toLowerCase().trim()).digest("hex");
}

export const contactsRoutes = new Elysia({ prefix: "/v1/contacts" })
  .use(authMiddleware)
  .use(rateLimitMiddleware)
  // List contacts
  .get(
    "/",
    async (ctx) => {
      const { query } = ctx;
      const authContext = (ctx as unknown as { auth: AuthContext }).auth;

      const page = Number.parseInt(query.page || "1", 10);
      const pageSize = Math.min(
        Number.parseInt(query.pageSize || "50", 10),
        100
      );
      const offset = (page - 1) * pageSize;

      // Build conditions
      const conditions = [
        eq(contact.organizationId, authContext.organizationId),
      ];

      if (query.emailStatus) {
        conditions.push(
          eq(contact.emailStatus, query.emailStatus as EmailStatus)
        );
      }

      if (query.smsStatus) {
        conditions.push(eq(contact.smsStatus, query.smsStatus as SmsStatus));
      }

      if (query.search) {
        const search = `%${query.search}%`;
        conditions.push(
          or(
            sql`${contact.email} ILIKE ${search}`,
            sql`${contact.phone} ILIKE ${search}`
          )!
        );
      }

      // Get total count
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(contact)
        .where(and(...conditions));

      const total = countResult?.count ?? 0;

      // Get contacts
      const contacts = await db
        .select({
          id: contact.id,
          email: contact.email,
          phone: contact.phone,
          emailStatus: contact.emailStatus,
          smsStatus: contact.smsStatus,
          properties: contact.properties,
          emailsSent: contact.emailsSent,
          emailsOpened: contact.emailsOpened,
          emailsClicked: contact.emailsClicked,
          smsSent: contact.smsSent,
          smsClicked: contact.smsClicked,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
        })
        .from(contact)
        .where(and(...conditions))
        .orderBy(desc(contact.createdAt))
        .limit(pageSize)
        .offset(offset);

      return {
        contacts: contacts.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    },
    {
      query: listContactsQuerySchema,
      detail: {
        tags: ["contacts"],
        summary: "List contacts",
        description: "Lists contacts with pagination and filtering",
      },
    }
  )
  // Get single contact
  .get(
    "/:id",
    async (ctx) => {
      const { params } = ctx;
      const authContext = (ctx as unknown as { auth: AuthContext }).auth;

      const [result] = await db
        .select()
        .from(contact)
        .where(
          and(
            eq(contact.id, params.id),
            eq(contact.organizationId, authContext.organizationId)
          )
        )
        .limit(1);

      if (!result) {
        ctx.set.status = 404;
        return { error: "Contact not found" };
      }

      // Get topics
      const topics = await db
        .select({
          topicId: contactTopic.topicId,
          topicName: topic.name,
          status: contactTopic.status,
          subscribedAt: contactTopic.subscribedAt,
        })
        .from(contactTopic)
        .innerJoin(topic, eq(topic.id, contactTopic.topicId))
        .where(eq(contactTopic.contactId, params.id));

      return {
        id: result.id,
        email: result.email,
        phone: result.phone,
        emailStatus: result.emailStatus,
        smsStatus: result.smsStatus,
        properties: result.properties,
        emailsSent: result.emailsSent,
        emailsOpened: result.emailsOpened,
        emailsClicked: result.emailsClicked,
        smsSent: result.smsSent,
        smsClicked: result.smsClicked,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
        topics: topics.map((t) => ({
          ...t,
          subscribedAt: t.subscribedAt?.toISOString() ?? null,
        })),
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ["contacts"],
        summary: "Get contact",
        description: "Returns a single contact by ID with topic subscriptions",
      },
    }
  )
  // Create contact
  .post(
    "/",
    async (ctx) => {
      const { body } = ctx;
      const authContext = (ctx as unknown as { auth: AuthContext }).auth;

      // Must have email or phone
      if (!(body.email || body.phone)) {
        ctx.set.status = 400;
        return { error: "Email or phone is required" };
      }

      // Check for duplicates
      if (body.email) {
        const emailHash = hashValue(body.email);
        const existing = await db
          .select({ id: contact.id })
          .from(contact)
          .where(
            and(
              eq(contact.organizationId, authContext.organizationId),
              eq(contact.emailHash, emailHash)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          ctx.set.status = 409;
          return { error: "Contact with this email already exists" };
        }
      }

      if (body.phone) {
        const phoneHash = hashValue(body.phone);
        const existing = await db
          .select({ id: contact.id })
          .from(contact)
          .where(
            and(
              eq(contact.organizationId, authContext.organizationId),
              eq(contact.phoneHash, phoneHash)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          ctx.set.status = 409;
          return { error: "Contact with this phone already exists" };
        }
      }

      // Create contact
      const [newContact] = await db
        .insert(contact)
        .values({
          organizationId: authContext.organizationId,
          email: body.email,
          emailHash: body.email ? hashValue(body.email) : null,
          emailStatus: body.emailStatus ?? (body.email ? "active" : null),
          phone: body.phone,
          phoneHash: body.phone ? hashValue(body.phone) : null,
          smsStatus: body.smsStatus ?? (body.phone ? "pending_consent" : null),
          properties: body.properties ?? {},
          createdBy: authContext.userId,
        })
        .returning();

      // Add to topics if specified
      if (body.topicIds && body.topicIds.length > 0) {
        await db.insert(contactTopic).values(
          body.topicIds.map((topicId) => ({
            contactId: newContact.id,
            topicId,
            status: "subscribed",
          }))
        );
      }

      ctx.set.status = 201;
      return {
        id: newContact.id,
        email: newContact.email,
        phone: newContact.phone,
        emailStatus: newContact.emailStatus,
        smsStatus: newContact.smsStatus,
        properties: newContact.properties,
        emailsSent: newContact.emailsSent,
        emailsOpened: newContact.emailsOpened,
        emailsClicked: newContact.emailsClicked,
        smsSent: newContact.smsSent,
        smsClicked: newContact.smsClicked,
        createdAt: newContact.createdAt.toISOString(),
        updatedAt: newContact.updatedAt.toISOString(),
      };
    },
    {
      body: createContactSchema,
      detail: {
        tags: ["contacts"],
        summary: "Create contact",
        description: "Creates a new contact with optional topic subscriptions",
      },
    }
  )
  // Update contact
  .patch(
    "/:id",
    async (ctx) => {
      const { params, body } = ctx;
      const authContext = (ctx as unknown as { auth: AuthContext }).auth;

      // Check contact exists
      const [existing] = await db
        .select({ id: contact.id })
        .from(contact)
        .where(
          and(
            eq(contact.id, params.id),
            eq(contact.organizationId, authContext.organizationId)
          )
        )
        .limit(1);

      if (!existing) {
        ctx.set.status = 404;
        return { error: "Contact not found" };
      }

      // Build update values
      const updateValues: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (body.email !== undefined) {
        updateValues.email = body.email;
        updateValues.emailHash = body.email ? hashValue(body.email) : null;
      }

      if (body.phone !== undefined) {
        updateValues.phone = body.phone;
        updateValues.phoneHash = body.phone ? hashValue(body.phone) : null;
      }

      if (body.emailStatus !== undefined) {
        updateValues.emailStatus = body.emailStatus;
      }

      if (body.smsStatus !== undefined) {
        updateValues.smsStatus = body.smsStatus;
      }

      if (body.properties !== undefined) {
        updateValues.properties = body.properties;
      }

      // Update contact
      const [updated] = await db
        .update(contact)
        .set(updateValues)
        .where(eq(contact.id, params.id))
        .returning();

      // Update topic subscriptions if specified
      if (body.topicIds !== undefined) {
        // Remove all existing subscriptions
        await db
          .delete(contactTopic)
          .where(eq(contactTopic.contactId, params.id));

        // Add new subscriptions
        if (body.topicIds.length > 0) {
          await db.insert(contactTopic).values(
            body.topicIds.map((topicId) => ({
              contactId: params.id,
              topicId,
              status: "subscribed",
            }))
          );
        }
      }

      return {
        id: updated.id,
        email: updated.email,
        phone: updated.phone,
        emailStatus: updated.emailStatus,
        smsStatus: updated.smsStatus,
        properties: updated.properties,
        emailsSent: updated.emailsSent,
        emailsOpened: updated.emailsOpened,
        emailsClicked: updated.emailsClicked,
        smsSent: updated.smsSent,
        smsClicked: updated.smsClicked,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: updateContactSchema,
      detail: {
        tags: ["contacts"],
        summary: "Update contact",
        description: "Updates an existing contact",
      },
    }
  )
  // Delete single contact
  .delete(
    "/:id",
    async (ctx) => {
      const { params } = ctx;
      const authContext = (ctx as unknown as { auth: AuthContext }).auth;

      const result = await db
        .delete(contact)
        .where(
          and(
            eq(contact.id, params.id),
            eq(contact.organizationId, authContext.organizationId)
          )
        )
        .returning({ id: contact.id });

      if (result.length === 0) {
        ctx.set.status = 404;
        return { error: "Contact not found" };
      }

      return { success: true };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ["contacts"],
        summary: "Delete contact",
        description: "Deletes a single contact",
      },
    }
  )
  // Bulk delete contacts
  .delete(
    "/",
    async (ctx) => {
      const { body } = ctx;
      const authContext = (ctx as unknown as { auth: AuthContext }).auth;

      if (!body.ids || body.ids.length === 0) {
        ctx.set.status = 400;
        return { error: "No contact IDs provided" };
      }

      // Limit bulk delete to 100 at a time
      if (body.ids.length > 100) {
        ctx.set.status = 400;
        return { error: "Maximum 100 contacts can be deleted at once" };
      }

      const result = await db
        .delete(contact)
        .where(
          and(
            eq(contact.organizationId, authContext.organizationId),
            inArray(contact.id, body.ids)
          )
        )
        .returning({ id: contact.id });

      return {
        success: true,
        deleted: result.length,
      };
    },
    {
      body: t.Object({
        ids: t.Array(t.String()),
      }),
      detail: {
        tags: ["contacts"],
        summary: "Bulk delete contacts",
        description: "Deletes multiple contacts at once (max 100)",
      },
    }
  );
