CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tracked_accounts" ADD COLUMN "user_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email" ON "users" USING btree ("email") WHERE "users"."email" is not null;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tracked_accounts" ADD CONSTRAINT "tracked_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tracked_accounts_user_id" ON "tracked_accounts" USING btree ("user_id");