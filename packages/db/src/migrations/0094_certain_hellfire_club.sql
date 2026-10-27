CREATE TABLE "inbox_presence" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"last_seen_at" timestamp NOT NULL,
	CONSTRAINT "inbox_presence_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notification_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"notification_id" text NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp,
	"sent_at" timestamp,
	"detail" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "seen_at" timestamp;--> statement-breakpoint
ALTER TABLE "inbox_presence" ADD CONSTRAINT "inbox_presence_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_delivery_due_idx" ON "notification_delivery" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "notification_delivery_throttle_idx" ON "notification_delivery" USING btree ("user_id","type","channel","sent_at");--> statement-breakpoint
CREATE INDEX "notification_delivery_notification_idx" ON "notification_delivery" USING btree ("notification_id");--> statement-breakpoint
-- NOTE: notification_org_created_idx, notification_user_created_idx and
-- notification_created_idx are created out-of-band, CONCURRENTLY, via
-- packages/db/scripts/index-manifest.ts (migrate-indexes.ts).
-- The notification table is existing and can be large; a blocking index build
-- is not acceptable. Run db:migrate-indexes after this migration and before
-- relying on them.
