CREATE TABLE "share_link_views" (
	"link_id" text NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"adopter_did" text NOT NULL,
	"adopter_handle" text NOT NULL,
	"org_did" text NOT NULL,
	"listing_uri" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "share_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "share_link_views" ADD CONSTRAINT "share_link_views_link_id_share_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."share_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_link_views_link" ON "share_link_views" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX "share_links_adopter" ON "share_links" USING btree ("adopter_did");