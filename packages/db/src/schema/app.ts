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
import { member, organization, user } from "./auth";

// Organization billing/plan info
export const organizationExtension = pgTable("organization_extension", {
  organizationId: text("organization_id")
    .references(() => organization.id, { onDelete: "cascade" })
    .primaryKey(),

  // Subscription
  plan: text("plan").default("free").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),

  // Usage tracking
  awsAccountCount: integer("aws_account_count").default(0).notNull(),
  memberCount: integer("member_count").default(1).notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// AWS Account Connections
export const awsAccount = pgTable(
  "aws_account",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),

    name: text("name").notNull(),
    accountId: text("account_id").notNull(),
    region: text("region").notNull(),

    // IAM Role for access (AssumeRole)
    roleArn: text("role_arn").notNull(),
    externalId: text("external_id").notNull().unique(),

    // Verification
    isVerified: boolean("is_verified").default(false).notNull(),
    lastVerifiedAt: timestamp("last_verified_at"),

    // Features
    archivingEnabled: boolean("archiving_enabled").default(false).notNull(),
    archiveArn: text("archive_arn"),
    eventHistoryEnabled: boolean("event_history_enabled")
      .default(false)
      .notNull(),
    eventTrackingEnabled: boolean("event_tracking_enabled")
      .default(false)
      .notNull(),
    configSetName: text("config_set_name"),
    customTrackingDomain: text("custom_tracking_domain"),

    // Audit
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("aws_account_org_idx").on(table.organizationId),
    externalIdIdx: index("aws_account_external_id_idx").on(table.externalId),
  })
);

// AWS Account Permissions (custom permission system)
export const awsAccountPermission = pgTable(
  "aws_account_permission",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    userId: text("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),

    awsAccountId: text("aws_account_id")
      .references(() => awsAccount.id, { onDelete: "cascade" })
      .notNull(),

    // Array of permissions: ["view", "send", "manage"]
    permissions: json("permissions").$type<string[]>().notNull(),

    // Audit
    grantedBy: text("granted_by")
      .references(() => user.id)
      .notNull(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("aws_account_permission_user_idx").on(table.userId),
    accountIdx: index("aws_account_permission_account_idx").on(
      table.awsAccountId
    ),
    uniqueUserAccount: index("aws_account_permission_unique_idx").on(
      table.userId,
      table.awsAccountId
    ),
  })
);

// Email Templates
export const emailTemplate = pgTable(
  "email_template",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    subject: text("subject"),
    html: text("html"),
    variables: json("variables").default([]),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("email_template_org_idx").on(table.organizationId),
  })
);

// API Keys
export const apiKey = pgTable(
  "api_key",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    prefix: text("prefix").notNull(),
    permissions: json("permissions").default([]),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("api_key_org_idx").on(table.organizationId),
    prefixIdx: index("api_key_prefix_idx").on(table.prefix),
  })
);

// Audit Logs (Enterprise)
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id").references(() => user.id),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    resourceId: text("resource_id"),
    metadata: json("metadata"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("audit_log_org_idx").on(table.organizationId),
    timestampIdx: index("audit_log_timestamp_idx").on(table.createdAt),
  })
);

// Drizzle Relations
export const organizationExtensionRelations = relations(
  organizationExtension,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationExtension.organizationId],
      references: [organization.id],
    }),
  })
);

export const organizationRelations = relations(
  organization,
  ({ one, many }) => ({
    extension: one(organizationExtension),
    members: many(member),
    awsAccounts: many(awsAccount),
    emailTemplates: many(emailTemplate),
    apiKeys: many(apiKey),
    auditLogs: many(auditLog),
  })
);

export const awsAccountRelations = relations(awsAccount, ({ one, many }) => ({
  organization: one(organization, {
    fields: [awsAccount.organizationId],
    references: [organization.id],
  }),
  createdByUser: one(user, {
    fields: [awsAccount.createdBy],
    references: [user.id],
  }),
  permissions: many(awsAccountPermission),
}));

export const awsAccountPermissionRelations = relations(
  awsAccountPermission,
  ({ one }) => ({
    user: one(user, {
      fields: [awsAccountPermission.userId],
      references: [user.id],
      relationName: "userPermissions",
    }),
    awsAccount: one(awsAccount, {
      fields: [awsAccountPermission.awsAccountId],
      references: [awsAccount.id],
    }),
    grantedByUser: one(user, {
      fields: [awsAccountPermission.grantedBy],
      references: [user.id],
      relationName: "grantedPermissions",
    }),
  })
);

export const emailTemplateRelations = relations(emailTemplate, ({ one }) => ({
  organization: one(organization, {
    fields: [emailTemplate.organizationId],
    references: [organization.id],
  }),
  createdByUser: one(user, {
    fields: [emailTemplate.createdBy],
    references: [user.id],
  }),
}));

export const apiKeyRelations = relations(apiKey, ({ one }) => ({
  organization: one(organization, {
    fields: [apiKey.organizationId],
    references: [organization.id],
  }),
  createdByUser: one(user, {
    fields: [apiKey.createdBy],
    references: [user.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  organization: one(organization, {
    fields: [auditLog.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [auditLog.userId],
    references: [user.id],
  }),
}));
