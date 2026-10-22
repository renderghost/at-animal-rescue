CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"handle" text NOT NULL,
	"key_id" text NOT NULL,
	"iv" "bytea" NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sessions_did_idx" ON "sessions" USING btree ("did");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");