ALTER TABLE "aws_marketplace_subscription" ADD COLUMN "agreement_id" text;--> statement-breakpoint
ALTER TABLE "aws_marketplace_subscription" ADD COLUMN "last_event_at" timestamp;--> statement-breakpoint
CREATE INDEX "aws_marketplace_subscription_agreement_id_idx" ON "aws_marketplace_subscription" USING btree ("agreement_id");