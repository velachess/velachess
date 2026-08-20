CREATE TYPE "public"."deviation_type" AS ENUM('deviation', 'gap', 'book-ended', 'completed');--> statement-breakpoint
CREATE TYPE "public"."engine_category" AS ENUM('ok', 'inaccuracy', 'mistake', 'blunder');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deviations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"repertoire_id" uuid,
	"chapter_id" uuid,
	"repertoire_name_snapshot" text NOT NULL,
	"chapter_name_snapshot" text NOT NULL,
	"type" "deviation_type" NOT NULL,
	"in_book_plies" integer NOT NULL,
	"ply" integer,
	"position_key" text,
	"played_san" text,
	"expected_sans" jsonb,
	"cp_loss" integer,
	"engine_category" "engine_category",
	"drillable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deviations" ADD CONSTRAINT "deviations_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deviations" ADD CONSTRAINT "deviations_repertoire_id_repertoires_id_fk" FOREIGN KEY ("repertoire_id") REFERENCES "public"."repertoires"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deviations" ADD CONSTRAINT "deviations_chapter_id_repertoire_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."repertoire_chapters"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "deviations_game_repertoire" ON "deviations" USING btree ("game_id","repertoire_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deviations_repertoire_id" ON "deviations" USING btree ("repertoire_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deviations_chapter_id" ON "deviations" USING btree ("chapter_id");