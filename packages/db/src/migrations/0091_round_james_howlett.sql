CREATE TABLE "domain_auth_check" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"aws_account_id" text NOT NULL,
	"identity" text NOT NULL,
	"record_kind" text NOT NULL,
	"record_name" text NOT NULL,
	"status" text NOT NULL,
	"found" json DEFAULT '[]'::json NOT NULL,
	"checked_at" timestamp NOT NULL,
	"last_verified_at" timestamp,
	"drifted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domain_auth_check" ADD CONSTRAINT "domain_auth_check_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_auth_check" ADD CONSTRAINT "domain_auth_check_aws_account_id_aws_account_id_fk" FOREIGN KEY ("aws_account_id") REFERENCES "public"."aws_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_auth_check_org_idx" ON "domain_auth_check" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_auth_check_record_idx" ON "domain_auth_check" USING btree ("organization_id","aws_account_id","identity","record_kind","record_name");