CREATE TYPE "public"."game_source" AS ENUM('chess_com', 'lichess', 'pgn');--> statement-breakpoint
CREATE TYPE "public"."perspective" AS ENUM('white', 'black');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('chess_com', 'lichess');--> statement-breakpoint
CREATE TYPE "public"."game_result" AS ENUM('1-0', '0-1', '1/2-1/2', '*');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "game_source" NOT NULL,
	"external_id" text,
	"external_url" text,
	"account_id" uuid,
	"perspective" "perspective",
	"white_name" text NOT NULL,
	"white_rating" integer,
	"black_name" text NOT NULL,
	"black_rating" integer,
	"result" "game_result" NOT NULL,
	"played_at" timestamp with time zone,
	"time_control_initial_seconds" integer,
	"time_control_increment_seconds" integer,
	"time_control_raw" text,
	"opening_eco" text,
	"opening_name" text,
	"opening_url" text,
	"termination" text,
	"has_clocks" boolean NOT NULL,
	"raw_pgn" text NOT NULL,
	"movetext_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_account_movetext" UNIQUE NULLS NOT DISTINCT("account_id","movetext_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracked_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" "platform" NOT NULL,
	"username" text NOT NULL,
	"sync_cursor" jsonb,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "games" ADD CONSTRAINT "games_account_id_tracked_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."tracked_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "games_source_external_id" ON "games" USING btree ("source","external_id") WHERE "games"."external_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "games_account_played_at" ON "games" USING btree ("account_id","played_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tracked_accounts_platform_username" ON "tracked_accounts" USING btree ("platform","username");