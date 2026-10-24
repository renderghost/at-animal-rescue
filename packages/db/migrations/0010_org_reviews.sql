CREATE TABLE "org_review_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "org_review_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"did" text NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"actor_did" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_reviews" (
	"did" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"reason" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"requested_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "org_review_log_did" ON "org_review_log" USING btree ("did","at");