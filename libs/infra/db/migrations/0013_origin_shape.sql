-- Separate file, and ::text casts, both on purpose: 'repertoire-line' is
-- added to drill_origin in 0012, and Postgres refuses to RESOLVE a new
-- enum value inside the transaction that added it — which is the same
-- transaction, because drizzle-kit applies every pending migration in
-- one. Comparing origin::text against string literals never touches the
-- enum's value list, so the check is valid in the same batch and on a
-- fresh database alike.
ALTER TABLE "exercise_sources" ADD CONSTRAINT "exercise_sources_origin_shape" CHECK (("exercise_sources"."origin"::text = 'repertoire-deviation'
             AND "exercise_sources"."deviation_id" IS NOT NULL
             AND "exercise_sources"."game_id" IS NULL AND "exercise_sources"."ply" IS NULL
             AND "exercise_sources"."chapter_id" IS NULL)
          OR ("exercise_sources"."origin"::text = 'engine-blunder'
             AND "exercise_sources"."deviation_id" IS NULL
             AND "exercise_sources"."game_id" IS NOT NULL AND "exercise_sources"."ply" IS NOT NULL
             AND "exercise_sources"."chapter_id" IS NULL)
          OR ("exercise_sources"."origin"::text = 'repertoire-line'
             AND "exercise_sources"."deviation_id" IS NULL
             AND "exercise_sources"."game_id" IS NULL AND "exercise_sources"."ply" IS NULL
             AND "exercise_sources"."chapter_id" IS NOT NULL));
