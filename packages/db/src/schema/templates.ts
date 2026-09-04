import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

// Enums
export const templateStatusEnum = pgEnum("template_status", [
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
]);
export const emailTypeEnum = pgEnum("email_type", [
  "marketing", // Includes unsubscribe headers/footer, subject to opt-out
  "transactional", // No unsubscribe (password resets, order confirmations, etc.)
]);
export const variableTypeEnum = pgEnum("variable_type", [
  "TEXT",
  "NUMBER",
  "BOOLEAN",
  "DATE",
  "URL",
  "EMAIL",
]);

// Templates table
export const template = pgTable(
  "template",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Multi-tenant: organization-scoped
    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),

    name: text("name").notNull(),
    description: text("description"),
    subject: text("subject"), // Email subject line (supports variables like {{firstName}})
    previewText: text("preview_text"), // Preview text shown after subject in email clients

    // Email type determines compliance behavior
    emailType: emailTypeEnum("email_type").default("marketing").notNull(), // marketing = unsubscribe headers, transactional = no unsubscribe

    // Channel: email or sms
    channel: text("channel")
      .$type<"email" | "sms">()
      .default("email")
      .notNull(),

    // Single content field (Yjs-compatible structure)
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),

    // Rendered outputs (cached for performance)
    compiledHtml: text("compiled_html"),
    compiledText: text("compiled_text"),

    // Variables and test data
    variables: jsonb("variables")
      .$type<Record<string, unknown>[]>()
      .default([]),
    testData: jsonb("test_data").$type<Record<string, unknown>>().default({}),

    // Collaboration fields (ready but unused)
    roomId: text("room_id"),
    isCollaborative: boolean("is_collaborative").default(false).notNull(),

    // AI generation metadata
    aiGenerated: boolean("ai_generated").default(false).notNull(),
    aiConversationId: text("ai_conversation_id"),

    // Brand kit preference
    brandKitId: text("brand_kit_id").references(() => brandKit.id, {
      onDelete: "set null",
    }),

    // SES publishing
    sesTemplateName: text("ses_template_name"), // Name of template in AWS SES (e.g., "wraps-{id}")
    publishedAt: timestamp("published_at"), // When last published to SES

    // Metadata
    status: templateStatusEnum("status").default("DRAFT").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    lastEditedBy: text("last_edited_by").references(() => user.id, {
      onDelete: "set null",
    }),

    // Templates-as-code (CLI push)
    slug: text("slug"),
    source: text("source"), // React Email TSX source
    sourceFormat: text("source_format")
      .$type<"tiptap" | "react-email">()
      .default("react-email")
      .notNull(),
    sourceHash: text("source_hash"), // SHA256 for change detection
    pushedFromCli: boolean("pushed_from_cli").default(false).notNull(),
    lastPushedAt: timestamp("last_pushed_at"),
    cliProjectPath: text("cli_project_path"), // e.g. "templates/welcome.tsx"
    lastEditedFrom: text("last_edited_from").$type<
      "cli" | "dashboard" | "api"
    >(),
  },
  (table) => [
    index("template_org_idx").on(table.organizationId),
    index("template_status_updated_at_idx").on(table.status, table.updatedAt),
    index("template_created_by_idx").on(table.createdBy),
    uniqueIndex("template_room_id_idx").on(table.roomId),
    uniqueIndex("template_org_slug_idx").on(table.organizationId, table.slug),
  ]
);

// Template versions table
export const templateVersion = pgTable(
  "template_version",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    templateId: text("template_id")
      .notNull()
      .references(() => template.id, { onDelete: "cascade" }),

    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    source: text("source"),
    compiledHtml: text("compiled_html"),
    version: integer("version").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    changeNote: text("change_note"),
  },
  (table) => [
    uniqueIndex("template_version_template_version_idx").on(
      table.templateId,
      table.version
    ),
    index("template_version_template_created_at_idx").on(
      table.templateId,
      table.createdAt
    ),
  ]
);

// Reusable blocks table
export const reusableBlock = pgTable(
  "reusable_block",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Multi-tenant: organization-scoped
    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),

    name: text("name").notNull(),
    description: text("description"),
    category: text("category").default("custom").notNull(), // header, footer, cta, content, custom

    // The block content (TipTap JSON fragment)
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),

    // Preview thumbnail (optional, base64 or URL)
    thumbnail: text("thumbnail"),

    // Metadata
    isPublic: boolean("is_public").default(false).notNull(),
    usageCount: integer("usage_count").default(0).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdBy: text("created_by")
      .references(() => user.id, { onDelete: "set null" })
      .notNull(),
  },
  (table) => [
    index("reusable_block_org_idx").on(table.organizationId),
    index("reusable_block_created_by_category_idx").on(
      table.createdBy,
      table.category
    ),
    index("reusable_block_public_category_idx").on(
      table.isPublic,
      table.category
    ),
  ]
);

// Template variables table (global variables available to all templates in org)
export const templateVariable = pgTable(
  "template_variable",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Multi-tenant: organization-scoped
    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),

    name: text("name").notNull(), // e.g., "firstName"
    label: text("label").notNull(), // e.g., "First Name"
    type: variableTypeEnum("type").notNull(),
    required: boolean("required").default(false).notNull(),
    fallback: text("fallback"), // Default value if not provided
    validation: jsonb("validation").$type<Record<string, unknown>>(), // JSON schema for validation

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("template_variable_org_name_idx").on(
      table.organizationId,
      table.name
    ),
  ]
);

// Brand Kit table
export const brandKit = pgTable(
  "brand_kit",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),

    name: text("name").notNull().default("Default"),

    // Visual identity
    logoUrl: text("logo_url"),
    primaryColor: text("primary_color").default("#5046e5").notNull(),
    secondaryColor: text("secondary_color").default("#6366f1").notNull(),
    backgroundColor: text("background_color").default("#ffffff").notNull(),
    textColor: text("text_color").default("#1f2937").notNull(),

    // Typography
    fontFamily: text("font_family").default("system-ui, sans-serif").notNull(),
    headingFontFamily: text("heading_font_family"),

    // Button styles
    buttonStyle: text("button_style").default("rounded").notNull(), // rounded, square, pill
    buttonRadius: text("button_radius").default("4px").notNull(),

    // Footer defaults
    companyName: text("company_name"),
    companyAddress: text("company_address"),
    socialLinks: jsonb("social_links")
      .$type<Array<{ platform: string; url: string }>>()
      .default([]),

    // Source domain (for auto-extraction)
    sourceDomain: text("source_domain"),
    autoExtracted: boolean("auto_extracted").default(false).notNull(),

    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("brand_kit_org_idx").on(table.organizationId),
    index("brand_kit_default_idx").on(table.organizationId, table.isDefault),
  ]
);

// AI Conversation History table
export const aiConversation = pgTable(
  "ai_conversation",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organizationId: text("organization_id")
      .references(() => organization.id, { onDelete: "cascade" })
      .notNull(),

    templateId: text("template_id").references(() => template.id, {
      onDelete: "cascade",
    }),

    // Conversation messages (array of { role, content })
    messages: jsonb("messages")
      .$type<Array<{ role: string; content: string }>>()
      .default([]),

    // Token usage tracking
    totalTokens: integer("total_tokens").default(0).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdBy: text("created_by")
      .references(() => user.id, { onDelete: "set null" })
      .notNull(),
  },
  (table) => [
    index("ai_conversation_org_idx").on(table.organizationId),
    index("ai_conversation_template_idx").on(table.templateId),
  ]
);

// Relations
export const templateRelations = relations(template, ({ one, many }) => ({
  organization: one(organization, {
    fields: [template.organizationId],
    references: [organization.id],
  }),
  createdByUser: one(user, {
    fields: [template.createdBy],
    references: [user.id],
    relationName: "templateCreatedBy",
  }),
  lastEditedByUser: one(user, {
    fields: [template.lastEditedBy],
    references: [user.id],
    relationName: "templateLastEditedBy",
  }),
  versions: many(templateVersion),
  aiConversation: one(aiConversation, {
    fields: [template.aiConversationId],
    references: [aiConversation.id],
  }),
  brandKitRef: one(brandKit, {
    fields: [template.brandKitId],
    references: [brandKit.id],
  }),
}));

export const templateVersionRelations = relations(
  templateVersion,
  ({ one }) => ({
    template: one(template, {
      fields: [templateVersion.templateId],
      references: [template.id],
    }),
    createdByUser: one(user, {
      fields: [templateVersion.createdBy],
      references: [user.id],
    }),
  })
);

export const reusableBlockRelations = relations(reusableBlock, ({ one }) => ({
  organization: one(organization, {
    fields: [reusableBlock.organizationId],
    references: [organization.id],
  }),
  createdByUser: one(user, {
    fields: [reusableBlock.createdBy],
    references: [user.id],
  }),
}));

export const templateVariableRelations = relations(
  templateVariable,
  ({ one }) => ({
    organization: one(organization, {
      fields: [templateVariable.organizationId],
      references: [organization.id],
    }),
  })
);

export const brandKitRelations = relations(brandKit, ({ one }) => ({
  organization: one(organization, {
    fields: [brandKit.organizationId],
    references: [organization.id],
  }),
}));

export const aiConversationRelations = relations(aiConversation, ({ one }) => ({
  organization: one(organization, {
    fields: [aiConversation.organizationId],
    references: [organization.id],
  }),
  template: one(template, {
    fields: [aiConversation.templateId],
    references: [template.id],
  }),
  createdByUser: one(user, {
    fields: [aiConversation.createdBy],
    references: [user.id],
  }),
}));

// Types
export type TemplateChannel = "email" | "sms";
export type EmailType = "marketing" | "transactional";
export type Template = typeof template.$inferSelect;
export type NewTemplate = typeof template.$inferInsert;
export type TemplateVersion = typeof templateVersion.$inferSelect;
export type NewTemplateVersion = typeof templateVersion.$inferInsert;
export type ReusableBlock = typeof reusableBlock.$inferSelect;
export type NewReusableBlock = typeof reusableBlock.$inferInsert;
export type TemplateVariable = typeof templateVariable.$inferSelect;
export type NewTemplateVariable = typeof templateVariable.$inferInsert;
export type BrandKit = typeof brandKit.$inferSelect;
export type NewBrandKit = typeof brandKit.$inferInsert;
export type AIConversation = typeof aiConversation.$inferSelect;
export type NewAIConversation = typeof aiConversation.$inferInsert;
