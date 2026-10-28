/**
 * Contacts import, SES email validation and export for the `/v1/contacts`
 * bulk routes (routes/contacts-bulk.ts).
 *
 * Lifted from apps/web/src/actions/import-contacts.ts (`importContacts`) and
 * apps/web/src/actions/export.ts (`exportAllContacts`). The web actions stay
 * as they are. What differs from the action, on purpose:
 * - no `revalidateContacts`, no `'use server'` / `headers()` coupling: the
 *   caller passes the actor, the org and the request IP / user agent;
 * - no chunking (`deferSummary` / `priorTotals`): the API takes one request
 *   of up to MAX_IMPORT_SIZE rows and writes its summary in the same call;
 * - failures come back as `{ ok: false, status, error }` so the route can set
 *   the HTTP status; the action returns `{ success: false, error }`.
 * Permission gating happens in the route (`requirePermission`), before this.
 */

import { createHash } from "node:crypto";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { notifyUser } from "@wraps/auth/notify";
import {
  auditLog,
  awsAccount,
  contact,
  contactTopic,
  db,
  type EmailStatus,
  escapeIlike,
  member,
  organization,
  topic,
  user,
} from "@wraps/db";
import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { log } from "../lib/logger";
import { checkContactLimitForOrg } from "./contact-limits";
import { getCredentials } from "./credentials";
import {
  type EmailValidationVerdict,
  SesValidationAccessDeniedError,
  validateEmailAddressesWithSes,
} from "./ses-email-validation";

/** Same cap the dashboard action enforces per import call. */
export const MAX_IMPORT_SIZE = 10_000;
/** Rows validated and written per transaction (action BATCH_SIZE). */
const BATCH_SIZE = 100;
/** Addresses per validate call; matches one import batch. */
export const MAX_VALIDATE_ADDRESSES = BATCH_SIZE;
/** Row cap of one export (action MAX_EXPORT_ROWS). */
export const MAX_EXPORT_ROWS = 50_000;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SMS_STATUSES = [
  "pending_consent",
  "opted_in",
  "opted_out",
  "invalid",
] as const;

export type ServiceFailure = {
  ok: false;
  status: 400 | 402 | 403 | 404 | 409 | 429;
  error: string;
};

// ───────────────────────────────────────────────────────────────────────────
// Hashing: must match apps/web/src/actions/shared/hash.ts exactly, because
// dedupe compares these hashes against rows the dashboard wrote.
// ───────────────────────────────────────────────────────────────────────────

function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

function hashPhone(phone: string): string {
  const normalized = phone.replace(/\D/g, "");
  return createHash("sha256").update(normalized).digest("hex");
}

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

/** Pull the Postgres error out of whatever Drizzle wrapped it in. */
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

/** Same sentences as the action's `describeImportFailure`. */
function describeImportFailure(error: unknown): string | null {
  const pgError = findPostgresError(error);
  if (!pgError || pgError.code !== "23505") {
    return null;
  }
  if (pgError.constraint === "contact_unique_org_phone_idx") {
    return "Two rows in this file share a phone number. Remove the repeat and import again.";
  }
  if (pgError.constraint === "contact_unique_org_email_idx") {
    return "Two rows in this file share an email address. Remove the repeat and import again.";
  }
  return "This file repeats a contact that has to be unique. Remove the repeat and import again.";
}

// ───────────────────────────────────────────────────────────────────────────
// SES validation (shared by import and validate)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Load an org-owned AWS account for SES validation and build an SES client
 * from its role. Same checks, in the same order, as the action: the account
 * must belong to the org, its last-measured SES plan must be PRO or ENTERPRISE,
 * and the role must assume.
 */
async function sesClientFor(
  organizationId: string,
  awsAccountId: string
): Promise<{ ok: true; client: SESv2Client } | ServiceFailure> {
  const account = await db.query.awsAccount.findFirst({
    where: and(
      eq(awsAccount.id, awsAccountId),
      eq(awsAccount.organizationId, organizationId)
    ),
  });
  if (!account) {
    return {
      ok: false,
      status: 404,
      error: "AWS account for SES validation was not found.",
    };
  }

  // Only PRO and ENTERPRISE carry the Email Address Insights allowance. The
  // literal comparison is the whole check; the action's isSesPricingPlan guard
  // only narrowed a string that this comparison already fixes.
  const plan = account.healthDetail?.sesPricingPlan?.current;
  if (plan !== "PRO" && plan !== "ENTERPRISE") {
    return {
      ok: false,
      status: 400,
      error:
        "This AWS account's SES plan no longer includes email validation. Refresh and try again.",
    };
  }

  let credentials: Awaited<ReturnType<typeof getCredentials>>;
  try {
    credentials = await getCredentials(account.id, organizationId);
  } catch (error) {
    // Different causes get different messages (coding standards): a denied
    // AssumeRole is a trust-policy problem, anything else is a connection one.
    if (isAccessDenied(error)) {
      return {
        ok: false,
        status: 403,
        error:
          "Wraps can't assume the IAM role for this AWS account. Check the role's trust policy and external ID.",
      };
    }
    log.warn("SES validation could not load AWS credentials", {
      awsAccountId: account.id,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return {
      ok: false,
      status: 400,
      error:
        "Wraps couldn't connect to this AWS account to validate addresses. Check the account's IAM role.",
    };
  }

  return {
    ok: true,
    client: new SESv2Client({
      region: account.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    }),
  };
}

function isAccessDenied(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AccessDenied" || error.message.includes("AccessDenied"))
  );
}

const ACCESS_DENIED_MESSAGE =
  "Wraps can't validate addresses: this account's wraps-console-access-role is missing ses:GetEmailAddressInsights. Run wraps platform update-role, then try again.";

// ───────────────────────────────────────────────────────────────────────────
// Validate
// ───────────────────────────────────────────────────────────────────────────

export type ValidateEmailsResult = {
  ok: true;
  verdicts: Record<string, EmailValidationVerdict>;
  validatedCount: number;
  stoppedEarly: boolean;
  /** Addresses that failed the syntax check and were not sent to SES. */
  invalid: string[];
};

/**
 * Run SES Email Address Insights over `emails` with the org's validation
 * account. Only the org's own AWS account row is read; no contact is read.
 * Syntax-invalid addresses are reported back and never sent to SES.
 */
export async function validateEmailsForOrg(input: {
  organizationId: string;
  awsAccountId: string;
  emails: string[];
}): Promise<ValidateEmailsResult | ServiceFailure> {
  const ses = await sesClientFor(input.organizationId, input.awsAccountId);
  if (!ses.ok) {
    return ses;
  }

  const normalized = input.emails.map((e) => e.toLowerCase().trim());
  const invalid = normalized.filter((e) => !isValidEmail(e));
  const candidates = normalized.filter((e) => isValidEmail(e));

  if (candidates.length === 0) {
    return {
      ok: true,
      verdicts: {},
      validatedCount: 0,
      stoppedEarly: false,
      invalid,
    };
  }

  try {
    const result = await validateEmailAddressesWithSes(ses.client, candidates);
    return { ok: true, ...result, invalid };
  } catch (error) {
    if (error instanceof SesValidationAccessDeniedError) {
      return { ok: false, status: 403, error: ACCESS_DENIED_MESSAGE };
    }
    throw error;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Import
// ───────────────────────────────────────────────────────────────────────────

export type ImportContactRow = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  createdAt?: string;
  smsStatus?: string;
  smsConsentedAt?: string;
  properties?: Record<string, string>;
};

export type ImportDuplicate = {
  row: number;
  firstRow: number;
  field: "email" | "phone";
  value: string;
};

export type ImportResult = {
  ok: true;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
  duplicates: ImportDuplicate[];
};

export type ImportInput = {
  organizationId: string;
  userId: string;
  contacts: ImportContactRow[];
  topicIds?: string[];
  duplicateStrategy: "skip" | "update";
  planId: string | null;
  sesValidation?: { awsAccountId: string };
  ipAddress: string | null;
  userAgent: string | null;
};

export async function importContactsForOrg(
  input: ImportInput
): Promise<ImportResult | ServiceFailure> {
  const { organizationId, userId } = input;

  if (input.contacts.length === 0) {
    return { ok: false, status: 400, error: "No contacts provided" };
  }
  if (input.contacts.length > MAX_IMPORT_SIZE) {
    return {
      ok: false,
      status: 400,
      error: `Import size exceeds maximum of ${MAX_IMPORT_SIZE} contacts per batch.`,
    };
  }

  // Topic ids must belong to this org (cross-org IDOR guard, as in the action).
  let validatedTopicIds: string[] = [];
  if (input.topicIds && input.topicIds.length > 0) {
    const ownedTopics = await db
      .select({ id: topic.id })
      .from(topic)
      .where(
        and(
          inArray(topic.id, input.topicIds),
          eq(topic.organizationId, organizationId)
        )
      );
    validatedTopicIds = ownedTopics.map((t) => t.id);
  }

  const limitCheck = await checkContactLimitForOrg(
    organizationId,
    input.planId
  );
  if (!limitCheck.allowed) {
    return {
      ok: false,
      status: 402,
      error:
        limitCheck.message ??
        "You've reached your contact limit. Please upgrade your plan.",
    };
  }
  const remainingSlots =
    limitCheck.limit === -1
      ? Number.POSITIVE_INFINITY
      : limitCheck.limit - limitCheck.current;

  let validationSesClient: SESv2Client | undefined;
  if (input.sesValidation) {
    const ses = await sesClientFor(
      organizationId,
      input.sesValidation.awsAccountId
    );
    if (!ses.ok) {
      return ses;
    }
    validationSesClient = ses.client;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: Array<{ row: number; error: string }> = [];
  const allCreatedContactIds: string[] = [];
  const allUpdatedContactIds: string[] = [];

  // Identities already claimed by an earlier row of this file (see the action
  // for why these are held across batches).
  const seenEmailHashes = new Map<string, number>();
  const seenPhoneHashes = new Map<string, number>();
  const duplicates: ImportDuplicate[] = [];

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
    smsStatus: (typeof SMS_STATUSES)[number] | null;
    smsConsentedAt: Date | null;
    properties: Record<string, string>;
  };

  try {
    for (let i = 0; i < input.contacts.length; i += BATCH_SIZE) {
      const batch = input.contacts.slice(i, i + BATCH_SIZE);
      let validRows: ValidatedRow[] = [];

      for (let j = 0; j < batch.length; j++) {
        const row = batch[j];
        const rowIndex = i + j + 1;
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

        let smsStatus: (typeof SMS_STATUSES)[number] | null = null;
        const rawSmsStatus = row.smsStatus?.trim().toLowerCase();
        if (rawSmsStatus) {
          const match = SMS_STATUSES.find((s) => s === rawSmsStatus);
          if (!match) {
            errors.push({
              row: rowIndex,
              error: `Invalid SMS status: ${row.smsStatus}. Use one of ${SMS_STATUSES.join(", ")}.`,
            });
            continue;
          }
          if (phone) {
            smsStatus = match;
          }
        }

        let smsConsentedAt: Date | null = null;
        const rawConsentDate = row.smsConsentedAt?.trim();
        if (rawConsentDate) {
          const parsedConsent = parseDate(rawConsentDate);
          if (!parsedConsent) {
            errors.push({
              row: rowIndex,
              error: `Invalid SMS consent date: ${row.smsConsentedAt}`,
            });
            continue;
          }
          if (smsStatus === "opted_in") {
            smsConsentedAt = parsedConsent;
          }
        }
        if (smsStatus === "opted_in" && !smsConsentedAt) {
          smsConsentedAt = new Date();
        }

        const emailHash = email ? hashEmail(email) : null;
        const phoneHash = phone ? hashPhone(phone) : null;

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
          smsStatus,
          smsConsentedAt,
          properties: row.properties ?? {},
        });
      }

      // Opt-in SES validation: a LOW verdict drops the row from this import.
      if (validationSesClient && validRows.length > 0) {
        const emailsToCheck = validRows
          .map((row) => row.email)
          .filter((email): email is string => email !== null);

        if (emailsToCheck.length > 0) {
          let validation: Awaited<
            ReturnType<typeof validateEmailAddressesWithSes>
          >;
          try {
            validation = await validateEmailAddressesWithSes(
              validationSesClient,
              emailsToCheck
            );
          } catch (validationError) {
            if (validationError instanceof SesValidationAccessDeniedError) {
              return { ok: false, status: 403, error: ACCESS_DENIED_MESSAGE };
            }
            throw validationError;
          }

          const lowConfidenceEmails = new Set(
            Object.entries(validation.verdicts)
              .filter(([, verdict]) => verdict === "LOW")
              .map(([email]) => email)
          );
          if (lowConfidenceEmails.size > 0) {
            validRows = validRows.filter((row) => {
              if (row.email && lowConfidenceEmails.has(row.email)) {
                errors.push({ row: row.index, error: "Failed SES validation" });
                return false;
              }
              return true;
            });
          }

          if (validation.stoppedEarly) {
            return {
              ok: false,
              status: 429,
              error: `SES validation was throttled after checking ${validation.validatedCount.toLocaleString()} address${validation.validatedCount === 1 ? "" : "es"}. ${created.toLocaleString()} contact${created === 1 ? "" : "s"} from this file were imported before this happened — re-run the import to pick up the rest.`,
            };
          }
        }
      }

      if (validRows.length === 0) {
        continue;
      }

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
          if (input.duplicateStrategy === "update") {
            duplicateRows.push({ row, existingContactId: existingId });
          } else {
            skipped++;
          }
        } else {
          newRows.push(row);
        }
      }

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

      await db.transaction(async (tx) => {
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
                smsStatus: row.phone
                  ? (row.smsStatus ?? ("pending_consent" as const))
                  : null,
                smsConsentedAt: row.smsConsentedAt,
                smsOptedOutAt:
                  row.smsStatus === "opted_out" ? new Date() : null,
                smsInvalidAt: row.smsStatus === "invalid" ? new Date() : null,
                firstName: row.firstName,
                lastName: row.lastName,
                company: row.company,
                jobTitle: row.jobTitle,
                properties: row.properties,
                createdBy: userId,
                ...(row.createdAt ? { createdAt: row.createdAt } : {}),
              }))
            )
            .returning({ id: contact.id });

          created += insertedContacts.length;
          allCreatedContactIds.push(...insertedContacts.map((c) => c.id));
        }

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
              // Merge, never replace (see the action for the data-loss history).
              updateData.properties = sql`(COALESCE(${contact.properties}, '{}'::json)::jsonb || ${JSON.stringify(row.properties)}::jsonb)::json`;
            }
            // Consent is only ever filled in, never overwritten.
            if (row.smsStatus) {
              const undecided = sql`(${contact.smsStatus} IS NULL OR ${contact.smsStatus} = 'pending_consent')`;
              updateData.smsStatus = sql`CASE WHEN ${undecided} THEN ${row.smsStatus} ELSE ${contact.smsStatus} END`;
              if (row.smsConsentedAt) {
                updateData.smsConsentedAt = sql`CASE WHEN ${undecided} THEN ${row.smsConsentedAt.toISOString()}::timestamp ELSE ${contact.smsConsentedAt} END`;
              }
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

    await db.transaction(async (tx) => {
      const allContactIds = [...allCreatedContactIds, ...allUpdatedContactIds];
      if (validatedTopicIds.length > 0 && allContactIds.length > 0) {
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
        const topicValues = allContactIds.flatMap((contactId) =>
          validatedTopicIds.map((topicId) => ({
            contactId,
            topicId,
            status: "subscribed",
          }))
        );
        const TOPIC_BATCH = 500;
        for (let i = 0; i < topicValues.length; i += TOPIC_BATCH) {
          await tx
            .insert(contactTopic)
            .values(topicValues.slice(i, i + TOPIC_BATCH));
        }
      }

      // The actor's email, read through the membership so the lookup is
      // org-scoped (the user table itself has no organizationId).
      const [actor] = await tx
        .select({ email: user.email })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(
          and(
            eq(member.organizationId, organizationId),
            eq(member.userId, userId)
          )
        )
        .limit(1);
      await tx.insert(auditLog).values({
        organizationId,
        userId,
        actorEmail: actor?.email ?? "",
        action: "contact.imported",
        resource: "contact",
        resourceId: null,
        metadata: { count: created, updated },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
    });

    // Post-processing: the notification is best-effort, as in the action.
    const [org] = await db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    try {
      await notifyUser({
        userId,
        organizationId,
        type: "contact.imported",
        title: `Contact import finished: ${created} created, ${updated} updated`,
        body:
          skipped > 0 || errors.length > 0
            ? `${skipped} skipped, ${errors.length} rows had errors.`
            : undefined,
        href: `/${org?.slug ?? ""}/contacts`,
        data: {
          created,
          updated,
          skipped,
          errorCount: errors.length,
        },
      });
    } catch (notifyError) {
      log.error("Failed to write contact-import notification", notifyError);
    }

    return { ok: true, created, updated, skipped, errors, duplicates };
  } catch (error) {
    // A recognised unique violation is the operator's file to fix: a 409 with
    // the sentence to fix it. Anything else is an incident; rethrow so the
    // error handler logs it and returns 500.
    const message = describeImportFailure(error);
    if (message) {
      const pgError = findPostgresError(error);
      log.warn("Contact import rejected by a unique constraint", {
        contactCount: input.contacts.length,
        pgCode: pgError?.code,
        pgConstraint: pgError?.constraint,
      });
      return { ok: false, status: 409, error: message };
    }
    throw error;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Export
// ───────────────────────────────────────────────────────────────────────────

export type ExportFilters = {
  search?: string;
  emailStatus?: EmailStatus;
  topicId?: string;
};

/**
 * Every contact of `organizationId` matching the filters, newest first, capped
 * at MAX_EXPORT_ROWS. `total` is the real match count, so `truncated` tells the
 * caller the file is incomplete. Same query as `exportAllContacts`.
 */
export async function exportContactsForOrg(
  organizationId: string,
  filters: ExportFilters
) {
  const conditions = [eq(contact.organizationId, organizationId)];
  if (filters.search) {
    conditions.push(ilike(contact.email, `%${escapeIlike(filters.search)}%`));
  }
  if (filters.emailStatus) {
    conditions.push(eq(contact.emailStatus, filters.emailStatus));
  }

  let topicFilter: ReturnType<typeof sql> | undefined;
  if (filters.topicId) {
    const subscribedContactIds = db
      .select({ contactId: contactTopic.contactId })
      .from(contactTopic)
      .where(
        and(
          eq(contactTopic.topicId, filters.topicId),
          eq(contactTopic.status, "subscribed")
        )
      );
    topicFilter = sql`${contact.id} IN (${subscribedContactIds})`;
  }

  const whereClause = topicFilter
    ? and(...conditions, topicFilter)
    : and(...conditions);

  // biome-ignore lint/plugin: `whereClause` always spreads `conditions`, whose first entry is eq(contact.organizationId, organizationId); the plugin cannot trace it through the variable.
  const [{ value: matchingCount }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(contact)
    .where(whereClause);

  const rows = await db.query.contact.findMany({
    where: whereClause,
    with: {
      createdByUser: { columns: { id: true, name: true, email: true } },
      topics: {
        with: { topic: { columns: { id: true, name: true } } },
      },
    },
    orderBy: [desc(contact.createdAt)],
    limit: MAX_EXPORT_ROWS,
  });

  const contacts = rows.map((c) => ({
    id: c.id,
    email: c.email,
    emailStatus: c.emailStatus,
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
    phone: c.phone,
    smsStatus: c.smsStatus,
    smsConsentedAt: c.smsConsentedAt,
    smsOptedOutAt: c.smsOptedOutAt,
    smsInvalidAt: c.smsInvalidAt,
    lastSmsSentAt: c.lastSmsSentAt,
    lastSmsClickedAt: c.lastSmsClickedAt,
    smsSent: c.smsSent,
    smsClicked: c.smsClicked,
    firstName: c.firstName,
    lastName: c.lastName,
    company: c.company,
    jobTitle: c.jobTitle,
    preferredChannel: c.preferredChannel,
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
    status: c.status,
    confirmedAt: c.confirmedAt,
    unsubscribedAt: c.unsubscribedAt,
    bouncedAt: c.bouncedAt,
    complainedAt: c.complainedAt,
  }));

  return {
    contacts,
    total: matchingCount,
    truncated: matchingCount > contacts.length,
  };
}

export type ExportedContact = Awaited<
  ReturnType<typeof exportContactsForOrg>
>["contacts"][number];

/** Columns of the dashboard's contacts CSV (apps/web/src/lib/csv-columns.ts). */
const CSV_COLUMNS: Array<{
  header: string;
  accessor: (
    r: ExportedContact
  ) => string | number | boolean | null | undefined;
}> = [
  { header: "Email", accessor: (r) => r.email },
  { header: "Phone", accessor: (r) => r.phone },
  { header: "First Name", accessor: (r) => r.firstName },
  { header: "Last Name", accessor: (r) => r.lastName },
  { header: "Company", accessor: (r) => r.company },
  { header: "Job Title", accessor: (r) => r.jobTitle },
  { header: "Email Status", accessor: (r) => r.emailStatus },
  { header: "SMS Status", accessor: (r) => r.smsStatus },
  { header: "Emails Sent", accessor: (r) => r.emailsSent },
  { header: "Emails Opened", accessor: (r) => r.emailsOpened },
  { header: "Emails Clicked", accessor: (r) => r.emailsClicked },
  { header: "SMS Sent", accessor: (r) => r.smsSent },
  {
    header: "Topics",
    accessor: (r) => r.topics?.map((t) => t.topicName).join(", ") ?? "",
  },
  {
    header: "Created At",
    accessor: (r) => (r.createdAt ? new Date(r.createdAt).toISOString() : ""),
  },
];

const CSV_SPECIAL = /[",\n\r]/;

function escapeCSVCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  if (CSV_SPECIAL.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Serialize exported contacts with the dashboard's CSV columns and escaping. */
export function contactsToCsv(rows: ExportedContact[]): string {
  const header = CSV_COLUMNS.map((c) => escapeCSVCell(c.header)).join(",");
  const body = rows
    .map((row) =>
      CSV_COLUMNS.map((c) => escapeCSVCell(c.accessor(row))).join(",")
    )
    .join("\n");
  return `${header}\n${body}`;
}
