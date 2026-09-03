import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  json,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { template } from "./templates";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export const EMAIL_STATUSES = [
  "active",
  "unsubscribed",
  "bounced",
  "complained",
  "suppressed",
] as const;

export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/**
 * Whether a status may be sent to. Total by construction: adding a sixth
 * `EmailStatus` fails the build here until someone answers the question for it.
 *
 * The map exists because this repo has drifted on this enum three times, each
 * the same way — a hand-written list of statuses that lost "suppressed" after
 * `processSuppression` started writing it (webhooks.ts). The workflow send gate
 * checked `unsubscribed || bounced || complained` and so let suppressed
 * contacts through; the form schema in apps/web omitted it and failed
 * validation the moment a suppressed contact opened the sheet. A denylist
 * answers "send it" for anything it has not heard of, which is the wrong
 * default when the unknown value arrives from a bounce.
 */
const EMAIL_STATUS_SENDABLE: Record<EmailStatus, boolean> = {
  active: true,
  unsubscribed: false,
  bounced: false,
  complained: false,
  suppressed: false,
};

export const SENDABLE_EMAIL_STATUSES = EMAIL_STATUSES.filter(
  (status) => EMAIL_STATUS_SENDABLE[status]
);

/**
 * In-memory half of the send gate, for callers holding a contact row (the
 * workflow step handler). The SQL half is `channelEligibilitySQL` in
 * repositories/broadcasts.ts — both derive from `SENDABLE_EMAIL_STATUSES`.
 *
 * A null status is sendable: `emailStatus` is only written null when the
 * contact has no email at all (routes/contacts.ts), and every caller checks for
 * an address first. Rows that carry both an address and a null status predate
 * the column, and have always been treated as reachable.
 */
export function isEmailSendable(
  status: EmailStatus | null | undefined
): boolean {
  return (
    status == null ||
    (SENDABLE_EMAIL_STATUSES as readonly string[]).includes(status)
  );
}

export type SmsStatus =
  | "pending_consent"
  | "opted_in"
  | "opted_out"
  | "invalid";
export type PreferredChannel = "email" | "sms";

/**
 * @deprecated Use EmailStatus instead. Kept for backwards compatibility.
 */
export type ContactStatus =
  | "pending_confirmation"
  | "active"
  | "unsubscribed"
  | "bounced"
  | "complained"
  | "suppressed";

// ═══════════════════════════════════════════════════════════════════════════
// CONTACTS TABLE
// ═══════════════════════════════════════════════════════════════════════════

export const contact = pgTable(
  "contact",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),

    // ═══════════════════════════════════════════════════════════════════════
    // EMAIL CHANNEL
    // ═══════════════════════════════════════════════════════════════════════
    email: text("email"), // Now optional (contact can have email OR phone)
    emailHash: text("email_hash"), // SHA256 for deduplication
    emailStatus: text("email_status").$type<EmailStatus>(),

    // Email timestamps
    emailVerifiedAt: timestamp("email_verified_at"),
    emailUnsubscribedAt: timestamp("email_unsubscribed_at"),
    emailBouncedAt: timestamp("email_bounced_at"),
    emailComplainedAt: timestamp("email_complained_at"),
    emailSuppressedAt: timestamp("email_suppressed_at"),

    // Email engagement
    lastEmailSentAt: timestamp("last_email_sent_at"),
    lastEmailOpenedAt: timestamp("last_email_opened_at"),
    lastEmailClickedAt: timestamp("last_email_clicked_at"),
    emailsSent: integer("emails_sent").default(0).notNull(),
    emailsOpened: integer("emails_opened").default(0).notNull(),
    emailsClicked: integer("emails_clicked").default(0).notNull(),

    // ═══════════════════════════════════════════════════════════════════════
    // SMS CHANNEL
    // ═══════════════════════════════════════════════════════════════════════
    phone: text("phone"), // E.164 format: +15551234567
    phoneHash: text("phone_hash"), // SHA256 for deduplication
    smsStatus: text("sms_status").$type<SmsStatus>(),

    // SMS timestamps
    smsConsentedAt: timestamp("sms_consented_at"),
    smsOptedOutAt: timestamp("sms_opted_out_at"),
    smsInvalidAt: timestamp("sms_invalid_at"),

    // SMS engagement
    lastSmsSentAt: timestamp("last_sms_sent_at"),
    lastSmsClickedAt: timestamp("last_sms_clicked_at"),
    smsSent: integer("sms_sent").default(0).notNull(),
    smsClicked: integer("sms_clicked").default(0).notNull(),

    // ═══════════════════════════════════════════════════════════════════════
    // SHARED FIELDS
    // ═══════════════════════════════════════════════════════════════════════

    // Contact profile (first-class fields for common attributes)
    firstName: text("first_name"),
    lastName: text("last_name"),
    company: text("company"),
    jobTitle: text("job_title"),
    preferredChannel: text("preferred_channel").$type<PreferredChannel>(),

    // Custom attributes (for additional/custom fields)
    properties: json("properties")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),

    // External reference (caller-supplied stable identifier)
    externalId: text("external_id"),

    // Engagement tracking
    lastActivityAt: timestamp("last_activity_at"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),

    // Audit
    createdBy: text("created_by").references(() => user.id),

    // ═══════════════════════════════════════════════════════════════════════
    // DEPRECATED FIELDS (kept for backwards compatibility)
    // ═══════════════════════════════════════════════════════════════════════
    /** @deprecated Use emailStatus instead */
    status: text("status").default("active").notNull(),
    /** @deprecated Use emailVerifiedAt instead */
    confirmedAt: timestamp("confirmed_at"),
    /** @deprecated Use emailUnsubscribedAt instead */
    unsubscribedAt: timestamp("unsubscribed_at"),
    /** @deprecated Use emailBouncedAt instead */
    bouncedAt: timestamp("bounced_at"),
    /** @deprecated Use emailComplainedAt instead */
    complainedAt: timestamp("complained_at"),
  },
  (table) => ({
    // Organization index
    orgIdx: index("contact_org_idx").on(table.organizationId),

    // Email indexes
    emailIdx: index("contact_email_idx").on(table.email),
    uniqueOrgEmail: uniqueIndex("contact_unique_org_email_idx")
      .on(table.organizationId, table.emailHash)
      .where(sql`email_hash IS NOT NULL`),
    emailStatusIdx: index("contact_email_status_idx").on(
      table.organizationId,
      table.emailStatus
    ),

    // Phone/SMS indexes
    phoneIdx: index("contact_phone_idx").on(table.phone),
    uniqueOrgPhone: uniqueIndex("contact_unique_org_phone_idx")
      .on(table.organizationId, table.phoneHash)
      .where(sql`phone_hash IS NOT NULL`),
    smsStatusIdx: index("contact_sms_status_idx").on(
      table.organizationId,
      table.smsStatus
    ),

    // External ID index (unique per org, sparse)
    uniqueOrgExternalId: uniqueIndex("contact_unique_org_external_id_idx")
      .on(table.organizationId, table.externalId)
      .where(sql`external_id IS NOT NULL`),

    // Legacy status index (deprecated)
    statusIdx: index("contact_status_idx").on(
      table.organizationId,
      table.status
    ),

    // Supports (organizationId, createdAt, id) ordering. The batch-sender
    // chunk query does not currently use this ordering — see orgIdIdx below
    // for the index it actually needs. Created CONCURRENTLY in prod via
    // packages/db/scripts/create-broadcast-resume-indexes.ts.
    keysetIdx: index("contact_keyset_idx").on(
      table.organizationId,
      table.createdAt,
      table.id
    ),

    // Serves the batch-sender chunk query, which filters by organizationId and
    // paginates with `id > cursor ORDER BY id` (see getContactsChunk in
    // apps/api/src/workers/batch-sender.ts). keysetIdx above leads with
    // createdAt and cannot serve that ordering. Created CONCURRENTLY in prod
    // via packages/db/scripts/create-broadcast-audience-index.ts.
    orgIdIdx: index("contact_org_id_idx").on(table.organizationId, table.id),
  })
);

// Topics (Subscription Lists)
export const topic = pgTable(
  "topic",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),

    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),

    public: boolean("public").default(true).notNull(), // Visible in preference center
    doubleOptIn: boolean("double_opt_in").default(false).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),

    // Audit
    createdBy: text("created_by").references(() => user.id),
  },
  (table) => ({
    orgIdx: index("topic_org_idx").on(table.organizationId),
    uniqueOrgSlug: uniqueIndex("topic_unique_org_slug_idx").on(
      table.organizationId,
      table.slug
    ),
  })
);

/**
 * Per-organization theme for the public preference center.
 *
 * INVARIANT: `light`/`dark` hold shadcn token name -> validated CSS value.
 * Raw CSS is never stored here — see apps/web/src/lib/preference-theme/parse.ts.
 * Values are re-validated on serialize, so a tampered row still cannot inject CSS.
 */
export type PreferenceCenterTheme = {
  version: 1;
  light: Record<string, string>;
  dark: Record<string, string>;
  fonts: { body: string | null; heading: string | null };
  colorScheme: "light" | "dark" | "system";
};

// Topic Settings (organization-level configuration)
export const topicSettings = pgTable("topic_settings", {
  organizationId: text("organization_id")
    .references(() => organization.id, { onDelete: "cascade" })
    .primaryKey(),

  // Double Opt-In Email Settings
  confirmationFromName: text("confirmation_from_name"), // e.g., "Acme Inc"
  confirmationFromEmail: text("confirmation_from_email"), // e.g., "noreply@acme.com"
  confirmationReplyToEmail: text("confirmation_reply_to_email"), // optional reply-to
  confirmationTemplateId: text("confirmation_template_id").references(
    () => template.id,
    { onDelete: "set null" }
  ), // Optional custom email template for confirmation emails

  // Preference Center Settings
  preferenceCenterTitle: text("preference_center_title"),
  preferenceCenterDescription: text("preference_center_description"),
  // Optional logo shown at the top of the public preference center and
  // confirm pages. Falls back to `organization.logo` when null, so orgs that
  // want one identity everywhere set nothing here.
  preferenceCenterLogo: text("preference_center_logo"),
  preferenceCenterTheme: jsonb(
    "preference_center_theme"
  ).$type<PreferenceCenterTheme>(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Contact-Topic relationship (subscriptions)
export const contactTopic = pgTable(
  "contact_topic",
  {
    contactId: text("contact_id")
      .references(() => contact.id, { onDelete: "cascade" })
      .notNull(),
    topicId: text("topic_id")
      .references(() => topic.id, { onDelete: "cascade" })
      .notNull(),

    status: text("status").default("subscribed").notNull(), // pending, subscribed, unsubscribed
    subscribedAt: timestamp("subscribed_at").defaultNow(),
    unsubscribedAt: timestamp("unsubscribed_at"),
    confirmedAt: timestamp("confirmed_at"), // When double opt-in was confirmed
  },
  (table) => ({
    pk: primaryKey({ columns: [table.contactId, table.topicId] }),
    topicIdx: index("contact_topic_topic_idx").on(table.topicId),
    statusIdx: index("contact_topic_status_idx").on(
      table.topicId,
      table.status
    ),
  })
);

// Relations
export const contactRelations = relations(contact, ({ one, many }) => ({
  organization: one(organization, {
    fields: [contact.organizationId],
    references: [organization.id],
  }),
  createdByUser: one(user, {
    fields: [contact.createdBy],
    references: [user.id],
  }),
  topics: many(contactTopic),
}));

export const topicRelations = relations(topic, ({ one, many }) => ({
  organization: one(organization, {
    fields: [topic.organizationId],
    references: [organization.id],
  }),
  createdByUser: one(user, {
    fields: [topic.createdBy],
    references: [user.id],
  }),
  subscribers: many(contactTopic),
}));

export const contactTopicRelations = relations(contactTopic, ({ one }) => ({
  contact: one(contact, {
    fields: [contactTopic.contactId],
    references: [contact.id],
  }),
  topic: one(topic, {
    fields: [contactTopic.topicId],
    references: [topic.id],
  }),
}));

export const topicSettingsRelations = relations(topicSettings, ({ one }) => ({
  organization: one(organization, {
    fields: [topicSettings.organizationId],
    references: [organization.id],
  }),
  confirmationTemplate: one(template, {
    fields: [topicSettings.confirmationTemplateId],
    references: [template.id],
  }),
}));
