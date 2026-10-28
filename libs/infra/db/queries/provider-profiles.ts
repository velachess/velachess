import type { AccountPlatform } from "@velachess/infra-platforms";
import { normalizeUsername } from "@velachess/infra-platforms";
import { and, eq, or } from "drizzle-orm";

import type { Database } from "../client.ts";
import { providerProfiles } from "../schema.ts";

export interface ProviderSeat {
  platform: AccountPlatform;
  username: string;
}

/**
 * Profiles change rarely, so a week keeps an open cheap while capping how
 * long a changed picture stays stale. Beside the table it governs because
 * two slices read this cache and slices do not import each other.
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
      eq(providerProfiles.username, normalizeUsername(seat.username)),
    ),
  );

  return db
    .select()
    .from(providerProfiles)
    .where(matches.length === 1 ? matches[0]! : or(...matches));
}

/**
 * `fetched` overwrites the identity fields, nulls included, because avatars
 * do get removed; `failed` only ages the refresh window, so what was stored
 * stands until a successful read. `fetchedAt` is stamped on every attempt,
 * so an outage costs one try per window rather than one per game open.
 */
export async function upsertProviderProfile(
  db: Database,
  seat: ProviderSeat,
  fetched:
    | {
        status: "fetched";
        profile: {
          avatarUrl: string | null;
          flair: string | null;
          countryCode: string | null;
        };
      }
    | { status: "failed" },
) {
  const username = normalizeUsername(seat.username);
  const [row] = await db
    .insert(providerProfiles)
    .values({
      platform: seat.platform,
      username,
      ...(fetched.status === "fetched" ? fetched.profile : {}),
    })
    .onConflictDoUpdate({
      target: [providerProfiles.platform, providerProfiles.username],
      set: {
        fetchedAt: new Date(),
        ...(fetched.status === "fetched" ? fetched.profile : {}),
      },
    })
    .returning();
  return row!;
}
