/**
 * Identity for the handles a sync just brought in. The library lists
 * opponents nobody has opened a game against, and only opening one fills
 * the profile cache — so without this pass their avatar and flag stay
 * empty for as long as the game sits unread.
 */
import type { ProviderProfile, ProviderSeat } from "@velachess/infra-db";
import type { AccountPlatform, ProfileFetch } from "@velachess/infra-platforms";

type FindProviderProfiles = (seats: ProviderSeat[]) => Promise<ProviderProfile[]>;
type UpsertProviderProfile = (seat: ProviderSeat, fetched: ProfileFetch) => Promise<void>;
type IsProfileFresh = (fetchedAt: Date) => boolean;
type FetchProfile = (seat: ProviderSeat) => Promise<ProfileFetch>;

export interface WarmProfilesDeps {
  findProviderProfiles: FindProviderProfiles;
  upsertProviderProfile: UpsertProviderProfile;
  isProfileFresh: IsProfileFresh;
  fetchProfile: FetchProfile;
}

/**
 * A year of games can name hundreds of opponents, and the provider would
 * answer every one of them at once. The rest are picked up by the next
 * sync, or by the first person to open their game.
 */
const HANDLES_PER_PASS = 25;

/**
 * Whatever the cache already holds stands: only a handle it has never seen,
 * or one past its refresh window, costs a request. Sequentially, because a
 * burst is what gets an ingest rate-limited.
 */
export async function warmProfiles(
  deps: WarmProfilesDeps,
  platform: AccountPlatform,
  usernames: readonly string[],
): Promise<void> {
  const seats = new Map<string, ProviderSeat>();
  for (const username of usernames) {
    seats.set(
      username.toLowerCase(),
      seats.get(username.toLowerCase()) ?? {
        platform,
        username,
      },
    );
  }
  if (seats.size === 0) return;

  const cached = await deps.findProviderProfiles([...seats.values()]);
  const fresh = new Set(
    cached
      .filter((profile) => deps.isProfileFresh(profile.fetchedAt))
      .map((profile) => profile.username),
  );

  const cold = [...seats]
    .filter(([key]) => !fresh.has(key))
    .slice(0, HANDLES_PER_PASS)
    .map(([, seat]) => seat);

  for (const seat of cold) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one provider request at a time, by design
    await deps.upsertProviderProfile(seat, await deps.fetchProfile(seat));
  }
}
