ALTER TABLE "aws_account" ADD COLUMN "health_status" text;--> statement-breakpoint
ALTER TABLE "aws_account" ADD COLUMN "health_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "aws_account" ADD COLUMN "health_detail" json;