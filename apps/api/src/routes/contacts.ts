/**
 * Contacts Routes
 *
 * CRUD operations for managing contacts.
 *
 * GET /v1/contacts - List contacts with pagination
 * GET /v1/contacts/:id - Get a single contact
 * POST /v1/contacts - Create a new contact
 * PATCH /v1/contacts/:id - Update a contact (adds topics, doesn't replace)
 * DELETE /v1/contacts/:id - Delete a contact
 * DELETE /v1/contacts - Bulk delete contacts
 */

import { createHash } from "node:crypto";
import { contact, contactTopic, db, eq, topic } from "@wraps/db";
import { sendTopicConfirmationEmail } from "@wraps/email";
import { and, desc, inArray, or, sql } from "drizzle-orm";
import { t } from "elysia";

import { log } from "../lib/logger";
import {
  type AuthContext,
  createAuthenticatedRoutes,
} from "../middleware/auth";
import {
  checkSegmentEntry,
  checkSegmentExit,
  emitContactCreated,
  emitContactUpdated,
  emitTopicSubscribed,
} from "../services/workflow-events";

// Common response schemas
const errorResponse = t.Object({
  error: t.String({ description: "Error message" }),
});

// OpenAPI 3.0 compatible arbitrary properties object
// Uses additionalProperties instead of patternProperties
const propertiesSchema = t.Optional(
  t.Object({}, { additionalProperties: true, description: "Custom properties" })
);

// Contact response schema
const contactResponseSchema = t.Object({
  id: t.String({ description: "Contact ID" }),
  email: t.Union([t.String(), t.Null()], { description: "Email address" }),
  phone: t.Union([t.String(), t.Null()], { description: "Phone number" }),
  firstName: t.Union([t.String(), t.Null()], { description: "First name" }),
  lastName: t.Union([t.String(), t.Null()], { description: "Last name" }),
  company: t.Union([t.String(), t.Null()], { description: "Company name" }),
  jobTitle: t.Union([t.String(), t.Null()], { description: "Job title" }),
  emailStatus: t.Union([t.String(), t.Null()], {
    description: "Email subscription status",
  }),
  smsStatus: t.Union([t.String(), t.Null()], {
    description: "SMS subscription status",
  }),
  preferredChannel: t.Union([t.String(), t.Null()], {
    description: "Preferred communication channel",
  }),
  properties: t.Object({}, { additionalProperties: true }),
  emailsSent: t.Number({ description: "Number of emails sent" }),
  emailsOpened: t.Number({ description: "Number of emails opened" }),
  emailsClicked: t.Number({ description: "Number of emails clicked" }),
  smsSent: t.Number({ description: "Number of SMS sent" }),
  smsClicked: t.Number({ description: "Number of SMS clicked" }),
  createdAt: t.String({
    description: "Creation timestamp",
    format: "date-time",
  }),
  updatedAt: t.String({
    description: "Last update timestamp",
    format: "date-time",
  }),
});

const createContactSchema = t.Object({
  email: t.Optional(t.String({ description: "Email address", maxLength: 255 })),
  phone: t.Optional(t.String({ description: "Phone number", maxLength: 50 })),
  firstName: t.Optional(
    t.String({ description: "First name", maxLength: 100 })
  ),
  lastName: t.Optional(t.String({ description: "Last name", maxLength: 100 })),
  company: t.Optional(
    t.String({ description: "Company name", maxLength: 200 })
  ),
  jobTitle: t.Optional(t.String({ description: "Job title", maxLength: 200 })),
  emailStatus: t.Optional(
    t.Union(
      [
        t.Literal("active"),
        t.Literal("unsubscribed"),
        t.Literal("bounced"),
        t.Literal("complained"),
      ],
      { description: "Email subscription status" }
    )
  ),
  smsStatus: t.Optional(
    t.Union(
      [
        t.Literal("pending_consent"),
        t.Literal("opted_in"),
        t.Literal("opted_out"),
        t.Literal("invalid"),
      ],
      { description: "SMS consent status" }
    )
  ),
  preferredChannel: t.Optional(
    t.Union([t.Literal("email"), t.Literal("sms")], {
      description: "Preferred communication channel",
    })
  ),
  properties: propertiesSchema,
  topicIds: t.Optional(
    t.Array(t.String({ maxLength: 36 }), {
      description: "Topic IDs to subscribe",
    })
  ),
  topicSlugs: t.Optional(
    t.Array(t.String({ maxLength: 100 }), {
      description: "Topic slugs to subscribe",
    })
  ),
});

const updateContactSchema = t.Object({
  email: t.Optional(t.String({ description: "Email address", maxLength: 255 })),
  phone: t.Optional(t.String({ description: "Phone number", maxLength: 50 })),
  firstName: t.Optional(
    t.Union([t.String({ maxLength: 100 }), t.Null()], {
      description: "First name",
    })
  ),
  lastName: t.Optional(
    t.Union([t.String({ maxLength: 100 }), t.Null()], {
      description: "Last name",
    })
  ),
  company: t.Optional(
    t.Union([t.String({ maxLength: 200 }), t.Null()], {
      description: "Company name",
    })
  ),
  jobTitle: t.Optional(
    t.Union([t.String({ maxLength: 200 }), t.Null()], {
      description: "Job title",
    })
  ),
  emailStatus: t.Optional(
    t.Union(
      [
        t.Literal("active"),
        t.Literal("unsubscribed"),
        t.Literal("bounced"),
        t.Literal("complained"),
      ],
      { description: "Email subscription status" }
    )
  ),
  smsStatus: t.Optional(
    t.Union(
      [
        t.Literal("pending_consent"),
        t.Literal("opted_in"),
        t.Literal("opted_out"),
        t.Literal("invalid"),
      ],
      { description: "SMS consent status" }
    )
  ),
  preferredChannel: t.Optional(
    t.Union([t.Literal("email"), t.Literal("sms"), t.Null()], {
      description: "Preferred communication channel (null to clear)",
    })
  ),
  properties: propertiesSchema,
  topicIds: t.Optional(
    t.Array(t.String({ maxLength: 36 }), {
      description: "Topic IDs to subscribe",
    })
  ),
  topicSlugs: t.Optional(
    t.Array(t.String({ maxLength: 100 }), {
      description: "Topic slugs to subscribe",
    })
  ),
});

const listContactsQuerySchema = t.Object({
  page: t.Optional(
    t.String({ description: "Page number (1-indexed)", maxLength: 10 })
  ),
  pageSize: t.Optional(
    t.String({
      description: "Number of items per page (max 100)",
      maxLength: 10,
    })
  ),
  emailStatus: t.Optional(
    t.Union(
      [
        t.Literal("active"),
        t.Literal("unsubscribed"),
        t.Literal("bounced"),
        t.Literal("complained"),
      ],
      { description: "Filter by email status" }
    )
  ),
  smsStatus: t.Optional(
    t.Union(
      [
        t.Literal("pending_consent"),
        t.Literal("opted_in"),
        t.Literal("opted_out"),
        t.Literal("invalid"),
      ],
      { description: "Filter by SMS status" }
    )
  ),
  search: t.Optional(
    t.String({ description: "Search by email or phone", maxLength: 255 })
  ),
  preferredChannel: t.Optional(
    t.Union([t.Literal("email"), t.Literal("sms")], {
      description: "Filter by preferred channel",
    })
  ),
});

// Helpers
function hashValue(value: string): string {
  return createHash("sha256").update(value.toLowerCase().trim()).digest("hex");
}

// Resolve topic slugs to IDs for the given organization
export async function resolveTopicSlugs(
  slugs: string[],
  organizationId: string
): Promise<string[]> {
  if (slugs.length === 0) {
    return [];
  }

  const topics = await db
    .select({ id: topic.id, slug: topic.slug })
    .from(topic)
    .where(
      and(eq(topic.organizationId, organizationId), inArray(topic.slug, slugs))
    );

  return topics.map((t) => t.id);
}

export const contactsRoutes = createAuthenticatedRoutes("/v1/contacts")
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
        conditions.push(eq(contact.emailStatus, query.emailStatus));
      }

      if (query.smsStatus) {
        conditions.push(eq(contact.smsStatus, query.smsStatus));
      }

      if (query.preferredChannel) {
        conditions.push(eq(contact.preferredChannel, query.preferredChannel));
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
          firstName: contact.firstName,
          lastName: contact.lastName,
          company: contact.company,
          jobTitle: contact.jobTitle,
          emailStatus: contact.emailStatus,
          smsStatus: contact.smsStatus,
          preferredChannel: contact.preferredChannel,
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
      response: {
        200: t.Object({
          contacts: t.Array(contactResponseSchema),
          total: t.Number({
            description: "Total number of contacts matching filter",
          }),
          page: t.Number({ description: "Current page number" }),
          pageSize: t.Number({ description: "Number of items per page" }),
          totalPages: t.Number({ description: "Total number of pages" }),
        }),
      },
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
        firstName: result.firstName,
        lastName: result.lastName,
        company: result.company,
        jobTitle: result.jobTitle,
        emailStatus: result.emailStatus,
        smsStatus: result.smsStatus,
        preferredChannel: result.preferredChannel,
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
        id: t.String({ description: "Contact ID", maxLength: 36 }),
      }),
      response: {
        200: t.Object({
          ...contactResponseSchema.properties,
          topics: t.Array(
            t.Object({
              topicId: t.String(),
              topicName: t.String(),
              status: t.String(),
              subscribedAt: t.Union([t.String(), t.Null()]),
            })
          ),
        }),
        404: errorResponse,
      },
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
          firstName: body.firstName ?? null,
          lastName: body.lastName ?? null,
          company: body.company ?? null,
          jobTitle: body.jobTitle ?? null,
          preferredChannel: body.preferredChannel ?? null,
          properties: body.properties ?? {},
          createdBy: authContext.userId,
        })
        .returning();

      // Resolve topic slugs to IDs if provided
      let topicIds = body.topicIds || [];
      if (body.topicSlugs && body.topicSlugs.length > 0) {
        const resolvedIds = await resolveTopicSlugs(
          body.topicSlugs,
          authContext.organizationId
        );
        topicIds = [...topicIds, ...resolvedIds];
      }

      // Add to topics if specified
      const pendingTopics: string[] = [];
      if (topicIds.length > 0) {
        // Get topic info to check for double opt-in
        const topicInfos = await db
          .select({
            id: topic.id,
            name: topic.name,
            description: topic.description,
            doubleOptIn: topic.doubleOptIn,
          })
          .from(topic)
          .where(
            and(
              eq(topic.organizationId, authContext.organizationId),
              inArray(topic.id, topicIds)
            )
          );

        const topicMap = new Map(topicInfos.map((t) => [t.id, t]));

        // Create subscriptions with appropriate status
        const now = new Date();
        await db.insert(contactTopic).values(
          topicIds.map((topicId) => {
            const topicInfo = topicMap.get(topicId);
            const requiresConfirmation = topicInfo?.doubleOptIn ?? false;

            if (requiresConfirmation) {
              pendingTopics.push(topicId);
            }

            return {
              contactId: newContact.id,
              topicId,
              status: requiresConfirmation ? "pending" : "subscribed",
              subscribedAt: requiresConfirmation ? null : now,
              confirmedAt: requiresConfirmation ? null : now,
            };
          })
        );

        // Send confirmation emails for double opt-in topics
        const contactEmailForConfirmation = newContact.email;
        if (pendingTopics.length > 0 && contactEmailForConfirmation) {
          await Promise.all(
            pendingTopics.map(async (topicId) => {
              const topicInfo = topicMap.get(topicId);
              if (topicInfo) {
                try {
                  await sendTopicConfirmationEmail({
                    contactId: newContact.id,
                    contactEmail: contactEmailForConfirmation,
                    topicId,
                    topicName: topicInfo.name,
                    topicDescription: topicInfo.description,
                    organizationId: authContext.organizationId,
                  });
                } catch (err) {
                  log.error("Failed to send confirmation email", err, {
                    topicId,
                    organizationId: authContext.organizationId,
                  });
                }
              }
            })
          );
        }
      }

      // Emit contact_created event to trigger workflows
      await emitContactCreated({
        contactId: newContact.id,
        organizationId: authContext.organizationId,
        contactData: {
          email: newContact.email,
          phone: newContact.phone,
          firstName: newContact.firstName,
          lastName: newContact.lastName,
          company: newContact.company,
          jobTitle: newContact.jobTitle,
          preferredChannel: newContact.preferredChannel,
        },
      }).catch((err) => {
        log.error("Failed to emit contact_created event", err, {
          organizationId: authContext.organizationId,
        });
      });

      // Check segment entry triggers
      await checkSegmentEntry({
        contactId: newContact.id,
        organizationId: authContext.organizationId,
      }).catch((err) => {
        log.error("Failed to check segment entry", err, {
          organizationId: authContext.organizationId,
        });
      });

      // Emit topic subscription events for immediate subscriptions (non-pending)
      if (topicIds.length > 0) {
        const immediateTopics = topicIds.filter(
          (tid) => !pendingTopics.includes(tid)
        );
        // Re-fetch topic names for the emission (topicMap was in inner scope)
        const topicNamesForEmit = await db
          .select({ id: topic.id, name: topic.name })
          .from(topic)
          .where(inArray(topic.id, immediateTopics));
        const topicNameMap = new Map(
          topicNamesForEmit.map((t) => [t.id, t.name])
        );

        await Promise.all(
          immediateTopics.map((topicId) =>
            emitTopicSubscribed({
              contactId: newContact.id,
              organizationId: authContext.organizationId,
              topicId,
              topicName: topicNameMap.get(topicId),
            }).catch((err) => {
              log.error("Failed to emit topic_subscribed event", err, {
                organizationId: authContext.organizationId,
              });
            })
          )
        );
      }

      ctx.set.status = 201;
      return {
        id: newContact.id,
        email: newContact.email,
        phone: newContact.phone,
        firstName: newContact.firstName,
        lastName: newContact.lastName,
        company: newContact.company,
        jobTitle: newContact.jobTitle,
        emailStatus: newContact.emailStatus,
        smsStatus: newContact.smsStatus,
        preferredChannel: newContact.preferredChannel,
        properties: newContact.properties,
        emailsSent: newContact.emailsSent,
        emailsOpened: newContact.emailsOpened,
        emailsClicked: newContact.emailsClicked,
        smsSent: newContact.smsSent,
        smsClicked: newContact.smsClicked,
        createdAt: newContact.createdAt.toISOString(),
        updatedAt: newContact.updatedAt.toISOString(),
        pendingTopics: pendingTopics.length > 0 ? pendingTopics : undefined,
      };
    },
    {
      body: createContactSchema,
      response: {
        201: t.Object({
          ...contactResponseSchema.properties,
          pendingTopics: t.Optional(
            t.Array(t.String(), {
              description: "Topic IDs pending confirmation",
            })
          ),
        }),
        400: errorResponse,
        409: errorResponse,
      },
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

      // Resolve contact: accept UUID or email as the :id parameter.
      // UUIDs never contain "@", so this is a safe heuristic.
      const isEmail = params.id.includes("@");
      const [existing] = await db
        .select({ id: contact.id })
        .from(contact)
        .where(
          and(
            isEmail ? eq(contact.email, params.id) : eq(contact.id, params.id),
            eq(contact.organizationId, authContext.organizationId)
          )
        )
        .limit(1);

      if (!existing) {
        ctx.set.status = 404;
        return { error: "Contact not found" };
      }

      // Use the resolved UUID for all subsequent operations
      const contactId = existing.id;

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
        const patchProperties = JSON.stringify(body.properties);
        updateValues.properties =
          sql`(COALESCE(${contact.properties}::jsonb, '{}'::jsonb) || ${patchProperties}::jsonb)::json`;
      }

      if (body.firstName !== undefined) {
        updateValues.firstName = body.firstName;
      }

      if (body.lastName !== undefined) {
        updateValues.lastName = body.lastName;
      }

      if (body.company !== undefined) {
        updateValues.company = body.company;
      }

      if (body.jobTitle !== undefined) {
        updateValues.jobTitle = body.jobTitle;
      }

      if (body.preferredChannel !== undefined) {
        updateValues.preferredChannel = body.preferredChannel;
      }

      // Update contact
      const [updated] = await db
        .update(contact)
        .set(updateValues)
        .where(
          and(
            eq(contact.id, contactId),
            eq(contact.organizationId, authContext.organizationId)
          )
        )
        .returning();

      // Add topic subscriptions if specified (PATCH adds, doesn't replace)
      const pendingTopics: string[] = [];
      if (body.topicIds !== undefined || body.topicSlugs !== undefined) {
        // Resolve topic slugs to IDs if provided
        let topicIds = body.topicIds || [];
        if (body.topicSlugs && body.topicSlugs.length > 0) {
          const resolvedIds = await resolveTopicSlugs(
            body.topicSlugs,
            authContext.organizationId
          );
          topicIds = [...topicIds, ...resolvedIds];
        }

        // Get existing subscriptions to check which topics are already subscribed
        const existingSubscriptions = await db
          .select({
            topicId: contactTopic.topicId,
            status: contactTopic.status,
            confirmedAt: contactTopic.confirmedAt,
          })
          .from(contactTopic)
          .where(eq(contactTopic.contactId, contactId));

        // Only consider actively subscribed topics as "existing"
        const activelySubscribedIds = new Set(
          existingSubscriptions
            .filter((s) => s.status === "subscribed")
            .map((s) => s.topicId)
        );
        const existingTopicIds = new Set(
          existingSubscriptions.map((s) => s.topicId)
        );
        const confirmedTopics = new Map(
          existingSubscriptions
            .filter((s) => s.confirmedAt !== null)
            .map((s) => [s.topicId, s.confirmedAt])
        );

        // Topics to add: not in database at all
        const newTopicIds = topicIds.filter((id) => !existingTopicIds.has(id));
        // Topics to re-subscribe: in database but not actively subscribed
        const resubscribeTopicIds = topicIds.filter(
          (id) => existingTopicIds.has(id) && !activelySubscribedIds.has(id)
        );

        // Re-subscribe inactive topics (with DOI check)
        if (resubscribeTopicIds.length > 0) {
          const now = new Date();

          // Get topic info to check for double opt-in
          const topicInfosForResub = await db
            .select({
              id: topic.id,
              name: topic.name,
              description: topic.description,
              doubleOptIn: topic.doubleOptIn,
            })
            .from(topic)
            .where(inArray(topic.id, resubscribeTopicIds));
          const resubTopicMap = new Map(
            topicInfosForResub.map((t) => [t.id, t])
          );

          // Separate topics by DOI requirement and confirmation status
          const directResubscribeIds: string[] = [];
          const pendingResubscribeIds: string[] = [];

          for (const topicId of resubscribeTopicIds) {
            const topicInfo = resubTopicMap.get(topicId);
            const requiresConfirmation = topicInfo?.doubleOptIn ?? false;
            const previouslyConfirmed = confirmedTopics.has(topicId);

            if (requiresConfirmation && !previouslyConfirmed) {
              pendingResubscribeIds.push(topicId);
              pendingTopics.push(topicId);
            } else {
              directResubscribeIds.push(topicId);
            }
          }

          // Update topics that can be directly resubscribed
          if (directResubscribeIds.length > 0) {
            await db
              .update(contactTopic)
              .set({
                status: "subscribed",
                subscribedAt: now,
              })
              .where(
                and(
                  eq(contactTopic.contactId, contactId),
                  inArray(contactTopic.topicId, directResubscribeIds)
                )
              );

            // Emit topic_subscribed events for directly re-subscribed topics
            await Promise.all(
              directResubscribeIds.map((topicId) =>
                emitTopicSubscribed({
                  contactId,
                  organizationId: authContext.organizationId,
                  topicId,
                  topicName: resubTopicMap.get(topicId)?.name,
                }).catch((err) => {
                  log.error("Failed to emit topic_subscribed event", err, {
                    organizationId: authContext.organizationId,
                  });
                })
              )
            );
          }

          // Update topics that require confirmation to pending status
          if (pendingResubscribeIds.length > 0) {
            await db
              .update(contactTopic)
              .set({
                status: "pending",
                subscribedAt: null,
              })
              .where(
                and(
                  eq(contactTopic.contactId, contactId),
                  inArray(contactTopic.topicId, pendingResubscribeIds)
                )
              );

            // Send confirmation emails for pending re-subscriptions
            const updatedEmailForConfirmation = updated.email;
            if (updatedEmailForConfirmation) {
              await Promise.all(
                pendingResubscribeIds.map(async (topicId) => {
                  const topicInfo = resubTopicMap.get(topicId);
                  if (topicInfo) {
                    try {
                      await sendTopicConfirmationEmail({
                        contactId,
                        contactEmail: updatedEmailForConfirmation,
                        topicId,
                        topicName: topicInfo.name,
                        topicDescription: topicInfo.description,
                        organizationId: authContext.organizationId,
                      });
                    } catch (err) {
                      log.error("Failed to send confirmation email", err, {
                        topicId,
                        organizationId: authContext.organizationId,
                      });
                    }
                  }
                })
              );
            }
          }
        }

        // Add new subscriptions with double opt-in check
        if (newTopicIds.length > 0) {
          // Get topic info to check for double opt-in
          const topicInfos = await db
            .select({
              id: topic.id,
              name: topic.name,
              description: topic.description,
              doubleOptIn: topic.doubleOptIn,
            })
            .from(topic)
            .where(
              and(
                eq(topic.organizationId, authContext.organizationId),
                inArray(topic.id, newTopicIds)
              )
            );

          const topicMap = new Map(topicInfos.map((t) => [t.id, t]));
          const now = new Date();

          await db.insert(contactTopic).values(
            newTopicIds.map((topicId) => {
              const topicInfo = topicMap.get(topicId);
              const requiresConfirmation = topicInfo?.doubleOptIn ?? false;
              const previouslyConfirmed = confirmedTopics.has(topicId);

              // Skip confirmation if previously confirmed (re-subscription)
              const needsConfirmation =
                requiresConfirmation && !previouslyConfirmed;

              if (needsConfirmation) {
                pendingTopics.push(topicId);
              }

              return {
                contactId,
                topicId,
                status: needsConfirmation ? "pending" : "subscribed",
                subscribedAt: needsConfirmation ? null : now,
                confirmedAt: needsConfirmation
                  ? null
                  : previouslyConfirmed
                    ? confirmedTopics.get(topicId)
                    : now,
              };
            })
          );

          // Send confirmation emails for newly pending topics
          const updatedEmailForConfirmation = updated.email;
          if (pendingTopics.length > 0 && updatedEmailForConfirmation) {
            await Promise.all(
              pendingTopics.map(async (topicId) => {
                const topicInfo = topicMap.get(topicId);
                if (topicInfo) {
                  try {
                    await sendTopicConfirmationEmail({
                      contactId,
                      contactEmail: updatedEmailForConfirmation,
                      topicId,
                      topicName: topicInfo.name,
                      topicDescription: topicInfo.description,
                      organizationId: authContext.organizationId,
                    });
                  } catch (err) {
                    log.error("Failed to send confirmation email", err, {
                      topicId,
                      organizationId: authContext.organizationId,
                    });
                  }
                }
              })
            );
          }

          // Emit topic_subscribed events for newly subscribed topics (not pending)
          const immediateTopics = newTopicIds.filter(
            (tid) => !pendingTopics.includes(tid)
          );

          await Promise.all(
            immediateTopics.map((topicId) => {
              const topicInfo = topicMap.get(topicId);
              return emitTopicSubscribed({
                contactId,
                organizationId: authContext.organizationId,
                topicId,
                topicName: topicInfo?.name,
              }).catch((err) => {
                log.error("Failed to emit topic_subscribed event", err, {
                  organizationId: authContext.organizationId,
                });
              });
            })
          );
        }
      }

      // Emit contact_updated event to trigger workflows
      const updatedFields = Object.keys(body).filter(
        (k) => k !== "topicIds" && k !== "topicSlugs"
      );
      await emitContactUpdated({
        contactId,
        organizationId: authContext.organizationId,
        updatedFields,
        contactData: {
          email: updated.email,
          phone: updated.phone,
          firstName: updated.firstName,
          lastName: updated.lastName,
          company: updated.company,
          jobTitle: updated.jobTitle,
          preferredChannel: updated.preferredChannel,
        },
      }).catch((err) => {
        log.error("Failed to emit contact_updated event", err, {
          organizationId: authContext.organizationId,
        });
      });

      // Check segment entry triggers (contact may now match a segment)
      await checkSegmentEntry({
        contactId,
        organizationId: authContext.organizationId,
      }).catch((err) => {
        log.error("Failed to check segment entry", err, {
          organizationId: authContext.organizationId,
        });
      });

      // Check segment exit triggers (contact may no longer match a segment)
      await checkSegmentExit({
        contactId,
        organizationId: authContext.organizationId,
      }).catch((err) => {
        log.error("Failed to check segment exit", err, {
          organizationId: authContext.organizationId,
        });
      });

      return {
        id: updated.id,
        email: updated.email,
        phone: updated.phone,
        firstName: updated.firstName,
        lastName: updated.lastName,
        company: updated.company,
        jobTitle: updated.jobTitle,
        emailStatus: updated.emailStatus,
        smsStatus: updated.smsStatus,
        preferredChannel: updated.preferredChannel,
        properties: updated.properties,
        emailsSent: updated.emailsSent,
        emailsOpened: updated.emailsOpened,
        emailsClicked: updated.emailsClicked,
        smsSent: updated.smsSent,
        smsClicked: updated.smsClicked,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        pendingTopics: pendingTopics.length > 0 ? pendingTopics : undefined,
      };
    },
    {
      params: t.Object({
        id: t.String({ description: "Contact ID", maxLength: 36 }),
      }),
      body: updateContactSchema,
      response: {
        200: t.Object({
          ...contactResponseSchema.properties,
          pendingTopics: t.Optional(
            t.Array(t.String(), {
              description: "Topic IDs pending confirmation",
            })
          ),
        }),
        404: errorResponse,
      },
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
        id: t.String({ description: "Contact ID", maxLength: 36 }),
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
        }),
        404: errorResponse,
      },
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
        ids: t.Array(t.String({ maxLength: 36 }), {
          description: "Contact IDs to delete (max 100)",
        }),
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          deleted: t.Number({ description: "Number of contacts deleted" }),
        }),
        400: errorResponse,
      },
      detail: {
        tags: ["contacts"],
        summary: "Bulk delete contacts",
        description: "Deletes multiple contacts at once (max 100)",
      },
    }
  );
