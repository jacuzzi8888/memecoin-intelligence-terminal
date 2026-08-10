ALTER TABLE "token_snapshots" ADD COLUMN "wallet_count" integer;--> statement-breakpoint
ALTER TABLE "token_snapshots" ADD COLUMN "qualified_wallet_count" integer;--> statement-breakpoint
ALTER TABLE "token_snapshots" ADD COLUMN "cohort_entry_count" integer;--> statement-breakpoint
ALTER TABLE "token_snapshots" ADD COLUMN "cohort_quality_score" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "token_snapshots" ADD COLUMN "wallet_evidence_available" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "token_snapshots" ADD COLUMN "wallet_evidence_source" text;