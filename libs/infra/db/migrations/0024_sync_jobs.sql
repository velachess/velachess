CREATE TYPE "public"."sync_job_error" AS ENUM('not-found', 'incomplete', 'internal');--> statement-breakpoint
CREATE TYPE "public"."sync_job_status" AS ENUM('queued', 'running', 'retrying', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_job_trigger" AS ENUM('connect', 'manual');--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"trigger" "sync_job_trigger" NOT NULL,
	"status" "sync_job_status" DEFAULT 'queued' NOT NULL,
	"games_fetched" integer,
	"games_inserted" integer,
	"error_code" "sync_job_error",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_account_id_tracked_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."tracked_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sync_jobs_one_active_per_account" ON "sync_jobs" USING btree ("account_id") WHERE "sync_jobs"."status" in ('queued', 'running', 'retrying');--> statement-breakpoint
CREATE INDEX "sync_jobs_account_created" ON "sync_jobs" USING btree ("account_id","created_at" DESC NULLS LAST);