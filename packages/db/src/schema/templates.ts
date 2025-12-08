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

		// Single content field (Yjs-compatible structure)
		content: jsonb("content").$type<Record<string, unknown>>().notNull(),

		// Rendered outputs (cached for performance)
		compiledHtml: text("compiled_html"),
		compiledText: text("compiled_text"),

		// Variables and test data
		variables: jsonb("variables").$type<Record<string, unknown>[]>().default([]),
		testData: jsonb("test_data").$type<Record<string, unknown>>().default({}),

		// Collaboration fields (ready but unused)
		roomId: text("room_id"),
		isCollaborative: boolean("is_collaborative").default(false).notNull(),

		// Metadata
		status: templateStatusEnum("status").default("DRAFT").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
		createdBy: text("created_by")
			.references(() => user.id, { onDelete: "set null" })
			.notNull(),
		lastEditedBy: text("last_edited_by").references(() => user.id, {
			onDelete: "set null",
		}),
	},
	(table) => [
		index("template_org_idx").on(table.organizationId),
		index("template_status_updated_at_idx").on(table.status, table.updatedAt),
		index("template_created_by_idx").on(table.createdBy),
		uniqueIndex("template_room_id_idx").on(table.roomId),
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
		version: integer("version").notNull(),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		createdBy: text("created_by")
			.references(() => user.id, { onDelete: "set null" })
			.notNull(),
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

// Types
export type Template = typeof template.$inferSelect;
export type NewTemplate = typeof template.$inferInsert;
export type TemplateVersion = typeof templateVersion.$inferSelect;
export type NewTemplateVersion = typeof templateVersion.$inferInsert;
export type ReusableBlock = typeof reusableBlock.$inferSelect;
export type NewReusableBlock = typeof reusableBlock.$inferInsert;
export type TemplateVariable = typeof templateVariable.$inferSelect;
export type NewTemplateVariable = typeof templateVariable.$inferInsert;
