-- Real identity arrives: Better Auth tables, and ownership becomes
-- per-user instead of global.
--
-- DESTRUCTIVE, deliberately. Every row in this database is development
-- data belonging to a placeholder user (default@velachess.local) that has
-- no credentials and cannot survive into a world where users log in.
-- Adopting it would mean inventing a password for a row nobody owns;
-- wiping it costs one re-import. The decision was made explicitly, not
-- discovered by an operator.
TRUNCATE TABLE
  analysis_progress,
  game_analyses,
  exercise_sources,
  training_responses,
  cards,
  exercises,
  deviations,
  repertoire_chapters,
  repertoires,
  games,
  tracked_accounts,
  users
CASCADE;
--> statement-breakpoint

-- users: from ownership placeholder to Better Auth's user model. The uuid
-- primary key stays — three tables reference it.
DROP INDEX IF EXISTS "users_email";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "display_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

CREATE TABLE "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sessions_token_unique" UNIQUE("token")
);--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_id" ON "sessions" USING btree ("user_id");--> statement-breakpoint

-- auth_accounts, not "account": this repository already uses "account"
-- for a chess platform handle, and one word means one thing.
CREATE TABLE "auth_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "issuer" text,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "password" text,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp with time zone,
  "refresh_token_expires_at" timestamp with time zone,
  "scope" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_accounts_user_id" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_provider_account" ON "auth_accounts" USING btree ("provider_id","account_id");--> statement-breakpoint

CREATE TABLE "verifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "verifications_identifier" ON "verifications" USING btree ("identifier");--> statement-breakpoint

-- tracked_accounts: ownership joins the key. The old constraint was
-- written in migration 0000, before users existed in 0001, and made
-- (platform, username) globally unique — so a second user importing a
-- name the first already tracked silently took over their archive.
-- user_id also becomes NOT NULL with CASCADE: an unowned connection is
-- not a thing, and SET NULL was how games got orphaned.
DROP INDEX IF EXISTS "tracked_accounts_platform_username";--> statement-breakpoint
ALTER TABLE "tracked_accounts" DROP CONSTRAINT IF EXISTS "tracked_accounts_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "tracked_accounts" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tracked_accounts" ADD CONSTRAINT "tracked_accounts_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_accounts_user_platform_username"
  ON "tracked_accounts" USING btree ("user_id","platform","username");
