ALTER TABLE "aws_account" ADD COLUMN "console_policy_version" integer;--> statement-breakpoint
ALTER TABLE "aws_account" ADD COLUMN "console_policy_checked_at" timestamp;