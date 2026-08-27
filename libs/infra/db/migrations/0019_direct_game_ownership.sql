-- Direct ownership: games hang from their user, not from a tracked
-- account. A manual PGN import has no account to infer ownership from,
-- so the column must exist before any PGN row does. Existing rows adopt
-- their account's owner; a game without an account cannot exist yet.
ALTER TABLE "games" DROP CONSTRAINT "games_account_movetext";--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "user_id" uuid;--> statement-breakpoint
UPDATE "games"
SET "user_id" = "tracked_accounts"."user_id"
FROM "tracked_accounts"
WHERE "games"."account_id" = "tracked_accounts"."id";--> statement-breakpoint
ALTER TABLE "games" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_user_played_at" ON "games" USING btree ("user_id","played_at" DESC NULLS LAST);--> statement-breakpoint
-- Movetext dedup becomes user-scoped: one user's re-import of the same
-- PGN is a no-op, another user's import of it keeps its own row.
ALTER TABLE "games" ADD CONSTRAINT "games_user_account_movetext" UNIQUE NULLS NOT DISTINCT("user_id","account_id","movetext_hash");
