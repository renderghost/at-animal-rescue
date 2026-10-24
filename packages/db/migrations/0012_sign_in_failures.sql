CREATE TABLE "sign_in_failures" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sign_in_failures_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bucket" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sign_in_failures_bucket" ON "sign_in_failures" USING btree ("bucket","at");--> statement-breakpoint
CREATE INDEX "sign_in_failures_at" ON "sign_in_failures" USING btree ("at");