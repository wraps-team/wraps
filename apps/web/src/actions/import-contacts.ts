"use server";

import {
  auditLog,
  contact,
  contactTopic,
  db,
  notifyUser,
  topic,
} from "@wraps/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { trackContactsImported } from "@/lib/activation-tracking";
import { auditLogEntry, getAuditContext } from "@/lib/audit";
import type { ImportContactsResult, ImportDuplicateRow } from "@/lib/contacts";
import { createActionLogger } from "@/lib/logger";
import { checkContactLimit } from "@/lib/plan-limits";
import { revalidateContacts } from "./contacts";
import { hashEmail, hashPhone } from "./shared/hash";
import { checkPermission } from "./shared/permissions";
import { verifyOrgAccess } from "./shared/verify-org-access";

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

/**
 * Pull the Postgres error out of whatever Drizzle wrapped it in.
 *
 * A failed query arrives as a DrizzleQueryError whose `cause` chain ends at
 * the pg error carrying `code` and `constraint`. Reading the top-level error
 * alone gets you the whole parameterized INSERT as a message and none of the
 * detail that says what went wrong.
 */
function findPostgresError(
  error: unknown
): { code: string; constraint?: string } | null {
  let current = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === "object" && "code" in current) {
      const { code, constraint } = current as {
        code?: unknown;
        constraint?: unknown;
      };
      if (typeof code === "string") {
        return {
          code,
          constraint: typeof constraint === "string" ? constraint : undefined,
        };
      }
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * Turn a thrown import failure into a sentence the operator can act on.
 *
 * Returns null when we genuinely don't recognise it, so the caller keeps a
 * generic message rather than inventing a confident wrong one.
 */
function describeImportFailure(error: unknown): string | null {
  const pgError = findPostgresError(error);
  if (!pgError) {
    return null;
  }

  // Unique violation — the class that actually reached a customer (WEB-W),
  // and the only one the import path is known to produce. Anything else keeps
  // the generic message rather than a guess dressed up as a diagnosis.
  if (pgError.code === "23505") {
    if (pgError.constraint === "contact_unique_org_phone_idx") {
      return "Two rows in this file share a phone number. Remove the repeat and import again.";
    }
    if (pgError.constraint === "contact_unique_org_email_idx") {
      return "Two rows in this file share an email address. Remove the repeat and import again.";
    }
    return "This file repeats a contact that has to be unique. Remove the repeat and import again.";
  }

  return null;
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
  /**
   * Set on every chunk of a client-side chunked import except the last.
   *
   * The importer splits a large file across several calls so no single request
   * body hits the Server Action limit. Each call still writes its own contacts,
   * but the audit entry, notification, activation event and cache revalidation
   * are the *import's* side effects, not the chunk's — a 40,000-row file should
   * read as one import in the audit log, not twenty. Deferring them here lets
   * the final chunk emit them once, for the whole run.
   */
  deferSummary?: boolean;
  /**
   * Totals from the chunks already committed, folded into this call's summary
   * so the single audit entry and notification describe the whole import.
   */
  priorTotals?: {
    created: number;
    updated: number;
    skipped: number;
    errorCount: number;
  };
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
    const permError = checkPermission(access.role, "contacts", ["import"]);
    if (permError) return permError;
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

    const auditCtx = await getAuditContext();

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ row: number; error: string }> = [];
    const allCreatedContactIds: string[] = [];
    const allUpdatedContactIds: string[] = [];

    // Identities already claimed by an earlier row of this same file, mapped to
    // the row that claimed them. The duplicate lookups below only compare a row
    // against contacts already in the database, so two rows sharing an email or
    // phone both landed in the INSERT and tripped
    // contact_unique_org_{email,phone}_idx — aborting the whole batch
    // transaction and importing nothing. Held across batches, not per batch, so
    // the guard holds no matter how the rows are chunked.
    const seenEmailHashes = new Map<string, number>();
    const seenPhoneHashes = new Map<string, number>();
    const duplicates: ImportDuplicateRow[] = [];

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

        const emailHash = email ? hashEmail(email) : null;
        const phoneHash = phone ? hashPhone(phone) : null;

        // A repeat of a row this file already carried. Not a validation error
        // — the file just lists someone twice — so it counts as skipped the
        // way a duplicate of an existing contact does, but it is reported by
        // row so the operator can fix the source file.
        const firstEmailRow = emailHash
          ? seenEmailHashes.get(emailHash)
          : undefined;
        const firstPhoneRow = phoneHash
          ? seenPhoneHashes.get(phoneHash)
          : undefined;
        if (firstEmailRow !== undefined || firstPhoneRow !== undefined) {
          skipped++;
          duplicates.push(
            firstEmailRow !== undefined
              ? {
                  row: rowIndex,
                  firstRow: firstEmailRow,
                  field: "email",
                  value: email as string,
                }
              : {
                  row: rowIndex,
                  firstRow: firstPhoneRow as number,
                  field: "phone",
                  value: phone as string,
                }
          );
          continue;
        }
        if (emailHash) {
          seenEmailHashes.set(emailHash, rowIndex);
        }
        if (phoneHash) {
          seenPhoneHashes.set(phoneHash, rowIndex);
        }

        validRows.push({
          index: rowIndex,
          email,
          phone,
          emailHash,
          phoneHash,
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

      // Batch INSERT new contacts + UPDATE duplicates in one transaction per batch
      await db.transaction(async (tx) => {
        // Batch INSERT new contacts
        if (newRows.length > 0) {
          const insertedContacts = await tx
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
                // The deprecated `status`/`confirmedAt` columns are not written
                // here. `status` keeps its schema default; `confirmedAt` stays
                // null because nobody confirmed anything — an import is not an
                // opt-in. Read sendability from `emailStatus`.
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
              // Merge, never replace. A CSV carries only the columns the
              // operator exported; assigning the object wholesale deleted every
              // custom property the file happened not to mention — including
              // the ones segments filter on, with no undo.
              // `properties` is a `json` column and `||` is jsonb-only, so the
              // merge round-trips through jsonb.
              updateData.properties = sql`(COALESCE(${contact.properties}, '{}'::json)::jsonb || ${JSON.stringify(row.properties)}::jsonb)::json`;
            }

            if (Object.keys(updateData).length > 0) {
              await tx
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
      });
    }

    // What this run has done, counting the chunks that came before it. `created`
    // and friends stay per-call — they are this call's return value — while the
    // audit entry, notification and activation event describe the whole import.
    const runTotals = {
      created: created + (data.priorTotals?.created ?? 0),
      updated: updated + (data.priorTotals?.updated ?? 0),
      skipped: skipped + (data.priorTotals?.skipped ?? 0),
      errorCount: errors.length + (data.priorTotals?.errorCount ?? 0),
    };

    // Topic subscriptions + audit log in one final transaction
    await db.transaction(async (tx) => {
      // Topic subscriptions for all created + updated contacts
      const allContactIds = [...allCreatedContactIds, ...allUpdatedContactIds];
      if (validatedTopicIds.length > 0 && allContactIds.length > 0) {
        // For updated contacts, remove existing subscriptions to these topics first
        if (allUpdatedContactIds.length > 0) {
          await tx
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
          await tx
            .insert(contactTopic)
            .values(topicValues.slice(i, i + TOPIC_BATCH));
        }
      }

      // Whole-import side effects. A deferred chunk writes its contacts and
      // their topic subscriptions above, then leaves the summary to the chunk
      // that finishes the run.
      if (!data.deferSummary) {
        await tx.insert(auditLog).values(
          auditLogEntry(auditCtx, {
            organizationId,
            actorId: access.userId,
            actorEmail: access.userEmail,
            action: "contact.imported",
            resource: "contact",
            metadata: { count: runTotals.created, updated: runTotals.updated },
          })
        );
      }
    });

    if (data.deferSummary) {
      return { success: true, created, updated, skipped, errors, duplicates };
    }

    // Post-processing
    revalidateContacts(orgSlug);

    if (runTotals.created > 0) {
      trackContactsImported(access.userEmail, organizationId, {
        count: runTotals.created,
        firstContact: data.contacts[0],
      });
    }

    try {
      await notifyUser({
        userId: access.userId,
        organizationId,
        type: "contact.imported",
        title: `Contact import finished: ${runTotals.created} created, ${runTotals.updated} updated`,
        body:
          runTotals.skipped > 0 || runTotals.errorCount > 0
            ? `${runTotals.skipped} skipped, ${runTotals.errorCount} rows had errors.`
            : undefined,
        href: `/${orgSlug}/contacts`,
        data: {
          created: runTotals.created,
          updated: runTotals.updated,
          skipped: runTotals.skipped,
          errorCount: runTotals.errorCount,
        },
      });
    } catch (notifyError) {
      const log = createActionLogger("importContacts", { orgSlug });
      log.error(
        { err: notifyError },
        "Failed to write contact-import notification"
      );
    }

    return { success: true, created, updated, skipped, errors, duplicates };
  } catch (error) {
    const log = createActionLogger("importContacts", { orgSlug });
    const pgError = findPostgresError(error);
    log.error(
      {
        err: error,
        contactCount: data.contacts.length,
        pgCode: pgError?.code,
        pgConstraint: pgError?.constraint,
      },
      "Failed to import contacts"
    );
    return {
      success: false,
      error:
        describeImportFailure(error) ??
        "Failed to import contacts. The error has been logged and we're looking at it.",
    };
  }
}
