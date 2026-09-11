import { relations } from "drizzle-orm";
import { index, json, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { contact } from "./contacts";

// ═══════════════════════════════════════════════════════════════════════════
// CONTACT EVENTS TABLE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stores events associated with contacts.
 *
 * Events can be:
 * - Internal: contact_created, contact_updated, email_opened, etc.
 * - Custom: user.signup, order.completed, form.submitted, etc.
 *
 * Used for:
 * - Workflow event triggers
 * - Segment filter operators (triggered, triggeredWithin, notTriggered)
 * - Activity timeline
 */
export const contactEvent = pgTable(
  "contact_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text("contact_id")
      .references(() => contact.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),

    // Event identification
    eventName: text("event_name").notNull(),

    // Optional event data/properties
    eventData: json("event_data").$type<Record<string, unknown>>(),

    // Timestamp
    createdAt: timestamp("created_at").defaultNow().notNull(),

    // TTL for 2-year backstop cleanup
    // Events are soft-limited by plan retention (30/90/365 days) in queries,
    // but hard-deleted after 2 years for all tiers
    expiresAt: timestamp("expires_at"),
  },
  (table) => ({
    // Index for finding events by contact
    contactIdx: index("contact_event_contact_idx").on(table.contactId),

    // Index for finding events by org + event name (for cleanup/analytics)
    orgEventIdx: index("contact_event_org_event_idx").on(
      table.organizationId,
      table.eventName
    ),

    // Index for finding events by contact + event name (for segment evaluation)
    contactEventIdx: index("contact_event_contact_event_idx").on(
      table.contactId,
      table.eventName
    ),

    // Index for TTL cleanup job
    expiresIdx: index("contact_event_expires_idx").on(table.expiresAt),

    // Index for analytics period scans (countContactEventsInPeriod et al.)
    orgCreatedIdx: index("contact_event_org_created_idx").on(
      table.organizationId,
      table.createdAt
    ),
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// RELATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const contactEventRelations = relations(contactEvent, ({ one }) => ({
  contact: one(contact, {
    fields: [contactEvent.contactId],
    references: [contact.id],
  }),
  organization: one(organization, {
    fields: [contactEvent.organizationId],
    references: [organization.id],
  }),
}));
