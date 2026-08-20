CREATE TABLE "analysis_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"run_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"total" integer NOT NULL,
	"position" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_progress" ADD CONSTRAINT "analysis_progress_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_progress_run_index" ON "analysis_progress" USING btree ("run_id","index");--> statement-breakpoint
CREATE INDEX "analysis_progress_game_seq" ON "analysis_progress" USING btree ("game_id","seq" DESC NULLS LAST);