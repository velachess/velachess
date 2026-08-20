CREATE TYPE "public"."repertoire_source" AS ENUM('manual', 'extracted');--> statement-breakpoint
ALTER TYPE "public"."deviation_type" ADD VALUE 'unmatched';--> statement-breakpoint
ALTER TYPE "public"."drill_origin" ADD VALUE 'repertoire-line';--> statement-breakpoint
ALTER TABLE "exercise_sources" DROP CONSTRAINT "exercise_sources_origin_shape";--> statement-breakpoint
ALTER TABLE "deviations" ALTER COLUMN "chapter_name_snapshot" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "exercise_sources" ADD COLUMN "chapter_id" uuid;--> statement-breakpoint
ALTER TABLE "repertoires" ADD COLUMN "source" "repertoire_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercise_sources" ADD CONSTRAINT "exercise_sources_chapter_id_repertoire_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."repertoire_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_sources_chapter" ON "exercise_sources" USING btree ("exercise_id","chapter_id") WHERE "exercise_sources"."chapter_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "exercise_sources_chapter_id" ON "exercise_sources" USING btree ("chapter_id");
