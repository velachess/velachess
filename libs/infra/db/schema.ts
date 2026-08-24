/**
 * Persists what packages/ingest produces. Enums are derived from ingest's
 * own zod schemas, never retyped by hand — the day ingest adds a fourth
 * source, this file fails to typecheck instead of silently drifting.
 */

// Leaf import on purpose: the package index re-exports providers, which pull
// the chess toolchain — schema.ts must stay loadable by drizzle-kit's plain
// TS loader. schema.ts (zod-only) is the actual source of these enums anyway.
import type { ChessComCursor } from "@velachess/platforms/providers/chess-com";
import type { LichessCursor } from "@velachess/platforms/providers/lichess";
import {
  gameSourceSchema,
  perspectiveSchema,
  resultSchema,
} from "@velachess/platforms/schema";
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The zod schemas are the source of truth for these values. Keeping their
 * literal tuple (instead of widening to string[]) is what makes drizzle
 * type the columns as the union, so a bad value fails to compile here
 * rather than at runtime in Postgres.
 */
const enumValues = <T extends string>(values: readonly T[]) =>
  values as unknown as [T, ...T[]];

export const gameSourceEnum = pgEnum("game_source", enumValues(gameSourceSchema.options));
export const perspectiveEnum = pgEnum(
  "perspective",
  enumValues(perspectiveSchema.options),
);
export const resultEnum = pgEnum("game_result", enumValues(resultSchema.options));
/** "pgn" excluded — a paste has no account to sync from. */
export const platformEnum = pgEnum("platform", ["chess_com", "lichess"]);

/**
 * A person, and the anchor every owned row hangs from.
 *
 * Better Auth owns the columns and writes them through its Drizzle
 * adapter — but the table keeps its name and, crucially, its `uuid`
 * primary key, because `tracked_accounts`, `repertoires` and `exercises`
 * all reference it. Better Auth is configured with
 * `advanced.database.generateId: "uuid"` so it produces ids this column
 * accepts; the alternative was retyping three foreign keys to text.
 *
 * A VelaChess user is NOT a chess.com or Lichess account. Those are
 * `tracked_accounts`, and one user may hold several.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Better Auth's `name`. Not null because Better Auth requires it. */
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * A logged-in browser. Better Auth's `session`, database-backed on
 * purpose: revocation is the whole reason this is a row and not a JWT —
 * logging out has to end access now, not at expiry.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("sessions_user_id").on(table.userId)],
);

/**
 * How a user proves who they are: a password hash, or a link to an
 * external identity provider.
 *
 * Named `auth_accounts` rather than Better Auth's default `account`
 * because this repository already has an "account" and it is a different
 * thing entirely — `tracked_accounts` is a chess.com or Lichess handle.
 * One word, one meaning; the glossary rule applies to tables too.
 */
export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Which authority issued this identity — null for local passwords. */
    issuer: text("issuer"),
    /** The id this identity has at the provider. For passwords, the user id. */
    accountId: text("account_id").notNull(),
    /** `credential` for a password; otherwise the social provider's name. */
    providerId: text("provider_id").notNull(),
    /** Hashed by Better Auth. Null for social identities. */
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("auth_accounts_user_id").on(table.userId),
    uniqueIndex("auth_accounts_provider_account").on(table.providerId, table.accountId),
  ],
);

/** Short-lived proofs — email verification, password reset. Better Auth's. */
export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("verifications_identifier").on(table.identifier)],
);

/**
 * Better Auth's own rate-limit store, for `rateLimit.storage: "database"`.
 *
 * The shape is not ours to choose — it is what @better-auth/core declares in
 * `db/get-tables.mjs` for the `rateLimit` model: `key` (unique string),
 * `count` (number) and `lastRequest` (number, **bigint**, epoch millis, not a
 * timestamp). Getting the type wrong here fails at runtime, inside the
 * library, on the first throttled request — so it is written to match rather
 * than to look like the rest of this file.
 *
 * One row per key, updated in place: Better Auth also prunes it itself
 * (`deleteExpiredRows` inside its `consume`), so nothing here needs a
 * cleanup job.
 */
export const authRateLimits = pgTable("auth_rate_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/**
 * The API's own rate limiter — separate from Better Auth's on purpose.
 *
 * Better Auth owns `/auth/*` and throttles it with its own table above;
 * this one covers the authenticated application routes, keyed by user.
 * Same storage shape deliberately: one row per key, updated in place, so
 * the row count is bounded by users rather than by elapsed time and there
 * is nothing to prune.
 *
 * `lastRequest` here IS a timestamp, unlike Better Auth's — this table is
 * ours, and Postgres comparing intervals beats comparing epoch integers.
 */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  lastRequest: timestamp("last_request", { withTimezone: true }).notNull(),
});

/**
 * A chess.com or Lichess handle this user follows.
 *
 * `user_id` is part of the unique key and NOT NULL, which is the whole
 * point: usernames are public, so two VelaChess users may both track the
 * same handle, and each gets their own row, cursor and refresh budget.
 * Before this, uniqueness was `(platform, username)` globally — written
 * in migration 0000, before users existed in 0001 — and importing a name
 * someone else already tracked silently transferred their whole archive.
 */
export const trackedAccounts = pgTable(
  "tracked_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    // Stored lowercase deliberately — both Chess.com and Lichess usernames
    // are case-insensitive. Normalizing at the query layer keeps this a
    // plain column pair, which Drizzle can target with a typed upsert
    // (a case-insensitive expression index can't be an onConflict target).
    username: text("username").notNull(),
    /** Opaque at runtime — ChessComCursor and LichessCursor are structurally
     * different shapes, only the provider that produced it ever reads inside
     * it. The $type<>() here is compile-time only (no validation), just
     * documentation of what can actually land in this column. */
    syncCursor: jsonb("sync_cursor").$type<ChessComCursor | LichessCursor>(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tracked_accounts_user_platform_username").on(
      table.userId,
      table.platform,
      table.username,
    ),
    index("tracked_accounts_user_id").on(table.userId),
  ],
);

/**
 * Public provider metadata for ANY player — the picture and flag beside a
 * name — cached under the handle itself, not under whoever happens to be
 * connected to it. Tracked accounts own a sync cursor; this owns an
 * identity. The two concerns stay apart: an opponent never becomes a row
 * here because someone tracked them, and two users reviewing games
 * against the same opponent share one cache entry and one refresh budget.
 *
 * Keyed `(platform, username)` globally — unlike `tracked_accounts`, there
 * is no per-user ownership: usernames are public and the metadata is too.
 */
export const providerProfiles = pgTable(
  "provider_profiles",
  {
    platform: platformEnum("platform").notNull(),
    // Lowercase, like tracked_accounts.username — both providers'
    // usernames are case-insensitive and the key must not fork on case.
    username: text("username").notNull(),
    avatarUrl: text("avatar_url"),
    /** Lichess only — an asset id like `people.santa-claus`, not a URL.
     * Kept apart from `avatar_url`: it decorates the name, it is not a
     * face. */
    flair: text("flair"),
    /** Last time we asked the provider about this handle — stamped on
     * every attempt, successful or not, so a dead endpoint is retried at
     * the refresh cadence rather than on every game open. */
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("provider_profiles_platform_username").on(table.platform, table.username),
  ],
);

export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: gameSourceEnum("source").notNull(),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    accountId: uuid("account_id").references(() => trackedAccounts.id, {
      onDelete: "set null",
    }),
    perspective: perspectiveEnum("perspective"),
    whiteName: text("white_name").notNull(),
    whiteRating: integer("white_rating"),
    blackName: text("black_name").notNull(),
    blackRating: integer("black_rating"),
    result: resultEnum("result").notNull(),
    playedAt: timestamp("played_at", { withTimezone: true }),
    timeControlInitialSeconds: integer("time_control_initial_seconds"),
    timeControlIncrementSeconds: integer("time_control_increment_seconds"),
    timeControlRaw: text("time_control_raw"),
    openingEco: text("opening_eco"),
    openingName: text("opening_name"),
    openingUrl: text("opening_url"),
    termination: text("termination"),
    hasClocks: boolean("has_clocks").notNull(),
    // Raw PGN text, not a compact per-move encoding (En Croissant's
    // 1-byte legal-move-rank, Lichess's Huffman coding). Upgrade path if size
    // or volume ever becomes a measured problem — not before.
    rawPgn: text("raw_pgn").notNull(),
    movetextHash: text("movetext_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Both scoped to the tracked account: each account owns a complete,
    // independent copy of whatever it imports, and dedup only ever
    // happens within one account — never across two accounts tracking
    // the same real provider handle.
    uniqueIndex("games_account_source_external_id")
      .on(table.accountId, table.source, table.externalId)
      .where(sql`${table.externalId} is not null`),
    unique("games_account_movetext")
      .on(table.accountId, table.movetextHash)
      .nullsNotDistinct(),
    // Doubles as the account_id FK index — a composite index also serves
    // lookups/joins on just its leftmost column, so this covers both the
    // game-list query and the account_id FK, no separate index needed.
    index("games_account_played_at").on(table.accountId, table.playedAt.desc()),
  ],
);

/**
 * How a repertoire came to exist, which decides what extraction may touch.
 * 'extracted' = a candidate derived from games — evidence, not intent —
 * that re-extraction may replace wholesale. 'manual' = declared or edited
 * preparation, which extraction must never silently overwrite. A manual
 * edit to an extracted repertoire confirms it (flips it to 'manual').
 */
export const repertoireSourceEnum = pgEnum("repertoire_source", ["manual", "extracted"]);

export const repertoires = pgTable(
  "repertoires",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // One side per repertoire. Reuses perspectiveEnum — same values, same
    // zod origin; a second white/black enum would just drift.
    color: perspectiveEnum("color").notNull(),
    source: repertoireSourceEnum("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("repertoires_user_id").on(table.userId)],
);

export const repertoireChapters = pgTable(
  "repertoire_chapters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repertoireId: uuid("repertoire_id")
      .notNull()
      .references(() => repertoires.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull(),
    // Source of truth for the tree — rebuilt on read by buildRepertoireTree.
    // PGN validity is the caller's job; db does not parse.
    pgn: text("pgn").notNull(),
    /** null = standard starting position. */
    startingFen: text("starting_fen"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("repertoire_chapters_repertoire_id").on(table.repertoireId),
    unique("repertoire_chapters_repertoire_sort").on(table.repertoireId, table.sortOrder),
  ],
);

/**
 * Values align 1:1 with DeviationEvent.type in libs/repertoire, plus
 * "completed" for DeviationResult.event === null (whole game stayed in
 * book) and "unmatched" for a game no chapter of the repertoire could
 * judge — a different starting universe, or no chapter at all. Persisted
 * rather than skipped so an unmatched game is a countable answer instead
 * of an eternally pending one.
 *
 * The product vocabulary maps 1:1 onto these storage names: completed =
 * held, deviation = player-left, gap = opponent-left, book-ended =
 * repertoire-ended. Mutually exclusive by construction — one judgment row
 * per (game, repertoire) carries exactly one.
 */
export const deviationTypeEnum = pgEnum("deviation_type", [
  "deviation",
  "gap",
  "book-ended",
  "completed",
  "unmatched",
]);

/** Filled by the analysis cycle; nullable columns exist from day one. */
export const engineCategoryEnum = pgEnum("engine_category", [
  "ok",
  "inaccuracy",
  "mistake",
  "blunder",
]);

/**
 * One judgment per (game, repertoire) — not "one deviation". Event columns
 * are null exactly when type = 'completed'. Name snapshots survive
 * repertoire deletion (the reason repertoire_id/chapter_id are nullable
 * with set null).
 */
export const deviations = pgTable(
  "deviations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    repertoireId: uuid("repertoire_id").references(() => repertoires.id, {
      onDelete: "set null",
    }),
    chapterId: uuid("chapter_id").references(() => repertoireChapters.id, {
      onDelete: "set null",
    }),
    repertoireNameSnapshot: text("repertoire_name_snapshot").notNull(),
    /** Null for 'unmatched' — no chapter judged the game, so none to name. */
    chapterNameSnapshot: text("chapter_name_snapshot"),
    type: deviationTypeEnum("type").notNull(),
    inBookPlies: integer("in_book_plies").notNull(),
    /** Total mainline plies of the judged game — the "too short to count"
     * floor in adherence metrics needs it. Nullable: judgments predating
     * the column. */
    gamePlies: integer("game_plies"),
    ply: integer("ply"),
    positionKey: text("position_key"),
    playedSan: text("played_san"),
    /** Only for type = 'deviation'. */
    expectedSans: jsonb("expected_sans").$type<string[]>(),
    cpLoss: integer("cp_loss"),
    engineCategory: engineCategoryEnum("engine_category"),
    drillable: boolean("drillable").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Re-judging upserts instead of duplicating. Matches current findDeviation
    // (at most one event per game); cycle 2.1 widens to (game, repertoire, ply)
    // if multiple deviations per game ever ship.
    uniqueIndex("deviations_game_repertoire").on(table.gameId, table.repertoireId),
    index("deviations_repertoire_id").on(table.repertoireId),
    index("deviations_chapter_id").on(table.chapterId),
  ],
);

/** Structural mirror of @velachess/analysis's GradedPly — declared
 * locally so drizzle-kit's schema loader never touches the chess toolchain.
 * Compatibility is asserted at typecheck in queries/analysis.ts. */
export interface StoredGradedPly {
  ply: number;
  fen: string;
  san: string;
  evalBefore: { cp?: number; mate?: number };
  evalAfter: { cp?: number; mate?: number };
  bestMove: string;
  category: "best" | "good" | "inaccuracy" | "mistake" | "blunder";
  winChanceLoss: number;
}

/** One row per analyzed game. Row existence = analyzed; the row is also
 * the whole-report cache — re-requesting an analyzed game reads it back. */
export const gameAnalyses = pgTable(
  "game_analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    engineVersion: text("engine_version").notNull(),
    depth: integer("depth").notNull(),
    positions: jsonb("positions").$type<StoredGradedPly[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("game_analyses_game_id").on(table.gameId)],
);

/**
 * A run's graded positions, as they land. Deliberately NOT part of the
 * report.
 *
 * `game_analyses` is the durable record and commits in one transaction
 * with every judgment's severity. Progress cannot live in that
 * transaction — an uncommitted row is invisible to the connection
 * streaming it — so it is written and committed one position at a time,
 * and deleted once the report lands. Losing these rows costs nothing.
 *
 * `run_id` is why a crashed run cannot poison the next one: a stale
 * writer appends under its own id and readers only ever follow the
 * newest.
 */
export const analysisProgress = pgTable(
  "analysis_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Insertion order, and the only reliable way to tell which run is the
     * newer one. `created_at` is not: several rows written inside the same
     * clock tick tie, and a tie here means reading a dead run's progress.
     */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    runId: uuid("run_id").notNull(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    /** 0-based, matching the analysis event. Not the position's ply. */
    index: integer("index").notNull(),
    total: integer("total").notNull(),
    position: jsonb("position").$type<StoredGradedPly>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A retried job replaying the same index is a no-op, not a duplicate.
    uniqueIndex("analysis_progress_run_index").on(table.runId, table.index),
    index("analysis_progress_game_seq").on(table.gameId, table.seq.desc()),
  ],
);

export const drillGradeEnum = pgEnum("training_grade", ["again", "hard", "good", "easy"]);

/** One exercise per (user, position) — the same deviation point reached in
 * two games merges here, with provenance in exercise_sources. */
export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    positionKey: text("position_key").notNull(),
    expectedSans: jsonb("expected_sans").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("exercises_user_position").on(table.userId, table.positionKey),
    index("exercises_user_id").on(table.userId),
  ],
);

/**
 * Where a drill came from. Named rather than inferred from which column
 * is filled: a nullable column per origin with a `CHECK` listing the
 * combinations works for two and becomes patchwork at the third, and
 * `curated` — the fixed catalogue, mate-in-two and the like — is already
 * on the way.
 */
/** The kinds an exercise can trace back to. Named so the application can
 * speak the enum instead of restating its strings. */
export type DrillOriginKind = (typeof drillOriginEnum)["enumValues"][number];

export const drillOriginEnum = pgEnum("drill_origin", [
  "repertoire-deviation",
  "engine-blunder",
  "repertoire-line",
]);

/**
 * A drill's provenance. One exercise can have several: identity is
 * (user, position), so deviating from your preparation in a position and
 * later blundering in the same one is one exercise with two records here.
 *
 * The engine origin is a natural key rather than a foreign key because
 * graded plies are not rows — they live as `jsonb` on `game_analyses`.
 * Creating a table of plies to win the FK would mean migrating how every
 * analysis is stored for the sake of one relationship.
 */
export const exerciseSources = pgTable(
  "exercise_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    origin: drillOriginEnum("origin").notNull(),
    deviationId: uuid("deviation_id").references(() => deviations.id, {
      onDelete: "cascade",
    }),
    gameId: uuid("game_id").references(() => games.id, { onDelete: "cascade" }),
    ply: integer("ply"),
    /** repertoire-line only: the chapter whose tree produced the decision
     * position. Cascade — a deleted chapter takes its line-sources with
     * it, while the exercise (keyed on user + position) and its card
     * survive through any other source they have. */
    chapterId: uuid("chapter_id").references(() => repertoireChapters.id, {
      onDelete: "cascade",
    }),
  },
  (table) => [
    // Partial uniqueness per origin — idempotency without inventing a
    // sentinel value to keep a composite primary key alive.
    uniqueIndex("exercise_sources_deviation")
      .on(table.exerciseId, table.deviationId)
      .where(sql`${table.deviationId} IS NOT NULL`),
    uniqueIndex("exercise_sources_ply")
      .on(table.exerciseId, table.gameId, table.ply)
      .where(sql`${table.gameId} IS NOT NULL`),
    uniqueIndex("exercise_sources_chapter")
      .on(table.exerciseId, table.chapterId)
      .where(sql`${table.chapterId} IS NOT NULL`),
    index("exercise_sources_deviation_id").on(table.deviationId),
    index("exercise_sources_game_id").on(table.gameId),
    index("exercise_sources_chapter_id").on(table.chapterId),
    // Each origin brings exactly the columns it needs, and no others.
    check(
      "exercise_sources_origin_shape",
      sql`(${table.origin} = 'repertoire-deviation'
             AND ${table.deviationId} IS NOT NULL
             AND ${table.gameId} IS NULL AND ${table.ply} IS NULL
             AND ${table.chapterId} IS NULL)
          OR (${table.origin} = 'engine-blunder'
             AND ${table.deviationId} IS NULL
             AND ${table.gameId} IS NOT NULL AND ${table.ply} IS NOT NULL
             AND ${table.chapterId} IS NULL)
          OR (${table.origin} = 'repertoire-line'
             AND ${table.deviationId} IS NULL
             AND ${table.gameId} IS NULL AND ${table.ply} IS NULL
             AND ${table.chapterId} IS NOT NULL)`,
    ),
  ],
);

export const drillResponses = pgTable(
  "training_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    correct: boolean("correct").notNull(),
    grade: drillGradeEnum("grade").notNull(),
    responseTimeMs: integer("response_time_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("training_responses_exercise_id").on(table.exerciseId)],
);

export const cardPhaseEnum = pgEnum("card_phase", [
  "new",
  "learning",
  "review",
  "relearning",
]);

/** One scheduled card per exercise. "Is it due" is derived at read time
 * from `due` vs. now — never stored. */
export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    due: timestamp("due", { withTimezone: true }).notNull(),
    stability: doublePrecision("stability").notNull(),
    difficulty: doublePrecision("difficulty").notNull(),
    elapsedDays: integer("elapsed_days").notNull().default(0),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    learningSteps: integer("learning_steps").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    phase: cardPhaseEnum("phase").notNull(),
    lastReview: timestamp("last_review", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("cards_exercise_id").on(table.exerciseId),
    index("cards_due").on(table.due),
  ],
);

export type GameAnalysisRow = typeof gameAnalyses.$inferSelect;
export type TrackedAccount = typeof trackedAccounts.$inferSelect;
export type NewTrackedAccount = typeof trackedAccounts.$inferInsert;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type AuthAccount = typeof authAccounts.$inferSelect;
export type Repertoire = typeof repertoires.$inferSelect;
export type NewRepertoire = typeof repertoires.$inferInsert;
export type RepertoireChapter = typeof repertoireChapters.$inferSelect;
export type NewRepertoireChapter = typeof repertoireChapters.$inferInsert;
export type Deviation = typeof deviations.$inferSelect;
export type NewDeviation = typeof deviations.$inferInsert;
export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
export type DrillResponse = typeof drillResponses.$inferSelect;
export type NewDrillResponse = typeof drillResponses.$inferInsert;
export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
