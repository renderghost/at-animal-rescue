CREATE TABLE "private_blobs" (
	"did" text NOT NULL,
	"record" text NOT NULL,
	"cid" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"key_id" text NOT NULL,
	"iv" "bytea" NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_blobs_did_record_cid_pk" PRIMARY KEY("did","record","cid")
);
