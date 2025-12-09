CREATE TYPE "public"."template_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."variable_type" AS ENUM('TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'URL', 'EMAIL');--> statement-breakpoint
CREATE TABLE "ai_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"template_id" text,
	"messages" jsonb DEFAULT '[]'::jsonb,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_kit" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text DEFAULT 'Default' NOT NULL,
	"logo_url" text,
	"primary_color" text DEFAULT '#5046e5' NOT NULL,
	"secondary_color" text DEFAULT '#6366f1' NOT NULL,
	"background_color" text DEFAULT '#ffffff' NOT NULL,
	"text_color" text DEFAULT '#1f2937' NOT NULL,
	"font_family" text DEFAULT 'system-ui, sans-serif' NOT NULL,
	"heading_font_family" text,
	"button_style" text DEFAULT 'rounded' NOT NULL,
	"button_radius" text DEFAULT '4px' NOT NULL,
	"company_name" text,
	"company_address" text,
	"social_links" jsonb DEFAULT '[]'::jsonb,
	"source_domain" text,
	"auto_extracted" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reusable_block" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'custom' NOT NULL,
	"content" jsonb NOT NULL,
	"thumbnail" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"subject" text,
	"content" jsonb NOT NULL,
	"compiled_html" text,
	"compiled_text" text,
	"variables" jsonb DEFAULT '[]'::jsonb,
	"test_data" jsonb DEFAULT '{}'::jsonb,
	"room_id" text,
	"is_collaborative" boolean DEFAULT false NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"ai_conversation_id" text,
	"ses_template_name" text,
	"published_at" timestamp,
	"status" "template_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"last_edited_by" text
);
--> statement-breakpoint
CREATE TABLE "template_variable" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"type" "variable_type" NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"fallback" text,
	"validation" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_version" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"content" jsonb NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"change_note" text
);
--> statement-breakpoint
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_template_id_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kit" ADD CONSTRAINT "brand_kit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reusable_block" ADD CONSTRAINT "reusable_block_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reusable_block" ADD CONSTRAINT "reusable_block_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_last_edited_by_user_id_fk" FOREIGN KEY ("last_edited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_variable" ADD CONSTRAINT "template_variable_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_template_id_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_conversation_org_idx" ON "ai_conversation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ai_conversation_template_idx" ON "ai_conversation" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "brand_kit_org_idx" ON "brand_kit" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "brand_kit_default_idx" ON "brand_kit" USING btree ("organization_id","is_default");--> statement-breakpoint
CREATE INDEX "reusable_block_org_idx" ON "reusable_block" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reusable_block_created_by_category_idx" ON "reusable_block" USING btree ("created_by","category");--> statement-breakpoint
CREATE INDEX "reusable_block_public_category_idx" ON "reusable_block" USING btree ("is_public","category");--> statement-breakpoint
CREATE INDEX "template_org_idx" ON "template" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "template_status_updated_at_idx" ON "template" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "template_created_by_idx" ON "template" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "template_room_id_idx" ON "template" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "template_variable_org_name_idx" ON "template_variable" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "template_version_template_version_idx" ON "template_version" USING btree ("template_id","version");--> statement-breakpoint
CREATE INDEX "template_version_template_created_at_idx" ON "template_version" USING btree ("template_id","created_at");