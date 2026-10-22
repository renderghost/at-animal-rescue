CREATE TABLE "private_records" (
	"did" text NOT NULL,
	"collection" text NOT NULL,
	"rkey" text NOT NULL,
	"key_id" text NOT NULL,
	"iv" "bytea" NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_records_did_collection_rkey_pk" PRIMARY KEY("did","collection","rkey")
);
--> statement-breakpoint
CREATE INDEX "private_records_key_id_idx" ON "private_records" USING btree ("key_id");