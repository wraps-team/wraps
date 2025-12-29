CREATE TYPE "public"."batch_send_status" AS ENUM('draft', 'queued', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."message_send_status" AS ENUM('pending', 'queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed', 'opted_out');--> statement-breakpoint
CREATE TYPE "public"."message_source_type" AS ENUM('transactional', 'batch', 'campaign', 'workflow');--> statement-breakpoint
CREATE TABLE "batch_send" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"aws_account_id" text,
	"name" text,
	"channel" text DEFAULT 'email' NOT NULL,
	"subject" text,
	"preview_text" text,
	"from" text,
	"from_name" text,
	"reply_to" text,
	"email_template_id" text,
	"html_content" text,
	"text_content" text,
	"body" text,
	"sender_id" text,
	"status" "batch_send_status" DEFAULT 'draft' NOT NULL,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"processed_recipients" integer DEFAULT 0 NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"opened" integer DEFAULT 0 NOT NULL,
	"clicked" integer DEFAULT 0 NOT NULL,
	"bounced" integer DEFAULT 0 NOT NULL,
	"complained" integer DEFAULT 0 NOT NULL,
	"sms_segments" integer DEFAULT 0 NOT NULL,
	"sms_opted_out" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"error_details" json,
	"scheduled_for" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_send" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"contact_id" text,
	"aws_account_id" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"source_type" "message_source_type" NOT NULL,
	"batch_send_id" text,
	"recipient" text NOT NULL,
	"subject" text,
	"from" text,
	"from_name" text,
	"email_template_id" text,
	"body" text,
	"sender_id" text,
	"sms_segment_count" integer,
	"variables" json DEFAULT '{}'::json,
	"message_id" text,
	"status" "message_send_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"opened_at" timestamp,
	"clicked_at" timestamp,
	"bounced_at" timestamp,
	"complained_at" timestamp,
	"opted_out_at" timestamp,
	"error" text,
	"bounce_type" text,
	"bounce_sub_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_rate_limit_window" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"minute_key" text NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_usage_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"date_key" text NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "contact_unique_org_email_idx";--> statement-breakpoint
ALTER TABLE "contact" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contact" ALTER COLUMN "email_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "aws_account" ADD COLUMN "webhook_secret" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "email_status" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "email_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "email_unsubscribed_at" timestamp;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "email_bounced_at" timestamp;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "email_complained_at" timestamp;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "phone_hash" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "sms_status" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "sms_consented_at" timestamp;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "sms_opted_out_at" timestamp;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "sms_invalid_at" timestamp;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "last_sms_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "last_sms_clicked_at" timestamp;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "sms_sent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "sms_clicked" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "batch_send" ADD CONSTRAINT "batch_send_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_send" ADD CONSTRAINT "batch_send_aws_account_id_aws_account_id_fk" FOREIGN KEY ("aws_account_id") REFERENCES "public"."aws_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_send" ADD CONSTRAINT "batch_send_email_template_id_template_id_fk" FOREIGN KEY ("email_template_id") REFERENCES "public"."template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_send" ADD CONSTRAINT "batch_send_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_send" ADD CONSTRAINT "message_send_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_send" ADD CONSTRAINT "message_send_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_send" ADD CONSTRAINT "message_send_aws_account_id_aws_account_id_fk" FOREIGN KEY ("aws_account_id") REFERENCES "public"."aws_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_send" ADD CONSTRAINT "message_send_batch_send_id_batch_send_id_fk" FOREIGN KEY ("batch_send_id") REFERENCES "public"."batch_send"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_send" ADD CONSTRAINT "message_send_email_template_id_template_id_fk" FOREIGN KEY ("email_template_id") REFERENCES "public"."template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_rate_limit_window" ADD CONSTRAINT "api_rate_limit_window_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_usage_daily" ADD CONSTRAINT "api_usage_daily_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batch_send_org_idx" ON "batch_send" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "batch_send_channel_idx" ON "batch_send" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "batch_send_status_idx" ON "batch_send" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "batch_send_created_at_idx" ON "batch_send" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "message_send_org_idx" ON "message_send" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "message_send_contact_idx" ON "message_send" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "message_send_channel_idx" ON "message_send" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "message_send_batch_idx" ON "message_send" USING btree ("batch_send_id");--> statement-breakpoint
CREATE INDEX "message_send_status_idx" ON "message_send" USING btree ("batch_send_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "message_send_message_id_idx" ON "message_send" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_send_source_type_idx" ON "message_send" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "message_send_created_at_idx" ON "message_send" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "api_rate_limit_org_minute_idx" ON "api_rate_limit_window" USING btree ("organization_id","minute_key");--> statement-breakpoint
CREATE INDEX "api_rate_limit_expires_idx" ON "api_rate_limit_window" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "api_usage_daily_org_date_idx" ON "api_usage_daily" USING btree ("organization_id","date_key");--> statement-breakpoint
CREATE INDEX "api_usage_daily_date_idx" ON "api_usage_daily" USING btree ("date_key");--> statement-breakpoint
CREATE INDEX "contact_email_status_idx" ON "contact" USING btree ("organization_id","email_status");--> statement-breakpoint
CREATE INDEX "contact_phone_idx" ON "contact" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_unique_org_phone_idx" ON "contact" USING btree ("organization_id","phone_hash") WHERE phone_hash IS NOT NULL;--> statement-breakpoint
CREATE INDEX "contact_sms_status_idx" ON "contact" USING btree ("organization_id","sms_status");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_unique_org_email_idx" ON "contact" USING btree ("organization_id","email_hash") WHERE email_hash IS NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_extension" DROP COLUMN "plan";--> statement-breakpoint
ALTER TABLE "organization_extension" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "organization_extension" DROP COLUMN "stripe_subscription_id";