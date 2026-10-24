CREATE TABLE "listing_hides" (
	"listing_uri" text PRIMARY KEY NOT NULL,
	"org_did" text NOT NULL,
	"category" text NOT NULL,
	"ground" text NOT NULL,
	"statement" text NOT NULL,
	"decided_by" text NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"appeal_text" text,
	"appealed_at" timestamp with time zone,
	"appeal_decided_at" timestamp with time zone,
	"appeal_note" text
);
--> statement-breakpoint
CREATE TABLE "listing_moderation_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "listing_moderation_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"listing_uri" text NOT NULL,
	"action" text NOT NULL,
	"report_id" text,
	"actor_did" text,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"listing_uri" text NOT NULL,
	"org_did" text NOT NULL,
	"reason" text NOT NULL,
	"explanation" text NOT NULL,
	"reporter_name" text,
	"reporter_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"contact_erased_at" timestamp with time zone,
	CONSTRAINT "listing_reports_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE INDEX "listing_hides_org" ON "listing_hides" USING btree ("org_did");--> statement-breakpoint
CREATE INDEX "listing_moderation_log_listing" ON "listing_moderation_log" USING btree ("listing_uri","at");--> statement-breakpoint
CREATE INDEX "listing_reports_state" ON "listing_reports" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "listing_reports_listing" ON "listing_reports" USING btree ("listing_uri");