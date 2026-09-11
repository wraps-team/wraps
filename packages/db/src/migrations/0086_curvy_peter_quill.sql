ALTER TABLE "message_send" ADD COLUMN "step_id" text;--> statement-breakpoint
-- NOTE: "message_send_workflow_step_dedup_idx" is declared in the Drizzle
-- schema but is created out-of-band via
-- packages/db/scripts/create-workflow-step-dedup-index.ts (CREATE UNIQUE
-- INDEX CONCURRENTLY). drizzle-kit cannot run CONCURRENTLY inside a txn
-- block. message_send is large and hot in production — run that script AFTER
-- this migration applies and BEFORE shipping the workflow claim-before-send
-- code that depends on it (plan 034).
