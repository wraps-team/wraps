CREATE TABLE "aws_marketplace_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"license_arn" text NOT NULL,
	"customer_aws_account_id" text NOT NULL,
	"product_code" text NOT NULL,
	"customer_identifier" text,
	"organization_id" text,
	"contact_email" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"offer_type" text,
	"resolved_at" timestamp DEFAULT now() NOT NULL,
	"registered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "aws_marketplace_subscription_license_arn_unique" UNIQUE("license_arn")
);
--> statement-breakpoint
ALTER TABLE "aws_marketplace_subscription" ADD CONSTRAINT "aws_marketplace_subscription_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aws_marketplace_subscription_organization_id_idx" ON "aws_marketplace_subscription" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "aws_marketplace_subscription_account_product_idx" ON "aws_marketplace_subscription" USING btree ("customer_aws_account_id","product_code");