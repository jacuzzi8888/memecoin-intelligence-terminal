CREATE TABLE "token_holder_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"token_id" text NOT NULL,
	"token_address" text NOT NULL,
	"wallet_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"rank" integer NOT NULL,
	"balance" numeric(78, 0) NOT NULL,
	"percentage" numeric(12, 6),
	"source" text NOT NULL,
	"snapshot_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "token_holder_snapshots" ADD CONSTRAINT "token_holder_snapshots_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "token_holder_snapshots_token_snapshot_idx" ON "token_holder_snapshots" USING btree ("token_address","snapshot_at");--> statement-breakpoint
CREATE INDEX "token_holder_snapshots_wallet_snapshot_idx" ON "token_holder_snapshots" USING btree ("wallet_address","snapshot_at");--> statement-breakpoint
CREATE INDEX "wallet_relationships_wallet_a_idx" ON "wallet_relationships" USING btree ("wallet_a_id","detected_at");--> statement-breakpoint
CREATE INDEX "wallet_relationships_wallet_b_idx" ON "wallet_relationships" USING btree ("wallet_b_id","detected_at");--> statement-breakpoint
CREATE INDEX "wallet_relationships_type_idx" ON "wallet_relationships" USING btree ("relationship_type","detected_at");