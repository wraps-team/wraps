"use server";

import crypto from "node:crypto";
import { auth } from "@wraps/auth";
import { contact, contactTopic, db, topic } from "@wraps/db";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type {
  ContactStatus,
  CreateContactResult,
  DeleteContactResult,
  EmailStatus,
  GetContactResult,
  ListContactsResult,
  SmsStatus,
  UpdateContactResult,
} from "@/lib/contacts";
import { createActionLogger, serializeError } from "@/lib/logger";
import { checkContactLimit } from "@/lib/plan-limits";

// Re-export types for convenience
export type {
  ContactStatus,
  ContactWithMeta,
  CreateContactResult,
  DeleteContactResult,
  EmailStatus,
  GetContactResult,
  ListContactsResult,
  SmsStatus,
  UpdateContactResult,
} from "@/lib/contacts";

/**
 * Hash email for deduplication
 */
function hashEmail(email: string): string {
  return crypto
    .createHash("sha256")
    .update(email.toLowerCase().trim())
    .digest("hex");
}

/**
 * Hash phone for deduplication
 */
function hashPhone(phone: string): string {
  // Normalize phone to E.164 format for consistent hashing
  const normalized = phone.replace(/\D/g, "");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Verify user has access to organization
 */
async function verifyOrgAccess(
  organizationId: string
): Promise<{ userId: string; role: string } | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return null;
  }

  const membership = await db.query.member.findFirst({
    where: (m, { and, eq }) =>
      and(eq(m.organizationId, organizationId), eq(m.userId, session.user.id)),
  });

  if (!membership) {
    return null;
  }

  return { userId: session.user.id, role: membership.role };
}

/**
 * List contacts for an organization with pagination and search
 */
export async function listContacts(
  organizationId: string,
  options: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: ContactStatus;
    topicId?: string;
  } = {}
): Promise<ListContactsResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const { page = 1, pageSize = 50, search, status, topicId } = options;
    const offset = (page - 1) * pageSize;

    // Build where conditions
    const conditions = [eq(contact.organizationId, organizationId)];

    if (search) {
      conditions.push(ilike(contact.email, `%${search}%`));
    }

    if (status) {
      conditions.push(eq(contact.status, status));
    }

    // If filtering by topic, we need a subquery
    let topicFilter;
    if (topicId) {
      const subscribedContactIds = db
        .select({ contactId: contactTopic.contactId })
        .from(contactTopic)
        .where(
          and(
            eq(contactTopic.topicId, topicId),
            eq(contactTopic.status, "subscribed")
          )
        );
      topicFilter = sql`${contact.id} IN (${subscribedContactIds})`;
    }

    // Get total count
    const [totalResult] = await db
      .select({ count: count() })
      .from(contact)
      .where(
        topicFilter ? and(...conditions, topicFilter) : and(...conditions)
      );

    const total = totalResult?.count ?? 0;

    // Get contacts with pagination
    const contacts = await db.query.contact.findMany({
      where: topicFilter ? and(...conditions, topicFilter) : and(...conditions),
      with: {
        createdByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
        topics: {
          with: {
            topic: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [desc(contact.createdAt)],
      limit: pageSize,
      offset,
    });

    return {
      success: true,
      contacts: contacts.map((c) => ({
        id: c.id,
        // Email channel
        email: c.email,
        emailStatus: c.emailStatus as EmailStatus | null,
        emailVerifiedAt: c.emailVerifiedAt,
        emailUnsubscribedAt: c.emailUnsubscribedAt,
        emailBouncedAt: c.emailBouncedAt,
        emailComplainedAt: c.emailComplainedAt,
        lastEmailSentAt: c.lastEmailSentAt,
        lastEmailOpenedAt: c.lastEmailOpenedAt,
        lastEmailClickedAt: c.lastEmailClickedAt,
        emailsSent: c.emailsSent,
        emailsOpened: c.emailsOpened,
        emailsClicked: c.emailsClicked,
        // SMS channel
        phone: c.phone,
        smsStatus: c.smsStatus as SmsStatus | null,
        smsConsentedAt: c.smsConsentedAt,
        smsOptedOutAt: c.smsOptedOutAt,
        smsInvalidAt: c.smsInvalidAt,
        lastSmsSentAt: c.lastSmsSentAt,
        lastSmsClickedAt: c.lastSmsClickedAt,
        smsSent: c.smsSent,
        smsClicked: c.smsClicked,
        // Shared
        properties: (c.properties as Record<string, unknown>) || {},
        lastActivityAt: c.lastActivityAt,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        createdBy: c.createdByUser,
        topics: c.topics.map((ct) => ({
          topicId: ct.topic.id,
          topicName: ct.topic.name,
          status: ct.status,
          subscribedAt: ct.subscribedAt,
        })),
        // Deprecated fields (backwards compatibility)
        status: c.status as ContactStatus,
        confirmedAt: c.confirmedAt,
        unsubscribedAt: c.unsubscribedAt,
        bouncedAt: c.bouncedAt,
        complainedAt: c.complainedAt,
      })),
      total,
      page,
      pageSize,
    };
  } catch (error) {
    const log = createActionLogger("listContacts", { orgSlug: organizationId });
    log.error({ err: serializeError(error) }, "Failed to list contacts");
    return { success: false, error: "Failed to fetch contacts" };
  }
}

/**
 * Get a single contact by ID
 */
export async function getContact(
  contactId: string,
  organizationId: string
): Promise<GetContactResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const c = await db.query.contact.findFirst({
      where: (contact, { and, eq }) =>
        and(
          eq(contact.id, contactId),
          eq(contact.organizationId, organizationId)
        ),
      with: {
        createdByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
        topics: {
          with: {
            topic: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!c) {
      return { success: false, error: "Contact not found" };
    }

    return {
      success: true,
      contact: {
        id: c.id,
        // Email channel
        email: c.email,
        emailStatus: c.emailStatus as EmailStatus | null,
        emailVerifiedAt: c.emailVerifiedAt,
        emailUnsubscribedAt: c.emailUnsubscribedAt,
        emailBouncedAt: c.emailBouncedAt,
        emailComplainedAt: c.emailComplainedAt,
        lastEmailSentAt: c.lastEmailSentAt,
        lastEmailOpenedAt: c.lastEmailOpenedAt,
        lastEmailClickedAt: c.lastEmailClickedAt,
        emailsSent: c.emailsSent,
        emailsOpened: c.emailsOpened,
        emailsClicked: c.emailsClicked,
        // SMS channel
        phone: c.phone,
        smsStatus: c.smsStatus as SmsStatus | null,
        smsConsentedAt: c.smsConsentedAt,
        smsOptedOutAt: c.smsOptedOutAt,
        smsInvalidAt: c.smsInvalidAt,
        lastSmsSentAt: c.lastSmsSentAt,
        lastSmsClickedAt: c.lastSmsClickedAt,
        smsSent: c.smsSent,
        smsClicked: c.smsClicked,
        // Shared
        properties: (c.properties as Record<string, unknown>) || {},
        lastActivityAt: c.lastActivityAt,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        createdBy: c.createdByUser,
        topics: c.topics.map((ct) => ({
          topicId: ct.topic.id,
          topicName: ct.topic.name,
          status: ct.status,
          subscribedAt: ct.subscribedAt,
        })),
        // Deprecated fields (backwards compatibility)
        status: c.status as ContactStatus,
        confirmedAt: c.confirmedAt,
        unsubscribedAt: c.unsubscribedAt,
        bouncedAt: c.bouncedAt,
        complainedAt: c.complainedAt,
      },
    };
  } catch (error) {
    const log = createActionLogger("getContact", { orgSlug: organizationId });
    log.error(
      { err: serializeError(error), contactId },
      "Failed to get contact"
    );
    return { success: false, error: "Failed to fetch contact" };
  }
}

/**
 * Create a new contact
 */
export async function createContact(
  organizationId: string,
  data: {
    email?: string;
    phone?: string;
    emailStatus?: EmailStatus;
    smsStatus?: SmsStatus;
    properties?: Record<string, unknown>;
    topicIds?: string[];
    /** @deprecated Use emailStatus instead */
    status?: ContactStatus;
  }
): Promise<CreateContactResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Check contact limit
    const limitCheck = await checkContactLimit(organizationId);
    if (!limitCheck.allowed) {
      return {
        success: false,
        error:
          limitCheck.message ??
          "You've reached your contact limit. Please upgrade your plan.",
      };
    }

    // Validate that at least email or phone is provided
    const email = data.email?.toLowerCase().trim();
    const phone = data.phone?.replace(/\s/g, "").trim();

    if (!(email || phone)) {
      return { success: false, error: "Either email or phone is required" };
    }

    // Validate email if provided
    if (email && !email.includes("@")) {
      return { success: false, error: "Invalid email address" };
    }

    // Validate phone if provided (basic E.164 check)
    if (phone && !phone.match(/^\+?[1-9]\d{6,14}$/)) {
      return {
        success: false,
        error: "Invalid phone number. Use E.164 format (e.g., +15551234567)",
      };
    }

    const emailHashValue = email ? hashEmail(email) : null;
    const phoneHashValue = phone ? hashPhone(phone) : null;

    // Check for duplicate by email
    if (emailHashValue) {
      const existingByEmail = await db.query.contact.findFirst({
        where: (c, { and, eq }) =>
          and(
            eq(c.organizationId, organizationId),
            eq(c.emailHash, emailHashValue)
          ),
      });

      if (existingByEmail) {
        return {
          success: false,
          error: "A contact with this email already exists",
        };
      }
    }

    // Check for duplicate by phone
    if (phoneHashValue) {
      const existingByPhone = await db.query.contact.findFirst({
        where: (c, { and, eq }) =>
          and(
            eq(c.organizationId, organizationId),
            eq(c.phoneHash, phoneHashValue)
          ),
      });

      if (existingByPhone) {
        return {
          success: false,
          error: "A contact with this phone number already exists",
        };
      }
    }

    // Determine statuses
    const emailStatus = data.emailStatus || (email ? "active" : null);
    const smsStatus = data.smsStatus || (phone ? "pending_consent" : null);
    // Legacy status for backwards compatibility
    const legacyStatus =
      data.status ||
      (emailStatus === "active" ? "active" : "pending_confirmation");

    // Create contact
    const [newContact] = await db
      .insert(contact)
      .values({
        organizationId,
        // Email fields
        email: email || null,
        emailHash: emailHashValue,
        emailStatus,
        emailVerifiedAt: emailStatus === "active" ? new Date() : null,
        // Phone fields
        phone: phone || null,
        phoneHash: phoneHashValue,
        smsStatus,
        smsConsentedAt: smsStatus === "opted_in" ? new Date() : null,
        // Shared
        properties: data.properties || {},
        createdBy: access.userId,
        // Legacy fields
        status: legacyStatus,
        confirmedAt: legacyStatus === "active" ? new Date() : null,
      })
      .returning();

    if (!newContact) {
      return { success: false, error: "Failed to create contact" };
    }

    // Subscribe to topics if provided
    if (data.topicIds && data.topicIds.length > 0) {
      await db.insert(contactTopic).values(
        data.topicIds.map((topicId) => ({
          contactId: newContact.id,
          topicId,
          status: "subscribed",
        }))
      );

      // Update topic subscriber counts
      for (const topicId of data.topicIds) {
        await db
          .update(topic)
          .set({
            subscriberCount: sql`${topic.subscriberCount} + 1`,
          })
          .where(eq(topic.id, topicId));
      }
    }

    // Revalidate
    revalidatePath("/[orgSlug]/contacts", "page");

    // Return the created contact
    return await getContact(newContact.id, organizationId);
  } catch (error) {
    const log = createActionLogger("createContact", {
      orgSlug: organizationId,
    });
    log.error({ err: serializeError(error) }, "Failed to create contact");
    return { success: false, error: "Failed to create contact" };
  }
}

/**
 * Update a contact
 */
export async function updateContact(
  contactId: string,
  organizationId: string,
  data: {
    email?: string;
    phone?: string;
    emailStatus?: EmailStatus;
    smsStatus?: SmsStatus;
    properties?: Record<string, unknown>;
    /** @deprecated Use emailStatus instead */
    status?: ContactStatus;
  }
): Promise<UpdateContactResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Verify contact exists
    const existing = await db.query.contact.findFirst({
      where: (c, { and, eq }) =>
        and(eq(c.id, contactId), eq(c.organizationId, organizationId)),
    });

    if (!existing) {
      return { success: false, error: "Contact not found" };
    }

    // Build update data
    const updateData: Partial<typeof contact.$inferInsert> = {
      updatedAt: new Date(),
    };

    // Handle email update
    if (data.email !== undefined) {
      const email = data.email.toLowerCase().trim();
      if (email && !email.includes("@")) {
        return { success: false, error: "Invalid email address" };
      }

      if (email) {
        const emailHashValue = hashEmail(email);

        // Check for duplicate (excluding current contact)
        const duplicate = await db.query.contact.findFirst({
          where: (c, { and, eq, ne }) =>
            and(
              eq(c.organizationId, organizationId),
              eq(c.emailHash, emailHashValue),
              ne(c.id, contactId)
            ),
        });

        if (duplicate) {
          return {
            success: false,
            error: "A contact with this email already exists",
          };
        }

        updateData.email = email;
        updateData.emailHash = emailHashValue;
      } else {
        // Clearing email
        updateData.email = null;
        updateData.emailHash = null;
        updateData.emailStatus = null;
      }
    }

    // Handle phone update
    if (data.phone !== undefined) {
      const phone = data.phone?.replace(/\s/g, "").trim();

      if (phone) {
        // Validate phone format
        if (!phone.match(/^\+?[1-9]\d{6,14}$/)) {
          return {
            success: false,
            error:
              "Invalid phone number. Use E.164 format (e.g., +15551234567)",
          };
        }

        const phoneHashValue = hashPhone(phone);

        // Check for duplicate (excluding current contact)
        const duplicate = await db.query.contact.findFirst({
          where: (c, { and, eq, ne }) =>
            and(
              eq(c.organizationId, organizationId),
              eq(c.phoneHash, phoneHashValue),
              ne(c.id, contactId)
            ),
        });

        if (duplicate) {
          return {
            success: false,
            error: "A contact with this phone number already exists",
          };
        }

        updateData.phone = phone;
        updateData.phoneHash = phoneHashValue;
        // Set default SMS status if phone is being added
        if (!existing.phone) {
          updateData.smsStatus = data.smsStatus || "pending_consent";
        }
      } else {
        // Clearing phone
        updateData.phone = null;
        updateData.phoneHash = null;
        updateData.smsStatus = null;
      }
    }

    // Handle email status update
    if (data.emailStatus !== undefined) {
      updateData.emailStatus = data.emailStatus;

      // Update timestamps based on status
      if (data.emailStatus === "active" && existing.emailStatus !== "active") {
        updateData.emailVerifiedAt = new Date();
      } else if (data.emailStatus === "unsubscribed") {
        updateData.emailUnsubscribedAt = new Date();
      } else if (data.emailStatus === "bounced") {
        updateData.emailBouncedAt = new Date();
      } else if (data.emailStatus === "complained") {
        updateData.emailComplainedAt = new Date();
      }
    }

    // Handle SMS status update
    if (data.smsStatus !== undefined) {
      updateData.smsStatus = data.smsStatus;

      // Update timestamps based on status
      if (data.smsStatus === "opted_in" && existing.smsStatus !== "opted_in") {
        updateData.smsConsentedAt = new Date();
      } else if (data.smsStatus === "opted_out") {
        updateData.smsOptedOutAt = new Date();
      } else if (data.smsStatus === "invalid") {
        updateData.smsInvalidAt = new Date();
      }
    }

    // Handle legacy status update (backwards compatibility)
    if (data.status !== undefined) {
      updateData.status = data.status;

      // Update legacy timestamps
      if (data.status === "active" && existing.status !== "active") {
        updateData.confirmedAt = new Date();
      } else if (data.status === "unsubscribed") {
        updateData.unsubscribedAt = new Date();
      } else if (data.status === "bounced") {
        updateData.bouncedAt = new Date();
      } else if (data.status === "complained") {
        updateData.complainedAt = new Date();
      }
    }

    if (data.properties !== undefined) {
      updateData.properties = data.properties;
    }

    // Validate that contact still has at least email or phone
    const finalEmail = data.email !== undefined ? data.email : existing.email;
    const finalPhone = data.phone !== undefined ? data.phone : existing.phone;
    if (!(finalEmail || finalPhone)) {
      return {
        success: false,
        error: "Contact must have either email or phone",
      };
    }

    // Update contact
    await db
      .update(contact)
      .set(updateData)
      .where(
        and(
          eq(contact.id, contactId),
          eq(contact.organizationId, organizationId)
        )
      );

    // Revalidate
    revalidatePath("/[orgSlug]/contacts", "page");

    // Return updated contact
    return await getContact(contactId, organizationId);
  } catch (error) {
    const log = createActionLogger("updateContact", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), contactId },
      "Failed to update contact"
    );
    return { success: false, error: "Failed to update contact" };
  }
}

/**
 * Delete a contact
 */
export async function deleteContact(
  contactId: string,
  organizationId: string
): Promise<DeleteContactResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Verify contact exists
    const existing = await db.query.contact.findFirst({
      where: (c, { and, eq }) =>
        and(eq(c.id, contactId), eq(c.organizationId, organizationId)),
      with: {
        topics: true,
      },
    });

    if (!existing) {
      return { success: false, error: "Contact not found" };
    }

    // Decrement topic subscriber counts for subscribed topics
    const subscribedTopicIds = existing.topics
      .filter((t) => t.status === "subscribed")
      .map((t) => t.topicId);

    if (subscribedTopicIds.length > 0) {
      for (const topicId of subscribedTopicIds) {
        await db
          .update(topic)
          .set({
            subscriberCount: sql`GREATEST(${topic.subscriberCount} - 1, 0)`,
          })
          .where(eq(topic.id, topicId));
      }
    }

    // Delete contact (cascades to contact_topic)
    await db
      .delete(contact)
      .where(
        and(
          eq(contact.id, contactId),
          eq(contact.organizationId, organizationId)
        )
      );

    // Revalidate
    revalidatePath("/[orgSlug]/contacts", "page");

    return { success: true };
  } catch (error) {
    const log = createActionLogger("deleteContact", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), contactId },
      "Failed to delete contact"
    );
    return { success: false, error: "Failed to delete contact" };
  }
}

/**
 * Subscribe a contact to topics
 */
export async function subscribeContactToTopics(
  contactId: string,
  organizationId: string,
  topicIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Verify contact exists
    const existing = await db.query.contact.findFirst({
      where: (c, { and, eq }) =>
        and(eq(c.id, contactId), eq(c.organizationId, organizationId)),
      with: {
        topics: true,
      },
    });

    if (!existing) {
      return { success: false, error: "Contact not found" };
    }

    // Get current subscriptions
    const currentTopicIds = new Set(
      existing.topics
        .filter((t) => t.status === "subscribed")
        .map((t) => t.topicId)
    );

    // Filter to only new subscriptions
    const newTopicIds = topicIds.filter((id) => !currentTopicIds.has(id));

    if (newTopicIds.length === 0) {
      return { success: true };
    }

    // Check if any are resubscriptions (previously unsubscribed)
    const previousSubscriptions = existing.topics
      .filter(
        (t) => t.status === "unsubscribed" && newTopicIds.includes(t.topicId)
      )
      .map((t) => t.topicId);

    // Update resubscriptions
    if (previousSubscriptions.length > 0) {
      await db
        .update(contactTopic)
        .set({
          status: "subscribed",
          subscribedAt: new Date(),
          unsubscribedAt: null,
        })
        .where(
          and(
            eq(contactTopic.contactId, contactId),
            or(
              ...previousSubscriptions.map((id) => eq(contactTopic.topicId, id))
            )
          )
        );
    }

    // Insert new subscriptions
    const trulyNewTopicIds = newTopicIds.filter(
      (id) => !previousSubscriptions.includes(id)
    );
    if (trulyNewTopicIds.length > 0) {
      await db.insert(contactTopic).values(
        trulyNewTopicIds.map((topicId) => ({
          contactId,
          topicId,
          status: "subscribed",
        }))
      );
    }

    // Update topic subscriber counts
    for (const topicId of newTopicIds) {
      await db
        .update(topic)
        .set({
          subscriberCount: sql`${topic.subscriberCount} + 1`,
        })
        .where(eq(topic.id, topicId));
    }

    // Revalidate
    revalidatePath("/[orgSlug]/contacts", "page");

    return { success: true };
  } catch (error) {
    const log = createActionLogger("subscribeContactToTopics", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), contactId, topicIds },
      "Failed to subscribe contact to topics"
    );
    return { success: false, error: "Failed to subscribe to topics" };
  }
}

/**
 * Bulk subscribe multiple contacts to topics
 */
export async function bulkSubscribeContactsToTopics(
  organizationId: string,
  contactIds: string[],
  topicIds: string[]
): Promise<{ success: boolean; error?: string; count?: number }> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    if (!["owner", "admin"].includes(access.role)) {
      return {
        success: false,
        error: "Only owners and admins can bulk subscribe contacts",
      };
    }

    let subscribed = 0;

    for (const contactId of contactIds) {
      // Get current subscriptions for this contact
      const existing = await db.query.contact.findFirst({
        where: (c, { and, eq }) =>
          and(eq(c.id, contactId), eq(c.organizationId, organizationId)),
        with: { topics: true },
      });

      if (!existing) continue;

      const currentTopicIds = new Set(
        existing.topics
          .filter((t) => t.status === "subscribed")
          .map((t) => t.topicId)
      );

      const newTopicIds = topicIds.filter((id) => !currentTopicIds.has(id));
      if (newTopicIds.length === 0) continue;

      // Check for resubscriptions
      const previousSubs = existing.topics
        .filter(
          (t) => t.status === "unsubscribed" && newTopicIds.includes(t.topicId)
        )
        .map((t) => t.topicId);

      if (previousSubs.length > 0) {
        await db
          .update(contactTopic)
          .set({
            status: "subscribed",
            subscribedAt: new Date(),
            unsubscribedAt: null,
          })
          .where(
            and(
              eq(contactTopic.contactId, contactId),
              or(...previousSubs.map((id) => eq(contactTopic.topicId, id)))
            )
          );
      }

      // Insert truly new subscriptions
      const trulyNew = newTopicIds.filter((id) => !previousSubs.includes(id));
      if (trulyNew.length > 0) {
        await db.insert(contactTopic).values(
          trulyNew.map((topicId) => ({
            contactId,
            topicId,
            status: "subscribed",
          }))
        );
      }

      // Update topic counts
      for (const topicId of newTopicIds) {
        await db
          .update(topic)
          .set({ subscriberCount: sql`${topic.subscriberCount} + 1` })
          .where(eq(topic.id, topicId));
      }

      subscribed++;
    }

    revalidatePath("/[orgSlug]/contacts", "page");
    return { success: true, count: subscribed };
  } catch (error) {
    const log = createActionLogger("bulkSubscribeContactsToTopics", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), contactCount: contactIds.length, topicIds },
      "Failed to bulk subscribe contacts"
    );
    return { success: false, error: "Failed to subscribe contacts" };
  }
}

/**
 * Bulk unsubscribe multiple contacts from topics
 */
export async function bulkUnsubscribeContactsFromTopics(
  organizationId: string,
  contactIds: string[],
  topicIds: string[]
): Promise<{ success: boolean; error?: string; count?: number }> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    if (!["owner", "admin"].includes(access.role)) {
      return {
        success: false,
        error: "Only owners and admins can bulk unsubscribe contacts",
      };
    }

    // Count how many subscriptions exist before updating
    const existingSubscriptions = await db
      .selectDistinct({ contactId: contactTopic.contactId })
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.status, "subscribed"),
          or(...contactIds.map((id) => eq(contactTopic.contactId, id))),
          or(...topicIds.map((id) => eq(contactTopic.topicId, id)))
        )
      );

    const unsubscribedCount = existingSubscriptions.length;

    // Update all subscriptions at once
    if (unsubscribedCount > 0) {
      await db
        .update(contactTopic)
        .set({
          status: "unsubscribed",
          unsubscribedAt: new Date(),
        })
        .where(
          and(
            eq(contactTopic.status, "subscribed"),
            or(...contactIds.map((id) => eq(contactTopic.contactId, id))),
            or(...topicIds.map((id) => eq(contactTopic.topicId, id)))
          )
        );

      // Update topic counts (decrement for each contact-topic pair)
      for (const topicId of topicIds) {
        const countResult = await db
          .select({ count: count() })
          .from(contactTopic)
          .where(
            and(
              eq(contactTopic.topicId, topicId),
              eq(contactTopic.status, "subscribed")
            )
          );

        await db
          .update(topic)
          .set({ subscriberCount: countResult[0]?.count ?? 0 })
          .where(eq(topic.id, topicId));
      }
    }

    revalidatePath("/[orgSlug]/contacts", "page");
    return { success: true, count: unsubscribedCount };
  } catch (error) {
    const log = createActionLogger("bulkUnsubscribeContactsFromTopics", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), contactCount: contactIds.length, topicIds },
      "Failed to bulk unsubscribe contacts"
    );
    return { success: false, error: "Failed to unsubscribe contacts" };
  }
}

/**
 * Unsubscribe a contact from topics
 */
export async function unsubscribeContactFromTopics(
  contactId: string,
  organizationId: string,
  topicIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Verify contact exists
    const existing = await db.query.contact.findFirst({
      where: (c, { and, eq }) =>
        and(eq(c.id, contactId), eq(c.organizationId, organizationId)),
    });

    if (!existing) {
      return { success: false, error: "Contact not found" };
    }

    // Update subscriptions to unsubscribed
    await db
      .update(contactTopic)
      .set({
        status: "unsubscribed",
        unsubscribedAt: new Date(),
      })
      .where(
        and(
          eq(contactTopic.contactId, contactId),
          eq(contactTopic.status, "subscribed"),
          or(...topicIds.map((id) => eq(contactTopic.topicId, id)))
        )
      );

    // Decrement topic subscriber counts
    for (const topicId of topicIds) {
      await db
        .update(topic)
        .set({
          subscriberCount: sql`GREATEST(${topic.subscriberCount} - 1, 0)`,
        })
        .where(eq(topic.id, topicId));
    }

    // Revalidate
    revalidatePath("/[orgSlug]/contacts", "page");

    return { success: true };
  } catch (error) {
    const log = createActionLogger("unsubscribeContactFromTopics", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), contactId, topicIds },
      "Failed to unsubscribe contact from topics"
    );
    return { success: false, error: "Failed to unsubscribe from topics" };
  }
}

/**
 * Bulk delete contacts
 */
export async function bulkDeleteContacts(
  organizationId: string,
  contactIds: string[]
): Promise<
  { success: true; count: number } | { success: false; error: string }
> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    // Only owners and admins can bulk delete
    if (!["owner", "admin"].includes(access.role)) {
      return {
        success: false,
        error: "Only owners and admins can delete contacts",
      };
    }

    if (contactIds.length === 0) {
      return { success: false, error: "No contacts selected" };
    }

    // Delete contacts (cascades to contact_topic)
    const result = await db
      .delete(contact)
      .where(
        and(
          eq(contact.organizationId, organizationId),
          inArray(contact.id, contactIds)
        )
      );

    // Revalidate
    revalidatePath("/[orgSlug]/contacts", "page");

    return { success: true, count: contactIds.length };
  } catch (error) {
    const log = createActionLogger("bulkDeleteContacts", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), count: contactIds.length },
      "Failed to bulk delete contacts"
    );
    return { success: false, error: "Failed to delete contacts" };
  }
}
