CREATE TABLE "index_animals" (
	"uri" text PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"rkey" text NOT NULL,
	"name" text NOT NULL,
	"species" text NOT NULL,
	"sex" text,
	"size" text,
	"birth_date" text,
	"breeds" text[] DEFAULT '{}'::text[] NOT NULL,
	"record" jsonb NOT NULL,
	"cid" text NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "index_listings" (
	"uri" text PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"rkey" text NOT NULL,
	"status" text NOT NULL,
	"bonded" boolean DEFAULT false NOT NULL,
	"animal_uris" text[] NOT NULL,
	"criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fee_kind" text,
	"fee_amount" integer,
	"fee_currency" text,
	"override_latitude" double precision,
	"override_longitude" double precision,
	"latitude" double precision,
	"longitude" double precision,
	"moderation" text DEFAULT 'pending' NOT NULL,
	"record" jsonb NOT NULL,
	"cid" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "index_orgs" (
	"did" text PRIMARY KEY NOT NULL,
	"handle" text,
	"display_name" text NOT NULL,
	"locality" text NOT NULL,
	"region" text,
	"country" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"trusted" boolean DEFAULT false NOT NULL,
	"record" jsonb NOT NULL,
	"cid" text NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "index_animals_did_idx" ON "index_animals" USING btree ("did");--> statement-breakpoint
CREATE INDEX "index_animals_species_idx" ON "index_animals" USING btree ("species");--> statement-breakpoint
CREATE INDEX "index_listings_did_idx" ON "index_listings" USING btree ("did");--> statement-breakpoint
CREATE INDEX "index_listings_discovery_idx" ON "index_listings" USING btree ("moderation","status","created_at");--> statement-breakpoint
CREATE INDEX "index_listings_location_idx" ON "index_listings" USING gist ((ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography));