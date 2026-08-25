import { and, eq, or } from "drizzle-orm";

import type { Database } from "../client.ts";
import { providerProfiles } from "../schema.ts";

type Platform = "chess_com" | "lichess";

export interface ProviderSeat {
  platform: Platform;
  username: string;
}

/**
 * Identity for a handle is one row per `(platform, username)` across all
 * users — public metadata about a player, not about anyone's connection.
 * Both behaviors that touch it (connect-time reads, game-review
 * resolution) share this file because both need the same two operations:
 * look a pair of handles up, write one back.
 */

/** Case-insensitive key: providers fold case, so the cache must not fork on it. */
function normalize(username: string): string {
  return username.toLowerCase();
}

/**
 * Profiles change rarely and games every session; a week keeps an open
 * cheap while capping how long a changed picture stays stale. The policy
 * lives beside the table it governs because two behaviors read this
 * cache (connect-time warming, game-review resolution) and slices do not
 * import each other — one definition here beats two that can drift.
 */
const PROFILE_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

export function isProfileFresh(fetchedAt: Date): boolean {
  return Date.now() - fetchedAt.getTime() < PROFILE_REFRESH_MS;
}

export async function findProviderProfiles(db: Database, seats: readonly ProviderSeat[]) {
  if (seats.length === 0) return [];

  const matches = seats.map((seat) =>
    and(
      eq(providerProfiles.platform, seat.platform),
      eq(providerProfiles.username, normalize(seat.username)),
    ),
  );

  return db
    .select()
    .from(providerProfiles)
    .where(matches.length === 1 ? matches[0]! : or(...matches));
}

/**
 * Write-through for one handle, returning the row as it now stands.
 *
 * The two outcomes of a read persist differently: `fetched` is an answer
 * and overwrites the identity fields — nulls included, because avatars do
 * get removed — while `failed` only ages the refresh window and whatever
 * was stored stands until a successful read speaks. `fetchedAt` is
 * stamped on EVERY attempt either way, so an outage costs one try per
 * window, not one per game open.
 */
export async function upsertProviderProfile(
  db: Database,
  seat: ProviderSeat,
  fetched:
    | { status: "fetched"; profile: { avatarUrl: string | null; flair: string | null } }
    | { status: "failed" },
) {
  const username = normalize(seat.username);
  const [row] = await db
    .insert(providerProfiles)
    .values({
      platform: seat.platform,
      username,
      ...(fetched.status === "fetched"
        ? { avatarUrl: fetched.profile.avatarUrl, flair: fetched.profile.flair }
        : {}),
    })
    .onConflictDoUpdate({
      target: [providerProfiles.platform, providerProfiles.username],
      set: {
        fetchedAt: new Date(),
        ...(fetched.status === "fetched"
          ? { avatarUrl: fetched.profile.avatarUrl, flair: fetched.profile.flair }
          : {}),
      },
    })
    .returning();
  return row!;
}
