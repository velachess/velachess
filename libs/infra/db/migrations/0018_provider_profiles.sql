CREATE TABLE "provider_profiles" (
	"platform" "platform" NOT NULL,
	"username" text NOT NULL,
	"avatar_url" text,
	"flair" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "provider_profiles_platform_username" ON "provider_profiles" USING btree ("platform","username");--> statement-breakpoint
-- Identity moved from the connection row to the handle row: carry over what
-- connect-time reads already stored, one profile per handle, never empty.
INSERT INTO "provider_profiles" ("platform", "username", "avatar_url", "flair", "fetched_at")
SELECT "platform", "username", max("avatar_url"), max("flair"), now()
FROM "tracked_accounts"
WHERE "avatar_url" IS NOT NULL OR "flair" IS NOT NULL
GROUP BY "platform", "username"
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "tracked_accounts" DROP COLUMN "avatar_url";--> statement-breakpoint
ALTER TABLE "tracked_accounts" DROP COLUMN "flair";