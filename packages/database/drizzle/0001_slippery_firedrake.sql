CREATE TABLE "alert_reviews" (
	"alert_id" text PRIMARY KEY NOT NULL,
	"verdict" text NOT NULL,
	"notes" text,
	"reviewed_by" text,
	"reviewed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_reviews" ADD CONSTRAINT "alert_reviews_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;