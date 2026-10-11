DROP INDEX "tracked_accounts_user_platform_username";--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_accounts_user_platform" ON "tracked_accounts" USING btree ("user_id","platform");