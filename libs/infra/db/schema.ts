/**
 * Persists what packages/ingest produces. Enums are derived from ingest's
 * own zod schemas, never retyped by hand — the day ingest adds a fourth
 * source, this file fails to typecheck instead of silently drifting.
 */

// Leaf import on purpose: the package index re-exports providers, which pull
// the chess toolchain — schema.ts must stay loadable by drizzle-kit's plain
// TS loader. schema.ts (zod-only) is the actual source of these enums anyway.
import type { ChessComCursor } from "@velachess/infra-platforms/providers/chess-com";
import type { LichessCursor } from "@velachess/infra-platforms/providers/lichess";
import {
  accountPlatformSchema,
  gameSourceSchema,
  perspectiveSchema,
  resultSchema,
} from "@velachess/infra-platforms/schema";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
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
function enumValues<T extends string>(values: readonly T[]): [T, ...T[]] {
  const [first, ...rest] = values;
  if (first === undefined) throw new Error("pgEnum needs at least one value");
  return [first, ...rest];
}

export const gameSourceEnum = pgEnum("game_source", enumValues(gameSourceSchema.options));
export const perspectiveEnum = pgEnum(
  "perspective",
  enumValues(perspectiveSchema.options),
);
export const resultEnum = pgEnum("game_result", enumValues(resultSchema.options));
/** "pgn" excluded — a paste has no account to sync from. The exclusion
 * lives in `accountPlatformSchema`, so this derives like the three above
 * instead of restating the list. */
export const platformEnum = pgEnum("platform", enumValues(accountPlatformSchema.options));

/**
 * A person, and the anchor every owned row hangs from.
 *
 * Better Auth owns the columns and writes them through its Drizzle
 * adapter — but the table keeps its name and, crucially, its `uuid`
 * primary key, because `tracked_accounts` and `games` reference it. Better Auth is configured with
 * `advanced.database.generateId: "uuid"` so it produces ids this column
 * accepts; the alternative was retyping the foreign keys to text.
 *
 * A VelaChess user is NOT a chess.com or Lichess account. Those are
 * `tracked_accounts`, and one user may hold several.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Better Auth's `name`. Not null because Better Auth requires it. */
    displayName: text("display_name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    /**
     * The effective avatar URL, whatever its origin. Better Auth writes the
     * OAuth profile picture here when it creates the user, and never again —
     * both of its overwrite paths (`overrideUserInfoOnSignIn`,
     * `accountLinking.updateUserInfoOnLink`) are opt-in and unset. The
     * application owns the column after that.
     */
    image: text("image"),
    /**
     * Who last set `image`, written only by VelaChess: `custom` for an
     * upload, `none` for a deliberate removal. `null` means untouched by us,
     * so OAuth-initialized is `image != null AND avatar_source IS NULL`.
     *
     * Exists because `image IS NULL` alone cannot tell "never had a picture"
     * from "deleted theirs", and only the second must stay empty. The check
     * constraint below is the runtime guard `$type<>()` cannot be.
     */
    avatarSource: text("avatar_source").$type<"custom" | "none">(),
    /**
     * When this person finished onboarding — stamped on their first
     * successful connection, and never again.
     *
     * A column rather than a derived fact: onboarding used to be inferred
     * from "no games and no accounts", which made it reappear every time
     * someone disconnected everything. Theirs to keep, so it outlives both
     * the connection and the browser.
     */
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("users_avatar_source_check", sql`${table.avatarSource} IN ('custom', 'none')`),
  ],
);

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
 * A chess.com or Lichess handle this user follows.
 *
 * `user_id` is part of the unique key and NOT NULL, which is the whole
 * point: usernames are public, so two VelaChess users may both track the
 * same handle, and each gets their own row, cursor and refresh budget.
 * Before this, uniqueness was `(platform, username)` globally — written
 * in migration 0000, before users existed in 0001 — and importing a name
 * someone else already tracked silently transferred their whole archive.
 *
 * The unique key is `(user_id, platform)`, not `(user_id, platform,
 * username)` — a user tracks at most one handle per provider. Connecting a
 * second Chess.com handle must fail, not create a sibling row; the connect
 * slice checks for an existing row on the platform before upserting, so
 * this constraint is the backstop against a race, not the only guard.
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
    uniqueIndex("tracked_accounts_user_platform").on(table.userId, table.platform),
    index("tracked_accounts_user_id").on(table.userId),
  ],
);

export const syncJobTriggerEnum = pgEnum("sync_job_trigger", ["connect", "manual"]);
export const syncJobStatusEnum = pgEnum("sync_job_status", [
  "queued",
  "running",
  "retrying",
  "succeeded",
  "failed",
]);
export const syncJobErrorEnum = pgEnum("sync_job_error", [
  "not-found",
  "incomplete",
  "internal",
]);

/**
 * One request to bring an account's archive up to date — the durable record
 * of its status and progress. pg-boss delivers it (the queue job shares this
 * row's id); it does not own its outcome. `started_at` is the delivering
 * attempt's stamp: a newer delivery re-stamps it, and an older one's writes
 * are conditional on the stamp they took.
 */
export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => trackedAccounts.id, { onDelete: "cascade" }),
    trigger: syncJobTriggerEnum("trigger").notNull(),
    status: syncJobStatusEnum("status").notNull().default("queued"),
    gamesFetched: integer("games_fetched"),
    gamesInserted: integer("games_inserted"),
    errorCode: syncJobErrorEnum("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    // One active job per account: the arbiter concurrent triggers converge on.
    uniqueIndex("sync_jobs_one_active_per_account")
      .on(table.accountId)
      .where(sql`${table.status} in ('queued', 'running', 'retrying')`),
    index("sync_jobs_account_created").on(table.accountId, table.createdAt.desc()),
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
    /**
     * The owner. Direct, not inferred through a tracked account: a PGN
     * upload has no account to hang ownership from, and every read would
     * otherwise need an inner join that silently drops it. `account_id`
     * stays as provenance only — which connected handle produced the row.
     */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: gameSourceEnum("source").notNull(),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    /** Provider provenance — null for manually imported PGNs. */
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
    // One platform game is one row per account: each account owns a
    // complete, independent copy of whatever it imports, and external-id
    // dedup never crosses two accounts — even two tracking the same real
    // provider handle.
    uniqueIndex("games_account_source_external_id")
      .on(table.accountId, table.source, table.externalId)
      .where(sql`${table.externalId} is not null`),
    // Movetext dedup is user-scoped. `nullsNotDistinct` makes a NULL
    // account_id equal to itself within the composite: two pasted PGNs of
    // one user with the same moves collapse to a no-op (the re-import is
    // idempotent), while another user importing the very same file keeps
    // their own row — ownership is per user, not global.
    unique("games_user_account_movetext")
      .on(table.userId, table.accountId, table.movetextHash)
      .nullsNotDistinct(),
    // The unified library read: every game the user owns, newest first.
    index("games_user_played_at").on(table.userId, table.playedAt.desc()),
    // Doubles as the account_id FK index — a composite index also serves
    // lookups/joins on just its leftmost column, so this covers both the
    // account-scoped game-list query and the account_id FK.
    index("games_account_played_at").on(table.accountId, table.playedAt.desc()),
  ],
);

/** Structural mirror of @velachess/analysis's GradedPly — declared
 * locally so drizzle-kit's schema loader never touches the chess toolchain.
 * Compatibility is asserted at typecheck from the analysis side, in
 * libs/analysis/process-analysis/tests/analyze-game.test.ts: analysis
 * already depends on this package, so the guard runs with the package
 * graph instead of against it. Asserting it here would need
 * @velachess/analysis as a devDependency, and that edge is a cycle.
 * No longer backs a column — analysis is browser-only and persists
 * nothing server-side — kept only for that typecheck-time guard. */
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

export type TrackedAccount = typeof trackedAccounts.$inferSelect;
export type NewTrackedAccount = typeof trackedAccounts.$inferInsert;
export type SyncJob = typeof syncJobs.$inferSelect;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type AuthAccount = typeof authAccounts.$inferSelect;
