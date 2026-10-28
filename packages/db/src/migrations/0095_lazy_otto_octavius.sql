CREATE TABLE "message_send_diagnostic" (
	"message_send_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"event_type" text NOT NULL,
	"enhanced_status" text,
	"diagnostic_code" text,
	"reason_key" text,
	"feedback_type" text,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_send_diagnostic_message_send_id_event_type_pk" PRIMARY KEY("message_send_id","event_type"),
	CONSTRAINT "message_send_diagnostic_event_type_check" CHECK ("message_send_diagnostic"."event_type" IN ('bounce', 'complaint'))
);
--> statement-breakpoint
ALTER TABLE "message_send_diagnostic" ADD CONSTRAINT "message_send_diagnostic_message_send_id_message_send_id_fk" FOREIGN KEY ("message_send_id") REFERENCES "public"."message_send"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_send_diagnostic" ADD CONSTRAINT "message_send_diagnostic_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_send_diagnostic_org_idx" ON "message_send_diagnostic" USING btree ("organization_id");