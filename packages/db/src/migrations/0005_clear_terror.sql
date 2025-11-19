ALTER TABLE "aws_account" ADD COLUMN "event_history_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "aws_account" ADD COLUMN "event_tracking_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "aws_account" ADD COLUMN "config_set_name" text;--> statement-breakpoint
ALTER TABLE "aws_account" ADD COLUMN "custom_tracking_domain" text;