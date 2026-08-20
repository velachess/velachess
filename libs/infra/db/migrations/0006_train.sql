CREATE TYPE "public"."training_grade" AS ENUM('again', 'hard', 'good', 'easy');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exercise_sources" (
	"exercise_id" uuid NOT NULL,
	"deviation_id" uuid NOT NULL,
	CONSTRAINT "exercise_sources_exercise_id_deviation_id_pk" PRIMARY KEY("exercise_id","deviation_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"position_key" text NOT NULL,
	"expected_sans" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercise_id" uuid NOT NULL,
	"correct" boolean NOT NULL,
	"grade" "training_grade" NOT NULL,
	"response_time_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_sources" ADD CONSTRAINT "exercise_sources_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_sources" ADD CONSTRAINT "exercise_sources_deviation_id_deviations_id_fk" FOREIGN KEY ("deviation_id") REFERENCES "public"."deviations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "training_responses" ADD CONSTRAINT "training_responses_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercise_sources_deviation_id" ON "exercise_sources" USING btree ("deviation_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exercises_user_position" ON "exercises" USING btree ("user_id","position_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercises_user_id" ON "exercises" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_responses_exercise_id" ON "training_responses" USING btree ("exercise_id");