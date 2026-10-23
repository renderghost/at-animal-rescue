CREATE TABLE "org_facts" (
	"did" text PRIMARY KEY NOT NULL,
	"domain_handle" text,
	"domain_method" text,
	"domain_checked_at" timestamp with time zone,
	"verifications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verifications_checked_at" timestamp with time zone
);
