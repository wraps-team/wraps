"use server";

import { contact, contactTopic, db, topic } from "@wraps/db";
import { and, eq, inArray } from "drizzle-orm";
import { trackContactsImported } from "@/lib/activation-tracking";
import type { ImportContactsResult } from "@/lib/contacts";
import { createActionLogger, serializeError } from "@/lib/logger";
import { checkContactLimit } from "@/lib/plan-limits";
import { revalidateContacts } from "./contacts";
import { hashEmail, hashPhone } from "./shared/hash";
import { verifyOrgAccess } from "./shared/verify-org-access";

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

function parseDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d;
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT ACTION
// ═══════════════════════════════════════════════════════════════════════════

export type ImportContactInput = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  createdAt?: string;
  properties?: Record<string, string>;
};

export type ImportContactsData = {
  contacts: ImportContactInput[];
  topicIds?: string[];
  duplicateStrategy: "skip" | "update";
};

const BATCH_SIZE = 100;

export async function importContacts(
  organizationId: string,
  data: ImportContactsData
): Promise<ImportContactsResult> {
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

    if (data.contacts.length === 0) {
      return { success: false, error: "No contacts provided" };
    }

    const MAX_IMPORT_SIZE = 10_000;
    if (data.contacts.length > MAX_IMPORT_SIZE) {
      return {
        success: false,
        error: `Import size exceeds maximum of ${MAX_IMPORT_SIZE} contacts per batch.`,
      };
    }

    // Validate topicIds belong to this organization to prevent cross-org IDOR
    let validatedTopicIds: string[] = [];
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
      validatedTopicIds = ownedTopics.map((t) => t.id);
    }

    // Check contact limit once up-front
    const limitCheck = await checkContactLimit(organizationId);
    if (!limitCheck.allowed) {
      return {
        success: false,
        error:
          limitCheck.message ??
          "You've reached your contact limit. Please upgrade your plan.",
      };
    }

    const remainingSlots =
      limitCheck.limit === -1
        ? Number.POSITIVE_INFINITY
        : limitCheck.limit - limitCheck.current;

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ row: number; error: string }> = [];
    const allCreatedContactIds: string[] = [];
    const allUpdatedContactIds: string[] = [];

    // Process in batches
    for (let i = 0; i < data.contacts.length; i += BATCH_SIZE) {
      const batch = data.contacts.slice(i, i + BATCH_SIZE);

      // Validate rows in this batch
      type ValidatedRow = {
        index: number;
        email: string | null;
        phone: string | null;
        emailHash: string | null;
        phoneHash: string | null;
        firstName: string | null;
        lastName: string | null;
        company: string | null;
        jobTitle: string | null;
        createdAt: Date | null;
        properties: Record<string, string>;
      };

      const validRows: ValidatedRow[] = [];

      for (let j = 0; j < batch.length; j++) {
        const row = batch[j];
        const rowIndex = i + j + 1; // 1-based row number (for user display)
        const email = row.email?.toLowerCase().trim() || null;
        const phone = row.phone?.trim() || null;

        if (!(email || phone)) {
          errors.push({
            row: rowIndex,
            error: "Row must have at least an email or phone number",
          });
          continue;
        }

        if (email && !isValidEmail(email)) {
          errors.push({ row: rowIndex, error: `Invalid email: ${email}` });
          continue;
        }

        validRows.push({
          index: rowIndex,
          email,
          phone,
          emailHash: email ? hashEmail(email) : null,
          phoneHash: phone ? hashPhone(phone) : null,
          firstName: row.firstName?.trim() || null,
          lastName: row.lastName?.trim() || null,
          company: row.company?.trim() || null,
          jobTitle: row.jobTitle?.trim() || null,
          createdAt: row.createdAt ? parseDate(row.createdAt) : null,
          properties: row.properties ?? {},
        });
      }

      if (validRows.length === 0) {
        continue;
      }

      // Batch-lookup duplicates by email hash
      const emailHashes = validRows
        .map((r) => r.emailHash)
        .filter((h): h is string => h !== null);

      const existingByEmail =
        emailHashes.length > 0
          ? await db.query.contact.findMany({
              where: (c, { and: a, eq: e, inArray: iA }) =>
                a(
                  e(c.organizationId, organizationId),
                  iA(c.emailHash, emailHashes)
                ),
              columns: { id: true, emailHash: true },
            })
          : [];

      const existingEmailHashMap = new Map(
        existingByEmail.map((c) => [c.emailHash, c.id])
      );

      // Batch-lookup duplicates by phone hash
      const phoneHashes = validRows
        .map((r) => r.phoneHash)
        .filter((h): h is string => h !== null);

      const existingByPhone =
        phoneHashes.length > 0
          ? await db.query.contact.findMany({
              where: (c, { and: a, eq: e, inArray: iA }) =>
                a(
                  e(c.organizationId, organizationId),
                  iA(c.phoneHash, phoneHashes)
                ),
              columns: { id: true, phoneHash: true },
            })
          : [];

      const existingPhoneHashMap = new Map(
        existingByPhone.map((c) => [c.phoneHash, c.id])
      );

      // Separate new vs duplicate rows
      const newRows: ValidatedRow[] = [];
      const duplicateRows: Array<{
        row: ValidatedRow;
        existingContactId: string;
      }> = [];

      for (const row of validRows) {
        const existingId =
          (row.emailHash && existingEmailHashMap.get(row.emailHash)) ||
          (row.phoneHash && existingPhoneHashMap.get(row.phoneHash)) ||
          null;

        if (existingId) {
          if (data.duplicateStrategy === "update") {
            duplicateRows.push({ row, existingContactId: existingId });
          } else {
            skipped++;
          }
        } else {
          newRows.push(row);
        }
      }

      // Check capacity for new contacts
      if (created + newRows.length > remainingSlots) {
        const canAdd = Math.max(0, remainingSlots - created);
        const overflow = newRows.splice(canAdd);
        for (const row of overflow) {
          errors.push({
            row: row.index,
            error: "Contact limit reached on your current plan",
          });
        }
      }

      // Batch INSERT new contacts
      if (newRows.length > 0) {
        const insertedContacts = await db
          .insert(contact)
          .values(
            newRows.map((row) => ({
              organizationId,
              email: row.email,
              emailHash: row.emailHash,
              emailStatus: row.email ? ("active" as const) : null,
              emailVerifiedAt: row.email ? new Date() : null,
              phone: row.phone,
              phoneHash: row.phoneHash,
              smsStatus: row.phone ? ("pending_consent" as const) : null,
              firstName: row.firstName,
              lastName: row.lastName,
              company: row.company,
              jobTitle: row.jobTitle,
              properties: row.properties,
              createdBy: access.userId,
              status: "active" as const,
              confirmedAt: new Date(),
              ...(row.createdAt ? { createdAt: row.createdAt } : {}),
            }))
          )
          .returning({ id: contact.id });

        created += insertedContacts.length;
        allCreatedContactIds.push(...insertedContacts.map((c) => c.id));
      }

      // UPDATE duplicate contacts (individual updates for varied data)
      for (const { row, existingContactId } of duplicateRows) {
        try {
          const updateData: Record<string, unknown> = {};
          if (row.firstName) {
            updateData.firstName = row.firstName;
          }
          if (row.lastName) {
            updateData.lastName = row.lastName;
          }
          if (row.company) {
            updateData.company = row.company;
          }
          if (row.jobTitle) {
            updateData.jobTitle = row.jobTitle;
          }
          if (row.properties && Object.keys(row.properties).length > 0) {
            // Merge properties using SQL jsonb concat
            updateData.properties = row.properties;
          }

          if (Object.keys(updateData).length > 0) {
            await db
              .update(contact)
              .set(updateData)
              .where(
                and(
                  eq(contact.id, existingContactId),
                  eq(contact.organizationId, organizationId)
                )
              );
          }
          updated++;
          allUpdatedContactIds.push(existingContactId);
        } catch {
          errors.push({
            row: row.index,
            error: "Failed to update existing contact",
          });
        }
      }
    }

    // Topic subscriptions for all created + updated contacts
    const allContactIds = [...allCreatedContactIds, ...allUpdatedContactIds];
    if (validatedTopicIds.length > 0 && allContactIds.length > 0) {
      // For updated contacts, remove existing subscriptions to these topics first
      if (allUpdatedContactIds.length > 0) {
        await db
          .delete(contactTopic)
          .where(
            and(
              inArray(contactTopic.contactId, allUpdatedContactIds),
              inArray(contactTopic.topicId, validatedTopicIds)
            )
          );
      }

      // Batch insert topic subscriptions
      const topicValues = allContactIds.flatMap((contactId) =>
        validatedTopicIds.map((topicId) => ({
          contactId,
          topicId,
          status: "subscribed",
        }))
      );

      // Insert in chunks to avoid query size limits
      const TOPIC_BATCH = 500;
      for (let i = 0; i < topicValues.length; i += TOPIC_BATCH) {
        await db
          .insert(contactTopic)
          .values(topicValues.slice(i, i + TOPIC_BATCH));
      }
    }

    // Post-processing
    revalidateContacts(orgSlug);

    if (created > 0) {
      trackContactsImported(access.userEmail, organizationId, {
        count: created,
      });
    }

    return { success: true, created, updated, skipped, errors };
  } catch (error) {
    const log = createActionLogger("importContacts", { orgSlug });
    log.error(
      { err: serializeError(error), contactCount: data.contacts.length },
      "Failed to import contacts"
    );
    return { success: false, error: "Failed to import contacts" };
  }
}
