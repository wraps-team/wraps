CREATE TABLE "aws_account_permission" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"aws_account_id" text NOT NULL,
	"permissions" json NOT NULL,
	"granted_by" text NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aws_account_permission" ADD CONSTRAINT "aws_account_permission_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aws_account_permission" ADD CONSTRAINT "aws_account_permission_aws_account_id_aws_account_id_fk" FOREIGN KEY ("aws_account_id") REFERENCES "public"."aws_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aws_account_permission" ADD CONSTRAINT "aws_account_permission_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aws_account_permission_user_idx" ON "aws_account_permission" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "aws_account_permission_account_idx" ON "aws_account_permission" USING btree ("aws_account_id");--> statement-breakpoint
CREATE INDEX "aws_account_permission_unique_idx" ON "aws_account_permission" USING btree ("user_id","aws_account_id");