ALTER TABLE "api_key" DROP CONSTRAINT "api_key_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "aws_account" DROP CONSTRAINT "aws_account_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "aws_account_permission" DROP CONSTRAINT "aws_account_permission_granted_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "email_template" DROP CONSTRAINT "email_template_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "contact" DROP CONSTRAINT "contact_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "topic" DROP CONSTRAINT "topic_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "segment" DROP CONSTRAINT "segment_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "aws_account_permission" ALTER COLUMN "granted_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aws_account" ADD CONSTRAINT "aws_account_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aws_account_permission" ADD CONSTRAINT "aws_account_permission_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_template" ADD CONSTRAINT "email_template_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment" ADD CONSTRAINT "segment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;