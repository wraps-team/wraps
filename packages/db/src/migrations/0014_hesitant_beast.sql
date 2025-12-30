ALTER TYPE "public"."batch_send_status" ADD VALUE 'scheduled' BEFORE 'queued';--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "brand_color" text;