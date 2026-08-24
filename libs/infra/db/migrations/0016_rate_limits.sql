-- Two limiters, two tables, on purpose.
--
-- "auth_rate_limits" is Better Auth's own — its shape is dictated by the
-- library (key / count / last_request as epoch millis, hence bigint) and
-- it is pointed at by `rateLimit: { storage: "database", modelName:
-- "authRateLimits" }`. It prunes itself inside consume; nothing to schedule.
--
-- "rate_limits" is ours, for the application's routes, keyed by the userId
-- the session already proved. One row per key, updated in place: the row
-- count is bounded by the number of users, not by elapsed time.
CREATE TABLE "auth_rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "auth_rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"last_request" timestamp with time zone NOT NULL
);
