ALTER TABLE "contact" ADD COLUMN "email_last_soft_bounced_at" timestamp;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "email_soft_bounce_count" integer DEFAULT 0 NOT NULL;