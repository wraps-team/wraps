"use server";

import { contact, contactTopic, db, topic } from "@wraps/db";
import { and, count, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { trackContactCreated } from "@/lib/activation-tracking";
import type {
  ContactStatus,
  CreateContactResult,
  DeleteContactResult,
  EmailStatus,
  GetContactResult,
  ListContactsResult,
  PreferredChannel,
  SmsStatus,
  UpdateContactResult,
} from "@/lib/contacts";
import { createActionLogger, serializeError } from "@/lib/logger";
import { checkContactLimit } from "@/lib/plan-limits";
import { hashEmail, hashPhone } from "./shared/hash";
import { verifyOrgAccess } from "./shared/verify-org-access";

// Re-export types for convenience
export type {
  ContactStatus,
  ContactWithMeta,
  CreateContactResult,
  DeleteContactResult,
  EmailStatus,
  GetContactResult,
  ListContactsResult,
  PreferredChannel,
  SmsStatus,
  UpdateContactResult,
} from "@/lib/contacts";

/**
 * Revalidate contacts page using the org slug
 */
export async function revalidateContacts(orgSlug: string): Promise<void> {
  revalidatePath(`/${orgSlug}/contacts`, "page");
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
    emailStatus?: EmailStatus;
    /** @deprecated Use emailStatus instead */
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

    const {
      page = 1,
      pageSize = 50,
      search,
      emailStatus,
      status,
      topicId,
    } = options;
    const offset = (page - 1) * pageSize;

    // Build where conditions
    const conditions = [eq(contact.organizationId, organizationId)];

    if (search) {
      conditions.push(ilike(contact.email, `%${search}%`));
    }

    // Prefer emailStatus over legacy status
    if (emailStatus) {
      conditions.push(eq(contact.emailStatus, emailStatus));
    } else if (status) {
      // Legacy fallback
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
        emailSuppressedAt: c.emailSuppressedAt,
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
        // Contact details
        firstName: c.firstName,
        lastName: c.lastName,
        company: c.company,
        jobTitle: c.jobTitle,
        preferredChannel: c.preferredChannel as PreferredChannel | null,
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
        emailSuppressedAt: c.emailSuppressedAt,
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
        // Contact details
        firstName: c.firstName,
        lastName: c.lastName,
        company: c.company,
        jobTitle: c.jobTitle,
        preferredChannel: c.preferredChannel as PreferredChannel | null,
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
    firstName?: string;
    lastName?: string;
    company?: string;
    jobTitle?: string;
    preferredChannel?: PreferredChannel | null;
    emailStatus?: EmailStatus;
    smsStatus?: SmsStatus;
    properties?: Record<string, unknown>;
    topicIds?: string[];
    /** @deprecated Use emailStatus instead */
    status?: ContactStatus;
  }
): Promise<CreateContactResult> {
  let orgSlug: string | undefined;
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }
    orgSlug = access.orgSlug;

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
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (email && !EMAIL_REGEX.test(email)) {
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
        // Contact details
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        company: data.company || null,
        jobTitle: data.jobTitle || null,
        preferredChannel: data.preferredChannel ?? null,
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

    // Subscribe to topics if provided, after verifying they belong to this org
    if (data.topicIds && data.topicIds.length > 0) {
      const ownedTopics = await db
        .select({ id: topic.id })
        .from(topic)
        .where(
          and(
            inArray(topic.id, data.topicIds),
            eq(topic.organizationId, organizationId)
          )
        );
      const ownedTopicIds = ownedTopics.map((t) => t.id);
      if (ownedTopicIds.length > 0) {
        await db.insert(contactTopic).values(
          ownedTopicIds.map((topicId) => ({
            contactId: newContact.id,
            topicId,
            status: "subscribed",
          }))
        );
      }
    }

    // Revalidate
    revalidateContacts(orgSlug);

    // Track activation event (fire-and-forget)
    trackContactCreated(access.userEmail, organizationId);

    // Return the created contact
    return await getContact(newContact.id, organizationId);
  } catch (error) {
    const log = createActionLogger("createContact", { orgSlug });
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
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    jobTitle?: string | null;
    preferredChannel?: PreferredChannel | null;
    emailStatus?: EmailStatus;
    smsStatus?: SmsStatus;
    properties?: Record<string, unknown>;
    /** @deprecated Use emailStatus instead */
    status?: ContactStatus;
  }
): Promise<UpdateContactResult> {
  let orgSlug: string | undefined;
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }
    orgSlug = access.orgSlug;

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
      } else if (data.emailStatus === "suppressed") {
        updateData.emailSuppressedAt = new Date();
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

    // Handle contact details fields
    if (data.firstName !== undefined) {
      updateData.firstName = data.firstName;
    }

    if (data.lastName !== undefined) {
      updateData.lastName = data.lastName;
    }

    if (data.company !== undefined) {
      updateData.company = data.company;
    }

    if (data.jobTitle !== undefined) {
      updateData.jobTitle = data.jobTitle;
    }

    if (data.preferredChannel !== undefined) {
      updateData.preferredChannel = data.preferredChannel;
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
    revalidateContacts(orgSlug);

    // Return updated contact
    return await getContact(contactId, organizationId);
  } catch (error) {
    const log = createActionLogger("updateContact", { orgSlug });
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
  let orgSlug: string | undefined;
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }
    orgSlug = access.orgSlug;

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
    revalidateContacts(orgSlug);

    return { success: true };
  } catch (error) {
    const log = createActionLogger("deleteContact", { orgSlug });
    log.error(
      { err: serializeError(error), contactId },
      "Failed to delete contact"
    );
    return { success: false, error: "Failed to delete contact" };
  }
}
