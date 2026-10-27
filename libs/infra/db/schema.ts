// Leaf import on purpose: the package index re-exports providers, which pull
// the chess toolchain — schema.ts must stay loadable by drizzle-kit's plain
// TS loader.
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
 * The literal tuple, rather than string[], is what makes drizzle type the
 * columns as the union.
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
/** "pgn" excluded by `accountPlatformSchema` — a paste has no account to
 * sync from. */
export const platformEnum = pgEnum("platform", enumValues(accountPlatformSchema.options));

/**
 * Better Auth owns these columns, but the `uuid` primary key stays because
 * `tracked_accounts` and `games` reference it; Better Auth is configured
 * with `advanced.database.generateId: "uuid"` to produce ids it accepts.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayName: text("display_name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    /**
     * Better Auth writes the OAuth picture here at user creation and never
     * again — both overwrite paths (`overrideUserInfoOnSignIn`,
     * `accountLinking.updateUserInfoOnLink`) are opt-in and unset.
     */
    image: text("image"),
    /**
     * `custom` for an upload, `none` for a deliberate removal, `null` for
     * untouched by us — OAuth-initialized is `image != null AND
     * avatar_source IS NULL`. Exists because `image IS NULL` cannot tell
     * "never had a picture" from "deleted theirs", and only the second must
     * stay empty. The check constraint below is the runtime guard
     * `$type<>()` cannot be.
     */
    avatarSource: text("avatar_source").$type<"custom" | "none">(),
    /**
     * Stamped on the first successful connection and never again. A column
     * rather than a derived fact: inferring it from "no games and no
     * accounts" made onboarding reappear whenever someone disconnected
     * everything.
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
 * Better Auth's `session`, database-backed so that logging out ends access
 * now rather than at expiry.
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
 * Named `auth_accounts` rather than Better Auth's default `account`: an
 * account here is a chess.com or Lichess handle, `tracked_accounts`.
 */
export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Null for local passwords. */
    issuer: text("issuer"),
    /** The id at the provider; for passwords, the user id. */
    accountId: text("account_id").notNull(),
    /** `credential` for a password, else the social provider's name. */
    providerId: text("provider_id").notNull(),
    /** Hashed by Better Auth, null for social identities. */
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

/** Better Auth's short-lived proofs: email verification, password reset. */
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
 * Better Auth's rate-limit store, for `rateLimit.storage: "database"`. The
 * shape is what @better-auth/core declares in `db/get-tables.mjs` for the
 * `rateLimit` model, down to `lastRequest` being epoch millis in a bigint
 * rather than a timestamp; a mismatch fails inside the library on the first
 * throttled request. Better Auth prunes the table itself
 * (`deleteExpiredRows` inside its `consume`), so no cleanup job is needed.
 */
export const authRateLimits = pgTable("auth_rate_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/**
 * A chess.com or Lichess handle this user follows. Usernames are public, so
 * `user_id` is part of the unique key: two users may track the same handle,
 * each with their own row, cursor and refresh budget.
 *
 * The key is `(user_id, platform)`, not `(user_id, platform, username)` — a
 * user tracks at most one handle per provider, so connecting a second
 * Chess.com handle fails instead of creating a sibling row. The connect
 * slice checks first; this constraint is the backstop against a race.
 */
export const trackedAccounts = pgTable(
  "tracked_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    // Stored lowercase: both providers' usernames are case-insensitive, and
    // normalizing at the query layer keeps this a plain column a typed
    // upsert can target (an expression index cannot be an onConflict target).
    username: text("username").notNull(),
    /** Opaque: only the provider that produced it reads inside it, and the
     * `$type<>()` is a compile-time claim, not validation. */
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
 * The durable status of one request to bring an account's archive up to
 * date. pg-boss delivers it (the queue job shares this row's id) but does
 * not own its outcome. `started_at` is the delivering attempt's stamp: a
 * newer delivery re-stamps it, and an older one's writes are conditional on
 * the stamp they took.
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
    // One active job per account — what concurrent triggers converge on.
    uniqueIndex("sync_jobs_one_active_per_account")
      .on(table.accountId)
      .where(sql`${table.status} in ('queued', 'running', 'retrying')`),
    index("sync_jobs_account_created").on(table.accountId, table.createdAt.desc()),
  ],
);

/**
 * Public provider metadata for any player, cached under the handle rather
 * than under whoever is connected to it, so an opponent is not a tracked
 * account and two users sharing an opponent share one refresh budget.
 *
 * Keyed `(platform, username)` globally: the metadata is public, so unlike
 * `tracked_accounts` there is no per-user ownership.
 */
export const providerProfiles = pgTable(
  "provider_profiles",
  {
    platform: platformEnum("platform").notNull(),
    // Lowercase, like tracked_accounts.username — both providers'
    // usernames are case-insensitive and the key must not fork on case.
    username: text("username").notNull(),
    avatarUrl: text("avatar_url"),
    /** Lichess only, an asset id like `people.santa-claus` rather than a
     * URL. */
    flair: text("flair"),
    /** ISO 3166-1 alpha-2, uppercase. Neither provider reports it on a
     * game, so a flag can only come from here. */
    countryCode: text("country_code"),
    /** Stamped on every attempt, successful or not, so a dead endpoint is
     * retried at the refresh cadence and not on every game open. */
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
     * The owner, direct rather than inferred through a tracked account: a
     * PGN upload has no account, and every read would otherwise need an
     * inner join that drops it.
     */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: gameSourceEnum("source").notNull(),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    /** Provenance only; null for manually imported PGNs. */
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
    // Raw PGN text; a compact per-move encoding (En Croissant's 1-byte
    // legal-move-rank, Lichess's Huffman coding) only if size ever becomes a
    // measured problem.
    rawPgn: text("raw_pgn").notNull(),
    movetextHash: text("movetext_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // External-id dedup never crosses two accounts, even two tracking the
    // same provider handle: each owns an independent copy of what it imports.
    uniqueIndex("games_account_source_external_id")
      .on(table.accountId, table.source, table.externalId)
      .where(sql`${table.externalId} is not null`),
    // Movetext dedup is user-scoped. `nullsNotDistinct` makes a NULL
    // account_id equal to itself, so one user re-pasting the same moves is a
    // no-op while another user importing that file keeps their own row.
    unique("games_user_account_movetext")
      .on(table.userId, table.accountId, table.movetextHash)
      .nullsNotDistinct(),
    index("games_user_played_at").on(table.userId, table.playedAt.desc()),
    // Doubles as the account_id FK index: a composite also serves lookups on
    // its leftmost column alone.
    index("games_account_played_at").on(table.accountId, table.playedAt.desc()),
  ],
);

export type TrackedAccount = typeof trackedAccounts.$inferSelect;
export type NewTrackedAccount = typeof trackedAccounts.$inferInsert;
export type SyncJob = typeof syncJobs.$inferSelect;
export type ProviderProfile = typeof providerProfiles.$inferSelect;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type AuthAccount = typeof authAccounts.$inferSelect;
