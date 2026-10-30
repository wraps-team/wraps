import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

// Filter Types

export type FilterOperator =
  | "equals"
  | "notEquals"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "greaterThan"
  | "lessThan"
  | "greaterThanOrEqual"
  | "lessThanOrEqual"
  | "exists"
  | "notExists"
  | "inList"
  | "notInList"
  | "within" // Time-based: within X days/hours
  | "hasTopic"
  | "notHasTopic"
  | "triggered"
  | "triggeredWithin"
  | "notTriggered" // Event-based
  | "inBucket"; // Deterministic hash partition: { buckets: N, index: K }

export type SegmentFilter = {
  id?: string; // Client-side unique ID for React keys
  field: string; // "properties.plan", "status", "topics", "event.purchase"
  operator: FilterOperator;
  value?: unknown;
  unit?: "days" | "hours" | "minutes";
};

export type FilterGroup = {
  id?: string; // Client-side unique ID for React keys
  filters: SegmentFilter[];
  nested?: FilterCondition; // Allows infinite nesting
};

export type FilterCondition = {
  logic: "AND" | "OR";
  groups: FilterGroup[];
};

// Segments Table

export const segment = pgTable(
  "segment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),

    name: text("name").notNull(),
    description: text("description"),

    // Nested group filter condition
    condition: json("condition").$type<FilterCondition>().notNull(),

    // Membership tracking
    trackMembership: boolean("track_membership").default(false).notNull(),

    // Cached stats
    memberCount: integer("member_count").default(0).notNull(),
    lastComputedAt: timestamp("last_computed_at"),

    // Audit
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("segment_org_idx").on(table.organizationId),
    nameIdx: index("segment_name_idx").on(table.organizationId, table.name),
  })
);

// Relations
export const segmentRelations = relations(segment, ({ one }) => ({
  organization: one(organization, {
    fields: [segment.organizationId],
    references: [organization.id],
  }),
  createdByUser: one(user, {
    fields: [segment.createdBy],
    references: [user.id],
  }),
}));
