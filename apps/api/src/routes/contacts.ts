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

import {
  bulkDeleteContacts,
  type ContactRecord,
  contact,
  contactUniqueViolationField,
  deleteContact,
  fetchContactSubscriptions,
  fetchTopicsForSubscription,
  findContact,
  findContactByEmailHash,
  findContactByExternalId,
  findContactByPhoneHash,
  hashContactValue,
  insertContact,
  insertContactTopics,
  isContactTopicConflict,
  listContacts,
  reactivateContactSubscriptions,
  resolveContactId,
  resolveTopicSlugs,
  setPendingContactSubscriptions,
  updateContactFields,
} from "@wraps/db";
import { sendTopicConfirmationEmail } from "@wraps/email";
import { sql } from "drizzle-orm";
import { t } from "elysia";

import { log } from "../lib/logger";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";
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
const propertiesSchema = t.Optional(
  t.Object({}, { additionalProperties: true, description: "Custom properties" })
);

// Contact response schema
const contactResponseSchema = t.Object({
  id: t.String({ description: "Contact ID" }),
  externalId: t.Union([t.String(), t.Null()], {
    description: "Caller-supplied external ID",
  }),
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
  externalId: t.Optional(
    t.String({
      description: "Caller-supplied external ID (e.g. your own user ID)",
      maxLength: 255,
    })
  ),
  email: t.Optional(
    t.String({ description: "Email address", maxLength: 255, format: "email" })
  ),
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
  externalId: t.Optional(
    t.Union([t.String({ maxLength: 255 }), t.Null()], {
      description:
        "Caller-supplied external ID, unique per organization (null to clear)",
    })
  ),
  email: t.Optional(
    t.String({ description: "Email address", maxLength: 255, format: "email" })
  ),
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

export const contactsRoutes = createAuthenticatedRoutes("/v1/contacts")
  // List contacts
  .get(
    "/",
    async (ctx) => {
      const { query } = ctx;
      const authContext = getAuth(ctx);

      const page = Number.parseInt(query.page || "1", 10);
      const pageSize = Math.min(
        Number.parseInt(query.pageSize || "50", 10),
        100
      );

      const { contacts, total } = await listContacts(
        authContext.organizationId,
        {
          emailStatus: query.emailStatus,
          smsStatus: query.smsStatus,
          preferredChannel: query.preferredChannel,
          search: query.search,
        },
        { page, pageSize }
      );

      return {
        contacts: contacts.map((c) => ({
          id: c.id,
          externalId: c.externalId,
          email: c.email,
          phone: c.phone,
          firstName: c.firstName,
          lastName: c.lastName,
          company: c.company,
          jobTitle: c.jobTitle,
          emailStatus: c.emailStatus,
          smsStatus: c.smsStatus,
          preferredChannel: c.preferredChannel,
          properties: c.properties,
          emailsSent: c.emailsSent,
          emailsOpened: c.emailsOpened,
          emailsClicked: c.emailsClicked,
          smsSent: c.smsSent,
          smsClicked: c.smsClicked,
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
      const authContext = getAuth(ctx);

      const result = await findContact(params.id, authContext.organizationId);

      if (!result) {
        ctx.set.status = 404;
        return { error: "Contact not found" };
      }

      return {
        id: result.id,
        externalId: result.externalId,
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
        topics: result.topics.map((t) => ({
          ...t,
          subscribedAt: t.subscribedAt?.toISOString() ?? null,
        })),
      };
    },
    {
      params: t.Object({
        id: t.String({
          description: "Contact UUID, email, or externalId",
          maxLength: 255,
        }),
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
      const authContext = getAuth(ctx);

      // Must have email or phone
      if (!(body.email || body.phone)) {
        ctx.set.status = 400;
        return { error: "Email or phone is required" };
      }

      // Check for duplicate externalId
      if (body.externalId) {
        const existing = await findContactByExternalId(
          body.externalId,
          authContext.organizationId
        );
        if (existing) {
          ctx.set.status = 409;
          return { error: "Contact with this externalId already exists" };
        }
      }

      // Check for duplicate email
      if (body.email) {
        const existing = await findContactByEmailHash(
          hashContactValue(body.email),
          authContext.organizationId
        );
        if (existing) {
          ctx.set.status = 409;
          return { error: "Contact with this email already exists" };
        }
      }

      // Check for duplicate phone
      if (body.phone) {
        const existing = await findContactByPhoneHash(
          hashContactValue(body.phone),
          authContext.organizationId
        );
        if (existing) {
          ctx.set.status = 409;
          return { error: "Contact with this phone already exists" };
        }
      }

      // Create contact — onConflictDoNothing covers both unique constraints
      // (contact_unique_org_email_idx and contact_unique_org_phone_idx)
      // so concurrent requests that pass the SELECT checks above won't 500.
      // Hoisted so the timestamp and the status it describes are computed from
      // the same value — the dashboard's create action does the same
      // (apps/web/src/actions/contacts.ts:406-411).
      const resolvedEmailStatus =
        body.emailStatus ?? (body.email ? "active" : null);
      const resolvedSmsStatus =
        body.smsStatus ?? (body.phone ? "pending_consent" : null);

      const newContact = await insertContact({
        organizationId: authContext.organizationId,
        externalId: body.externalId ?? null,
        email: body.email,
        emailHash: body.email ? hashContactValue(body.email) : null,
        emailStatus: resolvedEmailStatus,
        emailVerifiedAt: resolvedEmailStatus === "active" ? new Date() : null,
        phone: body.phone,
        phoneHash: body.phone ? hashContactValue(body.phone) : null,
        smsStatus: resolvedSmsStatus,
        smsConsentedAt: resolvedSmsStatus === "opted_in" ? new Date() : null,
        smsOptedOutAt: resolvedSmsStatus === "opted_out" ? new Date() : null,
        smsInvalidAt: resolvedSmsStatus === "invalid" ? new Date() : null,
        firstName: body.firstName ?? null,
        lastName: body.lastName ?? null,
        company: body.company ?? null,
        jobTitle: body.jobTitle ?? null,
        preferredChannel: body.preferredChannel ?? null,
        properties: body.properties ?? {},
        createdBy: authContext.userId,
      });

      if (!newContact) {
        // Race condition: another request created this contact between our
        // SELECT check and INSERT. Return field-specific message.
        ctx.set.status = 409;
        if (body.email) {
          return { error: "Contact with this email already exists" };
        }
        return { error: "Contact with this phone already exists" };
      }

      // Resolve topic slugs to IDs if provided
      let topicIds = body.topicIds || [];
      if (body.topicSlugs && body.topicSlugs.length > 0) {
        const resolvedIds = await resolveTopicSlugs(
          body.topicSlugs,
          authContext.organizationId
        );
        topicIds = [...topicIds, ...resolvedIds];
      }
      // contact_topic is keyed by (contactId, topicId), and every narrowing
      // below is a filter rather than a set — so a topic named twice would
      // reach the INSERT as two identical rows and fail the whole write on the
      // primary key. A caller does not have to repeat itself to get here:
      // naming one topic by id and by slug in the same request is enough.
      topicIds = [...new Set(topicIds)];

      // Add to topics if specified
      const pendingTopics: string[] = [];
      let ownedTopicIds: string[] = [];
      const immediateTopicNames = new Map<string, string>();
      if (topicIds.length > 0) {
        const topicInfos = await fetchTopicsForSubscription(
          topicIds,
          authContext.organizationId
        );
        const topicMap = new Map(topicInfos.map((t) => [t.id, t]));
        ownedTopicIds = topicIds.filter((id) => topicMap.has(id));
        for (const id of ownedTopicIds) {
          immediateTopicNames.set(id, topicMap.get(id)!.name);
        }
        const now = new Date();

        await insertContactTopics(
          ownedTopicIds.map((topicId) => {
            const topicInfo = topicMap.get(topicId)!;
            const requiresConfirmation = topicInfo.doubleOptIn;
            if (requiresConfirmation) pendingTopics.push(topicId);
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
        if (pendingTopics.length > 0 && newContact.email) {
          const contactEmail = newContact.email;
          await Promise.all(
            pendingTopics.map(async (topicId) => {
              const topicInfo = topicMap.get(topicId);
              if (topicInfo) {
                try {
                  await sendTopicConfirmationEmail({
                    contactId: newContact.id,
                    contactEmail,
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
      if (ownedTopicIds.length > 0) {
        const immediateTopics = ownedTopicIds.filter(
          (tid) => !pendingTopics.includes(tid)
        );
        await Promise.all(
          immediateTopics.map((topicId) =>
            emitTopicSubscribed({
              contactId: newContact.id,
              organizationId: authContext.organizationId,
              topicId,
              topicName: immediateTopicNames.get(topicId),
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
        externalId: newContact.externalId,
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
      const authContext = getAuth(ctx);

      const contactId = await resolveContactId(
        params.id,
        authContext.organizationId
      );

      if (!contactId) {
        ctx.set.status = 404;
        return { error: "Contact not found" };
      }

      // Reassigning an externalId already held by a sibling contact would
      // trip contact_unique_org_external_id_idx. Reject it up front so the
      // rest of the patch is not applied either.
      if (body.externalId) {
        const holder = await findContactByExternalId(
          body.externalId,
          authContext.organizationId
        );
        if (holder && holder.id !== contactId) {
          ctx.set.status = 409;
          return { error: "Contact with this externalId already exists" };
        }
      }

      // Build update values
      const updateValues: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (body.externalId !== undefined) {
        updateValues.externalId = body.externalId;
      }
      if (body.email !== undefined) {
        updateValues.email = body.email;
        updateValues.emailHash = body.email
          ? hashContactValue(body.email)
          : null;
      }
      if (body.phone !== undefined) {
        updateValues.phone = body.phone;
        updateValues.phoneHash = body.phone
          ? hashContactValue(body.phone)
          : null;
        // A contact that gains a phone number needs a consent state. NULL is a
        // state no other write path produces: it is outside the 'opted_in'
        // send filter and outside the dashboard's pending-consent filter, so
        // the contact is invisible to both. Only fills a gap — an existing
        // decision is left alone, and an explicit body.smsStatus wins because
        // its branch runs after this one.
        if (body.phone && body.smsStatus === undefined) {
          updateValues.smsStatus = sql`COALESCE(${contact.smsStatus}, 'pending_consent')`;
        }
      }
      if (body.emailStatus !== undefined) {
        updateValues.emailStatus = body.emailStatus;
        // COALESCE, not an unconditional stamp: a contact that bounced and
        // came back keeps the moment it was first verified.
        if (body.emailStatus === "active") {
          updateValues.emailVerifiedAt = sql`COALESCE(${contact.emailVerifiedAt}, now())`;
        } else if (body.emailStatus === "unsubscribed") {
          updateValues.emailUnsubscribedAt = new Date();
        } else if (body.emailStatus === "bounced") {
          updateValues.emailBouncedAt = new Date();
        } else if (body.emailStatus === "complained") {
          updateValues.emailComplainedAt = new Date();
        }
      }
      if (body.smsStatus !== undefined) {
        updateValues.smsStatus = body.smsStatus;
        // The consent record is the thing that would have to be produced if
        // someone disputes an SMS, so a repeated opt-in must not restart its
        // clock — the earliest recorded consent wins.
        if (body.smsStatus === "opted_in") {
          updateValues.smsConsentedAt = sql`COALESCE(${contact.smsConsentedAt}, now())`;
        } else if (body.smsStatus === "opted_out") {
          updateValues.smsOptedOutAt = new Date();
        } else if (body.smsStatus === "invalid") {
          updateValues.smsInvalidAt = new Date();
        }
      }
      if (body.properties !== undefined) {
        const patchProperties = JSON.stringify(body.properties);
        updateValues.properties = sql`(COALESCE(${contact.properties}::jsonb, '{}'::jsonb) || ${patchProperties}::jsonb)::json`;
      }
      if (body.firstName !== undefined) updateValues.firstName = body.firstName;
      if (body.lastName !== undefined) updateValues.lastName = body.lastName;
      if (body.company !== undefined) updateValues.company = body.company;
      if (body.jobTitle !== undefined) updateValues.jobTitle = body.jobTitle;
      if (body.preferredChannel !== undefined)
        updateValues.preferredChannel = body.preferredChannel;

      // Update contact (scoped by org for defense-in-depth)
      let updated: ContactRecord;
      try {
        updated = await updateContactFields(
          contactId,
          authContext.organizationId,
          updateValues
        );
      } catch (err) {
        // Race: a concurrent write claimed the value between the check above
        // and this update. Anything that is not a contact uniqueness
        // violation is a real failure and must keep propagating.
        const field = contactUniqueViolationField(err);
        if (!field) {
          throw err;
        }
        ctx.set.status = 409;
        return { error: `Contact with this ${field} already exists` };
      }

      // Add topic subscriptions if specified (PATCH adds, doesn't replace)
      const pendingTopics: string[] = [];
      if (body.topicIds !== undefined || body.topicSlugs !== undefined) {
        let topicIds = body.topicIds || [];
        if (body.topicSlugs && body.topicSlugs.length > 0) {
          const resolvedIds = await resolveTopicSlugs(
            body.topicSlugs,
            authContext.organizationId
          );
          topicIds = [...topicIds, ...resolvedIds];
        }
        // contact_topic is keyed by (contactId, topicId): a repeat reaching the
        // INSERT below fails the write on the primary key. It also double-fires
        // the resubscribe path, which UPDATEs and so would not fail at all —
        // just emit the event and send the confirmation email twice.
        topicIds = [...new Set(topicIds)];

        const existingSubscriptions =
          await fetchContactSubscriptions(contactId);

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

        const newTopicIds = topicIds.filter((id) => !existingTopicIds.has(id));
        const resubscribeTopicIds = topicIds.filter(
          (id) => existingTopicIds.has(id) && !activelySubscribedIds.has(id)
        );

        // Re-subscribe inactive topics (with DOI check)
        if (resubscribeTopicIds.length > 0) {
          const now = new Date();
          const topicInfosForResub = await fetchTopicsForSubscription(
            resubscribeTopicIds,
            authContext.organizationId
          );
          const resubTopicMap = new Map(
            topicInfosForResub.map((t) => [t.id, t])
          );
          const ownedResubIds = resubscribeTopicIds.filter((id) =>
            resubTopicMap.has(id)
          );

          const directResubscribeIds: string[] = [];
          const pendingResubscribeIds: string[] = [];

          for (const topicId of ownedResubIds) {
            const topicInfo = resubTopicMap.get(topicId)!;
            const requiresConfirmation = topicInfo.doubleOptIn;
            const previouslyConfirmed = confirmedTopics.has(topicId);

            if (requiresConfirmation && !previouslyConfirmed) {
              pendingResubscribeIds.push(topicId);
              pendingTopics.push(topicId);
            } else {
              directResubscribeIds.push(topicId);
            }
          }

          await reactivateContactSubscriptions(
            contactId,
            directResubscribeIds,
            now
          );

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

          await setPendingContactSubscriptions(
            contactId,
            pendingResubscribeIds
          );

          if (pendingResubscribeIds.length > 0 && updated.email) {
            const updatedEmail = updated.email;
            await Promise.all(
              pendingResubscribeIds.map(async (topicId) => {
                const topicInfo = resubTopicMap.get(topicId);
                if (topicInfo) {
                  try {
                    await sendTopicConfirmationEmail({
                      contactId,
                      contactEmail: updatedEmail,
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

        // Add new subscriptions with double opt-in check
        if (newTopicIds.length > 0) {
          const topicInfos = await fetchTopicsForSubscription(
            newTopicIds,
            authContext.organizationId
          );
          const topicMap = new Map(topicInfos.map((t) => [t.id, t]));
          const ownedNewTopicIds = newTopicIds.filter((id) => topicMap.has(id));
          const now = new Date();

          const rows = ownedNewTopicIds.map((topicId) => {
            const topicInfo = topicMap.get(topicId)!;
            const requiresConfirmation = topicInfo.doubleOptIn;
            const previouslyConfirmed = confirmedTopics.has(topicId);
            const needsConfirmation =
              requiresConfirmation && !previouslyConfirmed;

            if (needsConfirmation) pendingTopics.push(topicId);

            return {
              contactId,
              topicId,
              status: needsConfirmation ? "pending" : "subscribed",
              subscribedAt: needsConfirmation ? null : now,
              confirmedAt: needsConfirmation
                ? null
                : previouslyConfirmed
                  ? (confirmedTopics.get(topicId) ?? now)
                  : now,
            };
          });

          try {
            await insertContactTopics(rows);
          } catch (err) {
            // Race: a concurrent request subscribed this contact to one of
            // these topics between the read above and this insert. Anything
            // else is a real failure and must keep propagating, rather than
            // being reported as a conflict that did not happen.
            if (!isContactTopicConflict(err)) {
              throw err;
            }
            ctx.set.status = 409;
            return {
              error: "Contact is already subscribed to one of these topics",
            };
          }

          if (pendingTopics.length > 0 && updated.email) {
            const updatedEmail = updated.email;
            await Promise.all(
              pendingTopics.map(async (topicId) => {
                const topicInfo = topicMap.get(topicId);
                if (topicInfo) {
                  try {
                    await sendTopicConfirmationEmail({
                      contactId,
                      contactEmail: updatedEmail,
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

          const immediateTopics = ownedNewTopicIds.filter(
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

      await checkSegmentEntry({
        contactId,
        organizationId: authContext.organizationId,
      }).catch((err) => {
        log.error("Failed to check segment entry", err, {
          organizationId: authContext.organizationId,
        });
      });

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
        externalId: updated.externalId,
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
        id: t.String({
          description: "Contact UUID, email, or externalId",
          maxLength: 255,
        }),
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
        409: errorResponse,
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
      const authContext = getAuth(ctx);

      const resolvedId = await resolveContactId(
        params.id,
        authContext.organizationId
      );

      if (!resolvedId) {
        ctx.set.status = 404;
        return { error: "Contact not found" };
      }

      await deleteContact(resolvedId, authContext.organizationId);

      return { success: true };
    },
    {
      params: t.Object({
        id: t.String({
          description: "Contact UUID, email, or externalId",
          maxLength: 255,
        }),
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
      const authContext = getAuth(ctx);

      if (!body.ids || body.ids.length === 0) {
        ctx.set.status = 400;
        return { error: "No contact IDs provided" };
      }

      if (body.ids.length > 100) {
        ctx.set.status = 400;
        return { error: "Maximum 100 contacts can be deleted at once" };
      }

      const deleted = await bulkDeleteContacts(
        body.ids,
        authContext.organizationId
      );

      return { success: true, deleted };
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
