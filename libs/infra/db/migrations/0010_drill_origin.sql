CREATE TYPE "public"."drill_origin" AS ENUM('repertoire-deviation', 'engine-blunder');--> statement-breakpoint
ALTER TABLE "exercise_sources" DROP CONSTRAINT "exercise_sources_exercise_id_deviation_id_pk";--> statement-breakpoint
ALTER TABLE "exercise_sources" ALTER COLUMN "deviation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "exercise_sources" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
-- Nullable first, then backfilled, then tightened. Every row that exists
-- is a repertoire deviation: until this migration that was the only
-- origin the table could hold. Adding the column NOT NULL in one step
-- would fail on any database that already has drills.
ALTER TABLE "exercise_sources" ADD COLUMN "origin" "drill_origin";--> statement-breakpoint
UPDATE "exercise_sources" SET "origin" = 'repertoire-deviation' WHERE "origin" IS NULL;--> statement-breakpoint
ALTER TABLE "exercise_sources" ALTER COLUMN "origin" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "exercise_sources" ADD COLUMN "game_id" uuid;--> statement-breakpoint
ALTER TABLE "exercise_sources" ADD COLUMN "ply" integer;--> statement-breakpoint
ALTER TABLE "exercise_sources" ADD CONSTRAINT "exercise_sources_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_sources_deviation" ON "exercise_sources" USING btree ("exercise_id","deviation_id") WHERE "exercise_sources"."deviation_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_sources_ply" ON "exercise_sources" USING btree ("exercise_id","game_id","ply") WHERE "exercise_sources"."game_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "exercise_sources_game_id" ON "exercise_sources" USING btree ("game_id");--> statement-breakpoint
ALTER TABLE "exercise_sources" ADD CONSTRAINT "exercise_sources_origin_shape" CHECK (("exercise_sources"."origin" = 'repertoire-deviation'
             AND "exercise_sources"."deviation_id" IS NOT NULL
             AND "exercise_sources"."game_id" IS NULL AND "exercise_sources"."ply" IS NULL)
          OR ("exercise_sources"."origin" = 'engine-blunder'
             AND "exercise_sources"."deviation_id" IS NULL
             AND "exercise_sources"."game_id" IS NOT NULL AND "exercise_sources"."ply" IS NOT NULL));