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
 * Write-through for one handle. `fetchedAt` is stamped on EVERY attempt —
 * a provider outage must cost one try per refresh window, not one per
 * game open — while an answer that came back without a field leaves the
 * stored value alone: decoration that failed to load once must not erase
 * an identity that was already read.
 */
export async function upsertProviderProfile(
  db: Database,
  seat: ProviderSeat,
  profile: { avatarUrl: string | null; flair: string | null },
): Promise<void> {
  const username = normalize(seat.username);
  await db
    .insert(providerProfiles)
    .values({ platform: seat.platform, username, ...profile })
    .onConflictDoUpdate({
      target: [providerProfiles.platform, providerProfiles.username],
      set: {
        fetchedAt: new Date(),
        ...(profile.avatarUrl !== null ? { avatarUrl: profile.avatarUrl } : {}),
        ...(profile.flair !== null ? { flair: profile.flair } : {}),
      },
    });
}
