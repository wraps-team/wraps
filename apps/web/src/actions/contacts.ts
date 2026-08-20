"use server";

import {
  CONTACT_SORT_FIELDS,
  type ContactSort,
  type ContactSortField,
  deleteContact as dbDeleteContact,
  fetchTopicsForSubscription,
  findContactByEmailHash,
  findContactById,
  findContactByPhoneHash,
  findContactWithRelations,
  type InsertContactData,
  insertContact,
  listContactsWithRelations,
  subscribeContactToTopicsOnCreate,
  updateContactFields,
} from "@wraps/db";
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
import { checkContactLimit } from "@/lib/plan-limits";
import { hashEmail, hashPhone } from "./shared/hash";
import { orgAction } from "./shared/org-action";

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

type ListContactsOptions = {
  page?: number;
  pageSize?: number;
  search?: string;
  emailStatus?: EmailStatus;
  /** @deprecated Use emailStatus instead */
  status?: ContactStatus;
  topicId?: string;
  /**
   * Raw, URL-supplied sort — audit F14. Untrusted: validated below against
   * `CONTACT_SORT_FIELDS` before it ever reaches `listContactsWithRelations`.
   * An unrecognized `sortBy` (a stale bookmark, a hand-edited URL, a future
   * caller that isn't this page) falls back to the default rather than
   * reaching the query builder — this action is a server boundary other
   * callers can hit directly, not just `contacts/page.tsx`.
   */
  sortBy?: string;
  sortDir?: string;
};

/** Narrows an untrusted `sortBy`/`sortDir` pair to a real `ContactSort`, or `undefined` for the default. */
function resolveContactSort(
  sortBy: string | undefined,
  sortDir: string | undefined
): ContactSort | undefined {
  const field = CONTACT_SORT_FIELDS.find(
    (candidate): candidate is ContactSortField => candidate === sortBy
  );
  if (!field) {
    return;
  }
  return { field, direction: sortDir === "asc" ? "asc" : "desc" };
}

type CreateContactData = {
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
};

type UpdateContactData = {
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
};

/**
 * List contacts for an organization with pagination and search
 */
export const listContacts = orgAction(
  {
    name: "listContacts",
    resource: "contacts",
    permission: ["read"],
    orgId: (organizationId: string, _options?: ListContactsOptions) =>
      organizationId,
    onError: "Failed to fetch contacts",
  },
  async (
    ctx,
    organizationId: string,
    options: ListContactsOptions = {}
  ): Promise<ListContactsResult> => {
    const {
      page = 1,
      pageSize = 50,
      search,
      emailStatus,
      status,
      topicId,
      sortBy,
      sortDir,
    } = options;

    const { contacts, total } = await listContactsWithRelations(
      organizationId,
      { emailStatus, status, search },
      { page, pageSize },
      topicId,
      resolveContactSort(sortBy, sortDir)
    );

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
  }
);

/**
 * Get a single contact by ID
 */
export const getContact = orgAction(
  {
    name: "getContact",
    resource: "contacts",
    permission: ["read"],
    orgId: (_contactId: string, organizationId: string) => organizationId,
    onError: "Failed to fetch contact",
  },
  async (
    ctx,
    contactId: string,
    _organizationId: string
  ): Promise<GetContactResult> => {
    const c = await findContactWithRelations(contactId, ctx.organizationId);

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
  }
);

/**
 * Create a new contact
 */
export const createContact = orgAction(
  {
    name: "createContact",
    resource: "contacts",
    permission: ["write"],
    orgId: (organizationId: string, _data: CreateContactData) => organizationId,
    onError: "Failed to create contact",
  },
  async (
    ctx,
    organizationId: string,
    data: CreateContactData
  ): Promise<CreateContactResult> => {
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
      const existingByEmail = await findContactByEmailHash(
        emailHashValue,
        organizationId
      );
      if (existingByEmail) {
        return {
          success: false,
          error: "A contact with this email already exists",
        };
      }
    }

    // Check for duplicate by phone
    if (phoneHashValue) {
      const existingByPhone = await findContactByPhoneHash(
        phoneHashValue,
        organizationId
      );
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

    // Verify topic ownership before transaction
    let ownedTopicIds: string[] = [];
    if (data.topicIds && data.topicIds.length > 0) {
      const ownedTopics = await fetchTopicsForSubscription(
        data.topicIds,
        organizationId
      );
      ownedTopicIds = ownedTopics.map((t) => t.id);
    }

    // Create contact + subscribe to topics + write audit log in one transaction
    const channel = email ? "email" : "sms";
    const newContact = await ctx.audited(
      async (tx) => {
        const inserted = await insertContact(
          {
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
            createdBy: ctx.access.userId,
            // Legacy fields
            status: legacyStatus,
            confirmedAt: legacyStatus === "active" ? new Date() : null,
          } as InsertContactData,
          tx
        );

        if (!inserted) {
          throw new Error("Failed to create contact");
        }

        if (ownedTopicIds.length > 0) {
          await subscribeContactToTopicsOnCreate(
            inserted.id,
            ownedTopicIds,
            tx
          );
        }

        return inserted;
      },
      (inserted) => ({
        action: "contact.created" as const,
        resource: "contact",
        resourceId: inserted.id,
        metadata: { contactId: inserted.id, email: email ?? null, channel },
      })
    );

    // Revalidate
    revalidateContacts(ctx.access.orgSlug);

    // Track activation event
    await trackContactCreated(
      ctx.access.userEmail,
      organizationId,
      {},
      { firstName: data.firstName, lastName: data.lastName, email }
    );

    // Return the created contact
    return await getContact(newContact.id, organizationId);
  }
);

/**
 * Update a contact
 */
export const updateContact = orgAction(
  {
    name: "updateContact",
    resource: "contacts",
    permission: ["write"],
    orgId: (
      _contactId: string,
      organizationId: string,
      _data: UpdateContactData
    ) => organizationId,
    onError: "Failed to update contact",
  },
  async (
    ctx,
    contactId: string,
    organizationId: string,
    data: UpdateContactData
  ): Promise<UpdateContactResult> => {
    // Verify contact exists
    const existing = await findContactById(contactId, organizationId);

    if (!existing) {
      return { success: false, error: "Contact not found" };
    }

    // Build update data
    const updateData: Partial<InsertContactData> = {
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
        const duplicate = await findContactByEmailHash(
          emailHashValue,
          organizationId
        );
        if (duplicate && duplicate.id !== contactId) {
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
        const duplicate = await findContactByPhoneHash(
          phoneHashValue,
          organizationId
        );
        if (duplicate && duplicate.id !== contactId) {
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

    const updatedFields = Object.keys(data).filter(
      (k) => data[k as keyof typeof data] !== undefined
    );

    // Update contact + write audit log in one transaction
    await ctx.audited(
      async (tx) => {
        await updateContactFields(
          contactId,
          organizationId,
          updateData as Partial<InsertContactData> & Record<string, unknown>,
          tx
        );
        return { contactId };
      },
      () => ({
        action: "contact.updated" as const,
        resource: "contact",
        resourceId: contactId,
        metadata: { contactId, fields: updatedFields },
      })
    );

    // Revalidate
    revalidateContacts(ctx.access.orgSlug);

    // Return updated contact
    return await getContact(contactId, organizationId);
  }
);

/**
 * Delete a contact
 */
export const deleteContact = orgAction(
  {
    name: "deleteContact",
    resource: "contacts",
    permission: ["delete"],
    orgId: (_contactId: string, organizationId: string) => organizationId,
    onError: "Failed to delete contact",
  },
  async (
    ctx,
    contactId: string,
    organizationId: string
  ): Promise<DeleteContactResult> => {
    // Verify contact exists
    const existing = await findContactById(contactId, organizationId);

    if (!existing) {
      return { success: false, error: "Contact not found" };
    }

    // Delete contact + write audit log in one transaction
    await ctx.audited(
      async (tx) => {
        await dbDeleteContact(contactId, organizationId, tx);
        return { contactId };
      },
      () => ({
        action: "contact.deleted" as const,
        resource: "contact",
        resourceId: contactId,
        metadata: { contactId },
      })
    );

    // Revalidate
    revalidateContacts(ctx.access.orgSlug);

    return { success: true };
  }
);
