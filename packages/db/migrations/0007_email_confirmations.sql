CREATE TABLE "email_confirmations" (
	"did" text PRIMARY KEY NOT NULL,
	"email" text,
	"confirmed_at" timestamp with time zone,
	"pending_email" text,
	"code_hash" text,
	"code_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"send_window_started_at" timestamp with time zone,
	"sends_in_window" integer DEFAULT 0 NOT NULL
);
